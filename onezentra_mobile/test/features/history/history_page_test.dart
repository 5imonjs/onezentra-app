import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:onezentra_mobile/core/theme/app_theme.dart';
import 'package:onezentra_mobile/features/auth/models/auth_models.dart';
import 'package:onezentra_mobile/features/auth/providers/auth_provider.dart';
import 'package:onezentra_mobile/features/auth/repositories/auth_repository.dart';
import 'package:onezentra_mobile/features/gate/models/gate_models.dart';
import 'package:onezentra_mobile/features/gate/repositories/gate_repository.dart';
import 'package:onezentra_mobile/features/history/pages/history_page.dart';
import 'package:onezentra_mobile/features/inbound/models/inbound_models.dart';
import 'package:onezentra_mobile/features/inbound/repositories/inbound_repository.dart';
import 'package:onezentra_mobile/features/validation/models/validation_models.dart';
import 'package:onezentra_mobile/features/validation/repositories/validation_repository.dart';

/// Empty repositories keep the unified history off the network and let each
/// tab show its own empty state, which is what these tests assert on.
class _FakeGateRepository extends GateRepository {
  @override
  Future<GateTransactionPage> list({
    String? search,
    int page = 1,
    int perPage = 20,
  }) async => GateTransactionPage(
    items: const [],
    currentPage: page,
    lastPage: 1,
    total: 0,
  );

  @override
  Future<GateStats> stats() async => const GateStats();
}

class _FakeValidationRepository extends ValidationRepository {
  @override
  Future<ValidationHistoryPage> list({
    String? search,
    int page = 1,
    int perPage = 20,
  }) async => ValidationHistoryPage(
    items: const [],
    currentPage: page,
    lastPage: 1,
    total: 0,
  );

  @override
  Future<ValidationStats> stats() async => const ValidationStats();
}

class _FakeInboundRepository extends InboundRepository {
  @override
  Future<ReceivingPage> list({
    String? search,
    int page = 1,
    int perPage = 20,
  }) async =>
      ReceivingPage(items: const [], currentPage: page, lastPage: 1, total: 0);
}

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
    'created_at': '2026-01-01T00:00:00.000Z',
    'updated_at': '2026-01-01T00:00:00.000Z',
    'roles': [],
  },
  'permissions': permissions,
};

Future<AuthProvider> _loginAuth(List<String> permissions) async {
  var auth = AuthProvider(
    repository: _FakeAuthRepository(_loginBody(permissions)),
  );
  expect(await auth.login(email: 'op@onezentra.com', password: 'x'), isTrue);
  return auth;
}

Future<void> _pumpHistory(WidgetTester tester, AuthProvider auth) async {
  await tester.pumpWidget(
    ChangeNotifierProvider<AuthProvider>.value(
      value: auth,
      child: MaterialApp(
        theme: AppTheme.dark,
        home: HistoryPage(
          gateRepository: _FakeGateRepository(),
          validationRepository: _FakeValidationRepository(),
          inboundRepository: _FakeInboundRepository(),
        ),
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

  testWidgets('satu halaman riwayat dengan tab gate, validasi, penerimaan', (
    tester,
  ) async {
    var auth = await _loginAuth([
      'gate.view',
      'sj_validation.view',
      'receiving.view',
    ]);

    await _pumpHistory(tester, auth);

    expect(find.text('Riwayat'), findsOneWidget);
    expect(find.byType(Tab), findsNWidgets(3));
    expect(find.text('Belum ada transaksi gate'), findsOneWidget);

    await tester.tap(find.text('Validasi'));
    await tester.pumpAndSettle();
    expect(find.text('Belum ada sesi validasi'), findsOneWidget);

    await tester.tap(find.text('Penerimaan'));
    await tester.pumpAndSettle();
    expect(find.text('Belum ada penerimaan'), findsOneWidget);
  });

  testWidgets('tab disembunyikan sesuai permission', (tester) async {
    var auth = await _loginAuth(['gate.view']);

    await _pumpHistory(tester, auth);

    expect(find.byType(Tab), findsNothing);
    expect(find.text('Belum ada transaksi gate'), findsOneWidget);
    expect(find.text('Validasi'), findsNothing);
    expect(find.text('Penerimaan'), findsNothing);
  });

  testWidgets('tanpa izin riwayat menampilkan pesan akses', (tester) async {
    var auth = await _loginAuth([]);

    await _pumpHistory(tester, auth);

    expect(
      find.text('Anda tidak memiliki izin untuk melihat Riwayat.'),
      findsOneWidget,
    );
    expect(find.byType(Tab), findsNothing);
  });
}
