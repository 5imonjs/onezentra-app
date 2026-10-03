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

    protected function casts(): array
    {
        return [
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }
}
