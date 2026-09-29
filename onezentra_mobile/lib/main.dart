import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:go_router/go_router.dart';

import 'package:onezentra_mobile/core/theme/app_theme.dart';
import 'package:onezentra_mobile/core/network/api_client.dart';
import 'package:onezentra_mobile/core/shell/main_shell.dart';
import 'package:onezentra_mobile/features/auth/providers/auth_provider.dart';
import 'package:onezentra_mobile/features/auth/pages/login_page.dart';
import 'package:onezentra_mobile/features/dashboard/pages/dashboard_page.dart';
import 'package:onezentra_mobile/features/gate/pages/gate_page.dart';
import 'package:onezentra_mobile/features/gate/repositories/gate_repository.dart';
import 'package:onezentra_mobile/features/modules/pages/modules_page.dart';
import 'package:onezentra_mobile/features/common/pages/placeholder_page.dart';

/// Main App Entry Point
void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Restore the session before the first frame
  var authProvider = AuthProvider();
  await authProvider.init();

  var router = buildRouter(authProvider);

  // Handle unauthorized responses
  ApiClient().onUnauthorized = () {
    authProvider.handleSessionExpired();
    router.go('/login');
  };

  runApp(OneZentraApp(authProvider: authProvider, router: router));
}

/// OneZentra Mobile App
class OneZentraApp extends StatelessWidget {

  const OneZentraApp({
    required this.authProvider, required this.router, super.key,
  });
  final AuthProvider authProvider;
  final GoRouter router;

  @override
  Widget build(BuildContext context) => ChangeNotifierProvider<AuthProvider>.value(
      value: authProvider,
      child: MaterialApp.router(
        title: 'ONEZENTRA Mobile',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.light,
        darkTheme: AppTheme.dark,
        routerConfig: router,
        builder: (context, child) => MediaQuery(
            data: MediaQuery.of(context).copyWith(
              textScaler: TextScaler.linear(
                MediaQuery.of(context).textScaler.scale(1).clamp(0.85, 1.15),
              ),
            ),
            child: child!,
          ),
      ),
    );
}

/// App Router Configuration
///
/// [gateRepository] is injectable so tests can render the Check In Point
/// screen without a server.
GoRouter buildRouter(AuthProvider authProvider, {GateRepository? gateRepository}) => GoRouter(
    initialLocation: '/login',
    routes: [
      // Login Page (no auth required)
      GoRoute(
        path: '/login',
        name: 'login',
        builder: (context, state) => const LoginPage(),
      ),

      // Main Shell with Bottom Nav + Drawer (requires auth)
      ShellRoute(
        builder: (context, state, child) => MainShell(child: child),
        routes: [
          GoRoute(
            path: '/dashboard',
            name: 'dashboard',
            builder: (context, state) => const DashboardPage(),
          ),
          GoRoute(
            path: '/modules',
            name: 'modules',
            builder: (context, state) => const ModulesPage(),
          ),
          GoRoute(
            path: '/penerimaan',
            name: 'penerimaan',
            builder: (context, state) => const PlaceholderPage(
              title: 'Penerimaan',
              icon: Icons.inventory_2_rounded,
            ),
          ),
          GoRoute(
            path: '/rencana-kirim',
            name: 'rencana_kirim',
            builder: (context, state) => const PlaceholderPage(
              title: 'Rencana Kirim',
              icon: Icons.schedule_rounded,
            ),
          ),
          GoRoute(
            path: '/validasi-sj',
            name: 'validasi_sj',
            builder: (context, state) => const PlaceholderPage(
              title: 'Validasi SJ',
              icon: Icons.verified_rounded,
            ),
          ),
          GoRoute(
            path: '/gate',
            name: 'gate',
            builder: (context, state) => GatePage(repository: gateRepository),
          ),
          GoRoute(
            path: '/opname-expired',
            name: 'opname_expired',
            builder: (context, state) => const PlaceholderPage(
              title: 'Opname Expired',
              icon: Icons.fact_check_rounded,
            ),
          ),
          GoRoute(
            path: '/biaya-thl',
            name: 'biaya_thl',
            builder: (context, state) => const PlaceholderPage(
              title: 'Biaya THL',
              icon: Icons.receipt_long_rounded,
            ),
          ),
          GoRoute(
            path: '/biaya-retribusi',
            name: 'biaya_retribusi',
            builder: (context, state) => const PlaceholderPage(
              title: 'Biaya Retribusi',
              icon: Icons.money_rounded,
            ),
          ),
          GoRoute(
            path: '/approval-settings',
            name: 'approval_settings',
            builder: (context, state) => const PlaceholderPage(
              title: 'Approval Settings',
              icon: Icons.approval_rounded,
            ),
          ),
          GoRoute(
            path: '/npn',
            name: 'npn',
            builder: (context, state) => const PlaceholderPage(
              title: 'NPN',
              icon: Icons.settings_rounded,
            ),
          ),
          GoRoute(
            path: '/standar-umur',
            name: 'standar_umur',
            builder: (context, state) => const PlaceholderPage(
              title: 'Standar Umur Produk',
              icon: Icons.calendar_today_rounded,
            ),
          ),
          GoRoute(
            path: '/standarisasi',
            name: 'standarisasi',
            builder: (context, state) => const PlaceholderPage(
              title: 'Standarisasi Tumpukan',
              icon: Icons.layers_rounded,
            ),
          ),
          GoRoute(
            path: '/docks',
            name: 'docks',
            builder: (context, state) => const PlaceholderPage(
              title: 'Dock Management',
              icon: Icons.dock_rounded,
            ),
          ),
          GoRoute(
            path: '/tarif-retribusi',
            name: 'tarif_retribusi',
            builder: (context, state) => const PlaceholderPage(
              title: 'Tarif Retribusi',
              icon: Icons.attach_money_rounded,
            ),
          ),
          GoRoute(
            path: '/reports/penerimaan',
            name: 'reports_penerimaan',
            builder: (context, state) => const PlaceholderPage(
              title: 'Laporan Penerimaan',
              icon: Icons.inventory_rounded,
            ),
          ),
          GoRoute(
            path: '/reports/rencana-kirim',
            name: 'reports_rencana_kirim',
            builder: (context, state) => const PlaceholderPage(
              title: 'Laporan Pengiriman',
              icon: Icons.local_shipping_rounded,
            ),
          ),
          GoRoute(
            path: '/reports/biaya-thl',
            name: 'reports_biaya_thl',
            builder: (context, state) => const PlaceholderPage(
              title: 'Laporan Biaya THL',
              icon: Icons.receipt_rounded,
            ),
          ),
          GoRoute(
            path: '/reports/biaya-retribusi',
            name: 'reports_biaya_retribusi',
            builder: (context, state) => const PlaceholderPage(
              title: 'Laporan Retribusi',
              icon: Icons.money_off_rounded,
            ),
          ),
          GoRoute(
            path: '/reports/selisih-qty',
            name: 'reports_selisih_qty',
            builder: (context, state) => const PlaceholderPage(
              title: 'Selisih Qty',
              icon: Icons.compare_rounded,
            ),
          ),
          GoRoute(
            path: '/users',
            name: 'users',
            builder: (context, state) => const PlaceholderPage(
              title: 'Users',
              icon: Icons.people_rounded,
            ),
          ),
          GoRoute(
            path: '/roles',
            name: 'roles',
            builder: (context, state) => const PlaceholderPage(
              title: 'Roles & Permissions',
              icon: Icons.security_rounded,
            ),
          ),
          GoRoute(
            path: '/email-settings',
            name: 'email_settings',
            builder: (context, state) => const PlaceholderPage(
              title: 'Email Settings',
              icon: Icons.email_rounded,
            ),
          ),
          GoRoute(
            path: '/profile',
            name: 'profile',
            builder: (context, state) => const PlaceholderPage(
              title: 'Profil Saya',
              icon: Icons.person_rounded,
            ),
          ),
        ],
      ),
    ],
    redirect: (context, state) {
      var isLoginPage = state.matchedLocation == '/login';
      var isAuthenticated = authProvider.isAuthenticated;

      // If not authenticated and not on login page, redirect to login
      if (!isAuthenticated && !isLoginPage) {
        return '/login';
      }

      // If authenticated and on login page, redirect to dashboard
      if (isAuthenticated && isLoginPage) {
        return '/dashboard';
      }

      return null;
    },
  );