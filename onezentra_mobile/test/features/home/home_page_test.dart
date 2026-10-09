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

/// Auth repository that answers a canned login payload, so the widget tests
/// get a logged-in user with a controlled permission list.
class _FakeAuthRepository extends AuthRepository {
  _FakeAuthRepository(this.body);
  final Map<String, dynamic> body;

  @override
  Future<AuthResponse> login({
    required String email,
    required String password,
    String? deviceName,
  }) async => AuthResponse.fromJson(body);
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
}) async {
  var auth = AuthProvider(
    repository: _FakeAuthRepository(_loginBody(permissions: permissions)),
  );
  var ok = await auth.login(email: 'op@onezentra.com', password: 'x');
  expect(ok, isTrue);
  return auth;
}

Future<void> _pumpHomePage(WidgetTester tester, AuthProvider auth) async {
  await tester.pumpWidget(
    ChangeNotifierProvider<AuthProvider>.value(
      value: auth,
      child: MaterialApp(theme: AppTheme.light, home: const HomePage()),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    FlutterSecureStorage.setMockInitialValues({});
  });

  testWidgets('menampilkan keempat menu operasional', (tester) async {
    var auth = await _loginAuth();

    await _pumpHomePage(tester, auth);

    expect(find.text('Halo,'), findsOneWidget);
    expect(find.text('Operator'), findsOneWidget);
    expect(find.text('Check In Point'), findsOneWidget);
    expect(find.text('Validasi SJ'), findsOneWidget);
    expect(find.text('Bongkar'), findsOneWidget);
    expect(find.text('Hasil Penerimaan'), findsOneWidget);
    expect(find.text('Check Out Point'), findsNothing);
    // No bottom nav, no dashboard numbers, no "coming soon".
    expect(find.byType(BottomNavigationBar), findsNothing);
    expect(find.text('Ringkasan'), findsNothing);
  });

  testWidgets('menu disembunyikan tanpa permission', (tester) async {
    var auth = await _loginAuth(permissions: ['gate.view']);

    await _pumpHomePage(tester, auth);

    expect(find.text('Check In Point'), findsOneWidget);
    expect(find.text('Check Out Point'), findsNothing);
    expect(find.text('Validasi SJ'), findsNothing);
    // Check Out sudah tidak ada di home page; Bongkar butuh receiving.view.
    expect(find.text('Bongkar'), findsNothing);
    expect(find.text('Hasil Penerimaan'), findsNothing);
  });

  testWidgets('tanpa permission apa pun hanya pesan hubungi admin', (
    tester,
  ) async {
    var auth = await _loginAuth(permissions: []);

    await _pumpHomePage(tester, auth);

    expect(find.text('Check In Point'), findsNothing);
    expect(
      find.text('Tidak ada menu untuk peran Anda. Hubungi admin.'),
      findsOneWidget,
    );
  });

  testWidgets('layar HP: menu satu kolom; layar lebar: grid dua kolom', (
    tester,
  ) async {
    var auth = await _loginAuth();

    // Phone width → single column, no grid.
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await _pumpHomePage(tester, auth);
    expect(find.text('Check In Point'), findsOneWidget);
    expect(find.byType(GridView), findsNothing);

    // Tablet width → two-column grid with the same four menus.
    tester.view.physicalSize = const Size(1200, 800);
    await _pumpHomePage(tester, auth);
    expect(find.byType(GridView), findsOneWidget);
    expect(find.text('Check In Point'), findsOneWidget);
    expect(find.text('Validasi SJ'), findsOneWidget);
    expect(find.text('Bongkar'), findsOneWidget);
    expect(find.text('Hasil Penerimaan'), findsOneWidget);
    expect(find.text('Check Out Point'), findsNothing);
  });
}
