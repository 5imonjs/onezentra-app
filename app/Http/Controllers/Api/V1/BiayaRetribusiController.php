<?php

namespace App\Http\Controllers\Api\V1;

use App\Exports\BiayaRetribusiExport;
use App\Helpers\PdfCompressor;
use App\Http\Controllers\Controller;
use App\Imports\BiayaRetribusiImport;
use App\Models\ApprovalAssignment;
use App\Models\BiayaRetribusi;
use App\Models\BiayaRetribusiDetail;
use App\Models\BiayaRetribusiDocument;
use App\Models\BiayaThlDetail;
use App\Models\Receiving;
use App\Models\RetribusiRate;
use App\Models\User;
use App\Services\ApprovalSectionResolver;
use App\Services\BiayaApprovalService;
use App\Services\ExportGuard;
use Carbon\Carbon;
use Dompdf\Dompdf;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\QueryException;
use Illuminate\Filesystem\FilesystemAdapter;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Maatwebsite\Excel\Facades\Excel;

class BiayaRetribusiController extends Controller
{
    public function index(Request $request)
    {
        $request->validate([
            'status' => 'nullable|string|in:draft,pending,checked,rlh_approved,approved,rejected,revisi',
        ]);

        $query = BiayaRetribusi::query()->forUserDepot($request->user());
        if ($request->filled('search')) {
            $query->where(function ($q) use ($request) {
                $q->whereHas('details', function ($detailQuery) use ($request) {
                    $detailQuery->where('nopol_kendaraan', 'like', '%'.$request->search.'%')
                        ->orWhere('no_surat_jalan', 'like', '%'.$request->search.'%')
                        ->orWhere('type_kendaraan', 'like', '%'.$request->search.'%');
                })
                    ->orWhere('nama_depo', 'like', '%'.$request->search.'%')
                    ->orWhere('kode_depo', 'like', '%'.$request->search.'%');
            });
        }
        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }
        // Filter depo untuk dashboard (user global); forUserDepot di atas sudah
        // menjadi batas akses, filter ini hanya mempersempit.
        if ($request->filled('kode_depo')) {
            $query->where('kode_depo', $request->input('kode_depo'));
        }
        $sortField = in_array($request->sort, ['tanggal_pengajuan', 'nominal_biaya', 'status', 'created_at']) ? $request->sort : 'created_at';
        $sortDir = $request->dir === 'asc' ? 'asc' : 'desc';
        $query->orderBy($sortField, $sortDir);
        // Ringkasan dihitung dari SELURUH baris terfilter, bukan halaman aktif.
        $summaryQuery = clone $query;
        $data = $query->with('details.biayaThl', 'details.biayaThlDetail.photos', 'documents', 'submittedBy', 'checkedBy', 'rlhApprovedBy', 'approvedBy', 'rejectedBy', 'revisedBy', 'createdBy')
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
            'queue' => $this->approvalQueueSummary($summaryQuery),
        ];

        return response()->json($response)
            ->header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
            ->header('Pragma', 'no-cache');
    }

    /**
     * Antrean biaya per level approval untuk blok dashboard role-aware:
     * jumlah, total nominal tertahan, dan umur pengajuan tertua (hari).
     *
     * @param  Builder  $summaryQuery
     * @return array{check: array{count: int, nominal: float, oldest_days: int|null}, approve: array{count: int, nominal: float, oldest_days: int|null}, rfah: array{count: int, nominal: float, oldest_days: int|null}}
     */
    private function approvalQueueSummary($summaryQuery): array
    {
        $byStatus = (clone $summaryQuery)->reorder()->toBase()
            ->selectRaw('status, COUNT(*) as c, COALESCE(SUM(nominal_biaya), 0) as nominal, MIN(COALESCE(submitted_at, created_at)) as oldest')
            ->groupBy('status')
            ->get()
            ->keyBy('status');

        $rfah = (clone $summaryQuery)->reorder()
            ->where('status', 'rlh_approved')
            ->where('is_rfah_required', true)
            ->toBase()
            ->selectRaw('COUNT(*) as c, COALESCE(SUM(nominal_biaya), 0) as nominal, MIN(COALESCE(submitted_at, created_at)) as oldest')
            ->first();

        return [
            'check' => $this->queueRow($byStatus->get('pending')),
            'approve' => $this->queueRow($byStatus->get('checked')),
            'rfah' => $this->queueRow($rfah),
        ];
    }

    /**
     * @return array{count: int, nominal: float, oldest_days: int|null}
     */
    private function queueRow(?object $row): array
    {
        $oldest = $row->oldest ?? null;

        return [
            'count' => (int) ($row->c ?? 0),
            'nominal' => (float) ($row->nominal ?? 0),
            'oldest_days' => $oldest
                ? max(0, (int) floor((now()->getTimestamp() - strtotime((string) $oldest)) / 86400))
                : null,
        ];
    }

    /**
     * Kandidat retribusi diambil dari penerimaan (receiving) yang sudah
     * COMPLETED dan divalidasi checker — receiving yang sudah pernah
     * diklaim retribusi dikecualikan agar tidak double claim.
     */
    public function candidates(Request $request)
    {
        $allowedTypes = ['CDD', 'Fuso', 'Container 20', 'Container 40'];

        $claimedIds = BiayaRetribusiDetail::query()
            ->whereNotNull('receiving_id')
            ->pluck('receiving_id');

        $query = Receiving::query()
            ->with(['rencanaKirim.sjValidations', 'checker'])
            ->where('status', 'COMPLETED')
            ->whereNotNull('checked_by')
            ->whereNotIn('id', $claimedIds)
            ->whereHas('rencanaKirim', function ($q) use ($request) {
                $q->forUserDepot($request->user());
            });

        if ($request->filled('type_kendaraan')) {
            $query->whereHas('rencanaKirim', fn ($q) => $q->where('jenis_kendaraan', $request->type_kendaraan));
        } else {
            $query->whereHas('rencanaKirim', fn ($q) => $q->whereIn('jenis_kendaraan', $allowedTypes));
        }
        if ($request->filled('nopol_kendaraan')) {
            $query->whereHas('rencanaKirim', fn ($q) => $q->where('nopol', 'like', '%'.$request->nopol_kendaraan.'%'));
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
                // Hasil bersih penerimaan: jumlah aktual per satuan.
                $qtyZak = (float) $receiving->items
                    ->filter(fn ($item) => str_contains(strtoupper((string) $item->satuan), 'ZAK'))
                    ->sum('actual_qty');
                $qtyCrt = (float) $receiving->items
                    ->filter(fn ($item) => str_contains(strtoupper((string) $item->satuan), 'CRT'))
                    ->sum('actual_qty');

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
                ];
            });

        return response()->json($data);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'tanggal_pengajuan' => 'required|date',
            'details' => 'required|array|min:1|max:20',
            'details.*.biaya_thl_id' => 'nullable|integer|exists:biaya_thls,id',
            'details.*.biaya_thl_detail_id' => 'nullable|integer|exists:biaya_thl_details,id',
            'details.*.receiving_id' => 'nullable|integer|exists:receivings,id',
            'details.*.nopol_kendaraan' => 'required|string|max:20',
            'details.*.type_kendaraan' => 'required|string|max:50',
            'details.*.no_surat_jalan' => 'nullable|string|max:50',
            'details.*.qty_zak' => 'nullable|numeric|min:0',
            'details.*.qty_crt' => 'nullable|numeric|min:0',
            'details.*.nominal_biaya' => 'required|numeric|min:0',
            'documents' => 'nullable|array|max:20',
            'documents.*.document_type' => 'required|string|max:50|in:BA,SJ,invoice,manifest,lainnya',
            'documents.*.file_path' => 'nullable|string|max:255',
            'documents.*.file_name' => 'nullable|string|max:255',
            'documents.*.mime_type' => 'nullable|string|max:100|in:image/jpeg,image/png,image/webp,image/gif,application/pdf,text/plain',
            'documents.*.file_size' => 'nullable|integer',
            'files' => 'nullable|array|max:20',
            'files.*' => 'mimes:pdf,jpg,jpeg,png,webp|max:20480',
        ]);

        $this->validateThlReferences($request, $validated['details']);
        $validated = $this->inheritReceivingDepot($validated);

        /** @var User $user */
        $user = $request->user();
        $validated['approval_pengajuan'] = $user->full_name ?: $user->email;
        $validated['approval_pengajuan_level'] = $user->level;
        $validated['created_by'] = $user->id;
        $validated['status'] = 'draft';
        $validated = $user->depotAttributes($validated);
        $validated['details'] = $this->normalizeDetailCasing($validated['details']);
        $validated['details'] = $this->applyRetribusiCalc($validated['kode_depo'] ?? null, $validated['details']);
        $validated['nominal_biaya'] = collect($validated['details'])->sum('nominal_biaya');
        $validated['is_rfah_required'] = $validated['nominal_biaya'] > config('biaya.retribusi_rfah_threshold', 1000000);
        if ($validated['is_rfah_required']) {
            $validated['rfah_name'] = ApprovalAssignment::resolveRfahName($validated['kode_depo'] ?? null, ApprovalAssignment::MODULE_RETRIBUSI);
        }

        try {
            $biayaRetribusi = DB::transaction(function () use ($request, $validated) {
                // Kunci baris receiving DULU, baru validasi klaim: dua pengajuan
                // bersamaan atas receiving yang sama terserialisasi di lock ini,
                // bukan lolos cek lalu insert ganda.
                $receivingIds = collect($validated['details'])
                    ->pluck('receiving_id')->filter()->unique()->values();
                if ($receivingIds->isNotEmpty()) {
                    Receiving::whereIn('id', $receivingIds)->lockForUpdate()->get();
                }
                $this->validateReceivingReferences($request, $validated['details']);

                $biayaRetribusi = BiayaRetribusi::create(collect($validated)->except(['details', 'files', 'documents'])->toArray());

                foreach ($validated['details'] as $index => $detail) {
                    $biayaRetribusi->details()->create(array_merge($detail, [
                        'order' => $index,
                        'nominal_biaya' => $detail['nominal_biaya'],
                    ]));
                }

                foreach ($validated['files'] ?? [] as $index => $file) {
                    $path = $file->store("biaya_retribusi/{$biayaRetribusi->id}", 'public');
                    $biayaRetribusi->documents()->create([
                        'document_type' => $validated['documents'][$index]['document_type'] ?? 'lainnya',
                        'file_path' => $path,
                        'file_name' => $file->getClientOriginalName(),
                        'mime_type' => $file->getMimeType(),
                        'file_size' => $file->getSize(),
                        'order' => $index,
                    ]);
                }

                foreach ($validated['documents'] ?? [] as $index => $doc) {
                    // Entri tanpa file_path adalah metadata pasangan untuk upload
                    // files[] di atas (sudah dibuat) — lewati agar tidak duplikat.
                    if (empty($doc['file_path'])) {
                        continue;
                    }
                    $biayaRetribusi->documents()->create([
                        'document_type' => $doc['document_type'],
                        'file_path' => $doc['file_path'] ?? '',
                        'file_name' => $doc['file_name'] ?? '',
                        'mime_type' => $doc['mime_type'] ?? '',
                        'file_size' => $doc['file_size'] ?? 0,
                        'order' => $index,
                    ]);
                }

                return $biayaRetribusi;
            });

            return response()->json(['message' => 'Biaya Retribusi created', 'data' => $biayaRetribusi->load('details', 'documents')], 201);
        } catch (QueryException $e) {
            // Unique index brd_receiving_id_unique: transaksi pesaing commit
            // duluan — jawab 422 agar frontend menampilkan "sudah diklaim",
            // bukan 500.
            if (($e->errorInfo[0] ?? $e->getCode()) === '23000') {
                throw ValidationException::withMessages([
                    'details' => ['Receiving ini sudah diklaim pada pengajuan lain. Muat ulang daftar kandidat.'],
                ]);
            }

            throw $e;
        }
    }

    public function show(BiayaRetribusi $biayaRetribusi)
    {
        $this->authorizeViewer($biayaRetribusi);

        $biayaRetribusi->load(
            'details.biayaThlDetail.photos',
            'documents',
            'approvalHistories.actor',
            'submittedBy',
            'checkedBy',
            'rlhApprovedBy',
            'approvedBy',
            'rejectedBy',
            'revisedBy',
        );

        $names = $this->approvalActorNames($biayaRetribusi);
        $approvalSections = app(ApprovalSectionResolver::class)->resolve(
            $biayaRetribusi->kode_depo ?: '',
            $names['submitter'],
            $names['checker'],
            $names['approver'],
            $names['rfah'],
            ApprovalAssignment::MODULE_RETRIBUSI,
        );

        $data = $biayaRetribusi->toArray();
        $data['approval_sections'] = array_values(array_filter(
            $approvalSections,
            fn (array $section): bool => $section['title'] !== 'RFAH*' || $biayaRetribusi->is_rfah_required,
        ));

        return response()->json(['data' => $data]);
    }

    public function update(Request $request, BiayaRetribusi $biayaRetribusi)
    {
        $this->authorizeCreator($biayaRetribusi);
        /** @var User|null $editor */
        $editor = Auth::user();
        $hasFullControl = $editor && $editor->hasPermission('biaya_retribusi.full_control');
        if (! in_array($biayaRetribusi->status, ['draft', 'rejected', 'revisi'], true) && ! $hasFullControl) {
            abort(403, 'Hanya pengguna dengan permission Kendali Penuh Biaya Retribusi yang dapat mengubah pengajuan yang sudah dikirim.');
        }
        abort_if($biayaRetribusi->status === 'approved', 422, 'Pengajuan yang sudah approved tidak dapat diedit.');

        // Simpan draft tidak boleh mengembalikan antrean yang berjalan.
        if ($request->boolean('is_draft')) {
            abort_unless(
                in_array($biayaRetribusi->status, ['draft', 'rejected', 'revisi'], true),
                422,
                "Draft hanya dapat disimpan saat status draft/ditolak/revisi (saat ini: {$biayaRetribusi->status})."
            );
        }

        $validated = $request->validate([
            'tanggal_pengajuan' => 'required|date',
            'details' => 'required|array|min:1|max:20',
            'details.*.biaya_thl_id' => 'nullable|integer|exists:biaya_thls,id',
            'details.*.biaya_thl_detail_id' => 'nullable|integer|exists:biaya_thl_details,id',
            'details.*.receiving_id' => 'nullable|integer|exists:receivings,id',
            'details.*.nopol_kendaraan' => 'required|string|max:20',
            'details.*.type_kendaraan' => 'required|string|max:50',
            'details.*.no_surat_jalan' => 'nullable|string|max:50',
            'details.*.qty_zak' => 'nullable|numeric|min:0',
            'details.*.qty_crt' => 'nullable|numeric|min:0',
            'details.*.nominal_biaya' => 'required|numeric|min:0',
            'documents' => 'nullable|array|max:20',
            'documents.*.document_type' => 'string|max:50|in:BA,SJ,invoice,manifest,lainnya',
            'documents.*.file_path' => 'nullable|string|max:255',
            'documents.*.file_name' => 'nullable|string|max:255',
            'documents.*.mime_type' => 'nullable|string|max:100|in:image/jpeg,image/png,image/webp,image/gif,application/pdf,text/plain',
            'documents.*.file_size' => 'nullable|integer',
            'documents_remove' => 'nullable|array',
            'files' => 'nullable|array|max:20',
            'files.*' => 'mimes:pdf,jpg,jpeg,png,webp|max:20480',
        ]);

        $this->validateThlReferences($request, $validated['details']);
        // Samakan dengan store: ganti set receiving ikut memindahkan depo +
        // tarif (tanpa ini nominal dihitung dengan tarif depo lama).
        $validated = $this->inheritReceivingDepot($validated);

        $validated['details'] = $this->normalizeDetailCasing($validated['details']);
        $validated['details'] = $this->applyRetribusiCalc($validated['kode_depo'] ?? $biayaRetribusi->kode_depo, $validated['details']);
        $validated['nominal_biaya'] = collect($validated['details'])->sum('nominal_biaya');
        $validated['is_rfah_required'] = $validated['nominal_biaya'] > config('biaya.retribusi_rfah_threshold', 1000000);
        if ($validated['is_rfah_required']) {
            $validated['rfah_name'] = ApprovalAssignment::resolveRfahName($validated['kode_depo'] ?? $biayaRetribusi->kode_depo, ApprovalAssignment::MODULE_RETRIBUSI);
        } else {
            $validated['rfah_name'] = null;
        }

        try {
            DB::transaction(function () use ($request, $validated, $biayaRetribusi): void {
                $receivingIds = collect($validated['details'])
                    ->pluck('receiving_id')->filter()->unique()->values();
                if ($receivingIds->isNotEmpty()) {
                    Receiving::whereIn('id', $receivingIds)->lockForUpdate()->get();
                }
                $this->validateReceivingReferences($request, $validated['details'], $biayaRetribusi->id);

                $biayaRetribusi->update(collect($validated)->except(['details', 'files', 'documents', 'documents_remove'])->toArray());
                $biayaRetribusi->details()->delete();

                foreach ($validated['details'] as $index => $detail) {
                    $biayaRetribusi->details()->create(array_merge($detail, [
                        'order' => $index,
                        'nominal_biaya' => $detail['nominal_biaya'],
                    ]));
                }

                foreach ($validated['documents_remove'] ?? [] as $docId) {
                    $doc = $biayaRetribusi->documents()->find($docId);
                    if ($doc) {
                        Storage::disk('public')->delete($doc->file_path);
                        $doc->delete();
                    }
                }

                foreach ($validated['files'] ?? [] as $index => $file) {
                    $path = $file->store("biaya_retribusi/{$biayaRetribusi->id}", 'public');
                    $biayaRetribusi->documents()->create([
                        'document_type' => $validated['documents'][$index]['document_type'] ?? 'lainnya',
                        'file_path' => $path,
                        'file_name' => $file->getClientOriginalName(),
                        'mime_type' => $file->getMimeType(),
                        'file_size' => $file->getSize(),
                        'order' => $index,
                    ]);
                }
            });
        } catch (QueryException $e) {
            if (($e->errorInfo[0] ?? $e->getCode()) === '23000') {
                throw ValidationException::withMessages([
                    'details' => ['Receiving ini sudah diklaim pada pengajuan lain. Muat ulang daftar kandidat.'],
                ]);
            }

            throw $e;
        }

        return response()->json(['message' => 'Biaya Retribusi updated', 'data' => $biayaRetribusi->load('details', 'documents')]);
    }

    public function destroy(BiayaRetribusi $biayaRetribusi)
    {
        $this->authorizeCreator($biayaRetribusi);
        /** @var User|null $destroyer */
        $destroyer = Auth::user();
        $destroyerHasFullControl = $destroyer && $destroyer->hasPermission('biaya_retribusi.full_control');
        if (! $destroyerHasFullControl) {
            abort_unless(
                in_array($biayaRetribusi->status, ['draft', 'rejected', 'revisi'], true),
                422,
                "Pengajuan yang sudah dikirim (status {$biayaRetribusi->status}) tidak dapat dihapus."
            );
        }
        // Hapus baris DB dalam satu transaksi agar tidak menyisakan pengajuan
        // tanpa detail bila salah satu delete gagal. File storage baru dihapus
        // setelah commit supaya kegagalan rollback tidak menghapus file yang
        // datanya masih ada.
        /** @var array<int, string> $filePaths */
        $filePaths = DB::transaction(function () use ($biayaRetribusi): array {
            $paths = [];
            foreach ($biayaRetribusi->documents as $doc) {
                if ($doc->file_path) {
                    $paths[] = $doc->file_path;
                }
                $doc->delete();
            }
            $biayaRetribusi->details()->delete();
            $biayaRetribusi->delete();

            return $paths;
        });

        foreach ($filePaths as $path) {
            Storage::disk('public')->delete($path);
        }

        return response()->json(['message' => 'Biaya Retribusi deleted']);
    }

    public function submit(Request $request, BiayaRetribusi $biayaRetribusi, BiayaApprovalService $approvalService)
    {
        return response()->json(['message' => 'Pengajuan retribusi dikirim untuk diperiksa.', 'data' => $approvalService->submit($biayaRetribusi, $request->user())]);
    }

    public function check(Request $request, BiayaRetribusi $biayaRetribusi, BiayaApprovalService $approvalService)
    {
        return response()->json(['message' => 'Pengajuan retribusi telah diperiksa.', 'data' => $approvalService->check($biayaRetribusi, $request->user())]);
    }

    public function approve(Request $request, BiayaRetribusi $biayaRetribusi, BiayaApprovalService $approvalService)
    {
        return response()->json(['message' => 'Pengajuan retribusi telah disetujui.', 'data' => $approvalService->approve($biayaRetribusi, $request->user())]);
    }

    public function rfahApprove(Request $request, BiayaRetribusi $biayaRetribusi, BiayaApprovalService $approvalService)
    {
        return response()->json(['message' => 'Pengajuan retribusi telah disetujui RFAH.', 'data' => $approvalService->rfahApprove($biayaRetribusi, $request->user())]);
    }

    public function reject(Request $request, BiayaRetribusi $biayaRetribusi, BiayaApprovalService $approvalService)
    {
        $reason = $request->validate(['reason' => ['required', 'string', 'max:1000']])['reason'];

        return response()->json(['message' => 'Pengajuan retribusi ditolak.', 'data' => $approvalService->reject($biayaRetribusi, $request->user(), $reason)]);
    }

    public function revise(Request $request, BiayaRetribusi $biayaRetribusi, BiayaApprovalService $approvalService)
    {
        $reason = $request->validate(['reason' => ['required', 'string', 'max:1000']])['reason'];

        return response()->json(['message' => 'Pengajuan retribusi dikirim kembali untuk direvisi.', 'data' => $approvalService->revise($biayaRetribusi, $request->user(), $reason)]);
    }

    /**
     * MIME yang boleh disajikan inline. Di luar daftar ini respons dipaksa
     * `application/octet-stream` + attachment agar konten tak tebak (mis.
     * text/html atau SVG berisi script) tidak dieksekusi browser sebagai
     * halaman aktif (XSS via upload dokumen).
     */
    private const INLINE_MIME_ALLOWLIST = [
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/gif',
        'application/pdf',
        'text/plain',
    ];

    /**
     * Sajikan file lampiran lewat API (ber-CORS + berizin) karena file
     * statis public/storage tidak mengirim header CORS ke frontend.
     */
    public function document(Request $request, BiayaRetribusiDocument $document)
    {
        $biayaRetribusi = $document->biayaRetribusi;
        abort_if(! $biayaRetribusi, 404);
        // Samakan dengan show()/pdf(): hanya creator/approver yang berhak
        // melihat lampiran dokumen.
        $this->authorizeViewer($biayaRetribusi);
        /** @var FilesystemAdapter $disk */
        $disk = Storage::disk('public');
        abort_unless($document->file_path && $disk->exists($document->file_path), 404);
        $safeName = str_replace(['"', "\n", "\r"], '', $document->file_name ?: basename($document->file_path));

        if (! in_array($document->mime_type, self::INLINE_MIME_ALLOWLIST, true)) {
            return $disk->download($document->file_path, $safeName, [
                'Content-Type' => 'application/octet-stream',
            ]);
        }

        return $disk->response(
            $document->file_path,
            $safeName,
            ['Content-Type' => $document->mime_type]
        );
    }

    public function pdf(BiayaRetribusi $biayaRetribusi)
    {
        $this->authorizeViewer($biayaRetribusi);

        $biayaRetribusi->load('details.biayaThlDetail.photos', 'documents', 'checkedBy', 'rlhApprovedBy', 'approvedBy', 'rejectedBy', 'revisedBy');

        // Format dates for PDF display
        $biayaRetribusi->tanggal_pengajuan = $biayaRetribusi->tanggal_pengajuan ? Carbon::parse($biayaRetribusi->tanggal_pengajuan)->format('d M Y') : null;
        $biayaRetribusi->submitted_at = $biayaRetribusi->submitted_at ? Carbon::parse($biayaRetribusi->submitted_at)->format('d M Y') : null;
        $biayaRetribusi->checked_at = $biayaRetribusi->checked_at ? Carbon::parse($biayaRetribusi->checked_at)->format('d M Y') : null;
        $biayaRetribusi->rlh_approved_at = $biayaRetribusi->rlh_approved_at ? Carbon::parse($biayaRetribusi->rlh_approved_at)->format('d M Y') : null;
        $biayaRetribusi->approved_at = $biayaRetribusi->approved_at ? Carbon::parse($biayaRetribusi->approved_at)->format('d M Y') : null;
        $biayaRetribusi->rejected_at = $biayaRetribusi->rejected_at ? Carbon::parse($biayaRetribusi->rejected_at)->format('d M Y') : null;
        $biayaRetribusi->revised_at = $biayaRetribusi->revised_at ? Carbon::parse($biayaRetribusi->revised_at)->format('d M Y') : null;

        // Format THL detail fields
        foreach ($biayaRetribusi->details as $detail) {
            $detail->jam_datang = $detail->jam_datang ? Carbon::parse($detail->jam_datang)->format('d M Y H:i') : null;
            $detail->jam_pulang = $detail->jam_pulang ? Carbon::parse($detail->jam_pulang)->format('d M Y H:i') : null;
        }

        $names = $this->approvalActorNames($biayaRetribusi);
        $approvalSections = app(ApprovalSectionResolver::class)->resolve(
            $biayaRetribusi->kode_depo ?: '',
            $names['submitter'],
            $names['checker'],
            $names['approver'],
            $names['rfah'],
        );

        $html = view('pdf.biaya_retribusi', [
            'biayaRetribusi' => $biayaRetribusi,
            'approvalSections' => $approvalSections,
            'stamps' => $this->resolveStamps($biayaRetribusi),
        ])->render();

        $dompdf = new Dompdf;
        $dompdf->set_option('isRemoteEnabled', true);
        $dompdf->set_option('defaultFont', 'DejaVu Sans');
        $dompdf->set_option('tempDir', sys_get_temp_dir());
        $dompdf->loadHtml($html);
        $dompdf->setPaper('A4', 'landscape');

        $previousTimeLimit = ini_get('max_execution_time');
        $previousMemoryLimit = ini_get('memory_limit');
        set_time_limit(300);
        ini_set('memory_limit', '512M');

        $dompdf->render();

        if ($previousTimeLimit !== false) {
            set_time_limit((int) $previousTimeLimit);
        }
        ini_set('memory_limit', $previousMemoryLimit);

        return response($dompdf->output(), 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'inline; filename="'.$this->downloadFilename('Biaya_Retribusi', $biayaRetribusi->tanggal_pengajuan, 'pdf').'"',
        ]);
    }

    /**
     * Nama file unduhan seragam: `DD-MM-YYYY_Biaya_Retribusi.pdf`.
     * Tanggal dari tanggal pengajuan; bila tak valid, pakai hari ini.
     */
    private function downloadFilename(string $kind, mixed $tanggal, string $ext): string
    {
        try {
            $date = Carbon::parse((string) ($tanggal ?: now()))->format('d-m-Y');
        } catch (\Throwable) {
            $date = now()->format('d-m-Y');
        }

        return "{$date}_{$kind}.{$ext}";
    }

    /**
     * Cap audit per kotak approval untuk PDF. Publik agar perilaku penempatan
     * cap (ikuti peran pelaku) dapat diuji langsung.
     */
    public function resolveStamps(BiayaRetribusi $biayaRetribusi): array
    {
        $stamps = [];

        if ($biayaRetribusi->status !== 'draft') {
            $stamps['Mengajukan'] = [
                'text' => 'PENGAJUAN',
                'color' => '#dc2626',
                'date' => $biayaRetribusi->submitted_at?->format('d M Y'),
            ];
        }

        if ($biayaRetribusi->checked_at) {
            $stamps['Mengetahui'] = [
                'text' => 'DIPERIKSA',
                'color' => '#dc2626',
                'date' => $biayaRetribusi->checked_at->format('d M Y'),
            ];
        }

        if ($biayaRetribusi->status === 'approved') {
            $stamps['Menyetujui'] = [
                'text' => 'DISETUJUI',
                'color' => '#dc2626',
                'date' => $biayaRetribusi->approved_at?->format('d M Y'),
            ];
        } elseif ($biayaRetribusi->status === 'rejected') {
            $actorSection = $this->stampSectionFor((string) $biayaRetribusi->rejectedBy?->level);
            $stamps[$actorSection] = [
                'text' => 'DITOLAK',
                'color' => '#dc2626',
                'date' => $biayaRetribusi->rejected_at?->format('d M Y'),
            ];
            // Persetujuan RLH pada siklus sebelumnya tetap tercatat di kotaknya
            // bila aksi terminal (ditolak) dilakukan pelaku lain (BAC/RFAH).
            if ($actorSection !== 'Menyetujui' && $biayaRetribusi->rlh_approved_at && $biayaRetribusi->rlhApprovedBy) {
                $stamps['Menyetujui'] = [
                    'text' => 'DISETUJUI RLH',
                    'color' => '#dc2626',
                    'date' => $biayaRetribusi->rlh_approved_at->format('d M Y'),
                ];
            }
        } elseif ($biayaRetribusi->status === 'revisi') {
            $actorSection = $this->stampSectionFor((string) $biayaRetribusi->revisedBy?->level);
            $stamps[$actorSection] = [
                'text' => 'REVISI',
                'color' => '#d97706',
                'date' => $biayaRetribusi->revised_at?->format('d M Y'),
            ];
            if ($actorSection !== 'Menyetujui' && $biayaRetribusi->rlh_approved_at && $biayaRetribusi->rlhApprovedBy) {
                $stamps['Menyetujui'] = [
                    'text' => 'DISETUJUI RLH',
                    'color' => '#dc2626',
                    'date' => $biayaRetribusi->rlh_approved_at->format('d M Y'),
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
    public function approvalActorNames(BiayaRetribusi $biayaRetribusi): array
    {
        $submitter = $biayaRetribusi->approval_pengajuan;
        $checker = $biayaRetribusi->checkedBy?->full_name;
        $approver = null;
        $rfah = null;

        if ($biayaRetribusi->status === 'rlh_approved') {
            $approver = $biayaRetribusi->rlhApprovedBy?->full_name;
        } elseif ($biayaRetribusi->status === 'approved') {
            if ($biayaRetribusi->is_rfah_required) {
                $approver = $biayaRetribusi->rlhApprovedBy?->full_name;
                $rfah = $biayaRetribusi->approvedBy?->full_name;
            } else {
                $approver = $biayaRetribusi->approvedBy?->full_name;
            }
        } elseif (in_array($biayaRetribusi->status, ['rejected', 'revisi'], true)) {
            $actor = $biayaRetribusi->status === 'rejected' ? $biayaRetribusi->rejectedBy : $biayaRetribusi->revisedBy;
            match (strtoupper((string) ($actor?->level ?? ''))) {
                'BAC' => $checker = $actor?->full_name,
                'RFAH' => $rfah = $actor?->full_name,
                default => $approver = $actor?->full_name,
            };
        }

        return ['submitter' => $submitter, 'checker' => $checker, 'approver' => $approver, 'rfah' => $rfah];
    }

    /**
     * Normalisasi casing plat agar konsisten kapital di database.
     *
     * @param  array<int, array<string, mixed>>  $details
     * @return array<int, array<string, mixed>>
     */
    private function normalizeDetailCasing(array $details): array
    {
        return array_map(function ($detail) {
            if (isset($detail['nopol_kendaraan'])) {
                $detail['nopol_kendaraan'] = strtoupper(trim((string) $detail['nopol_kendaraan']));
            }
            if (isset($detail['type_kendaraan'])) {
                $detail['type_kendaraan'] = strtoupper(trim((string) $detail['type_kendaraan']));
            }

            return $detail;
        }, $details);
    }

    /**
     * Terapkan logika hitung retribusi: hanya baris receiving yang mengikuti
     * mode koli depo (nominal = qty_zak * rate_zak + qty_crt * rate_crt);
     * baris manual (tanpa receiving_id) selalu memakai nominal manual
     * (borongan) agar tidak termanipulasi client.
     *
     * @param  array<int, array<string, mixed>>  $details
     * @return array<int, array<string, mixed>>
     */
    private function applyRetribusiCalc(?string $kodeDepo, array $details): array
    {
        $cfg = RetribusiRate::resolveFor($kodeDepo);
        if ($cfg['mode'] !== 'koli') {
            return $details;
        }
        $rateZak = (float) $cfg['rate_zak'];
        $rateCrt = (float) $cfg['rate_crt'];

        return array_map(fn ($detail) => empty($detail['receiving_id']) ? $detail : array_merge($detail, [
            'nominal_biaya' => ((float) ($detail['qty_zak'] ?? 0)) * $rateZak
                + ((float) ($detail['qty_crt'] ?? 0)) * $rateCrt,
        ]), $details);
    }

    /**
     * Bila seluruh baris berasal dari receiving yang se-depo, pengajuan
     * mewarisi depo receiving (bukan depo pembuat) agar tarif koli,
     * laporan, dan filter depo konsisten siapa pun yang membuat.
     */
    private function inheritReceivingDepot(array $validated): array
    {
        $details = $validated['details'] ?? [];
        if (count($details) === 0) {
            return $validated;
        }
        foreach ($details as $detail) {
            if (empty($detail['receiving_id'])) {
                return $validated;
            }
        }
        $depots = Receiving::query()
            ->whereIn('id', collect($details)->pluck('receiving_id')->unique()->values())
            ->with('rencanaKirim')
            ->get()
            ->map(fn (Receiving $r) => [$r->rencanaKirim?->kode_depo, $r->rencanaKirim?->nama_depo])
            ->unique()
            ->values();
        if ($depots->count() !== 1 || blank($depots->first()[0])) {
            return $validated;
        }
        $validated['kode_depo'] = $depots->first()[0];
        $validated['nama_depo'] = $depots->first()[1] ?? $depots->first()[0];

        return $validated;
    }

    private function validateThlReferences(Request $request, array $details): void
    {
        foreach ($details as $index => $detail) {
            if (empty($detail['biaya_thl_detail_id'])) {
                continue;
            }

            $source = BiayaThlDetail::query()
                ->with('biayaThl')
                ->find($detail['biaya_thl_detail_id']);

            $valid = $source
                && $source->biaya_thl_id === ($detail['biaya_thl_id'] ?? null)
                && $source->biayaThl?->status === 'approved';

            if ($valid && $request->user()->isDepotScoped()) {
                $valid = $source->biayaThl->kode_depo === $request->user()->kode_depo
                    && $source->biayaThl->nama_depo === $request->user()->nama_depo;
            }

            if (! $valid) {
                throw ValidationException::withMessages([
                    "details.{$index}.biaya_thl_detail_id" => 'Sumber THL tidak valid untuk depo pengguna.',
                ]);
            }
        }
    }

    /**
     * Pastikan receiving sumber sudah COMPLETED, divalidasi checker,
     * se-depo dengan pengguna, dan belum diklaim retribusi lain.
     */
    private function validateReceivingReferences(Request $request, array $details, ?int $exceptRetribusiId = null): void
    {
        foreach ($details as $index => $detail) {
            if (empty($detail['receiving_id'])) {
                continue;
            }

            $receiving = Receiving::query()->with('rencanaKirim')->find($detail['receiving_id']);

            $valid = $receiving
                && $receiving->status === 'COMPLETED'
                && $receiving->checked_by !== null;

            if ($valid && $request->user()->isDepotScoped()) {
                $valid = $receiving->rencanaKirim
                    && $receiving->rencanaKirim->kode_depo === $request->user()->kode_depo;
            }

            if ($valid) {
                $claimed = BiayaRetribusiDetail::query()
                    ->where('receiving_id', $detail['receiving_id'])
                    ->when($exceptRetribusiId, fn ($q) => $q->where('biaya_retribusi_id', '!=', $exceptRetribusiId))
                    ->exists();
                $valid = ! $claimed;
            }

            if (! $valid) {
                throw ValidationException::withMessages([
                    "details.{$index}.receiving_id" => 'Receiving tidak valid: harus COMPLETED tervalidasi checker, se-depo, dan belum diklaim.',
                ]);
            }
        }
    }

    public function export(Request $request)
    {
        $query = BiayaRetribusi::query()->forUserDepot($request->user());
        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }
        $query->with('details');
        ExportGuard::ensureWithinLimit($query);

        return Excel::download(new BiayaRetribusiExport($query, $request->user()), $this->downloadFilename('Biaya_Retribusi', now(), 'xlsx'));
    }

    /**
     * Melihat boleh: admin master, peran pengaju, pembuat, atau approver
     * (BAC/RLH/RFAH) yang ditetapkan untuk depo pengajuan.
     */
    private function authorizeViewer(BiayaRetribusi $biayaRetribusi): void
    {
        /** @var User|null $user */
        $user = Auth::user();
        if (! $user) {
            abort(403);
        }

        if ($user->isAdminMaster() || $user->hasRole('admin_master') || $biayaRetribusi->created_by === $user->id) {
            return;
        }

        // Peran pengaju hanya boleh melihat data depo-nya sendiri.
        if (($user->hasRole('blc') || $user->hasRole('staff_logistic'))
            && $user->canAccessDepotRow($biayaRetribusi->kode_depo, $biayaRetribusi->nama_depo)) {
            return;
        }

        $assigned = ApprovalAssignment::query()
            ->where('module', ApprovalAssignment::MODULE_RETRIBUSI)
            ->where('user_id', $user->id)
            ->whereIn('approval_level', ['BAC', 'RLH', 'RFAH'])
            ->where('is_active', true)
            ->where(function ($query) use ($biayaRetribusi): void {
                $query->where('kode_depo', $biayaRetribusi->kode_depo)
                    ->orWhere('kode_depo', 'ADMIN');
            })
            ->exists();

        abort_unless($assigned, 403, 'Anda bukan approver yang ditetapkan untuk pengajuan ini.');
    }

    private function authorizeCreator(BiayaRetribusi $biayaRetribusi): void
    {
        /** @var User|null $user */
        $user = Auth::user();
        if (! $user) {
            abort(403);
        }

        if ($user->isAdminMaster() || $biayaRetribusi->created_by === $user->id) {
            return;
        }

        // Peran pengaju dan pemegang kendali penuh hanya boleh mengubah data
        // di depo-nya sendiri (cegah IDOR lintas depo).
        $canManage = $user->hasRole('blc')
            || $user->hasRole('staff_logistic')
            || $user->hasPermission('biaya_retribusi.full_control');

        abort_unless(
            $canManage && $user->canAccessDepotRow($biayaRetribusi->kode_depo, $biayaRetribusi->nama_depo),
            403,
            'Anda tidak memiliki izin untuk mengubah data ini.'
        );
    }

    public function import(Request $request)
    {
        $request->validate([
            'file' => 'required|file|mimes:pdf,xlsx,xls,csv|max:10240',
        ]);

        $tempFiles = [];
        $trackTemp = function (string $path) use (&$tempFiles): string {
            $tempFiles[] = $path;

            return $path;
        };

        try {
            $file = $request->file('file');
            $originalName = $file->getClientOriginalName();
            $extension = strtolower($file->getClientOriginalExtension());

            // Simpan file sementara ke storage/app/tmp dengan nama file saja:
            // move($dir, $name) memakai $name sebagai nama file, jadi prefix
            // 'tmp/' di nama hanya membuat subfolder ganda tmp/tmp/.
            if (! is_dir(storage_path('app/tmp'))) {
                mkdir(storage_path('app/tmp'), 0755, true);
            }
            $fileName = uniqid().'.'.$extension;
            $file->move(storage_path('app/tmp'), $fileName);
            $sourcePath = $trackTemp(storage_path('app/tmp/'.$fileName));

            if ($extension === 'pdf') {
                // Kompres PDF dengan qpdf sebelum disimpan
                $compressedPath = $trackTemp(storage_path('app/tmp/'.uniqid().'_compressed.pdf'));
                PdfCompressor::compress($sourcePath, $compressedPath);
                if (file_exists($compressedPath)) {
                    $sourcePath = $compressedPath;
                }

                // Simpan ke disk publik, lalu return file_url
                $finalPath = 'biaya_retribusi/import/'.uniqid().'.pdf';
                Storage::disk('public')->put($finalPath, file_get_contents($sourcePath));

                return response()->json([
                    'message' => 'Import berhasil',
                    'data' => [
                        'file_url' => Storage::disk('public')->url($finalPath),
                        'file_name' => $originalName,
                        'file_size' => filesize($sourcePath),
                    ],
                ]);
            }

            // Import Excel/CSV
            $import = new BiayaRetribusiImport;
            DB::transaction(fn () => Excel::import($import, $sourcePath));

            return response()->json([
                'message' => 'Import berhasil',
                'data' => ['imported' => $import->imported, 'updated' => $import->updated, 'errors' => $import->errors],
            ]);
        } catch (\Exception $e) {
            Log::error('Biaya Retribusi Import Error', ['error' => $e->getMessage()]);

            return response()->json(['message' => 'Import gagal. Silakan periksa file dan coba lagi.'], 500);
        } finally {
            // Bersihkan file temp baik sukses maupun gagal — tanpa ini
            // storage/app/tmp menumpuk setiap import.
            foreach ($tempFiles as $tempFile) {
                if (is_file($tempFile)) {
                    @unlink($tempFile);
                }
            }
        }
    }
}
