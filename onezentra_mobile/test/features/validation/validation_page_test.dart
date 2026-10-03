import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:onezentra_mobile/core/theme/app_theme.dart';
import 'package:onezentra_mobile/features/auth/models/auth_models.dart';
import 'package:onezentra_mobile/features/auth/providers/auth_provider.dart';
import 'package:onezentra_mobile/features/auth/repositories/auth_repository.dart';
import 'package:onezentra_mobile/features/validation/models/validation_models.dart';
import 'package:onezentra_mobile/features/validation/pages/validation_page.dart';
import 'package:onezentra_mobile/features/validation/repositories/validation_repository.dart';
import 'package:onezentra_mobile/shared/widgets/app_widgets.dart';

/// Repository that answers from canned sessions so the Validasi SJ flow can
/// be exercised without a running API.
class _FakeValidationRepository extends ValidationRepository {
  _FakeValidationRepository({
    this.history = const [],
    this.cannedStats = const ValidationStats(),
    this.sessionToOpen,
  });

  final List<SjValidation> history;
  final ValidationStats cannedStats;
  final SjValidation? sessionToOpen;

  int listCalls = 0;
  int statsCalls = 0;
  int startCalls = 0;
  int completeCalls = 0;
  int cancelCalls = 0;
  int scanCalls = 0;
  int standarisasiCalls = 0;
  String? lastScanCode;
  double? lastActualQty;
  String? lastCondition;
  int? lastNpnId;
  int? lastTier;
  int? lastTinggi;

  SjValidation _session() => sessionToOpen!;

  @override
  Future<ValidationHistoryPage> list({
    String? search,
    int page = 1,
    int perPage = 20,
  }) async {
    listCalls++;
    return ValidationHistoryPage(
      items: history,
      currentPage: page,
      lastPage: 1,
      total: history.length,
    );
  }

  @override
  Future<ValidationStats> stats() async {
    statsCalls++;
    return cannedStats;
  }

  @override
  Future<SjValidation> startByCode(String scanCode) async {
    startCalls++;
    lastScanCode = scanCode.trim();
    return _session();
  }

  @override
  Future<SjValidation> show(int id) async => _session();

  @override
  Future<SjValidationItem> scanItem({
    required int validationId,
    required int itemId,
    required double actualQty,
    String? barcode,
    String condition = 'FISIK_BAGUS',
    String? expiredDate,
    String? notes,
    int? tier,
    int? tinggiTumpukan,
  }) async {
    scanCalls++;
    lastActualQty = actualQty;
    lastCondition = condition;
    var current = _session()
        .items
        .firstWhere((item) => item.id == itemId, orElse: () => _session().items.first);
    return SjValidationItem(
      id: current.id,
      validationId: current.validationId,
      kodeBarang: current.kodeBarang,
      namaBarang: current.namaBarang,
      expectedQty: current.expectedQty,
      actualQty: actualQty,
      satuan: current.satuan,
      condition: condition,
      status: actualQty == current.expectedQty ? 'VALIDATED' : 'MISMATCH',
    );
  }

  @override
  Future<SjValidation> complete(int id) async {
    completeCalls++;
    return _session();
  }

  @override
  Future<void> cancel(int id) async {
    cancelCalls++;
  }

  @override
  Future<void> createStandarisasi({
    required int npnId,
    required int tier,
    required int tinggiTumpukan,
  }) async {
    standarisasiCalls++;
    lastNpnId = npnId;
    lastTier = tier;
    lastTinggi = tinggiTumpukan;
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

const List<String> _fullValidationPermissions = [
  'sj_validation.view',
  'sj_validation.create',
  'sj_validation.validate',
  'sj_validation.complete',
  'standarisasi.create',
];

Map<String, dynamic> _loginBody({
  List<String> permissions = _fullValidationPermissions,
}) => {
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
  'permissions': permissions,
};

Future<AuthProvider> _loginAuth({
  List<String> permissions = _fullValidationPermissions,
}) async {
  var auth = AuthProvider(
    repository: _FakeAuthRepository(_loginBody(permissions: permissions)),
  );
  var ok = await auth.login(email: 'cheker@onezentra.com', password: 'x');
  expect(ok, isTrue);
  return auth;
}

/// Pumps the screen under an authenticated [AuthProvider] and lets the
/// post-frame bootstrap plus the fake repository futures settle.
Future<void> _pumpValidationPage(
  WidgetTester tester,
  AuthProvider auth,
  ValidationRepository repository, {
  Future<String?> Function()? openScanner,
}) async {
  await tester.pumpWidget(
    ChangeNotifierProvider<AuthProvider>.value(
      value: auth,
      child: MaterialApp(
        theme: AppTheme.light,
        home: ValidationPage(
          repository: repository,
          openScanner: openScanner,
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

SjValidation _openSession() => const SjValidation(
  id: 9,
  rencanaKirimId: 11,
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
      npnId: 501,
      kodeBarang: 'BRG-1',
      namaBarang: 'Gula 50kg',
      expectedQty: 100,
      satuan: 'zak',
      standarisasi: ItemStandarisasi(
        tier: 4,
        tinggiTumpukan: 6,
        status: 'approved',
      ),
    ),
    SjValidationItem(
      id: 32,
      validationId: 9,
      npnId: 502,
      kodeBarang: 'BRG-2',
      namaBarang: 'Terigu 25kg',
      expectedQty: 50,
      actualQty: 50,
      satuan: 'zak',
      status: 'VALIDATED',
      standarisasi: ItemStandarisasi(
        tier: 3,
        tinggiTumpukan: 5,
        status: 'approved',
      ),
    ),
  ],
);

/// Session whose pending line has no standarisasi yet — the line stays
/// locked until the operator submits tier × tinggi.
SjValidation _lockedSession() => const SjValidation(
  id: 9,
  rencanaKirimId: 11,
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
      npnId: 501,
      kodeBarang: 'BRG-1',
      namaBarang: 'Gula 50kg',
      expectedQty: 100,
      satuan: 'zak',
    ),
  ],
);

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    FlutterSecureStorage.setMockInitialValues({});
  });

  testWidgets('tanpa sj_validation.view hanya kartu izin, API tidak dipanggil', (
    tester,
  ) async {
    var repository = _FakeValidationRepository();
    var auth = await _loginAuth(permissions: []);

    await _pumpValidationPage(tester, auth, repository);

    expect(
      find.text('Anda tidak memiliki izin untuk melihat Validasi SJ.'),
      findsOneWidget,
    );
    expect(find.text('Scan Dokumen'), findsNothing);
    expect(repository.listCalls, 0);
    expect(repository.statsCalls, 0);
  });

  testWidgets('menampilkan statistik dan riwayat validasi', (tester) async {
    var repository = _FakeValidationRepository(
      history: [_openSession()],
      cannedStats: const ValidationStats(
        total: 5,
        hariIni: 2,
        berjalan: 3,
        selesai: 4,
      ),
    );
    var auth = await _loginAuth();

    await _pumpValidationPage(tester, auth, repository);

    expect(find.text('Validasi SJ'), findsWidgets);
    expect(find.text('Scan Dokumen'), findsOneWidget);
    // Twice: the header chip plus the IN_PROGRESS badge of the history row.
    expect(find.text('Berjalan'), findsNWidgets(2));
    expect(find.text('1 sesi tercatat'), findsOneWidget);
    expect(find.text('PO-042'), findsWidgets);
    expect(repository.listCalls, greaterThan(0));
    expect(repository.statsCalls, greaterThan(0));
  });

  testWidgets('scan PO → sesi terbuka dengan daftar item', (tester) async {
    var repository = _FakeValidationRepository(sessionToOpen: _openSession());
    var auth = await _loginAuth();

    await _pumpValidationPage(
      tester,
      auth,
      repository,
      openScanner: () async => 'PO-042',
    );

    // Via kamera: hasil pindai langsung membuka sesi.
    await tester.tap(find.byIcon(Icons.photo_camera_rounded));
    await tester.pumpAndSettle();

    expect(repository.startCalls, 1);
    expect(repository.lastScanCode, 'PO-042');
    expect(find.textContaining('SESI BERJALAN'), findsOneWidget);
    expect(find.text('Gula 50kg'), findsOneWidget);
    expect(find.text('Terigu 25kg'), findsOneWidget);
  });

  testWidgets('validasi item via bottom sheet menyimpan qty', (tester) async {
    var repository = _FakeValidationRepository(sessionToOpen: _openSession());
    var auth = await _loginAuth();

    await _pumpValidationPage(tester, auth, repository);

    await tester.enterText(find.byType(TextFormField).first, 'PO-042');
    await tester.tap(find.widgetWithText(AppPrimaryButton, 'Mulai'));
    await tester.pumpAndSettle();
    expect(find.text('Gula 50kg'), findsOneWidget);

    await tester.ensureVisible(find.text('Gula 50kg'));
    await tester.tap(find.text('Gula 50kg'));
    await tester.pumpAndSettle();
    expect(find.text('Simpan Validasi'), findsOneWidget);

    var saveButton = find.widgetWithText(
      AppPrimaryButton,
      'Simpan Validasi',
    );
    await tester.ensureVisible(saveButton);
    await tester.tap(saveButton);
    await tester.pumpAndSettle();

    expect(repository.scanCalls, 1);
    expect(repository.lastActualQty, 100);
    expect(repository.lastCondition, 'FISIK_BAGUS');
  });

  testWidgets('tombol Sesuai memvalidasi satu ketuk tanpa sheet', (
    tester,
  ) async {
    var repository = _FakeValidationRepository(sessionToOpen: _openSession());
    var auth = await _loginAuth();

    await _pumpValidationPage(tester, auth, repository);

    await tester.enterText(find.byType(TextFormField).first, 'PO-042');
    await tester.tap(find.widgetWithText(AppPrimaryButton, 'Mulai'));
    await tester.pumpAndSettle();

    var quickButton = find.widgetWithText(FilledButton, 'Sesuai');
    expect(quickButton, findsOneWidget);
    await tester.ensureVisible(quickButton);
    await tester.tap(quickButton);
    await tester.pumpAndSettle();

    // Sheet never opened, line validated with expected qty as-is.
    expect(find.text('Simpan Validasi'), findsNothing);
    expect(repository.scanCalls, 1);
    expect(repository.lastActualQty, 100);
    expect(repository.lastCondition, 'FISIK_BAGUS');
  });

  testWidgets('tombol Selesaikan nonaktif selama ada item pending', (
    tester,
  ) async {
    var repository = _FakeValidationRepository(sessionToOpen: _openSession());
    var auth = await _loginAuth();

    await _pumpValidationPage(tester, auth, repository);

    await tester.enterText(find.byType(TextFormField).first, 'PO-042');
    await tester.tap(find.widgetWithText(AppPrimaryButton, 'Mulai'));
    await tester.pumpAndSettle();

    // One of two lines still pending: the button shows the remainder and
    // refuses the tap instead of failing on the server.
    expect(
      find.text('Selesaikan (1 item tersisa)'),
      findsOneWidget,
    );
    expect(
      find.text('Validasi dulu 1 item di atas — tombol aktif otomatis.'),
      findsOneWidget,
    );
    expect(repository.completeCalls, 0);
  });

  testWidgets('selesaikan sesi → konfirmasi → complete dipanggil', (
    tester,
  ) async {
    // All lines validated: otherwise the button stays disabled by design.
    const readySession = SjValidation(
      id: 9,
      scanCode: 'PO-042',
      status: 'IN_PROGRESS',
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
          npnId: 501,
          kodeBarang: 'BRG-1',
          namaBarang: 'Gula 50kg',
          expectedQty: 100,
          actualQty: 100,
          satuan: 'zak',
          status: 'VALIDATED',
          standarisasi: ItemStandarisasi(
            tier: 4,
            tinggiTumpukan: 6,
            status: 'approved',
          ),
        ),
      ],
    );
    var repository = _FakeValidationRepository(sessionToOpen: readySession);
    var auth = await _loginAuth();

    await _pumpValidationPage(tester, auth, repository);

    await tester.enterText(find.byType(TextFormField).first, 'PO-042');
    await tester.tap(find.widgetWithText(AppPrimaryButton, 'Mulai'));
    await tester.pumpAndSettle();

    var completeButton = find.widgetWithText(
      FilledButton,
      'Selesaikan Validasi ✓',
    );
    expect(completeButton, findsOneWidget);
    await tester.ensureVisible(completeButton);
    await tester.tap(completeButton);
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(FilledButton, 'Ya, Selesaikan'));
    await tester.pumpAndSettle();

    expect(repository.completeCalls, 1);
  });

  testWidgets('item tanpa standarisasi terkunci + banner tampil', (
    tester,
  ) async {
    var repository = _FakeValidationRepository(
      sessionToOpen: _lockedSession(),
    );
    var auth = await _loginAuth();

    await _pumpValidationPage(tester, auth, repository);

    await tester.enterText(find.byType(TextFormField).first, 'PO-042');
    await tester.tap(find.widgetWithText(AppPrimaryButton, 'Mulai'));
    await tester.pumpAndSettle();

    // Amber banner explains the lock, like the web page.
    expect(
      find.text('Standarisasi Tumpukan Belum Disetujui'),
      findsOneWidget,
    );
    expect(
      find.text('Butuh input standarisasi tumpukan'),
      findsOneWidget,
    );
    // No green fast path while locked — the amber shortcut instead.
    expect(find.widgetWithText(FilledButton, 'Sesuai'), findsNothing);
    expect(
      find.widgetWithText(FilledButton, 'Standarisasi'),
      findsOneWidget,
    );
  });

  testWidgets('input standarisasi terkirim tier × tinggi lalu menunggu BLC', (
    tester,
  ) async {
    var repository = _FakeValidationRepository(
      sessionToOpen: _lockedSession(),
    );
    var auth = await _loginAuth();

    await _pumpValidationPage(tester, auth, repository);

    await tester.enterText(find.byType(TextFormField).first, 'PO-042');
    await tester.tap(find.widgetWithText(AppPrimaryButton, 'Mulai'));
    await tester.pumpAndSettle();

    var shortcut = find.widgetWithText(FilledButton, 'Standarisasi');
    await tester.ensureVisible(shortcut);
    await tester.tap(shortcut);
    await tester.pumpAndSettle();

    expect(find.text('Standarisasi Tumpukan'), findsWidgets);
    expect(find.text('Simpan Validasi'), findsNothing);

    Future<void> enterSheetField(String key, String value) =>
        tester.enterText(
          find.descendant(
            of: find.byKey(ValueKey(key)),
            matching: find.byType(TextFormField),
          ),
          value,
        );
    await enterSheetField('standarisasi_tier', '4');
    await enterSheetField('standarisasi_tinggi', '6');
    var saveButton = find.widgetWithText(
      AppPrimaryButton,
      'Kirim untuk Approve BLC',
    );
    await tester.ensureVisible(saveButton);
    await tester.tap(saveButton);
    await tester.pumpAndSettle();

    expect(repository.standarisasiCalls, 1);
    expect(repository.lastNpnId, 501);
    expect(repository.lastTier, 4);
    expect(repository.lastTinggi, 6);
    expect(repository.scanCalls, 0);
    expect(
      find.textContaining('dikirim untuk approve BLC'),
      findsWidgets,
    );
  });

  testWidgets('dialog selesai merangkum selisih + info email', (
    tester,
  ) async {
    const mismatchSession = SjValidation(
      id: 9,
      scanCode: 'PO-042',
      status: 'IN_PROGRESS',
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
          npnId: 501,
          kodeBarang: 'BRG-1',
          namaBarang: 'Gula 50kg',
          expectedQty: 100,
          actualQty: 95,
          satuan: 'zak',
          condition: 'QTY_KURANG',
          status: 'MISMATCH',
          standarisasi: ItemStandarisasi(
            tier: 4,
            tinggiTumpukan: 6,
            status: 'approved',
          ),
        ),
      ],
    );
    var repository = _FakeValidationRepository(
      sessionToOpen: mismatchSession,
    );
    var auth = await _loginAuth();

    await _pumpValidationPage(tester, auth, repository);

    await tester.enterText(find.byType(TextFormField).first, 'PO-042');
    await tester.tap(find.widgetWithText(AppPrimaryButton, 'Mulai'));
    await tester.pumpAndSettle();

    // Tile tells the same story as the email: signed selisih + reason.
    expect(find.text('Selisih -5 • Qty kurang dari rencana'), findsOneWidget);

    var completeButton = find.widgetWithText(
      FilledButton,
      'Selesaikan Validasi ✓',
    );
    await tester.ensureVisible(completeButton);
    await tester.tap(completeButton);
    await tester.pumpAndSettle();

    // Dialog summarizes the mismatch and states which emails fire.
    expect(
      find.text(
        '1 item selisih (-5): email selisih terkirim ke penerima terdaftar.',
      ),
      findsOneWidget,
    );
    expect(find.text('Email validasi terkirim ke BLC.'), findsOneWidget);
  });
}
