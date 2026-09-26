import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:onezentra_mobile/features/auth/auth_provider.dart';
import 'package:onezentra_mobile/features/dashboard/dashboard_provider.dart';
import 'package:onezentra_mobile/features/dashboard/dashboard_screen.dart';
import 'package:onezentra_mobile/features/dashboard/home_shell.dart';
import 'package:onezentra_mobile/features/gate/gate_checkin_screen.dart';
import 'package:onezentra_mobile/features/gate/gate_provider.dart';
import 'package:onezentra_mobile/features/gate/gate_service.dart';
import 'package:onezentra_mobile/features/gate/gate_session_provider.dart';
import 'package:onezentra_mobile/features/gate/models/gate_models.dart';
import 'package:onezentra_mobile/widgets/states.dart';
import 'package:onezentra_mobile/widgets/status_pill.dart';

import 'support/haptics_recorder.dart';
import 'support/test_harness.dart';

void main() {
  /// Layar test default 800x600: kartu riwayat dengan beberapa baris melewati
  /// lipatan, jadi viewport dibuat tinggi agar tanpa scroll manual.
  void useTallScreen(WidgetTester tester) {
    tester.view.physicalSize = const Size(480, 2400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
  }

  AuthProvider authWith(List<String> permissions) {
    final auth = AuthProvider(FakeAuthService());
    auth.user = testUser;
    auth.permissions = permissions;
    auth.isRestoring = false;
    return auth;
  }

  Widget wrap(
    Widget child,
    AuthProvider auth,
    GateProvider gate, [
    DashboardProvider? dashboard,
  ]) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider<AuthProvider>.value(value: auth),
        ChangeNotifierProvider<GateProvider>.value(value: gate),
        if (dashboard != null)
          ChangeNotifierProvider<DashboardProvider>.value(value: dashboard)
        else
          ChangeNotifierProvider(
            create: (_) => DashboardProvider(FakeDashboardService()),
          ),
      ],
      child: MaterialApp(home: child),
    );
  }

  group('Beranda', () {
    testWidgets('kartu statistik Check In Point membuka tab Check In', (
      tester,
    ) async {
      final opened = <String>[];
      final dash = DashboardProvider(
        FakeDashboardService()..summaryResult = dashboardSummary(),
      );
      await tester.pumpWidget(
        wrap(
          DashboardScreen(onOpenTab: opened.add),
          authWith(const ['gate.view', 'dashboard.view']),
          GateProvider(FakeGateService()),
          dash,
        ),
      );
      await tester.pumpAndSettle();

      // Sapaan hero mengikuti jam, jadi cukup dicek namanya.
      expect(find.textContaining('Gate'), findsWidgets);
      // Label kartu sengaja uppercase (padanan `uppercase tracking-wider` web).
      expect(find.text('Statistik'), findsOneWidget);
      expect(find.text('CHECK IN POINT'), findsOneWidget);
      expect(find.text('12'), findsOneWidget);
      expect(find.text('+4 minggu ini'), findsOneWidget);

      await tester.tap(find.text('CHECK IN POINT'));
      await tester.pump();
      expect(opened, ['gate']);
    });

    testWidgets('tanpa izin modul apa pun menampilkan empty state', (
      tester,
    ) async {
      await tester.pumpWidget(
        wrap(
          DashboardScreen(onOpenTab: (_) {}),
          authWith([]),
          GateProvider(FakeGateService()),
          DashboardProvider(FakeDashboardService()),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('CHECK IN POINT'), findsNothing);
      expect(find.textContaining('Tidak ada menu'), findsOneWidget);
    });

    testWidgets(
      'kartu Validasi Dokumen membuka tab Validasi, bukan "segera hadir"',
      (tester) async {
        final opened = <String>[];
        await tester.pumpWidget(
          wrap(
            DashboardScreen(onOpenTab: opened.add),
            authWith(const ['sj_validation.view', 'dashboard.view']),
            GateProvider(FakeGateService()),
            DashboardProvider(
              FakeDashboardService()..summaryResult = dashboardSummary(),
            ),
          ),
        );
        await tester.pumpAndSettle();

        expect(find.textContaining('segera hadir'), findsNothing);

        await tester.tap(find.text('VALIDASI DOKUMEN'));
        await tester.pump();

        expect(opened, ['validation']);
      },
    );

    testWidgets('modul tanpa halaman mobile menjelaskan saat diketuk', (
      tester,
    ) async {
      final unavailable = <String>[];
      await tester.pumpWidget(
        wrap(
          DashboardScreen(onOpenTab: (_) {}, onUnavailable: unavailable.add),
          authWith(const ['receiving.view', 'dashboard.view']),
          GateProvider(FakeGateService()),
          DashboardProvider(
            FakeDashboardService()..summaryResult = dashboardSummary(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('CHECK OUT POINT'));
      await tester.pump();

      expect(unavailable, ['Check Out Point']);
    });
  });

  group('HomeShell', () {
    testWidgets('tab Check In hanya ada bila punya izin gate.view', (
      tester,
    ) async {
      await tester.pumpWidget(
        wrap(
          const HomeShell(),
          authWith(['gate.view']),
          GateProvider(FakeGateService()),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byType(NavigationDestination), findsNWidgets(3));
      expect(find.text('Check In'), findsOneWidget);

      await tester.tap(find.text('Check In'));
      await tester.pumpAndSettle();

      expect(find.text('Quick Scan'), findsOneWidget);
      expect(find.text('Check In Point'), findsOneWidget);
    });

    testWidgets('tanpa izin gate, Check In tidak muncul di navigasi', (
      tester,
    ) async {
      await tester.pumpWidget(
        wrap(const HomeShell(), authWith([]), GateProvider(FakeGateService())),
      );
      await tester.pumpAndSettle();

      expect(find.byType(NavigationDestination), findsNWidgets(2));
      expect(find.text('Check In'), findsNothing);
      expect(find.byType(GateCheckinScreen), findsNothing);
    });

    testWidgets('statistik gate dimuat dari shell', (tester) async {
      final gateService = FakeGateService()
        ..statsResult = const GateStats(
          hariIni: 4,
          terjadwal: 2,
          selesai: 1,
          total: 7,
        );
      await tester.pumpWidget(
        wrap(
          const HomeShell(),
          authWith(['gate.view']),
          GateProvider(gateService),
        ),
      );
      await tester.pumpAndSettle();

      // Angka gate tidak lagi ditempel di header Beranda (kartu statistik
      // Beranda berasal dari dashboard/summary), jadi diperiksa di tab aslinya.
      await tester.tap(find.text('Check In'));
      await tester.pumpAndSettle();

      expect(find.text('4'), findsOneWidget);
    });

    testWidgets('kembali ke Beranda menyegarkan ringkasan yang sudah basi', (
      tester,
    ) async {
      final service = FakeDashboardService()
        ..summaryResult = dashboardSummary();
      // Jam digeser manual: cache Beranda 60 detik, dan test tidak mau
      // menunggu satu menit sungguhan.
      var now = DateTime(2026, 9, 26, 12);

      await tester.pumpWidget(
        wrap(
          const HomeShell(),
          authWith(const ['gate.view', 'dashboard.view']),
          GateProvider(FakeGateService()),
          DashboardProvider(service, () => now),
        ),
      );
      await tester.pumpAndSettle();
      expect(service.calls, 1);

      await tester.tap(find.text('Check In'));
      await tester.pumpAndSettle();
      expect(service.calls, 1, reason: 'di tab lain tidak perlu request');

      // Masih di dalam masa cache: angka dipakai apa adanya.
      now = now.add(const Duration(seconds: 20));
      await tester.tap(find.text('Beranda'));
      await tester.pumpAndSettle();
      expect(service.calls, 1, reason: 'cache masih segar');

      // Sudah basi: angka diambil ulang karena operator bisa saja baru saja
      // Gate IN atau menyelesaikan validasi di tab lain.
      now = now.add(dashboardCacheTtl);
      await tester.tap(find.text('Check In'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Beranda'));
      await tester.pumpAndSettle();

      expect(service.calls, 2);
    });

    testWidgets(
      'Beranda hanya memanggil dashboard/summary untuk akun berizin',
      (tester) async {
        final withoutPermission = FakeDashboardService();

        await tester.pumpWidget(
          wrap(
            // Key berbeda per akun: tanpa ini State HomeShell yang sama dipakai
            // ulang saat `pumpWidget` berikutnya sehingga initState tidak jalan
            // dan request kedua tidak pernah terkirim.
            const HomeShell(key: ValueKey('tanpa-dashboard-view')),
            authWith(['gate.view']),
            GateProvider(FakeGateService()),
            DashboardProvider(withoutPermission),
          ),
        );
        await tester.pumpAndSettle();

        expect(
          withoutPermission.calls,
          0,
          reason: 'tanpa dashboard.view tidak boleh request',
        );

        final withPermission = FakeDashboardService();
        await tester.pumpWidget(
          wrap(
            const HomeShell(key: ValueKey('dengan-dashboard-view')),
            authWith(['gate.view', 'dashboard.view']),
            GateProvider(FakeGateService()),
            DashboardProvider(withPermission),
          ),
        );
        await tester.pumpAndSettle();

        expect(withPermission.calls, 1);
      },
    );
  });

  group('GateService', () {
    const rk = RencanaKirimSummary(
      id: 5,
      poTransporter: 'PO-77',
      nopol: 'B 1 AA',
      driverName: 'Budi',
      status: 'SCHEDULED',
    );

    Dio dioWith(Map<String, dynamic> body) {
      final dio = Dio(BaseOptions(baseUrl: 'https://contoh.test/api/v1'));
      dio.httpClientAdapter = CannedHttpAdapter(body, statusCode: 201);
      return dio;
    }

    test(
      'gateIn mengembalikan status rencana terbaru dari respons server',
      () async {
        final dio = dioWith(<String, dynamic>{
          'message': 'Gate transaction recorded successfully',
          'data': <String, dynamic>{
            'id': 9,
            'gate_type': 'INBOUND',
            'rencana_kirim': <String, dynamic>{'id': 5, 'status': 'CHECKED_IN'},
          },
        });

        final status = await GateService(dio).gateIn(rk);

        expect(status, 'CHECKED_IN');
        final request =
            (dio.httpClientAdapter as CannedHttpAdapter).requests.single;
        expect(request.method, 'POST');
        expect(request.data['gate_type'], 'INBOUND');
      },
    );

    test('gateOut mengembalikan status COMPLETED', () async {
      final dio = dioWith(<String, dynamic>{
        'data': <String, dynamic>{
          'rencana_kirim': <String, dynamic>{'status': 'COMPLETED'},
        },
      });

      final status = await GateService(dio).gateOut(rk);

      expect(status, 'COMPLETED');
    });

    test('respons tanpa status tidak dianggap gagal (string kosong)', () async {
      final dio = dioWith(<String, dynamic>{
        'data': <String, dynamic>{'id': 9},
      });

      final status = await GateService(dio).gateIn(rk);

      expect(status, isEmpty);
    });
  });

  group('Check In Point', () {
    testWidgets('ditolak tanpa gate.view', (tester) async {
      await tester.pumpWidget(
        wrap(
          const GateCheckinScreen(),
          authWith([]),
          GateProvider(FakeGateService()),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.textContaining('tidak memiliki izin'), findsOneWidget);
      expect(find.text('Quick Scan'), findsNothing);
    });

    testWidgets('dengan izin menampilkan Quick Scan dan riwayat kosong', (
      tester,
    ) async {
      await tester.pumpWidget(
        wrap(
          const GateCheckinScreen(),
          authWith(['gate.view']),
          GateProvider(FakeGateService()),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Quick Scan'), findsOneWidget);
      expect(find.text('Riwayat Gate'), findsOneWidget);
      expect(find.textContaining('Belum ada transaksi gate'), findsOneWidget);
    });

    testWidgets('lookup Nopol menampilkan dokumen dan aksi Gate IN', (
      tester,
    ) async {
      final service = FakeGateService()
        ..lookupResult = rencana(
          'SCHEDULED',
          po: 'PO-77',
          nopol: 'B 9999 ZZ',
          driver: 'Sari',
        );
      await tester.pumpWidget(
        wrap(
          GateCheckinScreen(service: service),
          authWith(['gate.view', 'gate.create']),
          GateProvider(FakeGateService()),
        ),
      );
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField).first, 'B 9999 ZZ');
      await tester.tap(find.widgetWithText(FilledButton, 'Cari'));
      await tester.pumpAndSettle();

      expect(service.calls, contains('lookup:B 9999 ZZ'));
      expect(find.text('PO-77'), findsOneWidget);
      expect(
        find.text('B 9999 ZZ'),
        findsNWidgets(2),
        reason: 'nopol tampil di input scan & kartu dokumen',
      );
      expect(find.text('Sari • Dijadwalkan'), findsOneWidget);
      expect(find.text('Gate IN →'), findsOneWidget);
    });

    testWidgets('dokumen siap diproses tanpa izin → tampil hint izin', (
      tester,
    ) async {
      final service = FakeGateService()
        ..lookupResult = rencana('SCHEDULED', po: 'PO-77');
      await tester.pumpWidget(
        wrap(
          GateCheckinScreen(service: service),
          authWith(['gate.view']),
          GateProvider(FakeGateService()),
        ),
      );
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField).first, 'PO-77');
      await tester.tap(find.widgetWithText(FilledButton, 'Cari'));
      await tester.pumpAndSettle();

      expect(find.text('Gate IN →'), findsNothing);
      expect(find.textContaining('izin gate.create'), findsOneWidget);
    });

    testWidgets('VERIFY butuh rencana_kirim.edit', (tester) async {
      final service = FakeGateService()
        ..lookupResult = rencana('CHECKED_IN', po: 'PO-88');
      await tester.pumpWidget(
        wrap(
          GateCheckinScreen(service: service),
          authWith(['gate.view', 'gate.create']),
          GateProvider(FakeGateService()),
        ),
      );
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField).first, 'PO-88');
      await tester.tap(find.widgetWithText(FilledButton, 'Cari'));
      await tester.pumpAndSettle();

      expect(find.text('Verify ✓'), findsNothing);
      expect(find.textContaining('izin rencana_kirim.edit'), findsOneWidget);
    });

    testWidgets('Gate IN dikonfirmasi → dokumen tercatat & dibersihkan', (
      tester,
    ) async {
      final service = FakeGateService()
        ..lookupResult = rencana('SCHEDULED', po: 'PO-99');
      await tester.pumpWidget(
        wrap(
          GateCheckinScreen(service: service),
          authWith(['gate.view', 'gate.create']),
          GateProvider(FakeGateService()),
        ),
      );
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField).first, 'PO-99');
      await tester.tap(find.widgetWithText(FilledButton, 'Cari'));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Gate IN →'));
      await tester.pumpAndSettle();
      expect(find.text('Catat Gate IN?'), findsOneWidget);

      await tester.tap(find.text('Ya, Catat IN'));
      await tester.pumpAndSettle();

      expect(service.calls, contains('gateIn:PO-99'));
      expect(
        find.text('Gate IN berhasil dicatat. Status: Check In'),
        findsOneWidget,
      );
      expect(find.text('PO-99'), findsNothing);
    });

    testWidgets('lookup gagal menampilkan pesan dan tidak menyisakan kartu', (
      tester,
    ) async {
      final service = FakeGateService()
        ..lookupResult = rencana('SCHEDULED', po: 'PO-LAMA');
      await tester.pumpWidget(
        wrap(
          GateCheckinScreen(service: service),
          authWith(['gate.view', 'gate.create']),
          GateProvider(FakeGateService()),
        ),
      );
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField).first, 'PO-LAMA');
      await tester.tap(find.widgetWithText(FilledButton, 'Cari'));
      await tester.pumpAndSettle();
      expect(find.text('PO-LAMA'), findsNWidgets(2));

      service.lookupError = dioError(
        404,
        message: 'Rencana kirim tidak ditemukan',
      );
      await tester.enterText(find.byType(TextField).first, 'PO-HANTU');
      await tester.tap(find.widgetWithText(FilledButton, 'Cari'));
      await tester.pumpAndSettle();

      expect(find.text('Rencana kirim tidak ditemukan'), findsOneWidget);
      expect(
        find.text('PO-LAMA'),
        findsNothing,
        reason:
            'kartu dokumen lama harus hilang supaya tidak bisa di-Gate-IN lagi',
      );
      expect(find.text('Gate IN →'), findsNothing);
    });

    testWidgets('dokumen Check In bisa langsung dilanjutkan ke Validasi', (
      tester,
    ) async {
      final service = FakeGateService()
        ..lookupResult = rencana('CHECKED_IN', id: 42, po: 'PO-77');
      var openedFor = -1;
      await tester.pumpWidget(
        wrap(
          GateCheckinScreen(
            service: service,
            onOpenValidation: (id) => openedFor = id,
          ),
          authWith(['gate.view', 'sj_validation.create']),
          GateProvider(FakeGateService()),
        ),
      );
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField).first, 'PO-77');
      await tester.tap(find.widgetWithText(FilledButton, 'Cari'));
      await tester.pumpAndSettle();

      await tester.ensureVisible(find.text('Mulai Validasi →'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Mulai Validasi →'));
      await tester.pumpAndSettle();

      expect(openedFor, 42, reason: 'shell harus dibuka dengan id dokumennya');
    });

    testWidgets(
      'setelah Gate IN, dokumen bisa langsung dilanjutkan tanpa scan',
      (tester) async {
        final service = FakeGateService()
          ..lookupResult = rencana('SCHEDULED', id: 42, po: 'PO-77');
        var openedFor = -1;
        await tester.pumpWidget(
          wrap(
            GateCheckinScreen(
              service: service,
              onOpenValidation: (id) => openedFor = id,
            ),
            authWith(['gate.view', 'gate.create', 'sj_validation.create']),
            GateProvider(FakeGateService()),
          ),
        );
        await tester.pumpAndSettle();

        await tester.enterText(find.byType(TextField).first, 'PO-77');
        await tester.tap(find.widgetWithText(FilledButton, 'Cari'));
        await tester.pumpAndSettle();
        await tester.ensureVisible(find.text('Gate IN →'));
        await tester.tap(find.text('Gate IN →'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Ya, Catat IN'));
        await tester.pumpAndSettle();

        expect(
          find.text('Langkah berikutnya: Validasi Dokumen'),
          findsOneWidget,
          reason: 'identitas dokumen harus tetap ada setelah Gate IN',
        );
        expect(find.textContaining('PO-77 • Check In'), findsOneWidget);

        await tester.tap(find.byKey(const Key('gate-continue-validation')));
        await tester.pumpAndSettle();

        expect(openedFor, 42);
      },
    );

    testWidgets('scan berikutnya menghapus kartu lanjutan dokumen lama', (
      tester,
    ) async {
      final service = FakeGateService()
        ..lookupResult = rencana('SCHEDULED', po: 'PO-77');
      await tester.pumpWidget(
        wrap(
          GateCheckinScreen(service: service, onOpenValidation: (_) {}),
          authWith(['gate.view', 'gate.create', 'sj_validation.create']),
          GateProvider(FakeGateService()),
        ),
      );
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField).first, 'PO-77');
      await tester.tap(find.widgetWithText(FilledButton, 'Cari'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Gate IN →'));
      await tester.tap(find.text('Gate IN →'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Ya, Catat IN'));
      await tester.pumpAndSettle();
      expect(find.text('Langkah berikutnya: Validasi Dokumen'), findsOneWidget);

      await tester.enterText(find.byType(TextField).first, 'PO-88');
      await tester.tap(find.widgetWithText(FilledButton, 'Cari'));
      await tester.pumpAndSettle();

      expect(
        find.text('Langkah berikutnya: Validasi Dokumen'),
        findsNothing,
        reason: 'kartu lanjutan harus milik dokumen yang sedang dipindai',
      );
    });

    testWidgets('tanpa izin create, tombol Mulai Validasi tidak muncul', (
      tester,
    ) async {
      final service = FakeGateService()
        ..lookupResult = rencana('CHECKED_IN', po: 'PO-77');
      await tester.pumpWidget(
        wrap(
          GateCheckinScreen(service: service, onOpenValidation: (_) {}),
          authWith(['gate.view']),
          GateProvider(FakeGateService()),
        ),
      );
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField).first, 'PO-77');
      await tester.tap(find.widgetWithText(FilledButton, 'Cari'));
      await tester.pumpAndSettle();

      expect(find.text('Mulai Validasi →'), findsNothing);
    });

    testWidgets('dokumen selesai tidak menawarkan Validasi', (tester) async {
      final service = FakeGateService()
        ..lookupResult = rencana('COMPLETED', po: 'PO-77');
      await tester.pumpWidget(
        wrap(
          GateCheckinScreen(service: service, onOpenValidation: (_) {}),
          authWith(['gate.view', 'gate.create', 'sj_validation.create']),
          GateProvider(FakeGateService()),
        ),
      );
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField).first, 'PO-77');
      await tester.tap(find.widgetWithText(FilledButton, 'Cari'));
      await tester.pumpAndSettle();

      expect(find.text('Gate OUT'), findsOneWidget);
      expect(find.text('Mulai Validasi →'), findsNothing);
    });

    testWidgets('tanpa onOpenValidation tombol disembunyikan', (tester) async {
      final service = FakeGateService()
        ..lookupResult = rencana('CHECKED_IN', po: 'PO-77');
      await tester.pumpWidget(
        wrap(
          GateCheckinScreen(service: service),
          authWith(['gate.view', 'sj_validation.create']),
          GateProvider(FakeGateService()),
        ),
      );
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField).first, 'PO-77');
      await tester.tap(find.widgetWithText(FilledButton, 'Cari'));
      await tester.pumpAndSettle();

      expect(find.text('Mulai Validasi →'), findsNothing);
    });

    testWidgets('statistik gagal ditampilkan sebagai "—", bukan nol', (
      tester,
    ) async {
      final gate = GateProvider(FakeGateService()..statsError = networkError());
      await tester.pumpWidget(
        wrap(const GateCheckinScreen(), authWith(['gate.view']), gate),
      );
      await tester.pumpAndSettle();
      await gate.loadStats();
      await tester.pumpAndSettle();

      expect(find.textContaining('Statistik gagal dimuat'), findsOneWidget);
      // Empat chip statistik menampilkan "—", bukan angka 0 yang Never ada.
      // `find.text('0')` tidak bisa dipakai sebagai bukti: angka total riwayat
      // juga sah bernilai 0 dan tidak boleh ikut dianggap salah.
      expect(find.text('—'), findsNWidgets(4));
      expect(find.text('0'), findsOneWidget);
      expect(find.text('Coba lagi'), findsOneWidget);
    });

    testWidgets('riwayat menampilkan tipe Masuk/Keluar + label status', (
      tester,
    ) async {
      final gate = GateProvider(
        FakeGateService()
          ..historyResult = GateHistoryPage(
            currentPage: 1,
            lastPage: 1,
            total: 2,
            items: [
              historyItem(rkStatus: 'CHECKED_IN'),
              historyItem(
                id: 2,
                gateType: 'OUTBOUND',
                po: 'PO-2',
                nopol: 'B 2 BB',
                rkStatus: 'COMPLETED',
              ),
            ],
          ),
      );
      await tester.pumpWidget(
        wrap(const GateCheckinScreen(), authWith(['gate.view']), gate),
      );
      await tester.pumpAndSettle();
      await gate.loadHistory(reset: true);
      await tester.pumpAndSettle();

      expect(find.text('Riwayat Gate'), findsOneWidget);
      expect(find.text('Masuk'), findsOneWidget);
      expect(find.text('Keluar'), findsOneWidget);
      expect(find.text('Check In'), findsWidgets);
      expect(find.text('Selesai'), findsWidgets);
    });

    testWidgets('status dokumen di riwayat memakai pill berwarna, bukan teks', (
      tester,
    ) async {
      useTallScreen(tester);
      final gate = GateProvider(
        FakeGateService()
          ..historyResult = GateHistoryPage(
            currentPage: 1,
            lastPage: 1,
            total: 3,
            items: [
              historyItem(id: 1, rkStatus: 'SCHEDULED'),
              historyItem(
                id: 2,
                gateType: 'OUTBOUND',
                po: 'PO-2',
                nopol: 'B 2 BB',
                rkStatus: 'COMPLETED',
              ),
              historyItem(
                id: 3,
                po: 'PO-3',
                nopol: 'B 3 CC',
                rkStatus: 'CANCELLED',
              ),
            ],
          ),
      );
      await tester.pumpWidget(
        wrap(const GateCheckinScreen(), authWith(['gate.view']), gate),
      );
      await gate.loadHistory(reset: true);
      await tester.pumpAndSettle();

      // Web memakai komponen `StatusPill` yang sama untuk status dokumen di
      // baris riwayat (`gate/page.tsx`); warna harus bisa dipindai, bukan
      // teks abu-abu yang selalu sama untuk semua status.
      PillTone? toneOf(String label) {
        final pill = find
            .ancestor(of: find.text(label), matching: find.byType(StatusPill))
            .evaluate()
            .map((e) => (e.widget as StatusPill).tone)
            .toSet();
        return pill.length == 1 ? pill.single : null;
      }

      expect(toneOf('Dijadwalkan'), PillTone.blue);
      expect(toneOf('Selesai'), PillTone.success);
      expect(toneOf('Dibatalkan'), PillTone.danger);
    });

    testWidgets('waktu scan di riwayat ikut detik, sama seperti web', (
      tester,
    ) async {
      useTallScreen(tester);
      // Offset eksplisit supaya hasil format tidak ikut bergantung pada zona
      // waktu mesin test.
      final stamp = formatGateTimestamp('2026-09-25T10:07:09+07:00');

      expect(stamp, '25/09/2026 10:07:09');
      expect(formatGateTimestamp(''), isNull);
      expect(formatGateTimestamp('bukan tanggal'), 'bukan tanggal');
    });

    testWidgets('pencarian yang tidak menemukan hasil menawarkan hapus', (
      tester,
    ) async {
      useTallScreen(tester);
      final service = FakeGateService();
      final gate = GateProvider(service);
      await tester.pumpWidget(
        wrap(const GateCheckinScreen(), authWith(['gate.view']), gate),
      );
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField).last, 'B 999');
      await tester.pump(const Duration(milliseconds: 500));
      await tester.pumpAndSettle();

      expect(service.calls, contains('history:1:B 999'));
      expect(find.text('Tidak ada hasil untuk "B 999"'), findsOneWidget);
      expect(find.text('Hapus pencarian'), findsOneWidget);
      expect(find.textContaining('Belum ada transaksi gate'), findsNothing);

      await tester.tap(find.byKey(const Key('gate-history-clear-search')));
      await tester.pumpAndSettle();

      expect(
        service.calls,
        contains('history:1:'),
        reason: 'daftar harus kembali penuh, bukan tetap terfilter',
      );
      expect(find.textContaining('Tidak ada hasil untuk'), findsNothing);
    });

    testWidgets('status tanpa aksi gate tetap dijelaskan', (tester) async {
      useTallScreen(tester);
      final service = FakeGateService()
        ..lookupResult = rencana('SOMETHING_NEW', po: 'PO-42');
      await tester.pumpWidget(
        wrap(
          GateCheckinScreen(service: service),
          authWith(['gate.view', 'gate.create']),
          GateProvider(FakeGateService()),
        ),
      );
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField).first, 'PO-42');
      await tester.tap(find.widgetWithText(FilledButton, 'Cari'));
      await tester.pumpAndSettle();

      // Fallback yang sama dengan web: `STATUS_GUIDE[status] ?? 'Status ini
      // tidak memiliki aksi gate.'` — diam saja akan terbaca sebagai gagal
      // memuat.
      expect(find.text('Status ini tidak memiliki aksi gate.'), findsOneWidget);
    });

    test(
      'aksi gate yang tersimpan bergetar sekali, gagal tidak bergetar',
      () async {
        final haptics = recordHaptics();
        final session = GateSessionProvider(
          FakeGateService()..lookupResult = rencana('SCHEDULED', po: 'PO-7'),
        );
        await session.lookup('PO-7');

        expect(await session.gateIn(), isTrue);
        expect(
          haptics,
          ['HapticFeedbackType.mediumImpact'],
          reason: 'satu aksi = satu getar, hanya setelah server mengonfirmasi',
        );

        haptics.clear();
        final gagal = GateSessionProvider(
          FakeGateService()
            ..lookupResult = rencana('SCHEDULED', po: 'PO-8')
            ..actionError = StateError('koneksi terputus'),
        );
        await gagal.lookup('PO-8');
        expect(await gagal.gateIn(), isFalse);
        expect(
          haptics,
          isEmpty,
          reason:
              'getar menandakan sukses; kegagalan tidak boleh bergetar sama sekali',
        );
      },
    );

    testWidgets('dialog konfirmasi menampilkan peringatan sebelum data', (
      tester,
    ) async {
      useTallScreen(tester);
      final service = FakeGateService()
        ..lookupResult = rencana('SCHEDULED', po: 'PO-77');
      await tester.pumpWidget(
        wrap(
          GateCheckinScreen(service: service),
          authWith(['gate.view', 'gate.create']),
          GateProvider(FakeGateService()),
        ),
      );
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField).first, 'PO-77');
      await tester.tap(find.widgetWithText(FilledButton, 'Cari'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Gate IN →'));
      await tester.pumpAndSettle();

      expect(
        find.textContaining('aksi ini tersimpan permanen'),
        findsOneWidget,
      );
      expect(
        find.textContaining('berubah menjadi Check In'),
        findsOneWidget,
        reason: 'kalimat dampak harus sama dengan web',
      );
    });

    testWidgets('riwayat yang sedang dimuat memakai skeleton, bukan spinner', (
      tester,
    ) async {
      final service = FakeGateService()..historyGate = Completer<void>();
      final gate = GateProvider(service);
      await tester.pumpWidget(
        wrap(const GateCheckinScreen(), authWith(['gate.view']), gate),
      );
      // Sengaja tidak `await`: respons ditahan sampai test melepas gerbang,
      // jadi state "sedang memuat" benar-benar sempat dirender.
      unawaited(gate.loadHistory(reset: true));
      await tester.pump();

      expect(find.byType(SkeletonList), findsOneWidget);
      expect(find.byType(CircularProgressIndicator), findsNothing);

      service.historyGate!.complete();
      await tester.pumpAndSettle();
      expect(find.byType(SkeletonList), findsNothing);
    });
  });
}
