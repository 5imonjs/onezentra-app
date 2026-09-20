<?php

namespace App\Imports;

use App\Models\Npn;
use App\Models\User;
use Illuminate\Support\Collection;
use Maatwebsite\Excel\Concerns\ToCollection;
use Maatwebsite\Excel\Concerns\WithHeadingRow;

class NpnImport implements ToCollection, WithHeadingRow
{
    public int $imported = 0;

    public int $updated = 0;

    private array $headingMap = [
        'bosnetszproductid' => 'BOSnetszProductId',
        'sapszproductid' => 'SAPszProductId',
        'sznickname' => 'szNickName',
        'sznicknamenew' => 'szNickNameNew',
        'szshortdescription' => 'szShortDescription',
        'szlongdescription' => 'szLongDescription',
        'szcategory_1' => 'szCategory_1',
        'szcat1description' => 'szCat1Description',
        'szcategory_2' => 'szCategory_2',
        'szcat2description' => 'szCat2Description',
        'szcategory_3' => 'szCategory_3',
        'szcat3description' => 'szCat3Description',
        'szcategory_4' => 'szCategory_4',
        'szcat4description' => 'szCat4Description',
        'szcategory_5' => 'szCategory_5',
        'szcat5description' => 'szCat5Description',
        'szcategory_6' => 'szCategory_6',
        'szcat6description' => 'szCat6Description',
        'szcategory_7' => 'szCategory_7',
        'szcat7description' => 'szCat7Description',
        'szcategory_8' => 'szCategory_8',
        'szcat8description' => 'szCat8Description',
        'szcategory_9' => 'szCategory_9',
        'szcat9description' => 'szCat9Description',
        'szcategory_10' => 'szCategory_10',
        'szcat10description' => 'szCat10Description',
        'szcompuomid' => 'szCompUomId',
        'szcompuomdesc' => 'szCompUomDesc',
        'bosnetszuomid' => 'BOSnetszUomId',
        'bosnetdecuom' => 'BOSnetdecUom',
        'sapszuomid' => 'SAPszUomId',
        'sapdecuom' => 'SAPdecUom',
        'decuomconversion1' => 'decUomConversion1',
        'decuomconversion2' => 'decUomConversion2',
        'decweight' => 'decWeight',
        'declength' => 'decLength',
        'decwidth' => 'decWidth',
        'decheight' => 'decHeight',
        'decvolume' => 'decVolume',
        'decstoretemp' => 'decStoreTemp',
        'szbarcode' => 'szBarcode',
        'szbarcodesekunder' => 'szBarcodeSekunder',
        'szbarcodetersier' => 'szBarcodeTersier',
        'szstatus' => 'szStatus',
        'dtmvalidend' => 'dtmValidEnd',
        'sapszsalesorgid' => 'SAPszSalesOrgId',
        'sztaxtypeid' => 'szTaxTypeId',
        'decrate' => 'decRate',
    ];

    public function __construct(private User $user) {}

    public function collection(Collection $collection): void
    {
        foreach ($collection as $row) {
            $data = [];

            foreach ($row as $key => $value) {
                if (! is_string($key) || ! isset($this->headingMap[$key])) {
                    continue;
                }
                $dbKey = $this->headingMap[$key];
                if ($value !== null && $value !== '') {
                    $data[$dbKey] = $value;
                }
            }

            if (empty($data)) {
                continue;
            }

            $data = $this->user->depotAttributes($data);

            $existing = null;
            $base = Npn::query();
            if (! empty($data['BOSnetszProductId'])) {
                $existing = (clone $base)->where('BOSnetszProductId', $data['BOSnetszProductId'])->first();
            }
            if (! $existing && ! empty($data['SAPszProductId'])) {
                $existing = (clone $base)->where('SAPszProductId', $data['SAPszProductId'])->first();
            }
            if (! $existing && ! empty($data['szBarcode'])) {
                $existing = (clone $base)->where('szBarcode', $data['szBarcode'])->first();
            }

            if ($existing) {
                $existing->update($data);
                $this->updated++;
            } else {
                $data['created_by'] = $this->user->id;
                Npn::create($data);
                $this->imported++;
            }
        }
    }
}
