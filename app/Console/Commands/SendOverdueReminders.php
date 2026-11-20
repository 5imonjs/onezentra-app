<?php

namespace App\Console\Commands;

use App\Mail\ProcessReminderNotification;
use App\Models\EmailNotificationLog;
use App\Models\GateTransaction;
use App\Models\RencanaKirim;
use App\Models\SjValidation;
use App\Services\EmailNotificationService;
use App\Services\Reminder\OverdueProcessService;
use Illuminate\Console\Command;

class SendOverdueReminders extends Command
{
    protected $signature = 'reminders:send-overdue';

    protected $description = 'Kirim email pengingat otomatis untuk validasi SJ, gate, dan rencana kirim yang terlambat';

    /** Jeda minimum antar email reminder untuk dokumen yang sama. */
    private const COOLDOWN_HOURS = 2;

    /** Jumlah baris yang diproses per run (mencegah lonjakan email). */
    private const MAX_PER_RUN = 50;

    public function handle(OverdueProcessService $overdue, EmailNotificationService $emails): int
    {
        $sent = 0;

        foreach ($overdue->sjValidations(null, null, self::MAX_PER_RUN) as $row) {
            /** @var SjValidation $row */
            $sent += $this->sendOnce(
                $emails,
                'sj_ba',
                $row->id,
                'Validasi SJ belum selesai',
                $row->rencanaKirim?->po_transporter ?: $row->scan_code ?: "Validasi #{$row->id}",
                $this->depotOf($row->rencanaKirim?->kode_depo, $row->rencanaKirim?->nama_depo),
                $overdue->elapsedMinutes($row->started_at ?? $row->created_at),
                $row->rencanaKirim?->kode_depo,
            );
        }

        foreach ($overdue->gateTransactions(null, null, self::MAX_PER_RUN) as $row) {
            /** @var GateTransaction $row */
            $sent += $this->sendOnce(
                $emails,
                'gate',
                $row->id,
                'Kendaraan tertahan di gate',
                $row->nopol ?: ($row->po_transporter ?: "Gate #{$row->id}"),
                $this->depotOf($row->rencanaKirim?->kode_depo, $row->rencanaKirim?->nama_depo),
                $overdue->elapsedMinutes($row->scan_time ?? $row->created_at),
                $row->rencanaKirim?->kode_depo,
            );
        }

        foreach ($overdue->rencanaKirim(null, null, self::MAX_PER_RUN) as $row) {
            /** @var RencanaKirim $row */
            $sent += $this->sendOnce(
                $emails,
                'rencana_kirim',
                $row->id,
                'Rencana kirim belum diverifikasi',
                $row->po_transporter ?: ($row->nopol ?: "RK #{$row->id}"),
                $this->depotOf($row->kode_depo, $row->nama_depo),
                $overdue->elapsedMinutes($row->checked_in_at ?? $row->created_at),
                $row->kode_depo,
            );
        }

        $this->info("Pengingat terkirim: {$sent}");

        return self::SUCCESS;
    }

    private function sendOnce(
        EmailNotificationService $emails,
        string $documentType,
        int $contextId,
        string $processLabel,
        string $documentTitle,
        string $depot,
        int $elapsedMinutes,
        ?string $kodeDepo,
    ): int {
        if ($this->alreadyLogged($documentType, $contextId)) {
            return 0;
        }

        // Literal sengaja dipertahankan agar EmailTriggerRegistryTest bisa
        // memverifikasi trigger dinamis dari command ini.
        $trigger = 'reminder';

        $emails->send(
            $documentType,
            $trigger,
            (object) ['id' => $contextId],
            new ProcessReminderNotification($processLabel, $documentTitle, $depot, $elapsedMinutes),
            $kodeDepo,
        );

        return 1;
    }

    /**
     * Satu dokumen hanya diingatkan sekali dalam jendela cooldown, berapa pun
     * status log terakhirnya (sent/skipped/failed) agar tidak spam tiap 15 menit.
     */
    private function alreadyLogged(string $documentType, int $contextId): bool
    {
        return EmailNotificationLog::query()
            ->where('document_type', $documentType)
            ->where('trigger', 'reminder')
            ->where('context_id', $contextId)
            ->where('created_at', '>=', now()->subHours(self::COOLDOWN_HOURS))
            ->exists();
    }

    private function depotOf(?string $kodeDepo, ?string $namaDepo): string
    {
        if ($namaDepo) {
            return $namaDepo;
        }

        return $kodeDepo ?: '-';
    }
}
