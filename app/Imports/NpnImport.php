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
                if (is_string($value)) {
                    // Excel sering menyisakan spasi di ujung kode. Tanpa trim,
                    // " B-1" tidak cocok dengan "B-1" dan import membuat baris
                    // duplikat untuk produk yang sama.
                    $value = trim($value);
                }
                if ($value !== null && $value !== '') {
                    $data[$dbKey] = $value;
                }
            }

            if (empty($data)) {
                continue;
            }

            $data = $this->user->depotAttributes($data);

            $bosId = $data['BOSnetszProductId'] ?? null;
            $sapId = $data['SAPszProductId'] ?? null;
            $barcode = $data['szBarcode'] ?? null;

            // Kunci baris saat mencari supaya import paralel tidak membuat
            // dua baris untuk BOS ID yang sama (diperkuat unique index).
            $existing = ! empty($bosId)
                ? Npn::query()->where('BOSnetszProductId', $bosId)->lockForUpdate()->first()
                : null;

            // SAP ID dan barcode tidak unik per produk BOSnet: dua produk
            // berbeda (mis. CSP4OK dan CSP4O) bisa berbagi salah satunya.
            // Fallback ini hanya boleh mengisi baris legacy yang BOS ID-nya
            // masih kosong; kalau baris yang cocok sudah punya BOS ID lain,
            // itu produk berbeda dan harus dibuat sebagai baris baru. Dulu
            // baris kedua menimpa baris pertama sehingga salah satu produk
            // hilang dari NPN dan tidak pernah muncul di picker.
            if (! $existing && ! empty($sapId)) {
                $existing = $this->findLegacyMatch('SAPszProductId', $sapId, $bosId);
            }
            if (! $existing && ! empty($barcode)) {
                $existing = $this->findLegacyMatch('szBarcode', $barcode, $bosId);
            }

            if ($existing) {
                // NPN adalah master global: kode_depo hanya provenance importer
                // pertama. Import dari depo lain tidak boleh memindahkan
                // kepemilikan baris yang sudah ada.
                if (! empty($existing->kode_depo)) {
                    unset($data['kode_depo'], $data['nama_depo']);
                }
                $existing->update($data);
                $this->updated++;
            } else {
                $data['created_by'] = $this->user->id;
                Npn::create($data);
                $this->imported++;
            }
        }
    }

    /**
     * Cari baris lama yang boleh di-update lewat SAP ID/barcode.
     *
     * Kalau file import membawa BOS ID, hanya baris tanpa BOS ID yang boleh
     * dicocokkan lewat kolom sekunder. Baris dengan BOS ID berbeda adalah
     * produk lain dan tidak boleh ditimpa.
     */
    private function findLegacyMatch(string $column, string $value, ?string $bosId): ?Npn
    {
        $query = Npn::query()->where($column, $value);

        if (! empty($bosId)) {
            $query->where(function ($q): void {
                $q->whereNull('BOSnetszProductId')
                    ->orWhere('BOSnetszProductId', '');
            });
        }

        return $query->first();
    }
}
