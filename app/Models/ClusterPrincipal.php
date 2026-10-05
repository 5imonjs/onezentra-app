<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Master pemetaan Cluster / Principal: produk -> principal (pabrikan).
 *
 * Data ini global (bukan per-depo) karena pemetaan SKU ke principal berlaku
 * sama di seluruh jaringan.
 */
class ClusterPrincipal extends Model
{
    use HasFactory;

    /**
     * Nilai yang muncul di file sumber Excel sebagai penanda "tidak ada".
     *
     * Import mem-normalisasi semua ini jadi NULL. Kalau "#N/A" disimpan apa
     * adanya, filter "principal_2 tidak kosong" akan ikut memilih baris yang
     * justru tidak punya principal kedua.
     */
    public const NOT_APPLICABLE = ['#N/A', '#N/A ', 'N/A', 'NA', '-', '--'];

    protected $table = 'cluster_principal';

    protected $fillable = [
        'lob', 'product_category', 'sub_product_category', 'product_group',
        'product_class', 'product_sku', 'principal_1', 'principal_2',
        'bosnetsz_product_id', 'sap_product_id',
        'created_by',
    ];

    /**
     * Bersihkan nilai dari file Excel: trim, dan ubah penanda "tidak ada"
     * menjadi null supaya tidak ikut terhitung sebagai data.
     *
     * Dipakai oleh import DAN oleh store/update, supaya #N/A tidak bisa masuk
     * lewat jalur manual mana pun.
     */
    public static function cleanValue(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }

        $trimmed = trim((string) $value);

        if ($trimmed === '' || in_array($trimmed, self::NOT_APPLICABLE, true)) {
            return null;
        }

        return $trimmed;
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    protected static function booted(): void
    {
        // Kunci stabil selalu dihitung ulang saat SKU berubah, supaya semua
        // jalur tulis (import, CRUD manual, seeder) tidak bisa menyimpan
        // baris tanpa kunci join — tanpa perlu mengingat memanggil resolver
        // di setiap controller/import.
        static::saving(function (ClusterPrincipal $row): void {
            if ($row->isDirty('product_sku')) {
                $row->refreshStableIds();
            }
        });
    }

    /**
     * Hitung ulang bosnetsz_product_id/sap_product_id dari product_sku.
     * Mengembalikan true bila ada yang berubah.
     */
    public function refreshStableIds(): bool
    {
        ['bosnetsz_product_id' => $bos, 'sap_product_id' => $sap] = self::resolveStableIds((string) $this->product_sku);
        $this->bosnetsz_product_id = $bos;
        $this->sap_product_id = $sap;

        return $this->isDirty(['bosnetsz_product_id', 'sap_product_id']);
    }

    /**
     * Petakan product_sku ke ID stabil NPN.
     *
     * Urutan deterministik (cocok pertama menang): komposit
     * `szNickNameNew/szNickName` (format file sumber, mis. OJDJE8/JDO1A),
     * nickname pendek (JDO1F), lalu tiap segmen sebelum/sesudah '/' sebagai
     * nickname (JDO1/JDO1 → NPN bernickname JDO1). Tidak ketemu → [null, null];
     * laporan kemudian jatuh ke principal standar_umur_produk.
     *
     * Perbandingan komposit dilakukan di PHP (bukan CONCAT di SQL) supaya
     * tetap jalan di MySQL maupun SQLite lama.
     *
     * @return array{bosnetsz_product_id: string|null, sap_product_id: string|null}
     */
    public static function resolveStableIds(string $productSku): array
    {
        $sku = trim($productSku);

        if ($sku === '') {
            return ['bosnetsz_product_id' => null, 'sap_product_id' => null];
        }

        $parts = array_values(array_unique(array_filter(array_map(
            fn (string $p): string => trim($p),
            explode('/', $sku)
        ))));

        $candidates = Npn::query()
            ->where('szNickName', $sku)
            ->orWhere('szNickNameNew', $sku)
            ->orWhereIn('szNickName', $parts)
            ->orWhereIn('szNickNameNew', $parts)
            ->get();

        $ranked = $candidates
            ->map(fn (Npn $npn): array => ['npn' => $npn, 'rank' => self::skuMatchRank($npn, $sku, $parts)])
            ->filter(fn (array $r): bool => $r['rank'] !== null)
            ->sortBy('rank')
            ->first();

        $npn = $ranked['npn'] ?? null;

        return [
            'bosnetsz_product_id' => $npn?->BOSnetszProductId,
            'sap_product_id' => $npn?->SAPszProductId,
        ];
    }

    /**
     * @param  array<int, string>  $parts
     */
    private static function skuMatchRank(Npn $npn, string $sku, array $parts): ?int
    {
        $nick = trim((string) $npn->szNickName);
        $nickNew = trim((string) $npn->szNickNameNew);

        if ($nickNew !== '' && $nick !== '' && $nickNew.'/'.$nick === $sku) {
            return 0;
        }

        if ($nick === $sku || $nickNew === $sku) {
            return 1;
        }

        // Segmen kiri didahulukan: 'JDO12/JDO3' lebih mungkin milik JDO12
        // daripada JDO3 bila keduanya terdaftar sebagai produk berbeda.
        foreach ($parts as $i => $part) {
            if ($part === $nick || ($nickNew !== '' && $part === $nickNew)) {
                return 20 + $i;
            }
        }

        return null;
    }

    protected function casts(): array
    {
        return [
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }
}
