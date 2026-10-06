<?php

namespace App\Services;

use App\Models\ReceivingItem;
use App\Models\StandarUmurProduk;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Query\Builder as QueryBuilder;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Sumber tunggal untuk laporan "Penerimaan + Batch Expired".
 *
 * Filter, urutan baris, dan bentuk baris hidup di sini — bukan di controller
 * atau export — supaya layar dan file Excel yang diunduh tidak pernah
 * berbeda. Ini pola yang sama dengan RencanaKirimReportExport::applyFilters(),
 * dipindah ke Service karena laporan ini juga butuh join cluster.
 *
 * Sumber data tetap `receiving_items` (ledger GR), bukan tabel snapshot
 * `penerimaan` — lihat .ai/rules/models.md.
 */
class PenerimaanExpiredReportService
{
    public const STATUS_EXPIRED = 'EXPIRED';

    public const STATUS_FUTURE = 'FUTURE';

    /**
     * Validasi + normalisasi filter dari request.
     *
     * @return array<string, string|null>
     */
    public static function validate(Request $request): array
    {
        $validated = $request->validate([
            'tanggal_from' => 'nullable|date',
            'tanggal_to' => 'nullable|date',
            'kode_depo' => 'nullable|string|max:20',
            'cluster' => 'nullable|string|max:255',
            'status' => 'nullable|string|in:'.self::STATUS_EXPIRED.','.self::STATUS_FUTURE,
            'search' => 'nullable|string|max:200',
            'page' => 'nullable|integer|min:1',
            'per_page' => 'nullable|integer|min:1|max:100',
        ]);

        return array_intersect_key($validated, array_flip([
            'tanggal_from', 'tanggal_to', 'kode_depo', 'cluster', 'status', 'search',
        ]));
    }

    /**
     * Query dasar laporan: satu baris = satu penerimaan produk.
     *
     * Cluster diambil dari master `standar_umur_produk` lewat NPN:
     *   receiving_items.kode_barang → npn.BOSnetszProductId
     *                                 → npn.SAPszProductId
     *                                 → standar_umur_produk.material
     *
     * Principal diambil dari `cluster_principal` lewat DUA join exact
     * (masing-masing cocok ≤1 baris karena product_sku unik, jadi tidak
     * mungkin menggandakan baris): kunci stabil BOSnet dulu, lalu nickname
     * pendek sebagai transisi bagi baris yang belum di-backfill. Format
     * komposit (`OJDJE8/JDO1A`) ditangani resolver PHP
     * (ClusterPrincipal::resolveStableIds) saat tulis + backfill — SQL
     * sengaja tanpa CONCAT supaya tetap jalan di MySQL maupun SQLite lama.
     * Prioritas lewat COALESCE — nickname boleh berubah, BOSnet ID tidak.
     * Kalau keduanya meleset, jatuh ke standar_umur_produk.principal.
     *
     * Semua join LEFT: produk yang belum punya master tetap muncul di
     * laporan (dengan cluster kosong) — laporan penerimaan tidak boleh
     * kehilangan baris hanya karena master belum lengkap.
     *
     * @param  array<string, string|null>  $filters
     */
    public static function query(array $filters, ?User $user = null): Builder
    {
        $query = ReceivingItem::query()
            ->select('receiving_items.*')
            ->addSelect('sup.cluster as cluster')
            // SKU pendek (ESVAG150, OKJMFL20) — inilah yang dipakai laporan
            // manual gudang sebagai kolom PRODUK. kode_barang (BOSnet 14 digit)
            // tetap ikut terbawa karena sudah jadi kolom asli receiving_items.
            ->addSelect('npn.szNickName as sku')
            ->addSelect(DB::raw('COALESCE(cp.principal_1, cp_nick.principal_1, sup.principal) as principal_1'))
            ->addSelect(DB::raw('COALESCE(cp.principal_2, cp_nick.principal_2) as principal_2'))
            ->leftJoin('npn', 'npn.BOSnetszProductId', '=', 'receiving_items.kode_barang')
            // Anti-duplikasi: bosnetsz_product_id tidak unik di master
            // (1 BOS bisa menunjuk 2 baris) — tanpa dedup, baris laporan
            // mengganda. Ambil deterministik baris pertama (MIN id).
            ->leftJoinSub(
                DB::table('cluster_principal')
                    ->selectRaw('bosnetsz_product_id, MIN(id) as id')
                    ->whereNotNull('bosnetsz_product_id')
                    ->groupBy('bosnetsz_product_id'),
                'cp_ids',
                'cp_ids.bosnetsz_product_id',
                '=',
                'receiving_items.kode_barang'
            )
            ->leftJoin('cluster_principal as cp', 'cp.id', '=', 'cp_ids.id')
            // Transisi: baris CP yang belum di-backfill ID stabil masih
            // terjangkau lewat nickname lama maupun baru.
            ->leftJoin('cluster_principal as cp_nick', function ($join): void {
                $join->on('cp_nick.product_sku', '=', 'npn.szNickName')
                    ->orOn('cp_nick.product_sku', '=', 'npn.szNickNameNew');
            })
            ->leftJoin('standar_umur_produk as sup', 'sup.material', '=', 'npn.SAPszProductId')
            ->with(['receiving.rencanaKirim'])
            ->whereNotNull('receiving_items.kode_barang');

        if ($user && $user->isDepotScoped()) {
            $query->where(fn ($q) => $q
                ->where('receiving_items.kode_depo', $user->kode_depo)
                ->orWhereHas('receiving.rencanaKirim', fn ($r) => $r->forUserDepot($user)));
        }

        if (! empty($filters['tanggal_from'])) {
            $query->whereRaw('COALESCE(receiving_items.tanggal_penerimaan, DATE(receiving_items.scan_time), DATE(receiving_items.created_at)) >= ?', [$filters['tanggal_from']]);
        }

        if (! empty($filters['tanggal_to'])) {
            $query->whereRaw('COALESCE(receiving_items.tanggal_penerimaan, DATE(receiving_items.scan_time), DATE(receiving_items.created_at)) <= ?', [$filters['tanggal_to']]);
        }

        if (! empty($filters['kode_depo']) && ! ($user && $user->isDepotScoped())) {
            $query->where('receiving_items.kode_depo', $filters['kode_depo']);
        }

        if (! empty($filters['cluster'])) {
            $query->where('sup.cluster', $filters['cluster']);
        }

        // WEEKDAY = Future bila expired >= today, selain itu Past.
        if (($filters['status'] ?? null) === self::STATUS_EXPIRED) {
            $query->whereNotNull('receiving_items.expired_date')
                ->whereDate('receiving_items.expired_date', '<', Carbon::today());
        } elseif (($filters['status'] ?? null) === self::STATUS_FUTURE) {
            $query->whereNotNull('receiving_items.expired_date')
                ->whereDate('receiving_items.expired_date', '>=', Carbon::today());
        }

        if (! empty($filters['search'])) {
            $like = '%'.$filters['search'].'%';
            $query->where(fn ($q) => $q
                ->where('receiving_items.kode_barang', 'like', $like)
                ->orWhere('receiving_items.nama_barang', 'like', $like)
                ->orWhere('receiving_items.sumber_material', 'like', $like)
                ->orWhere('sup.cluster', 'like', $like));
        }

        // Urutan laporan: cluster dulu (itu kunci pengelompokan), lalu
        // produk, lalu tanggal — supaya baris satu cluster memang berdampingan.
        return $query
            ->orderByRaw('sup.cluster IS NULL')
            ->orderBy('sup.cluster')
            ->orderBy('receiving_items.kode_barang')
            ->orderByRaw('COALESCE(receiving_items.tanggal_penerimaan, DATE(receiving_items.scan_time), DATE(receiving_items.created_at)) DESC')
            ->orderByDesc('receiving_items.id');
    }

    /**
     * Ringkasan dihitung dari SELURUH baris terfilter via agregasi SQL,
     * bukan dari halaman aktif — jadi angka kartu ringkasan tidak berubah
     * hanya karena user pindah halaman.
     *
     * @param  array<string, string|null>  $filters
     */
    public static function summary(array $filters, ?User $user = null): array
    {
        $today = Carbon::today();

        // toBase() menurunkan ke Query\Builder, jadi tipe closure mengikuti
        // itu — bukan Eloquent\Builder.
        $base = fn (): QueryBuilder => static::query($filters, $user)
            ->reorder()
            ->toBase()
            // Kolom model dibuang dulu: MySQL (ONLY_FULL_GROUP_BY) menolak
            // COUNT/SUM dicampur kolom biasa tanpa GROUP BY. SQLite lolos,
            // jadi tanpa baris ini bug baru baru muncul di produksi.
            ->select([]);

        $agg = $base()
            ->selectRaw(
                'COUNT(*) as c,
                 COALESCE(SUM(receiving_items.actual_qty), 0) as qty_dus,
                 COALESCE(SUM(COALESCE(receiving_items.qty_pcs,
                     receiving_items.actual_qty * receiving_items.conversion_factor)), 0) as qty_pcs,
                 COUNT(DISTINCT sup.cluster) as cluster_count,
                 SUM(CASE WHEN receiving_items.expired_date IS NULL THEN 1 ELSE 0 END) as tanpa_expired,
                 SUM(CASE WHEN receiving_items.expired_date < ? THEN 1 ELSE 0 END) as expired,
                 SUM(CASE WHEN receiving_items.expired_date >= ? THEN 1 ELSE 0 END) as future',
                [$today, $today]
            )
            ->first();

        return [
            'total_item' => (int) $agg->c,
            'total_qty_dus' => (float) $agg->qty_dus,
            'total_qty_pcs' => (float) $agg->qty_pcs,
            'total_cluster' => (int) $agg->cluster_count,
            'item_expired' => (int) $agg->expired,
            'item_future' => (int) $agg->future,
            'item_tanpa_expired' => (int) $agg->tanpa_expired,
        ];
    }

    /**
     * Bentuk satu baris laporan untuk UI.
     *
     * WEEKDAY & SISA SIMPAN dihitung di PHP juga (meski file Excel memakai
     * formula) supaya tabel di layar langsung informatif tanpa harus mengunduh
     * file dulu. Keduanya memakai definisi yang sama dengan formula Excel:
     * Future/Past dibandingkan terhadap HARI INI, dan SISA SIMPAN adalah
     * jarak tanggal terima → tanggal expired.
     *
     * @param  int|null  $no  nomor urut global di seluruh hasil filter
     * @return array<string, mixed>
     */
    public static function row(ReceivingItem $item, ?int $no = null): array
    {
        $today = Carbon::today()->startOfDay();

        $tanggalMasuk = $item->tanggal_penerimaan
            ? Carbon::parse($item->tanggal_penerimaan)->startOfDay()
            : null;

        $expired = $item->expired_date
            ? Carbon::parse($item->expired_date)->startOfDay()
            : null;

        $isExpired = $expired !== null && $expired->lessThan($today);

        $weekday = $expired === null
            ? '-'
            : ($isExpired ? 'Past' : 'Future');

        $sisaHari = $expired === null
            ? null
            : (int) $today->diffInDays($expired, false);

        return [
            'id' => $item->id,
            'no' => $no,
            'cluster' => $item->cluster ?: 'TANPA CLUSTER',
            // SKU pendek lebih dulu; kalau NPN belum punya nickname, jatuh ke
            // kode_barang supaya laporan tidak pernah menampilkan kolom kosong.
            'sku' => $item->sku ?: $item->kode_barang,
            // principal_1/2 sudah COALESCE di query (kunci stabil → komposit
            // nickname → nickname pendek → principal standar umur).
            'principal_1' => $item->principal_1 ?: '-',
            'principal_2' => $item->principal_2 ?: '-',
            'kode_barang' => $item->kode_barang,
            'nama_barang' => $item->nama_barang ?: $item->kode_barang,
            'qty_dus_ball' => (float) $item->actual_qty,
            'qty_pcs' => $item->totalPcs(),
            'satuan' => $item->satuan ?: '-',
            'tanggal_expired' => $expired?->toDateString(),
            'tanggal_penerimaan' => $tanggalMasuk?->toDateString(),
            'weekday' => $weekday,
            'sisa_simpan' => $tanggalMasuk && $expired
                ? self::sisaSimpan($tanggalMasuk, $expired)
                : '-',
            'sisa_hari' => $sisaHari,
            'is_expired' => $isExpired,
            'kode_depo' => $item->getKodeDepoFallback() ?: '-',
            'nama_depo' => $item->getNamaDepoFallback() ?: '-',
            'sumber_material' => $item->getSumberMaterialFallback() ?: '-',
        ];
    }

    /**
     * Selisih tanggal dalam bentuk "X Thn Y Bln Z Hr" — padanan DATEDIF
     * yang dipakai di kolom SISA SIMPAN file Excel.
     */
    public static function sisaSimpan(Carbon $dari, Carbon $sampai): string
    {
        $selisih = $dari->diff($sampai);

        return $selisih->y.' Thn '.$selisih->m.' Bln '.$selisih->d.' Hr';
    }

    /**
     * Daftar cluster yang tersedia untuk filter dropdown.
     *
     * @return array<int, string>
     */
    public static function clusterOptions(): array
    {
        return StandarUmurProduk::query()
            ->whereNotNull('cluster')
            ->distinct()
            ->orderBy('cluster')
            ->pluck('cluster')
            ->all();
    }
}
