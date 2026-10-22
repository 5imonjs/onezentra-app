import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:onezentra_mobile/core/theme/app_theme.dart';
import 'package:onezentra_mobile/features/auth/models/auth_models.dart';
import 'package:onezentra_mobile/features/auth/providers/auth_provider.dart';
import 'package:onezentra_mobile/features/auth/repositories/auth_repository.dart';
import 'package:onezentra_mobile/features/home/pages/home_page.dart';
import 'package:onezentra_mobile/shared/widgets/app_widgets.dart';

/// Auth repository that answers a canned login payload, so the widget tests
/// get a logged-in user with a controlled permission list.
class _FakeAuthRepository extends AuthRepository {
  _FakeAuthRepository(this.body, {this.failRefresh = false});
  final Map<String, dynamic> body;
  final bool failRefresh;
  int getUserCalls = 0;

  @override
  Future<AuthResponse> login({
    required String email,
    required String password,
    String? deviceName,
  }) async => AuthResponse.fromJson(body);

  @override
  Future<User> getUser() async {
    getUserCalls++;
    if (failRefresh) {
      throw Exception('offline');
    }
    return User.fromJson({
      ...(body['user'] as Map<String, dynamic>),
      'permissions': body['permissions'],
    });
  }

  @override
  Future<void> logout() async {}
}

const List<String> _allMenuPermissions = [
  'gate.view',
  'sj_validation.view',
  'receiving.view',
];

Map<String, dynamic> _loginBody({
  List<String> permissions = _allMenuPermissions,
}) => {
  'message': 'Login successful',
  'token': 'token-abc',
  'token_type': 'Bearer',
  'expires_at': '2030-01-01T00:00:00.000Z',
  'user': {
    'id': 7,
    'full_name': 'Operator',
    'email': 'op@onezentra.com',
    'level': 'operator',
    'status': 'active',
    'kode_depo': 'DP01',
    'created_at': '2026-01-01T00:00:00.000Z',
    'updated_at': '2026-01-01T00:00:00.000Z',
    'roles': [],
  },
  'permissions': permissions,
};

Future<AuthProvider> _loginAuth({
  List<String> permissions = _allMenuPermissions,
  bool failRefresh = false,
}) async {
  var auth = AuthProvider(
    repository: _FakeAuthRepository(
      _loginBody(permissions: permissions),
      failRefresh: failRefresh,
    ),
  );
  var ok = await auth.login(email: 'op@onezentra.com', password: 'x');
  expect(ok, isTrue);
  return auth;
}

Future<void> _pumpHomePage(WidgetTester tester, AuthProvider auth) async {
  await tester.pumpWidget(
    ChangeNotifierProvider<AuthProvider>.value(
      value: auth,
      child: MaterialApp(theme: AppTheme.dark, home: const HomePage()),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    FlutterSecureStorage.setMockInitialValues({});
  });

  testWidgets('menampilkan lima menu operasional', (tester) async {
    var auth = await _loginAuth();

    await _pumpHomePage(tester, auth);

    expect(find.text('Halo,'), findsOneWidget);
    expect(find.text('Operator'), findsOneWidget);
    expect(find.text('Check In Point'), findsOneWidget);
    expect(find.text('Riwayat Gate'), findsOneWidget);
    expect(find.text('Cari & telusuri transaksi gate'), findsOneWidget);
    expect(find.text('Validasi SJ'), findsOneWidget);
    expect(find.text('Bongkar'), findsOneWidget);
    expect(find.text('Hasil Penerimaan'), findsOneWidget);
    expect(
      find.text('Riwayat penerimaan barang yang sudah selesai'),
      findsOneWidget,
    );
    expect(find.text('Check Out Point'), findsNothing);
    // No bottom nav, no dashboard numbers, no "coming soon".
    expect(find.byType(BottomNavigationBar), findsNothing);
    expect(find.text('Ringkasan'), findsNothing);
  });

  testWidgets('hierarki tipografi membedakan nama, bagian, dan kartu', (
    tester,
  ) async {
    var auth = await _loginAuth();

    await _pumpHomePage(tester, auth);

    expect(tester.widget<Text>(find.text('Operator')).style?.fontSize, 20);
    expect(
      tester.widget<Text>(find.text('Pilih pekerjaan')).style?.fontSize,
      16,
    );
    expect(
      tester.widget<Text>(find.text('Check In Point')).style?.fontSize,
      15,
    );
    expect(
      tester
          .widget<Text>(find.text('Scan PO / Nopol — catat Gate IN'))
          .style
          ?.fontSize,
      13,
    );
  });

  testWidgets('menu disembunyikan tanpa permission', (tester) async {
    var auth = await _loginAuth(permissions: ['gate.view']);

    await _pumpHomePage(tester, auth);

    expect(find.text('Check In Point'), findsOneWidget);
    expect(find.text('Riwayat Gate'), findsOneWidget);
    expect(find.text('Check Out Point'), findsNothing);
    expect(find.text('Validasi SJ'), findsNothing);
    // Check Out sudah tidak ada di home page; Bongkar butuh receiving.view.
    expect(find.text('Bongkar'), findsNothing);
    expect(find.text('Hasil Penerimaan'), findsNothing);
  });

  testWidgets('tanpa permission apa pun hanya pesan hubungi admin', (
    tester,
  ) async {
    var repo = _FakeAuthRepository(_loginBody(permissions: []));
    var auth = AuthProvider(repository: repo);
    expect(await auth.login(email: 'op@onezentra.com', password: 'x'), isTrue);

    await _pumpHomePage(tester, auth);

    expect(find.text('Check In Point'), findsNothing);
    expect(
      find.text('Tidak ada menu untuk peran Anda. Hubungi admin.'),
      findsOneWidget,
    );
    expect(find.text('Muat ulang'), findsOneWidget);
    expect(repo.getUserCalls, 1);

    await tester.tap(find.text('Muat ulang'));
    await tester.pumpAndSettle();

    expect(repo.getUserCalls, 2);
    expect(
      find.text('Tidak ada menu untuk peran Anda. Hubungi admin.'),
      findsOneWidget,
    );
  });

  testWidgets('layout adaptif: satu kolom di HP, kartu ringkas di tablet', (
    tester,
  ) async {
    var auth = await _loginAuth();

    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await _pumpHomePage(tester, auth);

    var phoneCards = find.byType(AppCard);
    expect(phoneCards, findsNWidgets(5));
    var phoneFirst = tester.getRect(phoneCards.at(0));
    var phoneSecond = tester.getRect(phoneCards.at(1));
    expect(phoneFirst.left, closeTo(phoneSecond.left, 0.1));
    expect(phoneSecond.top, greaterThan(phoneFirst.bottom));
    expect(phoneFirst.height, lessThan(200));

    tester.view.physicalSize = const Size(1200, 800);
    await _pumpHomePage(tester, auth);

    var wideCards = find.byType(AppCard);
    expect(wideCards, findsNWidgets(5));
    var rects = [for (var i = 0; i < 5; i++) tester.getRect(wideCards.at(i))];
    expect(rects[0].top, closeTo(rects[1].top, 0.1));
    expect(rects[0].top, closeTo(rects[2].top, 0.1));
    expect(rects[3].top, greaterThan(rects[0].bottom));
    expect(rects[4].top, greaterThan(rects[0].bottom));
    for (var rect in rects) {
      expect(rect.height, lessThan(200));
    }
  });

  testWidgets('text scale 2x tidak overflow pada grid', (tester) async {
    var auth = await _loginAuth();

    tester.view.physicalSize = const Size(1200, 800);
    tester.view.devicePixelRatio = 1;
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(tester.view.reset);
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);

    await _pumpHomePage(tester, auth);

    expect(tester.takeException(), isNull);
    expect(find.byType(AppCard), findsNWidgets(5));
  });

  testWidgets('banner retry tampil saat refresh izin gagal', (tester) async {
    var auth = await _loginAuth(failRefresh: true);

    await _pumpHomePage(tester, auth);

    expect(
      find.text('Gagal memperbarui izin. Data lama ditampilkan.'),
      findsOneWidget,
    );
    expect(find.text('Coba lagi'), findsOneWidget);
  });

  testWidgets(
    'refresh gagal tanpa data izin berhenti memuat dan menawarkan retry',
    (tester) async {
      var body = _loginBody(permissions: []);
      body['permissions'] = null;
      var repo = _FakeAuthRepository(body, failRefresh: true);
      var auth = AuthProvider(repository: repo);
      expect(
        await auth.login(email: 'op@onezentra.com', password: 'x'),
        isTrue,
      );

      await _pumpHomePage(tester, auth);

      expect(find.text('Memuat izin...'), findsNothing);
      expect(
        find.text('Izin belum dapat dimuat. Periksa koneksi lalu coba lagi.'),
        findsOneWidget,
      );
      expect(find.text('Muat ulang'), findsOneWidget);
      expect(
        find.text('Gagal memperbarui izin. Data lama ditampilkan.'),
        findsNothing,
      );
    },
  );

  testWidgets('logout meminta konfirmasi', (tester) async {
    var auth = await _loginAuth();

    await _pumpHomePage(tester, auth);
    await tester.tap(find.byTooltip('Keluar'));
    await tester.pumpAndSettle();

    expect(find.text('Keluar dari akun?'), findsOneWidget);
    expect(find.text('Batal'), findsOneWidget);

    await tester.tap(find.text('Batal'));
    await tester.pumpAndSettle();

    expect(find.text('Keluar dari akun?'), findsNothing);
    expect(auth.isAuthenticated, isTrue);
  });

  testWidgets('HomePage tidak menduplikasi refresh saat resume', (
    tester,
  ) async {
    var repo = _FakeAuthRepository(_loginBody());
    var auth = AuthProvider(repository: repo);
    expect(await auth.login(email: 'op@onezentra.com', password: 'x'), isTrue);

    await _pumpHomePage(tester, auth);
    expect(repo.getUserCalls, 1);

    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pump();

    expect(repo.getUserCalls, 1);
  });
}
