import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:go_router/go_router.dart';

import 'package:onezentra_mobile/core/theme/app_theme.dart';
import 'package:onezentra_mobile/core/network/api_client.dart';
import 'package:onezentra_mobile/features/auth/providers/auth_provider.dart';
import 'package:onezentra_mobile/features/auth/pages/login_page.dart';
import 'package:onezentra_mobile/shared/widgets/app_widgets.dart';

/// Main App Entry Point
void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Restore the session before the first frame so the router redirect never
  // flashes the login screen for a user who is still signed in.
  final authProvider = AuthProvider();
  await authProvider.init();

  final router = buildRouter();

  // A rejected / expired token must always end on the login screen instead of
  // a page that keeps failing every request.
  ApiClient().onUnauthorized = () {
    authProvider.handleSessionExpired();
    router.go('/login');
  };

  runApp(OneZentraApp(authProvider: authProvider, router: router));
}

/// OneZentra Mobile App
class OneZentraApp extends StatelessWidget {
  final AuthProvider authProvider;
  final GoRouter router;

  const OneZentraApp({
    super.key,
    required this.authProvider,
    required this.router,
  });

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider<AuthProvider>.value(
      value: authProvider,
      child: MaterialApp.router(
        title: 'ONEZENTRA Mobile',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.light,
        darkTheme: AppTheme.dark,
        themeMode: ThemeMode.system,
        routerConfig: router,
        builder: (context, child) {
          return MediaQuery(
            data: MediaQuery.of(context).copyWith(
              textScaler: TextScaler.linear(
                MediaQuery.of(context).textScaler.scale(1).clamp(0.85, 1.15),
              ),
            ),
            child: child!,
          );
        },
      ),
    );
  }
}

/// App Router Configuration
GoRouter buildRouter() {
  return GoRouter(
    initialLocation: '/login',
    routes: [
      GoRoute(
        path: '/login',
        name: 'login',
        builder: (context, state) => const LoginPage(),
      ),
      GoRoute(
        path: '/dashboard',
        name: 'dashboard',
        builder: (context, state) => const DashboardPage(),
      ),
    ],
    redirect: (context, state) {
      final authProvider = context.read<AuthProvider>();
      final isLoginPage = state.matchedLocation == '/login';
      final isAuthenticated = authProvider.isAuthenticated;

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
}

/// Placeholder Dashboard Page
class DashboardPage extends StatelessWidget {
  const DashboardPage({super.key});

  @override
  Widget build(BuildContext context) {
    final authProvider = context.watch<AuthProvider>();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Dashboard'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout_rounded),
            onPressed: () => _handleLogout(context, authProvider),
            tooltip: 'Logout',
          ),
        ],
      ),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(AppTheme.space6),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 100,
                height: 100,
                decoration: BoxDecoration(
                  color: AppTheme.primary100,
                  borderRadius: AppTheme.radiusFull,
                ),
                child: const Icon(
                  Icons.dashboard_rounded,
                  size: 50,
                  color: AppTheme.primary600,
                ),
              ),
              const SizedBox(height: AppTheme.space6),
              Text(
                'Selamat Datang!',
                style: Theme.of(
                  context,
                ).textTheme.displaySmall?.copyWith(fontWeight: FontWeight.w700),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: AppTheme.space3),
              Text(
                'Halo, ${authProvider.user?.fullName ?? 'User'}',
                style: Theme.of(
                  context,
                ).textTheme.bodyLarge?.copyWith(color: AppTheme.gray600),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: AppTheme.space2),
              AppBadge(
                text: authProvider.user?.roleDisplayName ?? 'User',
                variant: AppBadgeVariant.primary,
                icon: Icons.badge_rounded,
              ),
              const SizedBox(height: AppTheme.space8),
              AppPrimaryButton(
                text: 'Logout',
                onPressed: () => _handleLogout(context, authProvider),
                isFullWidth: false,
                leadingIcon: Icons.logout_rounded,
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// Logs out and navigates back to the login screen. Without the explicit
  /// navigation the router redirect is never re-evaluated, so the user would
  /// stay on a dashboard that is already signed out.
  Future<void> _handleLogout(
    BuildContext context,
    AuthProvider authProvider,
  ) async {
    await authProvider.logout();
    if (context.mounted) {
      context.go('/login');
    }
  }
}
