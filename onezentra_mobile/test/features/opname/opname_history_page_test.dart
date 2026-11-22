import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:onezentra_mobile/core/theme/app_theme.dart';
import 'package:onezentra_mobile/features/auth/models/auth_models.dart';
import 'package:onezentra_mobile/features/auth/providers/auth_provider.dart';
import 'package:onezentra_mobile/features/auth/repositories/auth_repository.dart';
import 'package:onezentra_mobile/features/opname/models/opname_expired_session_models.dart';
import 'package:onezentra_mobile/features/opname/pages/opname_history_page.dart';
import 'package:onezentra_mobile/features/opname/repositories/opname_expired_session_repository.dart';

class _FakeOpnameRepository extends OpnameExpiredSessionRepository {
  _FakeOpnameRepository(this.sessions);

  final List<OpnameExpiredSession> sessions;
  int historyCalls = 0;
  int showCalls = 0;

  @override
  Future<List<OpnameExpiredSession>> history() async {
    historyCalls++;
    return sessions;
  }

  @override
  Future<OpnameExpiredSession> show(int id) async {
    showCalls++;
    return sessions.firstWhere((session) => session.id == id);
  }
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
    'level': 'staff_logistic',
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

Future<void> _pumpHistoryPage(
  WidgetTester tester,
  AuthProvider auth,
  OpnameExpiredSessionRepository repository,
) async {
  await tester.pumpWidget(
    ChangeNotifierProvider<AuthProvider>.value(
      value: auth,
      child: MaterialApp(
        theme: AppTheme.light,
        home: OpnameHistoryPage(repository: repository),
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

  testWidgets('riwayat opname menampilkan id sesi, petugas, dan hasil', (
    tester,
  ) async {
    const item = OpnameExpiredSessionItem(
      id: 11,
      sessionId: 42,
      waveId: 99,
      kodeBarang: 'KB-900',
      namaBarang: 'Sirup Herbal 200ml',
      batchNumber: 'BATCH-42',
      qtyFisikCrt: 8,
      qtyFisikPcs: 4,
      expectedCrt: 10,
      tanggalPenerimaan: '2026-11-02',
      expiredDateIni: '2027-02-01',
      verifiedAt: '2026-11-21T02:30:00Z',
    );
    var repository = _FakeOpnameRepository([
      const OpnameExpiredSession(
        id: 42,
        weekStart: '2026-11-16',
        weekEnd: '2026-11-22',
        kodeDepo: '0127',
        namaDepo: 'Singkawang',
        assignedTo: 7,
        assigneeName: 'Budi Petugas',
        status: 'APPROVED',
        itemsCount: 3,
        verifiedCount: 2,
        items: [item],
      ),
    ]);
    var auth = await _loginAuth(['opname.session.view']);

    await _pumpHistoryPage(tester, auth, repository);

    expect(find.text('Riwayat Opname'), findsOneWidget);
    expect(find.text('SESI #42'), findsOneWidget);
    expect(find.text('Budi Petugas'), findsOneWidget);
    expect(find.text('2/3 batch'), findsOneWidget);
    expect(find.text('Disetujui'), findsOneWidget);
    expect(repository.historyCalls, 1);

    await tester.tap(find.text('SESI #42'));
    await tester.pumpAndSettle();

    expect(find.text('HASIL SESI #42'), findsOneWidget);
    expect(find.text('Petugas: Budi Petugas'), findsOneWidget);
    expect(find.text('BATCH-42'), findsOneWidget);
    expect(find.textContaining('Fisik CRT 8'), findsOneWidget);
    expect(repository.showCalls, 1);
  });

  testWidgets('tanpa izin opname history tidak dipanggil', (tester) async {
    var repository = _FakeOpnameRepository(const []);
    var auth = await _loginAuth([]);

    await _pumpHistoryPage(tester, auth, repository);

    expect(
      find.text('Anda tidak memiliki izin untuk melihat Riwayat Opname.'),
      findsOneWidget,
    );
    expect(repository.historyCalls, 0);
  });
}
