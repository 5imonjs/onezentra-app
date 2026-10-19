<?php

namespace App\Http\Controllers\Api\V1;

use App\Exports\BiayaRetribusiExport;
use App\Helpers\PdfCompressor;
use App\Http\Controllers\Api\V1\Concerns\AuthorizesBiayaRows;
use App\Http\Controllers\Controller;
use App\Http\Resources\BiayaRetribusiResource;
use App\Imports\BiayaRetribusiImport;
use App\Models\ApprovalAssignment;
use App\Models\BiayaRetribusi;
use App\Models\BiayaRetribusiDetail;
use App\Models\BiayaRetribusiDocument;
use App\Models\Receiving;
use App\Models\User;
use App\Services\Biaya\BiayaApprovalPresenter;
use App\Services\Biaya\BiayaDetailNormalizer;
use App\Services\Biaya\BiayaPdfRenderer;
use App\Services\Biaya\BiayaQueueSummary;
use App\Services\Biaya\BiayaRetribusiCalculator;
use App\Services\Biaya\BiayaRetribusiReferenceValidator;
use App\Services\BiayaApprovalService;
use App\Services\ExportGuard;
use Carbon\Carbon;
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
    use AuthorizesBiayaRows;

    public function __construct(
        private readonly BiayaApprovalPresenter $approvalPresenter,
        private readonly BiayaPdfRenderer $pdfRenderer,
        private readonly BiayaDetailNormalizer $normalizer,
        private readonly BiayaRetribusiCalculator $calculator,
        private readonly BiayaRetribusiReferenceValidator $referenceValidator,
    ) {}

    public function index(Request $request)
    {
        $request->validate([
            'status' => 'nullable|string|in:draft,pending,checked,rlh_approved,approved,rejected,revisi',
        ]);

        $query = BiayaRetribusi::query()->forUserDepot($request->user());
        if ($request->filled('search')) {
            $pattern = $this->likeContains((string) $request->input('search'));
            $query->where(function ($q) use ($pattern) {
                $q->whereHas('details', function ($detailQuery) use ($pattern) {
                    $detailQuery->whereRaw('nopol_kendaraan LIKE ? ESCAPE ?', [$pattern, '\\']);
                    foreach (['no_surat_jalan', 'type_kendaraan'] as $column) {
                        $detailQuery->orWhereRaw("{$column} LIKE ? ESCAPE ?", [$pattern, '\\']);
                    }
                })
                    ->orWhereRaw('nama_depo LIKE ? ESCAPE ?', [$pattern, '\\'])
                    ->orWhereRaw('kode_depo LIKE ? ESCAPE ?', [$pattern, '\\']);
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
        $response['data'] = BiayaRetribusiResource::collection($data->items())->resolve($request);
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

        $this->referenceValidator->validateThlReferences($request, $validated['details']);
        $validated = $this->calculator->inheritReceivingDepot($validated);

        /** @var User $user */
        $user = $request->user();
        $validated['approval_pengajuan'] = $user->full_name ?: $user->email;
        $validated['approval_pengajuan_level'] = $user->level;
        $validated['created_by'] = $user->id;
        $validated['status'] = 'draft';
        $validated = $user->depotAttributes($validated);
        $validated['details'] = $this->normalizer->forRetribusi($validated['details']);
        $validated['details'] = $this->calculator->apply($validated['kode_depo'] ?? null, $validated['details']);
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
                $this->referenceValidator->validateReceivingReferences($request, $validated['details']);

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

            return response()->json(['message' => 'Biaya Retribusi created', 'data' => new BiayaRetribusiResource($biayaRetribusi->load('details', 'documents'))], 201);
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

        return response()->json(['data' => (new BiayaRetribusiResource($biayaRetribusi))->withApprovalSections()]);
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

        $this->referenceValidator->validateThlReferences($request, $validated['details']);
        // Samakan dengan store: ganti set receiving ikut memindahkan depo +
        // tarif (tanpa ini nominal dihitung dengan tarif depo lama).
        $validated = $this->calculator->inheritReceivingDepot($validated);

        $validated['details'] = $this->normalizer->forRetribusi($validated['details']);
        $validated['details'] = $this->calculator->apply($validated['kode_depo'] ?? $biayaRetribusi->kode_depo, $validated['details']);
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
                $this->referenceValidator->validateReceivingReferences($request, $validated['details'], $biayaRetribusi->id);

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

        return response()->json(['message' => 'Biaya Retribusi updated', 'data' => new BiayaRetribusiResource($biayaRetribusi->load('details', 'documents'))]);
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

        $approvalSections = $this->approvalPresenter->approvalSectionsFor($biayaRetribusi);

        return $this->pdfRenderer->render('pdf.biaya_retribusi', [
            'biayaRetribusi' => $biayaRetribusi,
            'approvalSections' => $approvalSections,
            'stamps' => $this->approvalPresenter->resolveRetribusi($biayaRetribusi),
        ], $this->pdfRenderer->downloadFilename('Biaya_Retribusi', $biayaRetribusi->tanggal_pengajuan, 'pdf'));
    }

    public function export(Request $request)
    {
        $query = BiayaRetribusi::query()->forUserDepot($request->user());
        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }
        $query->with('details');
        ExportGuard::ensureWithinLimit($query);

        return Excel::download(new BiayaRetribusiExport($query, $request->user()), $this->pdfRenderer->downloadFilename('Biaya_Retribusi', now(), 'xlsx'));
    }

    /**
     * Melihat boleh: admin master, peran pengaju, pembuat, atau approver
     * (BAC/RLH/RFAH) yang ditetapkan untuk depo pengajuan.
     */
    private function authorizeViewer(BiayaRetribusi $biayaRetribusi): void
    {
        $this->authorizeBiayaRowViewer($biayaRetribusi, ApprovalAssignment::MODULE_RETRIBUSI, allowAdminRole: true);
    }

    private function authorizeCreator(BiayaRetribusi $biayaRetribusi): void
    {
        $this->authorizeBiayaRowCreator($biayaRetribusi, 'biaya_retribusi.full_control');
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
