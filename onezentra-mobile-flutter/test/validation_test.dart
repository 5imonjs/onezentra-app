import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:onezentra_mobile/features/auth/auth_provider.dart';
import 'package:onezentra_mobile/features/dashboard/dashboard_provider.dart';
import 'package:onezentra_mobile/features/dashboard/home_shell.dart';
import 'package:onezentra_mobile/features/gate/gate_provider.dart';
import 'package:onezentra_mobile/features/standarisasi/models/standarisasi_models.dart';
import 'package:onezentra_mobile/features/validation/models/validation_models.dart';
import 'package:onezentra_mobile/features/validation/validation_screen.dart';
import 'package:onezentra_mobile/features/validation/validation_service.dart';
import 'package:onezentra_mobile/features/validation/validation_session_provider.dart';
import 'package:onezentra_mobile/widgets/page_header.dart';
import 'package:onezentra_mobile/widgets/states.dart';

import 'support/haptics_recorder.dart';
import 'support/test_harness.dart';

const _allPermissions = <String>[
  'sj_validation.view',
  'sj_validation.create',
  'sj_validation.validate',
  'sj_validation.complete',
  'sj_validation.delete',
  'sj_validation.edit',
];

void main() {
  // Simpan item/batal/hapus bergetar lewat `HapticFeedback`; binding harus ada
  // sebelum test provider mana pun dijalankan.
  TestWidgetsFlutterBinding.ensureInitialized();

  AuthProvider authWith(List<String> permissions) {
    final auth = AuthProvider(FakeAuthService());
    auth.user = testUser;
    auth.permissions = permissions;
    auth.isRestoring = false;
    return auth;
  }

  Widget wrap(Widget child, AuthProvider auth) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider<AuthProvider>.value(value: auth),
        ChangeNotifierProvider<GateProvider>.value(
          value: GateProvider(FakeGateService()),
        ),
        // Beranda membaca ringkasan dashboard; fake menjaga test tetap
        // offline.
        ChangeNotifierProvider<DashboardProvider>(
          create: (_) => DashboardProvider(FakeDashboardService()),
        ),
      ],
      child: MaterialApp(home: child),
    );
  }

  /// Layar test default 800x600 terlalu pendek: daftar item, tombol Selesaikan,
  /// dan form item (bottom sheet) ada di bawah lipatan. Diperbesar agar seluruh
  /// alur bisa diuji tanpa scroll manual.
  void useTallScreen(WidgetTester tester) {
    tester.view.physicalSize = const Size(480, 2400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
  }

  /// Isi tanggal expired lewat date picker, lalu tutup popup pemeriksaan umur
  /// yang otomatis muncul (paritas dengan `setShowUmurPopup(true)` di web).
  Future<void> pickExpiredDate(WidgetTester tester) async {
    await tester.tap(find.byKey(const Key('item-expired')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('15'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('OK'));
    await tester.pumpAndSettle();
    if (find.byKey(const Key('item-umur-popup-ack')).evaluate().isNotEmpty) {
      await tester.tap(find.byKey(const Key('item-umur-popup-ack')));
      await tester.pumpAndSettle();
    }
  }

  group('Model', () {
    test('SjValidation.fromJson membaca payload show() dari backend', () {
      final v = SjValidation.fromJson(<String, dynamic>{
        'id': 12,
        'rencana_kirim_id': 5,
        'scan_code': 'PO-7788',
        'status': 'IN_PROGRESS',
        'started_at': '2026-09-26T02:10:00.000000Z',
        'completed_at': null,
        'rencana_kirim': <String, dynamic>{
          'id': 5,
          'po_transporter': 'PO-7788',
          'nopol': 'B 9 ZZ',
          'driver_name': 'Siti',
          'destination_name': 'Gudang Jakarta',
        },
        'validator': <String, dynamic>{'id': 1, 'full_name': 'Admin Utama'},
        'items': <Map<String, dynamic>>[
          <String, dynamic>{
            'id': 30,
            'sj_validation_id': 12,
            'npn_id': 9,
            'barcode': '8991234567890',
            'kode_barang': 'BRG-1',
            'nama_barang': 'Beras Premium 5kg',
            'expected_qty': 100,
            'actual_qty': null,
            'expired_date': null,
            'satuan': 'KG',
            'condition': 'FISIK_BAGUS',
            'status': 'PENDING',
            'umur': 6,
            'standarisasi': null,
          },
          <String, dynamic>{
            'id': 31,
            'kode_barang': 'BRG-2',
            'nama_barang': 'Minyak Goreng 1L',
            'expected_qty': 24,
            'actual_qty': 20,
            'satuan': 'PCS',
            'condition': 'QTY_KURANG',
            'status': 'MISMATCH',
            'umur': 12,
            'standarisasi': <String, dynamic>{'tier': 3, 'tinggi_tumpukan': 4},
          },
        ],
      });

      expect(v.id, 12);
      expect(v.poTransporter, 'PO-7788');
      expect(v.nopol, 'B 9 ZZ');
      expect(v.driverName, 'Siti');
      expect(v.destinationName, 'Gudang Jakarta');
      expect(v.validatorName, 'Admin Utama');
      expect(v.isInProgress, isTrue);
      expect(v.totalItems, 2);
      expect(v.pendingItems, 1);
      expect(v.mismatchItems, 1);
      expect(v.validatedItems, 1);
      expect(v.progress, closeTo(0.5, 0.001));

      final pending = v.items.first;
      expect(pending.kodeBarang, 'BRG-1');
      expect(pending.expectedQty, 100);
      expect(pending.actualQty, isNull);
      expect(pending.isPending, isTrue);
      expect(pending.umur, 6);
      expect(pending.standarisasi, isNull);

      final mismatch = v.items[1];
      expect(mismatch.actualQty, 20);
      expect(mismatch.isMismatch, isTrue);
      expect(conditionNeedsPhoto(mismatch.condition), isTrue);
      expect(mismatch.standarisasi?.tier, 3);
      expect(mismatch.standarisasi?.tinggiTumpukan, 4);
    });

    test('SjValidation.fromJson tahan payload kosong (field null)', () {
      final v = SjValidation.fromJson(<String, dynamic>{
        'id': 1,
        'status': null,
        'rencana_kirim': null,
        'validator': null,
        'items': null,
      });

      expect(v.id, 1);
      expect(v.status, statusInProgress);
      expect(v.poTransporter, '-');
      expect(v.nopol, '-');
      expect(v.driverName, '-');
      expect(v.destinationName, '-');
      expect(v.validatorName, isNull);
      expect(v.items, isEmpty);
      expect(
        v.progress,
        0,
        reason: 'dokumen tanpa item tidak boleh division by zero',
      );
    });

    test('item PENDING dengan actual_qty 0.00 dianggap belum diisi', () {
      // Bentuk payload nyata dari `GET /sj-validations/{id}` (dicek langsung ke
      // server dev): kolom `actual_qty` default 0 dan tetap dikirim walau item
      // belum diperiksa — harus tetap dianggap "belum ada isian".
      final pending = SjValidationItem.fromJson(<String, dynamic>{
        'id': 3,
        'kode_barang': '90101232122107',
        'nama_barang': 'CWSCO8P/Chocolatos Wafer Stick Chocolate -14g',
        'expected_qty': 1000.00,
        'actual_qty': 0.00,
        'expired_date': null,
        'satuan': 'CRT',
        'condition': 'FISIK_BAGUS',
        'barcode': null,
        'status': 'PENDING',
        'umur': null,
        'standarisasi': null,
      });

      expect(pending.actualQty, isNull);
      expect(pending.isPending, isTrue);
      expect(pending.summaryLabel, 'Belum diperiksa');

      // Item yang benar-benar sudah diperiksa dengan qty 0 tetap 0 (MISMATCH).
      final scanned = SjValidationItem.fromJson(<String, dynamic>{
        'id': 3,
        'kode_barang': 'BRG-1',
        'nama_barang': 'Barang',
        'expected_qty': 10.00,
        'actual_qty': 0.00,
        'satuan': 'PCS',
        'condition': 'QTY_KURANG',
        'status': 'MISMATCH',
      });
      expect(scanned.actualQty, 0);
      expect(scanned.summaryLabel, 'Selisih · Qty Kurang');
    });

    test('sisa umur & verdict mengikuti perhitungan versi web', () {
      final now = DateTime.now();
      String iso(DateTime d) =>
          '${d.year.toString().padLeft(4, '0')}-'
          '${d.month.toString().padLeft(2, '0')}-'
          '${d.day.toString().padLeft(2, '0')}';

      // Tepat 6 bulan ke depan → sisa 6 (>= 1), standar 6 → sesuai.
      final tepat = validationItem(
        umur: 6,
        expiredDate: iso(DateTime(now.year, now.month + 6, now.day + 1)),
      );
      expect(
        shelfLifeVerdict(tepat.expiredDate, standardMonths: 6),
        'Sesuai standar umur',
      );

      // Expired 2 bulan lagi, standar 6 → kurang 4 bulan (bulan berjalan belum
      // selesai kalau tanggal expired lebih kecil dari hari ini).
      final kurang = validationItem(
        umur: 6,
        expiredDate: iso(DateTime(now.year, now.month + 2, now.day)),
      );
      expect(
        shelfLifeVerdict(kurang.expiredDate, standardMonths: 6),
        contains('Kurang'),
      );

      // Sudah lewat → 0 bulan, tidak pernah negatif.
      final lewat = validationItem(
        expiredDate: iso(DateTime(now.year - 1, 1, 1)),
      );
      expect(lewat.remainingShelfLifeMonths(), 0);

      // Tanpa master umur atau tanpa tanggal → tidak ada verdict (bukan warning palsu).
      expect(shelfLifeVerdict(iso(now), standardMonths: null), '');
      expect(shelfLifeVerdict(null, standardMonths: 6), '');
    });

    test('checkShelfLife menandai umur kurang lewat flag isShort', () {
      final now = DateTime.now();
      String iso(DateTime d) =>
          '${d.year.toString().padLeft(4, '0')}-'
          '${d.month.toString().padLeft(2, '0')}-'
          '${d.day.toString().padLeft(2, '0')}';

      final kurang = checkShelfLife(
        iso(DateTime(now.year, now.month + 4, now.day)),
        standardMonths: 12,
      );
      expect(kurang.isKnown, isTrue);
      expect(kurang.isShort, isTrue);
      expect(kurang.label, 'Kurang 8 bulan dari standar');

      final sesuai = checkShelfLife(
        iso(DateTime(now.year, now.month + 12, now.day)),
        standardMonths: 12,
      );
      expect(sesuai.label, 'Sesuai standar umur');
      expect(sesuai.isShort, isFalse);
    });

    test(
      'checkShelfLife tidak dikenal bila tanggal atau master umur kosong',
      () {
        final unknown = checkShelfLife(null, standardMonths: 12);
        expect(unknown.isKnown, isFalse);
        expect(unknown.label, isEmpty);
        expect(
          checkShelfLife('2027-01-01', standardMonths: null).isKnown,
          isFalse,
          reason: 'produk tanpa master umur tidak boleh mendapat warning',
        );
      },
    );

    test('laporan umur menyatukan sisa bulan, selisih, dan verdict', () {
      final now = DateTime.now();
      String iso(DateTime d) =>
          '${d.year.toString().padLeft(4, '0')}-'
          '${d.month.toString().padLeft(2, '0')}-'
          '${d.day.toString().padLeft(2, '0')}';

      // Tanpa tanggal expired tidak ada laporan sama sekali — pemanggil
      // menampilkan perintah, bukan angka nol palsu.
      expect(shelfLifeReport(null, standardMonths: 12), isNull);
      expect(shelfLifeReport('', standardMonths: 12), isNull);
      expect(shelfLifeReport('bukan tanggal', standardMonths: 12), isNull);

      final kurang = shelfLifeReport(
        iso(DateTime(now.year, now.month + 4, now.day)),
        standardMonths: 12,
      );
      expect(kurang, isNotNull);
      expect(kurang!.months, 4);
      expect(kurang.standardMonths, 12);
      expect(kurang.hasStandard, isTrue);
      expect(kurang.isShort, isTrue);
      expect(kurang.isExpired, isFalse);
      expect(kurang.verdict, 'PERLU PERHATIAN');
      expect(kurang.selisih, startsWith('-8 bulan'));
      expect(kurang.ratioPercent, 33, reason: '4 dari 12 bulan ≈ 33%');

      final aman = shelfLifeReport(
        iso(DateTime(now.year, now.month + 18, now.day)),
        standardMonths: 12,
      );
      expect(aman!.isShort, isFalse);
      expect(aman.verdict, 'AMAN');
      expect(aman.selisih, startsWith('+6 bulan'));
      expect(
        aman.ratioPercent,
        150,
        reason:
            'laporan mengembalikan rasio mentah; yang menjepit ke 100% adalah '
            'bilah di popup, sama seperti `Math.min(100, umurRatio)` di web',
      );

      final kadaluarsa = shelfLifeReport(
        iso(DateTime(now.year, now.month - 1, now.day)),
        standardMonths: 12,
      );
      expect(kadaluarsa!.isExpired, isTrue);
      expect(kadaluarsa.verdict, 'KADALUARSA');
      expect(kadaluarsa.days, lessThan(0));

      final tanpaStandar = shelfLifeReport(
        iso(DateTime(now.year, now.month + 4, now.day)),
      );
      expect(tanpaStandar!.hasStandard, isFalse);
      expect(tanpaStandar.verdict, 'DATA LENGKAP');
      expect(tanpaStandar.ratioPercent, 0);
    });

    test('selisih umur memakai clamping tanggal & menyembunyikan bagian nol', () {
      final now = DateTime.now();
      String iso(DateTime d) =>
          '${d.year.toString().padLeft(4, '0')}-'
          '${d.month.toString().padLeft(2, '0')}-'
          '${d.day.toString().padLeft(2, '0')}';

      // Dua tahun di depan dengan standar 12 bulan → selisih tepat 1 tahun,
      // dan bagian bulan/hari yang nol tidak ikut ditulis.
      expect(
        formatUmurSelisihDetail(
          iso(DateTime(now.year + 2, now.month, now.day)),
          12,
        ),
        '+1 tahun',
      );
      // Tepat di tanggal standar → selisih nol, bukan satu tahun.
      expect(
        formatUmurSelisihDetail(
          iso(DateTime(now.year + 1, now.month, now.day)),
          12,
        ),
        '+0 hari',
      );
      // Tepat sama dengan tanggal standar → "+0 hari", bukan "+0 tahun 0 bulan".
      expect(
        formatUmurSelisihDetail(iso(now), 0),
        '+0 hari',
        reason: 'bagian yang nol tidak boleh ditulis, sama seperti web',
      );
      // Standard bulan yang lebih panjang dari bulan berjalan harus dijepit ke
      // akhir bulan, bukan melompat ke bulan berikutnya.
      final akhirJanuari = DateTime(now.year, 1, 31);
      expect(
        formatUmurSelisihDetail(iso(akhirJanuari), 1),
        isNotNull,
        reason: 'tanggal standar 1 bulan harus valid walau clamping',
      );
      expect(
        formatUmurSelisihDetail(null, 12),
        isNull,
        reason: 'tanpa tanggal expired tidak ada selisih yang bisa dihitung',
      );
    });

    test('sisa umur dalam hari memakai tengah malam, bukan jam saat ini', () {
      final now = DateTime.now();
      final besok = DateTime(now.year, now.month, now.day + 1);
      expect(shelfLifeDays(besok.toIso8601String()), 1);
      expect(
        shelfLifeDays(now.toIso8601String()),
        0,
        reason:
            'kedaluwarsa hari ini berarti 0, bukan negatif karena jam lokal',
      );
      expect(
        shelfLifeDays(
          DateTime(now.year, now.month, now.day - 1).toIso8601String(),
        ),
        -1,
      );
      expect(shelfLifeDays(null), isNull);
    });

    test('kalimat kesimpulan umur membedakan popup & kartu dalam sheet', () {
      final now = DateTime.now();
      String iso(DateTime d) =>
          '${d.year.toString().padLeft(4, '0')}-'
          '${d.month.toString().padLeft(2, '0')}-'
          '${d.day.toString().padLeft(2, '0')}';

      final expired = shelfLifeReport(
        iso(DateTime(now.year, now.month - 1, now.day)),
        standardMonths: 12,
      )!;
      expect(
        shelfLifeVerdictText(expired, popup: true),
        'Produk sudah kadaluarsa dan perlu penanganan segera.',
      );
      expect(
        shelfLifeVerdictText(expired, popup: false),
        'Produk sudah kadaluarsa.',
      );

      final tanpaStandar = shelfLifeReport(
        iso(DateTime(now.year, now.month + 4, now.day)),
      )!;
      expect(
        shelfLifeVerdictText(tanpaStandar, popup: true),
        contains('Standar umur produk tidak tersedia'),
      );

      final kurang = shelfLifeReport(
        iso(DateTime(now.year, now.month + 4, now.day)),
        standardMonths: 12,
      )!;
      expect(
        shelfLifeVerdictText(kurang, popup: false),
        'Sisa simpan kurang dari standar (-8 bulan).',
      );
      expect(
        shelfLifeVerdictText(kurang, popup: true),
        'Sisa simpan kurang dari standar (-8 bulan).',
      );
    });

    test('formatQty membuang desimal nol dari float backend', () {
      expect(formatQty(1000), '1000');
      expect(formatQty(12.5), '12.5');
      expect(formatQty(0), '0');
      expect(formatQty(20.0), '20');
    });
  });

  group('ValidationSessionProvider', () {
    test('startByCode mengisi dokumen dari server', () async {
      final service = FakeValidationService()
        ..result = sjValidation(po: 'PO-7788');
      final session = ValidationSessionProvider(service);

      await session.startByCode('  PO-7788  ');

      expect(service.calls, ['start:PO-7788']);
      expect(session.validation?.poTransporter, 'PO-7788');
      expect(session.error, isNull);
      expect(session.startBusy, isFalse);
    });

    test('kode kosong tidak memanggil server', () async {
      final service = FakeValidationService();
      await ValidationSessionProvider(service).startByCode('   ');
      expect(service.calls, isEmpty);
    });

    test('refresh membaca dokumen terbaru lewat show, bukan start', () async {
      final service = FakeValidationService()
        ..result = sjValidation(status: statusInProgress);
      final session = ValidationSessionProvider(service);
      await session.startByCode('PO-7788');
      service.calls.clear();

      // Supervisor di web mungkin sudah menyelesaikan dokumen ini.
      service.result = sjValidation(status: statusCompleted);
      await session.refresh();

      expect(service.calls, ['show:7']);
      expect(session.validation?.status, statusCompleted);
      expect(session.error, isNull);
      expect(session.refreshing, isFalse);
    });

    test(
      'refresh gagal tetap mempertahankan dokumen yang sedang dikerjakan',
      () async {
        final service = FakeValidationService()
          ..result = sjValidation(status: statusInProgress);
        final session = ValidationSessionProvider(service);
        await session.startByCode('PO-7788');

        service.showError = dioError(503, message: 'Server sedang sibuk.');
        await session.refresh();

        // Gagal refresh bukan alasan membuang pekerjaan operator.
        expect(session.validation, isNotNull);
        expect(session.validation?.isInProgress, isTrue);
        expect(session.error, 'Server sedang sibuk.');
        expect(session.refreshing, isFalse);
      },
    );

    test(
      'refresh menandai proses berjalan tanpa menyentuh status tombol scan',
      () async {
        final service = FakeValidationService()..showGate = Completer<void>();
        final session = ValidationSessionProvider(service);
        await session.startByCode('PO-7788');
        service.calls.clear();

        final pending = session.refresh();
        expect(session.refreshing, isTrue);
        expect(
          session.startBusy,
          isFalse,
          reason: 'tombol "Mulai Validasi" tidak boleh ikut berubah status',
        );
        expect(
          session.itemBusy,
          isFalse,
          reason: 'tombol scan item tidak boleh ikut berubah status',
        );

        service.showGate!.complete();
        await pending;
        expect(session.refreshing, isFalse);
      },
    );

    test('refresh diabaikan saat sudah berjalan atau tanpa dokumen', () async {
      final service = FakeValidationService();
      final session = ValidationSessionProvider(service);

      await session.refresh();
      expect(
        service.calls,
        isEmpty,
        reason: 'tidak ada dokumen terbuka untuk disegarkan',
      );

      service.result = sjValidation();
      await session.startByCode('PO-7788');
      service.showGate = Completer<void>();
      service.calls.clear();

      final pending = session.refresh();
      await session.refresh();
      expect(
        service.calls,
        ['show:7'],
        reason:
            'tarikan kedua saat masih jalan harus diabaikan, bukan dobel request',
      );

      service.showGate!.complete();
      await pending;
    });

    test('gagal lookup membuang dokumen sebelumnya', () async {
      final service = FakeValidationService()
        ..result = sjValidation(po: 'PO-7788');
      final session = ValidationSessionProvider(service);

      await session.startByCode('PO-7788');
      expect(session.validation, isNotNull);

      service.startError = dioError(
        422,
        message: 'Rencana kirim tidak ditemukan.',
      );
      await session.startByCode('PO-UNKNOWN');

      expect(
        session.validation,
        isNull,
        reason: 'dokumen lama tidak boleh bisa diselesaikan setelah scan gagal',
      );
      expect(session.error, 'Rencana kirim tidak ditemukan.');
      expect(session.startBusy, isFalse);
    });

    test(
      'saveItem menukar item dengan hasil server + catatan selisih',
      () async {
        final service = FakeValidationService();
        final session = ValidationSessionProvider(service);
        await session.startByCode('PO-7788');

        final ok = await session.saveItem(
          item: session.validation!.items.first,
          actualQty: 90,
          condition: conditionQtyShort,
          photoPath: '/tmp/bukti.jpg',
        );

        expect(ok, isTrue);
        expect(
          service.calls,
          contains('scan:1:90.0:QTY_KURANG:/tmp/bukti.jpg'),
        );
        final item = session.validation!.items.first;
        expect(item.status, statusMismatch);
        expect(item.actualQty, 90);
        expect(session.validation!.pendingItems, 0);
        expect(session.notice, 'Item tercatat dengan selisih qty.');
      },
    );

    test(
      'saveItem gagal → error server ditampilkan, item tak berubah',
      () async {
        final service = FakeValidationService();
        final session = ValidationSessionProvider(service);
        await session.startByCode('PO-7788');
        service.scanError = dioError(
          422,
          message: 'Foto wajib diunggah untuk kondisi ini.',
        );

        final ok = await session.saveItem(
          item: session.validation!.items.first,
          actualQty: 90,
          condition: conditionDamaged,
        );

        expect(ok, isFalse);
        expect(session.error, 'Foto wajib diunggah untuk kondisi ini.');
        expect(session.validation!.items.first.status, statusPending);
        expect(session.itemBusy, isFalse);
      },
    );

    test('complete ditolak selama masih ada item PENDING', () async {
      final service = FakeValidationService();
      final session = ValidationSessionProvider(service);
      await session.startByCode('PO-7788');

      final ok = await session.complete();

      expect(ok, isFalse);
      expect(service.calls, isNot(contains(startsWith('complete'))));
      expect(session.error, 'Masih ada 1 item yang belum divalidasi.');
      expect(session.validation, isNotNull, reason: 'dokumen tidak hilang');
    });

    test('complete sukses menutup dokumen & menyebut jumlah selisih', () async {
      final service = FakeValidationService()
        ..result = sjValidation(
          items: <SjValidationItem>[
            validationItem(id: 1, actualQty: 90, status: statusMismatch),
            validationItem(id: 2, kode: 'BRG-2', status: statusValidated),
          ],
        );
      final session = ValidationSessionProvider(service);
      await session.startByCode('PO-7788');

      final ok = await session.complete();

      expect(ok, isTrue);
      expect(service.calls, contains('complete:7'));
      expect(session.validation, isNull, reason: 'kembali ke layar scan');
      expect(session.notice, contains('1 item selisih'));
    });

    test('cancel menutup dokumen', () async {
      final service = FakeValidationService();
      final session = ValidationSessionProvider(service);
      await session.startByCode('PO-7788');

      final ok = await session.cancel();

      expect(ok, isTrue);
      expect(service.calls, contains('cancel:7'));
      expect(session.validation, isNull);
      expect(session.notice, 'Validasi dibatalkan.');
    });

    test('removeItem mengembalikan daftar item dari server', () async {
      final service = FakeValidationService()
        ..result = sjValidation(
          items: <SjValidationItem>[
            validationItem(id: 1),
            validationItem(id: 2, kode: 'BRG-2', nama: 'Minyak Goreng'),
          ],
        );
      final session = ValidationSessionProvider(service);
      await session.startByCode('PO-7788');

      final ok = await session.removeItem(session.validation!.items.last);

      expect(ok, isTrue);
      expect(service.calls, contains('deleteItem:2'));
      expect(session.validation!.items.map((i) => i.id), [1]);
    });

    test('itemDraftError meniru aturan backend', () {
      expect(
        itemDraftError(
          actualQty: null,
          condition: conditionGood,
          hasPhoto: false,
        ),
        'Qty aktual wajib diisi.',
      );
      expect(
        itemDraftError(
          actualQty: 10,
          condition: conditionQtyShort,
          hasPhoto: false,
        ),
        contains('Foto wajib'),
      );
      expect(
        itemDraftError(
          actualQty: 10,
          condition: conditionOther,
          hasPhoto: true,
        ),
        isNull,
      );
      expect(
        itemDraftError(actualQty: 0, condition: conditionGood, hasPhoto: false),
        isNull,
        reason: 'nol pcs tetap sah (baris kosong) — backend juga menerima >= 0',
      );
    });

    test('itemDraftError menolak item tanpa tanggal expired', () {
      expect(
        itemDraftError(
          actualQty: 10,
          condition: conditionGood,
          hasPhoto: false,
          hasExpiredDate: false,
        ),
        'Tanggal expired wajib diisi.',
        reason:
            'web menonaktifkan tombol simpan selama `!form.expired_date`, jadi '
            'mobile tidak boleh menyimpan item yang tidak pernah dibandingkan '
            'dengan standar umur',
      );
    });

    test('getaran membedakan aksi commit dan pembatalan', () async {
      final haptics = recordHaptics();
      final service = FakeValidationService();
      final session = ValidationSessionProvider(service);
      await session.startByCode('PO-7788');

      await session.saveItem(
        item: session.validation!.items.first,
        actualQty: 10,
        condition: conditionGood,
      );
      expect(haptics, ['HapticFeedbackType.mediumImpact']);

      haptics.clear();
      await session.removeItem(session.validation!.items.first);
      expect(
        haptics,
        ['HapticFeedbackType.heavyImpact'],
        reason:
            'menghapus item lebih berat daripada menyimpan hasil pemeriksaan',
      );

      haptics.clear();
      await session.startByCode('PO-7788');
      await session.cancel();
      expect(haptics, ['HapticFeedbackType.heavyImpact']);
    });

    test('gagal menyimpan tidak bergetar seperti konfirmasi', () async {
      final haptics = recordHaptics();
      final service = FakeValidationService()
        ..scanError = StateError('koneksi terputus');
      final session = ValidationSessionProvider(service);
      await session.startByCode('PO-7788');

      final ok = await session.saveItem(
        item: session.validation!.items.first,
        actualQty: 10,
        condition: conditionGood,
      );

      expect(ok, isFalse);
      expect(
        haptics,
        isEmpty,
        reason: 'getar hanya setelah server mengonfirmasi, bukan atas usaha',
      );
    });
  });

  group('Daftar Validasi', () {
    /// Payload `GET /sj-validations` apa adanya (Laravel paginator) — dipakai
    /// uji parsing supaya regresi bentuk respons backend langsung terlihat.
    Map<String, dynamic> listPayload() => <String, dynamic>{
      'current_page': 2,
      'last_page': 3,
      'total': 42,
      'per_page': 20,
      'data': <Map<String, dynamic>>[
        <String, dynamic>{
          'id': 7,
          'rencana_kirim_id': 5,
          'scan_code': '0127-26-00000TES3',
          'status': 'IN_PROGRESS',
          'started_at': '2026-09-26T02:10:00.000000Z',
          'completed_at': null,
          'rencana_kirim': <String, dynamic>{
            'po_transporter': '0127-26-00000TES3',
            'driver_name': 'Budi',
            'nopol': 'B 1 AA',
            'destination_name': 'Gudang Jakarta',
          },
          'validator': <String, dynamic>{'id': 1, 'full_name': 'Admin Utama'},
        },
        <String, dynamic>{
          'id': 8,
          'rencana_kirim_id': 6,
          'scan_code': 'PO-LAMA',
          'status': 'COMPLETED',
          'started_at': '2026-09-20T01:00:00.000000Z',
          'completed_at': '2026-09-20T05:30:00.000000Z',
          'rencana_kirim': null,
          'validator': null,
        },
      ],
    };

    test(
      'SjValidationSummary membaca baris daftar & fallback ke scan_code',
      () {
        final body = listPayload();
        final first = SjValidationSummary.fromJson(
          Map<String, dynamic>.from(body['data'][0] as Map),
        );
        final second = SjValidationSummary.fromJson(
          Map<String, dynamic>.from(body['data'][1] as Map),
        );

        expect(first.id, 7);
        expect(first.poTransporter, '0127-26-00000TES3');
        expect(first.driverName, 'Budi');
        expect(first.destinationName, 'Gudang Jakarta');
        expect(first.nopol, 'B 1 AA');
        expect(first.validatorName, 'Admin Utama');
        expect(first.isInProgress, isTrue);
        expect(first.completedAt, isNull);

        expect(
          second.poTransporter,
          'PO-LAMA',
          reason: 'rencana_kirim null harus fallback ke scan_code, bukan "-"',
        );
        expect(second.isInProgress, isFalse);
      },
    );

    test('ValidationStats membaca payload stats()', () {
      final stats = ValidationStats.fromJson(<String, dynamic>{
        'today': 2,
        'in_progress': 1,
        'completed': 3,
        'cancelled': 4,
        'total': 8,
      });

      expect(stats.today, 2);
      expect(stats.inProgress, 1);
      expect(stats.completed, 3);
      expect(stats.cancelled, 4);
      expect(stats.total, 8);
    });

    test('formatValidationDate mengikuti format dd/MM/yyyy versi web', () {
      expect(formatValidationDate(null), isNull);
      expect(formatValidationDate(''), isNull);
      expect(formatValidationDate('2026-09-26T02:10:00.000000Z'), '26/09/2026');
      expect(formatValidationDate('bukan tanggal'), 'bukan tanggal');
    });

    test('service list() & stats() memetakan respons asli backend', () async {
      final adapter = CannedHttpAdapter(listPayload());
      final service = ValidationService(
        Dio(BaseOptions(baseUrl: 'http://localhost:8000/api/v1'))
          ..httpClientAdapter = adapter,
      );

      final page = await service.list(search: 'TES', status: 'IN_PROGRESS');

      expect(page.entries, hasLength(2));
      expect(page.entries.first.poTransporter, '0127-26-00000TES3');
      expect(page.currentPage, 2);
      expect(page.lastPage, 3);
      expect(page.total, 42);
      expect(adapter.requests.single.queryParameters, <String, dynamic>{
        'search': 'TES',
        'per_page': 20,
        'page': 1,
        'status': 'IN_PROGRESS',
      });

      final stats = await ValidationService(
        Dio(BaseOptions(baseUrl: 'http://localhost:8000/api/v1'))
          ..httpClientAdapter = CannedHttpAdapter(<String, dynamic>{
            'data': <String, dynamic>{
              'today': 1,
              'in_progress': 2,
              'completed': 3,
              'cancelled': 4,
              'total': 9,
            },
          }),
      ).stats();

      expect(stats.inProgress, 2);
      expect(stats.total, 9);
    });

    test('list tanpa status tidak mengirim parameter status', () async {
      final adapter = CannedHttpAdapter(listPayload());

      await ValidationService(
        Dio(BaseOptions(baseUrl: 'http://localhost:8000/api/v1'))
          ..httpClientAdapter = adapter,
      ).list();

      expect(
        adapter.requests.single.queryParameters,
        isNot(contains('status')),
      );
    });

    testWidgets(
      'worklist termuat saat tab dibuka: PO, driver, status, tanggal',
      (tester) async {
        useTallScreen(tester);
        final service = FakeValidationService()
          ..listResult = listPage(<SjValidationSummary>[
            validationSummary(id: 7, po: 'PO-7788', driver: 'Siti'),
            validationSummary(
              id: 8,
              po: 'PO-LAMA',
              driver: 'Andi',
              tujuan: 'Gudang Bandung',
              status: statusCompleted,
              completedAt: '2026-09-20T05:30:00.000000Z',
            ),
          ])
          ..statsResult = const ValidationStats(
            today: 1,
            inProgress: 1,
            completed: 2,
            cancelled: 0,
            total: 3,
          );

        await tester.pumpWidget(
          wrap(ValidationScreen(service: service), authWith(_allPermissions)),
        );
        await tester.pumpAndSettle();

        expect(service.listCalls, [
          'list:1:-:',
        ], reason: 'daftar dimuat saat layar dibuka');
        expect(service.statsCalls, 1);
        expect(find.text('Daftar Validasi'), findsOneWidget);
        expect(find.text('PO-7788'), findsOneWidget);
        expect(find.text('PO-LAMA'), findsOneWidget);
        expect(find.textContaining('Siti • Gudang Jakarta'), findsOneWidget);
        expect(
          find.textContaining('Andi • Gudang Bandung'),
          findsOneWidget,
          reason: 'tiap baris menampilkan driver & tujuan sendiri',
        );
        expect(find.text('Berjalan'), findsWidgets);
        expect(find.text('Selesai'), findsWidgets);
        expect(find.textContaining('Selesai 20/09/2026'), findsOneWidget);
        expect(
          find.textContaining('Mulai'),
          findsWidgets,
          reason: 'dokumen berjalan menampilkan tanggal mulai, bukan selesai',
        );
      },
    );

    testWidgets(
      'baris yang dipilih membuka detail tanpa membuat validasi baru',
      (tester) async {
        useTallScreen(tester);
        final service = FakeValidationService()
          ..listResult = listPage(<SjValidationSummary>[
            validationSummary(id: 7, po: 'PO-7788'),
          ]);

        await tester.pumpWidget(
          wrap(ValidationScreen(service: service), authWith(_allPermissions)),
        );
        await tester.pumpAndSettle();

        await tester.tap(find.byKey(const Key('validation-row-7')));
        await tester.pumpAndSettle();

        expect(
          service.calls,
          ['show:7'],
          reason:
              'buka daftar harus baca-saja — start/ would membuat validasi baru',
        );
        expect(find.text('Daftar Validasi'), findsNothing);
        expect(find.text('Item dokumen'), findsOneWidget);
      },
    );

    testWidgets('pencarian memuat ulang daftar dengan kata kunci', (
      tester,
    ) async {
      useTallScreen(tester);
      final service = FakeValidationService();

      await tester.pumpWidget(
        wrap(ValidationScreen(service: service), authWith(_allPermissions)),
      );
      await tester.pumpAndSettle();
      expect(service.listCalls, ['list:1:-:']);

      await tester.enterText(
        find.byKey(const Key('validation-search')),
        'TES3',
      );
      await tester.pump(const Duration(milliseconds: 450));
      await tester.pumpAndSettle();

      expect(service.listCalls, ['list:1:-:', 'list:1:-:TES3']);
    });

    testWidgets(
      'filter status dikirim ke server & chip aktif tidak mengulang',
      (tester) async {
        useTallScreen(tester);
        final service = FakeValidationService();

        await tester.pumpWidget(
          wrap(ValidationScreen(service: service), authWith(_allPermissions)),
        );
        await tester.pumpAndSettle();

        await tester.tap(find.widgetWithText(FilterChip, 'Berjalan'));
        await tester.pumpAndSettle();
        expect(service.listCalls.last, 'list:1:IN_PROGRESS:');

        await tester.tap(find.widgetWithText(FilterChip, 'Berjalan'));
        await tester.pumpAndSettle();
        expect(
          service.listCalls,
          hasLength(2),
          reason: 'menekan chip aktif tidak boleh menembak server lagi',
        );
      },
    );

    testWidgets('kembali ke daftar menutup dokumen & memuat ulang', (
      tester,
    ) async {
      useTallScreen(tester);
      final service = FakeValidationService()
        ..listResult = listPage(<SjValidationSummary>[
          validationSummary(id: 7),
        ]);

      await tester.pumpWidget(
        wrap(ValidationScreen(service: service), authWith(_allPermissions)),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('validation-row-7')));
      await tester.pumpAndSettle();
      expect(find.text('Item dokumen'), findsOneWidget);

      await tester.tap(find.text('Kembali ke Daftar Validasi'));
      await tester.pumpAndSettle();

      expect(find.text('Item dokumen'), findsNothing);
      expect(find.text('Daftar Validasi'), findsOneWidget);
      expect(
        service.listCalls,
        hasLength(2),
        reason:
            'status di server bisa berubah oleh operator lain — daftar harus segar',
      );
    });

    testWidgets('dokumen berstatus Dibatalkan dari daftar hanya bisa dibaca', (
      tester,
    ) async {
      useTallScreen(tester);
      final service = FakeValidationService()
        ..listResult = listPage(<SjValidationSummary>[
          validationSummary(id: 8, status: statusCancelled),
        ])
        ..result = sjValidation(
          status: statusCancelled,
          items: <SjValidationItem>[
            validationItem(id: 1, actualQty: 100, status: statusValidated),
          ],
        );

      await tester.pumpWidget(
        wrap(ValidationScreen(service: service), authWith(_allPermissions)),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('validation-row-8')));
      await tester.pumpAndSettle();

      expect(find.textContaining('tidak bisa dilanjutkan'), findsOneWidget);
      expect(
        tester
            .widget<FilledButton>(
              find.widgetWithText(FilledButton, 'Selesaikan Validasi'),
            )
            .onPressed,
        isNull,
      );
      await tester.tap(find.text('BRG-1'));
      await tester.pumpAndSettle();
      expect(service.calls.where((c) => c.startsWith('scan:')), isEmpty);
    });

    testWidgets('daftar gagal dimuat: pesan server + tombol coba lagi', (
      tester,
    ) async {
      useTallScreen(tester);
      final service = FakeValidationService()
        ..listError = dioError(500, message: 'Server sedang sibuk.');

      await tester.pumpWidget(
        wrap(ValidationScreen(service: service), authWith(_allPermissions)),
      );
      await tester.pumpAndSettle();

      expect(find.text('Server sedang sibuk.'), findsOneWidget);
      expect(find.widgetWithText(TextButton, 'Coba lagi'), findsOneWidget);

      service.listError = null;
      await tester.tap(find.widgetWithText(TextButton, 'Coba lagi'));
      await tester.pumpAndSettle();

      expect(find.text('Daftar Validasi'), findsOneWidget);
    });

    testWidgets('daftar kosong menampilkan arahan mulai dari dokumen baru', (
      tester,
    ) async {
      useTallScreen(tester);
      await tester.pumpWidget(
        wrap(
          ValidationScreen(service: FakeValidationService()),
          authWith(_allPermissions),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Belum ada validasi dokumen'), findsOneWidget);
      expect(
        find.textContaining('Scan atau ketik PO di panel atas'),
        findsOneWidget,
      );
    });

    testWidgets('sedang memuat: skeleton membingkai daftar, bukan spinner', (
      tester,
    ) async {
      useTallScreen(tester);
      final service = FakeValidationService()..listGate = Completer<void>();

      await tester.pumpWidget(
        wrap(ValidationScreen(service: service), authWith(_allPermissions)),
      );
      await tester.pump();

      expect(
        find.byType(SkeletonList),
        findsOneWidget,
        reason: 'skeleton menunjukkan bentuk baris yang akan datang',
      );
      expect(
        find.byType(CircularProgressIndicator),
        findsNothing,
        reason:
            'spinner penuh membuat layar tampak kosong tiap kali filter berubah',
      );

      service.listGate!.complete();
      await tester.pumpAndSettle();
      expect(find.byType(SkeletonList), findsNothing);
    });

    testWidgets('halaman berikutnya dimuat saat masih ada data', (
      tester,
    ) async {
      useTallScreen(tester);
      final service = FakeValidationService()
        ..listResult = listPage(<SjValidationSummary>[
          validationSummary(id: 7),
        ], lastPage: 2);

      await tester.pumpWidget(
        wrap(ValidationScreen(service: service), authWith(_allPermissions)),
      );
      await tester.pumpAndSettle();

      await tester.tap(
        find.widgetWithText(OutlinedButton, 'Muat lebih banyak'),
      );
      await tester.pumpAndSettle();

      expect(service.listCalls.last, 'list:2:-:');
    });

    testWidgets('ringkasan gagal dimuat diganti pesan, bukan angka nol', (
      tester,
    ) async {
      useTallScreen(tester);
      final service = FakeValidationService()
        ..statsError = dioError(500, message: 'Statistik tidak terbaca.');

      await tester.pumpWidget(
        wrap(ValidationScreen(service: service), authWith(_allPermissions)),
      );
      await tester.pumpAndSettle();

      expect(
        find.textContaining('Statistik gagal dimuat: Statistik tidak terbaca.'),
        findsOneWidget,
        reason: 'alasannya ditulis di header, tepat di bawah angkanya',
      );
      // Empat chip statistik menampilkan "—", bukan angka 0 yang tidak pernah
      // ada. Label chip tetap tampil supaya operator tahu itu angka, bukan
      // field yang gagal di-render.
      expect(find.text('—'), findsNWidgets(4));
      expect(find.text('Total'), findsOneWidget);
    });

    testWidgets('selesai validasi → daftar ikut diperbarui', (tester) async {
      useTallScreen(tester);
      final service = FakeValidationService()
        ..result = sjValidation(
          items: <SjValidationItem>[
            validationItem(id: 1, actualQty: 90, status: statusMismatch),
          ],
        );

      await tester.pumpWidget(
        wrap(ValidationScreen(service: service), authWith(_allPermissions)),
      );
      await tester.pumpAndSettle();

      await tester.enterText(
        find.byKey(const Key('validation-code')),
        'PO-7788',
      );
      await tester.tap(find.widgetWithText(OutlinedButton, 'Mulai Validasi'));
      await tester.pumpAndSettle();
      await tester.tap(
        find.widgetWithText(FilledButton, 'Selesaikan Validasi'),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Ya, Selesaikan'));
      await tester.pumpAndSettle();

      expect(
        service.listCalls,
        hasLength(2),
        reason: 'dokumen selesai harus hilang dari hitungan "Berjalan"',
      );
      expect(service.statsCalls, 2);
    });
  });

  group('Validasi Dokumen (UI)', () {
    testWidgets('ditolak tanpa sj_validation.view', (tester) async {
      useTallScreen(tester);
      await tester.pumpWidget(
        wrap(
          ValidationScreen(service: FakeValidationService()),
          authWith(const []),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.textContaining('tidak memiliki izin'), findsOneWidget);
      expect(find.text('Pindai dokumen'), findsNothing);
    });

    testWidgets('menampilkan form scan tanpa izin create', (tester) async {
      useTallScreen(tester);
      await tester.pumpWidget(
        wrap(
          ValidationScreen(service: FakeValidationService()),
          authWith(const ['sj_validation.view']),
        ),
      );
      await tester.pumpAndSettle();

      final startButton = tester.widget<OutlinedButton>(
        find.widgetWithText(OutlinedButton, 'Mulai Validasi'),
      );
      expect(startButton.onPressed, isNull);
      expect(
        find.textContaining('tidak memiliki izin memulai validasi'),
        findsOneWidget,
      );
    });

    testWidgets('start dari kode manual membuka detail dokumen', (
      tester,
    ) async {
      useTallScreen(tester);
      final service = FakeValidationService()
        ..result = sjValidation(
          po: 'PO-7788',
          nopol: 'B 9 ZZ',
          driver: 'Siti',
          items: <SjValidationItem>[
            validationItem(id: 1),
            validationItem(
              id: 2,
              kode: 'BRG-2',
              nama: 'Minyak Goreng 1L',
              expectedQty: 24,
            ),
          ],
        );
      await tester.pumpWidget(
        wrap(ValidationScreen(service: service), authWith(_allPermissions)),
      );
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField).first, 'PO-7788');
      await tester.tap(find.widgetWithText(OutlinedButton, 'Mulai Validasi'));
      await tester.pumpAndSettle();

      expect(service.calls, ['start:PO-7788']);
      expect(find.text('PO-7788'), findsOneWidget);
      expect(find.text('B 9 ZZ'), findsOneWidget);
      expect(find.text('Siti'), findsOneWidget);
      expect(find.text('0/2 diperiksa'), findsOneWidget);
      expect(find.text('BRG-1'), findsOneWidget);
      expect(find.text('BRG-2'), findsOneWidget);
      expect(
        find.text('Selesaikan (2 item lagi)'),
        findsOneWidget,
        reason: 'tombol selesai harus terkunci selama ada item belum diperiksa',
      );
    });

    testWidgets('dokumen gagal lookup menampilkan pesan server', (
      tester,
    ) async {
      useTallScreen(tester);
      final service = FakeValidationService()
        ..startError = dioError(404, message: 'Rencana kirim tidak ditemukan.');
      await tester.pumpWidget(
        wrap(ValidationScreen(service: service), authWith(_allPermissions)),
      );
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField).first, 'PO-X');
      await tester.tap(find.widgetWithText(OutlinedButton, 'Mulai Validasi'));
      await tester.pumpAndSettle();

      expect(find.text('Rencana kirim tidak ditemukan.'), findsOneWidget);
    });

    testWidgets('simpan item memperbarui status & membuka tombol selesai', (
      tester,
    ) async {
      useTallScreen(tester);
      final service = FakeValidationService();
      await tester.pumpWidget(
        wrap(ValidationScreen(service: service), authWith(_allPermissions)),
      );
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField).first, 'PO-7788');
      await tester.tap(find.widgetWithText(OutlinedButton, 'Mulai Validasi'));
      await tester.pumpAndSettle();

      await tester.tap(find.text('BRG-1'));
      await tester.pumpAndSettle();

      await tester.enterText(find.byKey(const Key('item-qty')), '100');
      await pickExpiredDate(tester);
      await tester.tap(find.widgetWithText(FilledButton, 'Simpan Validasi'));
      await tester.pumpAndSettle();

      expect(
        service.calls,
        contains('scan:1:100.0:FISIK_BAGUS:-'),
        reason:
            'qty aktual dikirim sebagai angka, tanpa foto saat kondisi bagus',
      );
      expect(find.text('Selisih · Fisik Bagus'), findsOneWidget);
      expect(find.text('1/1 diperiksa'), findsOneWidget);

      final complete = tester.widget<FilledButton>(
        find.widgetWithText(FilledButton, 'Selesaikan Validasi'),
      );
      expect(complete.onPressed, isNotNull);
    });

    testWidgets('kondisi bermasalah tanpa foto ditolak sebelum dikirim', (
      tester,
    ) async {
      useTallScreen(tester);
      final service = FakeValidationService();
      await tester.pumpWidget(
        wrap(ValidationScreen(service: service), authWith(_allPermissions)),
      );
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField).first, 'PO-7788');
      await tester.tap(find.widgetWithText(OutlinedButton, 'Mulai Validasi'));
      await tester.pumpAndSettle();

      await tester.tap(find.text('BRG-1'));
      await tester.pumpAndSettle();

      await tester.enterText(find.byKey(const Key('item-qty')), '90');
      await tester.tap(find.text('Qty Kurang'));
      await tester.pumpAndSettle();

      expect(
        find.text('Bukti fotografi kondisi wajib'),
        findsOneWidget,
        reason: 'kondisi yang mewajibkan foto memakai blok amber seperti web',
      );
      expect(find.byKey(const Key('item-photo-camera')), findsOneWidget);
      expect(find.byKey(const Key('item-photo-gallery')), findsOneWidget);

      await tester.tap(find.widgetWithText(FilledButton, 'Simpan Validasi'));
      await tester.pumpAndSettle();

      expect(
        service.calls.where((c) => c.startsWith('scan:')),
        isEmpty,
        reason: 'tidak boleh memanggil API yang pasti ditolak backend',
      );
      // Tanggal expired dicek lebih dulu: tanpa tanggal, operator belum
      // pernah melihat kartu standar umur, jadi foto belum boleh diminta.
      expect(find.text('Tanggal expired wajib diisi.'), findsOneWidget);

      await pickExpiredDate(tester);
      await tester.tap(find.widgetWithText(FilledButton, 'Simpan Validasi'));
      await tester.pumpAndSettle();

      expect(
        service.calls.where((c) => c.startsWith('scan:')),
        isEmpty,
        reason: 'tidak boleh memanggil API yang pasti ditolak backend',
      );
      expect(find.text('Foto wajib untuk kondisi Qty Kurang.'), findsOneWidget);
    });

    testWidgets('tanpa izin validate, tombol simpan mati & alasannya terlihat', (
      tester,
    ) async {
      useTallScreen(tester);
      await tester.pumpWidget(
        wrap(
          ValidationScreen(service: FakeValidationService()),
          authWith(const <String>[
            'sj_validation.view',
            'sj_validation.create',
            'sj_validation.complete',
          ]),
        ),
      );
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField).first, 'PO-7788');
      await tester.tap(find.widgetWithText(OutlinedButton, 'Mulai Validasi'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('BRG-1'));
      await tester.pumpAndSettle();

      // Web menonaktifkan tombol simpan dengan
      // `!hasPermission('sj_validation.validate')`; mobile menolak lebih awal —
      // di layar sentuh sheet yang tidak bisa disimpan hanya jadi jebakan, jadi
      // form tidak boleh dibuka sama sekali. Endpoint `POST /{sv}/scan` juga
      // butuh izin itu, jadi tidak ada request yang percuma.
      expect(
        find.textContaining('Izin sj_validation.validate diperlukan'),
        findsOneWidget,
      );
      await tester.tap(find.text('BRG-1'));
      await tester.pumpAndSettle();

      expect(
        find.widgetWithText(FilledButton, 'Simpan Validasi'),
        findsNothing,
        reason: 'sheet item tidak boleh terbuka tanpa izin validate',
      );
      expect(find.text('Item yang diperiksa'), findsNothing);
    });

    testWidgets('form item menampilkan peringatan umur di bawah standar', (
      tester,
    ) async {
      useTallScreen(tester);
      final now = DateTime.now();
      String iso(DateTime d) =>
          '${d.year.toString().padLeft(4, '0')}-'
          '${d.month.toString().padLeft(2, '0')}-'
          '${d.day.toString().padLeft(2, '0')}';
      final service = FakeValidationService()
        ..result = sjValidation(
          items: <SjValidationItem>[
            validationItem(
              id: 1,
              expectedQty: 100,
              actualQty: 100,
              status: statusValidated,
              umur: 12,
              expiredDate: iso(DateTime(now.year, now.month + 4, now.day)),
            ),
          ],
        );
      await tester.pumpWidget(
        wrap(ValidationScreen(service: service), authWith(_allPermissions)),
      );
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField).first, 'PO-7788');
      await tester.tap(find.widgetWithText(OutlinedButton, 'Mulai Validasi'));
      await tester.pumpAndSettle();

      await tester.tap(find.text('BRG-1'));
      await tester.pumpAndSettle();

      // Kartu standar umur: angka Standar / Sisa simpan / Selisih + kalimat
      // kesimpulan, sama seperti blok `DATABASE` di `validasi-sj/page.tsx`.
      expect(find.text('Standar umur produk'), findsOneWidget);
      expect(find.text('DATABASE'), findsOneWidget);
      expect(find.text('4'), findsWidgets, reason: 'sisa simpan 4 bulan');
      expect(
        find.textContaining('Sisa simpan kurang dari standar (-'),
        findsOneWidget,
      );
      expect(
        find.byKey(const Key('item-expired-popup')),
        findsOneWidget,
        reason: 'popup pemeriksaan umur harus bisa dibuka ulang',
      );
      expect(
        find.byKey(const Key('item-qty')).first,
        findsOneWidget,
        reason: 'item yang sudah diperiksa terisi qty aktual dari server',
      );
    });

    testWidgets('form item tanpa master umur tidak menampilkan peringatan', (
      tester,
    ) async {
      useTallScreen(tester);
      final service = FakeValidationService()
        ..result = sjValidation(
          items: <SjValidationItem>[
            validationItem(
              id: 1,
              status: statusValidated,
              actualQty: 10,
              // umur null = tidak ada master umur untuk produk ini.
            ),
          ],
        );
      await tester.pumpWidget(
        wrap(ValidationScreen(service: service), authWith(_allPermissions)),
      );
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField).first, 'PO-7788');
      await tester.tap(find.widgetWithText(OutlinedButton, 'Mulai Validasi'));
      await tester.pumpAndSettle();

      await tester.tap(find.text('BRG-1'));
      await tester.pumpAndSettle();

      // Tanpa master umur dan tanpa tanggal expired, kartu hanya memberi
      // perintah — bukan angka nol palsu dan bukan peringatan tebakan.
      expect(find.text('Standar umur produk'), findsOneWidget);
      expect(
        find.text('Isi tanggal expired untuk melihat perbandingan.'),
        findsOneWidget,
      );
    });

    testWidgets(
      'popup pemeriksaan umur menampilkan angka yang sama dengan kartu',
      (tester) async {
        useTallScreen(tester);
        final now = DateTime.now();
        String iso(DateTime d) =>
            '${d.year.toString().padLeft(4, '0')}-'
            '${d.month.toString().padLeft(2, '0')}-'
            '${d.day.toString().padLeft(2, '0')}';
        final service = FakeValidationService()
          ..result = sjValidation(
            items: <SjValidationItem>[
              validationItem(
                id: 1,
                status: statusValidated,
                actualQty: 100,
                umur: 12,
                expiredDate: iso(DateTime(now.year, now.month + 4, now.day)),
              ),
            ],
          );
        await tester.pumpWidget(
          wrap(ValidationScreen(service: service), authWith(_allPermissions)),
        );
        await tester.pumpAndSettle();

        await tester.enterText(find.byType(TextField).first, 'PO-7788');
        await tester.tap(find.widgetWithText(OutlinedButton, 'Mulai Validasi'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('BRG-1'));
        await tester.pumpAndSettle();

        // Hero item gelap + judul bagian berbatang aksen, padanan blok
        // `bg-slate-950` dan `h-5 w-1 rounded-full bg-primary-500` di web.
        expect(find.text('ITEM YANG DIPERIKSA'), findsOneWidget);
        expect(find.text('DATA PEMERIKSAAN'), findsOneWidget);
        expect(find.text('IDENTIFIKASI & KONDISI'), findsOneWidget);

        await tester.tap(find.byKey(const Key('item-expired-popup')));
        await tester.pumpAndSettle();

        // Assertion popup di-scope ke `Dialog` supaya tidak ikut menghitung
        // kartu dengan kalimat identik yang ada di sheet di bawahnya.
        final popup = find.descendant(
          of: find.byType(Dialog),
          matching: find.byType(Column),
        );
        expect(find.text('PEMERIKSAAN UMUR'), findsOneWidget);
        expect(find.text('Standar Umur Produk'), findsOneWidget);
        expect(find.text('PERLU PERHATIAN'), findsOneWidget);
        expect(
          find.descendant(
            of: find.byType(Dialog),
            matching: find.text('Sisa simpan kurang dari standar (-8 bulan).'),
          ),
          findsOneWidget,
        );
        expect(
          find.text('Perbandingan terhadap standar'),
          findsOneWidget,
          reason: 'bilah persentase harus ada seperti `umurRatio` di web',
        );
        expect(find.text('33%'), findsOneWidget);
        expect(popup, findsWidgets);

        await tester.tap(find.byKey(const Key('item-umur-popup-ack')));
        await tester.pumpAndSettle();

        expect(find.text('Standar Umur Produk'), findsNothing);
        expect(
          find.byKey(const Key('item-qty')),
          findsOneWidget,
          reason: 'menutup popup harus kembali ke sheet, bukan menutup sheet',
        );
      },
    );

    testWidgets('memilih tanggal expired langsung membuka popup umur', (
      tester,
    ) async {
      useTallScreen(tester);
      await tester.pumpWidget(
        wrap(
          ValidationScreen(service: FakeValidationService()),
          authWith(_allPermissions),
        ),
      );
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField).first, 'PO-7788');
      await tester.tap(find.widgetWithText(OutlinedButton, 'Mulai Validasi'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('BRG-1'));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('item-expired')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('15'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('OK'));
      await tester.pumpAndSettle();

      // Web membuka popup di `onChange` tanggal expired (`setShowUmurPopup(true)`);
      // operator tidak boleh harus menekan tombol kedua untuk tahu hasilnya.
      expect(find.text('Standar Umur Produk'), findsOneWidget);
      expect(
        find.text('DATA LENGKAP'),
        findsOneWidget,
        reason: 'tanpa master umur',
      );
      expect(find.text('HASIL PEMERIKSAAN'), findsOneWidget);
      expect(
        find.text(
          'Standar umur produk tidak tersedia. Data standar umur perlu diisi '
          'di database standar umur produk.',
        ),
        findsOneWidget,
        reason: 'popup memakai kalimat lengkap, kartu memakai yang ringkas',
      );
      expect(find.text('Pahami'), findsOneWidget);
    });

    testWidgets('baris item dibaca screen reader sebagai satu tombol utuh', (
      tester,
    ) async {
      useTallScreen(tester);
      final service = FakeValidationService()
        ..result = sjValidation(
          items: <SjValidationItem>[
            validationItem(
              id: 1,
              status: statusValidated,
              actualQty: 90,
              condition: conditionQtyShort,
            ),
            validationItemWithoutStack(id: 2),
          ],
        );
      await tester.pumpWidget(
        wrap(ValidationScreen(service: service), authWith(_allPermissions)),
      );
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField).first, 'PO-7788');
      await tester.tap(find.widgetWithText(OutlinedButton, 'Mulai Validasi'));
      await tester.pumpAndSettle();

      // Lima potongan visual (kode, nama, chip qty, pill status) harus
      // terdengar sebagai satu elemen yang bisa ditekan, bukan lima node
      // terpisah yang harus di-swipe satu per satu — dan bukan ringkasan
      // yang diulang lengkap oleh teks anak-anaknya.
      final semantics = tester.getSemantics(
        find.byKey(const Key('validation-item-1')),
      );
      expect(
        semantics.flagsCollection.isButton,
        isTrue,
        reason: 'baris harus diumumkan sebagai tombol, bukan teks biasa',
      );
      expect(semantics.label, contains('BRG-1, Beras Premium 5kg'));
      expect(
        semantics.label,
        contains('90 dari 100 KG'),
        reason: 'hasil hitung harus terbaca sebagai "aktual dari rencana"',
      );
      expect(
        semantics.label,
        contains('Qty Kurang'),
        reason: 'kondisi hasil pemeriksaan ikut terbaca',
      );

      // Baris yang produknya belum ter-standarisasi harus menyebut warning-nya,
      // karena ketukan itu membuka halaman lain — bukan form pemeriksaan.
      final blocked = tester.getSemantics(
        find.byKey(const Key('validation-item-2')),
      );
      expect(blocked.label, contains('Belum ada standarisasi'));
    });

    testWidgets('selesai validasi: konfirmasi → complete → kembali ke scan', (
      tester,
    ) async {
      useTallScreen(tester);
      final service = FakeValidationService()
        ..result = sjValidation(
          items: <SjValidationItem>[
            validationItem(
              id: 1,
              actualQty: 90,
              status: statusMismatch,
              condition: conditionQtyShort,
            ),
          ],
        );
      await tester.pumpWidget(
        wrap(ValidationScreen(service: service), authWith(_allPermissions)),
      );
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField).first, 'PO-7788');
      await tester.tap(find.widgetWithText(OutlinedButton, 'Mulai Validasi'));
      await tester.pumpAndSettle();

      await tester.tap(
        find.widgetWithText(FilledButton, 'Selesaikan Validasi'),
      );
      await tester.pumpAndSettle();

      expect(find.text('Selesaikan validasi?'), findsOneWidget);
      expect(
        find.textContaining('1 item berselisih'),
        findsOneWidget,
        reason: 'operator harus tahu notifikasi email akan dikirim',
      );

      await tester.tap(find.widgetWithText(FilledButton, 'Ya, Selesaikan'));
      await tester.pumpAndSettle();

      expect(service.calls, contains('complete:7'));
      expect(
        find.textContaining('Validasi selesai. 1 item selisih'),
        findsOneWidget,
        reason:
            'pesan harus menyebut selisih + notifikasi email, sama seperti web',
      );
      expect(find.text('Pindai dokumen'), findsOneWidget);
    });

    testWidgets('tanpa izin complete tombol selesai nonaktif', (tester) async {
      useTallScreen(tester);
      final service = FakeValidationService()
        ..result = sjValidation(
          items: <SjValidationItem>[
            validationItem(id: 1, actualQty: 100, status: statusValidated),
          ],
        );
      await tester.pumpWidget(
        wrap(
          ValidationScreen(service: service),
          authWith(const [
            'sj_validation.view',
            'sj_validation.create',
            'sj_validation.validate',
          ]),
        ),
      );
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField).first, 'PO-7788');
      await tester.tap(find.widgetWithText(OutlinedButton, 'Mulai Validasi'));
      await tester.pumpAndSettle();

      final complete = tester.widget<FilledButton>(
        find.widgetWithText(FilledButton, 'Selesaikan Validasi'),
      );
      expect(complete.onPressed, isNull);
      final cancel = tester.widget<OutlinedButton>(
        find.widgetWithText(OutlinedButton, 'Batalkan Validasi'),
      );
      expect(cancel.onPressed, isNull, reason: 'butuh sj_validation.edit');
    });

    testWidgets('tanpa izin validate item tidak bisa dibuka', (tester) async {
      useTallScreen(tester);
      final service = FakeValidationService();
      await tester.pumpWidget(
        wrap(
          ValidationScreen(service: service),
          authWith(const ['sj_validation.view', 'sj_validation.create']),
        ),
      );
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField).first, 'PO-7788');
      await tester.tap(find.widgetWithText(OutlinedButton, 'Mulai Validasi'));
      await tester.pumpAndSettle();

      expect(find.textContaining('tidak memeriksa item'), findsOneWidget);

      await tester.tap(find.text('BRG-1'));
      await tester.pumpAndSettle();

      expect(
        find.text('Qty aktual *'),
        findsNothing,
        reason: 'tile item nonaktif — form tidak boleh terbuka tanpa izin',
      );
      expect(service.calls.where((c) => c.startsWith('scan:')), isEmpty);
    });

    /// Izin yang dibutuhkan alur gerbang Standarisasi: operator validasi harus
    /// juga boleh membuka & membuat standarisasi, seperti di web.
    const stackGatePermissions = <String>[
      ..._allPermissions,
      'standarisasi.view',
      'standarisasi.create',
    ];

    /// Buka satu dokumen yang itemnya produknya belum punya standarisasi
    /// disetujui, lalu kembalikan service yang sudah siap diuji.
    Future<(FakeValidationService, FakeStandarisasiService)> openLockedDocument(
      WidgetTester tester,
    ) async {
      final service = FakeValidationService()
        ..result = sjValidation(
          items: <SjValidationItem>[
            validationItem(
              standarisasi: stackRow(status: standarisasiStatusPending),
            ),
          ],
        );
      final standarisasi = FakeStandarisasiService();
      await tester.pumpWidget(
        wrap(
          ValidationScreen(service: service, standarisasiService: standarisasi),
          authWith(stackGatePermissions),
        ),
      );
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField).first, 'PO-7788');
      await tester.tap(find.widgetWithText(OutlinedButton, 'Mulai Validasi'));
      await tester.pumpAndSettle();
      return (service, standarisasi);
    }

    testWidgets('item tanpa standarisasi langsung membuka halaman Standarisasi', (
      tester,
    ) async {
      // Padanan `openItem` di web: `!item.standarisasi || status !== 'approved'`
      // → `router.push('/standarisasi?productId=...')`, bukan membuka form.
      useTallScreen(tester);
      final (_, standarisasi) = await openLockedDocument(tester);

      expect(find.text('Standarisasi menunggu approval'), findsOneWidget);

      await tester.tap(find.text('BRG-1'));
      await tester.pumpAndSettle();

      expect(
        find.text('Kelola standarisasi tumpukan produk per depo'),
        findsOneWidget,
        reason: 'harus pindah ke halaman Standarisasi',
      );
      expect(
        find.text('Qty aktual *'),
        findsNothing,
        reason: 'form item tidak boleh terbuka untuk produk terkunci',
      );
      expect(
        standarisasi.calls,
        contains('search:BRG-1'),
        reason: 'produk yang bermasalah harus diteruskan ke halaman',
      );

      // Banner amber hanya terlihat setelah operator kembali; saat ini
      // halaman Standarisasi yang menutupinya — persis seperti di web.
      await tester.tap(find.byTooltip('Kembali'));
      await tester.pumpAndSettle();

      expect(
        find.text('Standarisasi Tumpukan Belum Disetujui'),
        findsOneWidget,
        reason: 'banner amber harus muncul setelah kembali dari Standarisasi',
      );
    });

    testWidgets(
      'kembali dari Standarisasi menyegarkan dokumen & membuka form',
      (tester) async {
        useTallScreen(tester);
        final (service, _) = await openLockedDocument(tester);

        await tester.tap(find.text('BRG-1'));
        await tester.pumpAndSettle();

        // Sambil operator di halaman Standarisasi, BLC menyetujui lewat web.
        service.result = sjValidation(
          items: <SjValidationItem>[validationItem()],
        );
        await tester.tap(find.byTooltip('Kembali'));
        await tester.pumpAndSettle();

        expect(
          service.calls.where((c) => c.startsWith('show:')),
          isNotEmpty,
          reason: 'dokumen harus disegarkan saat kembali dari Standarisasi',
        );
        expect(find.text('Standarisasi menunggu approval'), findsNothing);

        await tester.tap(find.text('BRG-1'));
        await tester.pumpAndSettle();

        expect(find.text('Qty aktual *'), findsOneWidget);
      },
    );

    testWidgets('tombol banner "Buat Standarisasi" membuka halaman', (
      tester,
    ) async {
      useTallScreen(tester);
      await openLockedDocument(tester);

      await tester.tap(find.text('BRG-1'));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Kembali'));
      await tester.pumpAndSettle();

      await tester.tap(
        find.byKey(const Key('validation-standarisasi-banner-action')),
      );
      await tester.pumpAndSettle();

      expect(
        find.text('Kelola standarisasi tumpukan produk per depo'),
        findsOneWidget,
      );
    });

    testWidgets('produk tanpa standarisasi sama sekali tetap dialihkan', (
      tester,
    ) async {
      // Item yang backend belum pernah menyisipkan objek standarisasi:
      // `standarisasi == null` juga harus memicu gerbang.
      useTallScreen(tester);
      final service = FakeValidationService()
        ..result = sjValidation(
          items: <SjValidationItem>[validationItemWithoutStack()],
        );
      final standarisasi = FakeStandarisasiService();

      await tester.pumpWidget(
        wrap(
          ValidationScreen(service: service, standarisasiService: standarisasi),
          authWith(stackGatePermissions),
        ),
      );
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField).first, 'PO-7788');
      await tester.tap(find.widgetWithText(OutlinedButton, 'Mulai Validasi'));
      await tester.pumpAndSettle();

      expect(find.text('Belum ada standarisasi'), findsOneWidget);

      await tester.tap(find.text('BRG-1'));
      await tester.pumpAndSettle();

      expect(
        find.text('Kelola standarisasi tumpukan produk per depo'),
        findsOneWidget,
      );
    });

    testWidgets('dari Check Point: dokumen dibuka tanpa scan/ketik PO lagi', (
      tester,
    ) async {
      useTallScreen(tester);
      final service = FakeValidationService();
      await tester.pumpWidget(
        wrap(ValidationScreen(service: service), authWith(_allPermissions)),
      );
      await tester.pumpAndSettle();
      expect(service.calls, isEmpty, reason: 'tanpa permintaan, layar pasif');

      await tester.pumpWidget(
        wrap(
          ValidationScreen(
            service: service,
            startRequest: const ValidationStartRequest(
              rencanaKirimId: 5,
              token: 1,
            ),
          ),
          authWith(_allPermissions),
        ),
      );
      await tester.pumpAndSettle();

      expect(service.calls, ['startRencana:5']);
      expect(find.text('PO-7788'), findsOneWidget);
      expect(
        find.text('Pindai dokumen'),
        findsNothing,
        reason: 'form scan harus hilang karena dokumen sudah terbuka',
      );
    });

    testWidgets('permintaan yang sama tidak memicu start ulang saat rebuild', (
      tester,
    ) async {
      useTallScreen(tester);
      final service = FakeValidationService();
      const request = ValidationStartRequest(rencanaKirimId: 5, token: 1);

      await tester.pumpWidget(
        wrap(
          ValidationScreen(service: service, startRequest: request),
          authWith(_allPermissions),
        ),
      );
      await tester.pumpAndSettle();
      await tester.pumpWidget(
        wrap(
          ValidationScreen(service: service, startRequest: request),
          authWith(_allPermissions),
        ),
      );
      await tester.pumpAndSettle();

      expect(service.calls, ['startRencana:5']);
    });

    testWidgets('token baru membuka kembali dokumen yang sama', (tester) async {
      useTallScreen(tester);
      final service = FakeValidationService();
      await tester.pumpWidget(
        wrap(ValidationScreen(service: service), authWith(_allPermissions)),
      );
      await tester.pumpAndSettle();

      for (final token in [1, 2]) {
        await tester.pumpWidget(
          wrap(
            ValidationScreen(
              service: service,
              startRequest: ValidationStartRequest(
                rencanaKirimId: 5,
                token: token,
              ),
            ),
            authWith(_allPermissions),
          ),
        );
        await tester.pumpAndSettle();
      }

      expect(service.calls, ['startRencana:5', 'startRencana:5']);
    });

    testWidgets('dari Check Point: error backend ditampilkan, tidak crash', (
      tester,
    ) async {
      useTallScreen(tester);
      final service = FakeValidationService()
        ..startError = dioError(
          422,
          message:
              'Validasi tidak dapat dimulai untuk rencana berstatus DRAFT.',
        );
      await tester.pumpWidget(
        wrap(
          ValidationScreen(
            service: service,
            startRequest: const ValidationStartRequest(
              rencanaKirimId: 5,
              token: 1,
            ),
          ),
          authWith(_allPermissions),
        ),
      );
      await tester.pumpAndSettle();

      expect(
        find.text(
          'Validasi tidak dapat dimulai untuk rencana berstatus DRAFT.',
        ),
        findsOneWidget,
      );
      expect(find.text('Pindai dokumen'), findsOneWidget);
    });

    testWidgets('dokumen yang validasinya selesai jadi baca-saja', (
      tester,
    ) async {
      useTallScreen(tester);
      final service = FakeValidationService()
        ..result = sjValidation(
          status: statusCompleted,
          items: <SjValidationItem>[
            validationItem(id: 1, actualQty: 90, status: statusMismatch),
          ],
        );
      await tester.pumpWidget(
        wrap(
          ValidationScreen(
            service: service,
            startRequest: const ValidationStartRequest(
              rencanaKirimId: 5,
              token: 1,
            ),
          ),
          authWith(_allPermissions),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.textContaining('sudah selesai'), findsOneWidget);
      final complete = tester.widget<FilledButton>(
        find.widgetWithText(FilledButton, 'Selesaikan Validasi'),
      );
      expect(
        complete.onPressed,
        isNull,
        reason: 'backend menolak complete di luar IN_PROGRESS (422)',
      );
      await tester.tap(find.text('BRG-1'));
      await tester.pumpAndSettle();
      expect(find.text('Qty aktual *'), findsNothing);
      expect(service.calls.where((c) => c.startsWith('scan:')), isEmpty);
    });

    testWidgets(
      'halaman scan menyinggung alur Check Point untuk operator gate',
      (tester) async {
        useTallScreen(tester);
        await tester.pumpWidget(
          wrap(
            ValidationScreen(service: FakeValidationService()),
            authWith(const [..._allPermissions, 'gate.view']),
          ),
        );
        await tester.pumpAndSettle();

        expect(
          find.textContaining('Sudah scan di tab Check In?'),
          findsOneWidget,
        );

        await tester.pumpWidget(
          wrap(
            ValidationScreen(service: FakeValidationService()),
            authWith(const ['sj_validation.view', 'sj_validation.create']),
          ),
        );
        await tester.pumpAndSettle();

        expect(
          find.textContaining('Sudah scan di tab Check In?'),
          findsNothing,
          reason: 'tanpa izin gate, catatan Check Point tidak relevan',
        );
      },
    );
  });

  group('HomeShell', () {
    testWidgets('tab Validasi hanya ada bila punya sj_validation.view', (
      tester,
    ) async {
      await tester.pumpWidget(
        wrap(
          HomeShell(validationService: FakeValidationService()),
          authWith(const ['gate.view']),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byType(NavigationDestination), findsNWidgets(3));
      expect(find.text('Validasi'), findsNothing);
    });

    testWidgets('tab Validasi membuka layar dan memuat dokumen', (
      tester,
    ) async {
      useTallScreen(tester);
      await tester.pumpWidget(
        wrap(
          HomeShell(validationService: FakeValidationService()),
          authWith(const ['sj_validation.view']),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byType(NavigationDestination), findsNWidgets(3));
      expect(find.text('Validasi'), findsOneWidget);

      await tester.tap(find.text('Validasi'));
      await tester.pumpAndSettle();

      expect(find.text('Pindai dokumen'), findsOneWidget);
    });

    testWidgets('Gate IN → Mulai Validasi langsung membuka dokumennya', (
      tester,
    ) async {
      useTallScreen(tester);
      final gateService = FakeGateService()
        ..lookupResult = rencana('SCHEDULED', id: 5, po: 'PO-7788');
      final validationService = FakeValidationService();
      await tester.pumpWidget(
        wrap(
          HomeShell(
            gateService: gateService,
            validationService: validationService,
          ),
          authWith(const [
            'gate.view',
            'gate.create',
            'rencana_kirim.edit',
            'sj_validation.view',
            'sj_validation.create',
          ]),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Check In'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField).first, 'PO-7788');
      await tester.tap(find.widgetWithText(FilledButton, 'Cari'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Gate IN →'));
      await tester.tap(find.text('Gate IN →'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Ya, Catat IN'));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('gate-continue-validation')));
      await tester.pumpAndSettle();

      expect(validationService.calls, ['startRencana:5']);
      expect(
        find.text('PO-7788'),
        findsOneWidget,
        reason: 'dokumen terbuka di tab Validasi, tanpa scan/ketik ulang',
      );
      expect(find.text('Pindai dokumen'), findsNothing);
    });

    testWidgets('dari Check In: "Mulai Validasi" membuka tab Validasi', (
      tester,
    ) async {
      useTallScreen(tester);
      final gateService = FakeGateService()
        ..lookupResult = rencana('CHECKED_IN', id: 5, po: 'PO-7788');
      await tester.pumpWidget(
        wrap(
          HomeShell(
            gateService: gateService,
            validationService: FakeValidationService(),
          ),
          authWith(const [
            'gate.view',
            'gate.create',
            'rencana_kirim.edit',
            'sj_validation.view',
            'sj_validation.create',
          ]),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Check In'));
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField).first, 'PO-7788');
      await tester.tap(find.widgetWithText(FilledButton, 'Cari'));
      await tester.pumpAndSettle();
      expect(find.text('PO-7788'), findsNWidgets(2));

      await tester.ensureVisible(find.text('Mulai Validasi →'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Mulai Validasi →'));
      await tester.pumpAndSettle();

      expect(find.text('Validasi Dokumen'), findsWidgets);
      expect(
        find.text('PO-7788'),
        findsOneWidget,
        reason: 'dokumen dibuka langsung, tanpa panel scan di tengah',
      );
      expect(
        find.text('Pindai dokumen'),
        findsNothing,
        reason:
            'tab Check In mengirim dokumen, jadi operator tidak perlu scan lagi',
      );
      expect(
        find.text('Mulai Validasi →', skipOffstage: false),
        findsOneWidget,
        reason:
            'tab Check In tetap hidup di IndexedStack, dokumennya tidak hilang',
      );
    });

    testWidgets(
      'tanpa sj_validation.view tombol Validasi di Check In disembunyikan',
      (tester) async {
        useTallScreen(tester);
        final gateService = FakeGateService()
          ..lookupResult = rencana('CHECKED_IN', po: 'PO-7788');
        await tester.pumpWidget(
          wrap(
            HomeShell(
              gateService: gateService,
              validationService: FakeValidationService(),
            ),
            authWith(const ['gate.view', 'gate.create']),
          ),
        );
        await tester.pumpAndSettle();

        await tester.tap(find.text('Check In'));
        await tester.pumpAndSettle();
        await tester.enterText(find.byType(TextField).first, 'PO-7788');
        await tester.tap(find.widgetWithText(FilledButton, 'Cari'));
        await tester.pumpAndSettle();

        expect(find.text('Mulai Validasi →'), findsNothing);
      },
    );

    testWidgets('setiap tab memakai pita header yang sama', (tester) async {
      useTallScreen(tester);
      await tester.pumpWidget(
        wrap(
          HomeShell(validationService: FakeValidationService()),
          authWith(const ['dashboard.view', 'gate.view', 'sj_validation.view']),
        ),
      );
      await tester.pumpAndSettle();

      // Beranda, Check In, Validasi, dan Saya semuanya berheader lewat
      // [PageHeader] yang sama. Tanpa ini, tiap tab bisa kembali memakai
      // AppBar/hero sendiri-sendiri dan aplikasi terasa dirakit dari 4 app.
      for (final tab in const ['Beranda', 'Check In', 'Validasi', 'Saya']) {
        await tester.tap(find.text(tab));
        await tester.pumpAndSettle();
        expect(
          find.byType(PageHeader),
          findsOneWidget,
          reason: 'tab $tab harus punya tepat satu pita header',
        );
        expect(
          find.byType(AppBar),
          findsNothing,
          reason: 'tab $tab tidak boleh memakai AppBar color sendiri',
        );
      }
    });

    testWidgets('detail validasi bisa disegarkan tanpa keluar ke daftar', (
      tester,
    ) async {
      useTallScreen(tester);
      final service = FakeValidationService();
      await tester.pumpWidget(
        wrap(
          HomeShell(validationService: service),
          authWith(const ['sj_validation.view', 'sj_validation.create']),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Validasi'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const Key('validation-code')),
        'PO-7788',
      );
      await tester.tap(find.widgetWithText(OutlinedButton, 'Mulai Validasi'));
      await tester.pumpAndSettle();
      expect(find.text('Item dokumen'), findsOneWidget);
      service.calls.clear();

      // Status dokumen bisa diubah supervisor yang bekerja di web, jadi
      // operator di lapangan perlu jalan pintas untuk menyegarkan. Cara
      // memicunya (tarikan) milik framework, jadi yang dijaga di sini adalah
      // milik kita: daftar detail punya RefreshIndicator yang terpasang, dan
      // aksi tarikan itu memanggil [ValidationSessionProvider.refresh] (bukan
      // membuat validasi baru).
      final indicator = find.ancestor(
        of: find.text('Item dokumen'),
        matching: find.byType(RefreshIndicator),
      );
      expect(indicator, findsOneWidget);
      // `onRefresh` wajib diisi, jadi cukup memastikan indikator benar-benar
      // memanggil aksi penyegaran kita.
      await tester.widget<RefreshIndicator>(indicator).onRefresh();
      await tester.pumpAndSettle();

      expect(service.calls, [
        'show:7',
      ], reason: 'refresh harus baca-saja: show, bukan start');
    });
  });
}
