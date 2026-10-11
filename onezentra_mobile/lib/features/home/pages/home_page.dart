import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';

import 'package:onezentra_mobile/core/theme/app_theme.dart';
import 'package:onezentra_mobile/features/auth/providers/auth_provider.dart';
import 'package:onezentra_mobile/shared/widgets/app_widgets.dart';

/// Home Page - the only landing after login.
///
/// Exactly four operational menus, nothing else: Check In Point, Validasi
/// SJ, Bongkar, and Hasil Penerimaan. Each card is hidden when the
/// role lacks its permission — same rule as the web sidebar.
class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> with WidgetsBindingObserver {
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    // Fresh login lands here: pull the latest profile + permissions so a
    // role edited on web applies without forcing logout + login.
    // (Background returns are covered by the app lifecycle observer.)
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) {
        return;
      }
      context.read<AuthProvider>().refreshUser();
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    super.didChangeAppLifecycleState(state);
    // When app returns to foreground, refresh user permissions.
    // During refresh, show loading state.
    if (state == AppLifecycleState.resumed && mounted) {
      setState(() => _isLoading = true);
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) {
          return;
        }
        context.read<AuthProvider>().refreshUser().then((_) {
          if (mounted) {
            setState(() => _isLoading = false);
          }
        });
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    var theme = Theme.of(context);
    var auth = context.watch<AuthProvider>();
    var user = auth.user;

    var menus = [
      const _HomeMenu(
        'Check In Point',
        'Scan PO / Nopol — catat Gate IN',
        Icons.door_front_door_rounded,
        AppTheme.primary700,
        ['gate.view'],
        '/gate',
      ),
      const _HomeMenu(
        'Validasi SJ',
        'Scan PO — validasi produk per item',
        Icons.verified_rounded,
        AppTheme.success,
        ['sj_validation.view'],
        '/validasi-sj',
      ),
      const _HomeMenu(
        'Bongkar',
        'Scan PO — bongkar dan pindai produk',
        Icons.forklift,
        AppTheme.accent500,
        ['receiving.view'],
        '/bongkar',
      ),
      const _HomeMenu(
        'Hasil Penerimaan',
        'Histori inbound yang sudah diterima',
        Icons.inventory_2_rounded,
        AppTheme.primary600,
        ['receiving.view'],
        '/hasil-penerimaan',
      ),
    ];

    var visible = menus
        .where(
          (menu) =>
              menu.permissions.isEmpty ||
              (user?.hasAnyPermission(menu.permissions) ?? false),
        )
        .toList();

    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        title: const Text('ONEZENTRA'),
        elevation: 0,
        automaticallyImplyLeading: false,
        actions: [
          IconButton(
            icon: const Icon(Icons.logout_rounded),
            tooltip: 'Logout',
            onPressed: () async {
              await context.read<AuthProvider>().logout();
              if (context.mounted) {
                context.go('/login');
              }
            },
          ),
        ],
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(AppTheme.space6),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 52,
                    height: 52,
                    decoration: const BoxDecoration(
                      color: AppTheme.primary100,
                      borderRadius: AppTheme.radiusXl,
                    ),
                    child: const Icon(
                      Icons.warehouse_rounded,
                      size: 26,
                      color: AppTheme.primary600,
                    ),
                  ),
                  const SizedBox(width: AppTheme.space4),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Halo,',
                          style: theme.textTheme.bodyMedium?.copyWith(
                            color: AppTheme.gray500,
                          ),
                        ),
                        Text(
                          user?.fullName ?? 'User',
                          style: theme.textTheme.headlineSmall?.copyWith(
                            fontWeight: FontWeight.w700,
                            color: AppTheme.foreground,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        if (user?.kodeDepo != null)
                          Text(
                            'Depo ${user!.kodeDepo!}',
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: AppTheme.gray500,
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: AppTheme.space6),
              Text(
                'Pilih pekerjaan',
                style: theme.textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w700,
                  color: AppTheme.foreground,
                ),
              ),
              const SizedBox(height: AppTheme.space4),
              if (_isLoading)
                const Center(child: CircularProgressIndicator())
              else if (visible.isEmpty)
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(AppTheme.space5),
                  decoration: BoxDecoration(
                    color: AppTheme.warningWell,
                    borderRadius: AppTheme.radiusXl,
                    border: Border.all(color: AppTheme.warningText),
                  ),
                  child: Text(
                    'Tidak ada menu untuk peran Anda. Hubungi admin.',
                    style: GoogleFonts.roboto(
                      fontSize: 13,
                      height: 1.4,
                      color: AppTheme.warningText,
                    ),
                  ),
                )
              else
                // Two columns on tablets / wide windows, one column on
                // phones — fixed counts would waste tablet space or crowd
                // small screens.
                LayoutBuilder(
                  builder: (context, constraints) {
                    if (constraints.maxWidth < 600) {
                      return Column(
                        children: [
                          for (var i = 0; i < visible.length; i++) ...[
                            _menuCard(
                              context,
                              theme,
                              visible[i],
                              number: i + 1,
                            ),
                            if (i != visible.length - 1)
                              const SizedBox(height: AppTheme.space4),
                          ],
                        ],
                      );
                    }
                    return GridView.builder(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      gridDelegate:
                          const SliverGridDelegateWithFixedCrossAxisCount(
                            crossAxisCount: 2,
                            crossAxisSpacing: AppTheme.space4,
                            mainAxisSpacing: AppTheme.space4,
                            childAspectRatio: 1.6,
                          ),
                      itemCount: visible.length,
                      itemBuilder: (context, index) => _menuCard(
                        context,
                        theme,
                        visible[index],
                        number: index + 1,
                      ),
                    );
                  },
                ),
              const SizedBox(height: AppTheme.space8),
            ],
          ),
        ),
      ),
    );
  }

  Widget _menuCard(
    BuildContext context,
    ThemeData theme,
    _HomeMenu menu, {
    required int number,
  }) => AppCard(
    padding: const EdgeInsets.all(AppTheme.space5),
    onTap: () => context.push(menu.route),
    child: Row(
      children: [
        Container(
          width: 56,
          height: 56,
          decoration: BoxDecoration(
            color: menu.color.withValues(alpha: 0.15),
            borderRadius: AppTheme.radiusXl,
          ),
          child: Icon(menu.icon, size: 28, color: menu.color),
        ),
        const SizedBox(width: AppTheme.space4),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                menu.title,
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w700,
                  color: AppTheme.foreground,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                menu.description,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: AppTheme.gray500,
                ),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),
        const SizedBox(width: AppTheme.space3),
        Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
            color: menu.color.withValues(alpha: 0.1),
            borderRadius: AppTheme.radiusFull,
          ),
          child: Icon(Icons.arrow_forward_rounded, size: 18, color: menu.color),
        ),
      ],
    ),
  );
}

class _HomeMenu {
  const _HomeMenu(
    this.title,
    this.description,
    this.icon,
    this.color,
    this.permissions,
    this.route,
  );
  final String title;
  final String description;
  final IconData icon;
  final Color color;
  final List<String> permissions;

  /// Pushed (not `go`) so the system back button returns here.
  final String route;
}
