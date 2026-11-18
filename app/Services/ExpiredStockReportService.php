<?php

namespace App\Services;

use App\Exports\OpnameExpiredExport;
use App\Exports\PenerimaanExpiredReportExport;
use App\Models\OpnameExpiredWave;
use App\Models\User;
use App\Support\LikePattern;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Query\Builder as QueryBuilder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Maatwebsite\Excel\Facades\Excel;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

/**
 * Satu read-model untuk dua tahap pengendalian stok kedaluwarsa.
 *
 * Tidak ada tabel baru: `receiving_items` tetap ledger kanonik, sedangkan
 * `opname_expired_waves` + `opname_expired_adjustments` adalah snapshot dan
 * ledger koreksi turunannya. Service ini hanya menyatukan kedua bentuk itu ke
 * SATU skema baris supaya satu endpoint dan satu halaman bisa melayani keduanya.
 *
 * Dua grain sengaja dibawa sebagai kolom `grain`:
 * - `ledger`: satu baris = satu baris penerimaan, qty mentah.
 * - `wave`: satu baris = produk × depo × expired × minggu, qty efektif.
 * Kolom yang tidak berlaku pada suatu grain bernilai null; karenanya qty tidak
 * boleh dijumlahkan lintas grain.
 */
class ExpiredStockReportService
{
    public const GRAIN_LEDGER = 'ledger';

    public const GRAIN_WAVE = 'wave';

    public const WAVE_STATUSES = ['EXPIRED', 'KRITIS', 'PERHATIAN', 'AMAN'];

    /**
     * @return array<string, mixed>
     */
    public static function validate(Request $request): array
    {
        $validated = $request->validate([
            'tanggal_from' => 'nullable|date',
            'tanggal_to' => 'nullable|date',
            'kode_depo' => 'nullable|string|max:20',
            'cluster' => 'nullable|string|max:255',
            'status' => 'nullable|string|max:30',
            'search' => 'nullable|string|max:200',
            'grain' => 'nullable|string|in:'.self::GRAIN_LEDGER.','.self::GRAIN_WAVE,
            'page' => 'nullable|integer|min:1',
            'per_page' => 'nullable|integer|min:1|max:100',
        ]);

        return array_intersect_key($validated, array_flip([
            'tanggal_from', 'tanggal_to', 'kode_depo', 'cluster', 'status', 'search', 'grain', 'page', 'per_page',
        ]));
    }

    /**
     * @param  array<string, mixed>  $filters
     */
    public static function grain(array $filters): string
    {
        return $filters['grain'] ?? self::GRAIN_LEDGER;
    }

    /**
     * @param  array<string, mixed>  $filters
     * @return array{data: array<int, array<string, mixed>>, current_page: int, last_page: int, per_page: int, total: int, summary: array<string, mixed>, meta: array<string, mixed>}
     */
    public static function paginate(array $filters, ?User $user = null): array
    {
        $grain = self::grain($filters);
        self::validateStatusForGrain($grain, $filters['status'] ?? null);

        $perPage = min(max((int) ($filters['per_page'] ?? 25), 1), 100);
        $paginator = $grain === self::GRAIN_WAVE
            ? self::waveQuery($filters, $user)->paginate($perPage)
            : PenerimaanExpiredReportService::query($filters, $user)->paginate($perPage);

        $no = ($paginator->currentPage() - 1) * $paginator->perPage();
        $data = $paginator->getCollection()->map(function ($row) use ($grain, &$no) {
            return $grain === self::GRAIN_WAVE
                ? self::fromWave($row)
                : self::fromLedger(PenerimaanExpiredReportService::row($row, ++$no));
        })->values()->all();

        return [
            'data' => $data,
            'current_page' => $paginator->currentPage(),
            'last_page' => $paginator->lastPage(),
            'per_page' => $paginator->perPage(),
            'total' => $paginator->total(),
            'summary' => self::summary($filters, $user),
            'meta' => [
                'grain' => $grain,
                'qty_sumber' => $grain === self::GRAIN_WAVE ? 'efektif' : 'mentah',
                'status_options' => $grain === self::GRAIN_WAVE
                    ? self::WAVE_STATUSES
                    : [PenerimaanExpiredReportService::STATUS_EXPIRED, PenerimaanExpiredReportService::STATUS_FUTURE],
                'cluster_options' => $grain === self::GRAIN_WAVE ? [] : PenerimaanExpiredReportService::clusterOptions(),
            ],
        ];
    }

    /**
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    public static function summary(array $filters, ?User $user = null): array
    {
        if (self::grain($filters) === self::GRAIN_LEDGER) {
            return PenerimaanExpiredReportService::summary($filters, $user);
        }

        $agg = self::summaryQuery($filters, $user)->first();

        return [
            'total_item' => (int) $agg->c,
            'total_qty_crt' => (float) $agg->crt,
            'total_qty_pcs' => (float) $agg->pcs,
            'total_koreksi' => (float) $agg->koreksi,
        ];
    }

    /**
     * Query ringkasan wave. `waveQuery()` membawa `opname_expired_waves.*`
     * dan dua ekspresi principal; keduanya WAJIB dibuang sebelum agregat,
     * kalau tidak MySQL ONLY_FULL_GROUP_BY menolak dengan error 1140.
     * SQLite (test) mengizinkan, jadi ini perlu dijaga lewat test SQL.
     *
     * @param  array<string, mixed>  $filters
     */
    public static function summaryQuery(array $filters, ?User $user = null): QueryBuilder
    {
        return (clone self::waveQuery($filters, $user))
            ->reorder()
            ->toBase()
            ->select([])
            ->selectRaw('COUNT(*) as c, COALESCE(SUM(qty_ini_crt), 0) as crt, COALESCE(SUM(qty_ini_pcs), 0) as pcs, COALESCE(SUM(qty_koreksi_crt), 0) as koreksi');
    }

    /**
     * @param  array<string, mixed>  $filters
     */
    public static function waveQuery(array $filters, ?User $user = null): Builder
    {
        $query = OpnameExpiredWave::query()
            ->select('opname_expired_waves.*')
            ->addSelect(DB::raw('COALESCE(cp.principal_1, cp_nick_new.principal_1, cp_nick_old.principal_1, cp_sku.principal_1) as principal_1'))
            ->addSelect(DB::raw('COALESCE(cp.principal_2, cp_nick_new.principal_2, cp_nick_old.principal_2, cp_sku.principal_2) as principal_2'))
            ->leftJoin('npn', 'npn.BOSnetszProductId', '=', 'opname_expired_waves.kode_barang')
            ->leftJoinSub(
                DB::table('cluster_principal')->selectRaw('bosnetsz_product_id, MIN(id) as id')->whereNotNull('bosnetsz_product_id')->groupBy('bosnetsz_product_id'),
                'cp_ids',
                'cp_ids.bosnetsz_product_id',
                '=',
                'opname_expired_waves.kode_barang'
            )
            ->leftJoin('cluster_principal as cp', 'cp.id', '=', 'cp_ids.id')
            ->leftJoin('cluster_principal as cp_nick_new', 'cp_nick_new.product_sku', '=', 'npn.szNickNameNew')
            ->leftJoin('cluster_principal as cp_nick_old', function ($join): void {
                $join->on('cp_nick_old.product_sku', '=', 'npn.szNickName')->whereNull('cp_nick_new.id');
            })
            ->leftJoin('cluster_principal as cp_sku', 'cp_sku.product_sku', '=', 'opname_expired_waves.kode_barang');

        if ($user?->isDepotScoped()) {
            $user->applyDepotFilter($query, 'opname_expired_waves.kode_depo');
        } elseif (! empty($filters['kode_depo'])) {
            $query->where('opname_expired_waves.kode_depo', $filters['kode_depo']);
        }

        if (! empty($filters['tanggal_from'])) {
            $query->where('opname_expired_waves.week_end', '>=', $filters['tanggal_from']);
        }
        if (! empty($filters['tanggal_to'])) {
            $query->where('opname_expired_waves.week_start', '<=', $filters['tanggal_to']);
        }
        if (! empty($filters['status'])) {
            $query->where('opname_expired_waves.status_ini', $filters['status']);
        }
        if (! empty($filters['search'])) {
            $like = LikePattern::contains((string) $filters['search']);
            $query->where(fn ($q) => $q
                ->whereRaw('opname_expired_waves.kode_barang LIKE ? ESCAPE ?', [$like, '\\'])
                ->orWhereRaw('opname_expired_waves.nama_barang LIKE ? ESCAPE ?', [$like, '\\']));
        }

        return $query
            ->orderBy('opname_expired_waves.expired_date_ini')
            ->orderByDesc('opname_expired_waves.week_start')
            ->orderByDesc('opname_expired_waves.id');
    }

    /**
     * @param  array<string, mixed>  $row
     * @return array<string, mixed>
     */
    private static function fromLedger(array $row): array
    {
        return [
            'id' => $row['id'],
            'grain' => self::GRAIN_LEDGER,
            'qty_sumber' => 'mentah',
            'row_no' => $row['no'],
            'cluster' => $row['cluster'],
            'sku' => $row['sku'],
            'satuan' => $row['satuan'],
            'kode_barang' => $row['kode_barang'],
            'nama_barang' => $row['nama_barang'],
            'kode_depo' => $row['kode_depo'],
            'nama_depo' => $row['nama_depo'],
            'sumber_material' => $row['sumber_material'],
            'tanggal_penerimaan' => $row['tanggal_penerimaan'],
            'tanggal_expired' => $row['tanggal_expired'],
            'expired_date_lalu' => null,
            'selisih_expired_date' => null,
            'sisa_hari' => $row['sisa_hari'],
            'sisa_simpan' => $row['sisa_simpan'],
            'qty_crt' => $row['qty_dus_ball'],
            'qty_pcs' => $row['qty_pcs'],
            'qty_lalu_crt' => null,
            'qty_lalu_pcs' => null,
            'qty_koreksi_crt' => null,
            'qty_koreksi_pcs' => null,
            'status_kode' => $row['weekday'] === 'Past'
                ? PenerimaanExpiredReportService::STATUS_EXPIRED
                : PenerimaanExpiredReportService::STATUS_FUTURE,
            'status_tier' => null,
            'is_expired' => $row['is_expired'],
            'status_lalu' => null,
            'perubahan' => null,
            'rekomendasi' => null,
            'week_start' => null,
            'week_end' => null,
            'principal_1' => $row['principal_1'],
            'principal_2' => $row['principal_2'],
            'batch_numbers' => null,
            'source_mix' => null,
            'koreksi_by' => null,
            'koreksi_at' => null,
            'validated_by' => null,
            'validated_at' => null,
            'has_open_session' => false,
            'quarantine' => false,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function fromWave(OpnameExpiredWave $wave): array
    {
        return [
            'id' => $wave->id,
            'grain' => self::GRAIN_WAVE,
            'qty_sumber' => 'efektif',
            'row_no' => null,
            'cluster' => null,
            'sku' => null,
            'satuan' => null,
            'kode_barang' => $wave->kode_barang,
            'nama_barang' => $wave->nama_barang,
            'kode_depo' => $wave->kode_depo,
            'nama_depo' => $wave->nama_depo,
            'sumber_material' => $wave->sumber_material ?? '-',
            'tanggal_penerimaan' => $wave->tanggal_penerimaan?->toDateString(),
            'tanggal_expired' => $wave->expired_date_ini?->toDateString(),
            'expired_date_lalu' => $wave->expired_date_lalu?->toDateString(),
            'selisih_expired_date' => $wave->selisih_expired_date !== null ? (int) $wave->selisih_expired_date : null,
            'sisa_hari' => (int) $wave->sisa_hari,
            'sisa_simpan' => null,
            'qty_crt' => $wave->effectiveCrt(),
            'qty_pcs' => $wave->effectivePcs(),
            'qty_lalu_crt' => (float) $wave->qty_lalu_crt,
            'qty_lalu_pcs' => (float) $wave->qty_lalu_pcs,
            'qty_koreksi_crt' => (float) $wave->qty_koreksi_crt,
            'qty_koreksi_pcs' => (float) $wave->qty_koreksi_pcs,
            'status_kode' => $wave->status_ini,
            'status_tier' => $wave->status_ini,
            'is_expired' => $wave->status_ini === 'EXPIRED',
            'status_lalu' => $wave->status_lalu,
            'perubahan' => $wave->perubahan,
            'rekomendasi' => $wave->rekomendasi,
            'week_start' => $wave->week_start,
            'week_end' => $wave->week_end,
            'principal_1' => $wave->principal_1 ?: '-',
            'principal_2' => $wave->principal_2 ?: '-',
            'batch_numbers' => $wave->batch_numbers,
            'source_mix' => $wave->source_mix,
            'koreksi_by' => $wave->koreksi_by,
            'koreksi_at' => $wave->koreksi_at?->toIso8601String(),
            'validated_by' => $wave->validated_by,
            'validated_at' => $wave->validated_at?->toIso8601String(),
            'has_open_session' => (bool) $wave->has_open_session,
            'quarantine' => false,
        ];
    }

    private static function validateStatusForGrain(string $grain, ?string $status): void
    {
        if ($status === null) {
            return;
        }

        $allowed = $grain === self::GRAIN_WAVE
            ? self::WAVE_STATUSES
            : [PenerimaanExpiredReportService::STATUS_EXPIRED, PenerimaanExpiredReportService::STATUS_FUTURE];

        validator(['status' => $status], ['status' => 'in:'.implode(',', $allowed)])->validate();
    }

    /**
     * Ekspor memakai format lama per grain — skema workbook tidak diubah.
     *
     * @param  array<string, mixed>  $filters
     */
    public static function export(array $filters, ?User $user = null): BinaryFileResponse
    {
        $grain = self::grain($filters);
        self::validateStatusForGrain($grain, $filters['status'] ?? null);
        $filename = 'laporan-stok-kedaluwarsa-'.$grain.'-'.date('Y-m-d_His').'.xlsx';

        if ($grain === self::GRAIN_WAVE) {
            $query = self::waveQuery($filters, $user);
            ExportGuard::ensureWithinLimit($query);

            return Excel::download(new OpnameExpiredExport($query), $filename);
        }

        $query = PenerimaanExpiredReportService::query($filters, $user);
        ExportGuard::ensureWithinLimit($query);

        return Excel::download(new PenerimaanExpiredReportExport($query), $filename);
    }
}
