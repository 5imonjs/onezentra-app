import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:onezentra_mobile/core/network/api_client.dart';
import 'package:onezentra_mobile/core/theme/app_theme.dart';
import 'package:onezentra_mobile/features/auth/models/auth_models.dart';
import 'package:onezentra_mobile/features/auth/providers/auth_provider.dart';
import 'package:onezentra_mobile/features/auth/repositories/auth_repository.dart';
import 'package:onezentra_mobile/features/opname/models/opname_expired_session_models.dart';
import 'package:onezentra_mobile/features/opname/pages/opname_expired_session_page.dart';
import 'package:onezentra_mobile/features/opname/repositories/opname_expired_session_repository.dart';

class _FakeOpnameExpiredSessionRepository
    extends OpnameExpiredSessionRepository {
  _FakeOpnameExpiredSessionRepository({
    this.sessions = const <OpnameExpiredSession>[],
    this.fail = false,
  });

  final List<OpnameExpiredSession> sessions;
  final bool fail;
  int listCalls = 0;
  bool? lastMine;

  @override
  Future<List<OpnameExpiredSession>> list({
    String? weekStart,
    String? kodeDepo,
    String? status,
    bool? mine,
  }) async {
    listCalls++;
    lastMine = mine;
    if (fail) {
      throw const ApiException(
        'Gagal memuat sesi opname. Silakan coba lagi.',
        0,
      );
    }
    return sessions;
  }

  @override
  Future<OpnameExpiredSession> show(int id) async {
    for (var session in sessions) {
      if (session.id == id) {
        return session;
      }
    }
    throw const ApiException('Sesi tidak ditemukan.', 0);
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

const List<String> _opnameSessionPermissions = ['opname.session.view'];

Map<String, dynamic> _loginBody({
  List<String> permissions = _opnameSessionPermissions,
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
  List<String> permissions = _opnameSessionPermissions,
}) async {
  var auth = AuthProvider(
    repository: _FakeAuthRepository(_loginBody(permissions: permissions)),
  );
  var ok = await auth.login(email: 'staff@onezentra.com', password: 'x');
  expect(ok, isTrue);
  return auth;
}

Future<void> _pumpOpnameExpiredSessionPage(
  WidgetTester tester,
  AuthProvider auth,
  OpnameExpiredSessionRepository repository,
) async {
  await tester.pumpWidget(
    ChangeNotifierProvider<AuthProvider>.value(
      value: auth,
      child: MaterialApp(
        theme: AppTheme.light,
        home: OpnameExpiredSessionPage(repository: repository),
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

  testWidgets(
    'tanpa opname.session.view hanya kartu izin, API tidak dipanggil',
    (tester) async {
      var repository = _FakeOpnameExpiredSessionRepository();
      var auth = await _loginAuth(permissions: []);

      await _pumpOpnameExpiredSessionPage(tester, auth, repository);

      expect(
        find.text(
          'Anda tidak memiliki izin untuk melihat Sesi Opname Expired.',
        ),
        findsOneWidget,
      );
      expect(repository.listCalls, 0);
    },
  );

  testWidgets('menampilkan daftar sesi opname', (tester) async {
    var repository = _FakeOpnameExpiredSessionRepository(
      sessions: [
        const OpnameExpiredSession(
          id: 1,
          weekStart: '2026-11-02',
          weekEnd: '2026-11-08',
          kodeDepo: 'DP01',
          namaDepo: 'Depo Utama',
        ),
      ],
    );
    var auth = await _loginAuth();

    await _pumpOpnameExpiredSessionPage(tester, auth, repository);

    expect(find.text('Sesi Opname Expired'), findsOneWidget);
    expect(find.text('Terbuka'), findsOneWidget);
    expect(find.text('Sesi minggu 2026-11-02'), findsOneWidget);
    expect(find.text('Depo Utama'), findsOneWidget);
    // Beranda = daftar tugas: hanya sesi yang ditugaskan ke user.
    expect(repository.lastMine, isTrue);
  });

  testWidgets('membuka detail sesi menampilkan aksi mulai sesi', (
    tester,
  ) async {
    var repository = _FakeOpnameExpiredSessionRepository(
      sessions: [
        const OpnameExpiredSession(
          id: 1,
          weekStart: '2026-11-02',
          weekEnd: '2026-11-08',
          kodeDepo: 'DP01',
          namaDepo: 'Depo Utama',
        ),
      ],
    );
    var auth = await _loginAuth();

    await _pumpOpnameExpiredSessionPage(tester, auth, repository);
    await tester.tap(find.text('Sesi minggu 2026-11-02'));
    await tester.pumpAndSettle();

    expect(find.text('Mulai Sesi'), findsOneWidget);
  });

  testWidgets('kesalahan memuat menampilkan error dengan retry', (
    tester,
  ) async {
    var repository = _FakeOpnameExpiredSessionRepository(fail: true);
    var auth = await _loginAuth();

    await _pumpOpnameExpiredSessionPage(tester, auth, repository);

    expect(
      find.text('Gagal memuat sesi opname. Silakan coba lagi.'),
      findsOneWidget,
    );
  });

  test('item sesi mengurai kode batch, barcode, dan qty wave dari backend', () {
    var item = OpnameExpiredSessionItem.fromJson({
      'id': 11,
      'session_id': 1,
      'wave_id': 99,
      'batch_id': 5,
      'qty_fisik_crt': '5.00',
      'disposition': 'RETUR',
      'batch': {
        'batch_number': 'BATCH-20261105-AB2',
        'barcode_label': 'LBL-1024',
      },
      'wave': {
        'id': 99,
        'kode_barang': 'KB-900',
        'nama_barang': 'Sirup Herbal 200ml',
        'kode_depo': 'DP01',
        'expired_date_ini': '2026-12-01',
        'qty_ini_crt': 12,
        'qty_ini_pcs': 0,
        'status_ini': 'AMAN',
      },
      'expected_crt': '11.00',
      'expected_pcs': null,
    });

    expect(item.batchNumber, 'BATCH-20261105-AB2');
    expect(item.barcodeLabel, 'LBL-1024');
    expect(item.qtyWaveCrt, 12);
    expect(item.statusIni, 'AMAN');
    expect(item.expectedCrt, 11);
  });

  testWidgets(
    'detail sesi: item dikelompokkan per barang, kode batch & qty tampil',
    (tester) async {
      const barangA1 = OpnameExpiredSessionItem(
        id: 11,
        sessionId: 1,
        waveId: 99,
        kodeBarang: 'KB-900',
        namaBarang: 'Sirup Herbal 200ml',
        batchNumber: 'BATCH-11',
        barcodeLabel: 'LBL-11',
        expiredDateIni: '2026-12-01',
        qtyWaveCrt: 12,
        statusIni: 'AMAN',
        expectedCrt: 6,
      );
      const barangA2 = OpnameExpiredSessionItem(
        id: 12,
        sessionId: 1,
        waveId: 99,
        kodeBarang: 'KB-900',
        namaBarang: 'Sirup Herbal 200ml',
        batchNumber: 'BATCH-12',
        expiredDateIni: '2027-01-05',
        qtyWaveCrt: 8,
        statusIni: 'AMAN',
        expectedCrt: 8,
      );
      const barangB = OpnameExpiredSessionItem(
        id: 13,
        sessionId: 1,
        waveId: 100,
        kodeBarang: 'KB-901',
        namaBarang: 'Susu Kental Manis',
        batchNumber: 'BATCH-13',
        expiredDateIni: '2026-11-10',
        qtyWaveCrt: 4,
        statusIni: 'KRITIS',
        expectedCrt: 4,
      );
      var repository = _FakeOpnameExpiredSessionRepository(
        sessions: [
          const OpnameExpiredSession(
            id: 1,
            weekStart: '2026-11-02',
            weekEnd: '2026-11-08',
            kodeDepo: 'DP01',
            namaDepo: 'Depo Utama',
            status: 'IN_PROGRESS',
            items: [barangA1, barangA2, barangB],
          ),
        ],
      );
      var auth = await _loginAuth();

      await _pumpOpnameExpiredSessionPage(tester, auth, repository);
      await tester.tap(find.text('Sesi minggu 2026-11-02'));
      await tester.pumpAndSettle();

      // Header cluster per barang muncul sekali dengan qty wave + progres
      // (progres dihitung per cluster: 2 baris batch KB-900).
      expect(find.text('KB-900 — Sirup Herbal 200ml'), findsExactly(1));
      expect(find.text('0/2'), findsOneWidget);
      // Kode batch tiap baris tampil mencocokkan label fisik.
      expect(find.text('BATCH-11'), findsOneWidget);
      expect(find.text('BATCH-12'), findsOneWidget);
      expect(find.text('BATCH-13'), findsOneWidget);
      // Barcode label & qty acuan baris.
      expect(find.text('Barcode: LBL-11 · Exp 2026-12-01'), findsOneWidget);
      expect(find.text('Acuan: CRT 6 / PCS - · Wave 12 CRT'), findsOneWidget);

      // Search cepat: mengetik nama produk menyaring cluster lain keluar.
      await tester.enterText(find.byType(TextField), 'Susu Kental');
      await tester.pumpAndSettle();

      expect(find.text('KB-900 — Sirup Herbal 200ml'), findsNothing);
      expect(find.text('KB-901 — Susu Kental Manis'), findsOneWidget);
      expect(find.text('BATCH-13'), findsOneWidget);
    },
  );
}
