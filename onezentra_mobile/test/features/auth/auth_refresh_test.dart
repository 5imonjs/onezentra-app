import 'dart:async';

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

/// Repository whose refresh request stays pending until the test releases it,
/// proving concurrent `refreshUser()` calls share one HTTP request.
class _ControlledRefreshRepository extends AuthRepository {
  _ControlledRefreshRepository(this.user);

  final User user;
  final Completer<User> refreshCompleter = Completer<User>();
  int getUserCalls = 0;

  @override
  Future<AuthResponse> login({
    required String email,
    required String password,
    String? deviceName,
  }) async => AuthResponse(message: 'Login successful', token: 't', user: user);

  @override
  Future<User> getUser() {
    getUserCalls++;
    return refreshCompleter.future;
  }
}

/// Repository whose logout request never answers on its own, so the test can
/// verify the local session is cleared first.
class _PendingLogoutRepository extends AuthRepository {
  _PendingLogoutRepository(this.user);

  final User user;
  final Completer<void> logoutCompleter = Completer<void>();

  @override
  Future<AuthResponse> login({
    required String email,
    required String password,
    String? deviceName,
  }) async => AuthResponse(message: 'Login successful', token: 't', user: user);

  @override
  Future<void> logout() => logoutCompleter.future;

  @override
  Future<User> getUser() async => user;
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

  test('refreshUser menggabungkan request yang sedang berjalan', () async {
    var repo = _ControlledRefreshRepository(_userWith(['gate.view']));
    var auth = AuthProvider(repository: repo);
    expect(await auth.login(email: 'c@c.com', password: 'x'), isTrue);

    var first = auth.refreshUser();
    var second = auth.refreshUser();

    expect(repo.getUserCalls, 1);
    expect(auth.isRefreshing, isTrue);

    repo.refreshCompleter.complete(
      _userWith(['gate.view', 'sj_validation.view']),
    );

    expect(await first, isTrue);
    expect(await second, isTrue);
    expect(auth.isRefreshing, isFalse);
    expect(auth.refreshFailed, isFalse);
    expect(auth.user?.hasPermission('sj_validation.view'), isTrue);
  });

  test('logout membersihkan sesi lokal tanpa menunggu server', () async {
    var repo = _PendingLogoutRepository(_userWith(['gate.view']));
    var auth = AuthProvider(repository: repo);
    expect(await auth.login(email: 'c@c.com', password: 'x'), isTrue);

    var logoutFuture = auth.logout();

    expect(auth.isAuthenticated, isFalse);
    expect(auth.token, isNull);
    expect(auth.user, isNull);

    await logoutFuture;
    expect(repo.logoutCompleter.isCompleted, isFalse);
    expect(auth.isLoading, isFalse);

    repo.logoutCompleter.complete();
    await Future<void>.delayed(Duration.zero);
  });
}
