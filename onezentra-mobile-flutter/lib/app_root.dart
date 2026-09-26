import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:onezentra_mobile/features/auth/auth_provider.dart';
import 'package:onezentra_mobile/features/auth/login_screen.dart';
import 'package:onezentra_mobile/features/dashboard/home_shell.dart';
import 'package:onezentra_mobile/theme/app_colors.dart';

/// Root aplikasi: satu-satunya tempat pemulihan sesi dijalankan.
///
/// Alih-alih menavigasi ke /login dari tiap layar (yang menyisakan spinner
/// tak selesai saat 401), status sesi di sini yang menentukan layar mana yang
/// tampil. Sesi yang berakhir otomatis memunculkan LoginScreen kembali.
class AppRoot extends StatefulWidget {
  const AppRoot({super.key});

  @override
  State<AppRoot> createState() => _AppRootState();
}

class _AppRootState extends State<AppRoot> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      context.read<AuthProvider>().restore();
    });
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    if (auth.isRestoring) {
      return const SplashScreen();
    }
    if (!auth.isAuthenticated) {
      return const LoginScreen();
    }
    return const HomeShell();
  }
}

class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      backgroundColor: AppColors.gray900,
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(
              width: 44,
              height: 44,
              child: CircularProgressIndicator(
                color: AppColors.primary300,
                strokeWidth: 3,
              ),
            ),
            SizedBox(height: 16),
            Text(
              'Memuat sesi...',
              style: TextStyle(color: AppColors.primary200, fontSize: 14),
            ),
          ],
        ),
      ),
    );
  }
}
