<?php

namespace App\Imports;

use App\Models\Receiving;
use App\Models\ReceivingItem;
use App\Models\RencanaKirim;
use App\Models\SjValidation;
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

            // Samakan guard dengan ReceivingController@store: receiving hanya
            // dari rencana VERIFIED, dan satu RK hanya punya satu receiving berjalan.
            if ($rencanaKirim->status !== 'VERIFIED') {
                $rowErrors[] = ['row' => $rowNumber, 'errors' => "PO Transporter '{$poTransporter}' belum VERIFIED (saat ini: {$rencanaKirim->status})."];

                continue;
            }

            $alreadyRunning = Receiving::where('rencana_kirim_id', $rencanaKirim->id)
                ->whereIn('status', ['PENDING', 'IN_PROGRESS'])
                ->exists();

            if ($alreadyRunning) {
                $rowErrors[] = ['row' => $rowNumber, 'errors' => "PO Transporter '{$poTransporter}' sudah memiliki receiving yang berjalan."];

                continue;
            }

            $receiving = Receiving::create([
                'rencana_kirim_id' => $rencanaKirim->id,
                'total_expected_qty' => $rencanaKirim->items()->sum('jumlah'),
                'total_received_qty' => 0,
                'status' => 'PENDING',
                'checked_by' => $this->user->id,
            ]);

            // Salin item seperti store(): dari validasi SJ COMPLETED bila ada,
            // fallback dari rencana_kirim_items — actual dipakai sebagai received.
            $latestValidation = SjValidation::where('rencana_kirim_id', $rencanaKirim->id)
                ->where('status', 'COMPLETED')
                ->with('items')
                ->latest()
                ->first();

            if ($latestValidation && $latestValidation->items->count() > 0) {
                foreach ($latestValidation->items as $svItem) {
                    ReceivingItem::create([
                        'receiving_id' => $receiving->id,
                        'sj_validation_item_id' => $svItem->id,
                        'rencana_kirim_item_id' => $svItem->rencana_kirim_item_id,
                        'kode_barang' => $svItem->kode_barang,
                        'nama_barang' => $svItem->nama_barang,
                        'expected_qty' => $svItem->expected_qty,
                        'actual_qty' => $svItem->actual_qty,
                        'satuan' => $svItem->satuan,
                        'condition' => ReceivingItem::normalizeCondition($svItem->condition) ?? ReceivingItem::CONDITIONS[0],
                        'expired_date' => $svItem->expired_date,
                        'barcode' => $svItem->barcode,
                        'source' => ReceivingItem::SOURCE_VALIDASI,
                        'sumber_material' => $rencanaKirim->shipper_name,
                        'kode_depo' => $rencanaKirim->kode_depo,
                        'nama_depo' => $rencanaKirim->nama_depo,
                        'tanggal_penerimaan' => now()->toDateString(),
                    ]);
                }
            } else {
                foreach ($rencanaKirim->items as $ri) {
                    ReceivingItem::create([
                        'receiving_id' => $receiving->id,
                        'rencana_kirim_item_id' => $ri->id,
                        'kode_barang' => $ri->kode_barang,
                        'nama_barang' => $ri->nama_barang,
                        'expected_qty' => $ri->jumlah,
                        'actual_qty' => $ri->jumlah,
                        'satuan' => $ri->satuan,
                        'condition' => ReceivingItem::CONDITIONS[0],
                        'source' => ReceivingItem::SOURCE_VALIDASI,
                        'sumber_material' => $rencanaKirim->shipper_name,
                        'kode_depo' => $rencanaKirim->kode_depo,
                        'nama_depo' => $rencanaKirim->nama_depo,
                        'tanggal_penerimaan' => now()->toDateString(),
                    ]);
                }
            }

            $receiving->update([
                'total_received_qty' => $receiving->items()->sum('actual_qty'),
            ]);

            $rencanaKirim->update(['status' => 'IN_PROGRESS']);
            $this->imported++;
        }

        if ($rowErrors !== []) {
            $this->errors = $rowErrors;

            throw ReceivingImportFailed::withRowErrors($rowErrors);
        }
    }
}
