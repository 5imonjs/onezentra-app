import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:onezentra_mobile/app_root.dart';
import 'package:onezentra_mobile/core/api_client.dart';
import 'package:onezentra_mobile/features/auth/auth_provider.dart';
import 'package:onezentra_mobile/features/dashboard/dashboard_provider.dart';
import 'package:onezentra_mobile/features/gate/gate_provider.dart';
import 'package:onezentra_mobile/theme/app_theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await ApiClient.instance.init();
  runApp(const OnezentraApp());
}

class OnezentraApp extends StatelessWidget {
  const OnezentraApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        // GateProvider dibuat lebih dulu: saat sesi berakhir, data gate milik
        // user sebelumnya harus ikut dibersihkan.
        ChangeNotifierProvider(create: (_) => GateProvider()),
        // Beranda memakai provider global agar angka tidak di-request ulang
        // setiap kali operator berpindah tab.
        ChangeNotifierProvider(create: (_) => DashboardProvider()),
        ChangeNotifierProvider(
          create: (ctx) {
            final auth = AuthProvider();
            final gate = ctx.read<GateProvider>();
            final dashboard = ctx.read<DashboardProvider>();
            // 401 dari server / logout → satu callback membersihkan seluruh
            // state sensitif sekaligus, lalu AppRoot memunculkan login.
            ApiClient.instance.onSessionEnded = () {
              auth.clearSession();
              gate.reset();
              dashboard.reset();
            };
            return auth;
          },
        ),
      ],
      child: MaterialApp(
        title: 'ONEZENTRA',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.light(),
        home: const AppRoot(),
      ),
    );
  }
}
