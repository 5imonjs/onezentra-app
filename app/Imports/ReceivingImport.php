<?php

namespace App\Imports;

use App\Models\Receiving;
use App\Models\RencanaKirim;
use App\Models\User;
use Illuminate\Support\Collection;
use Maatwebsite\Excel\Concerns\ToCollection;
use Maatwebsite\Excel\Concerns\WithHeadingRow;

class ReceivingImport implements ToCollection, WithHeadingRow
{
    public int $imported = 0;

    public int $updated = 0;

    public array $errors = [];

    public int $totalRows = 0;

    /**
     * User pemilik import — WAJIB, bukan nullable.
     *
     * Fail-open (user null berarti tanpa filter) adalah anti-pattern di
     * security: satu pemanggil yang lupa mengirim user akan diam-diam membuka
     * akses lintas depo. Dengan parameter wajib, kesalahan itu ketahuan saat
     * review kode dan pada development, bukan saat data bocor.
     *
     * Import hanya boleh dipanggil dalam konteks yang punya user. Kalau
     * dibutuhkan CLI, pemanggil wajib membuat user secara eksplisit.
     */
    public function __construct(private readonly User $user) {}

    /**
     * Dilempar saat ada baris yang gagal, supaya seluruh import di-rollback.
     *
     * Import bersifat all-or-nothing: setengah import menghasilkan data yang
     * tidak lengkap tanpa jejak yang jelas. Maatwebsite\Excel memproses file
     * baris per baris di dalam blok try miliknya, sehingga exception dari
     * sini aman untuk meneruskan ke rollback transaction di pemanggil.
     *
     * Pesannya sengaja GENERIK. Kalau menyebut "tidak ditemukan di depo
     * Anda", user bisa-existence checking: mengetik satu per satu untuk
     * memetakan PO mana yang milik depo lain. Prinsip least information
     * disclosure lebih diutamakan daripada kejelasan pesan.
     */
    public function collection(Collection $rows): void
    {
        $rowErrors = [];

        foreach ($rows as $index => $row) {
            $this->totalRows++;
            $rowNumber = $index + 2;

            $poTransporter = trim((string) ($row['po_transporter'] ?? ''));
            $driverName = trim((string) ($row['driver_name'] ?? ''));

            if (! $poTransporter) {
                $rowErrors[] = ['row' => $rowNumber, 'errors' => 'PO Transporter wajib diisi'];

                continue;
            }

            // WAJIB me-scope per depo. Tanpa ini, user depo A bisa mengaitkan
            // Receiving miliknya ke RencanaKirim milik depo B hanya dengan
            // mengetik nomor PO-nya.
            //
            // Query ini sengaja identik dengan filter pada
            // ReceivingController@index, sehingga apa yang terlihat di daftar
            // selalu sama dengan apa yang bisa di-import.
            $rencanaKirim = RencanaKirim::query()
                ->where('po_transporter', $poTransporter)
                ->when($this->user->isDepotScoped(), fn ($query) => $query->forUserDepot($this->user))
                ->first();

            if (! $rencanaKirim) {
                // GENERIK: tidak menyebut kolom mana yang tidak cocok.
                $rowErrors[] = ['row' => $rowNumber, 'errors' => "PO Transporter '{$poTransporter}' tidak ditemukan."];

                continue;
            }

            Receiving::create([
                'rencana_kirim_id' => $rencanaKirim->id,
                'po_transporter' => $poTransporter,
                'driver_name' => $driverName,
                'status' => 'PENDING',
                // CATATAN: `kode_depo` sengaja tidak di-set. Kolom itu tidak ada
                // di tabel `receivings`; depo baris diturunkan dari relasi rencana.
            ]);
            $this->imported++;
        }

        if ($rowErrors !== []) {
            $this->errors = $rowErrors;

            throw ReceivingImportFailed::withRowErrors($rowErrors);
        }
    }
}
