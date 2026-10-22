import 'dart:async';

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
import 'package:onezentra_mobile/features/gate/models/gate_models.dart';
import 'package:onezentra_mobile/features/gate/pages/gate_page.dart';
import 'package:onezentra_mobile/features/gate/repositories/gate_repository.dart';
import 'package:onezentra_mobile/features/validation/models/validation_models.dart';
import 'package:onezentra_mobile/features/validation/repositories/validation_repository.dart';
import 'package:onezentra_mobile/main.dart';
import 'package:onezentra_mobile/shared/widgets/app_widgets.dart';

/// Repository that answers from canned data so the Check In Point flow can be
/// exercised without a running API.
class _FakeGateRepository extends GateRepository {
  _FakeGateRepository({
    this.transactions = const [],
    this.cannedStats = const GateStats(),
    this.lookupResult,
    this.lookupError,
  });
  final List<GateTransaction> transactions;
  final GateStats cannedStats;
  final RencanaKirim? lookupResult;
  final Object? lookupError;

  final List<String> recordCalls = [];
  int listCalls = 0;
  int statsCalls = 0;
  int lookupCalls = 0;

  @override
  Future<GateTransactionPage> list({
    String? search,
    int page = 1,
    int perPage = 20,
  }) async {
    listCalls++;
    return GateTransactionPage(
      items: transactions,
      currentPage: page,
      lastPage: 1,
      total: transactions.length,
    );
  }

  @override
  Future<GateStats> stats() async {
    statsCalls++;
    return cannedStats;
  }

  @override
  Future<RencanaKirim> findByNoDokumen(String nomor) async {
    lookupCalls++;
    var error = lookupError;
    if (error != null) {
      throw error;
    }
    return lookupResult!;
  }

  @override
  Future<GateTransaction> record({
    required RencanaKirim rencanaKirim,
    required String gateType,
  }) async {
    recordCalls.add(gateType);
    return GateTransaction(
      id: recordCalls.length,
      rencanaKirimId: rencanaKirim.id ?? 0,
      gateType: gateType,
      nopol: rencanaKirim.nopol,
      driverName: rencanaKirim.driverName,
      poTransporter: rencanaKirim.poTransporter,
      status: 'COMPLETED',
      scanTime: DateTime(2026, 1, 15, 9, 30),
      rencanaKirim: rencanaKirim,
    );
  }

  @override
  Future<String> verify(int rencanaKirimId) async => 'VERIFIED';
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

/// Validation repository answering a canned session, so the Gate IN →
/// Validasi handoff can be exercised end to end without a server.
class _FakeValidationRepository extends ValidationRepository {
  _FakeValidationRepository(this.session);
  final SjValidation session;

  int startCalls = 0;

  @override
  Future<ValidationHistoryPage> list({
    String? search,
    int page = 1,
    int perPage = 20,
  }) async => const ValidationHistoryPage(
    items: [],
    currentPage: 1,
    lastPage: 1,
    total: 0,
  );

  @override
  Future<ValidationStats> stats() async => const ValidationStats();

  @override
  Future<SjValidation> startByCode(String scanCode) async {
    startCalls++;
    return session;
  }

  @override
  Future<SjValidation> show(int id) async => session;
}

const _handedOffSession = SjValidation(
  id: 9,
  scanCode: 'PO-042',
  document: ValidationDocument(
    id: 11,
    poTransporter: 'PO-042',
    nopol: 'B 9999 ZZ',
    driverName: 'Andi',
    status: 'CHECKED_IN',
  ),
  items: [
    SjValidationItem(
      id: 31,
      validationId: 9,
      kodeBarang: 'BRG-1',
      namaBarang: 'Gula 50kg',
      expectedQty: 100,
      satuan: 'zak',
    ),
  ],
);

const List<String> _fullGatePermissions = [
  'gate.view',
  'gate.create',
  'rencana_kirim.edit',
];

Map<String, dynamic> _loginBody({
  List<String> permissions = _fullGatePermissions,
}) => {
  'message': 'Login successful',
  'token': 'token-abc',
  'token_type': 'Bearer',
  'expires_at': '2030-01-01T00:00:00.000Z',
  'user': {
    'id': 7,
    'full_name': 'Gate Officer',
    'email': 'gate@onezentra.com',
    'level': 'operator',
    'status': 'active',
    'created_at': '2026-01-01T00:00:00.000Z',
    'updated_at': '2026-01-01T00:00:00.000Z',
    'roles': [],
  },
  'permissions': permissions,
};

Future<AuthProvider> _loginAuth({
  List<String> permissions = _fullGatePermissions,
}) async {
  var auth = AuthProvider(
    repository: _FakeAuthRepository(_loginBody(permissions: permissions)),
  );
  var ok = await auth.login(email: 'gate@onezentra.com', password: 'x');
  expect(ok, isTrue);
  return auth;
}

/// Pumps the screen under an authenticated [AuthProvider] and lets the
/// post-frame bootstrap plus the fake repository futures settle.
Future<void> _pumpGatePage(
  WidgetTester tester,
  AuthProvider auth,
  GateRepository repository, {
  Future<String?> Function()? openScanner,
}) async {
  await tester.pumpWidget(
    ChangeNotifierProvider<AuthProvider>.value(
      value: auth,
      child: MaterialApp(
        theme: AppTheme.dark,
        home: GatePage(repository: repository, openScanner: openScanner),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

RencanaKirim _lookupDocument({String status = 'SCHEDULED'}) => RencanaKirim(
  id: 11,
  poTransporter: 'PO-042',
  nopol: 'B 9999 ZZ',
  driverName: 'Andi',
  status: status,
  itemCount: 3,
);

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    FlutterSecureStorage.setMockInitialValues({});
  });

  testWidgets('tanpa gate.view hanya kartu izin, API tidak dipanggil', (
    tester,
  ) async {
    var repository = _FakeGateRepository();
    var auth = await _loginAuth(permissions: []);

    await _pumpGatePage(tester, auth, repository);

    expect(
      find.text('Anda tidak memiliki izin untuk melihat Check In Point.'),
      findsOneWidget,
    );
    expect(find.text('Quick Scan'), findsNothing);
    expect(repository.listCalls, 0);
    expect(repository.statsCalls, 0);
  });

  testWidgets('menampilkan statistik tanpa memuat riwayat', (tester) async {
    var repository = _FakeGateRepository(
      transactions: [
        GateTransaction(
          id: 1,
          rencanaKirimId: 11,
          gateType: 'INBOUND',
          nopol: 'B 1234 XY',
          driverName: 'Budi',
          poTransporter: 'PO-TEST-001',
          scanTime: DateTime(2026, 1, 15, 8, 30, 5),
          rencanaKirim: const RencanaKirim(
            id: 11,
            poTransporter: 'PO-TEST-001',
            nopol: 'B 1234 XY',
            driverName: 'Budi',
            status: 'CHECKED_IN',
          ),
        ),
      ],
      cannedStats: const GateStats(
        total: 5,
        hariIni: 2,
        terjadwal: 3,
        selesai: 4,
      ),
    );
    var auth = await _loginAuth();

    await _pumpGatePage(tester, auth, repository);

    // Halaman Check In Point hanya Scan: statistik + form, tanpa daftar
    // transaksi maupun pintasan riwayat (pindah ke menu Riwayat Gate).
    expect(find.text('Check In Point'), findsWidgets);
    expect(find.text('Quick Scan'), findsOneWidget);
    expect(find.text('Hari ini'), findsOneWidget);
    expect(find.text('Riwayat Gate'), findsNothing);
    expect(find.text('PO-TEST-001'), findsNothing);
    expect(find.text('1 transaksi tercatat'), findsNothing);
    expect(repository.statsCalls, greaterThan(0));
    expect(repository.listCalls, 0);
  });

  testWidgets('layout HP sempit menumpuk form scan', (tester) async {
    var repository = _FakeGateRepository();
    var auth = await _loginAuth();

    tester.view.physicalSize = const Size(360, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    await _pumpGatePage(tester, auth, repository);

    expect(tester.takeException(), isNull);

    expect(find.byKey(const ValueKey('gate-quick-scan')), findsOneWidget);
    expect(find.byKey(const ValueKey('gate-history-teaser')), findsNothing);
    expect(find.byKey(const ValueKey('gate-guide-card')), findsNothing);

    var field = tester.getRect(find.byType(TextFormField).first);
    var search = tester.getRect(find.widgetWithText(AppPrimaryButton, 'Cari'));
    expect(search.top, greaterThan(field.bottom));
  });

  testWidgets('layout tablet memakai dua kolom dan form sejajar', (
    tester,
  ) async {
    var repository = _FakeGateRepository();
    var auth = await _loginAuth();

    tester.view.physicalSize = const Size(1024, 768);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    await _pumpGatePage(tester, auth, repository);

    expect(tester.takeException(), isNull);

    var quickScan = tester.getRect(
      find.byKey(const ValueKey('gate-quick-scan')),
    );
    var guide = tester.getRect(find.byKey(const ValueKey('gate-guide-card')));
    expect(guide.left, greaterThan(quickScan.right));
    expect(guide.top, closeTo(quickScan.top, 0.1));
    expect(find.byKey(const ValueKey('gate-history-teaser')), findsNothing);

    var field = tester.getRect(find.byType(TextFormField).first);
    var search = tester.getRect(find.widgetWithText(AppPrimaryButton, 'Cari'));
    expect(search.left, greaterThan(field.right));
  });

  testWidgets('text scale 2x tetap aman di HP sempit', (tester) async {
    var repository = _FakeGateRepository(lookupResult: _lookupDocument());
    var auth = await _loginAuth();

    tester.view.physicalSize = const Size(320, 700);
    tester.view.devicePixelRatio = 1;
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(tester.view.reset);
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);

    await _pumpGatePage(tester, auth, repository);

    await tester.enterText(find.byType(TextFormField).first, 'PO-042');
    var search = find.widgetWithText(AppPrimaryButton, 'Cari');
    await tester.ensureVisible(search);
    await tester.tap(search);
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(find.text('DOKUMEN DITEMUKAN'), findsOneWidget);
    expect(find.text('Gate IN →'), findsOneWidget);
  });

  testWidgets('menu Riwayat Gate di home membuka halaman riwayat', (
    tester,
  ) async {
    var repository = _FakeGateRepository();
    var auth = await _loginAuth();
    var router = buildRouter(auth, gateRepository: repository);

    await tester.pumpWidget(OneZentraApp(authProvider: auth, router: router));
    await tester.pumpAndSettle();

    var menu = find.text('Riwayat Gate');
    expect(menu, findsOneWidget);
    await tester.ensureVisible(menu);
    await tester.tap(menu);
    await tester.pumpAndSettle();

    expect(find.text('Pencarian'), findsOneWidget);
    expect(find.text('Transaksi'), findsOneWidget);
  });

  testWidgets('lookup → Gate IN → konfirmasi → transaksi tercatat', (
    tester,
  ) async {
    var repository = _FakeGateRepository(lookupResult: _lookupDocument());
    var auth = await _loginAuth();

    await _pumpGatePage(tester, auth, repository);

    await tester.enterText(find.byType(TextFormField).first, 'PO-042');
    await tester.tap(find.widgetWithText(AppPrimaryButton, 'Cari'));
    await tester.pumpAndSettle();

    expect(find.text('DOKUMEN DITEMUKAN'), findsOneWidget);
    var gateInButton = find.widgetWithText(FilledButton, 'Gate IN →');
    expect(gateInButton, findsOneWidget);

    await tester.ensureVisible(gateInButton);
    await tester.tap(gateInButton);
    await tester.pumpAndSettle();

    expect(find.text('Catat Gate IN?'), findsOneWidget);
    expect(
      find.text('Gate IN tercatat → status dokumen menjadi Check In.'),
      findsOneWidget,
    );
    await tester.tap(find.widgetWithText(FilledButton, 'Ya, Catat IN'));
    await tester.pumpAndSettle();

    expect(repository.recordCalls, ['INBOUND']);
    expect(find.textContaining('Gate IN berhasil dicatat'), findsOneWidget);
    expect(find.text('DOKUMEN DITEMUKAN'), findsNothing);
  });

  testWidgets('lookup yang tidak ditemukan menampilkan pesan server', (
    tester,
  ) async {
    var repository = _FakeGateRepository(
      lookupError: const ApiException('Rencana kirim tidak ditemukan.', 404),
    );
    var auth = await _loginAuth();

    await _pumpGatePage(tester, auth, repository);

    await tester.enterText(find.byType(TextFormField).first, 'PO-TIDAK-ADA');
    await tester.tap(find.widgetWithText(AppPrimaryButton, 'Cari'));
    await tester.pumpAndSettle();

    expect(
      find.textContaining('Rencana kirim tidak ditemukan'),
      findsOneWidget,
    );
    expect(find.text('DOKUMEN DITEMUKAN'), findsNothing);
  });

  testWidgets('status tanpa aksi gate menampilkan panduan, bukan tombol', (
    tester,
  ) async {
    var repository = _FakeGateRepository(
      lookupResult: _lookupDocument(status: 'VERIFIED'),
    );
    var auth = await _loginAuth();

    await _pumpGatePage(tester, auth, repository);

    await tester.enterText(find.byType(TextFormField).first, 'PO-042');
    await tester.tap(find.widgetWithText(AppPrimaryButton, 'Cari'));
    await tester.pumpAndSettle();

    expect(find.textContaining('menunggu proses bongkar'), findsOneWidget);
    expect(find.text('Gate IN →'), findsNothing);
    expect(find.text('Verifikasi ✓'), findsNothing);
    expect(find.text('Gate OUT'), findsNothing);
  });

  testWidgets('tanpa gate.create tombol Gate IN diganti peringatan izin', (
    tester,
  ) async {
    var repository = _FakeGateRepository(lookupResult: _lookupDocument());
    var auth = await _loginAuth(permissions: ['gate.view']);

    await _pumpGatePage(tester, auth, repository);

    await tester.enterText(find.byType(TextFormField).first, 'PO-042');
    await tester.tap(find.widgetWithText(AppPrimaryButton, 'Cari'));
    await tester.pumpAndSettle();

    expect(find.text('DOKUMEN DITEMUKAN'), findsOneWidget);
    expect(find.text('Gate IN →'), findsNothing);
    expect(find.textContaining('izin gate.create'), findsOneWidget);
  });

  testWidgets('tombol kamera mengisi hasil pindai lalu lookup otomatis', (
    tester,
  ) async {
    var repository = _FakeGateRepository(lookupResult: _lookupDocument());
    var auth = await _loginAuth();

    await _pumpGatePage(
      tester,
      auth,
      repository,
      openScanner: () async => 'PO-042',
    );

    await tester.tap(find.byIcon(Icons.photo_camera_rounded));
    await tester.pumpAndSettle();

    expect(repository.lookupCalls, 1);
    var field = tester.widget<TextFormField>(find.byType(TextFormField).first);
    expect(field.controller?.text, 'PO-042');
    expect(find.text('DOKUMEN DITEMUKAN'), findsOneWidget);
    expect(find.text('Gate IN →'), findsOneWidget);
  });

  testWidgets('membatalkan pindai kamera tidak menjalankan lookup', (
    tester,
  ) async {
    var repository = _FakeGateRepository(lookupResult: _lookupDocument());
    var auth = await _loginAuth();

    await _pumpGatePage(
      tester,
      auth,
      repository,
      openScanner: () async => null,
    );

    await tester.tap(find.byIcon(Icons.photo_camera_rounded));
    await tester.pumpAndSettle();

    expect(repository.lookupCalls, 0);
    var field = tester.widget<TextFormField>(find.byType(TextFormField).first);
    expect(field.controller?.text, isEmpty);
    expect(find.text('DOKUMEN DITEMUKAN'), findsNothing);
  });

  testWidgets('route /gate membuka halaman dan kembali ke home', (
    tester,
  ) async {
    var repository = _FakeGateRepository();
    var auth = await _loginAuth();
    var router = buildRouter(auth, gateRepository: repository);

    await tester.pumpWidget(OneZentraApp(authProvider: auth, router: router));
    await tester.pumpAndSettle();

    unawaited(router.push('/gate'));
    await tester.pumpAndSettle();

    // Halaman Check In Point yang tampil.
    expect(find.text('Quick Scan'), findsOneWidget);

    // Kembali ke daftar menu utama.
    router.pop();
    await tester.pumpAndSettle();

    expect(find.text('Quick Scan'), findsNothing);
    expect(find.text('Pilih pekerjaan'), findsOneWidget);
  });

  testWidgets('Gate IN → lanjut validasi membawa PO otomatis', (tester) async {
    var gateRepository = _FakeGateRepository(lookupResult: _lookupDocument());
    var validationRepository = _FakeValidationRepository(_handedOffSession);
    var auth = await _loginAuth(
      permissions: [
        ..._fullGatePermissions,
        'sj_validation.view',
        'sj_validation.create',
        'sj_validation.validate',
      ],
    );
    var router = buildRouter(
      auth,
      gateRepository: gateRepository,
      validationRepository: validationRepository,
    );

    await tester.pumpWidget(OneZentraApp(authProvider: auth, router: router));
    await tester.pumpAndSettle();

    unawaited(router.push('/gate'));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextFormField).first, 'PO-042');
    await tester.tap(find.widgetWithText(AppPrimaryButton, 'Cari'));
    await tester.pumpAndSettle();

    var gateInButton = find.widgetWithText(FilledButton, 'Gate IN →');
    await tester.ensureVisible(gateInButton);
    await tester.tap(gateInButton);
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Ya, Catat IN'));
    await tester.pumpAndSettle();

    // Handoff appears without retyping the PO…
    var handoff = find.widgetWithText(
      AppPrimaryButton,
      'Lanjut validasi PO-042',
    );
    expect(handoff, findsOneWidget);
    await tester.ensureVisible(handoff);
    await tester.tap(handoff);
    await tester.pumpAndSettle();

    // …and the validation session opens by itself.
    expect(validationRepository.startCalls, 1);
    expect(find.textContaining('SESI BERJALAN'), findsOneWidget);
    expect(find.text('Gula 50kg'), findsOneWidget);
  });

  testWidgets('aksi Gate IN dan dialog tetap kontras di tema gelap', (
    tester,
  ) async {
    var repository = _FakeGateRepository(lookupResult: _lookupDocument());
    var auth = await _loginAuth();

    await _pumpGatePage(tester, auth, repository);

    await tester.enterText(find.byType(TextFormField).first, 'PO-042');
    await tester.tap(find.widgetWithText(AppPrimaryButton, 'Cari'));
    await tester.pumpAndSettle();

    var action = tester.widget<FilledButton>(
      find.widgetWithText(FilledButton, 'Gate IN →'),
    );
    expect(action.style?.backgroundColor?.resolve({}), Colors.white);
    expect(action.style?.foregroundColor?.resolve({}), AppTheme.ink900);

    var gateIn = find.widgetWithText(FilledButton, 'Gate IN →');
    await tester.ensureVisible(gateIn);
    await tester.tap(gateIn);
    await tester.pumpAndSettle();

    var confirm = tester.widget<FilledButton>(
      find.widgetWithText(FilledButton, 'Ya, Catat IN'),
    );
    expect(confirm.style?.backgroundColor?.resolve({}), AppTheme.primary600);
  });

  testWidgets('banner gagal memakai warna bahaya yang terbaca di tema gelap', (
    tester,
  ) async {
    var repository = _FakeGateRepository(
      lookupError: const ApiException('Rencana kirim tidak ditemukan.', 404),
    );
    var auth = await _loginAuth();

    await _pumpGatePage(tester, auth, repository);

    await tester.enterText(find.byType(TextFormField).first, 'PO-TIDAK-ADA');
    await tester.tap(find.widgetWithText(AppPrimaryButton, 'Cari'));
    await tester.pumpAndSettle();

    var banner = find.byWidgetPredicate(
      (widget) =>
          widget is Container &&
          widget.decoration is BoxDecoration &&
          (widget.decoration! as BoxDecoration).color == AppTheme.dangerWell,
    );
    expect(banner, findsOneWidget);
  });
}
