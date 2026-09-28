<?php

namespace Database\Seeders;

use App\Models\Permission;
use App\Models\Role;
use Illuminate\Database\Seeder;

class PermissionSeeder extends Seeder
{
    public function run(): void
    {
        // Urutan grup mengikuti menu sidebar: Umum → Rencana Kirim → Gate Check →
        // Validasi Dokumen → Receiving → Penerimaan → NPN → Standar Umur →
        // Standarisasi → Sistem → Notifikasi. Dalam grup: view, create, edit, delete, import.
        $permissions = [
            ['name' => 'Dashboard View', 'slug' => 'dashboard.view', 'menu_group' => 'Umum', 'icon' => 'dashboard', 'route' => 'dashboard', 'sort_order' => 10],
            ['name' => 'Akses Semua Depo', 'slug' => 'depot.view_all', 'menu_group' => 'Umum', 'icon' => 'globe', 'route' => null, 'sort_order' => 20],
            ['name' => 'Rencana Kirim View', 'slug' => 'rencana_kirim.view', 'menu_group' => 'Rencana Kirim', 'icon' => 'truck', 'route' => 'rencana_kirim.index', 'sort_order' => 30],
            ['name' => 'Rencana Kirim Create', 'slug' => 'rencana_kirim.create', 'menu_group' => 'Rencana Kirim', 'icon' => 'plus', 'route' => 'rencana_kirim.create', 'sort_order' => 40],
            ['name' => 'Rencana Kirim Edit', 'slug' => 'rencana_kirim.edit', 'menu_group' => 'Rencana Kirim', 'icon' => 'edit', 'route' => 'rencana_kirim.edit', 'sort_order' => 50],
            ['name' => 'Rencana Kirim Delete', 'slug' => 'rencana_kirim.delete', 'menu_group' => 'Rencana Kirim', 'icon' => 'trash', 'route' => 'rencana_kirim.destroy', 'sort_order' => 60],
            ['name' => 'Import Rencana Kirim', 'slug' => 'rencana_kirim.import', 'menu_group' => 'Rencana Kirim', 'icon' => 'upload', 'route' => 'rencana_kirim.import', 'sort_order' => 70],
            ['name' => 'Gate View', 'slug' => 'gate.view', 'menu_group' => 'Gate Check', 'icon' => 'gate', 'route' => 'gate.index', 'sort_order' => 80],
            ['name' => 'Gate Create', 'slug' => 'gate.create', 'menu_group' => 'Gate Check', 'icon' => 'plus', 'route' => 'gate.create', 'sort_order' => 90],
            ['name' => 'Validasi Dokumen View', 'slug' => 'sj_validation.view', 'menu_group' => 'Validasi Dokumen', 'icon' => 'check', 'route' => 'sj_validation.index', 'sort_order' => 100],
            ['name' => 'Validasi Dokumen Create', 'slug' => 'sj_validation.create', 'menu_group' => 'Validasi Dokumen', 'icon' => 'check-plus', 'route' => 'sj_validation.create', 'sort_order' => 110],
            ['name' => 'Validasi Dokumen Edit', 'slug' => 'sj_validation.edit', 'menu_group' => 'Validasi Dokumen', 'icon' => 'check-edit', 'route' => 'sj_validation.edit', 'sort_order' => 120],
            ['name' => 'Validasi Dokumen Validasi Item', 'slug' => 'sj_validation.validate', 'menu_group' => 'Validasi Dokumen', 'icon' => 'check-badge', 'route' => 'sj_validation.scan', 'sort_order' => 122],
            ['name' => 'Validasi Dokumen Selesaikan', 'slug' => 'sj_validation.complete', 'menu_group' => 'Validasi Dokumen', 'icon' => 'check-double', 'route' => 'sj_validation.complete', 'sort_order' => 124],
            ['name' => 'Validasi Dokumen Delete', 'slug' => 'sj_validation.delete', 'menu_group' => 'Validasi Dokumen', 'icon' => 'check-delete', 'route' => 'sj_validation.destroy', 'sort_order' => 130],
            ['name' => 'Receiving View', 'slug' => 'receiving.view', 'menu_group' => 'Receiving', 'icon' => 'receive', 'route' => 'receiving.index', 'sort_order' => 140],
            ['name' => 'Receiving Create', 'slug' => 'receiving.create', 'menu_group' => 'Receiving', 'icon' => 'plus', 'route' => 'receiving.create', 'sort_order' => 150],
            ['name' => 'Receiving Edit', 'slug' => 'receiving.edit', 'menu_group' => 'Receiving', 'icon' => 'edit', 'route' => 'receiving.edit', 'sort_order' => 160],
            ['name' => 'Receiving Delete', 'slug' => 'receiving.delete', 'menu_group' => 'Receiving', 'icon' => 'trash', 'route' => 'receiving.destroy', 'sort_order' => 165],
            ['name' => 'Penerimaan View', 'slug' => 'penerimaan.view', 'menu_group' => 'Penerimaan', 'icon' => 'clipboard', 'route' => 'penerimaan.index', 'sort_order' => 170],
            ['name' => 'Penerimaan Create', 'slug' => 'penerimaan.create', 'menu_group' => 'Penerimaan', 'icon' => 'plus', 'route' => 'penerimaan.create', 'sort_order' => 180],
            ['name' => 'Penerimaan Edit', 'slug' => 'penerimaan.edit', 'menu_group' => 'Penerimaan', 'icon' => 'edit', 'route' => 'penerimaan.edit', 'sort_order' => 190],
            ['name' => 'Penerimaan Delete', 'slug' => 'penerimaan.delete', 'menu_group' => 'Penerimaan', 'icon' => 'trash', 'route' => 'penerimaan.destroy', 'sort_order' => 200],
            ['name' => 'NPN View', 'slug' => 'npn.view', 'menu_group' => 'NPN', 'icon' => 'package', 'route' => 'npn.index', 'sort_order' => 210],
            ['name' => 'NPN Create', 'slug' => 'npn.create', 'menu_group' => 'NPN', 'icon' => 'plus', 'route' => 'npn.create', 'sort_order' => 220],
            ['name' => 'NPN Edit', 'slug' => 'npn.edit', 'menu_group' => 'NPN', 'icon' => 'edit', 'route' => 'npn.edit', 'sort_order' => 230],
            ['name' => 'NPN Delete', 'slug' => 'npn.delete', 'menu_group' => 'NPN', 'icon' => 'trash', 'route' => 'npn.destroy', 'sort_order' => 240],
            ['name' => 'Standar Umur View', 'slug' => 'standar_umur.view', 'menu_group' => 'Standar Umur', 'icon' => 'clock', 'route' => 'standar_umur.index', 'sort_order' => 250],
            ['name' => 'Standar Umur Create', 'slug' => 'standar_umur.create', 'menu_group' => 'Standar Umur', 'icon' => 'plus', 'route' => 'standar_umur.create', 'sort_order' => 260],
            ['name' => 'Standar Umur Edit', 'slug' => 'standar_umur.edit', 'menu_group' => 'Standar Umur', 'icon' => 'edit', 'route' => 'standar_umur.edit', 'sort_order' => 270],
            ['name' => 'Standar Umur Delete', 'slug' => 'standar_umur.delete', 'menu_group' => 'Standar Umur', 'icon' => 'trash', 'route' => 'standar_umur.destroy', 'sort_order' => 280],
            ['name' => 'Standarisasi Tumpukan View', 'slug' => 'standarisasi.view', 'menu_group' => 'Standarisasi Tumpukan', 'icon' => 'layers', 'route' => 'standarisasi.index', 'sort_order' => 290],
            ['name' => 'Standarisasi Tumpukan Create', 'slug' => 'standarisasi.create', 'menu_group' => 'Standarisasi Tumpukan', 'icon' => 'plus', 'route' => 'standarisasi.create', 'sort_order' => 300],
            ['name' => 'Standarisasi Tumpukan Edit', 'slug' => 'standarisasi.edit', 'menu_group' => 'Standarisasi Tumpukan', 'icon' => 'edit', 'route' => 'standarisasi.edit', 'sort_order' => 310],
            ['name' => 'Standarisasi Tumpukan Approve', 'slug' => 'standarisasi.approve', 'menu_group' => 'Standarisasi Tumpukan', 'icon' => 'check-circle', 'route' => 'standarisasi.approve', 'sort_order' => 315],
            ['name' => 'Standarisasi Tumpukan Delete', 'slug' => 'standarisasi.delete', 'menu_group' => 'Standarisasi Tumpukan', 'icon' => 'trash', 'route' => 'standarisasi.destroy', 'sort_order' => 320],
            ['name' => 'Users View', 'slug' => 'users.view', 'menu_group' => 'Sistem', 'icon' => 'users', 'route' => 'users.index', 'sort_order' => 330],
            ['name' => 'Users Create', 'slug' => 'users.create', 'menu_group' => 'Sistem', 'icon' => 'plus', 'route' => 'users.create', 'sort_order' => 340],
            ['name' => 'Users Edit', 'slug' => 'users.edit', 'menu_group' => 'Sistem', 'icon' => 'user-edit', 'route' => 'users.edit', 'sort_order' => 350],
            ['name' => 'Users Delete', 'slug' => 'users.delete', 'menu_group' => 'Sistem', 'icon' => 'trash', 'route' => 'users.destroy', 'sort_order' => 360],
            ['name' => 'Users Import', 'slug' => 'users.import', 'menu_group' => 'Sistem', 'icon' => 'upload', 'route' => 'users.import', 'sort_order' => 370],
            ['name' => 'Roles View', 'slug' => 'roles.view', 'menu_group' => 'Sistem', 'icon' => 'shield', 'route' => 'roles.index', 'sort_order' => 380],
            ['name' => 'Roles Create', 'slug' => 'roles.create', 'menu_group' => 'Sistem', 'icon' => 'shield-plus', 'route' => 'roles.create', 'sort_order' => 390],
            ['name' => 'Roles Edit', 'slug' => 'roles.edit', 'menu_group' => 'Sistem', 'icon' => 'shield-edit', 'route' => 'roles.edit', 'sort_order' => 400],
            ['name' => 'Roles Delete', 'slug' => 'roles.delete', 'menu_group' => 'Sistem', 'icon' => 'shield-x', 'route' => 'roles.destroy', 'sort_order' => 410],
            ['name' => 'Roles Import', 'slug' => 'roles.import', 'menu_group' => 'Sistem', 'icon' => 'upload', 'route' => 'roles.import', 'sort_order' => 411],
            ['name' => 'Roles Export', 'slug' => 'roles.export', 'menu_group' => 'Sistem', 'icon' => 'download', 'route' => 'roles.export', 'sort_order' => 412],
            ['name' => 'Roles Template', 'slug' => 'roles.template', 'menu_group' => 'Sistem', 'icon' => 'file-template', 'route' => 'roles.template', 'sort_order' => 413],
            ['name' => 'Email Setting View', 'slug' => 'emails.view', 'menu_group' => 'Sistem', 'icon' => 'mail', 'route' => 'email.index', 'sort_order' => 420],
            ['name' => 'Email Setting Edit', 'slug' => 'emails.edit', 'menu_group' => 'Sistem', 'icon' => 'mail-edit', 'route' => 'email.update', 'sort_order' => 430],
            ['name' => 'Laporan View', 'slug' => 'reports.view', 'menu_group' => 'Laporan', 'icon' => 'chart', 'route' => 'reports.index', 'sort_order' => 440],
            ['name' => 'Laporan Biaya THL View', 'slug' => 'reports.biaya_thl', 'menu_group' => 'Laporan', 'icon' => 'coins', 'route' => 'reports.biaya_thl', 'sort_order' => 441],
            ['name' => 'Laporan Biaya Retribusi View', 'slug' => 'reports.biaya_retribusi', 'menu_group' => 'Laporan', 'icon' => 'file-dollar', 'route' => 'reports.biaya_retribusi', 'sort_order' => 442],
            ['name' => 'Opname Expired View', 'slug' => 'opname.view', 'menu_group' => 'Opname', 'icon' => 'clock', 'route' => 'opname_expired.index', 'sort_order' => 450],
            ['name' => 'Opname Expired Generate', 'slug' => 'opname.create', 'menu_group' => 'Opname', 'icon' => 'plus', 'route' => 'opname_expired.generate', 'sort_order' => 460],
            ['name' => 'Opname Expired Edit', 'slug' => 'opname.edit', 'menu_group' => 'Opname', 'icon' => 'edit', 'route' => 'opname_expired.edit', 'sort_order' => 470],
            ['name' => 'Biaya THL View', 'slug' => 'biaya_thl.view', 'menu_group' => 'Biaya THL', 'icon' => 'clipboard', 'route' => 'biaya_thl.index', 'sort_order' => 475],
            ['name' => 'Biaya THL Create', 'slug' => 'biaya_thl.create', 'menu_group' => 'Biaya THL', 'icon' => 'plus', 'route' => 'biaya_thl.create', 'sort_order' => 476],
            ['name' => 'Biaya THL Edit', 'slug' => 'biaya_thl.edit', 'menu_group' => 'Biaya THL', 'icon' => 'edit', 'route' => 'biaya_thl.edit', 'sort_order' => 477],
            ['name' => 'Biaya THL Delete', 'slug' => 'biaya_thl.delete', 'menu_group' => 'Biaya THL', 'icon' => 'trash', 'route' => 'biaya_thl.destroy', 'sort_order' => 478],
            ['name' => 'Biaya Retribusi View', 'slug' => 'biaya_retribusi.view', 'menu_group' => 'Biaya Retribusi', 'icon' => 'clipboard', 'route' => 'biaya_retribusi.index', 'sort_order' => 479],
            ['name' => 'Biaya Retribusi Create', 'slug' => 'biaya_retribusi.create', 'menu_group' => 'Biaya Retribusi', 'icon' => 'plus', 'route' => 'biaya_retribusi.create', 'sort_order' => 480],
            ['name' => 'Biaya Retribusi Edit', 'slug' => 'biaya_retribusi.edit', 'menu_group' => 'Biaya Retribusi', 'icon' => 'edit', 'route' => 'biaya_retribusi.edit', 'sort_order' => 481],
            ['name' => 'Biaya Retribusi Delete', 'slug' => 'biaya_retribusi.delete', 'menu_group' => 'Biaya Retribusi', 'icon' => 'trash', 'route' => 'biaya_retribusi.destroy', 'sort_order' => 482],
            ['name' => 'Biaya THL Kendali Penuh', 'slug' => 'biaya_thl.full_control', 'menu_group' => 'Biaya THL', 'icon' => 'shield-check', 'route' => null, 'sort_order' => 498],
            ['name' => 'Biaya Retribusi Kendali Penuh', 'slug' => 'biaya_retribusi.full_control', 'menu_group' => 'Biaya Retribusi', 'icon' => 'shield-check', 'route' => null, 'sort_order' => 499],
            ['name' => 'Approval Biaya View', 'slug' => 'approval.view', 'menu_group' => 'Sistem', 'icon' => 'shield', 'route' => 'approval.index', 'sort_order' => 490],
            ['name' => 'Approval Biaya Manage', 'slug' => 'approval.manage', 'menu_group' => 'Sistem', 'icon' => 'shield-edit', 'route' => 'approval.manage', 'sort_order' => 491],
            ['name' => 'Approval Biaya Submit', 'slug' => 'approval.submit', 'menu_group' => 'Biaya', 'icon' => 'send', 'route' => 'approval.submit', 'sort_order' => 492],
            ['name' => 'Approval Biaya Check', 'slug' => 'approval.check', 'menu_group' => 'Biaya', 'icon' => 'check', 'route' => 'approval.check', 'sort_order' => 493],
            ['name' => 'Approval Biaya Approve', 'slug' => 'approval.approve', 'menu_group' => 'Biaya', 'icon' => 'check', 'route' => 'approval.approve', 'sort_order' => 494],
            ['name' => 'Approval Biaya Reject', 'slug' => 'approval.reject', 'menu_group' => 'Biaya', 'icon' => 'x', 'route' => 'approval.reject', 'sort_order' => 495],
            ['name' => 'Approval Biaya Revise', 'slug' => 'approval.revise', 'menu_group' => 'Biaya', 'icon' => 'rotate-left', 'route' => 'approval.revise', 'sort_order' => 496],
            ['name' => 'Approval Biaya RFAH', 'slug' => 'approval.rfah', 'menu_group' => 'Biaya', 'icon' => 'shield-check', 'route' => 'approval.rfah', 'sort_order' => 497],
            ['name' => 'Standarisasi Tumpukan Import', 'slug' => 'standarisasi.import', 'menu_group' => 'Standarisasi Tumpukan', 'icon' => 'upload', 'route' => 'standarisasi.import', 'sort_order' => 325],
            ['name' => 'Standarisasi Tumpukan Export', 'slug' => 'standarisasi.export', 'menu_group' => 'Standarisasi Tumpukan', 'icon' => 'download', 'route' => 'standarisasi.export', 'sort_order' => 330],
            ['name' => 'Standarisasi Tumpukan Template', 'slug' => 'standarisasi.template', 'menu_group' => 'Standarisasi Tumpukan', 'icon' => 'file-template', 'route' => 'standarisasi.template', 'sort_order' => 335],
            ['name' => 'Biaya THL Import', 'slug' => 'biaya_thl.import', 'menu_group' => 'Biaya THL', 'icon' => 'upload', 'route' => 'biaya_thl.import', 'sort_order' => 479],
            ['name' => 'Biaya Retribusi Import', 'slug' => 'biaya_retribusi.import', 'menu_group' => 'Biaya Retribusi', 'icon' => 'upload', 'route' => 'biaya_retribusi.import', 'sort_order' => 484],
            ['name' => 'Tarif Retribusi Manage', 'slug' => 'retribusi_rates.manage', 'menu_group' => 'Biaya Retribusi', 'icon' => 'coins', 'route' => 'retribusi_rates.manage', 'sort_order' => 485],
            ['name' => 'Receiving Import', 'slug' => 'receiving.import', 'menu_group' => 'Receiving', 'icon' => 'upload', 'route' => 'receiving.import', 'sort_order' => 166],
            ['name' => 'Receiving Export', 'slug' => 'receiving.export', 'menu_group' => 'Receiving', 'icon' => 'download', 'route' => 'receiving.export', 'sort_order' => 167],
            ['name' => 'Receiving Template', 'slug' => 'receiving.template', 'menu_group' => 'Receiving', 'icon' => 'file-template', 'route' => 'receiving.template', 'sort_order' => 168],
            ['name' => 'Gate Edit', 'slug' => 'gate.edit', 'menu_group' => 'Gate Check', 'icon' => 'edit', 'route' => 'gate.edit', 'sort_order' => 91],
            ['name' => 'Gate Delete', 'slug' => 'gate.delete', 'menu_group' => 'Gate Check', 'icon' => 'trash', 'route' => 'gate.destroy', 'sort_order' => 92],
            ['name' => 'Opname Expired Delete', 'slug' => 'opname.delete', 'menu_group' => 'Opname', 'icon' => 'trash', 'route' => 'opname_expired.destroy', 'sort_order' => 471],
        ];

        foreach ($permissions as $perm) {
            Permission::updateOrCreate(['slug' => $perm['slug']], $perm);
        }

        $allPermSlugs = array_column($permissions, 'slug');
        $allPermIds = Permission::whereIn('slug', $allPermSlugs)->pluck('id', 'slug')->toArray();

        $rolePermMap = [
            'admin_master' => $allPermSlugs,
            'staff_logistic' => [
                'dashboard.view', 'penerimaan.view', 'penerimaan.create', 'penerimaan.edit',
                'npn.view', 'standar_umur.view', 'standarisasi.view', 'standarisasi.edit',
                'standarisasi.import', 'standarisasi.export', 'standarisasi.template',
                'biaya_thl.view', 'biaya_thl.create', 'biaya_thl.edit',
                'biaya_thl.import',
                'biaya_retribusi.view', 'biaya_retribusi.create', 'biaya_retribusi.edit',
                'biaya_retribusi.import',
                'rencana_kirim.view', 'roles.view', 'users.view',
                'reports.view', 'reports.biaya_thl', 'reports.biaya_retribusi', 'opname.view', 'opname.create', 'opname.edit', 'opname.delete',
                'gate.edit', 'gate.delete',
                'receiving.import', 'receiving.export', 'receiving.template',
            ],
            'rlh' => [
                'dashboard.view', 'penerimaan.view', 'npn.view',
                'standar_umur.view', 'standarisasi.view', 'opname.view',
                'biaya_thl.view', 'biaya_retribusi.view',
                // Tanpa approval.view: menu "Pengaturan Approval" hanya untuk
                // admin_master (pengelola roles & permissions). Aksi approve
                // tetap berjalan lewat permission approval.* masing-masing.
                'approval.approve', 'approval.reject', 'approval.revise',
            ],
            'rfah' => [
                'dashboard.view', 'penerimaan.view', 'npn.view',
                'standar_umur.view', 'standarisasi.view', 'opname.view',
                'biaya_thl.view', 'biaya_retribusi.view',
                'approval.reject', 'approval.revise', 'approval.rfah',
            ],
            'rh' => [
                'dashboard.view', 'penerimaan.view', 'npn.view', 'opname.view',
            ],
            'blc' => [
                'dashboard.view', 'penerimaan.view', 'penerimaan.edit', 'penerimaan.delete',
                'npn.view', 'standar_umur.view', 'standarisasi.view', 'standarisasi.edit', 'standarisasi.approve',
                'standarisasi.import',
                'biaya_thl.view', 'biaya_thl.create', 'biaya_thl.edit',
                'biaya_retribusi.view', 'biaya_retribusi.create', 'biaya_retribusi.edit',
                'sj_validation.view',
                'reports.view', 'reports.biaya_thl', 'reports.biaya_retribusi', 'opname.view', 'opname.delete',
                'approval.submit',
                'gate.edit', 'gate.delete',
            ],
            'bac' => [
                'dashboard.view', 'penerimaan.view', 'npn.view',
                'standar_umur.view', 'standarisasi.view', 'standarisasi.import',
                'biaya_thl.view', 'biaya_thl.create', 'biaya_thl.edit',
                'biaya_retribusi.view', 'biaya_retribusi.create', 'biaya_retribusi.edit',
                'reports.view', 'reports.biaya_thl', 'reports.biaya_retribusi', 'opname.view', 'opname.delete',
                'approval.check', 'approval.revise',
                'gate.edit', 'gate.delete',
            ],
            // CATATAN: slug 'admin_distirbusi' memang typo (kurang 'b') sejak awal
            // dan sudah tersimpan di DB + dirujuk kode. JANGAN diperbaiki
            // ejaannya tanpa migrasi data (akan meng orphan role & user).
            'admin_distirbusi' => [
                'dashboard.view', 'penerimaan.view', 'penerimaan.create', 'penerimaan.edit',
                'npn.view', 'npn.create', 'npn.edit', 'npn.delete',
                'standar_umur.view', 'standar_umur.create', 'standar_umur.edit',
                'standarisasi.view', 'standarisasi.create', 'standarisasi.edit', 'standarisasi.approve',
                'standarisasi.import', 'standarisasi.export', 'standarisasi.template',
                'biaya_thl.view', 'biaya_thl.create', 'biaya_thl.edit',
                'biaya_thl.import',
                'biaya_retribusi.view', 'biaya_retribusi.create', 'biaya_retribusi.edit',
                'biaya_retribusi.import', 'retribusi_rates.manage',
                'rencana_kirim.view', 'rencana_kirim.create', 'rencana_kirim.edit',
                'rencana_kirim.import',
                'users.view', 'users.edit', 'roles.view',
                'users.import', 'roles.import', 'roles.export', 'roles.template',
                'emails.view', 'emails.edit',
                'reports.view', 'reports.biaya_thl', 'reports.biaya_retribusi', 'opname.view', 'opname.create', 'opname.edit', 'opname.delete',
                'gate.edit', 'gate.delete',
                'receiving.import', 'receiving.export', 'receiving.template',
            ],
            'admin_planner' => [
                'dashboard.view', 'npn.view', 'standar_umur.view',
                'standarisasi.view', 'standarisasi.import', 'standarisasi.export', 'standarisasi.template',
                'penerimaan.view', 'rencana_kirim.view',
                'rencana_kirim.create', 'rencana_kirim.edit', 'rencana_kirim.delete',
                'rencana_kirim.import',
                'users.view', 'users.import', 'roles.import', 'roles.export', 'roles.template',
                'depot.view_all',
                'biaya_thl.view', 'biaya_thl.create', 'biaya_thl.edit',
                'biaya_thl.import',
                'biaya_retribusi.view', 'biaya_retribusi.create', 'biaya_retribusi.edit',
                'reports.view', 'reports.biaya_thl', 'reports.biaya_retribusi', 'opname.view', 'opname.create', 'opname.delete',
                'gate.edit', 'gate.delete',
                'receiving.import', 'receiving.export', 'receiving.template',
            ],
            'cheker' => [
                'dashboard.view', 'penerimaan.view', 'penerimaan.create', 'penerimaan.edit',
                'npn.view',
                'standar_umur.view', 'standarisasi.view',
                'sj_validation.view', 'sj_validation.create', 'sj_validation.edit', 'sj_validation.validate', 'sj_validation.complete', 'sj_validation.delete',
                'rencana_kirim.view', 'rencana_kirim.edit',
                'gate.view', 'gate.create', 'gate.edit', 'gate.delete',
                'receiving.view', 'receiving.create', 'receiving.edit', 'receiving.delete',
                'biaya_thl.view',
                'reports.view', 'reports.biaya_thl', 'reports.biaya_retribusi', 'opname.view', 'opname.create', 'opname.delete',
            ],
        ];

        foreach ($rolePermMap as $roleSlug => $permSlugs) {
            $role = Role::where('slug', $roleSlug)->first();
            if (! $role) {
                continue;
            }

            $permIds = array_map(fn ($slug) => $allPermIds[$slug] ?? null, $permSlugs);
            $permIds = array_filter($permIds);
            $role->permissions()->sync($permIds);
        }

        // sac & operator: user aktif di DB tetapi nol permission = lockout total.
        // Keputusan akses: operator = operasional depo ( = cheker),
        // sac = checker ( = bac). Referensi langsung agar tidak drift.
        foreach (['operator' => 'cheker', 'sac' => 'bac'] as $mirror => $source) {
            $role = Role::where('slug', $mirror)->first();
            $sourceRole = Role::where('slug', $source)->first();
            if ($role && $sourceRole) {
                $role->permissions()->sync($sourceRole->permissions()->pluck('permissions.id')->all());
            }
        }

        $this->command->info('Permissions seeded successfully.');
    }
}
