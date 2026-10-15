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
import 'package:onezentra_mobile/features/gate/pages/gate_history_page.dart';
import 'package:onezentra_mobile/features/gate/repositories/gate_repository.dart';

/// Repository that answers from canned data so the history screen can be
/// exercised without a running API.
class _FakeGateRepository extends GateRepository {
  _FakeGateRepository({this.transactions = const []});
  final List<GateTransaction> transactions;

  int listCalls = 0;
  String? lastSearch;

  @override
  Future<GateTransactionPage> list({
    String? search,
    int page = 1,
    int perPage = 20,
  }) async {
    listCalls++;
    lastSearch = search;
    var items = search == null || search.isEmpty
        ? transactions
        : transactions
              .where(
                (t) =>
                    (t.poTransporter ?? '').contains(search) ||
                    (t.nopol ?? '').contains(search),
              )
              .toList();
    return GateTransactionPage(
      items: items,
      currentPage: page,
      lastPage: 1,
      total: items.length,
    );
  }

  @override
  Future<GateStats> stats() async => const GateStats();
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

Future<AuthProvider> _loginAuth() async {
  var auth = AuthProvider(
    repository: _FakeAuthRepository({
      'message': 'Login successful',
      'token': 'token-abc',
      'token_type': 'Bearer',
      'expires_at': '2030-01-01T00:00:00.000Z',
      'user': {
        'id': 7,
        'full_name': 'Cheker',
        'email': 'cheker@onezentra.com',
        'level': 'cheker',
        'status': 'active',
        'created_at': '2026-01-01T00:00:00.000Z',
        'updated_at': '2026-01-01T00:00:00.000Z',
        'roles': [],
      },
      'permissions': ['gate.view'],
    }),
  );
  var ok = await auth.login(email: 'cheker@onezentra.com', password: 'x');
  expect(ok, isTrue);
  return auth;
}

Future<void> _pumpHistoryPage(
  WidgetTester tester,
  AuthProvider auth,
  GateRepository repository,
) async {
  await tester.pumpWidget(
    ChangeNotifierProvider<AuthProvider>.value(
      value: auth,
      child: MaterialApp(
        theme: AppTheme.light,
        home: GateHistoryPage(repository: repository),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

GateTransaction _transaction(String po) => GateTransaction(
  id: po.hashCode,
  rencanaKirimId: 11,
  gateType: 'INBOUND',
  nopol: 'B 1234 XY',
  driverName: 'Budi',
  poTransporter: po,
  scanTime: DateTime(2026, 1, 15, 8, 30, 5),
  rencanaKirim: RencanaKirim(
    id: 11,
    poTransporter: po,
    nopol: 'B 1234 XY',
    driverName: 'Budi',
    status: 'CHECKED_IN',
  ),
);

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    FlutterSecureStorage.setMockInitialValues({});
  });

  testWidgets('pencarian dan daftar di kartu terpisah', (tester) async {
    var repository = _FakeGateRepository(
      transactions: [_transaction('PO-001')],
    );
    var auth = await _loginAuth();

    await _pumpHistoryPage(tester, auth, repository);

    // Dua kartu berbeda: pencarian di atas, daftar di bawah.
    expect(find.text('Pencarian'), findsOneWidget);
    expect(find.text('Transaksi'), findsOneWidget);
    expect(find.text('PO-001'), findsOneWidget);
    expect(repository.listCalls, greaterThan(0));
  });

  testWidgets('mengetik pencarian memfilter daftar', (tester) async {
    var repository = _FakeGateRepository(
      transactions: [_transaction('PO-001'), _transaction('PO-002')],
    );
    var auth = await _loginAuth();

    await _pumpHistoryPage(tester, auth, repository);
    expect(find.text('PO-001'), findsOneWidget);
    expect(find.text('PO-002'), findsOneWidget);

    await tester.enterText(find.byType(TextFormField), 'PO-002');
    // Debounce pencarian 400ms.
    await tester.pump(const Duration(milliseconds: 500));
    await tester.pumpAndSettle();

    expect(repository.lastSearch, 'PO-002');
    expect(find.text('PO-001'), findsNothing);
    // Daftar menyusut menjadi satu baris: judul hitung ikut berubah.
    expect(find.text('1 transaksi tercatat'), findsOneWidget);
  });

  testWidgets('tanpa gate.view hanya kartu izin, API tidak dipanggil', (
    tester,
  ) async {
    var repository = _FakeGateRepository(
      transactions: [_transaction('PO-001')],
    );
    var loggedOut = AuthProvider(
      repository: _FakeAuthRepository({
        'message': 'Login successful',
        'token': 'token-abc',
        'token_type': 'Bearer',
        'expires_at': '2030-01-01T00:00:00.000Z',
        'user': {
          'id': 8,
          'full_name': 'Tamu',
          'email': 'tamu@onezentra.com',
          'level': 'tamu',
          'status': 'active',
          'created_at': '2026-01-01T00:00:00.000Z',
          'updated_at': '2026-01-01T00:00:00.000Z',
          'roles': [],
        },
        'permissions': <String>[],
      }),
    );
    var ok = await loggedOut.login(email: 'tamu@onezentra.com', password: 'x');
    expect(ok, isTrue);

    await _pumpHistoryPage(tester, loggedOut, repository);

    expect(
      find.text('Anda tidak memiliki izin untuk melihat Riwayat Gate.'),
      findsOneWidget,
    );
    expect(repository.listCalls, 0);
  });
}
