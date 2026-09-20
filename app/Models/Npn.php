<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Npn extends Model
{
    protected $table = 'npn';

    protected $fillable = [
        'kode_depo', 'nama_depo', 'created_by',
        'BOSnetszProductId', 'SAPszProductId', 'szNickName', 'szNickNameNew',
        'szShortDescription', 'szLongDescription',
        'szCategory_1', 'szCat1Description',
        'szCategory_2', 'szCat2Description',
        'szCategory_3', 'szCat3Description',
        'szCategory_4', 'szCat4Description',
        'szCategory_5', 'szCat5Description',
        'szCategory_6', 'szCat6Description',
        'szCategory_7', 'szCat7Description',
        'szCategory_8', 'szCat8Description',
        'szCategory_9', 'szCat9Description',
        'szCategory_10', 'szCat10Description',
        'szCompUomId', 'szCompUomDesc',
        'BOSnetszUomId', 'BOSnetdecUom',
        'SAPszUomId', 'SAPdecUom',
        'decUomConversion1', 'decUomConversion2',
        'decWeight', 'decLength', 'decWidth', 'decHeight', 'decVolume',
        'decStoreTemp',
        'szBarcode', 'szBarcodeSekunder', 'szBarcodeTersier',
        'szStatus', 'dtmValidEnd',
        'SAPszSalesOrgId', 'szTaxTypeId', 'decRate',
    ];

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * Konversi 1 satuan staging (CRT/ZAK) ke PCS.
     * Data produksi sering mengosongkan decUomConversion1 sementara nilainya
     * tersedia via BOSnetdecUom / SAPdecUom (keduanya varchar numerik).
     */
    public function pcConversion(): ?float
    {
        if ($this->decUomConversion1 !== null && is_numeric((string) $this->decUomConversion1)) {
            return (float) $this->decUomConversion1;
        }

        foreach ([$this->BOSnetdecUom, $this->SAPdecUom] as $candidate) {
            if ($candidate !== null && is_numeric(trim((string) $candidate))) {
                return (float) trim((string) $candidate);
            }
        }

        return null;
    }

    public function stagingUom(): ?string
    {
        foreach ([$this->SAPszUomId, $this->BOSnetszUomId] as $uom) {
            if ($uom !== null && trim($uom) !== '') {
                return strtoupper(trim($uom));
            }
        }

        return null;
    }

    protected function casts(): array
    {
        return [
            'decUomConversion1' => 'decimal:2',
            'decUomConversion2' => 'decimal:2',
            'decWeight' => 'decimal:2',
            'decLength' => 'decimal:2',
            'decWidth' => 'decimal:2',
            'decHeight' => 'decimal:2',
            'decVolume' => 'decimal:2',
            'dtmValidEnd' => 'datetime',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }
}
