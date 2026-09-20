<?php

namespace App\Http\Controllers\Api\V1;

use App\Exports\BiayaRetribusiExport;
use App\Http\Controllers\Controller;
use App\Models\BiayaRetribusi;
use App\Models\BiayaThl;
use App\Models\BiayaThlDetail;
use App\Models\User;
use App\Services\ApprovalSectionResolver;
use App\Services\BiayaApprovalService;
use Dompdf\Dompdf;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Maatwebsite\Excel\Facades\Excel;

class BiayaRetribusiController extends Controller
{
    public function index(Request $request)
    {
        $query = BiayaRetribusi::query()->forUserDepot($request->user());
        if ($request->filled('search')) {
            $query->where(function ($q) use ($request) {
                $q->whereHas('details', function ($detailQuery) use ($request) {
                    $detailQuery->where('nopol_kendaraan', 'like', '%'.$request->search.'%');
                })
                    ->orWhere('nama_depo', 'like', '%'.$request->search.'%')
                    ->orWhere('kode_depo', 'like', '%'.$request->search.'%');
            });
        }
        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }
        $data = $query->with('details.biayaThl', 'details.biayaThlDetail.photos', 'documents', 'submittedBy', 'checkedBy', 'approvedBy', 'rejectedBy', 'revisedBy', 'createdBy')
            ->orderBy('created_at', 'desc')
            ->paginate($this->perPage($request, 50));

        return response()->json($data);
    }

    public function candidates(Request $request)
    {
        $allowedTypes = ['CDD', 'Fuso', 'Container 20', 'Container 40'];

        $query = BiayaThlDetail::query()
            ->with('biayaThl', 'photos')
            ->whereHas('biayaThl', function ($q) use ($request) {
                $q->where('status', 'approved');
                $q->forUserDepot($request->user());
            })
            ->whereIn('type_kendaraan', $allowedTypes);

        if ($request->filled('type_kendaraan')) {
            $query->where('type_kendaraan', $request->type_kendaraan);
        }
        if ($request->filled('nopol_kendaraan')) {
            $query->where('nopol_kendaraan', 'like', '%'.$request->nopol_kendaraan.'%');
        }
        if ($request->filled('kode_depo')) {
            $query->whereHas('biayaThl', function ($q) use ($request) {
                $q->where('kode_depo', $request->kode_depo);
            });
        }
        $data = $query->orderByDesc(
            BiayaThl::select('tanggal_pengajuan')
                ->whereColumn('biaya_thls.id', 'biaya_thl_details.biaya_thl_id')
        )
            ->limit(80)
            ->get();

        return response()->json($data);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'tanggal_pengajuan' => 'required|date',
            'details' => 'required|array|min:1|max:20',
            'details.*.biaya_thl_id' => 'nullable|integer|exists:biaya_thls,id',
            'details.*.biaya_thl_detail_id' => 'nullable|integer|exists:biaya_thl_details,id',
            'details.*.nopol_kendaraan' => 'required|string|max:20',
            'details.*.type_kendaraan' => 'required|string|max:50',
            'details.*.no_surat_jalan' => 'nullable|string|max:50',
            'details.*.nominal_biaya' => 'required|numeric|min:0',
            'documents' => 'nullable|array|max:20',
            'documents.*.document_type' => 'required|string|max:50|in:BA,SJ,invoice,manifest,lainnya',
            'documents.*.file_path' => 'nullable|string|max:255',
            'documents.*.file_name' => 'nullable|string|max:255',
            'documents.*.mime_type' => 'nullable|string|max:100',
            'documents.*.file_size' => 'nullable|integer',
            'files' => 'nullable|array|max:20',
            'files.*' => 'mimes:pdf,jpg,jpeg,png,webp|max:5120',
        ]);

        $this->validateThlReferences($request, $validated['details']);

        $validated['nominal_biaya'] = collect($validated['details'])->sum('nominal_biaya');
        $validated['is_rfah_required'] = $validated['nominal_biaya'] > 1000000;
        if ($validated['is_rfah_required']) {
            $validated['rfah_name'] = 'Umi Marzuqoh';
        }
        /** @var User $user */
        $user = $request->user();
        $validated['approval_pengajuan'] = $user->full_name ?: $user->email;
        $validated['approval_pengajuan_level'] = $user->level;
        $validated['created_by'] = $user->id;
        $validated['status'] = 'draft';
        $validated = $user->depotAttributes($validated);

        $biayaRetribusi = DB::transaction(function () use ($validated) {
            $biayaRetribusi = BiayaRetribusi::create($validated);

            foreach ($validated['details'] as $index => $detail) {
                $biayaRetribusi->details()->create(array_merge($detail, [
                    'order' => $index,
                    'nominal_biaya' => $detail['nominal_biaya'],
                ]));
            }

            foreach ($validated['files'] ?? [] as $index => $file) {
                $path = $file->store("biaya_retribusi/{$biayaRetribusi->id}", 'public');
                $biayaRetribusi->documents()->create([
                    'document_type' => 'lainnya',
                    'file_path' => $path,
                    'file_name' => $file->getClientOriginalName(),
                    'mime_type' => $file->getMimeType(),
                    'file_size' => $file->getSize(),
                    'order' => $index,
                ]);
            }

            foreach ($validated['documents'] ?? [] as $index => $doc) {
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
    }

    public function show(BiayaRetribusi $biayaRetribusi)
    {
        $this->authorizeCreator($biayaRetribusi);

        return response()->json(['data' => $biayaRetribusi->load('details.biayaThlDetail.photos', 'documents')]);
    }

    public function update(Request $request, BiayaRetribusi $biayaRetribusi)
    {
        $this->authorizeCreator($biayaRetribusi);

        $validated = $request->validate([
            'tanggal_pengajuan' => 'required|date',
            'details' => 'required|array|min:1|max:20',
            'details.*.biaya_thl_id' => 'nullable|integer|exists:biaya_thls,id',
            'details.*.biaya_thl_detail_id' => 'nullable|integer|exists:biaya_thl_details,id',
            'details.*.nopol_kendaraan' => 'required|string|max:20',
            'details.*.type_kendaraan' => 'required|string|max:50',
            'details.*.no_surat_jalan' => 'nullable|string|max:50',
            'details.*.nominal_biaya' => 'required|numeric|min:0',
            'documents' => 'nullable|array',
            'documents.*.document_type' => 'string|max:50|in:BA,SJ,invoice,manifest,lainnya',
            'documents.*.file_path' => 'nullable|string|max:255',
            'documents.*.file_name' => 'nullable|string|max:255',
            'documents.*.mime_type' => 'nullable|string|max:100',
            'documents.*.file_size' => 'nullable|integer',
            'documents_remove' => 'nullable|array',
            'files' => 'nullable|array|max:20',
            'files.*' => 'mimes:pdf,jpg,jpeg,png,webp|max:5120',
        ]);

        $this->validateThlReferences($request, $validated['details']);

        $validated['nominal_biaya'] = collect($validated['details'])->sum('nominal_biaya');
        $validated['is_rfah_required'] = $validated['nominal_biaya'] > 1000000;
        if ($validated['is_rfah_required']) {
            $validated['rfah_name'] = 'Umi Marzuqoh';
        } else {
            $validated['rfah_name'] = null;
        }

        DB::transaction(function () use ($validated, $biayaRetribusi): void {
            $biayaRetribusi->update($validated);
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
                    'document_type' => 'lainnya',
                    'file_path' => $path,
                    'file_name' => $file->getClientOriginalName(),
                    'mime_type' => $file->getMimeType(),
                    'file_size' => $file->getSize(),
                    'order' => $index,
                ]);
            }
        });

        return response()->json(['message' => 'Biaya Retribusi updated', 'data' => $biayaRetribusi->load('details', 'documents')]);
    }

    public function destroy(BiayaRetribusi $biayaRetribusi)
    {
        $this->authorizeCreator($biayaRetribusi);
        foreach ($biayaRetribusi->documents as $doc) {
            Storage::disk('public')->delete($doc->file_path);
            $doc->delete();
        }
        $biayaRetribusi->details()->delete();
        $biayaRetribusi->delete();

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
        return response()->json(['message' => 'Pengajuan retribusi ditolak.', 'data' => $approvalService->reject($biayaRetribusi, $request->user(), $request)]);
    }

    public function revise(Request $request, BiayaRetribusi $biayaRetribusi, BiayaApprovalService $approvalService)
    {
        return response()->json(['message' => 'Pengajuan retribusi dikirim kembali untuk direvisi.', 'data' => $approvalService->revise($biayaRetribusi, $request->user(), $request)]);
    }

    public function pdf(BiayaRetribusi $biayaRetribusi)
    {
        $this->authorizeCreator($biayaRetribusi);

        $biayaRetribusi->load('details.biayaThlDetail.photos', 'documents', 'checkedBy', 'approvedBy', 'revisedBy');

        $deciderName = match ($biayaRetribusi->status) {
            'approved' => $biayaRetribusi->approvedBy?->full_name,
            'rejected' => $biayaRetribusi->rejectedBy?->full_name,
            'revisi' => $biayaRetribusi->revisedBy?->full_name,
            default => $biayaRetribusi->approvedBy?->full_name,
        };
        $approvalSections = app(ApprovalSectionResolver::class)->resolve($biayaRetribusi->kode_depo ?: '', $biayaRetribusi->approval_pengajuan, $biayaRetribusi->checkedBy?->full_name, $deciderName);

        $html = view('pdf.biaya_retribusi_combined', [
            'biayaRetribusi' => $biayaRetribusi,
            'approvalSections' => $approvalSections,
            'stamps' => $this->resolveStamps($biayaRetribusi),
        ])->render();

        $dompdf = new Dompdf;
        $dompdf->loadHtml($html);
        $dompdf->setPaper('A4', 'landscape');
        $dompdf->render();

        return response($dompdf->output(), 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'inline; filename="biaya_retribusi_'.$biayaRetribusi->id.'.pdf"',
        ]);
    }

    private function resolveStamps(BiayaRetribusi $biayaRetribusi): array
    {
        $stamps = [];

        if ($biayaRetribusi->status !== 'draft') {
            $stamps['Mengajukan'] = [
                'text' => 'PENGAJUAN',
                'color' => '#15803d',
                'date' => $biayaRetribusi->submitted_at?->format('d M Y'),
            ];
        }

        if ($biayaRetribusi->checked_at) {
            $stamps['Mengetahui'] = [
                'text' => 'DIPERIKSA',
                'color' => '#15803d',
                'date' => $biayaRetribusi->checked_at->format('d M Y'),
            ];
        }

        if ($biayaRetribusi->status === 'approved') {
            $stamps['Menyetujui'] = [
                'text' => 'DISETUJUI',
                'color' => '#15803d',
                'date' => $biayaRetribusi->approved_at?->format('d M Y'),
            ];
        } elseif ($biayaRetribusi->status === 'rejected') {
            $stamps['Menyetujui'] = [
                'text' => 'DITOLAK',
                'color' => '#dc2626',
                'date' => $biayaRetribusi->rejected_at?->format('d M Y'),
            ];
        } elseif ($biayaRetribusi->status === 'revisi') {
            $stamps['Menyetujui'] = [
                'text' => 'REVISI',
                'color' => '#d97706',
                'date' => $biayaRetribusi->revised_at?->format('d M Y'),
            ];
        }

        return $stamps;
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

    public function export(Request $request)
    {
        $query = BiayaRetribusi::query()->forUserDepot($request->user());
        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }
        $query->with('details');

        return Excel::download(new BiayaRetribusiExport($query), 'biaya_retribusi.xlsx');
    }

    private function authorizeCreator(BiayaRetribusi $biayaRetribusi): void
    {
        /** @var User|null $user */
        $user = Auth::user();
        if ($user && ($user->level === 'admin_master' || $user->hasRole('blc') || $user->hasRole('staff_logistic'))) {
            return;
        }
        abort_unless(
            $biayaRetribusi->created_by === $user?->id,
            403,
            'Anda tidak memiliki izin untuk mengubah data ini.'
        );
    }
}
