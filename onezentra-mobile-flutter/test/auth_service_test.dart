import 'package:dio/dio.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:onezentra_mobile/core/api_client.dart';
import 'package:onezentra_mobile/features/auth/auth_provider.dart';
import 'package:onezentra_mobile/features/auth/auth_service.dart';

import 'support/test_harness.dart';

Dio _dioWith(CannedHttpAdapter adapter) =>
    Dio(BaseOptions(baseUrl: 'http://localhost:8000/api/v1'))
      ..httpClientAdapter = adapter;

/// Uji kode parsing yang benar-benar dipakai saat login (`AuthService`),
/// memakai payload asli dari `AuthController::mobileLogin` — bukan fake
/// service. Ini yang menangkap regresi bila bentuk respons backend berubah.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(installSecureStorageMock);
  setUp(resetApiClient);
  tearDown(() => secureStorageError = null);

  group('AuthService (payload asli backend)', () {
    test('login memetakan user, roles, permissions, dan token', () async {
      final adapter = CannedHttpAdapter(mobileLoginResponse());
      final service = AuthService(_dioWith(adapter));

      final session = await service.login(
        email: '  admin@onezentra.com  ',
        password: 'password',
      );

      expect(session.token, 'fake-token-abc');
      expect(session.user.id, 1);
      expect(session.user.email, 'admin@onezentra.com');
      expect(session.user.fullName, 'Admin Utama');
      expect(session.user.kodeDepo, 'ADMIN');
      expect(session.user.namaDepo, 'Admin Utama');
      expect(session.user.level, 'admin_master');
      expect(session.user.status, 'active');
      expect(session.user.roles.single.slug, 'admin_master');
      expect(session.permissions, contains('gate.view'));
    });

    test('login mengirim email tanpa spasi ke endpoint yang benar', () async {
      final adapter = CannedHttpAdapter(mobileLoginResponse());

      await AuthService(
        _dioWith(adapter),
      ).login(email: ' admin@onezentra.com ', password: 'rahasia');

      final request = adapter.requests.single;
      expect(request.path, '/mobile/login');
      expect(request.method, 'POST');
      expect((request.data as Map)['email'], 'admin@onezentra.com');
      expect((request.data as Map)['password'], 'rahasia');
      expect((request.data as Map)['device_name'], isNotEmpty);
    });

    test('me memetakan sesi dari storage (tanpa field token)', () async {
      final service = AuthService(
        _dioWith(CannedHttpAdapter(mobileLoginResponse())),
      );

      final session = await service.me();

      expect(session.token, isNull);
      expect(session.user.email, 'admin@onezentra.com');
      expect(session.permissions, isNotEmpty);
    });

    test(
      'kredensial salah tetap terbaca sebagai "email atau password salah"',
      () async {
        final adapter = CannedHttpAdapter(<String, dynamic>{
          'message': 'The provided credentials are incorrect.',
          'errors': <String, dynamic>{
            'email': <String>['The provided credentials are incorrect.'],
          },
        }, statusCode: 422);

        final service = AuthService(_dioWith(adapter));

        try {
          await service.login(email: 'salah@onezentra.com', password: 'salah');
          fail('kredensial salah harus melempar DioException');
        } on DioException catch (e) {
          expect(parseLoginError(e), 'Email atau password salah.');
        }
      },
    );
  });

  group('pesan error', () {
    test('koneksi gagal menyebut host API yang dituju', () {
      final message = parseLoginError(networkError());

      expect(message, contains(apiHost));
      expect(message, contains('Tidak dapat terhubung'));
    });

    test(
      'server tak terjangkau di emulator Android tetap disebut localhost',
      () {
        // apiUrl bawaan memang localhost — emulator Android butuh 10.0.2.2,
        // jadi pesan harus menyebut host target agar salah config terlihat.
        expect(apiHost, 'localhost:8000');
      },
    );
  });

  group('ketahanan storage (keystore perangkat)', () {
    test('restoreToken tidak melempar saat storage gagal dibaca', () async {
      secureStorageError = PlatformException(code: 'keystore_error');

      await expectLater(ApiClient.instance.restoreToken(), completes);
      expect(ApiClient.instance.hasToken, isFalse);
    });

    test('init() tetap selesai walau storage gagal dibaca', () async {
      secureStorageError = PlatformException(code: 'keystore_error');

      await expectLater(ApiClient.instance.init(), completes);
      expect(ApiClient.instance.hasToken, isFalse);
    });

    test('login tetap berhasil walau token gagal disimpan', () async {
      secureStorageError = PlatformException(code: 'keystore_write_error');
      final auth = AuthProvider(FakeAuthService());

      await auth.login('admin@onezentra.com', 'password');

      expect(auth.isAuthenticated, isTrue);
      expect(auth.user?.email, 'gate@example.com');
      expect(ApiClient.instance.token, 'token-abc');
      expect(fakeSecureStorage, isEmpty);
    });

    test(
      'clearSession tetap memberi tahu provider walau delete gagal',
      () async {
        await resetApiClient(token: 'token-lama');
        var ended = 0;
        ApiClient.instance.onSessionEnded = () => ended++;
        secureStorageError = PlatformException(code: 'keystore_delete_error');

        await ApiClient.instance.clearSession();

        expect(ApiClient.instance.hasToken, isFalse);
        expect(ended, 1);
      },
    );
  });
}
