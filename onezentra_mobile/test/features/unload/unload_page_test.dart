import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:onezentra_mobile/core/theme/app_theme.dart';
import 'package:onezentra_mobile/features/auth/models/auth_models.dart';
import 'package:onezentra_mobile/features/auth/providers/auth_provider.dart';
import 'package:onezentra_mobile/features/auth/repositories/auth_repository.dart';
import 'package:onezentra_mobile/features/unload/models/unload_models.dart';
import 'package:onezentra_mobile/features/unload/pages/unload_page.dart';
import 'package:onezentra_mobile/features/unload/repositories/unload_repository.dart';
import 'package:onezentra_mobile/main.dart';

/// Repository that answers from canned sessions so the Bongkar flow can be
/// exercised without a running API.
class _FakeUnloadRepository extends UnloadRepository {
  _FakeUnloadRepository({required this.session});

  UnloadSession session;

  int lookupCalls = 0;
  int listActiveCalls = 0;
  int startCalls = 0;
  int scanCalls = 0;
  int completeCalls = 0;
  int cancelCalls = 0;
  double? lastActualQty;

  @override
  Future<UnloadStats> stats() async => UnloadStats(
    total: 1,
    pending: session.status == 'PENDING' ? 1 : 0,
    inProgress: session.status == 'IN_PROGRESS' ? 1 : 0,
    completed: session.status == 'COMPLETED' ? 1 : 0,
  );

  @override
  Future<UnloadReceivingPage> listActive({
    int page = 1,
    int perPage = 10,
  }) async {
    listActiveCalls++;
    var active = session.status == 'PENDING' || session.status == 'IN_PROGRESS'
        ? [session]
        : <UnloadSession>[];
    return UnloadReceivingPage(
      items: active,
      total: active.length,
      page: page,
      lastPage: 1,
    );
  }

  @override
  Future<UnloadSession> findByPo(String po) async {
    lookupCalls++;
    return session;
  }

  @override
  Future<UnloadSession> show(int id) async => session;

  @override
  Future<UnloadSession> start(int id) async {
    startCalls++;
    session = UnloadSession.fromJson({
      'id': session.id,
      'status': 'IN_PROGRESS',
      'total_expected_qty': 100,
      'total_received_qty': 0,
      'rencana_kirim': {
        'po_transporter': 'PO-042',
        'nopol': 'B 9999 ZZ',
        'driver_name': 'Andi',
        'items': [
          {
            'id': 101,
            'kode_barang': 'BRG-1',
            'nama_barang': 'Gula 50kg',
            'jumlah': 100,
            'satuan': 'zak',
          },
        ],
      },
      'items': [],
    });
    return session;
  }

  @override
  Future<void> scan({
    required int receivingId,
    required String kodeBarang,
    required double actualQty,
    String? namaBarang,
    String? satuan,
    String condition = 'FISIK_BAGUS',
    String? barcode,
    String? notes,
    int? rencanaKirimItemId,
  }) async {
    scanCalls++;
    lastActualQty = actualQty;
    session = UnloadSession.fromJson({
      'id': session.id,
      'status': 'IN_PROGRESS',
      'total_expected_qty': 100,
      'total_received_qty': actualQty,
      'rencana_kirim': {
        'po_transporter': 'PO-042',
        'nopol': 'B 9999 ZZ',
        'driver_name': 'Andi',
        'items': [
          {
            'id': 101,
            'kode_barang': 'BRG-1',
            'nama_barang': 'Gula 50kg',
            'jumlah': 100,
            'satuan': 'zak',
          },
        ],
      },
      'items': [
        {'kode_barang': 'BRG-1', 'actual_qty': actualQty, 'satuan': 'zak'},
      ],
    });
  }

  @override
  Future<UnloadSession> complete(int id, {required String barcode}) async {
    completeCalls++;
    expect(barcode, 'PO-042');
    session = UnloadSession.fromJson({
      'id': session.id,
      'status': 'COMPLETED',
      'total_expected_qty': 100,
      'total_received_qty': 100,
      'rencana_kirim': {
        'po_transporter': 'PO-042',
        'nopol': 'B 9999 ZZ',
        'driver_name': 'Andi',
        'items': [],
      },
      'items': [],
    });
    return session;
  }

  @override
  Future<void> cancel(int id) async {
    cancelCalls++;
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

const List<String> _unloadPermissions = ['receiving.view', 'receiving.edit'];

Map<String, dynamic> _loginBody({
  List<String> permissions = _unloadPermissions,
}) => {
  'message': 'Login successful',
  'token': 'token-abc',
  'token_type': 'Bearer',
  'expires_at': '2030-01-01T00:00:00.000Z',
  'user': {
    'id': 7,
    'full_name': 'Bongkar Officer',
    'email': 'bongkar@onezentra.com',
    'level': 'operator',
    'status': 'active',
    'created_at': '2026-01-01T00:00:00.000Z',
    'updated_at': '2026-01-01T00:00:00.000Z',
    'roles': [],
  },
  'permissions': permissions,
};

Future<AuthProvider> _loginAuth({
  List<String> permissions = _unloadPermissions,
}) async {
  var auth = AuthProvider(
    repository: _FakeAuthRepository(_loginBody(permissions: permissions)),
  );
  var ok = await auth.login(email: 'bongkar@onezentra.com', password: 'x');
  expect(ok, isTrue);
  return auth;
}

Future<void> _pumpUnloadPage(
  WidgetTester tester,
  AuthProvider auth,
  UnloadRepository repository, {
  Future<String?> Function()? openScanner,
  double textScale = 1,
}) async {
  await tester.pumpWidget(
    ChangeNotifierProvider<AuthProvider>.value(
      value: auth,
      child: MaterialApp(
        theme: AppTheme.light,
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(
            context,
          ).copyWith(textScaler: TextScaler.linear(textScale)),
          child: child ?? const SizedBox.shrink(),
        ),
        home: UnloadPage(repository: repository, openScanner: openScanner),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

UnloadSession _pendingSession() => UnloadSession.fromJson({
  'id': 7,
  'status': 'PENDING',
  'total_expected_qty': 100,
  'total_received_qty': 0,
  'rencana_kirim': {
    'po_transporter': 'PO-042',
    'nopol': 'B 9999 ZZ',
    'driver_name': 'Andi',
    'items': [
      {
        'id': 101,
        'kode_barang': 'BRG-1',
        'nama_barang': 'Gula 50kg',
        'jumlah': 100,
        'satuan': 'zak',
      },
    ],
  },
  'items': [],
});

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    FlutterSecureStorage.setMockInitialValues({});
  });

  testWidgets('tanpa receiving.view hanya kartu izin', (tester) async {
    var repository = _FakeUnloadRepository(session: _pendingSession());
    var auth = await _loginAuth(permissions: []);

    await _pumpUnloadPage(tester, auth, repository);

    expect(
      find.text('Anda tidak memiliki izin untuk melihat Check Out Point.'),
      findsOneWidget,
    );
    expect(find.text('Konfirmasi Receiving'), findsNothing);
    expect(repository.lookupCalls, 0);
    expect(repository.listActiveCalls, 0);
  });

  testWidgets('scan PO memilih receiving aktif untuk konfirmasi selesai', (
    tester,
  ) async {
    var repository = _FakeUnloadRepository(session: _pendingSession());
    var auth = await _loginAuth();

    await _pumpUnloadPage(
      tester,
      auth,
      repository,
      openScanner: () async => 'PO-042',
    );

    await tester.tap(find.byIcon(Icons.photo_camera_rounded));
    await tester.pumpAndSettle();

    expect(repository.lookupCalls, 1);
    expect(find.text('PO Transporter'), findsOneWidget);
    expect(find.text('Selesai Bongkar'), findsOneWidget);
    expect(find.text('Mulai Bongkar'), findsNothing);
    expect(find.text('Scan Bongkar'), findsNothing);
  });

  testWidgets('Check Out tetap rapi di layar sempit dengan teks besar', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 640);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    var repository = _FakeUnloadRepository(session: _pendingSession());
    var auth = await _loginAuth();

    await _pumpUnloadPage(tester, auth, repository, textScale: 1.4);

    expect(find.text('Check Out Point'), findsOneWidget);
    expect(find.text('Konfirmasi Receiving'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('pilih receiving aktif lalu konfirmasi selesai seperti web', (
    tester,
  ) async {
    var repository = _FakeUnloadRepository(session: _pendingSession());
    var auth = await _loginAuth();

    await _pumpUnloadPage(tester, auth, repository);

    await tester.tap(find.text('PO-042'));
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(FilledButton, 'Selesai Bongkar'));
    await tester.pumpAndSettle();
    expect(find.textContaining('melepas dock'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, 'Ya, Selesaikan'));
    await tester.pumpAndSettle();

    expect(repository.completeCalls, 1);
    expect(find.textContaining('Receiving PO PO-042 selesai.'), findsOneWidget);
    expect(find.textContaining('BLC (TO)'), findsOneWidget);
    expect(find.text('Daftar Receiving'), findsOneWidget);
    expect(find.text('Pilih receiving lain'), findsNothing);
  });

  testWidgets('rute /bongkar merender UnloadPage dengan repo tersuntik', (
    tester,
  ) async {
    var repository = _FakeUnloadRepository(session: _pendingSession());
    var auth = await _loginAuth();
    var router = buildRouter(auth, unloadRepository: repository);

    await tester.pumpWidget(OneZentraApp(authProvider: auth, router: router));
    await tester.pumpAndSettle();

    router.go('/bongkar');
    await tester.pumpAndSettle();

    expect(find.byType(UnloadPage), findsOneWidget);
    expect(find.text('Check Out Point'), findsOneWidget);
    expect(find.text('Konfirmasi Receiving'), findsOneWidget);
    expect(find.text('Daftar Receiving'), findsOneWidget);
    expect(find.text('Scan Bongkar'), findsNothing);
  });
}
