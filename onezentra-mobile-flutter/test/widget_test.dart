import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:onezentra_mobile/app_root.dart';
import 'package:onezentra_mobile/features/auth/auth_provider.dart';
import 'package:onezentra_mobile/features/dashboard/dashboard_provider.dart';
import 'package:onezentra_mobile/features/dashboard/home_shell.dart';
import 'package:onezentra_mobile/features/gate/gate_provider.dart';
import 'package:onezentra_mobile/features/gate/models/gate_models.dart';
import 'package:onezentra_mobile/main.dart';

import 'support/test_harness.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(installSecureStorageMock);

  setUp(() => resetApiClient());

  Widget wrapAppRoot(AuthProvider auth) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider<AuthProvider>.value(value: auth),
        ChangeNotifierProvider(create: (_) => GateProvider(FakeGateService())),
        ChangeNotifierProvider(
          create: (_) => DashboardProvider(FakeDashboardService()),
        ),
      ],
      child: const MaterialApp(home: AppRoot()),
    );
  }

  testWidgets('App menampilkan layar login saat belum ada sesi', (
    tester,
  ) async {
    await tester.pumpWidget(const OnezentraApp());
    await tester.pumpAndSettle();

    expect(find.text('Halo, Selamat Datang Kembali'), findsOneWidget);
    expect(find.text('Masuk ke Dashboard'), findsOneWidget);
  });

  group('AppRoot', () {
    testWidgets('sesi dipulihkan otomatis lalu masuk ke shell', (tester) async {
      await resetApiClient(token: 'token-lama');
      final auth = AuthProvider(FakeAuthService());

      await tester.pumpWidget(wrapAppRoot(auth));
      expect(find.byType(SplashScreen), findsOneWidget);

      await tester.pumpAndSettle();

      expect(find.byType(HomeShell), findsOneWidget);
      // Hero Beranda menyapa per jam + nama depan, jadi yang dicek nama depan.
      expect(find.textContaining('Gate'), findsWidgets);
      expect(find.text('Halo, Selamat Datang Kembali'), findsNothing);
    });

    testWidgets('user tanpa token tidak dipercaya — kembali ke login', (
      tester,
    ) async {
      // Regresi: dulu tiap layar memanggil restore() sendiri sehingga user
      // yang baru saja dibuat langsung terhapus oleh restore berikutnya.
      final auth = AuthProvider(FakeAuthService());
      auth.user = testUser;
      auth.permissions = ['gate.view'];
      auth.isRestoring = false;

      await tester.pumpWidget(wrapAppRoot(auth));
      await tester.pumpAndSettle();

      expect(auth.isAuthenticated, isFalse);
      expect(find.text('Halo, Selamat Datang Kembali'), findsOneWidget);
    });

    testWidgets('gagal karena jaringan → banner retry, token tetap', (
      tester,
    ) async {
      await resetApiClient(token: 'token-masih-valid');
      final auth = AuthProvider(FakeAuthService()..meError = networkError());

      await tester.pumpWidget(wrapAppRoot(auth));
      await tester.pumpAndSettle();

      expect(find.textContaining('Tidak dapat terhubung'), findsOneWidget);
      expect(find.text('Coba lagi'), findsOneWidget);
      expect(find.text('Halo, Selamat Datang Kembali'), findsOneWidget);
    });

    testWidgets('sesi berakhir → login muncul lagi', (tester) async {
      await resetApiClient(token: 'token-lama');
      final auth = AuthProvider(FakeAuthService());
      await tester.pumpWidget(wrapAppRoot(auth));
      await tester.pumpAndSettle();
      expect(find.byType(HomeShell), findsOneWidget);

      // Meniru 401 dari server: ApiClient membuang token lalu memberi tahu app.
      await resetApiClient(token: 'token-lama');
      auth.clearSession();
      await tester.pumpAndSettle();

      expect(find.text('Halo, Selamat Datang Kembali'), findsOneWidget);
      expect(find.byType(HomeShell), findsNothing);
    });
  });

  group('gate models', () {
    test('RencanaKirimSummary parsing + label status', () {
      final rk = RencanaKirimSummary.fromJson({
        'id': 7,
        'po_transporter': 'PO-1',
        'nopol': 'KB 1234 AB',
        'driver_name': 'Budi',
        'status': 'SCHEDULED',
      });
      expect(rk.id, 7);
      expect(rk.poTransporter, 'PO-1');
      expect(gateStatusLabel('SCHEDULED'), 'Dijadwalkan');
      expect(gateStatusLabel('CHECKED_IN'), 'Check In');
    });

    test('GateStats parsing + guide status tanpa aksi', () {
      final stats = GateStats.fromJson({
        'hari_ini': 2,
        'terjadwal': 3,
        'selesai': 1,
        'total': 6,
      });
      expect(stats.hariIni, 2);
      expect(stats.total, 6);
      expect(gateStatusGuide('VERIFIED'), isNotNull);
      expect(gateStatusGuide('SCHEDULED'), isNull);
    });

    test('GateTransactionItem parsing relasi rencana_kirim', () {
      final item = GateTransactionItem.fromJson({
        'id': 9,
        'gate_type': 'INBOUND',
        'po_transporter': 'PO-9',
        'nopol': 'KB 9',
        'driver_name': 'Ani',
        'scan_time': '2026-09-25T10:00:00Z',
        'rencana_kirim': {'status': 'CHECKED_IN'},
      });
      expect(item.gateType, 'INBOUND');
      expect(item.rkStatus, 'CHECKED_IN');
    });
  });
}
