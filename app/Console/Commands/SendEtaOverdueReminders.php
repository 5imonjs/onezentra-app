<?php

namespace App\Console\Commands;

use App\Mail\EtaOverdueNotification;
use App\Models\EmailNotificationLog;
use App\Models\RencanaKirim;
use App\Services\EmailNotificationService;
use App\Services\Reminder\OverdueProcessService;
use Illuminate\Console\Command;

class SendEtaOverdueReminders extends Command
{
    protected $signature = 'reminders:send-eta-overdue';

    protected $description = 'Kirim pengingat untuk rencana kirim yang lewat ETA tetapi belum check-in';

    private const COOLDOWN_HOURS = 2;

    public function handle(OverdueProcessService $overdue, EmailNotificationService $emails): int
    {
        $sent = 0;

        foreach ($overdue->etaOverdueRencana() as $row) {
            /** @var RencanaKirim $row */
            if ($this->alreadyLogged($row->id)) {
                continue;
            }

            // Literal sengaja dipertahankan agar EmailTriggerRegistryTest bisa
            // memverifikasi trigger dinamis dari command ini.
            $trigger = 'eta_overdue';

            $emails->send(
                'rencana_kirim',
                $trigger,
                (object) ['id' => $row->id],
                new EtaOverdueNotification(
                    $row->po_transporter ?: ($row->nopol ?: "RK #{$row->id}"),
                    $row->nama_depo ?: ($row->kode_depo ?: '-'),
                    $row->eta_date?->toDateString() ?? '-',
                    max(1, (int) $row->eta_date?->diffInDays(now())),
                ),
                $row->kode_depo,
            );

            $sent++;
        }

        $this->info("Pengingat ETA terlewat terkirim: {$sent}");

        return self::SUCCESS;
    }

    private function alreadyLogged(int $contextId): bool
    {
        return EmailNotificationLog::query()
            ->where('document_type', 'rencana_kirim')
            ->where('trigger', 'eta_overdue')
            ->where('context_id', $contextId)
            ->where('created_at', '>=', now()->subHours(self::COOLDOWN_HOURS))
            ->exists();
    }
}
