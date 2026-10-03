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
import 'package:onezentra_mobile/features/checkout/pages/checkout_page.dart';
import 'package:onezentra_mobile/features/checkout/providers/checkout_provider.dart';
import 'package:onezentra_mobile/features/gate/models/gate_models.dart';
import 'package:onezentra_mobile/features/gate/repositories/gate_repository.dart';
import 'package:onezentra_mobile/shared/widgets/app_widgets.dart';

/// Repository that answers from canned data so the Check Out flow can be
/// exercised without a running API.
class _FakeGateRepository extends GateRepository {
  _FakeGateRepository({this.lookupResult});

  final RencanaKirim? lookupResult;

  final List<String> recordCalls = [];
  int lookupCalls = 0;

  @override
  Future<RencanaKirim> findByNoDokumen(String nomor) async {
    lookupCalls++;
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
}

/// Repository whose lookup succeeds once, then always fails. Proves the screen
/// drops the previously-found document instead of leaving its card on screen
/// under the new (failed) search's error message.
class _FailingGateRepository extends _FakeGateRepository {
  _FailingGateRepository() : super(lookupResult: _finishedDocument);

  @override
  Future<RencanaKirim> findByNoDokumen(String nomor) async {
    lookupCalls++;
    if (lookupCalls == 1) {
      return lookupResult!;
    }
    throw const ApiException('Rencana kirim tidak ditemukan.', 404);
  }
}

/// Repository whose `record` stays pending until the test releases it.
///
/// This is what makes the dispose-during-request race testable: the widget
/// test can navigate the page away while the request is still in flight, then
/// complete the request and assert nothing blew up afterwards.
class _ControllableGateRepository extends _FakeGateRepository {
  _ControllableGateRepository() : super(lookupResult: _finishedDocument);

  final Completer<GateTransaction> gate = Completer<GateTransaction>();
  bool recordStarted = false;

  @override
  Future<GateTransaction> record({
    required RencanaKirim rencanaKirim,
    required String gateType,
  }) {
    recordCalls.add(gateType);
    recordStarted = true;
    return gate.future;
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

const List<String> _checkoutPermissions = ['gate.view', 'gate.create'];

Map<String, dynamic> _loginBody({
  List<String> permissions = _checkoutPermissions,
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
  List<String> permissions = _checkoutPermissions,
}) async {
  var auth = AuthProvider(
    repository: _FakeAuthRepository(_loginBody(permissions: permissions)),
  );
  var ok = await auth.login(email: 'gate@onezentra.com', password: 'x');
  expect(ok, isTrue);
  return auth;
}

Future<void> _pumpCheckoutPage(
  WidgetTester tester,
  AuthProvider auth,
  GateRepository repository, {
  Future<String?> Function()? openScanner,
}) async {
  await tester.pumpWidget(
    ChangeNotifierProvider<AuthProvider>.value(
      value: auth,
      child: MaterialApp(
        theme: AppTheme.light,
        home: CheckoutPage(
          repository: repository,
          openScanner: openScanner,
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

const _finishedDocument = RencanaKirim(
  id: 11,
  poTransporter: 'PO-042',
  nopol: 'B 9999 ZZ',
  driverName: 'Andi',
  status: 'COMPLETED',
);

const _unfinishedDocument = RencanaKirim(
  id: 12,
  poTransporter: 'PO-043',
  nopol: 'B 1111 AA',
  driverName: 'Budi',
  status: 'CHECKED_IN',
);

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    FlutterSecureStorage.setMockInitialValues({});
  });

  testWidgets('tanpa gate.view hanya kartu izin', (tester) async {
    var repository = _FakeGateRepository(lookupResult: _finishedDocument);
    var auth = await _loginAuth(permissions: []);

    await _pumpCheckoutPage(tester, auth, repository);

    expect(
      find.text('Anda tidak memiliki izin untuk melihat Check Out Point.'),
      findsOneWidget,
    );
    expect(find.text('Scan Dokumen Selesai'), findsNothing);
    expect(repository.lookupCalls, 0);
  });

  testWidgets('dokumen selesai → Gate OUT → konfirmasi → tercatat', (
    tester,
  ) async {
    var repository = _FakeGateRepository(lookupResult: _finishedDocument);
    var auth = await _loginAuth();

    await _pumpCheckoutPage(
      tester,
      auth,
      repository,
      openScanner: () async => 'PO-042',
    );

    await tester.tap(find.byIcon(Icons.photo_camera_rounded));
    await tester.pumpAndSettle();

    expect(repository.lookupCalls, 1);
    expect(find.text('DOKUMEN DITEMUKAN'), findsOneWidget);
    var outButton = find.widgetWithText(FilledButton, 'Gate OUT');
    expect(outButton, findsOneWidget);

    await tester.ensureVisible(outButton);
    await tester.tap(outButton);
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(FilledButton, 'Ya, Catat OUT'));
    await tester.pumpAndSettle();

    expect(repository.recordCalls, ['OUTBOUND']);
  });

  testWidgets('dokumen belum selesai hanya penjelasan, tanpa tombol OUT', (
    tester,
  ) async {
    var repository = _FakeGateRepository(lookupResult: _unfinishedDocument);
    var auth = await _loginAuth();

    await _pumpCheckoutPage(tester, auth, repository);

    await tester.enterText(find.byType(TextFormField).first, 'PO-043');
    await tester.tap(find.widgetWithText(AppPrimaryButton, 'Cari'));
    await tester.pumpAndSettle();

    expect(find.text('DOKUMEN DITEMUKAN'), findsOneWidget);
    expect(find.widgetWithText(FilledButton, 'Gate OUT'), findsNothing);
    expect(repository.recordCalls, isEmpty);
  });

  testWidgets('pencarian gagal membuang kartu dokumen sebelumnya', (
    tester,
  ) async {
    // Guards an invariant that lives in CheckoutProvider.lookup, not in the
    // page: _found is cleared on BOTH catch paths. An earlier version of this
    // page defensively called clearFound() first; that was redundant, and this
    // test is what proved it — the card disappears either way, so the page-side
    // call was removed and the contract is now pinned here instead.
    var repository = _FailingGateRepository();
    var auth = await _loginAuth();

    await _pumpCheckoutPage(tester, auth, repository);

    // First lookup succeeds, so the document card renders.
    await tester.enterText(find.byType(TextFormField).first, 'PO-042');
    await tester.tap(find.widgetWithText(AppPrimaryButton, 'Cari'));
    await tester.pumpAndSettle();
    expect(find.text('DOKUMEN DITEMUKAN'), findsOneWidget);

    // Second lookup fails: the stale card must be gone, only the error remains.
    await tester.enterText(find.byType(TextFormField).first, 'PO-999');
    await tester.tap(find.widgetWithText(AppPrimaryButton, 'Cari'));
    await tester.pumpAndSettle();

    expect(find.text('DOKUMEN DITEMUKAN'), findsNothing);
    expect(find.widgetWithText(FilledButton, 'Gate OUT'), findsNothing);
    expect(find.text('Rencana kirim tidak ditemukan.'), findsOneWidget);
    expect(repository.recordCalls, isEmpty);
  });

  testWidgets('pencarian gagal membuang kartu dokumen sebelumnya', (
    tester,
  ) async {
    // Guards an invariant that lives in CheckoutProvider.lookup, not in the
    // page: _found is cleared on BOTH catch paths. An earlier version of this
    // page defensively called clearFound() first; that was redundant, and this
    // test is what proved it — the card disappears either way, so the page-side
    // call was removed and the contract is now pinned here instead.
    var repository = _FailingGateRepository();
    var auth = await _loginAuth();

    await _pumpCheckoutPage(tester, auth, repository);

    // First lookup succeeds, so the document card renders.
    await tester.enterText(find.byType(TextFormField).first, 'PO-042');
    await tester.tap(find.widgetWithText(AppPrimaryButton, 'Cari'));
    await tester.pumpAndSettle();
    expect(find.text('DOKUMEN DITEMUKAN'), findsOneWidget);

    // Second lookup fails: the stale card must be gone, only the error remains.
    await tester.enterText(find.byType(TextFormField).first, 'PO-999');
    await tester.tap(find.widgetWithText(AppPrimaryButton, 'Cari'));
    await tester.pumpAndSettle();

    expect(find.text('DOKUMEN DITEMUKAN'), findsNothing);
    expect(find.widgetWithText(FilledButton, 'Gate OUT'), findsNothing);
    expect(find.text('Rencana kirim tidak ditemukan.'), findsOneWidget);
    expect(repository.recordCalls, isEmpty);
  });

  test('provider menghapus dokumen lama pada ApiException', () async {
    // Same contract, asserted at the layer that owns it — so the guarantee
    // holds for every caller, not just this screen.
    var repository = _FailingGateRepository();
    var provider = CheckoutProvider(repository: repository);

    await provider.lookup('PO-042');
    expect(provider.found, isNotNull);

    await provider.lookup('PO-999');
    expect(provider.found, isNull, reason: 'dokumen lama harus hilang saat lookup gagal');
    expect(provider.message?.success, isFalse);
  });

  testWidgets('halaman ditutup saat request Gate OUT masih berjalan', (
    tester,
  ) async {
    // Regression guard for the dispose-during-request race.
    //
    // `_confirmOut` awaits `recordOut()`, which is a network call. The user can
    // back out of the page while it is in flight, disposing the State — and with
    // it the TextEditingController. When the response finally lands, the old
    // code reached `_scanController.clear()` unguarded and touched a disposed
    // controller, which throws in debug builds.
    //
    // The race is only reachable if the response resolves AFTER disposal, so
    // the repository holds the request open until this test releases it.
    var repository = _ControllableGateRepository();
    var auth = await _loginAuth();

    await _pumpCheckoutPage(tester, auth, repository);

    await tester.enterText(find.byType(TextFormField).first, 'PO-042');
    await tester.tap(find.widgetWithText(AppPrimaryButton, 'Cari'));
    await tester.pumpAndSettle();

    var outButton = find.widgetWithText(FilledButton, 'Gate OUT');
    await tester.ensureVisible(outButton);
    await tester.tap(outButton);
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(FilledButton, 'Ya, Catat OUT'));
    // Let the tap reach `_confirmOut`, but stop before the request completes.
    await tester.pump();
    expect(repository.recordStarted, isTrue, reason: 'request harus sedang berjalan');

    // User navigates away mid-request: the page and its controllers are disposed.
    await tester.pumpWidget(const MaterialApp(home: SizedBox()));
    await tester.pumpAndSettle();

    // Now the response arrives, against an already-disposed State.
    repository.gate.complete(
      GateTransaction(
        id: 1,
        rencanaKirimId: _finishedDocument.id!,
        gateType: 'OUTBOUND',
        nopol: _finishedDocument.nopol,
        driverName: _finishedDocument.driverName,
        poTransporter: _finishedDocument.poTransporter,
        status: 'COMPLETED',
        scanTime: DateTime(2026, 1, 15, 9, 30),
        rencanaKirim: _finishedDocument,
      ),
    );
    await tester.pumpAndSettle();

    // The assertion that matters: no exception escaped. Flutter surfaces a
    // post-dispose controller use as a test failure via the error handler.
    expect(tester.takeException(), isNull);
  });

  test('provider bisa dipakai setelah dispose tanpa melempar', () async {
    // The provider outlives the request it started, so a late notifyListeners()
    // must not throw. Same race as above, asserted at the layer that owns the
    // lifecycle rather than through the widget tree.
    var repository = _ControllableGateRepository();
    var provider = CheckoutProvider(repository: repository);

    await provider.lookup('PO-042');
    expect(provider.found, isNotNull);

    var pending = provider.recordOut();
    expect(repository.recordStarted, isTrue);

    provider.dispose();
    repository.gate.complete(
      GateTransaction(
        id: 1,
        rencanaKirimId: _finishedDocument.id!,
        gateType: 'OUTBOUND',
        nopol: _finishedDocument.nopol,
        driverName: _finishedDocument.driverName,
        poTransporter: _finishedDocument.poTransporter,
        status: 'COMPLETED',
        scanTime: DateTime(2026, 1, 15, 9, 30),
        rencanaKirim: _finishedDocument,
      ),
    );

    // Must resolve rather than throw "used after being disposed".
    expect(await pending, isTrue);
  });
}
