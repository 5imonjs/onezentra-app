<?php

namespace App\Imports;

use App\Models\Batch;
use App\Models\Npn;
use App\Models\ReceivingItem;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Maatwebsite\Excel\Concerns\ToCollection;
use Maatwebsite\Excel\Concerns\WithHeadingRow;
use Maatwebsite\Excel\Concerns\WithValidation;
use PhpOffice\PhpSpreadsheet\Shared\Date;

class ReceivingItemImport implements ToCollection, WithHeadingRow, WithValidation
{
    public int $imported = 0;

    public int $skipped = 0;

    public array $errors = [];

    /** Distribusi minggu monitoring: week_start (Senin) => jumlah baris. */
    public array $weeks = [];

    /** Baris dilewati karena batch yang sama sudah ada di ledger. */
    public int $duplicates = 0;

    public function __construct(private User $user) {}

    public function collection(Collection $collection): void
    {
        $handled = [];

        // Kunci batch yang sudah ada di ledger (satu query, bukan N+1):
        // barang + depo final + expired. Baris yang kuncinya sudah ada
        // dilewati sebagai duplikat — import ulang file yang sama tidak
        // boleh menggandakan stok (roll-forward sudah membawa qty lama).
        // Hanya pindai depo efektif user: baris yang dibuat di bawah akan
        // memakai depo user (depotAttributes) bila user punya kode_depo,
        // sehingga ledger depo lain tak perlu dimuat (dulu seluruh tabel).
        $existingQuery = ReceivingItem::where('source', ReceivingItem::SOURCE_IMPORT);
        if ($this->user->isDepotScoped()) {
            $this->user->applyDepotFilter($existingQuery, 'kode_depo');
        } elseif (! blank($this->user->kode_depo)) {
            $existingQuery->where('kode_depo', $this->user->kode_depo);
        }

        $existing = $existingQuery
            ->get(['kode_barang', 'kode_depo', 'expired_date'])
            ->map(fn ($r) => implode('|', [
                $r->kode_barang,
                $r->kode_depo ?? '',
                $r->expired_date instanceof \DateTimeInterface ? $r->expired_date->format('Y-m-d') : substr((string) $r->expired_date, 0, 10),
            ]))
            ->flip()
            ->all();

        foreach ($collection as $row) {
            // Operator cukup mengisi 5 kolom: PRODUK, QTY DUS/BALL, QTY PCS,
            // EXPIRED, TANGGAL TERIMA. PRODUK boleh SKU pendek (ESVAG150)
            // maupun kode penuh — NPN yang menyelesaikan jadi kode_barang.
            $kode = $this->text($row['kode_barang'] ?? $row['produk'] ?? null);
            $namaBarang = $this->text($row['nama_barang'] ?? null);
            $qtyCrt = $this->number($row['qty_crt_zak'] ?? $row['qty_crt'] ?? $row['qty_dusball'] ?? $row['qty_dus_ball'] ?? null);
            $qtyPcs = $this->number($row['qty_pcs'] ?? null);
            $expired = $this->date($row['tgl_expired_date'] ?? $row['expired_date'] ?? $row['expired'] ?? null);
            $tanggalTerima = $this->date($row['tgl_penerimaan'] ?? $row['tanggal_penerimaan'] ?? null);
            $sumber = $this->text($row['sumber_material'] ?? null);
            $kodeDepo = $this->text($row['kode_depo'] ?? null);
            $namaDepo = $this->text($row['nama_depo'] ?? null);
            $satuan = $this->text($row['satuan'] ?? null);

            if ($kode === null || $qtyCrt === null || $expired === null) {
                $this->skipped++;

                continue;
            }

            $npn = Npn::query()
                ->where(fn ($q) => $q
                    ->where('BOSnetszProductId', $kode)
                    ->orWhere('SAPszProductId', $kode)
                    ->orWhere('szBarcode', $kode)
                    // Nama lama DAN nama baru: gramatik penamaan bisa berubah
                    // (szNickName vs szNickNameNew) tapi BOSnetszProductId
                    // tetap — yang disimpan selalu kode stabil hasil resolusi.
                    ->orWhere('szNickName', $kode)
                    ->orWhere('szNickNameNew', $kode))
                ->first();

            // Kalau yang diketik SKU pendek dan NPN ketemu, simpan kode resmi
            // (BOSnet) supaya semua laporan tetap konsisten satu identitas.
            $resolvedKode = $npn?->BOSnetszProductId ?? $kode;

            $conversion = $npn?->pcConversion();
            $baseUom = $satuan
                ?? $npn?->stagingUom()
                ?? 'CRT';
            $qtyPcs ??= ($conversion !== null && $qtyCrt !== null)
                ? $qtyCrt * $conversion
                : null;

            $attributes = [
                'source' => ReceivingItem::SOURCE_IMPORT,
                // Simpan kode resmi hasil resolusi NPN (bukan teks mentah SKU)
                // supaya join laporan CLUSTER/PRINCIPAL selalu cocok.
                'kode_barang' => $resolvedKode,
                'nama_barang' => $namaBarang ?? $npn?->szShortDescription ?? $npn?->szNickName ?? $kode,
                'actual_qty' => $qtyCrt,
                'expected_qty' => $qtyCrt,
                'qty_pcs' => $qtyPcs,
                'satuan' => $baseUom,
                'conversion_factor' => $conversion !== null ? (float) $conversion : null,
                'expired_date' => $expired,
                'tanggal_penerimaan' => $tanggalTerima,
                'sumber_material' => $sumber,
                'condition' => ReceivingItem::CONDITIONS[0],
                'scanned_by' => $this->user->id,
                'scan_time' => now(),
            ];

            $attributes = $this->user->depotAttributes($attributes);
            $attributes['kode_depo'] ??= $kodeDepo;
            $attributes['nama_depo'] ??= $namaDepo;

            // Cegah import ganda: batch (barang+depo+expired) yang sudah ada
            // di ledger — dari import sebelumnya maupun baris sebelumnya di
            // file ini — dilewati dan dihitung sebagai duplikat.
            $batchKey = implode('|', [$resolvedKode, $attributes['kode_depo'] ?? '', $expired]);
            if (isset($handled[$batchKey]) || isset($existing[$batchKey])) {
                $this->duplicates++;

                continue;
            }
            $handled[$batchKey] = true;
            $existing[$batchKey] = true;

            $item = ReceivingItem::create($attributes);
            $this->imported++;

            // Aturan baku: tiap baris ledger wajib tepat satu batch.
            // Kebal duplikat: batch diterbitkan hanya untuk baris baru.
            Batch::issueForReceivingItem($item);

            // Baris import ditambatkan ke minggu IMPORT (aturan baku: tanggal
            // file tidak menentukan minggu monitoring), jadi seluruh hasil
            // import selalu satu minggu — minggu berjalan.
            $weekStart = now()->startOfWeek(Carbon::MONDAY)->toDateString();
            $this->weeks[$weekStart] = ($this->weeks[$weekStart] ?? 0) + 1;
        }
    }

    public function rules(): array
    {
        return [
            // Jalur lama (kode_barang) tetap diterima, jalur baru (produk =
            // SKU pendek) ikut wajib salah satunya — validasi baris mentah di
            // collection() yang memutuskan skip vs simpan.
            'kode_barang' => ['nullable'],
            'produk' => ['nullable'],
            'qty_crt_zak' => ['nullable', 'numeric', 'min:0'],
            'qty_crt' => ['nullable', 'numeric', 'min:0'],
            'qty_dusball' => ['nullable', 'numeric', 'min:0'],
            'qty_dus_ball' => ['nullable', 'numeric', 'min:0'],
            'qty_pcs' => ['nullable', 'numeric', 'min:0'],
            'tgl_expired_date' => ['nullable'],
            'expired_date' => ['nullable'],
            'expired' => ['nullable'],
        ];
    }

    private function text(mixed $value): ?string
    {
        if ($value === null || trim((string) $value) === '') {
            return null;
        }

        return trim((string) $value);
    }

    private function number(mixed $value): ?float
    {
        if ($value === null || trim((string) $value) === '') {
            return null;
        }

        $normalized = str_replace([',', ' '], '', (string) $value);

        return is_numeric($normalized) ? (float) $normalized : null;
    }

    private function date(mixed $value): ?string
    {
        if ($value === null || trim((string) $value) === '') {
            return null;
        }

        try {
            $parsed = is_numeric($value)
                ? Date::excelToDateTimeObject((float) $value)
                : new \DateTime((string) $value);

            return $parsed->format('Y-m-d');
        } catch (\Exception) {
            return (string) $value;
        }
    }
}
