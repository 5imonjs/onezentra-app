import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:onezentra_mobile/features/auth/models/auth_models.dart';
import 'package:onezentra_mobile/features/auth/providers/auth_provider.dart';
import 'package:onezentra_mobile/features/auth/repositories/auth_repository.dart';
import 'package:onezentra_mobile/main.dart';

class _FakeAuthRepository extends AuthRepository {
  _FakeAuthRepository(this.body);
  final Map<String, dynamic> body;

  @override
  Future<AuthResponse> login({
    required String email,
    required String password,
    String? deviceName,
  }) async => AuthResponse.fromJson(body);

  @override
  Future<User> getUser() async => User.fromJson({
    ...(body['user'] as Map<String, dynamic>),
    'permissions': body['permissions'],
  });

  @override
  Future<void> logout() async {}
}

Map<String, dynamic> _loginBody(List<String> permissions) => {
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

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    FlutterSecureStorage.setMockInitialValues({});
  });

  testWidgets('route tanpa permission dialihkan ke home', (tester) async {
    var auth = AuthProvider(
      repository: _FakeAuthRepository(_loginBody(['gate.view'])),
    );
    expect(await auth.login(email: 'op@onezentra.com', password: 'x'), isTrue);

    var router = buildRouter(auth);
    await tester.pumpWidget(OneZentraApp(authProvider: auth, router: router));
    await tester.pumpAndSettle();

    expect(find.text('Pilih pekerjaan'), findsOneWidget);

    router.go('/bongkar');
    await tester.pumpAndSettle();

    expect(find.text('Pilih pekerjaan'), findsOneWidget);
    expect(find.text('Scan Bongkar'), findsNothing);
  });
}
