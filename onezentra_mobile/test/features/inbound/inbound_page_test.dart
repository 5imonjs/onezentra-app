import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:onezentra_mobile/core/theme/app_theme.dart';
import 'package:onezentra_mobile/features/auth/models/auth_models.dart';
import 'package:onezentra_mobile/features/auth/providers/auth_provider.dart';
import 'package:onezentra_mobile/features/auth/repositories/auth_repository.dart';
import 'package:onezentra_mobile/features/inbound/models/inbound_models.dart';
import 'package:onezentra_mobile/features/inbound/pages/inbound_page.dart';
import 'package:onezentra_mobile/features/inbound/repositories/inbound_repository.dart';

/// Repository that answers from canned data so the inbound history flow can
/// be exercised without a running API.
class _FakeInboundRepository extends InboundRepository {
  _FakeInboundRepository({this.records = const [], this.detail});

  final List<Receiving> records;
  final Receiving? detail;

  int listCalls = 0;
  int showCalls = 0;

  @override
  Future<ReceivingPage> list({
    String? search,
    int page = 1,
    int perPage = 20,
  }) async {
    listCalls++;
    return ReceivingPage(
      items: records,
      currentPage: page,
      lastPage: 1,
      total: records.length,
    );
  }

  @override
  Future<Receiving> show(int id) async {
    showCalls++;
    return detail!;
  }
}

/// Auth repository that answers a canned login payload, so the widget tests
/// get a logged-in user with a controlled permission list.
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

const List<String> _inboundPermissions = ['receiving.view'];

Map<String, dynamic> _loginBody({
  List<String> permissions = _inboundPermissions,
}) => {
  'message': 'Login successful',
  'token': 'token-abc',
  'token_type': 'Bearer',
  'expires_at': '2030-01-01T00:00:00.000Z',
  'user': {
    'id': 7,
    'full_name': 'Staff',
    'email': 'staff@onezentra.com',
    'level': 'staff_logistic',
    'status': 'active',
    'created_at': '2026-01-01T00:00:00.000Z',
    'updated_at': '2026-01-01T00:00:00.000Z',
    'roles': [],
  },
  'permissions': permissions,
};

Future<AuthProvider> _loginAuth({
  List<String> permissions = _inboundPermissions,
}) async {
  var auth = AuthProvider(
    repository: _FakeAuthRepository(_loginBody(permissions: permissions)),
  );
  var ok = await auth.login(email: 'staff@onezentra.com', password: 'x');
  expect(ok, isTrue);
  return auth;
}

Future<void> _pumpInboundPage(
  WidgetTester tester,
  AuthProvider auth,
  InboundRepository repository,
) async {
  await tester.pumpWidget(
    ChangeNotifierProvider<AuthProvider>.value(
      value: auth,
      child: MaterialApp(
        theme: AppTheme.light,
        home: InboundPage(repository: repository),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

const _record = Receiving(
  id: 5,
  poTransporter: 'PO-042',
  nopol: 'B 9999 ZZ',
  driverName: 'Andi',
  status: 'COMPLETED',
  totalExpectedQty: 100,
  totalReceivedQty: 95,
);

const _detail = Receiving(
  id: 5,
  poTransporter: 'PO-042',
  nopol: 'B 9999 ZZ',
  driverName: 'Andi',
  status: 'COMPLETED',
  totalExpectedQty: 100,
  totalReceivedQty: 95,
  items: [
    ReceivedItem(
      kodeBarang: 'BRG-1',
      namaBarang: 'Gula 50kg',
      expectedQty: 100,
      actualQty: 95,
      satuan: 'zak',
      condition: 'QTY_KURANG',
      selisihQty: -5,
      selisihReason: 'Qty kurang dari rencana',
      expiredDate: '2026-12-31',
    ),
  ],
);

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    FlutterSecureStorage.setMockInitialValues({});
  });

  testWidgets('tanpa receiving.view hanya kartu izin, API tidak dipanggil', (
    tester,
  ) async {
    var repository = _FakeInboundRepository(records: [_record]);
    var auth = await _loginAuth(permissions: []);

    await _pumpInboundPage(tester, auth, repository);

    expect(
      find.text('Anda tidak memiliki izin untuk melihat Penerimaan.'),
      findsOneWidget,
    );
    expect(repository.listCalls, 0);
  });

  testWidgets('menampilkan riwayat penerimaan', (tester) async {
    var repository = _FakeInboundRepository(records: [_record]);
    var auth = await _loginAuth();

    await _pumpInboundPage(tester, auth, repository);

    expect(find.text('Penerimaan'), findsWidgets);
    expect(find.text('1 penerimaan tercatat'), findsOneWidget);
    expect(find.text('PO-042'), findsOneWidget);
    expect(find.text('B 9999 ZZ • Andi'), findsOneWidget);
    expect(repository.listCalls, greaterThan(0));
  });

  testWidgets('tap baris membuka rincian item', (tester) async {
    var repository = _FakeInboundRepository(
      records: [_record],
      detail: _detail,
    );
    var auth = await _loginAuth();

    await _pumpInboundPage(tester, auth, repository);

    await tester.tap(find.text('PO-042'));
    await tester.pumpAndSettle();

    expect(repository.showCalls, 1);
    expect(find.text('Kembali ke riwayat'), findsOneWidget);
    expect(find.text('1 item diterima'), findsOneWidget);
    expect(find.text('Gula 50kg'), findsOneWidget);
    // Same story as the selisih email: signed difference, server reason,
    // condition and expiry per line.
    expect(find.text('Selisih -5 • Qty kurang dari rencana'), findsOneWidget);
    expect(find.text('Qty kurang • Exp 31/12/2026'), findsOneWidget);

    await tester.tap(find.text('Kembali ke riwayat'));
    await tester.pumpAndSettle();

    expect(find.text('1 penerimaan tercatat'), findsOneWidget);
  });
}
