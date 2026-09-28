<?php

namespace App\Http\Controllers\Api\V1;

use App\Exports\BiayaRetribusiReportExport;
use App\Exports\BiayaThlReportExport;
use App\Exports\PenerimaanExport;
use App\Exports\RencanaKirimReportExport;
use App\Exports\SelisihQtyExport;
use App\Http\Controllers\Controller;
use App\Models\BiayaRetribusiDetail;
use App\Models\BiayaThlDetail;
use App\Models\ReceivingItem;
use App\Models\RencanaKirim;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Maatwebsite\Excel\Facades\Excel;

class ReportController extends Controller
{
    public function selisihQty(Request $request): JsonResponse
    {
        $request->validate([
            'date_from' => 'nullable|date',
            'date_to' => 'nullable|date',
            'kode_depo' => 'nullable|string|max:20',
        ]);

        $query = ReceivingItem::with(['receiving.rencanaKirim', 'validator'])
            ->whereNotNull('selisih_qty')
            ->where('selisih_qty', '!=', 0);

        if ($request->user()->isDepotScoped()) {
            $query->whereHas('receiving.rencanaKirim', fn ($q) => $q->forUserDepot($request->user()));
        }

        if ($request->date_from) {
            $query->whereHas('receiving', fn ($q) => $q->whereDate('created_at', '>=', $request->date_from));
        }
        if ($request->date_to) {
            $query->whereHas('receiving', fn ($q) => $q->whereDate('created_at', '<=', $request->date_to));
        }
        if ($request->kode_depo) {
            $query->whereHas('receiving.rencanaKirim', fn ($q) => $q->where('kode_depo', $request->kode_depo));
        }

        $items = $query->orderByDesc('receiving_items.created_at')->get();

        $data = $items->map(function ($item) {
            $rk = $item->receiving->rencanaKirim;

            return [
                'id' => $item->id,
                'created_at' => $item->created_at->format('Y-m-d H:i'),
                'po_transporter' => $rk->po_transporter ?? '-',
                'kode_barang' => $item->kode_barang,
                'nama_barang' => $item->nama_barang,
                'expected_qty' => (float) $item->expected_qty,
                'actual_qty' => (float) $item->actual_qty,
                'selisih_qty' => (float) $item->selisih_qty,
                'selisih_reason' => $item->selisih_reason ?? '-',
                'notes' => $item->notes ?? '-',
                'condition' => $item->condition ?? '-',
                'validator_name' => $item->validator->full_name ?? '-',
            ];
        });

        $summary = $this->selisihQtySummary($query);

        return response()->json(['data' => $data, 'summary' => $summary]);
    }

    /**
     * Ringkasan selisih via agregasi SQL — tanpa memuat seluruh baris.
     *
     * @param  Builder  $query
     */
    private function selisihQtySummary($query): array
    {
        $agg = (clone $query)->toBase()->selectRaw(
            'COUNT(*) as c, COALESCE(SUM(selisih_qty), 0) as s,'
            .' SUM(CASE WHEN selisih_qty < 0 THEN 1 ELSE 0 END) as kurang,'
            .' SUM(CASE WHEN selisih_qty > 0 THEN 1 ELSE 0 END) as lebih'
        )->first();

        return [
            'total_item' => (int) $agg->c,
            'total_selisih' => (float) $agg->s,
            'item_kurang' => (int) $agg->kurang,
            'item_lebih' => (int) $agg->lebih,
        ];
    }

    public function selisihQtyExport(Request $request)
    {
        $request->validate([
            'date_from' => 'nullable|date',
            'date_to' => 'nullable|date',
            'kode_depo' => 'nullable|string|max:20',
        ]);

        $filename = 'laporan-selisih-qty_'.date('Y-m-d_His').'.xlsx';

        return Excel::download(
            new SelisihQtyExport($request->date_from, $request->date_to, $request->kode_depo, $request->user()),
            $filename
        );
    }

    public function rencanaKirim(Request $request): JsonResponse
    {
        $this->validateRencanaKirimRequest($request);

        $query = $this->rencanaKirimQuery($request);
        // Ringkasan selalu dihitung dari SELURUH baris terfilter via agregasi
        // SQL — bukan hanya halaman aktif, dan tanpa memuat seluruh tabel.
        $statusCountsRaw = (clone $query)->toBase()
            ->selectRaw('status, COUNT(*) as c')
            ->groupBy('status')
            ->pluck('c', 'status');
        $headerIds = (clone $query)->toBase()->select('rencana_kirim.id');
        $totalKubikasi = (float) DB::table('rencana_kirim_items as i')
            ->join('npn as n', 'n.id', '=', 'i.npn_id')
            ->whereIn('i.rencana_kirim_id', $headerIds)
            ->selectRaw('COALESCE(SUM(ROUND(COALESCE(i.jumlah, 0) * COALESCE(n.decVolume, 0) * COALESCE(CAST(n.SAPdecUom AS DOUBLE), 0) / 1000000, 4)), 0) as k')
            ->value('k');

        $perPage = min(max((int) $request->input('per_page', 25), 1), 100);
        $paginated = $query->paginate($perPage);
        $data = $paginated->getCollection()->map(fn (RencanaKirim $rk) => $this->rencanaKirimRow($rk));

        $statusLabels = [
            'DRAFT' => 'Draft',
            'SCHEDULED' => 'Dijadwalkan',
            'CHECKED_IN' => 'Check In',
            'VERIFIED' => 'Terverifikasi',
            'IN_PROGRESS' => 'Diproses',
            'COMPLETED' => 'Selesai',
            'CANCELLED' => 'Dibatalkan',
        ];

        $statusCounts = [];
        foreach ($statusLabels as $status => $label) {
            $statusCounts[$status] = [
                'count' => (int) ($statusCountsRaw[$status] ?? 0),
                'label' => $label,
            ];
        }

        $summary = [
            'total' => (int) (clone $query)->toBase()->count(),
            'total_qty' => (int) (clone $query)->sum('total_qty'),
            'total_kubikasi' => round($totalKubikasi, 2),
            'completed_count' => (int) ($statusCountsRaw['COMPLETED'] ?? 0),
            'cancelled_count' => (int) ($statusCountsRaw['CANCELLED'] ?? 0),
            'status_counts' => $statusCounts,
        ];

        return response()->json([
            'current_page' => $paginated->currentPage(),
            'last_page' => $paginated->lastPage(),
            'per_page' => $paginated->perPage(),
            'total' => $paginated->total(),
            'data' => $data->values(),
            'summary' => $summary,
        ]);
    }

    public function rencanaKirimExport(Request $request)
    {
        $this->validateRencanaKirimRequest($request);

        $filename = 'laporan-rencana-kirim_'.date('Y-m-d_His').'.xlsx';

        return Excel::download(
            new RencanaKirimReportExport(
                $request->date_from,
                $request->date_to,
                $request->status,
                $request->kode_depo,
                $request->search,
                $request->user(),
            ),
            $filename
        );
    }

    private function validateRencanaKirimRequest(Request $request): void
    {
        $request->validate([
            'date_from' => 'nullable|date',
            'date_to' => 'nullable|date',
            'status' => 'nullable|string|in:DRAFT,SCHEDULED,CHECKED_IN,VERIFIED,IN_PROGRESS,COMPLETED,CANCELLED',
            'kode_depo' => 'nullable|string|max:20',
            'search' => 'nullable|string|max:200',
            'page' => 'nullable|integer|min:1',
            'per_page' => 'nullable|integer|min:1|max:100',
        ]);
    }

    private function rencanaKirimQuery(Request $request)
    {
        $query = RencanaKirim::query()->with(['items.npn']);

        return RencanaKirimReportExport::applyFilters($query, $request->date_from, $request->date_to, $request->status, $request->kode_depo, $request->search, $request->user())
            ->orderByDesc('rkh_date')
            ->orderByDesc('id');
    }

    private function rencanaKirimRow(RencanaKirim $rk): array
    {
        $this->attachKubikasiToItems($rk);

        return [
            'id' => $rk->id,
            'rkh_date' => $rk->rkh_date?->toDateString(),
            'po_transporter' => $rk->po_transporter ?? '-',
            'driver_name' => $rk->driver_name ?? '-',
            'nopol' => $rk->nopol ?? '-',
            'expedisi' => $rk->expedisi ?? '-',
            'jenis_kendaraan' => $rk->jenis_kendaraan ?? '-',
            'destination_name' => $rk->destination_name ?? '-',
            'kode_depo' => $rk->kode_depo ?? '-',
            'nama_depo' => $rk->nama_depo ?? '-',
            'total_qty' => (float) $rk->total_qty,
            'total_kubikasi' => round($rk->items->sum(fn ($item) => (float) ($item->kubikasi ?? 0)), 2),
            'item_count' => $rk->items->count(),
            'status' => $rk->status,
        ];
    }

    /**
     * Lampirkan kubikasi transient per item (jumlah x decVolume x SAPdecUom / 1.000.000 m³)
     * — rumus sama dengan RencanaKirimController::attachKubikasi.
     */
    private function attachKubikasiToItems(RencanaKirim $rk): void
    {
        foreach ($rk->items as $item) {
            $volume = $item->npn?->decVolume;
            $uom = $item->npn?->SAPdecUom;
            $item->kubikasi = ($volume !== null && $uom !== null)
                ? round(((float) $item->jumlah) * ((float) $volume) * ((float) $uom) / 1_000_000, 4)
                : null;
        }
    }

    public function penerimaan(Request $request): JsonResponse
    {
        $this->validatePenerimaanRequest($request);

        $query = $this->penerimaanQuery($request);
        // Ringkasan selalu dihitung dari SELURUH baris terfilter via agregasi
        // SQL — bukan hanya halaman aktif, dan tanpa memuat seluruh tabel.
        $agg = (clone $query)->toBase()->selectRaw(
            'COUNT(*) as c, COALESCE(SUM(actual_qty), 0) as crt, COALESCE(SUM(qty_pcs), 0) as pcs,'
            .' COALESCE(SUM(selisih_qty), 0) as s,'
            .' SUM(CASE WHEN source = ? THEN 1 ELSE 0 END) as sj,'
            .' SUM(CASE WHEN source = ? THEN 1 ELSE 0 END) as manual',
            [ReceivingItem::SOURCE_VALIDASI, ReceivingItem::SOURCE_IMPORT]
        )->first();

        $perPage = min(max((int) $request->input('per_page', 25), 1), 100);
        $paginated = $query->paginate($perPage);
        $data = $paginated->getCollection()->map(fn (ReceivingItem $item) => $this->penerimaanRow($item));

        $summary = [
            'total_item' => (int) $agg->c,
            'total_qty_crt' => (float) $agg->crt,
            'total_qty_pcs' => (float) $agg->pcs,
            'item_sj' => (int) $agg->sj,
            'item_manual' => (int) $agg->manual,
            'total_selisih' => (float) $agg->s,
        ];

        return response()->json([
            'current_page' => $paginated->currentPage(),
            'last_page' => $paginated->lastPage(),
            'per_page' => $paginated->perPage(),
            'total' => $paginated->total(),
            'data' => $data->values(),
            'summary' => $summary,
        ]);
    }

    public function penerimaanExport(Request $request)
    {
        $this->validatePenerimaanRequest($request);

        $filename = 'laporan-penerimaan_'.date('Y-m-d_His').'.xlsx';

        return Excel::download(new PenerimaanExport($this->penerimaanQuery($request)), $filename);
    }

    public function biayaThl(Request $request): JsonResponse
    {
        $this->validateBiayaRequest($request);

        $query = $this->biayaThlQuery($request);
        // Ringkasan selalu dihitung dari SELURUH baris terfilter via agregasi
        // SQL — bukan hanya halaman aktif, dan tanpa memuat seluruh tabel.
        $agg = (clone $query)->toBase()->selectRaw(
            'COUNT(*) as c, COUNT(DISTINCT biaya_thl_id) as p, COALESCE(SUM(nominal_biaya), 0) as n,'
            ." COUNT(DISTINCT CASE WHEN nama_thl IS NOT NULL AND nama_thl != '' THEN nama_thl END) as t"
        )->first();

        $perPage = min(max((int) $request->input('per_page', 25), 1), 100);
        $paginated = $query->paginate($perPage);
        $data = $paginated->getCollection()->map(fn (BiayaThlDetail $detail) => $this->biayaThlRow($detail));

        $summary = [
            'total_pengajuan' => (int) $agg->p,
            'total_detail' => (int) $agg->c,
            'total_nominal' => (float) $agg->n,
            'total_tenaga_kerja' => (int) $agg->t,
        ];

        return response()->json([
            'current_page' => $paginated->currentPage(),
            'last_page' => $paginated->lastPage(),
            'per_page' => $paginated->perPage(),
            'total' => $paginated->total(),
            'data' => $data->values(),
            'summary' => $summary,
        ]);
    }

    public function biayaThlExport(Request $request)
    {
        $this->validateBiayaRequest($request);

        $filename = 'laporan-biaya-thl_'.date('Y-m-d_His').'.xlsx';

        return Excel::download(new BiayaThlReportExport($this->biayaThlQuery($request)), $filename);
    }

    public function biayaRetribusi(Request $request): JsonResponse
    {
        $this->validateBiayaRequest($request);

        $query = $this->biayaRetribusiQuery($request);
        // Ringkasan selalu dihitung dari SELURUH baris terfilter via agregasi
        // SQL — bukan hanya halaman aktif, dan tanpa memuat seluruh tabel.
        $agg = (clone $query)->toBase()->selectRaw(
            'COUNT(*) as c, COUNT(DISTINCT biaya_retribusi_id) as p, COALESCE(SUM(nominal_biaya), 0) as n'
        )->first();

        $perPage = min(max((int) $request->input('per_page', 25), 1), 100);
        $paginated = $query->paginate($perPage);
        $data = $paginated->getCollection()->map(fn (BiayaRetribusiDetail $detail) => $this->biayaRetribusiRow($detail));

        $summary = [
            'total_pengajuan' => (int) $agg->p,
            'total_detail' => (int) $agg->c,
            'total_nominal' => (float) $agg->n,
        ];

        return response()->json([
            'current_page' => $paginated->currentPage(),
            'last_page' => $paginated->lastPage(),
            'per_page' => $paginated->perPage(),
            'total' => $paginated->total(),
            'data' => $data->values(),
            'summary' => $summary,
        ]);
    }

    public function biayaRetribusiExport(Request $request)
    {
        $this->validateBiayaRequest($request);

        $filename = 'laporan-biaya-retribusi_'.date('Y-m-d_His').'.xlsx';

        return Excel::download(new BiayaRetribusiReportExport($this->biayaRetribusiQuery($request)), $filename);
    }

    private function validateBiayaRequest(Request $request): void
    {
        $request->validate([
            'tanggal_from' => 'nullable|date',
            'tanggal_to' => 'nullable|date',
            'kode_depo' => 'nullable|string|max:20',
            'status' => 'nullable|string|in:draft,pending,checked,rlh_approved,approved,rejected,revisi',
            'search' => 'nullable|string|max:200',
            'page' => 'nullable|integer|min:1',
            'per_page' => 'nullable|integer|min:1|max:100',
        ]);
    }

    private function biayaThlQuery(Request $request)
    {
        $query = BiayaThlDetail::query()->with('biayaThl');

        if ($request->tanggal_from) {
            $query->whereHas('biayaThl', fn ($q) => $q->whereDate('tanggal_pengajuan', '>=', $request->tanggal_from));
        }
        if ($request->tanggal_to) {
            $query->whereHas('biayaThl', fn ($q) => $q->whereDate('tanggal_pengajuan', '<=', $request->tanggal_to));
        }

        if ($request->user()->isDepotScoped()) {
            $query->whereHas('biayaThl', fn ($q) => $q->forUserDepot($request->user()));
        } elseif ($request->kode_depo) {
            $query->whereHas('biayaThl', fn ($q) => $q->where('kode_depo', $request->kode_depo));
        }

        if ($request->status) {
            $query->whereHas('biayaThl', fn ($q) => $q->where('status', $request->status));
        }

        if ($request->search) {
            $like = "%{$request->search}%";
            $query->where(fn ($q) => $q
                ->where('nama_thl', 'like', $like)
                ->orWhere('no_surat_jalan', 'like', $like)
                ->orWhere('nopol_kendaraan', 'like', $like)
                ->orWhere('type_kendaraan', 'like', $like)
                ->orWhereHas('biayaThl', fn ($r) => $r
                    ->where('nama_depo', 'like', $like)
                    ->orWhere('kode_depo', 'like', $like)));
        }

        $query->orderByDesc('biaya_thl_details.id');

        return $query;
    }

    private function biayaThlRow(BiayaThlDetail $detail): array
    {
        $parent = $detail->biayaThl;

        return [
            'id' => $detail->id,
            'tanggal_pengajuan' => $parent?->tanggal_pengajuan?->toDateString() ?: '-',
            'kode_depo' => $parent?->kode_depo ?? '-',
            'nama_depo' => $parent?->nama_depo ?? '-',
            'no_surat_jalan' => $detail->no_surat_jalan ?? '-',
            'nama_thl' => $detail->nama_thl ?? '-',
            'posisi' => $detail->posisi ?? '-',
            'nopol_kendaraan' => $detail->nopol_kendaraan ?? '-',
            'type_kendaraan' => $detail->type_kendaraan ?? '-',
            'droppoint' => $detail->droppoint ?? '-',
            'kubikasi' => (float) ($detail->kubikasi ?? 0),
            'nominal_biaya' => (float) ($detail->nominal_biaya ?? 0),
            'status' => $parent?->status ?? '-',
        ];
    }

    private function biayaRetribusiQuery(Request $request)
    {
        $query = BiayaRetribusiDetail::query()->with('biayaRetribusi');

        if ($request->tanggal_from) {
            $query->whereHas('biayaRetribusi', fn ($q) => $q->whereDate('tanggal_pengajuan', '>=', $request->tanggal_from));
        }
        if ($request->tanggal_to) {
            $query->whereHas('biayaRetribusi', fn ($q) => $q->whereDate('tanggal_pengajuan', '<=', $request->tanggal_to));
        }

        if ($request->user()->isDepotScoped()) {
            $query->whereHas('biayaRetribusi', fn ($q) => $q->forUserDepot($request->user()));
        } elseif ($request->kode_depo) {
            $query->whereHas('biayaRetribusi', fn ($q) => $q->where('kode_depo', $request->kode_depo));
        }

        if ($request->status) {
            $query->whereHas('biayaRetribusi', fn ($q) => $q->where('status', $request->status));
        }

        if ($request->search) {
            $like = "%{$request->search}%";
            $query->where(fn ($q) => $q
                ->where('no_surat_jalan', 'like', $like)
                ->orWhere('nopol_kendaraan', 'like', $like)
                ->orWhere('type_kendaraan', 'like', $like)
                ->orWhereHas('biayaRetribusi', fn ($r) => $r
                    ->where('nama_depo', 'like', $like)
                    ->orWhere('kode_depo', 'like', $like)));
        }

        $query->orderByDesc('biaya_retribusi_details.id');

        return $query;
    }

    private function biayaRetribusiRow(BiayaRetribusiDetail $detail): array
    {
        $parent = $detail->biayaRetribusi;

        return [
            'id' => $detail->id,
            'tanggal_pengajuan' => $parent?->tanggal_pengajuan?->toDateString() ?: '-',
            'kode_depo' => $parent?->kode_depo ?? '-',
            'nama_depo' => $parent?->nama_depo ?? '-',
            'no_surat_jalan' => $detail->no_surat_jalan ?? '-',
            'nopol_kendaraan' => $detail->nopol_kendaraan ?? '-',
            'type_kendaraan' => $detail->type_kendaraan ?? '-',
            'qty_zak' => (float) ($detail->qty_zak ?? 0),
            'qty_crt' => (float) ($detail->qty_crt ?? 0),
            'nominal_biaya' => (float) ($detail->nominal_biaya ?? 0),
            'status' => $parent?->status ?? '-',
        ];
    }

    private function validatePenerimaanRequest(Request $request): void
    {
        $request->validate([
            'tanggal_from' => 'nullable|date',
            'tanggal_to' => 'nullable|date',
            'kode_depo' => 'nullable|string|max:20',
            'sumber' => 'nullable|string|in:VALIDASI_SJ,IMPORT_MANUAL',
            'search' => 'nullable|string|max:200',
            'page' => 'nullable|integer|min:1',
            'per_page' => 'nullable|integer|min:1|max:100',
        ]);
    }

    private function penerimaanQuery(Request $request)
    {
        $query = ReceivingItem::query()
            ->with(['receiving.rencanaKirim'])
            ->whereNotNull('kode_barang');

        if ($request->user()->isDepotScoped()) {
            $query->where(fn ($q) => $q
                ->where('kode_depo', $request->user()->kode_depo)
                ->orWhereHas('receiving.rencanaKirim', fn ($r) => $r->forUserDepot($request->user())));
        }

        if ($request->tanggal_from || $request->tanggal_to) {
            $query->where(function ($q) use ($request) {
                if ($request->tanggal_from) {
                    $q->whereRaw('COALESCE(tanggal_penerimaan, DATE(scan_time), DATE(created_at)) >= ?', [$request->tanggal_from]);
                }
                if ($request->tanggal_to) {
                    $q->whereRaw('COALESCE(tanggal_penerimaan, DATE(scan_time), DATE(created_at)) <= ?', [$request->tanggal_to]);
                }
            });
        }

        if ($request->kode_depo && ! $request->user()->isDepotScoped()) {
            $query->where('kode_depo', $request->kode_depo);
        }

        if ($request->sumber) {
            $query->where('source', $request->sumber);
        }

        if ($request->search) {
            $like = "%{$request->search}%";
            $query->where(fn ($q) => $q
                ->where('kode_barang', 'like', $like)
                ->orWhere('nama_barang', 'like', $like)
                ->orWhere('sumber_material', 'like', $like)
                ->orWhereHas('receiving.rencanaKirim', fn ($r) => $r
                    ->where('po_transporter', 'like', $like)
                    ->orWhere('shipper_name', 'like', $like)
                    ->orWhere('driver_name', 'like', $like)));
        }

        $query->orderByDesc('tanggal_penerimaan')->orderByDesc('receiving_items.id');

        return $query;
    }

    private function penerimaanRow(ReceivingItem $item): array
    {
        $rk = $item->receiving?->rencanaKirim;

        return [
            'id' => $item->id,
            'tanggal_penerimaan' => $item->tanggal_penerimaan ?: $item->created_at?->toDateString(),
            'kode_depo' => $item->getKodeDepoFallback() ?: '-',
            'nama_depo' => $item->getNamaDepoFallback() ?: '-',
            'sumber_material' => $item->getSumberMaterialFallback() ?: '-',
            'po_transporter' => $rk->po_transporter ?? '-',
            'driver_name' => $rk->driver_name ?? '-',
            'kode_barang' => $item->kode_barang,
            'nama_barang' => $item->nama_barang ?: $item->kode_barang,
            'qty_crt' => (float) $item->actual_qty,
            'qty_pcs' => (float) ($item->qty_pcs ?? 0),
            'satuan' => $item->satuan ?? '-',
            'expired_date' => $item->expired_date?->toDateString() ?: '-',
            'condition' => $item->condition ?? '-',
            'selisih_qty' => (float) ($item->selisih_qty ?: 0),
            'selisih_reason' => $item->selisih_reason ?? '-',
            'notes' => $item->notes ?? '-',
            'sumber' => $item->source,
        ];
    }
}
