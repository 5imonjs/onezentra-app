<?php

namespace App\Http\Controllers\Api\V1;

use App\Exports\BiayaThlExport;
use App\Http\Controllers\Controller;
use App\Models\BiayaRetribusi;
use App\Models\BiayaRetribusiDetail;
use App\Models\BiayaThl;
use App\Models\User;
use App\Services\ApprovalSectionResolver;
use App\Services\BiayaApprovalService;
use Dompdf\Dompdf;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;
use Maatwebsite\Excel\Facades\Excel;

class BiayaThlController extends Controller
{
    public function index(Request $request)
    {
        $query = BiayaThl::query()->forUserDepot($request->user());
        if ($request->filled('search')) {
            $query->where(function ($q) use ($request) {
                $q->where('no_kendaraan', 'like', '%'.$request->search.'%')
                    ->orWhere('nama_depo', 'like', '%'.$request->search.'%')
                    ->orWhere('kode_depo', 'like', '%'.$request->search.'%');
            });
        }
        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }
        $data = $query->with('details.photos', 'photos', 'submittedBy', 'checkedBy', 'approvedBy', 'rejectedBy', 'revisedBy', 'createdBy')
            ->orderBy('created_at', 'desc')
            ->paginate($this->perPage($request, 50));

        return response()->json($data);
    }

    public function store(Request $request)
    {
        $validated = $this->validateThlRequest($request);

        foreach ($validated['details'] as &$detail) {
            $detail['kubikasi'] = (float) ($detail['kubikasi'] ?? 0);
            $detail['droppoint'] = (string) ($detail['droppoint'] ?? '0');

            if (strtoupper(trim((string) ($detail['posisi'] ?? ''))) === 'THL GUDANG') {
                $detail['kubikasi'] = 0;
                $detail['droppoint'] = '0';
            }
        }
        unset($detail);

        $validated['kubikasi_base'] = collect($validated['details'])->sum('kubikasi');
        $validated['nominal_biaya'] = collect($validated['details'])->sum('nominal_biaya');
        $validated['is_rfah_required'] = $validated['nominal_biaya'] > 750000;
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

        $firstDetail = $validated['details'][0] ?? [];
        $validated['no_kendaraan'] = $firstDetail['nopol_kendaraan'] ?? null;
        $validated['type_kendaraan'] = $firstDetail['type_kendaraan'] ?? null;
        $validated['no_surat_jalan'] = $firstDetail['no_surat_jalan'] ?? null;

        $biayaThl = DB::transaction(function () use ($validated) {
            $biayaThl = BiayaThl::create($validated);
            $this->storeThlDetails($biayaThl, $validated['details']);

            return $biayaThl;
        });

        return response()->json(['message' => 'Biaya THL created', 'data' => $biayaThl->load('details.photos', 'photos')], 201);
    }

    public function show(BiayaThl $biayaThl)
    {
        $this->authorizeCreator($biayaThl);

        return response()->json(['data' => $biayaThl->load('details.photos', 'photos')]);
    }

    public function update(Request $request, BiayaThl $biayaThl)
    {
        $this->authorizeCreator($biayaThl);

        $validated = $this->validateThlRequest($request, true);

        foreach ($validated['details'] as &$detail) {
            $detail['kubikasi'] = (float) ($detail['kubikasi'] ?? 0);
            $detail['droppoint'] = (string) ($detail['droppoint'] ?? '0');

            if (strtoupper(trim((string) ($detail['posisi'] ?? ''))) === 'THL GUDANG') {
                $detail['kubikasi'] = 0;
                $detail['droppoint'] = '0';
            }
        }
        unset($detail);

        $validated['kubikasi_base'] = collect($validated['details'])->sum('kubikasi');
        $validated['nominal_biaya'] = collect($validated['details'])->sum('nominal_biaya');
        $validated['is_rfah_required'] = $validated['nominal_biaya'] > 750000;
        if ($validated['is_rfah_required']) {
            $validated['rfah_name'] = 'Umi Marzuqoh';
        } else {
            $validated['rfah_name'] = null;
        }

        $firstDetail = $validated['details'][0] ?? [];
        $validated['no_kendaraan'] = $firstDetail['nopol_kendaraan'] ?? null;
        $validated['type_kendaraan'] = $firstDetail['type_kendaraan'] ?? null;
        $validated['no_surat_jalan'] = $firstDetail['no_surat_jalan'] ?? null;

        DB::transaction(function () use ($validated, $biayaThl): void {
            $biayaThl->update($validated);
            $biayaThl->details()->delete();
            $this->storeThlDetails($biayaThl, $validated['details']);
        });

        return response()->json(['message' => 'Biaya THL updated', 'data' => $biayaThl->load('details.photos', 'photos')]);
    }

    public function destroy(BiayaThl $biayaThl)
    {
        $this->authorizeCreator($biayaThl);
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
        return response()->json(['message' => 'Pengajuan THL ditolak.', 'data' => $approvalService->reject($biayaThl, $request->user(), $request)]);
    }

    public function revise(Request $request, BiayaThl $biayaThl, BiayaApprovalService $approvalService)
    {
        return response()->json(['message' => 'Pengajuan THL dikirim kembali untuk direvisi.', 'data' => $approvalService->revise($biayaThl, $request->user(), $request)]);
    }

    public function pdf(BiayaThl $biayaThl)
    {
        $this->authorizeCreator($biayaThl);

        $biayaThl->load('details.photos', 'photos', 'checkedBy', 'approvedBy', 'revisedBy');

        $deciderName = match ($biayaThl->status) {
            'approved' => $biayaThl->approvedBy?->full_name,
            'rejected' => $biayaThl->rejectedBy?->full_name,
            'revisi' => $biayaThl->revisedBy?->full_name,
            default => $biayaThl->approvedBy?->full_name,
        };
        $approvalSections = app(ApprovalSectionResolver::class)->resolve($biayaThl->kode_depo ?: '', $biayaThl->approval_pengajuan, $biayaThl->checkedBy?->full_name, $deciderName);
        $retribusi = new BiayaRetribusi([
            'tanggal_pengajuan' => $biayaThl->tanggal_pengajuan,
            'kode_depo' => $biayaThl->kode_depo,
            'nama_depo' => $biayaThl->nama_depo,
            'nominal_biaya' => $biayaThl->nominal_biaya,
            'is_rfah_required' => $biayaThl->is_rfah_required,
            'rfah_name' => $biayaThl->rfah_name,
            'approval_pengajuan' => $biayaThl->approval_pengajuan,
            'approval_pengajuan_level' => $biayaThl->approval_pengajuan_level,
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

    private function resolveStamps(BiayaThl $biayaThl): array
    {
        $stamps = [];

        if ($biayaThl->status !== 'draft') {
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

        if ($biayaThl->status === 'approved') {
            $stamps['Menyetujui'] = [
                'text' => 'DISETUJUI',
                'color' => '#15803d',
                'date' => $biayaThl->approved_at?->format('d M Y'),
            ];
        } elseif ($biayaThl->status === 'rejected') {
            $stamps['Menyetujui'] = [
                'text' => 'DITOLAK',
                'color' => '#dc2626',
                'date' => $biayaThl->rejected_at?->format('d M Y'),
            ];
        } elseif ($biayaThl->status === 'revisi') {
            $stamps['Menyetujui'] = [
                'text' => 'REVISI',
                'color' => '#d97706',
                'date' => $biayaThl->revised_at?->format('d M Y'),
            ];
        }

        return $stamps;
    }

    private function validateThlRequest(Request $request, bool $isUpdate = false): array
    {
        $rules = [
            'tanggal_pengajuan' => 'required|date',
            'kubikasi_base' => 'nullable|numeric|min:0',
            'details' => 'required|array|min:1|max:20',
            'details.*.no_surat_jalan' => 'nullable|string|max:50',
            'details.*.nama_thl' => 'required|string|max:150',
            'details.*.driver_name' => 'nullable|string|max:150',
            'details.*.nopol_kendaraan' => 'required|string|max:20',
            'details.*.type_kendaraan' => 'required|string|max:50',
            'details.*.nominal_biaya' => 'required|numeric|min:0',
            'details.*.kubikasi' => 'nullable|numeric|min:0',
            'details.*.droppoint' => 'nullable|string|max:100',
            'details.*.posisi' => 'required|string|in:THL HELPER,THL DRIVER,THL GUDANG',
            'details.*.jam_datang' => 'nullable|date',
            'details.*.jam_pulang' => 'nullable|date',
            'details.*.kendaraan_tambahan' => 'nullable|boolean',
            'details.*.order' => 'nullable|integer',
            'details.*.photos' => 'nullable|array|max:1',
            'details.*.photos.*' => 'image|mimes:jpg,jpeg,png,gif|max:2048',
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
                    foreach (['no_surat_jalan', 'nopol_kendaraan', 'type_kendaraan'] as $field) {
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
        $query->with('details.photos');

        return Excel::download(new BiayaThlExport($query), 'biaya_thl.xlsx');
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
}
