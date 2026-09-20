<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

class ReceivingItem extends Model
{
    public const SOURCE_VALIDASI = 'VALIDASI_SJ';

    public const SOURCE_IMPORT = 'IMPORT_MANUAL';

    public const CONDITIONS = [
        'FISIK_BAGUS',
        'FISIK_RUSAK',
        'QTY_KURANG',
        'ISI_KEMASAN_KURANG',
        'EXPIRED_TIDAK_STANDAR',
        'LAINNYA',
    ];

    public const CONDITION_ALIASES = [
        'GOOD' => 'FISIK_BAGUS',
        'LESS' => 'QTY_KURANG',
        'NOT GOOD' => 'FISIK_RUSAK',
        'DAMAGED' => 'FISIK_RUSAK',
        'MISSING' => 'LAINNYA',
    ];

    public static function normalizeCondition(?string $condition): ?string
    {
        if ($condition === null || trim($condition) === '') {
            return null;
        }

        $upper = strtoupper(trim($condition));

        return self::CONDITION_ALIASES[$upper]
            ?? (in_array($upper, self::CONDITIONS, true) ? $upper : 'LAINNYA');
    }

    protected $fillable = [
        'receiving_id', 'sj_validation_item_id', 'rencana_kirim_item_id', 'barcode',
        'kode_barang', 'nama_barang', 'expected_qty', 'actual_qty',
        'satuan', 'condition', 'expired_date',         'notes', 'photo', 'scanned_by', 'scan_time',
        'selisih_qty', 'selisih_reason', 'validated_by',
        'source', 'sumber_material', 'kode_depo', 'nama_depo',
        'qty_pcs', 'conversion_factor', 'tanggal_penerimaan',
    ];

    protected function casts(): array
    {
        return [
            'expected_qty' => 'decimal:2',
            'actual_qty' => 'decimal:2',
            'qty_pcs' => 'decimal:2',
            'conversion_factor' => 'decimal:2',
            'expired_date' => 'date',
            'tanggal_penerimaan' => 'date',
            'scan_time' => 'datetime',
        ];
    }

    public function receiving(): BelongsTo
    {
        return $this->belongsTo(Receiving::class);
    }

    public function validationItem(): BelongsTo
    {
        return $this->belongsTo(SjValidationItem::class);
    }

    public function rencanaKirimItem(): BelongsTo
    {
        return $this->belongsTo(RencanaKirimItem::class);
    }

    public function scanner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'scanned_by');
    }

    public function validator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'validated_by');
    }

    public function getSumberMaterialFallback(): ?string
    {
        return $this->getRawOriginal('sumber_material') ?: $this->receiving?->rencanaKirim?->shipper_name;
    }

    public function getKodeDepoFallback(): ?string
    {
        return $this->getRawOriginal('kode_depo') ?? $this->receiving?->rencanaKirim?->kode_depo;
    }

    public function getNamaDepoFallback(): ?string
    {
        return $this->getRawOriginal('nama_depo') ?? $this->receiving?->rencanaKirim?->nama_depo;
    }

    /**
     * Tanggal penerimaan = tanggal barang benar-benar diterima. Untuk hasil
     * validasi SJ (tanpa tanggal penerimaan manual), jatuh ke momen receiving.
     */
    public function getTanggalPenerimaanFallback(): ?string
    {
        if ($this->getRawOriginal('tanggal_penerimaan')) {
            return $this->getRawOriginal('tanggal_penerimaan');
        }

        if ($this->scan_time) {
            return $this->scan_time->toDateString();
        }

        foreach ([$this->receiving?->actual_arrival_time, $this->receiving?->actual_start_time, $this->receiving?->created_at] as $moment) {
            if ($moment) {
                return Carbon::parse($moment)->toDateString();
            }
        }

        return $this->created_at?->toDateString();
    }

    protected function getSumberMaterialAttribute(?string $value): ?string
    {
        return $value ?? $this->getSumberMaterialFallback();
    }

    protected function getKodeDepoAttribute(?string $value): ?string
    {
        return $value ?? $this->getKodeDepoFallback();
    }

    protected function getNamaDepoAttribute(?string $value): ?string
    {
        return $value ?? $this->getNamaDepoFallback();
    }

    protected function getTanggalPenerimaanAttribute(?string $value): ?string
    {
        return $value ?? $this->getTanggalPenerimaanFallback();
    }
}
