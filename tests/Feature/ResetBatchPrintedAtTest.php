<?php

namespace Tests\Feature;

use App\Models\Batch;
use App\Models\RencanaKirim;
use App\Models\RencanaKirimItem;
use App\Models\SjValidation;
use App\Models\SjValidationItem;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ResetBatchPrintedAtTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    private int $itemSequence = 0;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::create([
            'email' => 'reset-'.uniqid().'@example.com',
            'password' => 'password',
            'full_name' => 'Reset Test User',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'level' => 'admin_master',
            'status' => 'active',
        ]);
    }

    /** Batch tercetak milik sesi validasi dengan status tertentu. */
    private function batchFor(string $validationStatus, bool $printed = true): Batch
    {
        $rk = RencanaKirim::create([
            'po_transporter' => 'PO-RESET-'.uniqid(),
            'rkh_date' => now()->toDateString(),
            'status' => 'SCHEDULED',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'created_by' => $this->user->id,
        ]);

        $this->itemSequence++;

        $rkItem = RencanaKirimItem::create([
            'rencana_kirim_id' => $rk->id,
            'item_number' => $this->itemSequence,
            'kode_barang' => 'SKU-RESET-'.$this->itemSequence,
            'nama_barang' => 'Barang Reset',
            'jumlah' => 10,
            'satuan' => 'CRT',
            'created_by' => $this->user->id,
        ]);

        $validation = SjValidation::create([
            'rencana_kirim_id' => $rk->id,
            'validated_by' => $this->user->id,
            'scan_code' => $rk->po_transporter,
            'status' => $validationStatus,
            'started_at' => now(),
        ]);

        $item = SjValidationItem::create([
            'sj_validation_id' => $validation->id,
            'rencana_kirim_item_id' => $rkItem->id,
            'kode_barang' => $rkItem->kode_barang,
            'nama_barang' => $rkItem->nama_barang,
            'expected_qty' => 10,
            'actual_qty' => 10,
            'status' => 'VALIDATED',
        ]);

        return Batch::create([
            'batch_number' => 'BATCH-RESET-'.uniqid(),
            'barcode_label' => 'LBL-RESET-'.uniqid(),
            'sj_validation_item_id' => $item->id,
            'status' => 'ACTIVE',
            'printed_at' => $printed ? now() : null,
        ]);
    }

    public function test_default_resets_only_printed_batches_of_in_progress_sessions(): void
    {
        $inProgress = $this->batchFor('IN_PROGRESS');
        $completed = $this->batchFor('COMPLETED');
        $unprinted = $this->batchFor('IN_PROGRESS', printed: false);

        $this->artisan('batches:reset-printed')->assertSuccessful();

        $this->assertNull($inProgress->fresh()->printed_at);
        // Sesi selesai lolos hard gate cetak, jadi labelnya dianggap benar tercetak.
        $this->assertNotNull($completed->fresh()->printed_at);
        $this->assertNull($unprinted->fresh()->printed_at);
    }

    public function test_status_option_targets_other_statuses(): void
    {
        $inProgress = $this->batchFor('IN_PROGRESS');
        $completed = $this->batchFor('COMPLETED');

        $this->artisan('batches:reset-printed', ['--status' => 'COMPLETED'])->assertSuccessful();

        $this->assertNotNull($inProgress->fresh()->printed_at);
        $this->assertNull($completed->fresh()->printed_at);
    }

    public function test_validation_option_targets_a_single_session(): void
    {
        $target = $this->batchFor('COMPLETED');
        $other = $this->batchFor('IN_PROGRESS');

        $this->artisan('batches:reset-printed', [
            '--validation' => $target->validationItem->sj_validation_id,
        ])->assertSuccessful();

        $this->assertNull($target->fresh()->printed_at);
        $this->assertNotNull($other->fresh()->printed_at);
    }

    public function test_all_option_resets_every_printed_batch(): void
    {
        $inProgress = $this->batchFor('IN_PROGRESS');
        $completed = $this->batchFor('COMPLETED');

        $this->artisan('batches:reset-printed', ['--all' => true])->assertSuccessful();

        $this->assertNull($inProgress->fresh()->printed_at);
        $this->assertNull($completed->fresh()->printed_at);
    }

    public function test_dry_run_changes_nothing(): void
    {
        $batch = $this->batchFor('IN_PROGRESS');

        $this->artisan('batches:reset-printed', ['--dry-run' => true])->assertSuccessful();

        $this->assertNotNull($batch->fresh()->printed_at);
    }
}
