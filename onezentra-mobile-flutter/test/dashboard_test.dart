import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:onezentra_mobile/features/auth/auth_provider.dart';
import 'package:onezentra_mobile/features/auth/auth_user.dart';
import 'package:onezentra_mobile/features/dashboard/dashboard_modules.dart';
import 'package:onezentra_mobile/features/dashboard/dashboard_provider.dart';
import 'package:onezentra_mobile/features/dashboard/dashboard_service.dart';
import 'package:onezentra_mobile/features/dashboard/dashboard_screen.dart';
import 'package:onezentra_mobile/features/dashboard/models/dashboard_format.dart';
import 'package:onezentra_mobile/features/dashboard/models/dashboard_models.dart';
import 'package:onezentra_mobile/features/gate/gate_provider.dart';

import 'support/test_harness.dart';

void main() {
  group('DashboardSummary', () {
    test('memeta payload dashboard/summary', () {
      final summary = DashboardSummary.fromJson(<String, dynamic>{
        'depot': 'SBY',
        'totals': <String, dynamic>{'gate': 12, 'sj_validation': 3},
        'new_7d': <String, dynamic>{'gate': 4},
        'alerts': <String, dynamic>{
          'expired_kritis': 2,
          'expired_total': 7,
          'standarisasi_pending': 1,
        },
        'quality': <String, dynamic>{'npn_no_volume': 3, 'npn_no_umur': 2},
        'sla': <String, dynamic>{
          'avg_gate_to_receiving_hours': 3.0,
          'sj_open_count': 2,
          'sj_oldest_days': 4,
        },
        'recent': <Map<String, dynamic>>[
          <String, dynamic>{
            'type': 'Validasi SJ',
            'title': 'PO-1',
            'subtitle': 'Budi',
            'href': '/validasi-sj',
            'at': '2026-09-26T10:00:00Z',
          },
        ],
      });

      expect(summary.depot, 'SBY');
      expect(summary.totalOf('gate'), 12);
      expect(summary.deltaOf('gate'), 4);
      expect(
        summary.totalOf('tidak_ada'),
        isNull,
        reason: 'modul tanpa izin tidak dikirim backend',
      );
      expect(summary.alerts.expiredKritis, 2);
      expect(summary.quality.incomplete, 5);
      expect(summary.sla.avgGateToReceivingHours, 3.0);
      expect(summary.sla.sjOldestDays, 4);
      expect(summary.recent.single.targetTab, 'validation');
    });

    test('payload rusak tidak membuat crash', () {
      final summary = DashboardSummary.fromJson(<String, dynamic>{
        'totals': 'bukan-map',
        'alerts': null,
        'recent': 'bukan-list',
      });

      expect(summary.totals, isEmpty);
      expect(summary.alerts.expiredTotal, 0);
      expect(summary.sla.sjOpenCount, 0);
      expect(summary.recent, isEmpty);
      expect(summary.depot, isNull);
    });

    test('href modul non-mobile dipetakan ke null (tidak ada tab tujuan)', () {
      // `/standarisasi` kini punya halaman penuh di mobile, jadi bukan lagi
      // kandidat "segera hadir" — dipetakan lewat [targetPage].
      const item = DashboardRecentItem(
        type: 'Produk',
        title: 'Beras Premium 5kg',
        subtitle: '',
        href: '/npn',
      );

      expect(item.targetTab, isNull);
      expect(item.targetPage, isNull);
    });

    test('href standarisasi dipetakan ke halaman, bukan tab', () {
      const item = DashboardRecentItem(
        type: 'Standarisasi',
        title: 'Tumpukan A',
        subtitle: '',
        href: '/standarisasi',
      );

      expect(item.targetTab, isNull);
      expect(item.targetPage, DashboardPage.standarisasi);
    });

    test('rencana kirim diarahkan ke tab Check In', () {
      // Di web href-nya `/rencana-kirim`; di mobile daftar rencana kirim itu
      // lived di tab Check In. Kalau pemetaan ini hilang, operator ketemu
      // "segera hadir" padahal PO-nya bisa diactionkan.
      const item = DashboardRecentItem(
        type: 'Rencana Kirim',
        title: 'PO-77',
        subtitle: 'CHECKED_IN',
        href: '/rencana-kirim',
      );

      expect(item.targetTab, 'gate');
    });

    test('payload nyata dari backend terurai tanpa kehilangan angka', () {
      // Fixture diambil dari `GET /api/v1/dashboard/summary` (server dev,
      // 26 Sep 2026). Tujuannya mendeteksi perubahan kontrak backend yang
      // membuat angka di layar Beranda diam-diam jadi nol.
      final summary = DashboardSummary.fromJson(
        jsonDecode(
              File('test/fixtures/dashboard_summary.json').readAsStringSync(),
            )
            as Map<String, dynamic>,
      );

      expect(summary.depot, 'SBY');
      expect(summary.totalOf('gate'), 2);
      expect(summary.totalOf('sj_validation'), 3);
      expect(summary.totalOf('npn'), 1048);
      expect(summary.totalOf('standar_umur'), 1208);
      expect(summary.alerts.standarisasiPending, 1);
      expect(summary.quality.npnNoUmur, 11);
      expect(summary.sla.sjOpenCount, 1);
      expect(summary.sla.avgGateToReceivingHours, isNull);
      expect(summary.recent, isNotEmpty);
      expect(
        summary.recent.map((r) => r.targetTab),
        everyElement(anyOf('gate', 'validation', isNull)),
      );
      expect(
        summary.recent.where((r) => r.targetTab == 'validation'),
        isNotEmpty,
        reason: 'server dev punya validasi IN_PROGRESS',
      );
    });
  });

  group('format Bahasa Indonesia', () {
    test('sapaan mengikuti jam', () {
      expect(greetingFor(7), 'Selamat pagi');
      expect(greetingFor(12), 'Selamat siang');
      expect(greetingFor(16), 'Selamat sore');
      expect(greetingFor(21), 'Selamat malam');
      // Batas jam tidak boleh tumpang tindih.
      expect(greetingFor(10), 'Selamat pagi');
      expect(greetingFor(11), 'Selamat siang');
      expect(greetingFor(14), 'Selamat siang');
      expect(greetingFor(15), 'Selamat sore');
      expect(greetingFor(17), 'Selamat sore');
      expect(greetingFor(18), 'Selamat malam');
      expect(greetingFor(3), 'Selamat malam');
    });

    test('tanggal panjang memakai nama hari & bulan Indonesia', () {
      expect(formatLongDate(DateTime(2026, 9, 26)), 'Sabtu, 26 September 2026');
      expect(formatLongDate(DateTime(2026, 1, 1)), 'Kamis, 1 Januari 2026');
      expect(formatLongDate(DateTime(2026, 12, 31)), 'Kamis, 31 Desember 2026');
    });

    test('waktu relatif mengikuti ambang yang sama dengan web', () {
      final now = DateTime(2026, 9, 26, 12, 0);

      expect(formatRelativeTime(null, now: now), '');
      expect(formatRelativeTime('bukan-tanggal', now: now), '');
      expect(formatRelativeTime('2026-09-26T11:59:30', now: now), 'baru saja');
      expect(
        formatRelativeTime('2026-09-26T11:45:00', now: now),
        '15 mnt lalu',
      );
      expect(formatRelativeTime('2026-09-26T09:00:00', now: now), '3 jam lalu');
      expect(
        formatRelativeTime('2026-09-24T12:00:00', now: now),
        '2 hari lalu',
      );
      expect(formatRelativeTime('2026-09-01T12:00:00', now: now), '1 Sep 2026');
    });

    test('timestamp di masa depan tidak tampil sebagai minus', () {
      final now = DateTime(2026, 9, 26, 12, 0);

      expect(formatRelativeTime('2026-09-26T12:30:00', now: now), 'baru saja');
    });
  });

  group('kartu peringatan', () {
    DashboardSummary summaryWith({
      int expired = 0,
      int kritis = 0,
      int pending = 0,
      int sjOpen = 0,
      int? oldestDays,
      int npnIncomplete = 0,
      double? slaHours,
    }) {
      return DashboardSummary(
        totals: const {},
        new7d: const {},
        alerts: DashboardAlerts(
          expiredKritis: kritis,
          expiredTotal: expired,
          standarisasiPending: pending,
        ),
        quality: DashboardQuality(npnNoVolume: npnIncomplete, npnNoUmur: 0),
        sla: DashboardSla(
          avgGateToReceivingHours: slaHours,
          sjOpenCount: sjOpen,
          sjOldestDays: oldestDays,
        ),
        recent: const [],
      );
    }

    test('hanya menampilkan kartu yang jumlahnya > 0', () {
      final alerts = buildDashboardAlerts(summaryWith(), (_) => true);

      expect(alerts, isEmpty);
    });

    test('hanya menampilkan kartu yang izinnya dimiliki', () {
      final alerts = buildDashboardAlerts(
        summaryWith(expired: 7, kritis: 2, sjOpen: 1),
        (_) => false,
      );

      expect(alerts, isEmpty);
    });

    test('isi kartu mengikuti data ringkasan', () {
      final alerts = buildDashboardAlerts(
        summaryWith(
          expired: 7,
          kritis: 2,
          sjOpen: 3,
          oldestDays: 4,
          npnIncomplete: 5,
          slaHours: 3.5,
        ),
        (_) => true,
      );

      expect(alerts.map((a) => a.label), <String>[
        'Kritis / Kedaluwarsa',
        'Validasi Terbuka',
        'Data Produk Kurang',
        'Gate → Receiving',
      ]);
      expect(alerts.first.value, '7');
      expect(alerts.first.hint, '2 kritis perlu tindakan');
      expect(alerts[1].tab, 'validation');
      expect(alerts.last.value, '3.5 jam');
    });

    test('SLA bulat tidak tampil dengan ,0', () {
      final alerts = buildDashboardAlerts(
        summaryWith(slaHours: 3),
        (_) => true,
      );

      expect(alerts.single.value, '3 jam');
    });
  });

  group('daftar modul', () {
    test('key modul harus sama dengan key di payload backend', () {
      // Hard-coded supaya backend yang mengganti nama key langsung terlihat
      // di test, bukan baru saat angkanya kosong di layar.
      expect(dashboardModules.map((m) => m.key).toList(), <String>[
        'rencana_kirim',
        'gate',
        'penerimaan',
        'receiving',
        'sj_validation',
        'npn',
        'standar_umur',
        'standarisasi',
      ]);
    });

    test('hanya modul yang punya halaman mobile yang punya tab tujuan', () {
      final withTab = dashboardModules
          .where((m) => m.tab != null)
          .map((m) => m.tab)
          .toList();

      expect(withTab, <String>['gate', 'validation']);
    });
  });

  group('DashboardService', () {
    test('mengambil summary dan meneruskan kode depo', () async {
      final dio = Dio(BaseOptions(baseUrl: 'https://contoh.test/api/v1'));
      dio.httpClientAdapter = CannedHttpAdapter(<String, dynamic>{
        'data': <String, dynamic>{
          'totals': <String, dynamic>{'gate': 5},
        },
      });

      final summary = await DashboardService(dio).summary(kodeDepo: 'SBY');

      expect(summary.totalOf('gate'), 5);
      final request =
          (dio.httpClientAdapter as CannedHttpAdapter).requests.single;
      expect(request.queryParameters, <String, dynamic>{'kode_depo': 'SBY'});
    });

    test('tanpa kode depo tidak mengirim parameter kosong', () async {
      final dio = Dio(BaseOptions(baseUrl: 'https://contoh.test/api/v1'));
      dio.httpClientAdapter = CannedHttpAdapter(<String, dynamic>{
        'data': <String, dynamic>{},
      });

      await DashboardService(dio).summary();

      final request =
          (dio.httpClientAdapter as CannedHttpAdapter).requests.single;
      expect(request.queryParameters, isEmpty);
    });

    test('respons tanpa data defiantifikan', () async {
      final dio = Dio(BaseOptions(baseUrl: 'https://conzentra.test/api/v1'))
        ..httpClientAdapter = CannedHttpAdapter(<String, dynamic>{});

      expect(() => DashboardService(dio).summary(), throwsA(isA<StateError>()));
    });
  });

  group('DashboardProvider', () {
    test('memuat ringkasan lalu menandainya siap', () async {
      final service = FakeDashboardService()
        ..summaryResult = dashboardSummary();
      final provider = DashboardProvider(service);

      await provider.load();

      expect(provider.hasData, isTrue);
      expect(provider.error, isNull);
      expect(provider.loading, isFalse);
      expect(service.calls, 1);
    });

    test('load kedua dalam masa cache tidak=request lagi', () async {
      final service = FakeDashboardService()
        ..summaryResult = dashboardSummary();
      var now = DateTime(2026, 9, 26, 12);
      final provider = DashboardProvider(service, () => now);

      await provider.load();
      now = now.add(const Duration(seconds: 30));
      await provider.load();

      expect(service.calls, 1);
    });

    test('cache basi memicu request baru', () async {
      final service = FakeDashboardService()
        ..summaryResult = dashboardSummary();
      var now = DateTime(2026, 9, 26, 12);
      final provider = DashboardProvider(service, () => now);

      await provider.load();
      now = now.add(dashboardCacheTtl);
      await provider.load();

      expect(service.calls, 2);
    });

    test('reload mengabaikan masa cache', () async {
      final service = FakeDashboardService()
        ..summaryResult = dashboardSummary();
      var now = DateTime(2026, 9, 26, 12);
      final provider = DashboardProvider(service, () => now);

      await provider.load();
      now = now.add(const Duration(seconds: 5));
      await provider.reload();

      expect(service.calls, 2);
    });

    test('gagal memuat tidak membuat data lama dianggap segar', () async {
      var now = DateTime(2026, 9, 26, 12);
      final service = FakeDashboardService()..summaryError = dioError(500);
      final provider = DashboardProvider(service, () => now);

      await provider.load();
      expect(provider.error, isNotNull);

      now = now.add(const Duration(seconds: 1));
      await provider.load();

      expect(service.calls, 2, reason: 'gagal muat harus dicoba lagi');
    });

    test('kegagalan disimpan sebagai pesan, bukan angka nol', () async {
      final service = FakeDashboardService()
        ..summaryError = dioError(500, message: 'boom');
      final provider = DashboardProvider(service);

      await provider.load();

      expect(provider.error, isNotNull);
      expect(provider.hasData, isFalse);
    });

    test('error lama dibuang setelah pemuatan berhasil', () async {
      final service = FakeDashboardService()
        ..summaryError = dioError(500, message: 'x');
      final provider = DashboardProvider(service);

      await provider.load();
      expect(provider.error, isNotNull);

      service
        ..summaryError = null
        ..summaryResult = dashboardSummary();
      await provider.reload();

      expect(provider.error, isNull);
      expect(provider.hasData, isTrue);
    });

    test('reset membuang ringkasan akun sebelumnya', () async {
      final service = FakeDashboardService()
        ..summaryResult = dashboardSummary();
      final provider = DashboardProvider(service);

      await provider.load();
      provider.reset();

      expect(provider.hasData, isFalse);
      expect(provider.error, isNull);
    });

    test('reset membatalkan request yang sedang berjalan', () async {
      final service = FakeDashboardService();
      final provider = DashboardProvider(service);
      final pending = provider.load();

      provider.reset();
      service.summaryResult = dashboardSummary();
      await pending;

      expect(provider.hasData, isFalse);
    });
  });

  group('layar Beranda', () {
    AuthProvider authWith(List<String> permissions) {
      final auth = AuthProvider(FakeAuthService());
      auth.user = testUser;
      auth.permissions = permissions;
      auth.isRestoring = false;
      return auth;
    }

    Widget wrap(
      AuthProvider auth,
      DashboardProvider dashboard, {
      void Function(String tabKey)? onOpenTab,
      void Function(String moduleLabel)? onUnavailable,
      Future<void> Function(DashboardPage page)? onOpenPage,
    }) {
      return MultiProvider(
        providers: [
          ChangeNotifierProvider<AuthProvider>.value(value: auth),
          ChangeNotifierProvider<GateProvider>(
            create: (_) => GateProvider(FakeGateService()),
          ),
          ChangeNotifierProvider<DashboardProvider>.value(value: dashboard),
        ],
        child: MaterialApp(
          home: DashboardScreen(
            onOpenTab: onOpenTab ?? (tabKey) {},
            onUnavailable: onUnavailable,
            onOpenPage: onOpenPage,
          ),
        ),
      );
    }

    /// Layar test default 800x600: kartu peringatan & aktivitas terbaru berada
    /// di bawah lipatan, jadi viewport diperbesar agar bisa diketuk langsung.
    void useTallScreen(WidgetTester tester) {
      tester.view.physicalSize = const Size(480, 2400);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
    }

    testWidgets('kartu peringatan Validasi Terbuka membuka tab Validasi', (
      tester,
    ) async {
      useTallScreen(tester);
      final opened = <String>[];
      final dashboard = DashboardProvider(
        FakeDashboardService()
          ..summaryResult = dashboardSummary(
            sla: const DashboardSla(sjOpenCount: 2, sjOldestDays: 3),
          ),
      );

      await tester.pumpWidget(
        wrap(
          authWith(const ['sj_validation.view', 'dashboard.view']),
          dashboard,
          onOpenTab: opened.add,
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('PERLU PERHATIAN'), findsOneWidget);
      expect(find.text('VALIDASI TERBUKA'), findsOneWidget);
      expect(find.text('tertua 3 hari'), findsOneWidget);

      await tester.tap(find.text('VALIDASI TERBUKA'));
      await tester.pump();
      expect(opened, ['validation']);
    });

    testWidgets('baris aktivitas membuka tab sesuai href', (tester) async {
      useTallScreen(tester);
      final opened = <String>[];
      final dashboard = DashboardProvider(
        FakeDashboardService()
          ..summaryResult = dashboardSummary(
            recent: const <DashboardRecentItem>[
              DashboardRecentItem(
                type: 'Rencana Kirim',
                title: 'PO-77',
                subtitle: 'Budi',
                href: '/gate',
                at: null,
              ),
            ],
          ),
      );

      await tester.pumpWidget(
        wrap(
          authWith(const ['gate.view', 'dashboard.view']),
          dashboard,
          onOpenTab: opened.add,
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Aktivitas Terbaru'), findsOneWidget);
      expect(find.text('PO-77'), findsOneWidget);

      await tester.tap(find.text('PO-77'));
      await tester.pump();
      expect(opened, ['gate']);
    });

    testWidgets('baris aktivitas standarisasi membuka halaman Standarisasi', (
      tester,
    ) async {
      // `recent` backend mengirim `/standarisasi` untuk permintaan baru. Karena
      // halamannya sekarang ada di mobile, baris itu harus benar-benar membuka
      // halaman — bukan memberi tahu "segera hadir".
      useTallScreen(tester);
      final pages = <DashboardPage>[];
      final dashboard = DashboardProvider(
        FakeDashboardService()
          ..summaryResult = dashboardSummary(
            recent: const <DashboardRecentItem>[
              DashboardRecentItem(
                type: 'Standarisasi',
                title: 'Tumpukan A',
                subtitle: '',
                href: '/standarisasi',
                at: null,
              ),
            ],
          ),
      );

      await tester.pumpWidget(
        wrap(
          authWith(const ['standarisasi.view', 'dashboard.view']),
          dashboard,
          onOpenPage: (page) async => pages.add(page),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Tumpukan A'));
      await tester.pump();

      expect(pages, [DashboardPage.standarisasi]);
    });

    testWidgets('kartu modul Standarisasi membuka halaman Standarisasi', (
      tester,
    ) async {
      useTallScreen(tester);
      final pages = <DashboardPage>[];
      final dashboard = DashboardProvider(
        FakeDashboardService()
          ..summaryResult = dashboardSummary(
            totals: const <String, int>{'standarisasi': 3},
          ),
      );

      await tester.pumpWidget(
        wrap(
          authWith(const ['standarisasi.view', 'dashboard.view']),
          dashboard,
          onOpenPage: (page) async => pages.add(page),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('STANDARISASI'));
      await tester.pump();

      expect(pages, [DashboardPage.standarisasi]);
    });

    testWidgets('kartu peringatan Menunggu Approval membuka Standarisasi', (
      tester,
    ) async {
      useTallScreen(tester);
      final pages = <DashboardPage>[];
      final dashboard = DashboardProvider(
        FakeDashboardService()
          ..summaryResult = dashboardSummary(
            alerts: const DashboardAlerts(standarisasiPending: 1),
          ),
      );

      await tester.pumpWidget(
        wrap(
          authWith(const ['standarisasi.view', 'dashboard.view']),
          dashboard,
          onOpenPage: (page) async => pages.add(page),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('MENUNGGU APPROVAL'));
      await tester.pump();

      expect(pages, [DashboardPage.standarisasi]);
    });

    testWidgets('baris aktivitas modul tanpa halaman mobile menjelaskan', (
      tester,
    ) async {
      useTallScreen(tester);
      final unavailable = <String>[];
      final dashboard = DashboardProvider(
        FakeDashboardService()
          ..summaryResult = dashboardSummary(
            recent: const <DashboardRecentItem>[
              DashboardRecentItem(
                type: 'Produk',
                title: 'Beras Premium 5kg',
                subtitle: '',
                href: '/npn',
                at: null,
              ),
            ],
          ),
      );

      await tester.pumpWidget(
        wrap(
          authWith(const ['npn.view', 'dashboard.view']),
          dashboard,
          onUnavailable: unavailable.add,
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Beras Premium 5kg'));
      await tester.pump();

      expect(unavailable, ['Produk']);
    });

    /// Ringkasan terisi penuh: 8 modul + semua jenis peringatan + aktivitas
    /// terbaru. Ini kondisi terburuk untuk layout kartu 2 kolom.
    DashboardSummary worstCase() => DashboardSummary(
      totals: const <String, int>{
        'rencana_kirim': 1234,
        'gate': 98765,
        'penerimaan': 4321,
        'receiving': 0,
        'sj_validation': 42,
        'npn': 1200,
        'standar_umur': 7,
        'standarisasi': 3,
      },
      new7d: const <String, int>{'gate': 1200, 'sj_validation': 5},
      alerts: const DashboardAlerts(
        expiredKritis: 12,
        expiredTotal: 340,
        standarisasiPending: 5,
      ),
      quality: const DashboardQuality(npnNoVolume: 3, npnNoUmur: 2),
      sla: const DashboardSla(
        avgGateToReceivingHours: 3.5,
        sjOpenCount: 2,
        sjOldestDays: 4,
      ),
      recent: const <DashboardRecentItem>[
        DashboardRecentItem(
          type: 'Validasi SJ',
          title: 'PO-TRANS-2026-0000001234567890',
          subtitle: 'Nama Ministries yang sangat panjang sekali',
          href: '/validasi-sj',
          at: '2026-09-26T10:00:00Z',
        ),
      ],
    );

    const semuaIzin = <String>[
      'dashboard.view',
      'rencana_kirim.view',
      'gate.view',
      'penerimaan.view',
      'receiving.view',
      'sj_validation.view',
      'npn.view',
      'standar_umur.view',
      'standarisasi.view',
      'opname.view',
    ];

    testWidgets('tidak meluber di berbagai ukuran layar & ukuran huruf', (
      tester,
    ) async {
      addTearDown(tester.view.reset);

      // Operator gudang memakai ponsel kelas bawah dengan layar sempit dan
      // sering meletakkan teks dalam skala besar. Kalau kartu meluber, angka
      // yang justru paling dibutuhkan justru terpotong.
      const ukuran = <(String, Size)>[
        ('ponsel kecil 320x568', Size(320, 568)),
        ('ponsel umum 360x800', Size(360, 800)),
        ('ponsel besar 414x896', Size(414, 896)),
        ('tablet 768x1024', Size(768, 1024)),
      ];

      for (final (nama, size) in ukuran) {
        for (final skala in [1.0, 1.3]) {
          tester.view.physicalSize = size;
          tester.view.devicePixelRatio = 1;
          final dashboard = DashboardProvider(
            FakeDashboardService()..summaryResult = worstCase(),
          );

          await tester.pumpWidget(
            MediaQuery(
              data: MediaQueryData(textScaler: TextScaler.linear(skala)),
              child: wrap(authWith(semuaIzin), dashboard),
            ),
          );
          await tester.pumpAndSettle();

          expect(
            tester.takeException(),
            isNull,
            reason: 'meluber di $nama dengan skala teks $skala',
          );
        }
      }
    });

    testWidgets('nama & depo panjang tidak meluber di header ponsel sempit', (
      tester,
    ) async {
      addTearDown(tester.view.reset);
      tester.view.physicalSize = const Size(320, 568);
      tester.view.devicePixelRatio = 1;

      // Nama orang & nama depo di database bisa jauh lebih panjang dari
      // "Gate User"/"Depo Test" — justru nama itulah yang dipotong lebih dulu
      // kalau header sempit, dan operator butuh tahu sedang masuk gudang mana.
      const auth = AuthUser(
        id: 1,
        kodeDepo: 'DPO-SURABAYA-TIMUR-01',
        namaDepo: 'Gudang Pusat Surabaya Timur',
        fullName: 'Abdulrahmanwijaya Kusumawardhani',
        email: 'abdul.kusumawardhani@onezentra.com',
        level: 'admin',
        status: 'active',
        roles: [],
      );
      final provider = AuthProvider(FakeAuthService());
      provider.user = auth;
      provider.permissions = semuaIzin;
      provider.isRestoring = false;

      await tester.pumpWidget(
        MediaQuery(
          data: const MediaQueryData(textScaler: TextScaler.linear(1.3)),
          child: wrap(
            provider,
            DashboardProvider(
              FakeDashboardService()..summaryResult = worstCase(),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(
        tester.takeException(),
        isNull,
        reason:
            'aksen nama di header dan chip depo harus ellipsis, bukan meluber',
      );
      expect(
        find.textContaining('Gudang Pusat Surabaya Timur'),
        findsOneWidget,
        reason: 'nama depo tetap terbaca walau dipotong',
      );
    });

    testWidgets('angka panjang dipisah ribuan dan tren tetap terbaca', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(360, 800);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);

      final dashboard = DashboardProvider(
        FakeDashboardService()..summaryResult = worstCase(),
      );

      await tester.pumpWidget(wrap(authWith(semuaIzin), dashboard));
      await tester.pumpAndSettle();

      expect(find.text('98.765'), findsOneWidget);
      expect(find.text('+1.200 minggu ini'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('gagal memuat menampilkan kartu error, bukan angka nol', (
      tester,
    ) async {
      final dashboard = DashboardProvider(
        FakeDashboardService()
          ..summaryError = dioError(500, message: 'server salah'),
      );

      await tester.pumpWidget(
        wrap(authWith(const ['gate.view', 'dashboard.view']), dashboard),
      );
      await tester.pumpAndSettle();

      expect(find.text('Coba lagi'), findsOneWidget);
      expect(find.text('–'), findsWidgets);
    });
  });
}
