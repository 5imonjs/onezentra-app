<?php

namespace App\Http\Controllers\Api\V1;

use App\Exports\BiayaThlExport;
use App\Http\Controllers\Api\V1\Concerns\AuthorizesBiayaRows;
use App\Http\Controllers\Controller;
use App\Http\Resources\BiayaThlResource;
use App\Imports\BiayaThlImport;
use App\Models\ApprovalAssignment;
use App\Models\BiayaRetribusi;
use App\Models\BiayaRetribusiDetail;
use App\Models\BiayaThl;
use App\Models\BiayaThlPhoto;
use App\Models\Receiving;
use App\Models\User;
use App\Services\Biaya\BiayaApprovalPresenter;
use App\Services\Biaya\BiayaDetailNormalizer;
use App\Services\Biaya\BiayaPdfRenderer;
use App\Services\Biaya\BiayaQueueSummary;
use App\Services\Biaya\BiayaThlDetailWriter;
use App\Services\Biaya\BiayaThlValidator;
use App\Services\BiayaApprovalService;
use App\Services\ExportGuard;
use App\Support\EvidenceStorage;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Filesystem\FilesystemAdapter;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;
use Maatwebsite\Excel\Facades\Excel;

class BiayaThlController extends Controller
{
    use AuthorizesBiayaRows;

    public function __construct(
        private readonly BiayaApprovalPresenter $approvalPresenter,
        private readonly BiayaPdfRenderer $pdfRenderer,
        private readonly BiayaDetailNormalizer $normalizer,
        private readonly BiayaThlDetailWriter $detailWriter,
        private readonly BiayaThlValidator $validator,
    ) {}

    /**
     * Scope dasar yang sama untuk index + export: approver melihat antrean
     * depo assignment-nya (fallback global ADMIN), selainnya depo sendiri.
     */
    private function scopedExportQuery(User $user): Builder
    {
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

        return $query;
    }

    public function index(Request $request)
    {
        $request->validate([
            'status' => 'nullable|string|in:draft,pending,checked,rlh_approved,approved,rejected,revisi',
        ]);

        $user = $request->user();
        $query = $this->scopedExportQuery($user);
        if ($request->filled('search')) {
            $pattern = $this->likeContains((string) $request->input('search'));
            $query->where(function ($q) use ($pattern) {
                $q->whereRaw('no_kendaraan LIKE ? ESCAPE ?', [$pattern, '\\']);
                foreach (['nama_depo', 'kode_depo', 'no_surat_jalan', 'type_kendaraan'] as $column) {
                    $q->orWhereRaw("{$column} LIKE ? ESCAPE ?", [$pattern, '\\']);
                }
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
        $data = $query->with('details.photos', 'details.vehicles', 'photos', 'submittedBy', 'checkedBy', 'rlhApprovedBy', 'approvedBy', 'rejectedBy', 'revisedBy', 'resubmittedBy', 'createdBy')
            ->paginate($this->perPage($request, 50));

        $response = $data->toArray();
        $response['data'] = BiayaThlResource::collection($data->items())->resolve($request);
        $response['summary'] = [
            'total' => (clone $summaryQuery)->count(),
            'total_nominal' => (float) (clone $summaryQuery)->sum('nominal_biaya'),
            'pending' => (clone $summaryQuery)->whereIn('status', ['pending', 'checked', 'rlh_approved'])->count(),
            'checked' => (clone $summaryQuery)->where('status', 'checked')->count(),
            'approved' => (clone $summaryQuery)->where('status', 'approved')->count(),
            'rejected' => (clone $summaryQuery)->where('status', 'rejected')->count(),
            'revisi' => (clone $summaryQuery)->where('status', 'revisi')->count(),
            'queue' => BiayaQueueSummary::build($summaryQuery),
        ];

        return response()->json($response)
            ->header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
            ->header('Pragma', 'no-cache');
    }

    /**
     * Kandidat pembongkaran diambil dari penerimaan (receiving) yang COMPLETED
     * dan divalidasi checker, agar pengajuan Biaya THL dapat otomatis mewarisi
     * nopol kendaraan, tipe kendaraan, surat jalan, dan driver tanpa input ulang.
     */
    public function candidates(Request $request)
    {
        $allowedTypes = ['CDD', 'Fuso', 'Container 20', 'Container 40'];

        $query = Receiving::query()
            ->with(['rencanaKirim.sjValidations', 'checker'])
            ->where('status', 'COMPLETED')
            ->whereNotNull('checked_by')
            ->whereHas('rencanaKirim', function ($q) use ($request) {
                $q->forUserDepot($request->user());
            });

        if ($request->filled('type_kendaraan')) {
            $query->whereHas('rencanaKirim', fn ($q) => $q->where('jenis_kendaraan', $request->type_kendaraan));
        } else {
            $query->whereHas('rencanaKirim', fn ($q) => $q->whereIn('jenis_kendaraan', $allowedTypes));
        }
        if ($request->filled('nopol_kendaraan')) {
            $like = $this->likeContains((string) $request->nopol_kendaraan);
            $query->whereHas('rencanaKirim', fn ($q) => $q->whereRaw('nopol LIKE ? ESCAPE ?', [$like, '\\']));
        }
        if ($request->filled('kode_depo')) {
            $query->whereHas('rencanaKirim', function ($q) use ($request) {
                $q->where('kode_depo', $request->kode_depo);
            });
        }

        $data = $query->with('items')
            ->orderByDesc('actual_end_time')
            ->orderByDesc('id')
            ->limit(80)
            ->get()
            ->map(function (Receiving $receiving) {
                $qtyZak = (float) $receiving->items
                    ->filter(fn ($item) => str_contains(strtoupper((string) $item->satuan), 'ZAK'))
                    ->sum('actual_qty');
                $qtyCrt = (float) $receiving->items
                    ->filter(fn ($item) => str_contains(strtoupper((string) $item->satuan), 'CRT'))
                    ->sum('actual_qty');

                $retribusiDetail = BiayaRetribusiDetail::query()
                    ->where('receiving_id', $receiving->id)
                    ->with('biayaRetribusi')
                    ->first();

                return [
                    'id' => $receiving->id,
                    'receiving_id' => $receiving->id,
                    'tanggal_selesai' => ($receiving->actual_end_time ?: $receiving->updated_at)?->toDateString(),
                    'nopol_kendaraan' => $receiving->rencanaKirim?->nopol ?? '-',
                    'type_kendaraan' => $receiving->rencanaKirim?->jenis_kendaraan ?? '-',
                    'po_transporter' => $receiving->rencanaKirim?->po_transporter ?? '-',
                    'driver_name' => $receiving->rencanaKirim?->driver_name ?? '-',
                    'checker_name' => $receiving->checker?->full_name ?? '-',
                    'kode_depo' => $receiving->rencanaKirim?->kode_depo ?? '-',
                    'nama_depo' => $receiving->rencanaKirim?->nama_depo ?? '-',
                    'no_surat_jalan' => $receiving->rencanaKirim?->sjValidations
                        ->where('status', 'COMPLETED')->sortByDesc('completed_at')->first()?->scan_code
                        ?? $receiving->rencanaKirim?->sjValidations->first()?->scan_code ?? '',
                    'qty_zak' => $qtyZak,
                    'qty_crt' => $qtyCrt,
                    'has_retribusi' => $retribusiDetail !== null,
                    'retribusi_id' => $retribusiDetail?->biaya_retribusi_id,
                    'retribusi_status' => $retribusiDetail?->biayaRetribusi?->status,
                ];
            });

        return response()->json($data);
    }

    public function store(Request $request)
    {
        $validated = $this->validator->validate($request);

        // Ambil data dari BiayaRetribusiDetail jika biaya_retribusi_detail_id disediakan
        $retribusiDetail = null;
        if ($validated['biaya_retribusi_detail_id'] ?? null) {
            $retribusiDetail = BiayaRetribusiDetail::find($validated['biaya_retribusi_detail_id']);
        }

        foreach ($validated['details'] ?? [] as &$detail) {
            $detail['kubikasi'] = (float) ($detail['kubikasi'] ?? 0);
            $detail['droppoint'] = (string) ($detail['droppoint'] ?? '0');

            // Override dengan field dari BiayaRetribusiDetail jika tersedia
            if ($retribusiDetail) {
                $detail['nopol_kendaraan'] = $retribusiDetail->nopol_kendaraan;
                $detail['type_kendaraan'] = $retribusiDetail->type_kendaraan;
                $detail['no_surat_jalan'] = $retribusiDetail->no_surat_jalan;
                $detail['kubikasi'] = $retribusiDetail->kubikasi;
                $detail['droppoint'] = $retribusiDetail->droppoint;
                $detail['posisi'] = $retribusiDetail->posisi;
                $detail['jam_datang'] = $retribusiDetail->jam_datang;
                $detail['jam_pulang'] = $retribusiDetail->jam_pulang;
                $detail['kendaraan_tambahan'] = $retribusiDetail->kendaraan_tambahan;
            }

            if (strtoupper(trim((string) ($detail['posisi'] ?? ''))) === 'THL GUDANG') {
                $detail['kubikasi'] = 0;
                $detail['droppoint'] = '0';
            }
        }
        unset($detail);
        $validated['details'] = $this->normalizer->forThl($validated['details'] ?? []);

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
            $biayaThl = BiayaThl::create(collect($validated)->except(['details'])->toArray());
            $this->detailWriter->store($biayaThl, $validated['details'] ?? []);

            return $biayaThl;
        });

        return response()->json(['message' => 'Biaya THL created', 'data' => new BiayaThlResource($biayaThl->load('details.photos', 'details.vehicles', 'photos'))], 201);
    }

    public function show(BiayaThl $biayaThl)
    {
        $this->authorizeViewer($biayaThl);

        $biayaThl->load(
            'details.photos',
            'details.vehicles',
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

        return response()->json(['data' => (new BiayaThlResource($biayaThl))->withApprovalSections()]);
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

        $validated = $this->validator->validate($request, true, $biayaThl->id);

        foreach ($validated['details'] ?? [] as &$detail) {
            $detail['kubikasi'] = (float) ($detail['kubikasi'] ?? 0);
            $detail['droppoint'] = (string) ($detail['droppoint'] ?? '0');

            if (strtoupper(trim((string) ($detail['posisi'] ?? ''))) === 'THL GUDANG') {
                $detail['kubikasi'] = 0;
                $detail['droppoint'] = '0';
            }
        }
        unset($detail);
        $validated['details'] = $this->normalizer->forThl($validated['details'] ?? []);

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
            $this->detailWriter->sync($biayaThl, $validated['details'] ?? []);
        });

        return response()->json(['message' => 'Biaya THL updated', 'data' => new BiayaThlResource($biayaThl->load('details.photos', 'details.vehicles', 'photos'))]);
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

        // Hapus baris DB dalam satu transaksi agar tidak menyisakan pengajuan
        // tanpa detail bila salah satu delete gagal. File storage baru dihapus
        // setelah commit supaya kegagalan rollback tidak menghapus file yang
        // datanya masih ada.
        /** @var array<int, string> $filePaths */
        $filePaths = DB::transaction(function () use ($biayaThl): array {
            $paths = [];
            foreach ($biayaThl->photos as $photo) {
                if ($photo->file_path) {
                    $paths[] = $photo->file_path;
                }
                $photo->delete();
            }
            $biayaThl->details()->delete();
            $biayaThl->delete();

            return $paths;
        });

        foreach ($filePaths as $path) {
            if ($this->isManagedPhotoPath($path, $biayaThl->id)) {
                EvidenceStorage::delete($path);
            }
        }

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
     * MIME foto yang boleh disajikan inline. Di luar daftar ini respons
     * dipaksa download agar konten tak tebak (mis. text/html atau SVG
     * berisi script) tidak dieksekusi browser (XSS via upload).
     */
    private const INLINE_PHOTO_ALLOWLIST = [
        'image/jpeg',
        'image/png',
    ];

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
        abort_unless($this->isManagedPhotoPath((string) $photo->file_path, $biayaThl->id), 404);
        /** @var FilesystemAdapter $disk */
        $disk = EvidenceStorage::diskFor($photo->file_path);
        abort_unless($disk, 404);
        $safeName = str_replace(['"', "\n", "\r"], '', $photo->file_name ?: basename($photo->file_path));

        if (! in_array($photo->mime_type, self::INLINE_PHOTO_ALLOWLIST, true)) {
            return $disk->download($photo->file_path, $safeName, [
                'Content-Type' => 'application/octet-stream',
            ]);
        }

        return $disk->response(
            $photo->file_path,
            $safeName,
            ['Content-Type' => $photo->mime_type ?: 'application/octet-stream']
        );
    }

    public function pdf(BiayaThl $biayaThl)
    {
        $this->authorizePdfPrinter($biayaThl);

        $biayaThl->load('details.photos', 'details.vehicles', 'photos', 'submittedBy', 'checkedBy', 'rlhApprovedBy', 'approvedBy', 'rejectedBy', 'revisedBy', 'biayaRetribusiDetail');

        // Format dates for PDF display
        $biayaThl->tanggal_pengajuan = $biayaThl->tanggal_pengajuan ? Carbon::parse($biayaThl->tanggal_pengajuan)->format('d M Y') : '';
        $biayaThl->submitted_at = $biayaThl->submitted_at ? Carbon::parse($biayaThl->submitted_at)->format('d M Y') : null;
        $biayaThl->checked_at = $biayaThl->checked_at ? Carbon::parse($biayaThl->checked_at)->format('d M Y') : null;
        $biayaThl->rlh_approved_at = $biayaThl->rlh_approved_at ? Carbon::parse($biayaThl->rlh_approved_at)->format('d M Y') : null;
        $biayaThl->approved_at = $biayaThl->approved_at ? Carbon::parse($biayaThl->approved_at)->format('d M Y') : null;
        $biayaThl->rejected_at = $biayaThl->rejected_at ? Carbon::parse($biayaThl->rejected_at)->format('d M Y') : null;
        $biayaThl->revised_at = $biayaThl->revised_at ? Carbon::parse($biayaThl->revised_at)->format('d M Y') : null;

        $approvalSections = $this->approvalPresenter->approvalSectionsFor($biayaThl);

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

        // Map THL detail fields from BiayaRetribusiDetail if linked
        if ($biayaThl->biayaRetribusiDetail) {
            $retribusiDetail = $biayaThl->biayaRetribusiDetail;
            $retribusi->kubikasi = $retribusiDetail->kubikasi;
            $retribusi->droppoint = $retribusiDetail->droppoint;
            $retribusi->posisi = $retribusiDetail->posisi;
            $retribusi->jam_datang = $retribusiDetail->jam_datang;
            $retribusi->jam_pulang = $retribusiDetail->jam_pulang;
            $retribusi->kendaraan_tambahan = $retribusiDetail->kendaraan_tambahan;
            $retribusi->nopol_kendaraan = $retribusiDetail->nopol_kendaraan;
            $retribusi->type_kendaraan = $retribusiDetail->type_kendaraan;
            $retribusi->no_surat_jalan = $retribusiDetail->no_surat_jalan;
        }

        $retribusiDetails = $biayaThl->details->map(function ($thlDetail, int $index) use ($biayaThl): BiayaRetribusiDetail {
            $retribusiDetail = new BiayaRetribusiDetail([
                'nopol_kendaraan' => $thlDetail->nopol_kendaraan,
                'type_kendaraan' => $thlDetail->type_kendaraan,
                'no_surat_jalan' => $thlDetail->no_surat_jalan,
                'kubikasi' => $thlDetail->kubikasi,
                'droppoint' => $thlDetail->droppoint,
                'posisi' => $thlDetail->posisi,
                'jam_datang' => $thlDetail->jam_datang ? Carbon::parse($thlDetail->jam_datang)->format('d M Y H:i') : null,
                'jam_pulang' => $thlDetail->jam_pulang ? Carbon::parse($thlDetail->jam_pulang)->format('d M Y H:i') : null,
                'nominal_biaya' => $thlDetail->nominal_biaya,
                'kendaraan_tambahan' => $thlDetail->kendaraan_tambahan,
                'order' => $index,
            ]);
            $retribusiDetail->setRelation('biayaThlDetail', $thlDetail);

            // Override with BiayaRetribusiDetail values if linked
            if ($biayaThl->biayaRetribusiDetail) {
                $rd = $biayaThl->biayaRetribusiDetail;
                $retribusiDetail->kubikasi = $rd->kubikasi;
                $retribusiDetail->droppoint = $rd->droppoint;
                $retribusiDetail->posisi = $rd->posisi;
                $retribusiDetail->jam_datang = $rd->jam_datang;
                $retribusiDetail->jam_pulang = $rd->jam_pulang;
                $retribusiDetail->kendaraan_tambahan = $rd->kendaraan_tambahan;
                $retribusiDetail->nopol_kendaraan = $rd->nopol_kendaraan;
                $retribusiDetail->type_kendaraan = $rd->type_kendaraan;
                $retribusiDetail->no_surat_jalan = $rd->no_surat_jalan;
            }

            return $retribusiDetail;
        });
        $retribusi->setRelation('details', $retribusiDetails);
        $retribusi->setRelation('documents', collect());

        return $this->pdfRenderer->render('pdf.biaya_retribusi_combined', [
            'biayaRetribusi' => $retribusi,
            'approvalSections' => $approvalSections,
            'stamps' => $this->approvalPresenter->resolveThl($biayaThl),
            'logoData' => $this->pdfRenderer->logoData(),
            'rfahThreshold' => config('biaya.thl_rfah_threshold', 750000),
        ], $this->pdfRenderer->downloadFilename('Biaya_THL', $biayaThl->tanggal_pengajuan, 'pdf'));
    }

    public function export(Request $request)
    {
        $query = $this->scopedExportQuery($request->user());
        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }
        $sortField = in_array($request->sort, ['tanggal_pengajuan', 'type_kendaraan', 'nominal_biaya', 'status', 'no_kendaraan', 'created_at']) ? $request->sort : 'created_at';
        $sortDir = $request->dir === 'asc' ? 'asc' : 'desc';
        $query->orderBy($sortField, $sortDir);
        $query->with('details.photos', 'details.vehicles');
        ExportGuard::ensureWithinLimit($query);

        return Excel::download(new BiayaThlExport($query, $request->user()), $this->pdfRenderer->downloadFilename('Biaya_THL', now(), 'xlsx'));
    }

    private function isManagedPhotoPath(string $path, int $biayaThlId): bool
    {
        $prefix = "biaya_thl/{$biayaThlId}/";

        return str_starts_with($path, $prefix)
            && ! str_contains($path, '..')
            && ! str_contains($path, '\\');
    }

    private function authorizeCreator(BiayaThl $biayaThl): void
    {
        $this->authorizeBiayaRowCreator($biayaThl, 'biaya_thl.full_control');
    }

    private function authorizePdfPrinter(BiayaThl $biayaThl): void
    {
        /** @var User|null $user */
        $user = Auth::user();
        if ($user && $biayaThl->created_by === $user->id) {
            return;
        }
        $this->authorizeViewer($biayaThl);
    }

    private function authorizeViewer(BiayaThl $biayaThl): void
    {
        $this->authorizeBiayaRowViewer($biayaThl, ApprovalAssignment::MODULE_THL);
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
