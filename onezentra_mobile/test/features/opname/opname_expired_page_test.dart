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
import 'package:onezentra_mobile/features/opname/models/opname_expired_models.dart';
import 'package:onezentra_mobile/features/opname/pages/opname_expired_page.dart';
import 'package:onezentra_mobile/features/opname/repositories/opname_expired_repository.dart';
import 'package:onezentra_mobile/shared/widgets/app_widgets.dart';

class _FakeOpnameExpiredRepository extends OpnameExpiredRepository {
  _FakeOpnameExpiredRepository({this.waves = const [], this.fail = false});

  final List<OpnameExpiredWave> waves;
  final bool fail;
  int listCalls = 0;
  String? lastStatus;
  String? lastWeekStart;
  int? lastPerPage;

  @override
  Future<OpnameExpiredList> list({
    String? weekStart,
    String? status,
    String? source,
    String? search,
    int page = 1,
    int perPage = 20,
  }) async {
    listCalls++;
    lastStatus = status;
    lastWeekStart = weekStart;
    lastPerPage = perPage;
    if (fail) {
      throw const ApiException(
        'Gagal memuat data expired. Silakan coba lagi.',
        0,
      );
    }

    // Ringkasan selalu dihitung dari seluruh wave minggu, bukan dari hasil
    // filter, agar chip tetap menunjukkan jumlah sebenarnya.
    var counts = <String, OpnameStatusCount>{};
    for (var wave in waves) {
      var existing = counts[wave.statusIni];
      counts[wave.statusIni] = OpnameStatusCount(
        status: wave.statusIni,
        count: (existing?.count ?? 0) + 1,
        qtyCrt: (existing?.qtyCrt ?? 0) + wave.effectiveCrt,
      );
    }

    var visible = status == null
        ? waves
        : waves.where((wave) => wave.statusIni == status).toList();

    return OpnameExpiredList(
      waves: visible,
      meta: OpnameExpiredMeta(
        weeks: const <String>[],
        thresholds: const <String, dynamic>{},
        statusSummary: OpnameStatusSummary(counts: counts),
        prevWeekStart: null,
        prevStatusSummary: const OpnameStatusSummary(
          counts: <String, OpnameStatusCount>{},
        ),
      ),
    );
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

const List<String> _opnamePermissions = ['opname.view'];

Map<String, dynamic> _loginBody({
  List<String> permissions = _opnamePermissions,
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
  List<String> permissions = _opnamePermissions,
}) async {
  var auth = AuthProvider(
    repository: _FakeAuthRepository(_loginBody(permissions: permissions)),
  );
  var ok = await auth.login(email: 'staff@onezentra.com', password: 'x');
  expect(ok, isTrue);
  return auth;
}

Future<void> _pumpOpnameExpiredPage(
  WidgetTester tester,
  AuthProvider auth,
  OpnameExpiredRepository repository,
) async {
  await tester.pumpWidget(
    ChangeNotifierProvider<AuthProvider>.value(
      value: auth,
      child: MaterialApp(
        theme: AppTheme.light,
        home: OpnameExpiredPage(repository: repository),
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

  testWidgets('tanpa opname.view hanya kartu izin, API tidak dipanggil', (
    tester,
  ) async {
    var repository = _FakeOpnameExpiredRepository();
    var auth = await _loginAuth(permissions: []);

    await _pumpOpnameExpiredPage(tester, auth, repository);

    expect(
      find.text('Anda tidak memiliki izin untuk melihat Opname Expired.'),
      findsOneWidget,
    );
    expect(repository.listCalls, 0);
  });

  testWidgets('menampilkan daftar barang expired', (tester) async {
    var repository = _FakeOpnameExpiredRepository(
      waves: [
        const OpnameExpiredWave(
          id: 12,
          weekStart: '2026-11-02',
          kodeDepo: 'DP01',
          namaDepo: 'Depo Utama',
          kodeBarang: 'BRG-1',
          namaBarang: 'Gula 50kg',
          sumberMaterial: 'SJ',
          tanggalPenerimaan: '2026-11-05',
          expiredDateIni: '2026-11-20',
          sisaHari: 14,
          statusIni: 'KRITIS',
          rekomendasi: 'SEGERA kirim/retur, sisa 14 hari.',
          qtyIniCrt: 12,
          qtyIniPcs: 34,
          sourceMix: <String, dynamic>{'sj': 1, 'import': 0, 'legacy': 0},
        ),
      ],
    );
    var auth = await _loginAuth();

    await _pumpOpnameExpiredPage(tester, auth, repository);

    expect(find.text('Opname Expired'), findsWidgets);
    // Status muncul tiga kali: tile ringkasan + chip filter + badge wave.
    expect(find.text('Kritis'), findsNWidgets(3));
    expect(find.text('Gula 50kg'), findsOneWidget);
    expect(find.text('BRG-1'), findsOneWidget);
    expect(find.text('Depo Utama'), findsOneWidget);
    expect(find.text('SJ (sistem)'), findsOneWidget);
    expect(find.text('CRT 12 / PCS 34'), findsOneWidget);
    expect(repository.listCalls, greaterThan(0));
    expect(repository.lastPerPage, 100);
  });

  testWidgets('EXPIRED memakai badge bahaya dan sisa hari lewat', (
    tester,
  ) async {
    var repository = _FakeOpnameExpiredRepository(
      waves: [
        const OpnameExpiredWave(
          id: 21,
          kodeDepo: 'DP02',
          namaDepo: 'Depo Bandung',
          kodeBarang: 'BRG-X',
          namaBarang: 'Susu UHT',
          sisaHari: -3,
          statusIni: 'EXPIRED',
          qtyIniCrt: 2,
          qtyIniPcs: 10,
        ),
      ],
    );
    var auth = await _loginAuth();

    await _pumpOpnameExpiredPage(tester, auth, repository);

    expect(find.text('Expired'), findsNWidgets(3));
    expect(find.text('Lewat 3 hari'), findsOneWidget);

    var badge = tester.widget<AppBadge>(
      find.byWidgetPredicate(
        (widget) => widget is AppBadge && widget.text == 'Expired',
      ),
    );
    expect(badge.variant, AppBadgeVariant.danger);

    // Risk-first: tile Expired berada sebelum Aman.
    var expiredY = tester.getTopLeft(find.text('Expired').first).dy;
    var amanY = tester.getTopLeft(find.text('Aman').first).dy;
    expect(expiredY, lessThan(amanY));
  });

  testWidgets('filter status memanggil API dan menyaring kartu', (
    tester,
  ) async {
    var repository = _FakeOpnameExpiredRepository(
      waves: [
        const OpnameExpiredWave(
          id: 31,
          kodeBarang: 'BRG-1',
          namaBarang: 'Gula 50kg',
          statusIni: 'KRITIS',
          sisaHari: 5,
        ),
        const OpnameExpiredWave(
          id: 32,
          kodeBarang: 'BRG-2',
          namaBarang: 'Telur 1kg',
          statusIni: 'AMAN',
          sisaHari: 120,
        ),
      ],
    );
    var auth = await _loginAuth();

    await _pumpOpnameExpiredPage(tester, auth, repository);

    await tester.tap(find.byKey(const ValueKey('opname-status-filter-KRITIS')));
    await tester.pumpAndSettle();

    expect(repository.lastStatus, 'KRITIS');
    expect(find.text('Gula 50kg'), findsOneWidget);
    expect(find.text('Telur 1kg'), findsNothing);
  });

  testWidgets('wave expired dikelompokkan per cluster otomatis', (
    tester,
  ) async {
    var repository = _FakeOpnameExpiredRepository(
      waves: [
        const OpnameExpiredWave(
          id: 12,
          principal1: 'BOSnet A',
          kodeBarang: 'BRG-1',
          namaBarang: 'Gula 50kg',
          sisaHari: 14,
          statusIni: 'KRITIS',
        ),
        const OpnameExpiredWave(
          id: 13,
          principal1: 'BOSnet B',
          kodeBarang: 'BRG-2',
          namaBarang: 'Telur 1kg',
          sisaHari: 3,
          statusIni: 'KRITIS',
        ),
      ],
    );
    var auth = await _loginAuth();

    await _pumpOpnameExpiredPage(tester, auth, repository);

    expect(find.text('BOSnet A'), findsOneWidget);
    expect(find.text('BOSnet B'), findsOneWidget);
  });

  testWidgets('tanpa data expired menampilkan empty state', (tester) async {
    var repository = _FakeOpnameExpiredRepository();
    var auth = await _loginAuth();

    await _pumpOpnameExpiredPage(tester, auth, repository);

    expect(find.text('Belum ada data expired'), findsOneWidget);
  });

  testWidgets('kesalahan memuat menampilkan error dengan retry', (
    tester,
  ) async {
    var repository = _FakeOpnameExpiredRepository(fail: true);
    var auth = await _loginAuth();

    await _pumpOpnameExpiredPage(tester, auth, repository);

    expect(
      find.text('Gagal memuat data expired. Silakan coba lagi.'),
      findsOneWidget,
    );
  });
}
