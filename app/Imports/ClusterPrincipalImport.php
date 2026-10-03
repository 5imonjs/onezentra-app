<?php

namespace App\Imports;

use App\Models\ClusterPrincipal;
use App\Models\User;
use Illuminate\Support\Collection;
use Maatwebsite\Excel\Concerns\ToCollection;
use Maatwebsite\Excel\Concerns\WithHeadingRow;

class ClusterPrincipalImport implements ToCollection, WithHeadingRow
{
    public int $imported = 0;

    public int $updated = 0;

    public int $skipped = 0;

    /**
     * Baris tanpa Product SKU dilewati, bukan disimpan.
     *
     * SKU adalah kunci alami tabel ini. Baris tanpa SKU tidak bisa di-update
     * pada import berikutnya, jadi menyimpannya hanya menghasilkan baris yatim
     * yang tidak pernah bisa dikoreksi — dan kolomnya nullableUnique di SQL
     * mengizinkan NULL berulang, jadi database tidak akan menahannya.
     */
    public array $skippedRows = [];

    /**
     * Alias heading Excel -> kolom DB.
     *
     * File sumber dari user belum tentu memakai nama kolom yang sama dengan
     * sistem, jadi setiap kolom menerima beberapa ejaan yang masuk akal
     * ("Product SKU", "product_sku", "SKU", "Kode SKU"). Ini normalizing
     * aliasing yang disengaja: menolak import karena beda spasi akan jauh
     * lebih merepotkan daripada menerima beberapa sinonim.
     */
    private array $headingMap = [
        'lob' => 'lob',
        'lineofbusiness' => 'lob',
        'line of business' => 'lob',

        'productcategory' => 'product_category',
        'product category' => 'product_category',
        'category' => 'product_category',

        'subproductcategory' => 'sub_product_category',
        'sub product category' => 'sub_product_category',
        'subcategory' => 'sub_product_category',
        'sub category' => 'sub_product_category',

        'productgroup' => 'product_group',
        'product group' => 'product_group',
        'group' => 'product_group',

        'productclass' => 'product_class',
        'product class' => 'product_class',

        'productsku' => 'product_sku',
        'product sku' => 'product_sku',
        'sku' => 'product_sku',
        'kodesku' => 'product_sku',
        'kode sku' => 'product_sku',

        'principal1' => 'principal_1',
        'principal 1' => 'principal_1',
        'principal' => 'principal_1',

        'principal2' => 'principal_2',
        'principal 2' => 'principal_2',
    ];

    public function __construct(private User $user) {}

    public function collection(Collection $collection): void
    {
        foreach ($collection as $row) {
            $data = [];

            foreach ($row as $key => $value) {
                if (! is_string($key)) {
                    continue;
                }
                $normalized = $this->normalizeHeading($key);
                if ($normalized === null) {
                    continue;
                }
                // Selalu tulis, bahkan null: kolom yang sengaja dikosongkan di
                // file harus mengosongkan nilai lama, kalau tidak import kedua
                // tidak akan bisa mengoreksi data yang sebelumnya salah.
                $data[$normalized] = ClusterPrincipal::cleanValue($value);
            }

            $sku = $data['product_sku'] ?? null;
            if ($sku === null) {
                $this->skipped++;
                if (count($this->skippedRows) < 20) {
                    $this->skippedRows[] = ['row' => $this->rowNumber++, 'reason' => 'Product SKU kosong'];
                }

                continue;
            }

            // Null dibuang lagi supaya `update()` tidak menimpa kolom yang tidak
            // ada di file dengan NULL — "-" di Principal 2 memang berarti tidak
            // ada, tapi kolom yang benar-benar tidak ada di file tidak boleh
            // ikut terhapus.
            $existing = ClusterPrincipal::query()->where('product_sku', $sku)->first();

            if ($existing) {
                $existing->update(array_filter($data, fn ($v, $k) => $k === 'product_sku' || $v !== null, ARRAY_FILTER_USE_BOTH));
                $this->updated++;
            } else {
                $data['created_by'] = $this->user->id;
                ClusterPrincipal::create($data);
                $this->imported++;
            }
        }
    }

    /**
     * Nomor baris untuk pesan error. Dimulai dari 2 karena baris 1 adalah header.
     */
    private int $rowNumber = 2;

    private function normalizeHeading(string $heading): ?string
    {
        $key = mb_strtolower(trim($heading));
        $key = preg_replace('/[^a-z0-9 ]/', '', $key) ?? '';
        $key = preg_replace('/\s+/', ' ', $key) ?? '';

        return $this->headingMap[$key] ?? null;
    }
}
