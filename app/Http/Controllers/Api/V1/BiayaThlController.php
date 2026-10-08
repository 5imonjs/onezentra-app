<?php

namespace App\Http\Controllers\Api\V1;

use App\Exports\BiayaThlExport;
use App\Http\Controllers\Controller;
use App\Imports\BiayaThlImport;
use App\Models\ApprovalAssignment;
use App\Models\BiayaRetribusi;
use App\Models\BiayaRetribusiDetail;
use App\Models\BiayaThl;
use App\Models\BiayaThlPhoto;
use App\Models\User;
use App\Services\ApprovalSectionResolver;
use App\Services\BiayaApprovalService;
use App\Services\ExportGuard;
use Dompdf\Dompdf;
use Illuminate\Filesystem\FilesystemAdapter;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;
use Maatwebsite\Excel\Facades\Excel;

class BiayaThlController extends Controller
{
    public function index(Request $request)
    {
        $request->validate([
            'status' => 'nullable|string|in:draft,pending,checked,rlh_approved,approved,rejected,revisi',
        ]);

        $user = $request->user();
        $assignedDepots = ApprovalAssignment::query()
            ->where('module', ApprovalAssignment::MODULE_THL)
            ->where('user_id', $user->id)
            ->whereIn('approval_level', ['BAC', 'RLH', 'RFAH'])
            ->where('is_active', true)
            ->pluck('kode_depo');
        $hasGlobalFinalAssignment = ApprovalAssignment::query()
            ->where('module', ApprovalAssignment::MODULE_THL)
            ->where('user_id', $user->id)
            ->whereIn('approval_level', ['RLH', 'RFAH'])
            ->where('kode_depo', 'ADMIN')
            ->where('is_active', true)
            ->exists();

        $query = BiayaThl::query();
        if ($hasGlobalFinalAssignment) {
            // ADMIN assignment is the configured global fallback for final approvers.
        } elseif ($assignedDepots->isNotEmpty()) {
            $query->whereIn('kode_depo', $assignedDepots->reject(fn (string $kodeDepo): bool => $kodeDepo === 'ADMIN')->values());
        } else {
            $query->forUserDepot($user);
        }
        if ($request->filled('search')) {
            $query->where(function ($q) use ($request) {
                $q->where('no_kendaraan', 'like', '%'.$request->search.'%')
                    ->orWhere('nama_depo', 'like', '%'.$request->search.'%')
                    ->orWhere('kode_depo', 'like', '%'.$request->search.'%')
                    ->orWhere('no_surat_jalan', 'like', '%'.$request->search.'%')
                    ->orWhere('type_kendaraan', 'like', '%'.$request->search.'%');
            });
        }
        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }
        // Filter depo untuk dashboard (user global); scoping approval/forUserDepot
        // di atas sudah menjadi batas akses, filter ini hanya mempersempit.
        if ($request->filled('kode_depo')) {
            $query->where('kode_depo', $request->input('kode_depo'));
        }
        $sortField = in_array($request->sort, ['tanggal_pengajuan', 'type_kendaraan', 'nominal_biaya', 'status', 'no_kendaraan', 'created_at']) ? $request->sort : 'created_at';
        $sortDir = $request->dir === 'asc' ? 'asc' : 'desc';
        $query->orderBy($sortField, $sortDir);
        // Ringkasan dihitung dari SELURUH baris terfilter, bukan halaman aktif.
        $summaryQuery = clone $query;
        $data = $query->with('details.photos', 'photos', 'submittedBy', 'checkedBy', 'rlhApprovedBy', 'approvedBy', 'rejectedBy', 'revisedBy', 'resubmittedBy', 'createdBy')
            ->paginate($this->perPage($request, 50));

        $response = $data->toArray();
        $response['summary'] = [
            'total' => (clone $summaryQuery)->count(),
            'total_nominal' => (float) (clone $summaryQuery)->sum('nominal_biaya'),
            'pending' => (clone $summaryQuery)->whereIn('status', ['pending', 'checked', 'rlh_approved'])->count(),
            'checked' => (clone $summaryQuery)->where('status', 'checked')->count(),
            'approved' => (clone $summaryQuery)->where('status', 'approved')->count(),
            'rejected' => (clone $summaryQuery)->where('status', 'rejected')->count(),
            'revisi' => (clone $summaryQuery)->where('status', 'revisi')->count(),
        ];

        return response()->json($response)
            ->header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
            ->header('Pragma', 'no-cache');
    }

    public function store(Request $request)
    {
        $validated = $this->validateThlRequest($request);

        foreach ($validated['details'] ?? [] as &$detail) {
            $detail['kubikasi'] = (float) ($detail['kubikasi'] ?? 0);
            $detail['droppoint'] = (string) ($detail['droppoint'] ?? '0');

            if (strtoupper(trim((string) ($detail['posisi'] ?? ''))) === 'THL GUDANG') {
                $detail['kubikasi'] = 0;
                $detail['droppoint'] = '0';
            }
        }
        unset($detail);
        $validated['details'] = $this->normalizeDetailCasing($validated['details'] ?? []);

        $validated['kubikasi_base'] = collect($validated['details'] ?? [])->sum('kubikasi');
        $validated['nominal_biaya'] = collect($validated['details'] ?? [])->sum('nominal_biaya');
        $validated['is_rfah_required'] = $validated['nominal_biaya'] > config('biaya.thl_rfah_threshold', 750000);
        /** @var User $user */
        $user = $request->user();
        $validated['approval_pengajuan'] = $user->full_name ?: $user->email;
        $validated['approval_pengajuan_level'] = $user->level;
        $validated['created_by'] = $user->id;
        $validated['status'] = 'draft';
        $validated = $user->depotAttributes($validated);
        // Tanpa depo, pengajuan tak bisa masuk antrean approval mana pun
        // (ensureApprover tak cocok, filter laporan tak cocok). Draft boleh
        // belum lengkap; non-draft wajib berdepo.
        if (! $request->boolean('is_draft') && blank($validated['kode_depo'] ?? null)) {
            throw ValidationException::withMessages([
                'kode_depo' => ['Pilih depo pengajuan.'],
            ]);
        }
        if ($validated['is_rfah_required']) {
            $validated['rfah_name'] = ApprovalAssignment::resolveRfahName($validated['kode_depo'] ?? null, ApprovalAssignment::MODULE_THL);
        }

        $firstDetail = $validated['details'][0] ?? [];
        $validated['no_kendaraan'] = $firstDetail['nopol_kendaraan'] ?? null;
        $validated['type_kendaraan'] = $firstDetail['type_kendaraan'] ?? null;
        $validated['no_surat_jalan'] = $firstDetail['no_surat_jalan'] ?? null;

        $biayaThl = DB::transaction(function () use ($validated) {
            $biayaThl = BiayaThl::create($validated);
            $this->storeThlDetails($biayaThl, $validated['details'] ?? []);

            return $biayaThl;
        });

        return response()->json(['message' => 'Biaya THL created', 'data' => $biayaThl->load('details.photos', 'photos')], 201);
    }

    public function show(BiayaThl $biayaThl)
    {
        $this->authorizeViewer($biayaThl);

        $biayaThl->load(
            'details.photos',
            'photos',
            'submittedBy',
            'checkedBy',
            'rlhApprovedBy',
            'approvedBy',
            'rejectedBy',
            'revisedBy',
            'resubmittedBy',
            'createdBy',
            'approvalHistories.actor',
        );

        $names = $this->approvalActorNames($biayaThl);
        $approvalSections = app(ApprovalSectionResolver::class)->resolve(
            $biayaThl->kode_depo ?: '',
            $names['submitter'],
            $names['checker'],
            $names['approver'],
            $names['rfah'],
            ApprovalAssignment::MODULE_THL,
        );

        $data = $biayaThl->toArray();
        $data['approval_sections'] = array_values(array_filter(
            $approvalSections,
            fn (array $section): bool => $section['title'] !== 'RFAH*' || $biayaThl->is_rfah_required,
        ));

        return response()->json(['data' => $data]);
    }

    public function update(Request $request, BiayaThl $biayaThl)
    {
        $this->authorizeCreator($biayaThl);
        /** @var User|null $editor */
        $editor = Auth::user();
        $hasFullControl = $editor && $editor->hasPermission('biaya_thl.full_control');
        if (! in_array($biayaThl->status, ['draft', 'rejected', 'revisi'], true) && ! $hasFullControl) {
            abort(403, 'Hanya pengguna dengan permission Kendali Penuh Biaya THL yang dapat mengubah pengajuan yang sudah dikirim.');
        }
        abort_if($biayaThl->status === 'approved', 422, 'Pengajuan yang sudah Approved Lengkap tidak dapat diedit.');

        // Simpan draft tidak boleh mengembalikan antrean yang berjalan.
        if ($request->boolean('is_draft')) {
            abort_unless(
                in_array($biayaThl->status, ['draft', 'rejected', 'revisi'], true),
                422,
                "Draft hanya dapat disimpan saat status draft/ditolak/revisi (saat ini: {$biayaThl->status})."
            );
        }

        $validated = $this->validateThlRequest($request, true);

        foreach ($validated['details'] ?? [] as &$detail) {
            $detail['kubikasi'] = (float) ($detail['kubikasi'] ?? 0);
            $detail['droppoint'] = (string) ($detail['droppoint'] ?? '0');

            if (strtoupper(trim((string) ($detail['posisi'] ?? ''))) === 'THL GUDANG') {
                $detail['kubikasi'] = 0;
                $detail['droppoint'] = '0';
            }
        }
        unset($detail);
        $validated['details'] = $this->normalizeDetailCasing($validated['details'] ?? []);

        $validated['kubikasi_base'] = collect($validated['details'] ?? [])->sum('kubikasi');
        $validated['nominal_biaya'] = collect($validated['details'] ?? [])->sum('nominal_biaya');
        $validated['is_rfah_required'] = $validated['nominal_biaya'] > config('biaya.thl_rfah_threshold', 750000);
        if ($validated['is_rfah_required']) {
            $validated['rfah_name'] = ApprovalAssignment::resolveRfahName($validated['kode_depo'] ?? $biayaThl->kode_depo, ApprovalAssignment::MODULE_THL);
        } else {
            $validated['rfah_name'] = null;
        }

        $firstDetail = $validated['details'][0] ?? [];
        $validated['no_kendaraan'] = $firstDetail['nopol_kendaraan'] ?? null;
        $validated['type_kendaraan'] = $firstDetail['type_kendaraan'] ?? null;
        $validated['no_surat_jalan'] = $firstDetail['no_surat_jalan'] ?? null;

        DB::transaction(function () use ($validated, $biayaThl): void {
            $header = $validated;
            unset($header['details']);
            $biayaThl->update($header);
            $this->syncThlDetails($biayaThl, $validated['details'] ?? []);
        });

        return response()->json(['message' => 'Biaya THL updated', 'data' => $biayaThl->load('details.photos', 'photos')]);
    }

    /**
     * Normalisasi casing plat/type agar konsisten kapital di database
     * (baris utama + kendaraan tambahan; pola sama dengan Biaya Retribusi).
     *
     * @param  array<int, array<string, mixed>>  $details
     * @return array<int, array<string, mixed>>
     */
    private function normalizeDetailCasing(array $details): array
    {
        return array_map(function ($detail) {
            foreach (['nopol_kendaraan', 'kendaraan_nopol', 'type_kendaraan', 'kendaraan_type'] as $field) {
                if (isset($detail[$field])) {
                    $detail[$field] = strtoupper(trim((string) $detail[$field]));
                }
            }

            return $detail;
        }, $details);
    }

    /**
     * Sinkronisasi detail per baris (bukan hapus-semua-buat-ulang) agar foto
     * yang sudah ada tidak hilang saat edit: baris dikenali via id, foto yang
     * dicentang hapus dibuang dari storage + DB, file baru disimpan.
     */
    private function syncThlDetails(BiayaThl $biayaThl, array $details): void
    {
        $existingIds = $biayaThl->details()->pluck('id')->all();
        $keptIds = [];

        foreach ($details as $index => $detail) {
            $detailId = isset($detail['id']) ? (int) $detail['id'] : null;
            $row = null;
            if ($detailId && in_array($detailId, $existingIds, true)) {
                $row = $biayaThl->details()->whereKey($detailId)->first();
                $payload = $detail;
                unset($payload['id'], $payload['photos'], $payload['photos_remove']);
                $payload['order'] = $index;
                $row->update($payload);
                $keptIds[] = $detailId;
            } else {
                $payload = $detail;
                unset($payload['id'], $payload['photos'], $payload['photos_remove']);
                $payload['order'] = $index;
                $payload['nominal_biaya'] = $detail['nominal_biaya'];
                $row = $biayaThl->details()->create($payload);
                $keptIds[] = $row->id;
            }

            foreach ($detail['photos_remove'] ?? [] as $photoId) {
                $photo = $row->photos()->whereKey((int) $photoId)->first();
                if ($photo) {
                    Storage::disk('public')->delete($photo->file_path);
                    $photo->delete();
                }
            }

            foreach ($detail['photos'] ?? [] as $photoIndex => $photo) {
                $path = $photo->store("biaya_thl/{$biayaThl->id}/detail_{$row->id}", 'public');
                $row->photos()->create([
                    'biaya_thl_id' => $biayaThl->id,
                    'file_path' => $path,
                    'file_name' => $photo->getClientOriginalName(),
                    'mime_type' => $photo->getMimeType(),
                    'file_size' => $photo->getSize(),
                    'order' => $photoIndex,
                ]);
            }
        }

        // Baris yang tidak dikirim lagi = dihapus pengguna: bersihkan file-nya
        // agar tidak yatim di storage (cascade DB tidak menghapus file).
        $stale = $biayaThl->details()->whereNotIn('id', $keptIds)->with('photos')->get();
        foreach ($stale as $row) {
            foreach ($row->photos as $photo) {
                Storage::disk('public')->delete($photo->file_path);
            }
            $row->delete();
        }
    }

    public function destroy(BiayaThl $biayaThl)
    {
        $this->authorizeCreator($biayaThl);
        /** @var User|null $destroyer */
        $destroyer = Auth::user();
        $destroyerHasFullControl = $destroyer && $destroyer->hasPermission('biaya_thl.full_control');
        if (! $destroyerHasFullControl) {
            abort_unless(
                in_array($biayaThl->status, ['draft', 'rejected', 'revisi'], true),
                422,
                "Pengajuan yang sudah dikirim (status {$biayaThl->status}) tidak dapat dihapus."
            );
        }
        foreach ($biayaThl->photos as $photo) {
            Storage::disk('public')->delete($photo->file_path);
            $photo->delete();
        }
        $biayaThl->details()->delete();
        $biayaThl->delete();

        return response()->json(['message' => 'Biaya THL deleted']);
    }

    public function submit(Request $request, BiayaThl $biayaThl, BiayaApprovalService $approvalService)
    {
        return response()->json(['message' => 'Pengajuan THL dikirim untuk diperiksa.', 'data' => $approvalService->submit($biayaThl, $request->user())]);
    }

    public function check(Request $request, BiayaThl $biayaThl, BiayaApprovalService $approvalService)
    {
        return response()->json(['message' => 'Pengajuan THL telah diperiksa.', 'data' => $approvalService->check($biayaThl, $request->user())]);
    }

    public function approve(Request $request, BiayaThl $biayaThl, BiayaApprovalService $approvalService)
    {
        return response()->json(['message' => 'Pengajuan THL telah disetujui.', 'data' => $approvalService->approve($biayaThl, $request->user())]);
    }

    public function rfahApprove(Request $request, BiayaThl $biayaThl, BiayaApprovalService $approvalService)
    {
        return response()->json(['message' => 'Pengajuan THL telah disetujui RFAH.', 'data' => $approvalService->rfahApprove($biayaThl, $request->user())]);
    }

    public function reject(Request $request, BiayaThl $biayaThl, BiayaApprovalService $approvalService)
    {
        $reason = $request->validate(['reason' => ['required', 'string', 'max:1000']])['reason'];

        return response()->json(['message' => 'Pengajuan THL ditolak.', 'data' => $approvalService->reject($biayaThl, $request->user(), $reason)]);
    }

    public function revise(Request $request, BiayaThl $biayaThl, BiayaApprovalService $approvalService)
    {
        $reason = $request->validate(['reason' => ['required', 'string', 'max:1000']])['reason'];

        return response()->json(['message' => 'Pengajuan THL dikirim kembali untuk direvisi.', 'data' => $approvalService->revise($biayaThl, $request->user(), $reason)]);
    }

    /**
     * Sajikan foto bukti lewat API (ber-CORS + berizin) karena file
     * statis public/storage tidak mengirim header CORS ke frontend.
     */
    public function photo(Request $request, BiayaThlPhoto $photo)
    {
        $biayaThl = $photo->biayaThl;
        abort_if(! $biayaThl, 404);
        // Samakan dengan show()/pdf(): bukan sekadar satu depo, hanya creator/
        // approver yang berhak melihat lampiran bukti.
        $this->authorizeViewer($biayaThl);
        /** @var FilesystemAdapter $disk */
        $disk = Storage::disk('public');
        abort_unless($photo->file_path && $disk->exists($photo->file_path), 404);
        $safeName = str_replace(['"', "\n", "\r"], '', $photo->file_name ?: basename($photo->file_path));

        return $disk->response(
            $photo->file_path,
            $safeName,
            ['Content-Type' => $photo->mime_type ?: 'application/octet-stream']
        );
    }

    public function pdf(BiayaThl $biayaThl)
    {
        $this->authorizePdfPrinter($biayaThl);

        $biayaThl->load('details.photos', 'photos', 'submittedBy', 'checkedBy', 'rlhApprovedBy', 'approvedBy', 'rejectedBy', 'revisedBy');

        $names = $this->approvalActorNames($biayaThl);
        $approvalSections = app(ApprovalSectionResolver::class)->resolve(
            $biayaThl->kode_depo ?: '',
            $names['submitter'],
            $names['checker'],
            $names['approver'],
            $names['rfah'],
            ApprovalAssignment::MODULE_THL,
        );
        $approvalSections = array_values(array_filter(
            $approvalSections,
            fn (array $section): bool => $section['title'] !== 'RFAH*' || $biayaThl->is_rfah_required,
        ));
        $retribusi = new BiayaRetribusi([
            'tanggal_pengajuan' => $biayaThl->tanggal_pengajuan,
            'kode_depo' => $biayaThl->kode_depo,
            'nama_depo' => $biayaThl->nama_depo,
            'nominal_biaya' => $biayaThl->nominal_biaya,
            'is_rfah_required' => $biayaThl->is_rfah_required,
            'rfah_name' => $biayaThl->rfah_name,
            'approval_pengajuan' => $biayaThl->submittedBy?->full_name ?: $biayaThl->approval_pengajuan,
            'approval_pengajuan_level' => strtoupper((string) ($biayaThl->approval_pengajuan_level ?: 'BLC')),
            'status' => $biayaThl->status,
            'rejection_reason' => $biayaThl->rejection_reason,
            'revisi_reason' => $biayaThl->revisi_reason,
        ]);
        $retribusiDetails = $biayaThl->details->map(function ($thlDetail, int $index): BiayaRetribusiDetail {
            $retribusiDetail = new BiayaRetribusiDetail([
                'nopol_kendaraan' => $thlDetail->nopol_kendaraan,
                'type_kendaraan' => $thlDetail->type_kendaraan,
                'no_surat_jalan' => $thlDetail->no_surat_jalan,
                'nominal_biaya' => $thlDetail->nominal_biaya,
                'order' => $index,
            ]);
            $retribusiDetail->setRelation('biayaThlDetail', $thlDetail);

            return $retribusiDetail;
        });
        $retribusi->setRelation('details', $retribusiDetails);
        $retribusi->setRelation('documents', collect());

        $html = view('pdf.biaya_retribusi_combined', [
            'biayaRetribusi' => $retribusi,
            'approvalSections' => $approvalSections,
            'stamps' => $this->resolveStamps($biayaThl),
            'logoData' => $this->pdfLogoData(),
        ])->render();

        $dompdf = new Dompdf;
        $dompdf->loadHtml($html);
        $dompdf->setPaper('A4', 'landscape');
        $dompdf->render();

        return response($dompdf->output(), 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'inline; filename="biaya_thl_'.$biayaThl->id.'.pdf"',
        ]);
    }

    private function pdfLogoData(): ?string
    {
        $logoPath = public_path('biaya THL.jpeg');

        if (! is_file($logoPath)) {
            return null;
        }

        return base64_encode((string) file_get_contents($logoPath));
    }

    /**
     * Cap audit per kotak approval untuk PDF. Publik agar perilaku penempatan
     * cap (ikuti peran pelaku) dapat diuji langsung.
     */
    public function resolveStamps(BiayaThl $biayaThl): array
    {
        $stamps = [];

        if ($biayaThl->status !== 'draft' && $biayaThl->submitted_at) {
            $stamps['Mengajukan'] = [
                'text' => 'PENGAJUAN',
                'color' => '#15803d',
                'date' => $biayaThl->submitted_at?->format('d M Y'),
            ];
        }

        if ($biayaThl->checked_at) {
            $stamps['Mengetahui'] = [
                'text' => 'DIPERIKSA',
                'color' => '#15803d',
                'date' => $biayaThl->checked_at->format('d M Y'),
            ];
        }

        if ($biayaThl->status === 'rlh_approved' && $biayaThl->rlh_approved_at) {
            $stamps['Menyetujui'] = [
                'text' => 'DISETUJUI RLH',
                'color' => '#15803d',
                'date' => $biayaThl->rlh_approved_at->format('d M Y'),
            ];
        } elseif ($biayaThl->status === 'approved' && $biayaThl->approved_at && $biayaThl->approvedBy) {
            $stamps['Menyetujui'] = [
                'text' => 'DISETUJUI',
                'color' => '#15803d',
                'date' => $biayaThl->approved_at?->format('d M Y'),
            ];
            if ($biayaThl->is_rfah_required && $biayaThl->rlh_approved_at && $biayaThl->rlhApprovedBy) {
                $stamps['Menyetujui'] = [
                    'text' => 'DISETUJUI',
                    'color' => '#15803d',
                    'date' => $biayaThl->rlh_approved_at->format('d M Y'),
                ];
                $stamps['RFAH*'] = [
                    'text' => 'DISETUJUI RFAH',
                    'color' => '#15803d',
                    'date' => $biayaThl->approved_at->format('d M Y'),
                ];
            }
        } elseif ($biayaThl->status === 'rejected' && $biayaThl->rejected_at && $biayaThl->rejectedBy) {
            $actorSection = $this->stampSectionFor((string) $biayaThl->rejectedBy?->level);
            $stamps[$actorSection] = [
                'text' => 'DITOLAK',
                'color' => '#dc2626',
                'date' => $biayaThl->rejected_at?->format('d M Y'),
            ];
            // Persetujuan RLH pada siklus sebelumnya tetap tercatat di kotaknya
            // bila aksi terminal (ditolak) dilakukan pelaku lain (BAC/RFAH).
            if ($actorSection !== 'Menyetujui' && $biayaThl->rlh_approved_at && $biayaThl->rlhApprovedBy) {
                $stamps['Menyetujui'] = [
                    'text' => 'DISETUJUI RLH',
                    'color' => '#15803d',
                    'date' => $biayaThl->rlh_approved_at->format('d M Y'),
                ];
            }
        } elseif ($biayaThl->status === 'revisi' && $biayaThl->revised_at && $biayaThl->revisedBy) {
            $actorSection = $this->stampSectionFor((string) $biayaThl->revisedBy?->level);
            $stamps[$actorSection] = [
                'text' => 'REVISI',
                'color' => '#d97706',
                'date' => $biayaThl->revised_at?->format('d M Y'),
            ];
            if ($actorSection !== 'Menyetujui' && $biayaThl->rlh_approved_at && $biayaThl->rlhApprovedBy) {
                $stamps['Menyetujui'] = [
                    'text' => 'DISETUJUI RLH',
                    'color' => '#15803d',
                    'date' => $biayaThl->rlh_approved_at->format('d M Y'),
                ];
            }
        }

        return $stamps;
    }

    /**
     * Kotak kolom approval tempat cap REVISI/DITOLAK diletakkan mengikuti
     * peran pelaku aksi: BAC -> Mengetahui, RFAH -> RFAH*, selainnya
     * (RLH / data lama tanpa level) -> Menyetujui. Sejajar dengan
     * stampSectionFor() pada generator PDF frontend.
     */
    public function stampSectionFor(string $level): string
    {
        return match (strtoupper($level)) {
            'BAC' => 'Mengetahui',
            'RFAH' => 'RFAH*',
            default => 'Menyetujui',
        };
    }

    /**
     * Nama pelaku per kotak approval, diurutkan sesuai ApprovalSectionResolver:
     * submitter (BLC), checker (BAC), approver (RLH), rfah (RFAH*). Nama
     * mengikuti peran pelaku aksi — revisi/ditolak oleh RFAH atau BAC tidak
     * boleh tertukar ke kotak RLH. Publik agar dapat diuji langsung.
     *
     * @return array{submitter: ?string, checker: ?string, approver: ?string, rfah: ?string}
     */
    public function approvalActorNames(BiayaThl $biayaThl): array
    {
        $submitter = $biayaThl->submittedBy?->full_name ?: $biayaThl->approval_pengajuan;
        $checker = $biayaThl->checkedBy?->full_name;
        $approver = null;
        $rfah = null;

        if ($biayaThl->status === 'rlh_approved') {
            $approver = $biayaThl->rlhApprovedBy?->full_name;
        } elseif ($biayaThl->status === 'approved') {
            if ($biayaThl->is_rfah_required) {
                $approver = $biayaThl->rlhApprovedBy?->full_name;
                $rfah = $biayaThl->approvedBy?->full_name;
            } else {
                $approver = $biayaThl->approvedBy?->full_name;
            }
        } elseif (in_array($biayaThl->status, ['rejected', 'revisi'], true)) {
            $actor = $biayaThl->status === 'rejected' ? $biayaThl->rejectedBy : $biayaThl->revisedBy;
            match (strtoupper((string) ($actor?->level ?? ''))) {
                'BAC' => $checker = $actor?->full_name,
                'RFAH' => $rfah = $actor?->full_name,
                default => $approver = $actor?->full_name,
            };
        }

        return ['submitter' => $submitter, 'checker' => $checker, 'approver' => $approver, 'rfah' => $rfah];
    }

    private function validateThlRequest(Request $request, bool $isUpdate = false): array
    {
        // Mode draft (is_draft=true): simpan apa adanya tanpa syarat lengkap.
        // Kelengkapan diverifikasi saat submit (BiayaApprovalService::submit).
        if ($request->boolean('is_draft')) {
            return Validator::make($request->all(), [
                'tanggal_pengajuan' => 'nullable|date',
                'details' => 'nullable|array|max:20',
                'details.*.id' => 'nullable|integer|exists:biaya_thl_details,id',
                'details.*.no_surat_jalan' => 'nullable|string|max:50',
                'details.*.nama_thl' => 'nullable|string|max:150',
                'details.*.driver_name' => 'nullable|string|max:150',
                'details.*.nopol_kendaraan' => 'nullable|string|max:20',
                'details.*.type_kendaraan' => 'nullable|string|max:50',
                'details.*.nominal_biaya' => 'nullable|numeric|min:0',
                'details.*.kubikasi' => 'nullable|numeric|min:0',
                'details.*.droppoint' => 'nullable|string|max:100',
                'details.*.posisi' => 'nullable|string|max:50',
                'details.*.jam_datang' => 'nullable|date',
                'details.*.jam_pulang' => 'nullable|date',
                'details.*.kendaraan_tambahan' => 'nullable|boolean',
                'details.*.kendaraan_sj' => 'nullable|string|max:50',
                'details.*.kendaraan_nopol' => 'nullable|string|max:20',
                'details.*.kendaraan_type' => 'nullable|string|max:50',
                'details.*.order' => 'nullable|integer',
                'details.*.photos' => 'nullable|array|max:1',
                'details.*.photos.*' => 'image|mimes:jpg,jpeg,png|max:2048',
                'details.*.photos_remove' => 'nullable|array',
                'details.*.photos_remove.*' => 'integer',
            ])->validate();
        }

        $rules = [
            'tanggal_pengajuan' => 'required|date',
            'kubikasi_base' => 'nullable|numeric|min:0',
            'details' => 'required|array|min:1|max:20',
            'details.*.id' => 'nullable|integer|exists:biaya_thl_details,id',
            'details.*.no_surat_jalan' => 'nullable|string|max:50',
            'details.*.nama_thl' => 'required|string|max:150',
            'details.*.driver_name' => 'nullable|string|max:150',
            // Dokumentasi: plat + type per baris untuk SEMUA posisi,
            // termasuk THL GUDANG.
            'details.*.nopol_kendaraan' => 'required|string|max:20',
            'details.*.type_kendaraan' => 'required|string|max:50',
            'details.*.nominal_biaya' => 'required|numeric|min:1',
            'details.*.kubikasi' => 'nullable|numeric|min:0',
            'details.*.droppoint' => 'nullable|string|max:100',
            'details.*.posisi' => 'required|string|in:THL HELPER,THL DRIVER,THL GUDANG',
            'details.*.jam_datang' => 'nullable|date',
            'details.*.jam_pulang' => 'nullable|date',
            'details.*.kendaraan_tambahan' => 'nullable|boolean',
            'details.*.kendaraan_sj' => 'nullable|string|max:50',
            'details.*.kendaraan_nopol' => 'nullable|string|max:20',
            'details.*.kendaraan_type' => 'nullable|string|max:50',
            'details.*.order' => 'nullable|integer',
            'details.*.photos' => 'nullable|array|max:1',
            'details.*.photos.*' => 'image|mimes:jpg,jpeg,png|max:2048',
        ];

        if ($isUpdate) {
            $rules['details.*.photos_remove'] = 'nullable|array';
            $rules['details.*.photos_remove.*'] = 'integer';
        }

        $validator = Validator::make($request->all(), $rules);
        $validator->after(function ($validator) use ($request): void {
            foreach ($request->input('details', []) as $index => $detail) {
                $position = strtoupper(trim((string) ($detail['posisi'] ?? '')));
                if (in_array($position, ['THL HELPER', 'THL DRIVER'], true)) {
                    foreach (['no_surat_jalan', 'driver_name', 'kubikasi', 'droppoint', 'jam_datang', 'jam_pulang'] as $field) {
                        if (blank($detail[$field] ?? null)) {
                            $validator->errors()->add(
                                "details.{$index}.{$field}",
                                "{$field} wajib diisi untuk posisi {$position}."
                            );
                        }
                    }
                }

                if (! empty($detail['jam_datang'] ?? null) && ! empty($detail['jam_pulang'] ?? null)
                    && $detail['jam_pulang'] <= $detail['jam_datang']) {
                    $validator->errors()->add(
                        "details.{$index}.jam_pulang",
                        'Jam Pulang harus setelah Jam Datang.'
                    );
                }

                if ($position === 'THL GUDANG') {
                    foreach (['jam_datang', 'jam_pulang'] as $field) {
                        if (blank($detail[$field] ?? null)) {
                            $validator->errors()->add(
                                "details.{$index}.{$field}",
                                "{$field} wajib diisi untuk posisi {$position}."
                            );
                        }
                    }
                }

                if ($position === 'THL GUDANG' && filter_var($detail['kendaraan_tambahan'] ?? false, FILTER_VALIDATE_BOOLEAN)) {
                    // Dokumentasi §2.1 langkah 5 + checklist form: kendaraan
                    // tambahan wajib memiliki SJ, plat, dan type.
                    foreach (['kendaraan_sj', 'kendaraan_nopol', 'kendaraan_type'] as $field) {
                        if (blank($detail[$field] ?? null)) {
                            $validator->errors()->add(
                                "details.{$index}.{$field}",
                                "{$field} wajib diisi untuk kendaraan tambahan."
                            );
                        }
                    }
                }
            }
        });

        return $validator->validate();
    }

    private function storeThlDetails(BiayaThl $biayaThl, array $details): void
    {
        foreach ($details as $index => $detail) {
            $detailPhotos = $detail['photos'] ?? [];
            unset($detail['photos'], $detail['photos_remove']);
            $savedDetail = $biayaThl->details()->create(array_merge($detail, [
                'order' => $index,
                'nominal_biaya' => $detail['nominal_biaya'],
            ]));

            foreach ($detailPhotos as $photoIndex => $photo) {
                $path = $photo->store("biaya_thl/{$biayaThl->id}/detail_{$savedDetail->id}", 'public');
                $savedDetail->photos()->create([
                    'biaya_thl_id' => $biayaThl->id,
                    'file_path' => $path,
                    'file_name' => $photo->getClientOriginalName(),
                    'mime_type' => $photo->getMimeType(),
                    'file_size' => $photo->getSize(),
                    'order' => $photoIndex,
                ]);
            }
        }
    }

    public function export(Request $request)
    {
        $query = BiayaThl::query()->forUserDepot($request->user());
        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }
        $sortField = in_array($request->sort, ['tanggal_pengajuan', 'type_kendaraan', 'nominal_biaya', 'status', 'no_kendaraan', 'created_at']) ? $request->sort : 'created_at';
        $sortDir = $request->dir === 'asc' ? 'asc' : 'desc';
        $query->orderBy($sortField, $sortDir);
        $query->with('details.photos');
        ExportGuard::ensureWithinLimit($query);

        return Excel::download(new BiayaThlExport($query, $request->user()), 'biaya_thl.xlsx');
    }

    private function authorizeCreator(BiayaThl $biayaThl): void
    {
        /** @var User|null $user */
        $user = Auth::user();
        if ($user && ($user->level === 'admin_master' || $user->hasRole('blc') || $user->hasRole('staff_logistic'))) {
            return;
        }
        abort_unless(
            $biayaThl->created_by === $user?->id,
            403,
            'Anda tidak memiliki izin untuk mengubah data ini.'
        );
    }

    private function authorizePdfPrinter(BiayaThl $biayaThl): void
    {
        /** @var User|null $user */
        $user = Auth::user();
        if ($user && ($user->isAdminMaster() || $user->hasRole('blc') || $biayaThl->created_by === $user->id)) {
            return;
        }
        $this->authorizeViewer($biayaThl);
    }

    private function authorizeViewer(BiayaThl $biayaThl): void
    {
        /** @var User|null $user */
        $user = Auth::user();
        if (! $user) {
            abort(403);
        }

        if ($user->isAdminMaster() || $user->hasRole('blc') || $user->hasRole('staff_logistic') || $biayaThl->created_by === $user->id) {
            return;
        }

        $assigned = ApprovalAssignment::query()
            ->where('module', ApprovalAssignment::MODULE_THL)
            ->where('user_id', $user->id)
            ->whereIn('approval_level', ['BAC', 'RLH', 'RFAH'])
            ->where('is_active', true)
            ->where(function ($query) use ($biayaThl): void {
                $query->where('kode_depo', $biayaThl->kode_depo)
                    ->orWhere('kode_depo', 'ADMIN');
            })
            ->exists();

        abort_unless($assigned, 403, 'Anda bukan approver yang ditetapkan untuk pengajuan ini.');
    }

    public function import(Request $request)
    {
        $request->validate(['file' => 'required|file|mimes:xlsx,xls,csv|max:10240']);
        try {
            $import = new BiayaThlImport;
            DB::transaction(fn () => Excel::import($import, $request->file('file')));

            return response()->json([
                'message' => 'Import berhasil',
                'data' => ['imported' => $import->imported, 'updated' => $import->updated, 'errors' => $import->errors],
            ]);
        } catch (\Exception $e) {
            Log::error('Biaya THL Import Error', ['error' => $e->getMessage()]);

            return response()->json(['message' => 'Import gagal. Silakan periksa file dan coba lagi.'], 500);
        }
    }
}
