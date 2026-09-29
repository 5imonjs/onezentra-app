import 'dart:async';
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
  }) {
    return onLogin(email, password);
  }
}

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
  final authProvider = AuthProvider(repository: repository);
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

/// Decoration of the email field, i.e. the first input on the login card.
InputDecoration _emailFieldDecoration(WidgetTester tester) {
  return tester.widget<InputDecorator>(find.byType(InputDecorator).first).decoration;
}

/// Resolved colour of the text typed into the email field.
Color _emailFieldTextColor(WidgetTester tester) {
  final text = tester.widget<EditableText>(find.byType(EditableText).first);
  return text.style.color!;
}

/// WCAG contrast ratio between two opaque colours.
double _contrastRatio(Color a, Color b) {
  final lighter = math.max(a.computeLuminance(), b.computeLuminance());
  final darker = math.min(a.computeLuminance(), b.computeLuminance());
  return (lighter + 0.05) / (darker + 0.05);
}

void main() {
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    FlutterSecureStorage.setMockInitialValues({});
    // ApiClient is a singleton: clear the in-memory session between tests.
    await ApiClient().clearAuth();
  });

  group('LoginPage', () {
    testWidgets('menampilkan pesan validasi saat form kosong', (tester) async {
      await _pumpApp(
        tester,
        _FakeAuthRepository((_, __) async => _fakeAuthResponse()),
      );

      await tester.tap(find.text('Masuk'));
      await tester.pump();

      expect(find.text('Email tidak boleh kosong'), findsOneWidget);
      expect(find.text('Password tidak boleh kosong'), findsOneWidget);
    });

    testWidgets('menolak email dengan format salah', (tester) async {
      await _pumpApp(
        tester,
        _FakeAuthRepository((_, __) async => _fakeAuthResponse()),
      );

      await _submitCredentials(
        tester,
        email: 'budi.santoso',
        password: 'rahasia123',
      );
      await tester.pumpAndSettle();

      expect(find.text('Format email tidak valid'), findsOneWidget);
    });

    testWidgets('menerima email dengan TLD panjang (mis. studio.museum)', (
      tester,
    ) async {
      await _pumpApp(
        tester,
        _FakeAuthRepository((_, __) async => _fakeAuthResponse()),
      );

      await _submitCredentials(
        tester,
        email: 'budi@onezentra.museum',
        password: 'rahasia123',
      );
      await tester.pumpAndSettle();

      // No format error: the user reached the dashboard.
      expect(find.text('Format email tidak valid'), findsNothing);
      expect(find.text('Selamat Datang,'), findsOneWidget);
    });

    testWidgets('menampilkan error server tanpa meninggalkan halaman login', (
      tester,
    ) async {
      await _pumpApp(
        tester,
        _FakeAuthRepository(
          (_, __) async =>
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

    testWidgets('mengarahkan ke dashboard setelah login berhasil', (
      tester,
    ) async {
      await _pumpApp(
        tester,
        _FakeAuthRepository((_, __) async => _fakeAuthResponse()),
      );

      await _submitCredentials(
        tester,
        email: 'budi@onezentra.com',
        password: 'rahasia123',
      );
      await tester.pumpAndSettle();

      expect(find.text('Selamat Datang,'), findsOneWidget);
      expect(find.text('Selamat datang kembali'), findsNothing);
    });

    testWidgets('error hilang saat user memperbaiki input', (tester) async {
      await _pumpApp(
        tester,
        _FakeAuthRepository(
          (_, __) async =>
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
  });

  group('AuthProvider', () {
    test('mengabaikan login kedua saat request pertama berjalan', () async {
      var calls = 0;
      final completer = Completer<AuthResponse>();
      final provider = AuthProvider(
        repository: _FakeAuthRepository((_, __) {
          calls++;
          return completer.future;
        }),
      );

      final firstCall = provider.login(
        email: 'budi@onezentra.com',
        password: 'rahasia123',
      );
      final secondCall = await provider.login(
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
      final provider = AuthProvider(
        repository: _FakeAuthRepository((_, __) async => _fakeAuthResponse()),
      );

      await provider.login(email: 'budi@onezentra.com', password: 'rahasia123');

      expect(provider.token, '1|test-token');
      expect(provider.expiresAt, isNotNull);
      expect(provider.user?.fullName, 'Budi Santoso');
    });

    test('session kedaluwarsa mengembalikan state ke login', () async {
      final provider = AuthProvider(
        repository: _FakeAuthRepository((_, __) async => _fakeAuthResponse()),
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
    });

    test('mempertahankan pesan yang tidak dikenal', () {
      expect(
        AuthRepository.localizeMessage('Rate limit exceeded.'),
        'Rate limit exceeded.',
      );
    });

    test('device name tidak melebihi batas server', () {
      final deviceName = AuthRepository.defaultDeviceName;

      expect(deviceName, isNotEmpty);
      expect(deviceName.length, lessThanOrEqualTo(100));
    });
  });

  group('Theme', () {
    testWidgets('halaman login tetap utuh pada mode gelap', (tester) async {
      tester.platformDispatcher.platformBrightnessTestValue = Brightness.dark;
      addTearDown(tester.platformDispatcher.clearPlatformBrightnessTestValue);

      await _pumpApp(
        tester,
        _FakeAuthRepository((_, __) async => _fakeAuthResponse()),
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
        _FakeAuthRepository((_, __) async => _fakeAuthResponse()),
      );

      final decoration = _emailFieldDecoration(tester);
      final textColor = _emailFieldTextColor(tester);
      final theme = Theme.of(
        tester.element(find.byType(InputDecorator).first),
      );

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

    testWidgets('teks input tetap terbaca saat field difokuskan (mode terang)', (
      tester,
    ) async {
      await _pumpApp(
        tester,
        _FakeAuthRepository((_, __) async => _fakeAuthResponse()),
      );

      final decoration = _emailFieldDecoration(tester);
      final textColor = _emailFieldTextColor(tester);

      expect(decoration.focusColor!.a, lessThan(1));

      // Near-black text on the light fill.
      expect(textColor, AppTheme.gray900);
      expect(
        _contrastRatio(textColor, AppTheme.surfaceHover),
        greaterThan(4.5),
      );
    });

    testWidgets('logo garuda tampil tanpa lapisan warna tambahan', (
      tester,
    ) async {
      await _pumpApp(
        tester,
        _FakeAuthRepository((_, __) async => _fakeAuthResponse()),
      );

      final logo = tester.widget<Image>(find.byType(Image));
      expect((logo.image as AssetImage).assetName, 'assets/images/LOGO.png');

      // The mark is recoloured for the active brightness and nothing else.
      expect(logo.color, AppTheme.gray900);
      expect(logo.colorBlendMode, BlendMode.srcIn);

      // No tinted plate: no decorated Container may sit between the logo and
      // the card, so no pill, tint or border can render behind the mark.
      tester.element(find.byType(Image)).visitAncestorElements((ancestor) {
        final widget = ancestor.widget;
        if (widget is Container && widget.decoration != null) {
          fail('Logo should not be wrapped in a decorated Container');
        }
        return !(widget is Form);
      });
    });
  });
}
