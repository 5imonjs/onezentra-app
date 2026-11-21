<?php

namespace App\Services;

use App\Mail\OpnameExpiredNotification;
use App\Models\ApprovalHistory;
use App\Models\OpnameExpiredSession;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Siklus keputusan sesi opname: penghitung lapangan hanya mengisi hitungan,
 * approver independen memvalidasi langsung; koreksi wave berlaku saat
 * disetujui. Tidak ada tahap "minta persetujuan" dari sisi petugas.
 * Jejak audit transisi dicatat ke ApprovalHistory.
 */
class OpnameSessionLifecycleService
{
    public function __construct(
        private EmailNotificationService $emailService,
        private OpnameExpiredService $opnameService,
    ) {}

    /**
     * Petugas menandai seluruh input selesai. Bukan approval: status tidak
     * berubah dan koreksi belum berlaku — ini hanya sinyal ke web bahwa semua
     * baris sudah dihitung dan siap divalidasi.
     */
    public function markInputComplete(OpnameExpiredSession $session, User $officer): OpnameExpiredSession
    {
        $refreshed = DB::transaction(function () use ($session, $officer): OpnameExpiredSession {
            $locked = OpnameExpiredSession::whereKey($session->id)->lockForUpdate()->firstOrFail();

            $this->ensureStatus($locked, [
                OpnameExpiredSession::STATUS_IN_PROGRESS,
                OpnameExpiredSession::STATUS_REVISI,
            ]);
            $this->ensureOfficer($locked, $officer);

            $unverified = $locked->items()->whereNull('verified_at')->count();
            if ($unverified > 0) {
                throw ValidationException::withMessages([
                    'items' => "Masih ada {$unverified} baris belum dihitung sebelum ditandai selesai.",
                ]);
            }

            if ($locked->input_completed_at === null) {
                $from = $locked->status;
                $locked->update(['input_completed_at' => now()]);
                $refreshed = $locked->refresh();
                $this->recordHistory($refreshed, $from, 'input_complete', null, $officer);
            } else {
                // Idempoten: petugas menekan dua kali tidak menggandakan jejak.
                $refreshed = $locked->refresh();
            }

            return $refreshed;
        }, 5);

        $session->setRawAttributes($refreshed->getAttributes(), true);
        $session->syncOriginal();

        // Pemberitahuan sekali selesai ke BLC (konfigurasi dari Penerima Email).
        // Alih-alih dikirim dari mobile — server punya template eksternal.
        $this->notify($refreshed, 'input_completed');

        return $refreshed;
    }

    /**
     * Approver menyetujui hasil hitung: koreksi diterapkan ke wave dan wave
     * menjadi validated. Pemutus wajib ≠ penghitung (segregation of duties).
     */
    public function approve(OpnameExpiredSession $session, User $approver): OpnameExpiredSession
    {
        $refreshed = DB::transaction(function () use ($session, $approver): OpnameExpiredSession {
            $locked = OpnameExpiredSession::whereKey($session->id)->lockForUpdate()->firstOrFail();

            $this->ensureStatus($locked, [
                OpnameExpiredSession::STATUS_IN_PROGRESS,
                OpnameExpiredSession::STATUS_REVISI,
                // Sesi lama yang sudah dikirim tetap bisa diselesaikan.
                OpnameExpiredSession::STATUS_PENDING_APPROVAL,
            ]);
            $this->ensureDecider($locked, $approver);

            $unverified = $locked->items()->whereNull('verified_at')->count();
            if ($unverified > 0) {
                throw ValidationException::withMessages([
                    'items' => "Masih ada {$unverified} baris belum dihitung sebelum divalidasi.",
                ]);
            }

            $from = $locked->status;

            // Koreksi wave diterapkan pada transaksi yang sama dengan
            // keputusan: approval gagal berarti tidak ada koreksi setengah
            // jalan.
            $this->opnameService->applyApprovedCorrections($locked, $approver);

            $locked->update([
                'status' => OpnameExpiredSession::STATUS_APPROVED,
                'decided_by' => $approver->id,
                'decided_at' => now(),
                'completed_at' => now(),
                'decision_note' => null,
            ]);

            $refreshed = $locked->refresh();
            $this->recordHistory($refreshed, $from, 'approve', null, $approver);

            return $refreshed;
        }, 5);

        $session->setRawAttributes($refreshed->getAttributes(), true);
        $session->syncOriginal();

        $this->notify($refreshed, 'approved');

        return $refreshed;
    }

    /**
     * Approver menolak/minta perbaikan: sesi kembali ke petugas dengan
     * catatan wajib. Hasil hitung lama dipertahankan — petugas
     * memperbaiki baris yang ditandai, tidak menghitung dari nol.
     */
    public function revise(OpnameExpiredSession $session, User $approver, string $reason): OpnameExpiredSession
    {
        $refreshed = DB::transaction(function () use ($session, $approver, $reason): OpnameExpiredSession {
            $locked = OpnameExpiredSession::whereKey($session->id)->lockForUpdate()->firstOrFail();

            $this->ensureStatus($locked, [
                OpnameExpiredSession::STATUS_IN_PROGRESS,
                // Sesi lama yang sudah dikirim tetap bisa direvisi.
                OpnameExpiredSession::STATUS_PENDING_APPROVAL,
            ]);
            $this->ensureDecider($locked, $approver);

            $from = $locked->status;

            $locked->update([
                'status' => OpnameExpiredSession::STATUS_REVISI,
                'decided_by' => null,
                'decided_at' => null,
                'decision_note' => $reason,
                // Input harus ditandai selesai lagi setelah perbaikan.
                'input_completed_at' => null,
            ]);

            $refreshed = $locked->refresh();
            $this->recordHistory($refreshed, $from, 'revise', $reason, $approver);

            return $refreshed;
        }, 5);

        $session->setRawAttributes($refreshed->getAttributes(), true);
        $session->syncOriginal();

        $this->notify($refreshed, 'revisi');

        return $refreshed;
    }

    /**
     * Hanya petugas yang ditugaskan yang boleh menandai input selesai.
     */
    private function ensureOfficer(OpnameExpiredSession $session, User $actor): void
    {
        abort_unless($session->assigned_to === $actor->id, 403, 'Hanya petugas yang ditugaskan yang dapat menandai input selesai.');
    }

    /**
     * Segregasi tugas: penghitung (assignee) tidak boleh memutuskan koreksi
     * atas hasil hitungannya sendiri.
     */
    private function ensureDecider(OpnameExpiredSession $session, User $actor): void
    {
        abort_if($session->assigned_to === $actor->id, 403, 'Penghitung sesi tidak boleh memvalidasi hasil hitungannya sendiri.');
    }

    /**
     * @param  array<int, string>  $allowed
     */
    private function ensureStatus(OpnameExpiredSession $session, array $allowed): void
    {
        if (! in_array($session->status, $allowed, true)) {
            throw ValidationException::withMessages(['status' => 'Sesi tidak dapat diproses pada tahap ini.']);
        }
    }

    /**
     * Catat jejak audit append-only setiap transisi agar riwayat validasi /
     * revisi tidak hilang ditimpa siklus berikutnya.
     */
    private function recordHistory(OpnameExpiredSession $session, string $from, string $action, ?string $reason, User $actor): void
    {
        ApprovalHistory::create([
            'subject_type' => $session::class,
            'subject_id' => $session->getKey(),
            'from_status' => $from,
            'to_status' => $session->status,
            'action' => $action,
            'reason' => $reason,
            'actor_id' => $actor->id,
        ]);
    }

    private function notify(OpnameExpiredSession $session, string $trigger): void
    {
        $fresh = $session->refresh()->load(['submitter', 'decider']);

        $this->emailService->send(
            'opname_expired',
            $trigger,
            $fresh,
            new OpnameExpiredNotification($trigger, substr((string) $fresh->week_start, 0, 10), [[
                'kode_depo' => $fresh->kode_depo,
                'nama_depo' => $fresh->nama_depo,
                'total' => $fresh->items()->count(),
                'validated' => in_array($trigger, ['approved', 'input_completed'])
                    ? $fresh->items()->count()
                    : 0,
                'submitted' => in_array($trigger, ['submitted', 'input_completed']),
                'decision_note' => $trigger === 'revisi' ? $fresh->decision_note : null,
                'input_completed' => $trigger === 'input_completed',
            ]]),
            $fresh->kode_depo
        );
    }
}
