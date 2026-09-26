import 'package:flutter/material.dart';
import 'package:onezentra_mobile/features/dashboard/models/dashboard_models.dart';
import 'package:onezentra_mobile/widgets/stat_tile.dart';

/// Modul yang punya kartu statistik di Beranda.
///
/// Definisi, warna ikon, dan pembagian kelompok meniru `STAT_SOURCES` di
/// `onezentra-web/src/components/DashboardStatCards.tsx`; bedanya hanya
/// [tab] / [page] — tujuan saat kartu diketuk. Modul yang belum ada halamannya
/// di mobile tetap tampil (supaya angka tetap terlihat), tapi diketuk hanya
/// memunculkan informasi "segera hadir".
enum DashboardModuleGroup { operasional, master }

class DashboardModule {
  const DashboardModule({
    required this.key,
    required this.label,
    required this.permission,
    required this.icon,
    required this.tone,
    required this.group,
    this.tab,
    this.page,
  });

  /// Key modul pada payload `dashboard/summary` (`totals` / `new_7d`).
  final String key;
  final String label;
  final String permission;
  final IconData icon;
  final ModuleTone tone;
  final DashboardModuleGroup group;

  /// Key tab yang dibuka (`gate` / `validasi`), null = bukan tujuan tab.
  final String? tab;

  /// Halaman mandiri yang dibuka, null = bukan tujuan halaman. Dipakai modul
  /// master data yang punya halaman penuh di luar empat tab.
  final DashboardPage? page;

  bool get isOperational => group == DashboardModuleGroup.operasional;
}

const dashboardModules = <DashboardModule>[
  DashboardModule(
    key: 'rencana_kirim',
    label: 'Replenishment',
    permission: 'rencana_kirim.view',
    icon: Icons.local_shipping_outlined,
    tone: ModuleTone.amber,
    group: DashboardModuleGroup.operasional,
  ),
  DashboardModule(
    key: 'gate',
    label: 'Check In Point',
    permission: 'gate.view',
    icon: Icons.location_on_outlined,
    tone: ModuleTone.sky,
    group: DashboardModuleGroup.operasional,
    tab: 'gate',
  ),
  DashboardModule(
    key: 'penerimaan',
    label: 'Inbound',
    permission: 'penerimaan.view',
    icon: Icons.assignment_outlined,
    tone: ModuleTone.emerald,
    group: DashboardModuleGroup.operasional,
  ),
  DashboardModule(
    key: 'receiving',
    label: 'Check Out Point',
    permission: 'receiving.view',
    icon: Icons.outbox_outlined,
    tone: ModuleTone.teal,
    group: DashboardModuleGroup.operasional,
  ),
  DashboardModule(
    key: 'sj_validation',
    label: 'Validasi Dokumen',
    permission: 'sj_validation.view',
    icon: Icons.fact_check_outlined,
    tone: ModuleTone.indigo,
    group: DashboardModuleGroup.operasional,
    tab: 'validation',
  ),
  DashboardModule(
    key: 'npn',
    label: 'NPN',
    permission: 'npn.view',
    icon: Icons.inventory_2_outlined,
    tone: ModuleTone.slate,
    group: DashboardModuleGroup.master,
  ),
  DashboardModule(
    key: 'standar_umur',
    label: 'Standar Umur',
    permission: 'standar_umur.view',
    icon: Icons.schedule,
    tone: ModuleTone.slate,
    group: DashboardModuleGroup.master,
  ),
  DashboardModule(
    key: 'standarisasi',
    label: 'Standarisasi',
    permission: 'standarisasi.view',
    icon: Icons.grid_view_outlined,
    tone: ModuleTone.slate,
    group: DashboardModuleGroup.master,
    page: DashboardPage.standarisasi,
  ),
];

/// Kartu peringatan Beranda — padanan `DashboardAlerts.tsx`.
///
/// Hanya ditampilkan bila jumlahnya > 0 **dan** user punya izin modulnya,
/// sama seperti web: kartu kosong diiringkan daripada menyisakan ruang kosong
/// untuk angka nol.
class DashboardAlert {
  const DashboardAlert({
    required this.label,
    required this.value,
    required this.hint,
    required this.tone,
    required this.permission,
    this.tab,
    this.page,
  });

  final String label;
  final String value;
  final String hint;
  final ModuleTone tone;
  final String permission;

  /// Key tab tujuan saat kartu diketuk, null = bukan tujuan tab.
  final String? tab;

  /// Halaman mandiri tujuan, null = modul belum ada halaman penuh di mobile.
  final DashboardPage? page;
}

/// Susun kartu peringatan dari ringkasan; `can` adalah pemeriksaan izin.
List<DashboardAlert> buildDashboardAlerts(
  DashboardSummary summary,
  bool Function(String permission) can,
) {
  final alerts = <DashboardAlert>[];

  if (can('opname.view') && summary.alerts.expiredTotal > 0) {
    alerts.add(
      DashboardAlert(
        label: 'Kritis / Kedaluwarsa',
        value: '${summary.alerts.expiredTotal}',
        hint: '${summary.alerts.expiredKritis} kritis perlu tindakan',
        tone: ModuleTone.danger,
        permission: 'opname.view',
      ),
    );
  }

  if (can('standarisasi.view') && summary.alerts.standarisasiPending > 0) {
    alerts.add(
      DashboardAlert(
        label: 'Menunggu Approval',
        value: '${summary.alerts.standarisasiPending}',
        hint: 'Standarisasi tumpukan',
        tone: ModuleTone.amber,
        permission: 'standarisasi.view',
        page: DashboardPage.standarisasi,
      ),
    );
  }

  if (can('sj_validation.view') && summary.sla.sjOpenCount > 0) {
    final days = summary.sla.sjOldestDays;
    alerts.add(
      DashboardAlert(
        label: 'Validasi Terbuka',
        value: '${summary.sla.sjOpenCount}',
        hint: days != null ? 'tertua $days hari' : 'perlu validasi',
        tone: ModuleTone.amber,
        permission: 'sj_validation.view',
        tab: 'validation',
      ),
    );
  }

  if (can('npn.view') && summary.quality.incomplete > 0) {
    alerts.add(
      DashboardAlert(
        label: 'Data Produk Kurang',
        value: '${summary.quality.incomplete}',
        hint:
            '${summary.quality.npnNoVolume} tanpa volume • '
            '${summary.quality.npnNoUmur} tanpa umur',
        tone: ModuleTone.sky,
        permission: 'npn.view',
      ),
    );
  }

  final slaHours = summary.sla.avgGateToReceivingHours;
  if (can('receiving.view') && slaHours != null) {
    alerts.add(
      DashboardAlert(
        label: 'Gate → Receiving',
        value: '${_trimDecimal(slaHours)} jam',
        hint: 'rata-rata 30 hari terakhir',
        tone: ModuleTone.sky,
        permission: 'receiving.view',
      ),
    );
  }

  return alerts;
}

/// Buang nol desimal di belakang koma (`3.0` → `3`, `3.5` → `3.5`).
String _trimDecimal(double value) {
  if (value == value.roundToDouble()) {
    return value.toInt().toString();
  }
  return value.toString();
}
