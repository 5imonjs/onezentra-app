import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:onezentra_mobile/features/auth/models/auth_models.dart';
import 'package:onezentra_mobile/features/auth/providers/auth_provider.dart';
import 'package:onezentra_mobile/features/auth/repositories/auth_repository.dart';

/// Repository whose profile answer can change between calls, simulating a
/// role edited on web after the mobile login.
class _ChangingAuthRepository extends AuthRepository {
  _ChangingAuthRepository({
    required this.loginUser,
    required this.refreshedUser,
  });

  final User loginUser;
  final User refreshedUser;

  @override
  Future<AuthResponse> login({
    required String email,
    required String password,
    String? deviceName,
  }) async =>
      AuthResponse(message: 'Login successful', token: 't', user: loginUser);

  @override
  Future<User> getUser() async => refreshedUser;
}

User _userWith(List<String> permissions) => User.fromJson({
  'id': 7,
  'full_name': 'Cheker',
  'email': 'cheker@onezentra.com',
  'level': 'cheker',
  'status': 'active',
  'roles': [],
  'permissions': permissions,
});

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    FlutterSecureStorage.setMockInitialValues({});
  });

  test('refreshUser memperbarui permission tanpa login ulang', () async {
    var auth = AuthProvider(
      repository: _ChangingAuthRepository(
        loginUser: _userWith(['gate.view']),
        refreshedUser: _userWith(['gate.view', 'sj_validation.view']),
      ),
    );

    var ok = await auth.login(email: 'c@c.com', password: 'x');
    expect(ok, isTrue);
    expect(auth.user?.hasPermission('sj_validation.view'), isFalse);

    await auth.refreshUser();

    expect(auth.user?.hasPermission('sj_validation.view'), isTrue);
    expect(auth.user?.hasPermission('gate.view'), isTrue);
  });

  test('refreshUser gagal diam-diam saat offline', () async {
    var auth = AuthProvider(
      repository: _ChangingAuthRepository(
        loginUser: _userWith(['gate.view']),
        refreshedUser: _userWith(['gate.view']),
      ),
    );

    var ok = await auth.login(email: 'c@c.com', password: 'x');
    expect(ok, isTrue);
    expect(auth.isAuthenticated, isTrue);
  });
}
