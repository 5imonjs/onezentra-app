import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:onezentra_mobile/features/auth/auth_provider.dart';
import 'package:onezentra_mobile/features/dashboard/dashboard_provider.dart';
import 'package:onezentra_mobile/features/dashboard/dashboard_screen.dart';
import 'package:onezentra_mobile/features/gate/gate_checkin_screen.dart';
import 'package:onezentra_mobile/features/gate/gate_provider.dart';
import 'package:onezentra_mobile/features/gate/gate_service.dart';
import 'package:onezentra_mobile/features/validation/validation_screen.dart';
import 'package:onezentra_mobile/features/validation/validation_service.dart';
import 'package:onezentra_mobile/theme/app_colors.dart';
import 'package:onezentra_mobile/widgets/page_header.dart';
import 'package:onezentra_mobile/widgets/section_card.dart';
import 'package:onezentra_mobile/widgets/status_pill.dart';

/// Kerangka aplikasi setelah login: bottom navigation + IndexedStack.
///
/// Tab Check In (`gate.view`) dan Validasi Dokumen (`sj_validation.view`)
/// hanya dibuat bila pengguna punya izinnya, jadi menu tersebut tidak bisa
/// dibuka lewat UI tanpa izin.
class HomeShell extends StatefulWidget {
  const HomeShell({super.key, this.gateService, this.validationService});

  /// Bisa di-inject untuk pengujian; default memakai Dio global.
  final GateService? gateService;
  final ValidationService? validationService;

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  /// Tab aktif disimpan sebagai key, bukan index: saat izin berubah (mis.
  /// logout lalu login sebagai role lain) daftar menu bisa bertambah/berkurang
  /// dan index lama tidak lagi menunjuk menu yang sama.
  String _tab = 'home';

  /// Dokumen yang dikirim dari tab Check In ke tab Validasi, supaya PO-nya
  /// tidak perlu di-scan dua kali.
  ValidationStartRequest? _validationRequest;
  int _validationRequestToken = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _loadGateData();
      _loadDashboard();
    });
  }

  void _loadGateData() {
    if (!mounted) return;
    if (!context.read<AuthProvider>().hasPermission('gate.view')) {
      return;
    }
    final gate = context.read<GateProvider>();
    gate.loadStats();
    gate.loadHistory(reset: true);
  }

  /// Ringkasan Beranda hanya diambil bila akunnya memang boleh melihatnya
  /// (`dashboard.view`) — endpoint-nya 403 untuk akun tanpa izin itu.
  void _loadDashboard() {
    if (!mounted) return;
    if (!context.read<AuthProvider>().hasPermission('dashboard.view')) {
      return;
    }
    context.read<DashboardProvider>().load();
  }

  void _openTab(String key) {
    if (!mounted) return;
    setState(() => _tab = key);
    // Angka Beranda bisa saja sudah basi (operator baru saja Gate IN di tab
    // lain), jadi saat kembali ke Beranda ringkasannya disegarkan diam-diam.
    if (key == 'home') {
      _loadDashboard();
    }
  }

  /// Buka tab Validasi Dokumen untuk dokumen yang sudah ditemukan di Check
  /// In — ini yang menghapus langkah scan/ketik PO kedua.
  void _openValidationFor(int rencanaKirimId) {
    if (!context.read<AuthProvider>().hasPermission('sj_validation.create')) {
      return;
    }
    setState(() {
      _tab = 'validation';
      _validationRequest = ValidationStartRequest(
        rencanaKirimId: rencanaKirimId,
        token: ++_validationRequestToken,
      );
    });
  }

  /// Modul yang angkanya tampil di Beranda tapi belum punya halaman mobile.
  void _showUnavailable(String label) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(content: Text('$label segera hadir di aplikasi mobile.')),
      );
  }

  Future<void> _confirmLogout() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Keluar?'),
        content: const Text('Sesi di perangkat ini akan dihapus.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Batal'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Keluar'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    await context.read<AuthProvider>().logout();
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final canGate = auth.hasPermission('gate.view');
    final canValidation = auth.hasPermission('sj_validation.view');
    final destinations = <_ShellDestination>[
      const _ShellDestination(
        key: 'home',
        label: 'Beranda',
        icon: Icons.grid_view_outlined,
        selectedIcon: Icons.grid_view,
      ),
      if (canGate)
        const _ShellDestination(
          key: 'gate',
          label: 'Check In',
          icon: Icons.qr_code_scanner_outlined,
          selectedIcon: Icons.qr_code_scanner,
        ),
      if (canValidation)
        const _ShellDestination(
          key: 'validation',
          label: 'Validasi',
          icon: Icons.fact_check_outlined,
          selectedIcon: Icons.fact_check,
        ),
      const _ShellDestination(
        key: 'profile',
        label: 'Saya',
        icon: Icons.person_outline,
        selectedIcon: Icons.person,
      ),
    ];
    // Izin yang dicabut saat sesi berubah membuat tab aktif hilang dari daftar;
    // fallback ke menu pertama supaya IndexedStack tidak menunjuk di luar jangkauan.
    var index = destinations.indexWhere((d) => d.key == _tab);
    if (index < 0) {
      index = 0;
    }

    return Scaffold(
      backgroundColor: AppColors.surface,
      body: IndexedStack(
        index: index,
        children: [
          DashboardScreen(onOpenTab: _openTab, onUnavailable: _showUnavailable),
          if (canGate)
            GateCheckinScreen(
              service: widget.gateService,
              onOpenValidation: canValidation ? _openValidationFor : null,
            ),
          if (canValidation)
            ValidationScreen(
              service: widget.validationService,
              startRequest: _validationRequest,
            ),
          ProfileScreen(onLogout: _confirmLogout),
        ],
      ),
      // Garis tipis di atas nav: dengan latar `surface`, tanpa pemisah bar
      // navigasi terlihat "melayang" di atas konten.
      bottomNavigationBar: DecoratedBox(
        decoration: const BoxDecoration(
          border: Border(top: BorderSide(color: AppColors.gray200)),
        ),
        child: NavigationBar(
          selectedIndex: index,
          // Lewat `_openTab` (bukan setState langsung) supaya kembali ke Beranda
          // juga menyegarkan ringkasan — operator bisa saja baru saja Gate IN
          // atau menyelesaikan validasi di tab lain.
          onDestinationSelected: (i) => _openTab(destinations[i].key),
          destinations: [
            for (final d in destinations)
              NavigationDestination(
                icon: Icon(d.icon),
                selectedIcon: Icon(d.selectedIcon),
                label: d.label,
              ),
          ],
        ),
      ),
    );
  }
}

class _ShellDestination {
  const _ShellDestination({
    required this.key,
    required this.label,
    required this.icon,
    required this.selectedIcon,
  });

  /// Pengenal stabil untuk tiap menu, bukan index — pindah tab dari dashboard
  /// tetap mendarat di menu yang benar walau daftar menu berubah.
  final String key;
  final String label;
  final IconData icon;
  final IconData selectedIcon;
}

/// Tab "Saya" — identitas, depo, izin, dan keluar.
///
/// Pita header-nya [PageHeader] yang sama dengan tab lain supaya perpindahan
/// menu tidak terasa seperti pindah aplikasi.
class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key, required this.onLogout});

  final VoidCallback onLogout;

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    return Scaffold(
      backgroundColor: AppColors.surface,
      body: Column(
        children: [
          PageHeader(
            title: 'Saya',
            subtitle: auth.user?.email ?? '-',
            icon: Icons.person_outline,
            iconSolid: true,
          ),
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  SectionCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          auth.user?.fullName ?? '-',
                          style: const TextStyle(
                            fontWeight: FontWeight.w800,
                            fontSize: 15,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          auth.user?.email ?? '-',
                          style: const TextStyle(color: AppColors.gray500),
                        ),
                        const SizedBox(height: 10),
                        Wrap(
                          spacing: 6,
                          runSpacing: 6,
                          children: [
                            _InfoChip(
                              icon: Icons.warehouse_outlined,
                              label:
                                  '${auth.user?.kodeDepo ?? '-'} • ${auth.user?.namaDepo ?? '-'}',
                            ),
                            if (auth.user?.roles.isNotEmpty ?? false)
                              _InfoChip(
                                icon: Icons.badge_outlined,
                                label: auth.user!.roles
                                    .map((r) => r.name)
                                    .join(', '),
                              ),
                          ],
                        ),
                        const SizedBox(height: 12),
                        Text(
                          '${auth.permissions.length} izin aktif',
                          style: const TextStyle(
                            color: AppColors.gray500,
                            fontSize: 13,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  OutlinedButton.icon(
                    onPressed: onLogout,
                    icon: const Icon(Icons.logout),
                    label: const Text('Keluar'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppColors.errorText,
                      side: const BorderSide(color: AppColors.errorBorder),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _InfoChip extends StatelessWidget {
  const _InfoChip({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return StatusPill(label: label, tone: PillTone.neutral, icon: icon);
  }
}
