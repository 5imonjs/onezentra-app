import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:go_router/go_router.dart';

import 'package:onezentra_mobile/core/theme/app_theme.dart';
import 'package:onezentra_mobile/features/auth/providers/auth_provider.dart';
import 'package:onezentra_mobile/features/dashboard/pages/dashboard_page.dart';
import 'package:onezentra_mobile/features/modules/pages/modules_page.dart';
import 'package:onezentra_mobile/features/common/pages/placeholder_page.dart';

/// Main Shell with Bottom Navigation + Drawer Menu
/// Accepts [child] from ShellRoute for nested navigation
class MainShell extends StatefulWidget {

  const MainShell({required this.child, super.key});
  final Widget child;

  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> with TickerProviderStateMixin {
  int _currentIndex = 0;

  /// Routes that render their own page instead of the bottom-nav tab stack.
  /// `widget.child` from the ShellRoute was previously unreachable, because
  /// every mapped index stayed inside the `IndexedStack`.
  static const Set<String> _detailRoutes = {'/gate'};

  /// One representative route per bottom-nav tab. Tapping a tab navigates
  /// here so the router leaves any detail route — otherwise `/gate` would
  /// stay the current location and keep rendering over the selected tab.
  static const List<String> _tabRoutes = [
    '/dashboard',
    '/modules',
    '/penerimaan',
    '/biaya-thl',
    '/reports/penerimaan',
  ];

  final List<Widget> _pages = [
    const DashboardPage(),
    const ModulesPage(),
    const PlaceholderPage(title: 'Penerimaan', icon: Icons.inventory_2_rounded),
    const PlaceholderPage(title: 'Pengiriman', icon: Icons.local_shipping_rounded),
    const PlaceholderPage(title: 'Laporan', icon: Icons.analytics_rounded),
  ];

  final List<_NavItem> _navItems = [
    _NavItem('Dashboard', Icons.dashboard_rounded, Icons.dashboard_outlined),
    _NavItem('Modul', Icons.apps_rounded, Icons.apps_outlined),
    _NavItem('Penerimaan', Icons.inventory_2_rounded, Icons.inventory_2_outlined),
    _NavItem('Pengiriman', Icons.local_shipping_rounded, Icons.local_shipping_outlined),
    _NavItem('Laporan', Icons.analytics_rounded, Icons.analytics_outlined),
  ];

  // Map routes to bottom nav indices
  final Map<String, int> _routeToIndex = {
    '/dashboard': 0,
    '/modules': 1,
    '/penerimaan': 2,
    '/rencana-kirim': 2,
    '/validasi-sj': 2,
    '/gate': 2,
    '/opname-expired': 2,
    '/biaya-thl': 3,
    '/biaya-retribusi': 3,
    '/approval-settings': 3,
    '/reports': 4,
    '/reports/penerimaan': 4,
    '/reports/rencana-kirim': 4,
    '/reports/biaya-thl': 4,
    '/reports/biaya-retribusi': 4,
    '/reports/selisih-qty': 4,
    '/npn': 1,
    '/standar-umur': 1,
    '/standarisasi': 1,
    '/docks': 1,
    '/tarif-retribusi': 1,
    '/users': 1,
    '/roles': 1,
    '/email-settings': 1,
    '/profile': 1,
  };

  @override
  void initState() {
    super.initState();
    // Listen to route changes to update bottom nav selection
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _listenToRouteChanges();
    });
  }

  void _listenToRouteChanges() {
    var router = GoRouter.of(context);
    router.routeInformationProvider.addListener(_onRouteChanged);
  }

  void _onRouteChanged() {
    var router = GoRouter.of(context);
    var location = router.routerDelegate.currentConfiguration.uri.path;

    // Find matching route index
    int? newIndex;
    for (var entry in _routeToIndex.entries) {
      if (location.startsWith(entry.key)) {
        newIndex = entry.value;
        break;
      }
    }

    // Always rebuild: the body also depends on whether the current location
    // is a detail route (e.g. the drawer just opened `/gate`).
    setState(() {
      if (newIndex != null) {
        _currentIndex = newIndex;
      }
    });
  }

  @override
  void dispose() {
    // Use the router from the widget tree instead of context
    if (mounted) {
      try {
        var router = GoRouter.of(context);
        router.routeInformationProvider.removeListener(_onRouteChanged);
      } catch (_) {
        // Ignore if context is no longer valid
      }
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    var authProvider = context.watch<AuthProvider>();
    var user = authProvider.user;
    var location = GoRouter.of(
      context,
    ).routerDelegate.currentConfiguration.uri.path;
    var showDetail = _detailRoutes.contains(location);

    return Scaffold(
      body: showDetail
          ? widget.child
          : IndexedStack(index: _currentIndex, children: _pages),
      bottomNavigationBar: _buildBottomNavBar(),
      drawer: _buildDrawer(context, user),
    );
  }

  Widget _buildBottomNavBar() => DecoratedBox(
      decoration: BoxDecoration(
        color: AppTheme.surfaceCard,
        border: const Border(
          top: BorderSide(color: AppTheme.gray100),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            offset: const Offset(0, -4),
            blurRadius: 12,
          ),
        ],
      ),
      child: SafeArea(
        child: SizedBox(
          height: 64,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: List.generate(_navItems.length, (index) {
              var item = _navItems[index];
              var isSelected = _currentIndex == index;
              return _buildNavItem(item, isSelected, index);
            }),
          ),
        ),
      ),
    );

  Widget _buildNavItem(_NavItem item, bool isSelected, int index) => Expanded(
      child: InkWell(
        onTap: () {
          context.go(_tabRoutes[index]);
          setState(() => _currentIndex = index);
        },
        borderRadius: AppTheme.radiusLg,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            AnimatedSwitcher(
              duration: const Duration(milliseconds: 200),
              child: Icon(
                isSelected ? item.filledIcon : item.outlineIcon,
                key: ValueKey(isSelected),
                size: 24,
                color: isSelected ? AppTheme.primary600 : AppTheme.gray400,
              ),
            ),
            const SizedBox(height: 2),
            AnimatedDefaultTextStyle(
              duration: const Duration(milliseconds: 200),
              style: GoogleFonts.roboto(
                fontSize: 10,
                fontWeight: isSelected ? FontWeight.w600 : FontWeight.w500,
                color: isSelected ? AppTheme.primary600 : AppTheme.gray400,
                height: 1.2,
              ),
              child: Text(item.label),
            ),
          ],
        ),
      ),
    );

  Widget _buildDrawer(BuildContext context, user) => Drawer(
      width: MediaQuery.of(context).size.width * 0.85,
      child: Column(
        children: [
          // Drawer Header
          Container(
            width: double.infinity,
            padding: const EdgeInsets.fromLTRB(AppTheme.space6, AppTheme.space8, AppTheme.space6, AppTheme.space6),
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [AppTheme.primary600, AppTheme.primary700],
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Logo
                Image.asset(
                  'assets/images/LOGO.png',
                  width: 120,
                  height: 30,
                  fit: BoxFit.contain,
                  color: Colors.white,
                  colorBlendMode: BlendMode.srcIn,
                ),
                const SizedBox(height: AppTheme.space6),
                // User Info
                Row(
                  children: [
                    Container(
                      width: 48,
                      height: 48,
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.2),
                        borderRadius: AppTheme.radiusFull,
                      ),
                      child: const Icon(
                        Icons.person_rounded,
                        size: 24,
                        color: Colors.white,
                      ),
                    ),
                    const SizedBox(width: AppTheme.space3),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            user?.fullName ?? 'User',
                            style: GoogleFonts.roboto(
                              fontSize: 16,
                              fontWeight: FontWeight.w600,
                              color: Colors.white,
                            ),
                          ),
                          Text(
                            user?.roleDisplayName ?? 'Staff',
                            style: GoogleFonts.roboto(
                              fontSize: 12,
                              color: Colors.white.withValues(alpha: 0.8),
                            ),
                          ),
                        ],
                      ),
                    ),
                    if (user?.kodeDepo != null)
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: AppTheme.space3,
                          vertical: AppTheme.space1,
                        ),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.2),
                          borderRadius: AppTheme.radiusFull,
                        ),
                        child: Text(
                          user!.kodeDepo!,
                          style: GoogleFonts.roboto(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            color: Colors.white,
                          ),
                        ),
                      ),
                  ],
                ),
              ],
            ),
          ),

          // Menu Items
          Expanded(
            child: ListView(
              padding: const EdgeInsets.symmetric(vertical: AppTheme.space3),
              children: [
                _buildDrawerSection('OPERASIONAL', [
                  _DrawerItem(Icons.door_front_door_rounded, 'Check In Point', '/gate', ['gate.view']),
                  _DrawerItem(Icons.inventory_2_rounded, 'Penerimaan', '/penerimaan', ['penerimaan.view']),
                  _DrawerItem(Icons.local_shipping_rounded, 'Rencana Kirim', '/rencana-kirim', ['rencana_kirim.view']),
                  _DrawerItem(Icons.verified_rounded, 'Validasi SJ', '/validasi-sj', ['sj_validation.view']),
                  _DrawerItem(Icons.fact_check_rounded, 'Opname Expired', '/opname-expired', ['opname.view']),
                ]),
                _buildDrawerSection('BIAYA & APPROVAL', [
                  _DrawerItem(Icons.receipt_long_rounded, 'Biaya THL', '/biaya-thl', ['biaya_thl.view']),
                  _DrawerItem(Icons.money_rounded, 'Biaya Retribusi', '/biaya-retribusi', ['biaya_retribusi.view']),
                  _DrawerItem(Icons.approval_rounded, 'Approval Settings', '/approval-settings', ['approval.view']),
                ]),
                _buildDrawerSection('MASTER DATA', [
                  _DrawerItem(Icons.settings_rounded, 'NPN', '/npn', ['npn.view']),
                  _DrawerItem(Icons.calendar_today_rounded, 'Standar Umur Produk', '/standar-umur', ['standar_umur.view']),
                  _DrawerItem(Icons.layers_rounded, 'Standarisasi Tumpukan', '/standarisasi', ['standarisasi.view']),
                  _DrawerItem(Icons.dock_rounded, 'Dock Management', '/docks', ['receiving.view']),
                  _DrawerItem(Icons.attach_money_rounded, 'Tarif Retribusi', '/tarif-retribusi', ['retribusi_rates.manage']),
                ]),
                _buildDrawerSection('LAPORAN', [
                  _DrawerItem(Icons.analytics_rounded, 'Dashboard Summary', '/dashboard', ['dashboard.view']),
                  _DrawerItem(Icons.inventory_rounded, 'Laporan Penerimaan', '/reports/penerimaan', ['reports.view']),
                  _DrawerItem(Icons.local_shipping_rounded, 'Laporan Pengiriman', '/reports/rencana-kirim', ['reports.view']),
                  _DrawerItem(Icons.receipt_rounded, 'Laporan Biaya THL', '/reports/biaya-thl', ['reports.biaya_thl']),
                  _DrawerItem(Icons.money_off_rounded, 'Laporan Retribusi', '/reports/biaya-retribusi', ['reports.biaya_retribusi']),
                  _DrawerItem(Icons.compare_rounded, 'Selisih Qty', '/reports/selisih-qty', ['reports.view']),
                ]),
                _buildDrawerSection('PENGATURAN', [
                  _DrawerItem(Icons.people_rounded, 'Users', '/users', ['users.view']),
                  _DrawerItem(Icons.security_rounded, 'Roles & Permissions', '/roles', ['roles.view']),
                  _DrawerItem(Icons.email_rounded, 'Email Settings', '/email-settings', ['emails.view']),
                  _DrawerItem(Icons.person_rounded, 'Profil Saya', '/profile', []),
                ]),
              ],
            ),
          ),

          // Footer
          Container(
            padding: const EdgeInsets.all(AppTheme.space4),
            decoration: const BoxDecoration(
              border: Border(top: BorderSide(color: AppTheme.gray100)),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    'v1.0.0',
                    style: GoogleFonts.roboto(
                      fontSize: 12,
                      color: AppTheme.gray400,
                    ),
                  ),
                ),
                TextButton.icon(
                  onPressed: () {
                    Navigator.of(context).pop();
                    context.read<AuthProvider>().logout();
                  },
                  icon: const Icon(Icons.logout_rounded, size: 18, color: AppTheme.danger),
                  label: Text(
                    'Logout',
                    style: GoogleFonts.roboto(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: AppTheme.danger,
                    ),
                  ),
                  style: TextButton.styleFrom(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );

  Widget _buildDrawerSection(String title, List<_DrawerItem> items) {
    // Same rule as the web sidebar: an item the role cannot use is hidden
    // outright, and a section with nothing left to show disappears as well.
    var user = context.watch<AuthProvider>().user;
    var visibleItems = items
        .where(
          (item) =>
              item.requiredPermissions.isEmpty ||
              (user?.hasAnyPermission(item.requiredPermissions) ?? false),
        )
        .toList();
    if (visibleItems.isEmpty) {
      return const SizedBox.shrink();
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(AppTheme.space4, AppTheme.space4, AppTheme.space4, AppTheme.space2),
          child: Text(
            title,
            style: GoogleFonts.roboto(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              letterSpacing: 0.5,
              color: AppTheme.gray500,
            ),
          ),
        ),
        ...visibleItems.map((item) => _buildDrawerTile(context, item)),
      ],
    );
  }

  Widget _buildDrawerTile(BuildContext context, _DrawerItem item) => ListTile(
      dense: true,
      leading: Icon(item.icon, size: 20, color: AppTheme.gray600),
      title: Text(
        item.label,
        style: GoogleFonts.roboto(
          fontSize: 14,
          fontWeight: FontWeight.w500,
          color: AppTheme.gray700,
        ),
      ),
      onTap: () {
        Navigator.of(context).pop();
        if (_detailRoutes.contains(item.route)) {
          // A real page exists: show it instead of a placeholder.
          context.go(item.route);
        } else if (item.route != '/profile') {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('${item.label} - Coming soon')),
          );
        } else {
          Navigator.of(context).pushNamed(item.route);
        }
      },
    );
}

class _NavItem {

  _NavItem(this.label, this.filledIcon, this.outlineIcon);
  final String label;
  final IconData filledIcon;
  final IconData outlineIcon;
}

class _DrawerItem {

  _DrawerItem(this.icon, this.label, this.route, this.requiredPermissions);
  final IconData icon;
  final String label;
  final String route;
  final List<String> requiredPermissions;
}