import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:onezentra_mobile/core/api_client.dart';
import 'package:onezentra_mobile/features/auth/auth_provider.dart';
import 'package:onezentra_mobile/features/auth/login_screen.dart';
import 'package:onezentra_mobile/features/dashboard/dashboard_screen.dart';
import 'package:onezentra_mobile/theme/app_colors.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await ApiClient.instance.init();
  runApp(const OnezentraApp());
}

class OnezentraApp extends StatelessWidget {
  const OnezentraApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) {
        final auth = AuthProvider();
        ApiClient.instance.onUnauthorized = auth.handleUnauthorized;
        return auth;
      },
      child: MaterialApp(
        title: 'ONEZENTRA',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          useMaterial3: true,
          colorScheme: ColorScheme.fromSeed(seedColor: AppColors.primary600),
          scaffoldBackgroundColor: AppColors.surface,
          fontFamily: 'Roboto',
        ),
        initialRoute: '/',
        routes: {
          '/': (_) => const LoginScreen(),
          '/dashboard': (_) => const DashboardScreen(),
        },
      ),
    );
  }
}
