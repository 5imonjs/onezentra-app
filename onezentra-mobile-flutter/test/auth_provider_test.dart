import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:onezentra_mobile/core/api_client.dart';
import 'package:onezentra_mobile/features/auth/auth_provider.dart';

import 'support/test_harness.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(installSecureStorageMock);

  setUp(() => resetApiClient());

  group('AuthProvider.restore', () {
    test('tanpa token tidak memanggil endpoint /user', () async {
      final service = FakeAuthService();
      final auth = AuthProvider(service);

      await auth.restore();

      expect(service.meCalls, 0);
      expect(auth.isAuthenticated, isFalse);
      expect(auth.isRestoring, isFalse);
      expect(auth.restoreError, isNull);
    });

    test('berhasil memulihkan user + permission', () async {
      await resetApiClient(token: 'token-lama');
      final auth = AuthProvider(FakeAuthService());

      await auth.restore();

      expect(auth.isAuthenticated, isTrue);
      expect(auth.user?.email, 'gate@example.com');
      expect(auth.hasPermission('gate.create'), isTrue);
      expect(auth.isRestoring, isFalse);
      expect(auth.restoreError, isNull);
      expect(ApiClient.instance.token, 'token-lama');
    });

    test('401 membuang token dan memberi tahu sesi berakhir', () async {
      await resetApiClient(token: 'token-kedaluwarsa');
      final service = FakeAuthService()
        ..meError = dioError(401, message: 'Unauthenticated.');
      final auth = AuthProvider(service);
      var ended = 0;
      ApiClient.instance.onSessionEnded = () => ended++;

      await auth.restore();

      expect(auth.isAuthenticated, isFalse);
      expect(
        auth.restoreError,
        isNull,
        reason: 'token habis, bukan masalah jaringan',
      );
      expect(ApiClient.instance.token, isNull);
      expect(fakeSecureStorage.containsKey(tokenStorageKey), isFalse);
      expect(ended, 1);
    });

    test('error jaringan menyimpan token dan menawarkan retry', () async {
      await resetApiClient(token: 'token-masih-valid');
      final auth = AuthProvider(FakeAuthService()..meError = networkError());

      await auth.restore();

      expect(auth.isAuthenticated, isFalse);
      expect(auth.isRestoring, isFalse);
      expect(auth.restoreError, contains('Tidak dapat terhubung'));
      expect(
        ApiClient.instance.token,
        'token-masih-valid',
        reason: 'jaringan flaky tidak boleh memutus sesi',
      );
    });

    test(
      'clearSession tidak memicu rebuild berulang saat sudah kosong',
      () async {
        final auth = AuthProvider(FakeAuthService());
        await auth.restore();

        var notifications = 0;
        auth.addListener(() => notifications++);
        auth.clearSession();
        auth.clearSession();

        expect(notifications, 0);
        expect(auth.isAuthenticated, isFalse);
      },
    );
  });

  group('AuthProvider.login & logout', () {
    test('login menyimpan token dan mengisi state', () async {
      final service = FakeAuthService();
      final auth = AuthProvider(service);

      await auth.login('  gate@example.com ', 'rahasia');

      expect(service.loginCalls, 1);
      expect(auth.isAuthenticated, isTrue);
      expect(auth.hasPermission('gate.view'), isTrue);
      expect(ApiClient.instance.token, 'token-abc');
      expect(auth.isLoading, isFalse);
    });

    test('login gagal melempar error dan tidak menyimpan token', () async {
      final auth = AuthProvider(
        FakeAuthService()..loginError = dioError(401, message: 'Unauthorized.'),
      );

      await expectLater(
        auth.login('gate@example.com', 'salah'),
        throwsA(isA<DioException>()),
      );

      expect(auth.isAuthenticated, isFalse);
      expect(auth.isLoading, isFalse);
      expect(ApiClient.instance.token, isNull);
    });

    test('logout membersihkan sesi meski server menolak', () async {
      await resetApiClient(token: 'token-abc');
      final auth = AuthProvider(FakeAuthService());
      await auth.login('gate@example.com', 'rahasia');
      var ended = 0;
      ApiClient.instance.onSessionEnded = () => ended++;

      await auth.logout();

      expect(auth.isAuthenticated, isFalse);
      expect(auth.permissions, isEmpty);
      expect(ApiClient.instance.token, isNull);
      expect(fakeSecureStorage.containsKey(tokenStorageKey), isFalse);
      expect(ended, 1);
    });
  });

  group('ApiClient', () {
    test('clearSession idempoten: onSessionEnded hanya sekali', () async {
      await resetApiClient(token: 'token-abc');
      var ended = 0;
      ApiClient.instance.onSessionEnded = () => ended++;

      await ApiClient.instance.clearSession();
      await ApiClient.instance.clearSession();

      expect(ended, 1);
    });

    test('persistToken(null) menghapus token dari storage', () async {
      await resetApiClient(token: 'token-abc');
      expect(fakeSecureStorage[tokenStorageKey], 'token-abc');

      await ApiClient.instance.persistToken(null);

      expect(ApiClient.instance.hasToken, isFalse);
      expect(fakeSecureStorage.containsKey(tokenStorageKey), isFalse);
    });
  });

  group('apiErrorMessage', () {
    test('respons 403 memakai pesan izin dari server', () {
      expect(
        apiErrorMessage(dioError(403, message: 'Dokumen tidak diizinkan.')),
        'Dokumen tidak diizinkan.',
      );
    });

    test('tanpa respons server memakai pesan jaringan', () {
      expect(apiErrorMessage(networkError()), networkErrorMessage);
    });

    test('422 validation errors digabung', () {
      final error = DioException(
        requestOptions: RequestOptions(path: '/test'),
        response: Response<dynamic>(
          requestOptions: RequestOptions(path: '/test'),
          statusCode: 422,
          data: {
            'message': 'Validasi gagal.',
            'errors': {
              'po_transporter': ['Field wajib diisi.'],
            },
          },
        ),
      );
      expect(apiErrorMessage(error), 'Field wajib diisi.');
    });
  });
}
