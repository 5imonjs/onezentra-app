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
import 'package:onezentra_mobile/shared/widgets/app_widgets.dart';

/// Repository that answers from canned sessions so the Bongkar flow can be
/// exercised without a running API.
class _FakeUnloadRepository extends UnloadRepository {
  _FakeUnloadRepository({required this.session});

  UnloadSession session;

  int lookupCalls = 0;
  int startCalls = 0;
  int scanCalls = 0;
  int completeCalls = 0;
  int cancelCalls = 0;
  double? lastActualQty;

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

const List<String> _unloadPermissions = [
  'receiving.view',
  'receiving.edit',
];

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
}) async {
  await tester.pumpWidget(
    ChangeNotifierProvider<AuthProvider>.value(
      value: auth,
      child: MaterialApp(
        theme: AppTheme.light,
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
      find.text('Anda tidak memiliki izin untuk melihat Bongkar.'),
      findsOneWidget,
    );
    expect(find.text('Scan Bongkar'), findsNothing);
    expect(repository.lookupCalls, 0);
  });

  testWidgets('scan PO → siap bongkar → mulai → daftar produk', (
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
    expect(find.textContaining('SIAP BONGKAR'), findsOneWidget);

    var startButton = find.widgetWithText(FilledButton, 'Mulai Bongkar');
    await tester.ensureVisible(startButton);
    await tester.tap(startButton);
    await tester.pumpAndSettle();

    expect(repository.startCalls, 1);
    expect(find.textContaining('BONGKAR BERJALAN'), findsOneWidget);
    expect(find.text('Gula 50kg'), findsOneWidget);
  });

  testWidgets('tombol Sesuai mencatat satu ketuk', (tester) async {
    var repository = _FakeUnloadRepository(session: _pendingSession());
    var auth = await _loginAuth();

    await _pumpUnloadPage(tester, auth, repository);

    await tester.enterText(find.byType(TextFormField).first, 'PO-042');
    await tester.tap(find.widgetWithText(AppPrimaryButton, 'Buka'));
    await tester.pumpAndSettle();
    var startButton = find.widgetWithText(FilledButton, 'Mulai Bongkar');
    await tester.ensureVisible(startButton);
    await tester.tap(startButton);
    await tester.pumpAndSettle();

    var quickButton = find.widgetWithText(FilledButton, 'Sesuai');
    expect(quickButton, findsOneWidget);
    await tester.ensureVisible(quickButton);
    await tester.tap(quickButton);
    await tester.pumpAndSettle();

    expect(repository.scanCalls, 1);
    expect(repository.lastActualQty, 100);
  });

  testWidgets('selesai nonaktif tanpa item, aktif + handoff setelah pindai', (
    tester,
  ) async {
    var repository = _FakeUnloadRepository(session: _pendingSession());
    var auth = await _loginAuth();

    await _pumpUnloadPage(tester, auth, repository);

    await tester.enterText(find.byType(TextFormField).first, 'PO-042');
    await tester.tap(find.widgetWithText(AppPrimaryButton, 'Buka'));
    await tester.pumpAndSettle();
    var startButton = find.widgetWithText(FilledButton, 'Mulai Bongkar');
    await tester.ensureVisible(startButton);
    await tester.tap(startButton);
    await tester.pumpAndSettle();

    // No scans yet: the button refuses instead of writing an empty receiving.
    expect(
      find.text('Selesai Bongkar (belum ada item)'),
      findsOneWidget,
    );

    var quickButton = find.widgetWithText(FilledButton, 'Sesuai');
    await tester.ensureVisible(quickButton);
    await tester.tap(quickButton);
    await tester.pumpAndSettle();

    var completeButton = find.widgetWithText(
      FilledButton,
      'Selesaikan Bongkar ✓',
    );
    expect(completeButton, findsOneWidget);
    await tester.ensureVisible(completeButton);
    await tester.tap(completeButton);
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(FilledButton, 'Ya, Selesaikan'));
    await tester.pumpAndSettle();

    expect(repository.completeCalls, 1);
    // Finished document continues to Check Out with the PO carried over.
    expect(find.text('Lanjut ke Check Out PO-042'), findsOneWidget);
  });
}
