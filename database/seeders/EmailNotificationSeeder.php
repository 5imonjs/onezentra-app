<?php

namespace Database\Seeders;

use App\Models\EmailRecipient;
use Illuminate\Database\Seeder;

class EmailNotificationSeeder extends Seeder
{
    public function run(): void
    {
        EmailRecipient::updateOrCreate(
            ['document_type' => 'rencana_kirim', 'trigger' => 'created', 'field' => 'TO', 'recipient_type' => 'role', 'role_slug' => 'blc'],
            ['label' => 'BLC penerima rencana kirim', 'is_active' => true]
        );
        EmailRecipient::updateOrCreate(
            ['document_type' => 'rencana_kirim', 'trigger' => 'created', 'field' => 'CC', 'recipient_type' => 'role', 'role_slug' => 'cheker'],
            ['label' => 'CC cheker depo penerima', 'is_active' => true]
        );
        EmailRecipient::updateOrCreate(
            ['document_type' => 'rencana_kirim', 'trigger' => 'cancelled', 'field' => 'TO', 'recipient_type' => 'role', 'role_slug' => 'blc'],
            ['label' => 'BLC penerima pembatalan rencana kirim', 'is_active' => true]
        );
        EmailRecipient::updateOrCreate(
            ['document_type' => 'rencana_kirim', 'trigger' => 'cancelled', 'field' => 'CC', 'recipient_type' => 'role', 'role_slug' => 'cheker'],
            ['label' => 'CC cheker depo pembatalan rencana kirim', 'is_active' => true]
        );

        EmailRecipient::updateOrCreate(
            ['document_type' => 'sj_ba', 'trigger' => 'validated', 'field' => 'TO', 'recipient_type' => 'role', 'role_slug' => 'blc'],
            ['label' => 'BLC penerima hasil validasi dokumen', 'is_active' => true]
        );
        EmailRecipient::updateOrCreate(
            ['document_type' => 'sj_ba', 'trigger' => 'validated', 'field' => 'CC', 'recipient_type' => 'role', 'role_slug' => 'admin_distirbusi'],
            ['label' => 'CC admin distribusi', 'is_active' => true]
        );

        EmailRecipient::updateOrCreate(
            ['document_type' => 'receiving', 'trigger' => 'completed', 'field' => 'TO', 'recipient_type' => 'role', 'role_slug' => 'blc'],
            ['label' => 'BLC penerima info selesai bongkar', 'is_active' => true]
        );
        EmailRecipient::updateOrCreate(
            ['document_type' => 'receiving', 'trigger' => 'completed', 'field' => 'CC', 'recipient_type' => 'role', 'role_slug' => 'admin_distirbusi'],
            ['label' => 'CC admin distribusi info selesai bongkar', 'is_active' => true]
        );

        // Selisih qty notifications
        EmailRecipient::updateOrCreate(
            ['document_type' => 'selisih', 'trigger' => 'selisih_qty', 'field' => 'TO', 'recipient_type' => 'role', 'role_slug' => 'blc'],
            ['label' => 'BLC notifikasi selisih qty', 'is_active' => true]
        );
        EmailRecipient::updateOrCreate(
            ['document_type' => 'selisih', 'trigger' => 'selisih_qty', 'field' => 'CC', 'recipient_type' => 'role', 'role_slug' => 'admin_distirbusi'],
            ['label' => 'CC admin distribusi notifikasi selisih qty', 'is_active' => true]
        );

        // Standarisasi Tumpukan notifications
        EmailRecipient::updateOrCreate(
            ['document_type' => 'standarisasi_tumpukan', 'trigger' => 'submitted', 'field' => 'TO', 'recipient_type' => 'role', 'role_slug' => 'blc'],
            ['label' => 'BLC notifikasi standarisasi diajukan', 'is_active' => true]
        );
        EmailRecipient::updateOrCreate(
            ['document_type' => 'standarisasi_tumpukan', 'trigger' => 'submitted', 'field' => 'CC', 'recipient_type' => 'role', 'role_slug' => 'admin_distirbusi'],
            ['label' => 'CC admin distribusi standarisasi diajukan', 'is_active' => true]
        );
        EmailRecipient::updateOrCreate(
            ['document_type' => 'standarisasi_tumpukan', 'trigger' => 'approved', 'field' => 'TO', 'recipient_type' => 'role', 'role_slug' => 'blc'],
            ['label' => 'BLC notifikasi standarisasi disetujui', 'is_active' => true]
        );
        EmailRecipient::updateOrCreate(
            ['document_type' => 'standarisasi_tumpukan', 'trigger' => 'approved', 'field' => 'CC', 'recipient_type' => 'role', 'role_slug' => 'admin_distirbusi'],
            ['label' => 'CC admin distribusi standarisasi disetujui', 'is_active' => true]
        );
        EmailRecipient::updateOrCreate(
            ['document_type' => 'standarisasi_tumpukan', 'trigger' => 'rejected', 'field' => 'TO', 'recipient_type' => 'role', 'role_slug' => 'blc'],
            ['label' => 'BLC notifikasi standarisasi ditolak', 'is_active' => true]
        );
        EmailRecipient::updateOrCreate(
            ['document_type' => 'standarisasi_tumpukan', 'trigger' => 'rejected', 'field' => 'CC', 'recipient_type' => 'role', 'role_slug' => 'admin_distirbusi'],
            ['label' => 'CC admin distribusi standarisasi ditolak', 'is_active' => true]
        );

        // Biaya THL notifications
        EmailRecipient::updateOrCreate(
            ['document_type' => 'biaya_thl', 'trigger' => 'submitted', 'field' => 'TO', 'recipient_type' => 'role', 'role_slug' => 'blc'],
            ['label' => 'BLC notifikasi pengajuan THL', 'is_active' => true]
        );
        EmailRecipient::updateOrCreate(
            ['document_type' => 'biaya_thl', 'trigger' => 'submitted', 'field' => 'CC', 'recipient_type' => 'role', 'role_slug' => 'cheker'],
            ['label' => 'CC cheker pengajuan THL', 'is_active' => true]
        );
        EmailRecipient::updateOrCreate(
            ['document_type' => 'biaya_thl', 'trigger' => 'checked', 'field' => 'TO', 'recipient_type' => 'role', 'role_slug' => 'blc'],
            ['label' => 'BLC notifikasi THL diperiksa', 'is_active' => true]
        );
        EmailRecipient::updateOrCreate(
            ['document_type' => 'biaya_thl', 'trigger' => 'checked', 'field' => 'CC', 'recipient_type' => 'role', 'role_slug' => 'cheker'],
            ['label' => 'CC cheker THL diperiksa', 'is_active' => true]
        );
        EmailRecipient::updateOrCreate(
            ['document_type' => 'biaya_thl', 'trigger' => 'rlh_approved', 'field' => 'TO', 'recipient_type' => 'role', 'role_slug' => 'blc'],
            ['label' => 'BLC notifikasi THL disetujui RLH', 'is_active' => true]
        );
        EmailRecipient::updateOrCreate(
            ['document_type' => 'biaya_thl', 'trigger' => 'rlh_approved', 'field' => 'CC', 'recipient_type' => 'role', 'role_slug' => 'rlh'],
            ['label' => 'CC RLH notifikasi THL disetujui', 'is_active' => true]
        );
        EmailRecipient::updateOrCreate(
            ['document_type' => 'biaya_thl', 'trigger' => 'approved', 'field' => 'TO', 'recipient_type' => 'role', 'role_slug' => 'blc'],
            ['label' => 'BLC notifikasi THL disetujui', 'is_active' => true]
        );
        EmailRecipient::updateOrCreate(
            ['document_type' => 'biaya_thl', 'trigger' => 'approved', 'field' => 'CC', 'recipient_type' => 'role', 'role_slug' => 'rfah'],
            ['label' => 'CC RFAH notifikasi THL disetujui', 'is_active' => true]
        );
        EmailRecipient::updateOrCreate(
            ['document_type' => 'biaya_thl', 'trigger' => 'rejected', 'field' => 'TO', 'recipient_type' => 'role', 'role_slug' => 'blc'],
            ['label' => 'BLC notifikasi THL ditolak', 'is_active' => true]
        );
        EmailRecipient::updateOrCreate(
            ['document_type' => 'biaya_thl', 'trigger' => 'rejected', 'field' => 'CC', 'recipient_type' => 'role', 'role_slug' => 'rfah'],
            ['label' => 'CC RFAH notifikasi THL ditolak', 'is_active' => true]
        );
        EmailRecipient::updateOrCreate(
            ['document_type' => 'biaya_thl', 'trigger' => 'revisi', 'field' => 'TO', 'recipient_type' => 'role', 'role_slug' => 'blc'],
            ['label' => 'BLC notifikasi THL revisi', 'is_active' => true]
        );
        EmailRecipient::updateOrCreate(
            ['document_type' => 'biaya_thl', 'trigger' => 'revisi', 'field' => 'CC', 'recipient_type' => 'role', 'role_slug' => 'rfah'],
            ['label' => 'CC RFAH notifikasi THL revisi', 'is_active' => true]
        );

        // Biaya Retribusi notifications
        EmailRecipient::updateOrCreate(
            ['document_type' => 'biaya_retribusi', 'trigger' => 'submitted', 'field' => 'TO', 'recipient_type' => 'role', 'role_slug' => 'blc'],
            ['label' => 'BLC notifikasi pengajuan Retribusi', 'is_active' => true]
        );
        EmailRecipient::updateOrCreate(
            ['document_type' => 'biaya_retribusi', 'trigger' => 'submitted', 'field' => 'CC', 'recipient_type' => 'role', 'role_slug' => 'cheker'],
            ['label' => 'CC cheker pengajuan Retribusi', 'is_active' => true]
        );
        EmailRecipient::updateOrCreate(
            ['document_type' => 'biaya_retribusi', 'trigger' => 'checked', 'field' => 'TO', 'recipient_type' => 'role', 'role_slug' => 'blc'],
            ['label' => 'BLC notifikasi Retribusi diperiksa', 'is_active' => true]
        );
        EmailRecipient::updateOrCreate(
            ['document_type' => 'biaya_retribusi', 'trigger' => 'checked', 'field' => 'CC', 'recipient_type' => 'role', 'role_slug' => 'cheker'],
            ['label' => 'CC cheker Retribusi diperiksa', 'is_active' => true]
        );
        EmailRecipient::updateOrCreate(
            ['document_type' => 'biaya_retribusi', 'trigger' => 'rlh_approved', 'field' => 'TO', 'recipient_type' => 'role', 'role_slug' => 'blc'],
            ['label' => 'BLC notifikasi Retribusi disetujui RLH', 'is_active' => true]
        );
        EmailRecipient::updateOrCreate(
            ['document_type' => 'biaya_retribusi', 'trigger' => 'rlh_approved', 'field' => 'CC', 'recipient_type' => 'role', 'role_slug' => 'rlh'],
            ['label' => 'CC RLH notifikasi Retribusi disetujui', 'is_active' => true]
        );
        EmailRecipient::updateOrCreate(
            ['document_type' => 'biaya_retribusi', 'trigger' => 'approved', 'field' => 'TO', 'recipient_type' => 'role', 'role_slug' => 'blc'],
            ['label' => 'BLC notifikasi Retribusi disetujui', 'is_active' => true]
        );
        EmailRecipient::updateOrCreate(
            ['document_type' => 'biaya_retribusi', 'trigger' => 'approved', 'field' => 'CC', 'recipient_type' => 'role', 'role_slug' => 'rfah'],
            ['label' => 'CC RFAH notifikasi Retribusi disetujui', 'is_active' => true]
        );
        EmailRecipient::updateOrCreate(
            ['document_type' => 'biaya_retribusi', 'trigger' => 'rejected', 'field' => 'TO', 'recipient_type' => 'role', 'role_slug' => 'blc'],
            ['label' => 'BLC notifikasi Retribusi ditolak', 'is_active' => true]
        );
        EmailRecipient::updateOrCreate(
            ['document_type' => 'biaya_retribusi', 'trigger' => 'rejected', 'field' => 'CC', 'recipient_type' => 'role', 'role_slug' => 'rfah'],
            ['label' => 'CC RFAH notifikasi Retribusi ditolak', 'is_active' => true]
        );
        EmailRecipient::updateOrCreate(
            ['document_type' => 'biaya_retribusi', 'trigger' => 'revisi', 'field' => 'TO', 'recipient_type' => 'role', 'role_slug' => 'blc'],
            ['label' => 'BLC notifikasi Retribusi revisi', 'is_active' => true]
        );
        EmailRecipient::updateOrCreate(
            ['document_type' => 'biaya_retribusi', 'trigger' => 'revisi', 'field' => 'CC', 'recipient_type' => 'role', 'role_slug' => 'rfah'],
            ['label' => 'CC RFAH notifikasi Retribusi revisi', 'is_active' => true]
        );

        $this->command->info('Email notification defaults seeded.');
    }
}
