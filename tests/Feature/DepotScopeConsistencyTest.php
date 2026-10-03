<?php

namespace Tests\Feature;

use App\Imports\ReceivingImport;
use App\Imports\ReceivingImportFailed;
use App\Models\Permission;
use App\Models\Receiving;
use App\Models\RencanaKirim;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Audit konsistensi scoping depo.
 *
 * Jejak undivided dari audit struktur: `authorizeDepot` di 6 controller
 * memakai pola sama, tapi tidak semua titik masuk memanggilnya. Test di
 * bawah menguji celah yang ditemukan, bukan mengulang(assert) yang sudah
 * ada di test lain.
 */
class DepotScopeConsistencyTest extends TestCase
{
    use RefreshDatabase;

    private function depotUser(string $kodeDepo, array $perms = ['receiving.import', 'receiving.view']): User
    {
        $role = Role::firstOrCreate(['slug' => 'staff_depot_'.$kodeDepo], ['name' => 'Depo '.$kodeDepo, 'slug' => 'staff_depot_'.$kodeDepo]);
        foreach ($perms as $slug) {
            $perm = Permission::firstOrCreate(['slug' => $slug], ['name' => $slug]);
            $role->permissions()->syncWithoutDetaching([$perm->id]);
        }

        $user = User::create([
            'email' => strtolower($kodeDepo).'-'.uniqid().'@example.com',
            'password' => 'password',
            'full_name' => 'User '.$kodeDepo,
            'kode_depo' => $kodeDepo,
            'nama_depo' => 'Depo '.$kodeDepo,
            'level' => 'staff_logistic',
            'status' => 'active',
        ]);
        $role->users()->attach($user->id);

        return $user->fresh();
    }

    /**
     * Import Receiving WAJIB me-scope per depo.
     *
     * `ReceivingImport` mencari RencanaKirim dengan filter `forUserDepot()` yang
     * sama dengan `ReceivingController@index`. Sebelum diperbaiki, pencarian itu
     * tanpa filter sama sekali — user depo A bisa mengetik nomor PO milik depo B
     * dan membuat Receiving yang tertaut ke sana. Baris itu lalu tidak muncul
     * di index miliknya sendiri, sehingga data hilang diam-diam.
     *
     * Test ini mengunci perilaku yang benar, sekaligus membuktikan filter itu
     * benar-benar bekerja dengan memanggil kelas import sungguhan.
     */
    public function test_import_menolak_po_lintas_depo(): void
    {
        $userA = $this->depotUser('AA');

        RencanaKirim::create([
            'po_transporter' => 'PO-B-001',
            'kode_depo' => 'BB',
            'nama_depo' => 'Depo BB',
            'status' => 'SCHEDULED',
        ]);

        $import = new ReceivingImport($userA);

        // Import all-or-nothing: satu baris tidak valid -> exception ->
        // rollback. Baris TIDAK dilewati diam-diam.
        try {
            $import->collection(collect([
                ['po_transporter' => 'PO-B-001', 'driver_name' => 'Driver B'],
            ]));
            $this->fail('Import seharusnya melempar exception, bukan lolos diam-diam.');
        } catch (ReceivingImportFailed $e) {
            $this->assertCount(1, $e->rowErrors);
        }

        $this->assertSame(0, $import->imported, 'PO depo lain tidak boleh ter-import');
        $this->assertDatabaseCount('receivings', 0);
    }

    /**
     * Least information disclosure: pesan error TIDAK boleh membocorkan bahwa
     * PO itu sebenarnya ada, cuma di depo lain.
     *
     * Kalau pesan menyebut "di depo Anda", user bisa melakukan existence
     * checking — mengetik nomor PO satu per satu untuk memetakan dokumen mana
     * yang milik depo lain. Karena itu pesan dibuat generik, dan test ini
     * mengunci kata-kata yang TIDAK boleh muncul.
     */
    public function test_pesan_error_tidak_membocorkan_kepemilikan_depo(): void
    {
        $userA = $this->depotUser('AA');

        RencanaKirim::create([
            'po_transporter' => 'PO-B-SECRET',
            'kode_depo' => 'BB',
            'nama_depo' => 'Depo BB',
            'status' => 'SCHEDULED',
        ]);

        $import = new ReceivingImport($userA);

        try {
            $import->collection(collect([['po_transporter' => 'PO-B-SECRET', 'driver_name' => 'X']]));
        } catch (ReceivingImportFailed $e) {
            $message = $e->rowErrors[0]['errors'];

            // Tidak boleh menyebut kata-kata ini.
            foreach (['depo Anda', 'depo lain', 'BB', 'milik', 'akses'] as $forbidden) {
                $this->assertStringNotContainsStringIgnoringCase(
                    $forbidden,
                    $message,
                    "Pesan error membocorkan informasi: menyebut '{$forbidden}'"
                );
            }

            $this->assertStringContainsString('tidak ditemukan', $message);
        }
    }

    /** PO milik depo sendiri tetap bisa di-import. */
    public function test_import_menerima_po_depo_sendiri(): void
    {
        $userA = $this->depotUser('AA');

        $rencana = RencanaKirim::create([
            'po_transporter' => 'PO-A-001',
            'kode_depo' => 'AA',
            'nama_depo' => 'Depo AA',
            'status' => 'SCHEDULED',
        ]);

        $import = new ReceivingImport($userA);
        $import->collection(collect([
            ['po_transporter' => 'PO-A-001', 'driver_name' => 'Driver A'],
        ]));

        $this->assertSame(1, $import->imported);
        $this->assertSame([], $import->errors);

        $receiving = Receiving::firstOrFail();
        $this->assertSame($rencana->id, $receiving->rencana_kirim_id);
        $this->assertSame('PENDING', $receiving->status);
    }

    /**
     * PO yang benar-benar tidak ada sama sekali (salah ketik).
     *
     * Kolom `rencana_kirim_id` di tabel `receivings` adalah NOT NULL. Versi
     * lama memakai `rencanaKirim?->id` sehingga null masuk ke DB dan gagal
     * dengan error SQL yang membingungkan. Sekarang baris ditolak dengan
     * pesan yang jelas, dan SELURUH import di-rollback.
     */
    public function test_import_po_tidak_ada_membatalkan_seluruh_file(): void
    {
        $userA = $this->depotUser('AA');

        $import = new ReceivingImport($userA);

        try {
            $import->collection(collect([
                ['po_transporter' => 'PO-NOT-EXIST', 'driver_name' => 'Typo Driver'],
            ]));
            $this->fail('Import seharusnya melempar exception.');
        } catch (ReceivingImportFailed $e) {
            $this->assertCount(1, $e->rowErrors);
            $this->assertStringContainsString('tidak ditemukan', $e->rowErrors[0]['errors']);
        }

        $this->assertDatabaseCount('receivings', 0);
    }

    /**
     * All-or-nothing: satu baris tidak valid membatalkan SELURUH file.
     *
     * Ini keputusan yang disengaja. Import sebagian meninggalkan data
     * setengah jadi: baris yang sudah masuk tidak bisa dibedakan dari yang
     * dicoba tapi gagal, dan tidak ada jejak untuk melacaknya. Menolak file
     * utuh dengan daftar baris bermasalah lebih mudah ditelusuri.
     *
     * Test ini juga mengunci bahwa baris SAH yang muncul lebih dulu ikut
     * ter-rollback.
     */
    /**
     * All-or-nothing di level CONTROLLER: DB::transaction di
     * ReceivingController@import yang melakukan rollback, bukan kelas import.
     *
     * Test ini sengaja memanggil collection() langsung DI DALAM transaction,
     * supaya perilakunya sama dengan jalur HTTP.
     */
    public function test_import_mixed_membatalkan_seluruh_file(): void
    {
        $userA = $this->depotUser('AA');

        RencanaKirim::create([
            'po_transporter' => 'PO-A-MIX',
            'kode_depo' => 'AA',
            'nama_depo' => 'Depo AA',
            'status' => 'SCHEDULED',
        ]);
        RencanaKirim::create([
            'po_transporter' => 'PO-B-MIX',
            'kode_depo' => 'BB',
            'nama_depo' => 'Depo BB',
            'status' => 'SCHEDULED',
        ]);

        $import = new ReceivingImport($userA);

        // Baris 1 SAH dan muncul lebih dulu — ia harus ikut ter-rollback.
        $thrown = false;

        try {
            DB::transaction(function () use ($import) {
                $import->collection(collect([
                    ['po_transporter' => 'PO-A-MIX', 'driver_name' => 'Driver A'],
                    ['po_transporter' => 'PO-B-MIX', 'driver_name' => 'Driver B'],
                    ['po_transporter' => 'PO-SALAH', 'driver_name' => 'Typo'],
                    ['po_transporter' => '', 'driver_name' => 'Kosong'],
                ]));
            });
        } catch (ReceivingImportFailed $e) {
            $thrown = true;
            // Ketiga baris salah dilaporkan sekaligus, supaya user bisa
            // memperbaiki semuanya dalam satu putaran.
            $this->assertCount(3, $e->rowErrors);
            $this->assertSame([3, 4, 5], array_column($e->rowErrors, 'row'));
        }

        $this->assertTrue($thrown, 'import sebagian tidak boleh lolos');
        $this->assertSame(1, $import->imported, 'baris sah sempat tercipta sebelum rollback');

        // Rollback: baris sah pun ikut hilang.
        $this->assertDatabaseCount('receivings', 0);
    }

    /**
     * Admin master (punya `depot.view_all`) tidak depo-scoped, jadi import
     * tetap lintas depo untuknya. Guard di sini tidak boleh ikut membatasi
     * akses admin.
     *
     * Catatan: `isDepotScoped()` ditentukan oleh permission `depot.view_all`,
     * BUKAN oleh field `level`. Mengganti `level` saja tidak membuat user
     * kehilangan scope — itu sebab test ini sempat gagal.
     */
    public function test_import_admin_master_tetap_lintas_depo(): void
    {
        $admin = $this->depotUser('AA');
        $viewAll = Permission::firstOrCreate(['slug' => 'depot.view_all'], ['name' => 'Lihat semua depo']);
        $admin->roles->first()->permissions()->syncWithoutDetaching([$viewAll->id]);
        $admin = $admin->fresh()->load('roles');

        $this->assertFalse(
            $admin->isDepotScoped(),
            'User dengan depot.view_all harus bebas akses lintas depo'
        );

        $rencana = RencanaKirim::create([
            'po_transporter' => 'PO-B-002',
            'kode_depo' => 'BB',
            'nama_depo' => 'Depo BB',
            'status' => 'SCHEDULED',
        ]);

        $import = new ReceivingImport($admin);
        $import->collection(collect([
            ['po_transporter' => 'PO-B-002', 'driver_name' => 'Driver B'],
        ]));

        $this->assertSame(1, $import->imported, 'Admin master tidak dibatasi depo');
        $this->assertSame($rencana->id, Receiving::firstOrFail()->rencana_kirim_id);
    }

    /**
     * Guard yang sudah benar: destroy & complete tetap menolak baris depo lain.
     * (Tidak ada route PUT /receivings — verifikasi dulu lewat route:list.)
     */
    public function test_destroy_receiving_menolak_baris_depo_lain(): void
    {
        $userA = $this->depotUser('AA', ['receiving.delete']);
        Sanctum::actingAs($userA);

        $rencanaB = RencanaKirim::create([
            'po_transporter' => 'PO-B-002',
            'kode_depo' => 'BB',
            'nama_depo' => 'Depo BB',
            'status' => 'SCHEDULED',
        ]);
        $receivingB = Receiving::create([
            'rencana_kirim_id' => $rencanaB->id,
            'po_transporter' => 'PO-B-002',
            'status' => 'PENDING',
            'kode_depo' => 'BB',
        ]);

        $this->deleteJson("/api/v1/receivings/{$receivingB->id}")->assertStatus(403);

        $this->assertDatabaseHas('receivings', ['id' => $receivingB->id]);
    }

    public function test_complete_receiving_menolak_baris_depo_lain(): void
    {
        $userA = $this->depotUser('AA', ['receiving.edit']);
        Sanctum::actingAs($userA);

        $rencanaB = RencanaKirim::create([
            'po_transporter' => 'PO-B-003',
            'kode_depo' => 'BB',
            'nama_depo' => 'Depo BB',
            'status' => 'SCHEDULED',
        ]);
        $receivingB = Receiving::create([
            'rencana_kirim_id' => $rencanaB->id,
            'po_transporter' => 'PO-B-003',
            'status' => 'PENDING',
            'kode_depo' => 'BB',
        ]);

        $this->postJson("/api/v1/receivings/{$receivingB->id}/complete")->assertStatus(403);
    }
}
