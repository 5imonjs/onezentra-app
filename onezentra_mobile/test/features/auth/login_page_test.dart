import 'dart:async';
import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:onezentra_mobile/core/network/api_client.dart';
import 'package:onezentra_mobile/core/theme/app_theme.dart';
import 'package:onezentra_mobile/features/auth/models/auth_models.dart';
import 'package:onezentra_mobile/features/auth/providers/auth_provider.dart';
import 'package:onezentra_mobile/features/auth/repositories/auth_repository.dart';
import 'package:onezentra_mobile/main.dart';

/// Repository that answers from memory so the login flow can be tested without
/// a running API.
class _FakeAuthRepository extends AuthRepository {
  _FakeAuthRepository(this.onLogin);

  final Future<AuthResponse> Function(String email, String password) onLogin;

  @override
  Future<AuthResponse> login({
    required String email,
    required String password,
    String? deviceName,
  }) => onLogin(email, password);
}

/// Serves a canned body so the repository's response validation can be
/// exercised without a network. A plain string stands in for a non-JSON body,
/// which is what a proxy error page or an empty 204 looks like on the wire.
AuthRepository _repositoryAnswering(dynamic body) =>
    AuthRepository(post: (_, _) async => body);

User _fakeUser() => User.fromJson(const {
  'id': 1,
  'full_name': 'Budi Santoso',
  'email': 'budi@onezentra.com',
  'kode_depo': 'D01',
  'nama_depo': 'Depo Utama',
  'level': 'admin_depo',
  'status': 'active',
  'created_at': '2024-01-01T00:00:00+07:00',
  'updated_at': '2024-01-01T00:00:00+07:00',
});

AuthResponse _fakeAuthResponse() => AuthResponse(
  message: 'Login successful',
  token: '1|test-token',
  tokenType: 'Bearer',
  expiresAt: DateTime.now().add(const Duration(hours: 8)).toIso8601String(),
  user: _fakeUser(),
);

Future<AuthProvider> _pumpApp(
  WidgetTester tester,
  AuthRepository repository,
) async {
  var authProvider = AuthProvider(repository: repository);
  await authProvider.init();

  // A phone-sized surface so the layout is exercised the way users see it.
  tester.view.physicalSize = const Size(1080, 1920);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    OneZentraApp(authProvider: authProvider, router: buildRouter(authProvider)),
  );
  await tester.pumpAndSettle();

  return authProvider;
}

Future<void> _submitCredentials(
  WidgetTester tester, {
  required String email,
  required String password,
}) async {
  await tester.enterText(find.byType(TextFormField).at(0), email);
  await tester.enterText(find.byType(TextFormField).at(1), password);
  await tester.tap(find.text('Masuk'));
  await tester.pump();
}

Future<void> _openServerPanel(WidgetTester tester) async {
  var serverButton = find.textContaining('Server:');
  await tester.ensureVisible(serverButton);
  await tester.pumpAndSettle();
  await tester.tap(serverButton);
  await tester.pumpAndSettle();
}

Future<void> _tapVisible(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.pumpAndSettle();
  await tester.tap(finder);
  await tester.pumpAndSettle();
}

/// Decoration of the email field, i.e. the first input on the login card.
InputDecoration _emailFieldDecoration(WidgetTester tester) =>
    tester.widget<InputDecorator>(find.byType(InputDecorator).first).decoration;

/// Resolved colour of the text typed into the email field.
Color _emailFieldTextColor(WidgetTester tester) {
  var text = tester.widget<EditableText>(find.byType(EditableText).first);
  return text.style.color!;
}

/// WCAG contrast ratio between two opaque colours.
double _contrastRatio(Color a, Color b) {
  var lighter = math.max(a.computeLuminance(), b.computeLuminance());
  var darker = math.min(a.computeLuminance(), b.computeLuminance());
  return (lighter + 0.05) / (darker + 0.05);
}

void main() {
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    FlutterSecureStorage.setMockInitialValues({});
    // ApiClient is a singleton: reset both the in-memory session and any
    // server override a previous test installed.
    await ApiClient().setBaseUrl('');
  });

  group('LoginPage', () {
    testWidgets('menampilkan pesan validasi saat form kosong', (tester) async {
      await _pumpApp(
        tester,
        _FakeAuthRepository((_, _) async => _fakeAuthResponse()),
      );

      await tester.tap(find.text('Masuk'));
      await tester.pump();

      expect(find.text('Email tidak boleh kosong'), findsOneWidget);
      expect(find.text('Password tidak boleh kosong'), findsOneWidget);
    });

    testWidgets('menolak email yang juga ditolak validasi server', (
      tester,
    ) async {
      await _pumpApp(
        tester,
        _FakeAuthRepository((_, _) async {
          throw StateError('email tidak valid tidak boleh dikirim ke server');
        }),
      );

      for (var email in [
        'budi.santoso',
        'a..b@example.com',
        '.a@example.com',
        'a@-example.com',
        'a@example-.com',
      ]) {
        await _submitCredentials(tester, email: email, password: 'rahasia123');
        await tester.pumpAndSettle();

        expect(
          find.text('Format email tidak valid'),
          findsOneWidget,
          reason: '$email seharusnya ditolak di klien',
        );
      }
    });

    testWidgets('error email hilang saat input diperbaiki', (tester) async {
      await _pumpApp(
        tester,
        _FakeAuthRepository((_, _) async => _fakeAuthResponse()),
      );

      await _submitCredentials(
        tester,
        email: 'budi.santoso',
        password: 'rahasia123',
      );
      await tester.pumpAndSettle();
      expect(find.text('Format email tidak valid'), findsOneWidget);

      await tester.enterText(
        find.byType(TextFormField).at(0),
        'budi@onezentra.com',
      );
      await tester.pumpAndSettle();

      expect(find.text('Format email tidak valid'), findsNothing);
    });

    testWidgets('menerima email dengan TLD panjang (mis. studio.museum)', (
      tester,
    ) async {
      await _pumpApp(
        tester,
        _FakeAuthRepository((_, _) async => _fakeAuthResponse()),
      );

      await _submitCredentials(
        tester,
        email: 'budi@onezentra.museum',
        password: 'rahasia123',
      );
      await tester.pumpAndSettle();

      // No format error: the user reached the home menu.
      expect(find.text('Format email tidak valid'), findsNothing);
      expect(find.text('Halo,'), findsOneWidget);
    });

    testWidgets('menampilkan error server tanpa meninggalkan halaman login', (
      tester,
    ) async {
      await _pumpApp(
        tester,
        _FakeAuthRepository(
          (_, _) async =>
              throw const ApiException('Email atau password salah.', 422),
        ),
      );

      await _submitCredentials(
        tester,
        email: 'budi@onezentra.com',
        password: 'salah',
      );
      await tester.pumpAndSettle();

      expect(find.text('Email atau password salah.'), findsOneWidget);
      expect(find.text('Selamat datang kembali'), findsOneWidget);
    });

    testWidgets('mengarahkan ke home setelah login berhasil', (tester) async {
      await _pumpApp(
        tester,
        _FakeAuthRepository((_, _) async => _fakeAuthResponse()),
      );

      await _submitCredentials(
        tester,
        email: 'budi@onezentra.com',
        password: 'rahasia123',
      );
      await tester.pumpAndSettle();

      expect(find.text('Halo,'), findsOneWidget);
      expect(find.text('Selamat datang kembali'), findsNothing);
    });

    testWidgets('error hilang saat user memperbaiki input', (tester) async {
      await _pumpApp(
        tester,
        _FakeAuthRepository(
          (_, _) async =>
              throw const ApiException('Email atau password salah.', 422),
        ),
      );

      await _submitCredentials(
        tester,
        email: 'budi@onezentra.com',
        password: 'salah',
      );
      await tester.pumpAndSettle();
      expect(find.text('Email atau password salah.'), findsOneWidget);

      await tester.enterText(find.byType(TextFormField).at(1), 'rahasia123');
      await tester.pumpAndSettle();

      expect(find.text('Email atau password salah.'), findsNothing);
    });

    testWidgets('tombol tampilkan password mengubah obscureText', (
      tester,
    ) async {
      await _pumpApp(
        tester,
        _FakeAuthRepository((_, _) async => _fakeAuthResponse()),
      );

      expect(
        tester
            .widget<EditableText>(find.byType(EditableText).at(1))
            .obscureText,
        isTrue,
      );

      await tester.tap(find.byTooltip('Tampilkan password'));
      await tester.pump();
      expect(
        tester
            .widget<EditableText>(find.byType(EditableText).at(1))
            .obscureText,
        isFalse,
      );

      await tester.tap(find.byTooltip('Sembunyikan password'));
      await tester.pump();
      expect(
        tester
            .widget<EditableText>(find.byType(EditableText).at(1))
            .obscureText,
        isTrue,
      );
    });

    testWidgets('field punya label semantik', (tester) async {
      var semantics = tester.ensureSemantics();

      await _pumpApp(
        tester,
        _FakeAuthRepository((_, _) async => _fakeAuthResponse()),
      );

      expect(find.bySemanticsLabel(RegExp('Email')), findsWidgets);
      expect(find.bySemanticsLabel(RegExp('Password')), findsWidgets);

      semantics.dispose();
    });

    testWidgets('menghormati text scale pengguna', (tester) async {
      tester.platformDispatcher.textScaleFactorTestValue = 2;
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);

      await _pumpApp(
        tester,
        _FakeAuthRepository((_, _) async => _fakeAuthResponse()),
      );

      var context = tester.element(find.text('Selamat datang kembali'));
      expect(MediaQuery.textScalerOf(context).scale(1), closeTo(2, 0.01));
    });

    testWidgets('429 menonaktifkan tombol sampai cooldown selesai', (
      tester,
    ) async {
      await _pumpApp(
        tester,
        _FakeAuthRepository(
          (_, _) async => throw const ApiException(
            'Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.',
            429,
            null,
            Duration(seconds: 2),
          ),
        ),
      );

      await _submitCredentials(
        tester,
        email: 'budi@onezentra.com',
        password: 'salah',
      );
      await tester.pumpAndSettle();

      expect(find.text('Tunggu 2 dtk'), findsOneWidget);
      expect(find.text('Masuk'), findsNothing);

      await tester.pump(const Duration(seconds: 1));
      expect(find.text('Tunggu 1 dtk'), findsOneWidget);

      await tester.pump(const Duration(seconds: 1));
      expect(find.text('Masuk'), findsOneWidget);
    });

    testWidgets('server tidak valid menampilkan error inline', (tester) async {
      var provider = await _pumpApp(
        tester,
        _FakeAuthRepository((_, _) async => _fakeAuthResponse()),
      );
      await _openServerPanel(tester);

      await tester.enterText(
        find.byKey(const Key('server-url-field')),
        'ftp://host/api',
      );
      await _tapVisible(tester, find.text('Simpan'));
      await tester.pumpAndSettle();

      expect(find.textContaining('Alamat server tidak valid'), findsOneWidget);
      expect(find.text('Ganti server?'), findsNothing);
      expect(provider.apiBaseUrl, ApiClient.resolvedBaseUrl);
    });

    testWidgets('mengganti server meminta konfirmasi dan membuang sesi', (
      tester,
    ) async {
      var provider = await _pumpApp(
        tester,
        _FakeAuthRepository((_, _) async => _fakeAuthResponse()),
      );
      await _openServerPanel(tester);

      await tester.enterText(
        find.byKey(const Key('server-url-field')),
        'https://api.example.test',
      );
      await _tapVisible(tester, find.text('Simpan'));
      await tester.pumpAndSettle();

      expect(find.text('Ganti server?'), findsOneWidget);
      expect(provider.apiBaseUrl, isNot('https://api.example.test/api/v1'));

      await tester.tap(find.text('Batal'));
      await tester.pumpAndSettle();
      expect(provider.apiBaseUrl, isNot('https://api.example.test/api/v1'));

      await _tapVisible(tester, find.text('Simpan'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Ganti server'));
      await tester.pumpAndSettle();

      expect(provider.apiBaseUrl, 'https://api.example.test/api/v1');
      expect(find.textContaining('silakan login ulang'), findsOneWidget);
    });

    testWidgets('server kosong tidak menimpa default', (tester) async {
      var provider = await _pumpApp(
        tester,
        _FakeAuthRepository((_, _) async => _fakeAuthResponse()),
      );
      await _openServerPanel(tester);

      await tester.enterText(find.byKey(const Key('server-url-field')), '');
      await _tapVisible(tester, find.text('Simpan'));
      await tester.pumpAndSettle();

      expect(find.textContaining('tidak boleh kosong'), findsOneWidget);
      expect(provider.apiBaseUrl, ApiClient.resolvedBaseUrl);
    });
  });

  group('AuthProvider', () {
    test('mengabaikan login kedua saat request pertama berjalan', () async {
      var calls = 0;
      var completer = Completer<AuthResponse>();
      var provider = AuthProvider(
        repository: _FakeAuthRepository((_, _) {
          calls++;
          return completer.future;
        }),
      );

      var firstCall = provider.login(
        email: 'budi@onezentra.com',
        password: 'rahasia123',
      );
      var secondCall = await provider.login(
        email: 'budi@onezentra.com',
        password: 'rahasia123',
      );

      expect(calls, 1);
      expect(secondCall, isFalse);

      completer.complete(_fakeAuthResponse());

      expect(await firstCall, isTrue);
      expect(provider.isAuthenticated, isTrue);
    });

    test('menyimpan token dan masa berlaku dari server', () async {
      var provider = AuthProvider(
        repository: _FakeAuthRepository((_, _) async => _fakeAuthResponse()),
      );

      await provider.login(email: 'budi@onezentra.com', password: 'rahasia123');

      expect(provider.token, '1|test-token');
      expect(provider.expiresAt, isNotNull);
      expect(provider.user?.fullName, 'Budi Santoso');
    });

    test('session kedaluwarsa mengembalikan state ke login', () async {
      var provider = AuthProvider(
        repository: _FakeAuthRepository((_, _) async => _fakeAuthResponse()),
      );
      await provider.login(email: 'budi@onezentra.com', password: 'rahasia123');
      expect(provider.isAuthenticated, isTrue);

      provider.handleSessionExpired();

      expect(provider.isAuthenticated, isFalse);
      expect(provider.user, isNull);
      expect(
        provider.error,
        'Sesi Anda telah berakhir. Silakan login kembali.',
      );
    });

    test('menyimpan status 429 dan retryAfter untuk cooldown UI', () async {
      var provider = AuthProvider(
        repository: _FakeAuthRepository(
          (_, _) async => throw const ApiException(
            'Terlalu banyak percobaan.',
            429,
            null,
            Duration(seconds: 30),
          ),
        ),
      );

      var ok = await provider.login(
        email: 'budi@onezentra.com',
        password: 'salah',
      );

      expect(ok, isFalse);
      expect(provider.errorStatusCode, 429);
      expect(provider.retryAfter, const Duration(seconds: 30));

      provider.clearError();
      expect(provider.errorStatusCode, isNull);
      expect(provider.retryAfter, isNull);
    });

    test('respons tanpa token tidak membuat provider authenticated', () async {
      var provider = AuthProvider(
        repository: AuthRepository(
          post: (_, _) async => {
            'message': 'Login successful',
            'user': _fakeUser().toJson(),
          },
        ),
      );

      var ok = await provider.login(
        email: 'budi@onezentra.com',
        password: 'rahasia123',
      );

      expect(ok, isFalse);
      expect(provider.isAuthenticated, isFalse);
      expect(provider.error, contains('token'));
    });
  });

  group('AuthRepository', () {
    test('menerjemahkan pesan kredensial dari API', () {
      expect(
        AuthRepository.localizeMessage(
          'The provided credentials are incorrect.',
        ),
        'Email atau password salah.',
      );
      expect(
        AuthRepository.localizeMessage('Your account is inactive.'),
        'Akun Anda tidak aktif. Silakan hubungi admin.',
      );
      expect(
        AuthRepository.localizeMessage(
          'The email field must be a valid email address.',
        ),
        'Format email tidak valid.',
      );
    });

    test('mempertahankan pesan yang tidak dikenal', () {
      expect(
        AuthRepository.localizeMessage('Rate limit exceeded.'),
        'Rate limit exceeded.',
      );
    });

    test('device name tidak melebihi batas server', () {
      var deviceName = AuthRepository.defaultDeviceName;

      expect(deviceName, isNotEmpty);
      expect(deviceName.length, lessThanOrEqualTo(100));
    });

    test('respons login tanpa field user ditolak dengan pesan jelas', () async {
      var repository = _repositoryAnswering({
        'message': 'Login successful',
        'token': '1|abc',
      });

      await expectLater(
        repository.login(email: 'budi@onezentra.com', password: 'rahasia123'),
        throwsA(
          isA<ApiException>().having(
            (e) => e.message,
            'message',
            contains('tidak memuat data pengguna'),
          ),
        ),
      );
    });

    test('respons login tanpa token ditolak dengan pesan jelas', () async {
      var repository = _repositoryAnswering({
        'message': 'Login successful',
        'user': {
          'id': 1,
          'full_name': 'Budi Santoso',
          'email': 'budi@onezentra.com',
        },
      });

      await expectLater(
        repository.login(email: 'budi@onezentra.com', password: 'rahasia123'),
        throwsA(
          isA<ApiException>().having(
            (e) => e.message,
            'message',
            contains('tidak memuat token'),
          ),
        ),
      );
    });

    test('status 429 mempertahankan retryAfter dari API', () async {
      var repository = AuthRepository(
        post: (_, _) async => throw const ApiException(
          'Terlalu banyak percobaan.',
          429,
          null,
          Duration(seconds: 7),
        ),
      );

      await expectLater(
        repository.login(email: 'budi@onezentra.com', password: 'rahasia123'),
        throwsA(
          isA<ApiException>().having(
            (e) => e.retryAfter,
            'retryAfter',
            const Duration(seconds: 7),
          ),
        ),
      );
    });

    test('pesan validasi email dari server diterjemahkan', () async {
      var repository = AuthRepository(
        post: (_, _) async => throw const ApiException(
          'The email field must be a valid email address.',
          422,
        ),
      );

      await expectLater(
        repository.login(email: 'budi@onezentra.com', password: 'rahasia123'),
        throwsA(
          isA<ApiException>().having(
            (e) => e.message,
            'message',
            'Format email tidak valid.',
          ),
        ),
      );
    });

    test(
      'respons 2xy non-JSON ditolak dengan pesan yang bisa ditindaklanjuti',
      () async {
        // Halaman HTML dari proxy atau 204 kosong: `as Map` akan melempar
        // TypeError dan hanya bisa ditampilkan sebagai "kesalahan tak terduga".
        var repository = _repositoryAnswering('halaman error');

        await expectLater(
          repository.login(email: 'budi@onezentra.com', password: 'rahasia123'),
          throwsA(
            isA<ApiException>()
                .having((e) => e.message, 'message', contains('tidak valid'))
                .having(
                  (e) => e.isConnectionIssue,
                  'isConnectionIssue',
                  isTrue,
                ),
          ),
        );
      },
    );
  });

  group('Pemetaan error jaringan', () {
    test(
      'exception transport terpetakan jadi ApiException yang bisa dibaca user',
      () {
        // Semua ini dulu lolos ke `catch (_)` provider sehingga user hanya
        // melihat "Terjadi kesalahan tidak terduga".
        for (var error in <Object>[
          const SocketException('Connection refused'),
          const HttpException(
            'Connection closed before full header was received',
          ),
          const HandshakeException('CERTIFICATE_VERIFY_FAILED'),
          const TlsException('handshake failed'),
          TimeoutException('timeout'),
        ]) {
          var mapped = ApiClient.mapTransportError(error);

          expect(
            mapped,
            isA<ApiException>(),
            reason: '$error harus dipetakan, bukan lolos sebagai error mentah',
          );
          expect(mapped.isConnectionIssue, isTrue);
          expect(mapped.message, isNotEmpty);
          expect(
            mapped.message,
            isNot(contains('Terjadi kesalahan tidak terduga')),
          );
        }
      },
    );

    test('user dengan field null dari server tidak membuat parsing gagal', () {
      // Kolom `level`/`status` bisa null pada user lama; `as String` yang
      // sebelumnya dipakai akan melempar TypeError saat login.
      var user = User.fromJson(const {
        'id': 7,
        'full_name': 'Budi',
        'email': 'budi@onezentra.com',
        'kode_depo': null,
        'nama_depo': null,
        'level': null,
        'status': null,
        'created_at': null,
        'updated_at': null,
      });

      expect(user.id, 7);
      expect(user.email, 'budi@onezentra.com');
      expect(user.level, isNotEmpty);
      expect(user.status, isNotEmpty);
    });

    test('AuthResponse dari server tanpa message tidak melempar TypeError', () {
      var response = AuthResponse.fromJson(const {
        'token': '1|abc',
        'user': {'id': 1, 'email': 'budi@onezentra.com'},
      });

      expect(response.token, '1|abc');
      expect(response.user.id, 1);
    });
  });

  group('Theme', () {
    testWidgets('halaman login tetap utuh pada mode gelap', (tester) async {
      tester.platformDispatcher.platformBrightnessTestValue = Brightness.dark;
      addTearDown(tester.platformDispatcher.clearPlatformBrightnessTestValue);

      await _pumpApp(
        tester,
        _FakeAuthRepository((_, _) async => _fakeAuthResponse()),
      );

      expect(find.text('Selamat datang kembali'), findsOneWidget);
      expect(find.text('Masuk'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('teks input tetap terbaca saat field difokuskan (mode gelap)', (
      tester,
    ) async {
      tester.platformDispatcher.platformBrightnessTestValue = Brightness.dark;
      addTearDown(tester.platformDispatcher.clearPlatformBrightnessTestValue);

      await _pumpApp(
        tester,
        _FakeAuthRepository((_, _) async => _fakeAuthResponse()),
      );

      var decoration = _emailFieldDecoration(tester);
      var textColor = _emailFieldTextColor(tester);
      var theme = Theme.of(tester.element(find.byType(InputDecorator).first));

      // The focus overlay is painted on top of the fill, so both the field and
      // the theme must keep it translucent; an opaque overlay is what made the
      // typed text disappear.
      expect(decoration.focusColor!.a, lessThan(1));
      expect(decoration.hoverColor!.a, lessThan(1));
      expect(theme.focusColor.a, lessThan(1));
      expect(theme.splashColor.a, lessThan(1));

      // White text on the dark glass fill: clearly readable.
      expect(textColor, Colors.white);
      expect(
        _contrastRatio(textColor, const Color(0xFF1E1B4B)),
        greaterThan(4.5),
      );
    });

    testWidgets(
      'teks input tetap terbaca saat field difokuskan (mode terang)',
      (tester) async {
        await _pumpApp(
          tester,
          _FakeAuthRepository((_, _) async => _fakeAuthResponse()),
        );

        var decoration = _emailFieldDecoration(tester);
        var textColor = _emailFieldTextColor(tester);

        expect(decoration.focusColor!.a, lessThan(1));

        // Near-black text on the light fill.
        expect(textColor, AppTheme.gray900);
        expect(
          _contrastRatio(textColor, AppTheme.surfaceHover),
          greaterThan(4.5),
        );
      },
    );

    testWidgets('logo garuda tampil tanpa lapisan warna tambahan', (
      tester,
    ) async {
      await _pumpApp(
        tester,
        _FakeAuthRepository((_, _) async => _fakeAuthResponse()),
      );

      var logo = tester.widget<Image>(find.byType(Image));
      expect((logo.image as AssetImage).assetName, 'assets/images/LOGO.png');

      // The mark is recoloured for the active brightness and nothing else.
      expect(logo.color, AppTheme.gray900);
      expect(logo.colorBlendMode, BlendMode.srcIn);

      // No tinted plate: no decorated Container may sit between the logo and
      // the card, so no pill, tint or border can render behind the mark.
      tester.element(find.byType(Image)).visitAncestorElements((ancestor) {
        var widget = ancestor.widget;
        if (widget is Container && widget.decoration != null) {
          fail('Logo should not be wrapped in a decorated Container');
        }
        return widget is! Form;
      });
    });
  });
}
