import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:onezentra_mobile/core/theme/app_theme.dart';
import 'package:onezentra_mobile/features/auth/models/auth_models.dart';
import 'package:onezentra_mobile/features/auth/providers/auth_provider.dart';
import 'package:onezentra_mobile/features/auth/repositories/auth_repository.dart';
import 'package:onezentra_mobile/features/modules/pages/modules_page.dart';

/// Auth repository that answers a canned login payload so the page sees a
/// controlled permission list — mirroring what the API sends after a login
/// against the web's Roles & Permissions settings.
class _FakeAuthRepository extends AuthRepository {
  _FakeAuthRepository(this.permissions);

  final List<String> permissions;

  @override
  Future<AuthResponse> login({
    required String email,
    required String password,
    String? deviceName,
  }) async => AuthResponse.fromJson({
    'message': 'Login successful',
    'token': 'token-abc',
    'token_type': 'Bearer',
    'user': {
      'id': 7,
      'full_name': 'Operator',
      'email': 'operator@onezentra.com',
      'level': 'operator',
      'status': 'active',
      'roles': [],
    },
    'permissions': permissions,
  });
}

Future<AuthProvider> _loginAuth(List<String> permissions) async {
  var auth = AuthProvider(
    repository: _FakeAuthRepository(permissions),
  );
  var ok = await auth.login(email: 'operator@onezentra.com', password: 'x');
  expect(ok, isTrue);
  return auth;
}

Future<void> _pumpModules(WidgetTester tester, AuthProvider auth) async {
  await tester.pumpWidget(
    ChangeNotifierProvider<AuthProvider>.value(
      value: auth,
      child: MaterialApp(
        theme: AppTheme.light,
        home: const ModulesPage(),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    FlutterSecureStorage.setMockInitialValues({});
  });

  testWidgets('modul tanpa izin peran tidak ditampilkan', (tester) async {
    var auth = await _loginAuth(['gate.view']);

    await _pumpModules(tester, auth);

    expect(find.text('Check In Point'), findsOneWidget);
    expect(find.text('Penerimaan'), findsNothing);
    expect(find.text('Biaya THL'), findsNothing);
    expect(find.text('Biaya Retribusi'), findsNothing);
  });

  testWidgets('semua modul tampil saat peran punya izin lengkap', (
    tester,
  ) async {
    var auth = await _loginAuth([
      'gate.view',
      'penerimaan.view',
      'biaya_thl.view',
      'users.view',
    ]);

    await _pumpModules(tester, auth);

    expect(find.text('Check In Point'), findsOneWidget);
    expect(find.text('Penerimaan'), findsOneWidget);
    expect(find.text('Biaya THL'), findsOneWidget);
  });
}
