import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:go_router/go_router.dart';

import 'package:onezentra_mobile/core/theme/app_theme.dart';
import 'package:onezentra_mobile/core/network/api_client.dart';
import 'package:onezentra_mobile/features/auth/providers/auth_provider.dart';
import 'package:onezentra_mobile/features/auth/pages/login_page.dart';
import 'package:onezentra_mobile/features/gate/pages/gate_history_page.dart';
import 'package:onezentra_mobile/features/gate/pages/gate_page.dart';
import 'package:onezentra_mobile/features/gate/repositories/gate_repository.dart';
import 'package:onezentra_mobile/features/home/pages/home_page.dart';
import 'package:onezentra_mobile/features/inbound/pages/inbound_page.dart';
import 'package:onezentra_mobile/features/inbound/repositories/inbound_repository.dart';
import 'package:onezentra_mobile/features/unload/pages/unload_page.dart';
import 'package:onezentra_mobile/features/unload/repositories/unload_repository.dart';
import 'package:onezentra_mobile/features/validation/pages/validation_page.dart';
import 'package:onezentra_mobile/features/validation/repositories/validation_repository.dart';

/// Main App Entry Point
void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Handheld warehouse app: portrait only. Landscape would stretch the
  // single-column operational layouts and shrink the camera scan window.
  await SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);

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
class OneZentraApp extends StatefulWidget {
  const OneZentraApp({
    required this.authProvider,
    required this.router,
    super.key,
  });
  final AuthProvider authProvider;
  final GoRouter router;

  @override
  State<OneZentraApp> createState() => _OneZentraAppState();
}

class _OneZentraAppState extends State<OneZentraApp>
    with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Roles & permissions are edited on web. The app caches them at login,
    // so re-fetch on every foregrounding — otherwise a web change only
    // takes effect after logout + login. Failures are swallowed inside
    // [AuthProvider.refreshUser] (offline return keeps the old session).
    if (state == AppLifecycleState.resumed) {
      widget.authProvider.refreshUser();
    }
  }

  @override
  Widget build(BuildContext context) =>
      ChangeNotifierProvider<AuthProvider>.value(
        value: widget.authProvider,
        child: MaterialApp.router(
          title: 'ONEZENTRA Mobile',
          debugShowCheckedModeBanner: false,
          theme: AppTheme.light,
          darkTheme: AppTheme.dark,
          // Pinned to the dark aurora theme. The app is a dark-first design
          // matching the web console; leaving this on the default
          // ThemeMode.system made the OS preference swap themes while pages
          // kept painting hardcoded dark colours. ThemeMode.light is never
          // correct here — the login card and every Material surface would
          // go light while the pages stay dark (guarded by theme_guard_test).
          themeMode: ThemeMode.dark,
          routerConfig: widget.router,
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

/// App Router Configuration — four operational menus, nothing else.
///
/// Detail pages are pushed (not `go`) from the home menu so the system back
/// button returns to the menu list.
///
/// Repositories are injectable so tests can render screens without a server.
GoRouter buildRouter(
  AuthProvider authProvider, {
  GateRepository? gateRepository,
  ValidationRepository? validationRepository,
  InboundRepository? inboundRepository,
  UnloadRepository? unloadRepository,
}) => GoRouter(
  initialLocation: '/login',
  routes: [
    GoRoute(
      path: '/login',
      name: 'login',
      builder: (context, state) => const LoginPage(),
    ),
    GoRoute(
      path: '/home',
      name: 'home',
      builder: (context, state) => const HomePage(),
    ),
    GoRoute(
      path: '/gate',
      name: 'gate',
      builder: (context, state) => GatePage(repository: gateRepository),
    ),
    GoRoute(
      path: '/gate/riwayat',
      name: 'gate_riwayat',
      builder: (context, state) => GateHistoryPage(repository: gateRepository),
    ),
    GoRoute(
      path: '/validasi-sj',
      name: 'validasi_sj',
      builder: (context, state) => ValidationPage(
        repository: validationRepository,
        initialScanCode: state.extra as String?,
      ),
    ),
    GoRoute(
      path: '/hasil-penerimaan',
      name: 'hasil_penerimaan',
      builder: (context, state) => InboundPage(repository: inboundRepository),
    ),
    GoRoute(
      path: '/bongkar',
      name: 'bongkar',
      builder: (context, state) => UnloadPage(repository: unloadRepository),
    ),
  ],
  redirect: (context, state) {
    var isLoginPage = state.matchedLocation == '/login';
    var isAuthenticated = authProvider.isAuthenticated;

    // If not authenticated and not on login page, redirect to login
    if (!isAuthenticated && !isLoginPage) {
      return '/login';
    }

    // If authenticated and on login page, redirect to home
    if (isAuthenticated && isLoginPage) {
      return '/home';
    }

    return null;
  },
);
