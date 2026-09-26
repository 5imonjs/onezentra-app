import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:onezentra_mobile/features/auth/auth_provider.dart';
import 'package:onezentra_mobile/features/auth/auth_user.dart';
import 'package:onezentra_mobile/features/dashboard/dashboard_modules.dart';
import 'package:onezentra_mobile/features/dashboard/dashboard_provider.dart';
import 'package:onezentra_mobile/features/dashboard/models/dashboard_format.dart';
import 'package:onezentra_mobile/features/dashboard/models/dashboard_models.dart';
import 'package:onezentra_mobile/features/standarisasi/standarisasi_screen.dart';
import 'package:onezentra_mobile/theme/app_colors.dart';
import 'package:onezentra_mobile/widgets/page_header.dart';
import 'package:onezentra_mobile/widgets/section_card.dart';
import 'package:onezentra_mobile/widgets/states.dart';
import 'package:onezentra_mobile/widgets/stat_tile.dart';
import 'package:onezentra_mobile/widgets/status_pill.dart';
import 'package:onezentra_mobile/widgets/tile_grid.dart';

/// Tab Beranda — clone `onezentra-web/src/app/dashboard/page.tsx` dalam
/// bentuk mobile: hero gelap berisi sapaan, kartu peringatan, kartu
/// statistik per modul (juga jadi pintu masuk modul), dan aktivitas terbaru.
///
/// Berbeda dari versi web, modul yang belum punya halaman mobile **tidak**
/// disembunyikan: angkanya tetap tampil, dan mengetuk kartunya menjelaskan
/// bahwa halamannya belum tersedia — jauh lebih baik daripada operator
/// mencari menu yang tidak ada.
class DashboardScreen extends StatefulWidget {
  const DashboardScreen({
    super.key,
    required this.onOpenTab,
    this.onUnavailable,
    this.onOpenPage,
  });

  /// Dipanggil dengan key tab (`gate` / `validation`) saat kartu atau baris
  /// aktivitas diketuk.
  final void Function(String tabKey) onOpenTab;

  /// Dipanggil untuk modul yang belum punya halaman di aplikasi mobile.
  final void Function(String moduleLabel)? onUnavailable;

  /// Dipanggil untuk modul/baris yang punya halaman mandiri di luar empat tab
  /// (lihat [DashboardPage]). Default-nya mendorong halaman yang terpetakan di
  /// [pushDashboardPage]; test menyuntik callback sendiri agar tidak menyentuh
  /// jaringan.
  final Future<void> Function(DashboardPage page)? onOpenPage;

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

/// Dorong halaman mandiri tujuan dari Beranda.
///
/// Dipisah dari widget supaya pemetaan [DashboardPage] -> widget bisa diuji
/// tanpa `Navigator` sungguhan, dan supaya ada tepat satu tempat yang tahu
/// halaman mana yang hidup di mobile.
Future<void> pushDashboardPage(BuildContext context, DashboardPage page) {
  return Navigator.of(context).push(
    MaterialPageRoute<void>(
      builder: (_) => switch (page) {
        DashboardPage.standarisasi => const StandarisasiScreen(),
      },
    ),
  );
}

class _DashboardScreenState extends State<DashboardScreen> {
  @override
  void initState() {
    super.initState();
    // Layar dipulihkan saat pertama kali dibuka (shell memang sudah memuat
    // ringkasan, jadi di sini biasanya hanya cache yang dipakai — tapi kalau
    // layar ini dibuka sendiri, angkanya tetap terisi).
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      if (!context.read<AuthProvider>().hasPermission('dashboard.view')) {
        return;
      }
      context.read<DashboardProvider>().load();
    });
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final dash = context.watch<DashboardProvider>();
    final can = auth.hasPermission;

    // Ringkasan hanya berizin `dashboard.view`; tanpa itu backend menolak
    // dengan 403, jadi jangan dipanggil sama sekali.
    final canViewSummary = can('dashboard.view');
    final alerts = canViewSummary
        ? buildDashboardAlerts(dash.summary, can)
        : const <DashboardAlert>[];
    final modules = dashboardModules.where((m) => can(m.permission)).toList();
    final operational = modules.where((m) => m.isOperational).toList();
    final master = modules.where((m) => !m.isOperational).toList();

    void openPage(DashboardPage page) {
      final open = widget.onOpenPage;
      if (open != null) {
        open(page);
        return;
      }
      pushDashboardPage(context, page);
    }

    void openModule(DashboardModule m) {
      final tab = m.tab;
      if (tab != null) {
        widget.onOpenTab(tab);
        return;
      }
      final page = m.page;
      if (page != null) {
        openPage(page);
        return;
      }
      (widget.onUnavailable ?? _defaultUnavailable(context))(m.label);
    }

    void openRecent(DashboardRecentItem item) {
      final tab = item.targetTab;
      if (tab != null) {
        widget.onOpenTab(tab);
        return;
      }
      final page = item.targetPage;
      if (page != null) {
        openPage(page);
        return;
      }
      (widget.onUnavailable ?? _defaultUnavailable(context))(item.type);
    }

    return RefreshIndicator(
      onRefresh: () => canViewSummary ? dash.reload() : Future<void>.value(),
      child: ListView(
        padding: EdgeInsets.zero,
        children: [
          const _Hero(),
          Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 720),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (canViewSummary && dash.error != null) ...[
                      ErrorCard(message: dash.error!, onRetry: dash.reload),
                      const SizedBox(height: 16),
                    ],
                    if (alerts.isNotEmpty) ...[
                      const SectionLabel('Perlu Perhatian'),
                      _AlertGrid(
                        alerts: alerts,
                        onTap: (a) {
                          final tab = a.tab;
                          if (tab != null) {
                            widget.onOpenTab(tab);
                            return;
                          }
                          final page = a.page;
                          if (page != null) {
                            openPage(page);
                            return;
                          }
                          (widget.onUnavailable ??
                              _defaultUnavailable(context))(a.label);
                        },
                      ),
                      const SizedBox(height: 20),
                    ],
                    _StatGrid(
                      title: 'Statistik',
                      modules: operational,
                      summary: dash.summary,
                      loading: dash.loading && !dash.hasData,
                      failed: dash.error != null,
                      onTap: openModule,
                    ),
                    if (master.isNotEmpty) ...[
                      const SizedBox(height: 20),
                      _StatGrid(
                        title: 'Data Master',
                        modules: master,
                        summary: dash.summary,
                        loading: dash.loading && !dash.hasData,
                        failed: dash.error != null,
                        onTap: openModule,
                      ),
                    ],
                    if (canViewSummary && dash.summary.recent.isNotEmpty) ...[
                      const SizedBox(height: 20),
                      _RecentCard(
                        items: dash.summary.recent,
                        onTap: openRecent,
                      ),
                    ],
                    if (modules.isEmpty) ...[
                      const SizedBox(height: 20),
                      const _NoModuleCard(),
                    ],
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// Fallback saat [onUnavailable] tidak diberikan (mis. dipakai di preview).
  static void Function(String) _defaultUnavailable(BuildContext context) {
    return (label) {
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(content: Text('$label segera hadir di aplikasi mobile.')),
        );
    };
  }
}

/// Hero gelap: sapaan + nama, tanggal panjang, dan identitas depo/role.
///
/// Warna, jarak atas, dan bentuk pita diambil dari [PageHeader] yang sama
/// dengan tab lain — bedanya hanya isi (sapaan + chip depo/role), supaya
/// Beranda tidak terlihat seperti aplikasi yang berbeda dari Check In.
class _Hero extends StatelessWidget {
  const _Hero();

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final user = auth.user;
    final name = user?.fullName ?? '-';
    final firstName = name.trim().isEmpty ? '-' : name.trim().split(' ').first;
    final depot = user == null ? '-' : '${user.kodeDepo} • ${user.namaDepo}';

    return PageHeader(
      // Web: "Selamat pagi, <span class="text-primary-300">Budi</span>".
      // Nama depan lewat `accent` supaya warna emphasis-nya milik widget
      // header, bukan dirangkai manual di sini.
      title: '${greetingFor(DateTime.now().hour)},',
      accent: firstName,
      subtitle: formatLongDate(DateTime.now()),
      icon: Icons.warehouse_outlined,
      iconSolid: true,
      chips: [
        HeaderChip(icon: Icons.warehouse_outlined, label: depot),
        for (final role in user?.roles ?? const <AuthRole>[])
          HeaderChip(icon: Icons.badge_outlined, label: role.name),
      ],
    );
  }
}

class _AlertGrid extends StatelessWidget {
  const _AlertGrid({required this.alerts, required this.onTap});

  final List<DashboardAlert> alerts;
  final void Function(DashboardAlert alert) onTap;

  @override
  Widget build(BuildContext context) {
    return TileGrid(
      tiles: [
        for (final a in alerts)
          StatTile(
            label: a.label,
            icon: Icons.warning_amber_rounded,
            tone: a.tone,
            // Nilai peringatan sudah berupa teks ("12", "3,5 jam") jadi
            // ditugaskan lewat `value` yang sudah diformat sebagai label penuh.
            valueText: a.value,
            hint: a.hint,
            onTap: () => onTap(a),
            semanticLabel: '${a.label}: ${a.value}. ${a.hint}',
          ),
      ],
    );
  }
}

/// Kartu statistik per modul — grid 2 kolom seperti web.
class _StatGrid extends StatelessWidget {
  const _StatGrid({
    required this.title,
    required this.modules,
    required this.summary,
    required this.loading,
    required this.failed,
    required this.onTap,
  });

  final String title;
  final List<DashboardModule> modules;
  final DashboardSummary summary;
  final bool loading;
  final bool failed;
  final void Function(DashboardModule module) onTap;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SectionHeader(title: title),
        TileGrid(
          tiles: [
            for (final m in modules)
              if (loading) const SkeletonStatTile() else _moduleTile(m),
          ],
        ),
      ],
    );
  }

  Widget _moduleTile(DashboardModule m) {
    final total = summary.totalOf(m.key);
    // `total == null` berarti backend tidak mengirim modul ini: sebelum
    // data masuk -> masih memuat, setelah data masuk -> kontrak berubah
    // dan angka tidak boleh dikarang jadi 0.
    final state = failed
        ? StatState.failed
        : total == null
        ? StatState.loading
        : StatState.ready;
    return StatTile(
      label: m.label,
      icon: m.icon,
      tone: m.tone,
      value: total,
      delta: summary.deltaOf(m.key),
      state: state,
      onTap: () => onTap(m),
    );
  }
}

/// Aktivitas terbaru lintas modul — padanan `DashboardRecent.tsx`.
class _RecentCard extends StatelessWidget {
  const _RecentCard({required this.items, required this.onTap});

  final List<DashboardRecentItem> items;
  final void Function(DashboardRecentItem item) onTap;

  @override
  Widget build(BuildContext context) {
    return SectionCard(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SectionHeader(
            title: 'Aktivitas Terbaru',
            subtitle: 'Perubahan terakhir lintas modul',
            icon: Icons.history,
          ),
          const Divider(height: 1),
          for (var i = 0; i < items.length; i++) ...[
            _RecentRow(item: items[i], onTap: () => onTap(items[i])),
            if (i < items.length - 1)
              const Divider(height: 1, indent: 16, endIndent: 16),
          ],
        ],
      ),
    );
  }
}

class _RecentRow extends StatelessWidget {
  const _RecentRow({required this.item, required this.onTap});

  final DashboardRecentItem item;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return SectionCard(
      onTap: onTap,
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      color: Colors.transparent,
      borderColor: Colors.transparent,
      radius: 0,
      semanticLabel: '${item.type}: ${item.title}',
      child: Row(
        children: [
          // Pill tipe ikut boleh menyusut: pada layar sangat sempit atau
          // label tipe panjang, pill tetap utuh dan tidak menyingkirkan judul
          // yang justru informatif.
          Flexible(
            child: StatusPill(label: item.type, tone: _typeTone(item.type)),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item.title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 13.5,
                    fontWeight: FontWeight.w600,
                    color: AppColors.gray800,
                  ),
                ),
                if (item.subtitle.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    item.subtitle,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppColors.gray400,
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 8),
          Text(
            formatRelativeTime(item.at),
            style: const TextStyle(fontSize: 11.5, color: AppColors.gray400),
          ),
        ],
      ),
    );
  }

  /// Warna pill per jenis modul — pasangan `TYPE_TONES` di
  /// `DashboardRecent.tsx` (`bg-amber-100 text-amber-700`, …).
  static PillTone _typeTone(String type) => switch (type) {
    'Rencana Kirim' => PillTone.warning,
    'Validasi SJ' => PillTone.primary,
    'Receiving' => PillTone.info,
    _ => PillTone.neutral,
  };
}

class _NoModuleCard extends StatelessWidget {
  const _NoModuleCard();

  @override
  Widget build(BuildContext context) {
    return SectionCard(
      color: AppColors.warningBg,
      borderColor: AppColors.warningBorder,
      child: const Text(
        'Tidak ada menu operasional untuk akun ini. Minta akses ke admin.',
        style: TextStyle(color: AppColors.warningText, fontSize: 13),
      ),
    );
  }
}
