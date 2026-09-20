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

        $this->command->info('Email notification defaults seeded.');
    }
}
