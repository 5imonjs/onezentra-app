import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:onezentra_mobile/features/auth/auth_provider.dart';
import 'package:onezentra_mobile/features/gate/gate_provider.dart';
import 'package:onezentra_mobile/theme/app_colors.dart';

class _MenuDef {
  const _MenuDef({
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.permission,
    required this.route,
    this.soon = false,
  });

  final String title;
  final String subtitle;
  final IconData icon;
  final String permission;
  final String? route;
  final bool soon;
}

const _menus = [
  _MenuDef(
    title: 'Check In Point',
    subtitle: 'Scan SJ / PO',
    icon: Icons.qr_code_scanner,
    permission: 'gate.view',
    route: '/gate',
  ),
  _MenuDef(
    title: 'Validasi Dokumen',
    subtitle: 'Segera hadir',
    icon: Icons.fact_check_outlined,
    permission: 'sj_validation.view',
    route: null,
    soon: true,
  ),
  _MenuDef(
    title: 'Check Out',
    subtitle: 'Segera hadir',
    icon: Icons.forklift,
    permission: 'receiving.view',
    route: null,
    soon: true,
  ),
  _MenuDef(
    title: 'Inbound',
    subtitle: 'Segera hadir',
    icon: Icons.inventory_2_outlined,
    permission: 'penerimaan.view',
    route: null,
    soon: true,
  ),
];

/// Dashboard modern — header identitas + statistik gate + grid menu
/// operasional berbasis permission (mirror Sidebar web).
class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  int _tab = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _guard());
  }

  Future<void> _guard() async {
    final auth = context.read<AuthProvider>();
    await auth.restore();
    if (!mounted) {
      return;
    }
    if (!auth.isAuthenticated) {
      Navigator.of(context).pushReplacementNamed('/');
      return;
    }
    if (auth.hasPermission('gate.view')) {
      final gate = context.read<GateProvider>();
      gate.loadStats();
    }
    setState(() {});
  }

  void _openMenu(_MenuDef menu) {
    if (menu.route != null) {
      Navigator.of(context).pushNamed(menu.route!);
      return;
    }
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(content: Text('${menu.title} segera hadir di mobile.')),
      );
  }

  Future<void> _logout() async {
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
    if (ok != true || !mounted) {
      return;
    }
    await context.read<AuthProvider>().logout();
    if (!mounted) {
      return;
    }
    Navigator.of(context).pushReplacementNamed('/');
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    if (!auth.isAuthenticated) {
      return const Scaffold(
        backgroundColor: AppColors.surface,
        body: Center(
          child: CircularProgressIndicator(color: AppColors.primary600),
        ),
      );
    }
    final visibleMenus = _menus
        .where((m) => auth.hasPermission(m.permission))
        .toList();

    return Scaffold(
      backgroundColor: AppColors.surface,
      body: _tab == 0
          ? _HomeTab(
              menus: visibleMenus,
              onOpen: _openMenu,
              onLogout: _logout,
              onRefresh: () => context.read<GateProvider>().loadStats(),
            )
          : _tab == 1
          ? _ShortcutTab(
              onGate: () => Navigator.of(context).pushNamed('/gate'),
              canGate: auth.hasPermission('gate.view'),
            )
          : _ProfileTab(onLogout: _logout),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.grid_view_outlined),
            selectedIcon: Icon(Icons.grid_view),
            label: 'Beranda',
          ),
          NavigationDestination(
            icon: Icon(Icons.qr_code_scanner),
            label: 'Check In',
          ),
          NavigationDestination(
            icon: Icon(Icons.person_outline),
            selectedIcon: Icon(Icons.person),
            label: 'Saya',
          ),
        ],
      ),
    );
  }
}

class _HomeTab extends StatelessWidget {
  const _HomeTab({
    required this.menus,
    required this.onOpen,
    required this.onLogout,
    required this.onRefresh,
  });

  final List<_MenuDef> menus;
  final ValueChanged<_MenuDef> onOpen;
  final VoidCallback onLogout;
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final gate = context.watch<GateProvider>();
    final name = auth.user?.fullName ?? '-';
    final depot = auth.user != null
        ? '${auth.user!.kodeDepo} • ${auth.user!.namaDepo}'
        : '-';

    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView(
        padding: EdgeInsets.zero,
        children: [
          Container(
            padding: const EdgeInsets.fromLTRB(20, 60, 20, 22),
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                colors: [AppColors.gray900, AppColors.primary950],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.vertical(bottom: Radius.circular(28)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      width: 48,
                      height: 48,
                      decoration: BoxDecoration(
                        gradient: const LinearGradient(
                          colors: [AppColors.primary500, AppColors.primary700],
                        ),
                        borderRadius: BorderRadius.circular(16),
                      ),
                      alignment: Alignment.center,
                      child: Text(
                        name.isEmpty ? '?' : name[0].toUpperCase(),
                        style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w800,
                          fontSize: 20,
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Halo, $name',
                            style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w800,
                              fontSize: 17,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                          const SizedBox(height: 2),
                          Text(
                            depot,
                            style: const TextStyle(
                              color: AppColors.primary200,
                              fontSize: 12.5,
                            ),
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      onPressed: onLogout,
                      tooltip: 'Keluar',
                      icon: const Icon(Icons.logout, color: Colors.white70),
                    ),
                  ],
                ),
                if (auth.hasPermission('gate.view')) ...[
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      _MiniStat(
                        label: 'Hari ini',
                        value: gate.statsLoading
                            ? '…'
                            : '${gate.stats.hariIni}',
                      ),
                      const SizedBox(width: 8),
                      _MiniStat(
                        label: 'Terjadwal',
                        value: gate.statsLoading
                            ? '…'
                            : '${gate.stats.terjadwal}',
                      ),
                      const SizedBox(width: 8),
                      _MiniStat(
                        label: 'Selesai',
                        value: gate.statsLoading
                            ? '…'
                            : '${gate.stats.selesai}',
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Gate Check',
                  style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
                ),
                const SizedBox(height: 4),
                const Text(
                  'Menu operasional gudang berbasis izin Anda.',
                  style: TextStyle(color: AppColors.gray500, fontSize: 13),
                ),
                const SizedBox(height: 12),
                if (menus.isEmpty)
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: const Color(0xFFFFFBEB),
                      border: Border.all(color: const Color(0xFFFDE68A)),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: const Text(
                      'Tidak ada menu operasional untuk akun ini. Minta akses ke admin.',
                      style: TextStyle(color: Color(0xFF92400E)),
                    ),
                  )
                else
                  GridView.builder(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    gridDelegate:
                        const SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: 2,
                          mainAxisSpacing: 12,
                          crossAxisSpacing: 12,
                          childAspectRatio: 1.05,
                        ),
                    itemCount: menus.length,
                    itemBuilder: (context, i) {
                      final m = menus[i];
                      return _MenuCard(menu: m, onTap: () => onOpen(m));
                    },
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _MiniStat extends StatelessWidget {
  const _MiniStat({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Column(
          children: [
            Text(
              value,
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w800,
                fontSize: 17,
              ),
            ),
            Text(
              label,
              style: const TextStyle(color: AppColors.primary200, fontSize: 11),
            ),
          ],
        ),
      ),
    );
  }
}

class _MenuCard extends StatelessWidget {
  const _MenuCard({required this.menu, required this.onTap});

  final _MenuDef menu;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final active = menu.route != null;
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(20),
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            border: Border.all(color: AppColors.gray200),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: active ? AppColors.primary600 : AppColors.gray100,
                  borderRadius: BorderRadius.circular(14),
                ),
                alignment: Alignment.center,
                child: Icon(
                  menu.icon,
                  color: active ? Colors.white : AppColors.gray500,
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    menu.title,
                    style: const TextStyle(fontWeight: FontWeight.w800),
                  ),
                  const SizedBox(height: 2),
                  Row(
                    children: [
                      Flexible(
                        child: Text(
                          menu.subtitle,
                          style: TextStyle(
                            color: active
                                ? AppColors.primary600
                                : AppColors.gray500,
                            fontSize: 12,
                          ),
                        ),
                      ),
                      if (active)
                        const Icon(
                          Icons.arrow_forward,
                          size: 14,
                          color: AppColors.primary600,
                        ),
                    ],
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ShortcutTab extends StatelessWidget {
  const _ShortcutTab({required this.onGate, required this.canGate});

  final VoidCallback onGate;
  final bool canGate;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'Aksi cepat',
              style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18),
            ),
            const SizedBox(height: 4),
            const Text(
              'Mulai dari sini untuk operasional gate harian.',
              style: TextStyle(color: AppColors.gray500),
            ),
            const SizedBox(height: 16),
            SizedBox(
              height: 56,
              child: FilledButton.icon(
                onPressed: canGate ? onGate : null,
                icon: const Icon(Icons.qr_code_scanner),
                label: const Text('Buka Check In Point'),
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.primary600,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                  ),
                ),
              ),
            ),
            if (!canGate)
              const Padding(
                padding: EdgeInsets.only(top: 12),
                child: Text(
                  'Akun ini tidak memiliki izin gate.view.',
                  style: TextStyle(color: AppColors.gray500),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _ProfileTab extends StatelessWidget {
  const _ProfileTab({required this.onLogout});

  final VoidCallback onLogout;

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'Saya',
              style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18),
            ),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white,
                border: Border.all(color: AppColors.gray200),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    auth.user?.fullName ?? '-',
                    style: const TextStyle(fontWeight: FontWeight.w800),
                  ),
                  Text(
                    auth.user?.email ?? '-',
                    style: const TextStyle(color: AppColors.gray500),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '${auth.user?.kodeDepo ?? '-'} • ${auth.user?.namaDepo ?? '-'}',
                    style: const TextStyle(
                      color: AppColors.gray500,
                      fontSize: 13,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            SizedBox(
              height: 52,
              child: OutlinedButton.icon(
                onPressed: onLogout,
                icon: const Icon(Icons.logout),
                label: const Text('Keluar'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
