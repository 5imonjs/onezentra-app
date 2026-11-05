<?php

namespace Tests\Feature;

use App\Models\OpnameExpiredWave;
use App\Models\ReceivingItem;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Auto-generate wave opname expired (scheduler Senin pagi atau manual):
 * rantai roll-forward mingguan tidak boleh bergantung seseorang mengingat
 * klik "Generate" — satu minggu yang lolos membuat stok minggu lalu tidak
 * terbawa ke snapshot minggu berikutnya.
 */
class GenerateOpnameExpiredCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_command_generates_current_week_waves_including_legacy_safe(): void
    {
        $this->travelTo('2026-09-09 10:00:00');

        $planner = User::create([
            'email' => 'cron-opname@test.com',
            'password' => 'password',
            'full_name' => 'Cron Opname',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'level' => 'staff_logistic',
            'status' => 'active',
        ]);

        ReceivingItem::create([
            'source' => 'IMPORT_MANUAL',
            'kode_barang' => 'B-CRON-01',
            'nama_barang' => 'Produk Cron',
            'actual_qty' => 12,
            'expected_qty' => 12,
            'qty_pcs' => 12,
            'satuan' => 'CRT',
            'expired_date' => '2027-05-01',
            'tanggal_penerimaan' => '2026-09-09',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'condition' => 'FISIK_BAGUS',
            'scanned_by' => $planner->id,
        ]);

        $this->artisan('opname-expired:generate')->assertSuccessful();

        $wave = OpnameExpiredWave::where('week_start', '2026-09-07')
            ->where('kode_barang', 'B-CRON-01')->first();
        $this->assertNotNull($wave);
        $this->assertNotNull($wave->sisa_hari);
        $this->assertNotNull($wave->status_ini);
    }

    public function test_command_accepts_explicit_week_option(): void
    {
        $this->travelTo('2026-09-09 10:00:00');

        $planner = User::create([
            'email' => 'cron-opname-2@test.com',
            'password' => 'password',
            'full_name' => 'Cron Opname 2',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'level' => 'staff_logistic',
            'status' => 'active',
        ]);

        ReceivingItem::create([
            // VALIDASI_SJ: jangkar minggu = tanggal_penerimaan aktual
            // (IMPORT_MANUAL berjangkar ke scan_time/created_at = hari ini,
            // tidak pernah masuk rentang minggu lampau).
            'source' => ReceivingItem::SOURCE_VALIDASI,
            'kode_barang' => 'B-CRON-02',
            'nama_barang' => 'Produk Cron 2',
            'actual_qty' => 4,
            'expected_qty' => 4,
            'qty_pcs' => 4,
            'satuan' => 'CRT',
            'expired_date' => '2027-01-15',
            // Penerimaan minggu SEBELUMNYA: sasaran generate minggu 2026-08-31.
            'tanggal_penerimaan' => '2026-09-02',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'condition' => 'FISIK_BAGUS',
            'scanned_by' => $planner->id,
        ]);

        $this->artisan('opname-expired:generate', ['--week' => '2026-08-31'])->assertSuccessful();

        $this->assertDatabaseHas('opname_expired_waves', [
            'week_start' => '2026-08-31',
            'kode_barang' => 'B-CRON-02',
            'qty_ini_crt' => '4.00',
        ]);
        $this->assertDatabaseMissing('opname_expired_waves', ['week_start' => '2026-09-07']);
    }

    public function test_scheduler_is_registered_weekly(): void
    {
        $this->artisan('schedule:list')
            ->expectsOutputToContain('opname-expired:generate')
            ->assertSuccessful();
    }
}
