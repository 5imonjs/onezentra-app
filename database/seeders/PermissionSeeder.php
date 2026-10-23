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
            ['name' => 'Akses Semua Depo', 'slug' => 'depot.view_all', 'menu_group' => 'Umum', 'icon' => 'globe', 'route' => null, 'sort_order' => 20, 'description' => 'Global: melihat seluruh depo lintas region. Dapat diberikan/dicabut admin master lewat Roles & Permissions.'],
            ['name' => 'Konteks Depo Region', 'slug' => 'depot.view_region', 'menu_group' => 'Umum', 'icon' => 'map', 'route' => null, 'sort_order' => 21, 'description' => 'Menandai role yang bekerja dalam konteks region. Akses data tetap hanya ke depo yang ditetapkan pada user.'],
            ['name' => 'Pindah Depo Dokumen', 'slug' => 'depot.move', 'menu_group' => 'Umum', 'icon' => 'arrows-right-left', 'route' => null, 'sort_order' => 22],
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
            ['name' => 'Validasi Dokumen Ubah Setelah Selesai', 'slug' => 'sj_validation.edit_completed', 'menu_group' => 'Validasi Dokumen', 'icon' => 'unlock', 'route' => 'sj_validation.edit_completed', 'sort_order' => 128],
            ['name' => 'Validasi Dokumen Batalkan', 'slug' => 'sj_validation.cancel', 'menu_group' => 'Validasi Dokumen', 'icon' => 'ban', 'route' => 'sj_validation.cancel', 'sort_order' => 126],
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
            ['name' => 'Cluster Principal View', 'slug' => 'cluster_principal.view', 'menu_group' => 'Cluster Principal', 'icon' => 'building-office', 'route' => 'cluster_principal.index', 'sort_order' => 245],
            ['name' => 'Cluster Principal Create', 'slug' => 'cluster_principal.create', 'menu_group' => 'Cluster Principal', 'icon' => 'plus', 'route' => 'cluster_principal.create', 'sort_order' => 246],
            ['name' => 'Cluster Principal Edit', 'slug' => 'cluster_principal.edit', 'menu_group' => 'Cluster Principal', 'icon' => 'edit', 'route' => 'cluster_principal.edit', 'sort_order' => 247],
            ['name' => 'Cluster Principal Delete', 'slug' => 'cluster_principal.delete', 'menu_group' => 'Cluster Principal', 'icon' => 'trash', 'route' => 'cluster_principal.destroy', 'sort_order' => 248],
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
            // Reset Data Operasional hanya untuk admin_master: tidak masuk
            // peta role lain di bawah, dan controller meng-gate ulang level.
            ['name' => 'Reset Data Operasional', 'slug' => 'database.purge', 'menu_group' => 'Sistem', 'icon' => 'trash', 'route' => 'admin.database', 'sort_order' => 435],
            // Ubah Setting Depo hanya untuk admin_master: tidak masuk peta
            // role lain di bawah, dan controller meng-gate ulang level.
            ['name' => 'Ubah Setting Depo', 'slug' => 'depot_settings.manage', 'menu_group' => 'Sistem', 'icon' => 'building-office', 'route' => null, 'sort_order' => 436],
            ['name' => 'Laporan Selisih Qty View', 'slug' => 'reports.selisih_qty', 'menu_group' => 'Laporan', 'icon' => 'chart', 'route' => 'reports.selisih_qty', 'sort_order' => 440],
            ['name' => 'Laporan Penerimaan View', 'slug' => 'reports.penerimaan', 'menu_group' => 'Laporan', 'icon' => 'clipboard', 'route' => 'reports.penerimaan', 'sort_order' => 441],
            ['name' => 'Laporan Penerimaan & Expired View', 'slug' => 'reports.penerimaan_batch_expired', 'menu_group' => 'Laporan', 'icon' => 'clipboard', 'route' => 'reports.penerimaan_batch_expired', 'sort_order' => 442],
            ['name' => 'Laporan Rencana Kirim View', 'slug' => 'reports.rencana_kirim', 'menu_group' => 'Laporan', 'icon' => 'truck', 'route' => 'reports.rencana_kirim', 'sort_order' => 443],
            ['name' => 'Laporan View', 'slug' => 'reports.view', 'menu_group' => 'Laporan', 'icon' => 'chart', 'route' => 'reports.index', 'sort_order' => 439],
            ['name' => 'Hapus Baris Laporan', 'slug' => 'reports.delete', 'menu_group' => 'Laporan', 'icon' => 'trash', 'route' => 'reports.delete', 'sort_order' => 438],
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
            ['name' => 'Standarisasi Lintas Depo', 'slug' => 'standarisasi.view_all', 'menu_group' => 'Standarisasi Tumpukan', 'icon' => 'globe', 'route' => null, 'sort_order' => 340],
            ['name' => 'Biaya THL Import', 'slug' => 'biaya_thl.import', 'menu_group' => 'Biaya THL', 'icon' => 'upload', 'route' => 'biaya_thl.import', 'sort_order' => 479],
            ['name' => 'Biaya Retribusi Import', 'slug' => 'biaya_retribusi.import', 'menu_group' => 'Biaya Retribusi', 'icon' => 'upload', 'route' => 'biaya_retribusi.import', 'sort_order' => 484],
            ['name' => 'Biaya THL Export', 'slug' => 'biaya_thl.export', 'menu_group' => 'Biaya THL', 'icon' => 'download', 'route' => 'biaya_thl.export', 'sort_order' => 486],
            ['name' => 'Biaya Retribusi Export', 'slug' => 'biaya_retribusi.export', 'menu_group' => 'Biaya Retribusi', 'icon' => 'download', 'route' => 'biaya_retribusi.export', 'sort_order' => 487],
            ['name' => 'Tarif Retribusi Manage', 'slug' => 'retribusi_rates.manage', 'menu_group' => 'Biaya Retribusi', 'icon' => 'coins', 'route' => 'retribusi_rates.manage', 'sort_order' => 485],
            ['name' => 'Receiving Import', 'slug' => 'receiving.import', 'menu_group' => 'Receiving', 'icon' => 'upload', 'route' => 'receiving.import', 'sort_order' => 166],
            ['name' => 'Receiving Export', 'slug' => 'receiving.export', 'menu_group' => 'Receiving', 'icon' => 'download', 'route' => 'receiving.export', 'sort_order' => 167],
            ['name' => 'Receiving Template', 'slug' => 'receiving.template', 'menu_group' => 'Receiving', 'icon' => 'file-template', 'route' => 'receiving.template', 'sort_order' => 168],
            ['name' => 'Gate Edit', 'slug' => 'gate.edit', 'menu_group' => 'Gate Check', 'icon' => 'edit', 'route' => 'gate.edit', 'sort_order' => 91],
            ['name' => 'Gate Delete', 'slug' => 'gate.delete', 'menu_group' => 'Gate Check', 'icon' => 'trash', 'route' => 'gate.destroy', 'sort_order' => 92],
            ['name' => 'Opname Expired Delete', 'slug' => 'opname.delete', 'menu_group' => 'Opname', 'icon' => 'trash', 'route' => 'opname_expired.destroy', 'sort_order' => 471],
            ['name' => 'Opname Progres Semua Depo', 'slug' => 'opname.progress_all', 'menu_group' => 'Opname', 'icon' => 'chart', 'route' => 'opname_expired.progress', 'sort_order' => 472],
            ['name' => 'Opname Sesi View', 'slug' => 'opname.session.view', 'menu_group' => 'Opname', 'icon' => 'clipboard', 'route' => 'opname_sessions.index', 'sort_order' => 473],
            ['name' => 'Opname Sesi Buat', 'slug' => 'opname.session.create', 'menu_group' => 'Opname', 'icon' => 'plus', 'route' => 'opname_sessions.store', 'sort_order' => 474],
            ['name' => 'Opname Sesi Verifikasi', 'slug' => 'opname.session.edit', 'menu_group' => 'Opname', 'icon' => 'edit', 'route' => 'opname_sessions.start', 'sort_order' => 475],
        ];

        foreach ($permissions as $perm) {
            Permission::updateOrCreate(['slug' => $perm['slug']], $perm);
        }

        $allPermSlugs = array_column($permissions, 'slug');
        $allPermIds = Permission::whereIn('slug', $allPermSlugs)->pluck('id', 'slug')->toArray();

        // Hierarki tampilan (bukan hierarki hak akses): permission turunan
        // dirender sebagai cabang di bawah induknya pada Roles & Permissions.
        // Sumber kebenaran ada di kolom `permissions.parent_id`, bukan di UI.
        $permissionHierarchy = [
            'depot.view_region' => 'depot.view_all',
        ];
        foreach ($permissionHierarchy as $childSlug => $parentSlug) {
            $childId = $allPermIds[$childSlug] ?? null;
            $parentId = $allPermIds[$parentSlug] ?? null;
            if ($childId !== null && $parentId !== null) {
                Permission::whereKey($childId)->update(['parent_id' => $parentId]);
            }
        }

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
                'reports.selisih_qty', 'reports.penerimaan', 'reports.penerimaan_batch_expired', 'reports.rencana_kirim', 'reports.biaya_thl', 'reports.biaya_retribusi', 'opname.view', 'opname.create', 'opname.edit', 'opname.delete',
                'gate.edit', 'gate.delete',
                'receiving.import', 'receiving.export', 'receiving.template',
                // Keputusan akses 2026-10-09: staff_logistic memang lintas-depo.
                // Grant ini sebelumnya hanya ada di DB (menutupi bug cross-depo
                // H1-H3) dan kini dicatat di seeder agar ter-audit.
                'depot.view_all',
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
                'reports.selisih_qty', 'reports.penerimaan', 'reports.penerimaan_batch_expired', 'reports.rencana_kirim', 'reports.biaya_thl', 'reports.biaya_retribusi', 'opname.view', 'opname.delete',
                'approval.submit',
                'gate.edit', 'gate.delete',
                // Keputusan akses 2026-10-09: grant live yang dipertahankan.
                // approval.view TIDAK diikutkan — seeder & test menetapkan menu
                // Pengaturan Approval hanya untuk admin_master).
                'sj_validation.create', 'sj_validation.edit', 'sj_validation.validate', 'sj_validation.complete',
                'standarisasi.create', 'standarisasi.delete', 'standarisasi.export', 'standarisasi.template',
                'cluster_principal.create', 'cluster_principal.delete', 'cluster_principal.edit',
                'biaya_retribusi.delete', 'biaya_retribusi.import', 'biaya_thl.delete', 'biaya_thl.import',
                'opname.create', 'opname.edit', 'rencana_kirim.view', 'retribusi_rates.manage',
                // BLC menyetujui standarisasi lintas depo. Akses ini dulu
                // datang dari daftar slug hardcode di controller
                // (StandarisasiTumpukanController::canManageRow), lalu
                // digeneralisasi menjadi `depot.view_all` — terlalu luas:
                // BLC ikut melihat SEMUA depo di semua modul + filter depo
                // di dashboard.
                //
                // Revisi keputusan akses 2026-10-09: BLC kembali ter-scope
                // seperti user biasa di semua modul, kecuali standarisasi
                // lewat permission sempit `standarisasi.view_all`.
                'standarisasi.view_all',
            ],
            'bac' => [
                'dashboard.view', 'penerimaan.view', 'npn.view',
                'standar_umur.view', 'standarisasi.view', 'standarisasi.import',
                'biaya_thl.view', 'biaya_thl.create', 'biaya_thl.edit',
                'biaya_retribusi.view', 'biaya_retribusi.create', 'biaya_retribusi.edit',
                'reports.selisih_qty', 'reports.penerimaan', 'reports.penerimaan_batch_expired', 'reports.rencana_kirim', 'reports.biaya_thl', 'reports.biaya_retribusi', 'opname.view', 'opname.delete',
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
                'reports.selisih_qty', 'reports.penerimaan', 'reports.penerimaan_batch_expired', 'reports.rencana_kirim', 'reports.biaya_thl', 'reports.biaya_retribusi', 'opname.view', 'opname.create', 'opname.edit', 'opname.delete',
                'gate.edit', 'gate.delete',
                'receiving.import', 'receiving.export', 'receiving.template',
            ],
            'admin_planner' => [
                'dashboard.view', 'npn.view', 'standar_umur.view',
                'standarisasi.view', 'standarisasi.import', 'standarisasi.export', 'standarisasi.template',
                'penerimaan.view', 'rencana_kirim.view',
                // Keputusan akses 2026-10-09: planner tetap bisa melihat gate,
                // receiving, dan validasi SJ (grant live yang dipertahankan).
                'gate.view', 'receiving.view', 'sj_validation.view',
                'rencana_kirim.create', 'rencana_kirim.edit', 'rencana_kirim.delete',
                'rencana_kirim.import',
                'users.view', 'users.import', 'roles.import', 'roles.export', 'roles.template',
                'biaya_thl.view', 'biaya_thl.create', 'biaya_thl.edit',
                'biaya_thl.import',
                'biaya_retribusi.view', 'biaya_retribusi.create', 'biaya_retribusi.edit',
                'reports.selisih_qty', 'reports.penerimaan', 'reports.penerimaan_batch_expired', 'reports.rencana_kirim', 'reports.biaya_thl', 'reports.biaya_retribusi', 'opname.view', 'opname.create', 'opname.delete',
                'gate.edit', 'gate.delete',
                'receiving.import', 'receiving.export', 'receiving.template',
                // Opsi B 2026-10-23: Region-scoped depot access
                'depot.view_region',
            ],
            'cheker' => [
                'dashboard.view', 'penerimaan.view', 'penerimaan.create', 'penerimaan.edit',
                'npn.view',
                'standar_umur.view', 'standarisasi.view',
                'sj_validation.view', 'sj_validation.create', 'sj_validation.edit', 'sj_validation.validate', 'sj_validation.complete', 'sj_validation.delete', 'sj_validation.cancel',
                'rencana_kirim.view', 'rencana_kirim.edit',
                'gate.view', 'gate.create', 'gate.edit', 'gate.delete',
                'receiving.view', 'receiving.create', 'receiving.edit', 'receiving.delete',
                'biaya_thl.view',
                'reports.selisih_qty', 'reports.penerimaan', 'reports.penerimaan_batch_expired', 'reports.rencana_kirim', 'reports.biaya_thl', 'reports.biaya_retribusi', 'opname.view', 'opname.create', 'opname.delete',
                // Keputusan akses 2026-10-09: cheker tetap memegang aksi
                // sensitif ini (grant live yang dipertahankan).
                'approval.submit', 'retribusi_rates.manage', 'sj_validation.edit_completed', 'opname.edit', 'penerimaan.delete',
            ],
            // GA = General Affairs: viewer luas (keputusan akses 2026-10-09).
            // Pantau SEMUA modul view-only lintas depo (depot.view_all) tanpa
            // aksi tulis apa pun. Turunan otomatis: biaya_*.export (dari view),
            // opname.progress_all (dari opname.view), cluster_principal.view
            // (dari npn.view) — lihat aturan post-processing di bawah.
            'ga' => [
                'dashboard.view', 'depot.view_all',
                'rencana_kirim.view', 'gate.view', 'sj_validation.view', 'receiving.view',
                'penerimaan.view', 'npn.view', 'standar_umur.view', 'standarisasi.view',
                'biaya_thl.view', 'biaya_retribusi.view',
                'reports.selisih_qty', 'reports.penerimaan', 'reports.penerimaan_batch_expired', 'reports.rencana_kirim', 'reports.biaya_thl', 'reports.biaya_retribusi', 'opname.view',
            ],
        ];

        // Export mengikuti view: role yang boleh melihat modul biaya juga
        // diberi biaya_*.export (sama dengan grant di migration
        // add_biaya_export_permissions). Tombol Export di web di-gate slug
        // ini; role baru menyentuhnya manual lewat Roles & Permissions.
        foreach (array_keys($rolePermMap) as $roleSlug) {
            if (in_array('biaya_thl.view', $rolePermMap[$roleSlug], true)
                && ! in_array('biaya_thl.export', $rolePermMap[$roleSlug], true)) {
                $rolePermMap[$roleSlug][] = 'biaya_thl.export';
            }
            if (in_array('biaya_retribusi.view', $rolePermMap[$roleSlug], true)
                && ! in_array('biaya_retribusi.export', $rolePermMap[$roleSlug], true)) {
                $rolePermMap[$roleSlug][] = 'biaya_retribusi.export';
            }
        }

        // Progres opname mengikuti opname.view: migration
        // grant_opname_progress_all_to_opname_viewers memberi `opname.progress_all`
        // ke tiap role yang bisa melihat opname. Tanpa aturan ini, `sync()` di
        // bawah akan mencabutnya dan membatalkan efek migration diam-diam.
        // Diturunkan dari peta yang ada, sama seperti export yang mengikuti view.
        foreach (array_keys($rolePermMap) as $roleSlug) {
            if (in_array('opname.view', $rolePermMap[$roleSlug], true)
                && ! in_array('opname.progress_all', $rolePermMap[$roleSlug], true)) {
                $rolePermMap[$roleSlug][] = 'opname.progress_all';
            }
        }

        // Cluster/principal mengikuti grant NPN 1:1 (view->view, create->create,
        // dst). Menu ini juga master produk, jadi role yang sudah dipercaya
        // mengelola NPN otomatis managingnya juga di sini. Diturunkan dari peta
        // yang sudah ada, bukan ditulis ulang per role, supaya permission baru
        // di masa depan tidak harus dicatat di dua tempat.
        foreach (array_keys($rolePermMap) as $roleSlug) {
            foreach (['view', 'create', 'edit', 'delete'] as $action) {
                if (in_array('npn.'.$action, $rolePermMap[$roleSlug], true)
                    && ! in_array('cluster_principal.'.$action, $rolePermMap[$roleSlug], true)) {
                    $rolePermMap[$roleSlug][] = 'cluster_principal.'.$action;
                }
            }
        }

        // Sesi opname (penugasan + verifikasi lapangan) awalnya menumpang slug
        // generik `opname.create/edit` yang juga menggerakkan monitoring wave
        // (generate, threshold). Dipisah supaya bisa dicabut independen, dan
        // hanya untuk role yang benar-benar menjalankan sesi — viewer murni
        // (`opname.view` saja) tidak melihat menu lapangan. Diturunkan dari grant
        // yang ada agar tidak drift; role baru cukup dicentang lewat UI.
        foreach (array_keys($rolePermMap) as $roleSlug) {
            $canCreate = in_array('opname.create', $rolePermMap[$roleSlug], true);
            $canVerify = in_array('opname.edit', $rolePermMap[$roleSlug], true);

            if (($canCreate || $canVerify) && ! in_array('opname.session.view', $rolePermMap[$roleSlug], true)) {
                $rolePermMap[$roleSlug][] = 'opname.session.view';
            }
            if ($canCreate && ! in_array('opname.session.create', $rolePermMap[$roleSlug], true)) {
                $rolePermMap[$roleSlug][] = 'opname.session.create';
            }
            if ($canVerify && ! in_array('opname.session.edit', $rolePermMap[$roleSlug], true)) {
                $rolePermMap[$roleSlug][] = 'opname.session.edit';
            }
        }

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
        // sac = checker ( = bac), bh = setara admin_planner (keputusan akses
        // 2026-10-09). Referensi langsung agar tidak drift.
        foreach (['operator' => 'cheker', 'sac' => 'bac', 'bh' => 'admin_planner'] as $mirror => $source) {
            $role = Role::where('slug', $mirror)->first();
            $sourceRole = Role::where('slug', $source)->first();
            if ($role && $sourceRole) {
                $role->permissions()->sync($sourceRole->permissions()->pluck('permissions.id')->all());
            }
        }

        // Keputusan akses 2026-10-09: operator (mirror cheker) TIDAK ikut aksi
        // sensitif cheker — operator = operasional depo, bukan checker. Sisanya
        // tetap mirror penuh.
        $operator = Role::where('slug', 'operator')->first();
        if ($operator) {
            $operatorExcludedIds = Permission::whereIn('slug', [
                'approval.submit',
                'retribusi_rates.manage',
                'sj_validation.edit_completed',
                'opname.edit',
                'opname.session.edit',
                'penerimaan.delete',
            ])->pluck('id')->all();
            $operator->permissions()->detach($operatorExcludedIds);
        }

        $this->command->info('Permissions seeded successfully.');
    }
}
