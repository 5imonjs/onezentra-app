import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:onezentra_mobile/features/auth/auth_provider.dart';
import 'package:onezentra_mobile/features/standarisasi/models/standarisasi_models.dart';
import 'package:onezentra_mobile/features/standarisasi/standarisasi_provider.dart';
import 'package:onezentra_mobile/features/standarisasi/standarisasi_screen.dart';
import 'package:onezentra_mobile/widgets/denied_card.dart';
import 'package:onezentra_mobile/widgets/page_header.dart';
import 'package:onezentra_mobile/widgets/states.dart';

import 'support/haptics_recorder.dart';
import 'support/test_harness.dart';

void main() {
  // `decide()`/`create()` memanggil `HapticFeedback` setelah server mengonfirmasi,
  // dan `HapticFeedback` butuh binding. Diinisialisasi di sini supaya test
  // haptics tidak bergantung pada testWidgets lain yang kebetulan jalan
  // sebelumnya di file yang sama.
  TestWidgetsFlutterBinding.ensureInitialized();

  group('Model Standarisasi Tumpukan', () {
    test('memetakan payload list yang memuat relasi npn', () {
      final row = StandarisasiTumpukan.fromJson(<String, dynamic>{
        'id': 12,
        'npn_id': 34,
        'tier': 3,
        'tinggi_tumpukan': 2,
        'total_tier_tinggi': 6,
        'status': 'approved',
        'requested_by_email': 'req@onezentra.com',
        'approved_by_email': 'blc@onezentra.com',
        'kode_depo': 'DEP01',
        'nama_depo': 'Depo Jakarta',
        'created_at': '2026-09-20T08:00:00Z',
        'updated_at': '2026-09-21T08:00:00Z',
        'npn': <String, dynamic>{
          'id': 34,
          'BOSnetszProductId': '1000001',
          'SAPszProductId': '2000001',
          'szNickName': 'BERAS5',
          'szShortDescription': 'Beras Premium 5kg',
          'szBarcode': '8991002101215',
        },
      });

      expect(row.id, 12);
      expect(row.npnId, 34);
      expect(row.totalTumpukan, 6);
      expect(row.isApproved, isTrue);
      expect(row.isPending, isFalse);
      expect(row.npn?.bosId, '1000001');
      expect(row.npn?.name, 'Beras Premium 5kg');
      expect(row.requestedByEmail, 'req@onezentra.com');
    });

    test('total dihitung ulang bila backend belum menyimpannya', () {
      // Baris lama / baris yang dibuat tanpa dimensi bisa punya
      // `total_tier_tinggi: null`; web jatuh ke `tier * tinggi_tumpukan`.
      const row = StandarisasiTumpukan(
        id: 1,
        npnId: 2,
        tier: 4,
        tinggiTumpukan: 3,
        status: standarisasiStatusPending,
      );

      expect(row.totalTierTinggi, isNull);
      expect(row.totalTumpukan, 12);
      expect(row.dimensionSummary, '4 tier x 3 = 12');
    });

    test('payload dari item validasi tanpa relasi npn tetap terurai', () {
      // `SjValidationController::attachStandarisasiTumpukan` menyisipkan objek
      // ini tanpa `with('npn')` — kalau parser mengharuskan relasi, seluruh
      // daftar item validasi akan gagal dibuka.
      final row = StandarisasiTumpukan.fromJson(<String, dynamic>{
        'id': 5,
        'npn_id': 6,
        'tier': 1,
        'tinggi_tumpukan': 1,
        'status': 'pending',
      });

      expect(row.npn, isNull);
      expect(row.totalTumpukan, 1);
      expect(row.isPending, isTrue);
    });

    test('label & nada status sama dengan STATUS_META web', () {
      expect(standarisasiStatusLabel(standarisasiStatusPending), 'Menunggu');
      expect(standarisasiStatusLabel(standarisasiStatusApproved), 'Disetujui');
      expect(standarisasiStatusLabel(standarisasiStatusRejected), 'Ditolak');
      expect(standarisasiStatusLabel('aneh'), 'aneh');
    });

    test('clamp tier/tinggi mengikuti batas backend', () {
      // `StandarisasiTumpukanController::MAX_DIMENSION` = 100 dan form web
      // melakukan clamp yang sama; 0 ditolak backend (`min:1`).
      expect(clampStackDimension(null), 1);
      expect(clampStackDimension(0), 1);
      expect(clampStackDimension(-5), 1);
      expect(clampStackDimension(7), 7);
      expect(clampStackDimension(500), maxStackDimension);
    });

    test('nama produk mengikuti urutan fallback di web', () {
      expect(
        const NpnProduct(
          id: 1,
          bosId: 'B',
          sapId: 'S',
          barcode: 'C',
          shortDescription: 'Deskripsi',
          nickname: 'Nick',
        ).name,
        'Deskripsi',
      );
      expect(
        const NpnProduct(
          id: 1,
          bosId: 'B',
          sapId: 'S',
          barcode: 'C',
          nickname: 'Nick',
        ).name,
        'Nick',
      );
      expect(
        const NpnProduct(id: 1, bosId: 'B', sapId: 'S', barcode: 'C').name,
        '-',
      );
    });

    test('tanggal format id-ID, nilai rusak tidak jadi "null"', () {
      expect(formatStandarisasiDate('2026-09-26T08:00:00Z'), '26 Sep 2026');
      expect(formatStandarisasiDate(null), '-');
      expect(formatStandarisasiDate(''), '-');
      expect(formatStandarisasiDate('bukan tanggal'), 'bukan tanggal');
    });
  });

  group('StandarisasiProvider', () {
    test('memuat daftar & statistik lalu pagination', () async {
      final service = FakeStandarisasiService()
        ..listResult = const StandarisasiListPage(
          entries: [],
          currentPage: 1,
          lastPage: 2,
          total: 30,
        )
        ..statsResult = const StandarisasiStats(
          total: 30,
          pending: 4,
          approved: 25,
          rejected: 1,
        );
      final provider = StandarisasiProvider(service);

      await provider.load(reset: true);
      await provider.loadStats();
      expect(provider.totalRows, 30);
      expect(provider.page, 1);
      expect(provider.hasMore, isTrue);
      expect(provider.stats.pending, 4);

      service.listResult = const StandarisasiListPage(
        entries: [],
        currentPage: 2,
        lastPage: 2,
        total: 30,
      );
      await provider.loadMore();
      expect(provider.page, 2);
      expect(provider.hasMore, isFalse);
      expect(service.calls, containsAll(<String>['list:1:-:', 'stats:']));
    });

    test('ganti filter status hanya sekali saat nilainya sama', () async {
      final service = FakeStandarisasiService();
      final provider = StandarisasiProvider(service);

      await provider.setStatusFilter(standarisasiStatusPending);
      expect(provider.statusFilter, standarisasiStatusPending);
      final before = service.calls.where((c) => c.startsWith('list:')).length;

      await provider.setStatusFilter(standarisasiStatusPending);
      expect(service.calls.where((c) => c.startsWith('list:')).length, before);
    });

    test('kegagalan statistik tidak diam-diam jadi nol', () async {
      final service = FakeStandarisasiService()
        ..statsError = StateError('boom');
      final provider = StandarisasiProvider(service);

      await provider.loadStats();

      expect(provider.statsError, isNotNull);
      expect(provider.stats, StandarisasiStats.empty);
    });

    test(
      'gagal memuat daftar menyisakan pesan, bukan daftar kosong diam',
      () async {
        final provider = StandarisasiProvider(
          FakeStandarisasiService()..listError = StateError('boom'),
        );

        await provider.load(reset: true);

        expect(provider.error, isNotNull);
        expect(provider.loading, isFalse);
      },
    );

    test('approve menandai aksi berhasil dan menyegarkan daftar', () async {
      final service = FakeStandarisasiService()
        ..listResult = const StandarisasiListPage(
          entries: [],
          currentPage: 1,
          lastPage: 1,
          total: 1,
        );
      final provider = StandarisasiProvider(service);
      await provider.load(reset: true);

      final ok = await provider.decide(
        stackRow(id: 7, status: standarisasiStatusPending),
        approve: true,
      );

      expect(ok, isTrue);
      expect(service.decisions, <({int id, bool approve})>[
        (id: 7, approve: true),
      ]);
      expect(provider.notice?.isError, isFalse);
      expect(provider.notice?.message, contains('Standarisasi disetujui'));
    });

    test('gagal approve dilaporkan sebagai pesan gagal', () async {
      final provider = StandarisasiProvider(
        FakeStandarisasiService()..approveError = StateError('boom'),
      );

      final ok = await provider.decide(stackRow(id: 7), approve: true);

      expect(ok, isFalse);
      expect(provider.notice?.isError, isTrue);
      expect(provider.notice?.message, isNotNull);
    });

    test('reject memakai endpoint reject', () async {
      final service = FakeStandarisasiService();
      final provider = StandarisasiProvider(service);

      final ok = await provider.decide(stackRow(id: 3), approve: false);

      expect(ok, isTrue);
      expect(service.decisions.single.approve, isFalse);
      expect(provider.notice?.message, contains('ditolak'));
    });

    test('keputusan bergetar berbeda untuk setujui dan tolak', () async {
      final haptics = recordHaptics();
      final provider = StandarisasiProvider(FakeStandarisasiService());

      await provider.decide(stackRow(id: 1), approve: true);
      await provider.decide(stackRow(id: 2), approve: false);

      expect(
        haptics,
        <String>[
          'HapticFeedbackType.mediumImpact',
          'HapticFeedbackType.heavyImpact',
        ],
        reason:
            'menolak standarisasi menutup item validasi untuk semua operator, '
            'jadi harus terasa lebih berat daripada menyetujui',
      );
    });

    test('keputusan yang gagal tidak bergetar', () async {
      final haptics = recordHaptics();
      final provider = StandarisasiProvider(
        FakeStandarisasiService()..approveError = StateError('boom'),
      );

      await provider.decide(stackRow(id: 1), approve: true);

      expect(provider.notice?.isError, isTrue);
      expect(haptics, isEmpty);
    });
  });

  group('Layar Standarisasi Tumpukan', () {
    /// Izin yang dipakai majority test; per-test menambah izin yang relevan
    /// (mis. `standarisasi.create` untuk form tambah).
    const basePermissions = <String>['standarisasi.view', 'dashboard.view'];

    AuthProvider authWith(List<String> permissions) {
      final auth = AuthProvider(FakeAuthService());
      auth.user = testUser;
      auth.permissions = permissions;
      auth.isRestoring = false;
      return auth;
    }

    /// Layar test default 800x600: header + chip filter + beberapa baris
    /// melewati lipatan, jadi viewport dibuat tinggi.
    void useTallScreen(WidgetTester tester) {
      tester.view.physicalSize = const Size(480, 2400);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
    }

    Widget wrap(
      AuthProvider auth,
      FakeStandarisasiService service, {
      String? initialProductCode,
    }) {
      return MultiProvider(
        providers: [ChangeNotifierProvider<AuthProvider>.value(value: auth)],
        child: MaterialApp(
          home: StandarisasiScreen(
            service: service,
            initialProductCode: initialProductCode,
          ),
        ),
      );
    }

    testWidgets('menampilkan statistik & baris dari server', (tester) async {
      useTallScreen(tester);
      final service = FakeStandarisasiService()
        ..statsResult = const StandarisasiStats(
          total: 3,
          pending: 1,
          approved: 1,
          rejected: 1,
        )
        ..listResult = StandarisasiListPage(
          entries: <StandarisasiTumpukan>[
            stackRow(
              id: 1,
              tier: 3,
              tinggi: 2,
              status: standarisasiStatusPending,
              product: npnProduct(),
            ),
            stackRow(
              id: 2,
              tier: 5,
              tinggi: 4,
              status: standarisasiStatusApproved,
              product: npnProduct(id: 2, bosId: '1000002', name: 'Minyak 2L'),
            ),
          ],
          currentPage: 1,
          lastPage: 1,
          total: 2,
        );

      await tester.pumpWidget(wrap(authWith(basePermissions), service));
      await tester.pumpAndSettle();

      expect(find.text('Standarisasi Tumpukan'), findsOneWidget);
      expect(
        find.text('Kelola standarisasi tumpukan produk per depo'),
        findsOneWidget,
      );
      // Empat angka ringkasan di pita header (labelnya sama dengan label pill
      // status, jadi diperiksa di dalam header supaya tidak tertukar).
      final header = find.byType(PageHeader);
      for (final label in ['Total', 'Menunggu', 'Disetujui', 'Ditolak']) {
        expect(
          find.descendant(of: header, matching: find.text(label)),
          findsOneWidget,
          reason: 'header harus punya angka ringkasan "$label"',
        );
      }
      // Baris: BOS ID mono, nama produk, dimensi, status. Dimensi kedua baris
      // sengaja dibuat berbeda supaya chip tidak tertukar.
      expect(find.text('1000001'), findsOneWidget);
      expect(find.text('Beras Premium 5kg'), findsOneWidget);
      expect(find.text('Tier 3'), findsOneWidget);
      expect(find.text('Tinggi 2'), findsOneWidget);
      expect(find.text('6 total'), findsOneWidget);
      expect(find.text('Tier 5'), findsOneWidget);
      expect(find.text('20 total'), findsOneWidget);
      expect(
        find.descendant(
          of: find.byKey(const Key('standarisasi-row-1')),
          matching: find.text('Menunggu'),
        ),
        findsOneWidget,
      );
      expect(
        find.descendant(
          of: find.byKey(const Key('standarisasi-row-2')),
          matching: find.text('Disetujui'),
        ),
        findsOneWidget,
      );
    });

    testWidgets('filter status meneruskan pilihan ke server', (tester) async {
      useTallScreen(tester);
      final service = FakeStandarisasiService();

      await tester.pumpWidget(wrap(authWith(basePermissions), service));
      await tester.pumpAndSettle();

      await tester.tap(find.widgetWithText(FilterChip, 'Menunggu'));
      await tester.pumpAndSettle();

      expect(
        service.calls,
        contains('list:1:pending:'),
        reason: 'filter status harus diteruskan ke endpoint',
      );
    });

    testWidgets('pencarian didebounce lalu meneruskan kata kunci', (
      tester,
    ) async {
      useTallScreen(tester);
      final service = FakeStandarisasiService();

      await tester.pumpWidget(wrap(authWith(basePermissions), service));
      await tester.pumpAndSettle();

      await tester.enterText(
        find.byKey(const Key('standarisasi-search')),
        'beras',
      );
      await tester.pump(const Duration(milliseconds: 500));
      await tester.pumpAndSettle();

      expect(service.calls, contains('list:1:-:beras'));
    });

    testWidgets('kegagalan daftar menampilkan kartu error + coba lagi', (
      tester,
    ) async {
      useTallScreen(tester);
      final service = FakeStandarisasiService()..listError = StateError('boom');

      await tester.pumpWidget(wrap(authWith(basePermissions), service));
      await tester.pumpAndSettle();

      expect(find.byType(ErrorCard), findsOneWidget);

      service.listError = null;
      await tester.tap(find.widgetWithText(TextButton, 'Coba lagi'));
      await tester.pumpAndSettle();

      expect(find.byType(ErrorCard), findsNothing);
    });

    testWidgets('daftar kosong menawarkan membuat standarisasi', (
      tester,
    ) async {
      useTallScreen(tester);
      final service = FakeStandarisasiService();

      await tester.pumpWidget(
        wrap(
          authWith(const [...basePermissions, 'standarisasi.create']),
          service,
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Belum ada standarisasi tumpukan'), findsOneWidget);
      expect(
        find.widgetWithText(FilledButton, 'Tambah Standarisasi'),
        findsOneWidget,
      );
    });

    testWidgets('tanpa izin menampilkan penolakan, bukan daftar', (
      tester,
    ) async {
      useTallScreen(tester);
      final service = FakeStandarisasiService();

      await tester.pumpWidget(wrap(authWith(const <String>[]), service));
      await tester.pumpAndSettle();

      expect(find.byType(DeniedCard), findsOneWidget);
      expect(
        service.calls,
        isEmpty,
        reason: 'tanpa standarisasi.view tidak boleh menembak endpoint',
      );
    });

    testWidgets('form tambah mengirim tier & tinggi yang sudah di-clamp', (
      tester,
    ) async {
      useTallScreen(tester);
      final service = FakeStandarisasiService()
        ..productResult = <NpnProduct>[npnProduct()];

      await tester.pumpWidget(
        wrap(
          authWith(const [...basePermissions, 'standarisasi.create']),
          service,
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byTooltip('Tambah Standarisasi'));
      await tester.pumpAndSettle();

      await tester.enterText(
        find.byKey(const Key('standarisasi-product-search')),
        'beras',
      );
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('standarisasi-product-1')));
      await tester.pumpAndSettle();

      await tester.enterText(find.byKey(const Key('standarisasi-tier')), '4');
      await tester.enterText(
        find.byKey(const Key('standarisasi-tinggi')),
        '999',
      );
      await tester.pumpAndSettle();

      // Pratinjau memakai nilai yang benar-benar dikirim.
      expect(find.textContaining('4 tier x 100 tinggi = 400'), findsOneWidget);

      await tester.tap(find.byKey(const Key('standarisasi-create-save')));
      await tester.pumpAndSettle();

      expect(service.creates.single.tier, 4);
      expect(service.creates.single.tinggi, maxStackDimension);
      expect(
        find.byKey(const Key('standarisasi-create-save')),
        findsNothing,
        reason: 'sheet harus menutup sendiri setelah server menerima',
      );
    });

    testWidgets('form tambah menolak simpan tanpa produk terpilih', (
      tester,
    ) async {
      useTallScreen(tester);
      final service = FakeStandarisasiService();

      await tester.pumpWidget(
        wrap(
          authWith(const [...basePermissions, 'standarisasi.create']),
          service,
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byTooltip('Tambah Standarisasi'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('standarisasi-create-save')));
      await tester.pumpAndSettle();

      expect(service.creates, isEmpty);
      expect(find.text('Pilih produk terlebih dahulu.'), findsOneWidget);
    });

    testWidgets('kode produk dari Validasi membuka form dengan produk terisi', (
      tester,
    ) async {
      useTallScreen(tester);
      final service = FakeStandarisasiService()
        ..productResult = <NpnProduct>[
          npnProduct(id: 5, bosId: 'BRG-1', name: 'Produk Terpilih'),
        ];

      await tester.pumpWidget(
        wrap(
          authWith(const [...basePermissions, 'standarisasi.create']),
          service,
          initialProductCode: 'BRG-1',
        ),
      );
      await tester.pumpAndSettle();

      expect(service.calls, contains('search:BRG-1'));
      expect(
        find.byKey(const Key('standarisasi-product-selected')),
        findsOneWidget,
      );
      expect(find.text('Produk Terpilih'), findsOneWidget);
    });

    testWidgets('kode produk yang tidak ada di master memberi tahu operator', (
      tester,
    ) async {
      useTallScreen(tester);
      final service = FakeStandarisasiService();

      await tester.pumpWidget(
        wrap(authWith(basePermissions), service, initialProductCode: 'BRG-404'),
      );
      await tester.pumpAndSettle();

      expect(
        find.textContaining('BRG-404'),
        findsWidgets,
        reason: 'form tidak boleh terbuka diam-diam tanpa produk',
      );
      expect(
        find.byKey(const Key('standarisasi-product-selected')),
        findsNothing,
      );
    });

    testWidgets('detail baris pending bisa disetujui', (tester) async {
      useTallScreen(tester);
      final service = FakeStandarisasiService()
        ..listResult = StandarisasiListPage(
          entries: <StandarisasiTumpukan>[
            stackRow(id: 1, status: standarisasiStatusPending),
          ],
          currentPage: 1,
          lastPage: 1,
          total: 1,
        );

      await tester.pumpWidget(
        wrap(
          authWith(const [...basePermissions, 'standarisasi.approve']),
          service,
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('standarisasi-row-1')));
      await tester.pumpAndSettle();

      expect(find.text('Detail Standarisasi'), findsOneWidget);
      expect(find.text('PERHITUNGAN TUMPUKAN'), findsOneWidget);
      expect(find.text('3 tier x 2 tinggi = 6 total tumpukan'), findsOneWidget);

      await tester.tap(find.byKey(const Key('standarisasi-approve')));
      await tester.pumpAndSettle();
      // Sheet dan dialog sama-sama punya tombol "Setujui", jadi yang diketuk
      // harus yang di dalam dialog konfirmasi.
      await tester.tap(
        find.descendant(
          of: find.byType(AlertDialog),
          matching: find.widgetWithText(FilledButton, 'Setujui'),
        ),
      );
      await tester.pumpAndSettle();

      expect(service.decisions.single, (id: 1, approve: true));
      expect(
        find.byKey(const Key('standarisasi-approve')),
        findsNothing,
        reason: 'sheet detail ditutup setelah keputusan berhasil',
      );
    });

    testWidgets('tanpa izin approve, sheet menjelaskan batasannya', (
      tester,
    ) async {
      useTallScreen(tester);
      final service = FakeStandarisasiService()
        ..listResult = StandarisasiListPage(
          entries: <StandarisasiTumpukan>[
            stackRow(id: 1, status: standarisasiStatusPending),
          ],
          currentPage: 1,
          lastPage: 1,
          total: 1,
        );

      await tester.pumpWidget(wrap(authWith(basePermissions), service));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('standarisasi-row-1')));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('standarisasi-approve')), findsNothing);
      expect(find.textContaining('Izin standarisasi.approve'), findsOneWidget);
    });
  });
}
