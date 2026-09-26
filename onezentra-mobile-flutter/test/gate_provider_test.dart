import 'package:flutter_test/flutter_test.dart';
import 'package:onezentra_mobile/features/gate/gate_provider.dart';
import 'package:onezentra_mobile/features/gate/gate_session_provider.dart';
import 'package:onezentra_mobile/features/gate/gate_service.dart';
import 'package:onezentra_mobile/features/gate/models/gate_models.dart';

import 'support/test_harness.dart';

void main() {
  // Aksi gate yang berhasil memanggil `HapticFeedback`, yang butuh binding
  // sudah ada. File ini murni unit test (tanpa `testWidgets`), jadi binding
  // harus diinisialisasi sendiri.
  TestWidgetsFlutterBinding.ensureInitialized();

  group('GateProvider riwayat', () {
    test('halaman tidak melompat setelah "Muat lebih banyak" gagal', () async {
      final service = _PagedService();
      final gate = GateProvider(service);

      await gate.loadHistory(reset: true);
      expect(gate.page, 1);
      expect(gate.hasMoreHistory, isTrue);

      service.failPage = 2;
      await gate.nextPage('');
      expect(gate.page, 1, reason: 'halaman 2 gagal → tetap di halaman 1');
      expect(gate.historyError, isNotNull);
      expect(gate.hasMoreHistory, isTrue);

      service.failPage = null;
      await gate.nextPage('');
      expect(gate.page, 2, reason: 'retry mengambil halaman 2, bukan 3');
      expect(gate.history.map((e) => e.poTransporter), ['PO-1', 'PO-2']);
      expect(gate.historyError, isNull);
    });

    test('respons usang diabaikan saat pencarian berubah', () async {
      final service = _PagedService();
      final gate = GateProvider(service);

      final slow = gate.loadHistory(reset: true, search: 'lama');
      final fast = gate.loadHistory(reset: true, search: 'baru');
      await Future.wait([slow, fast]);

      expect(
        service.searches.where((s) => s == 'baru'),
        isNotEmpty,
        reason: 'pencarian baru benar-benar dikirim',
      );
      expect(gate.history, isNotEmpty);
      expect(gate.historyLoading, isFalse);
    });

    test(
      'loadHistory tanpa reset tidak memuat apa pun sebelum halaman 1',
      () async {
        final service = _PagedService();
        final gate = GateProvider(service);

        await gate.nextPage('');

        expect(service.pagesRequested, isEmpty);
        expect(gate.history, isEmpty);
      },
    );

    test('reset() mengosongkan statistik & riwayat', () async {
      final service = _PagedService();
      final gate = GateProvider(service);
      await gate.loadStats();
      await gate.loadHistory(reset: true);
      expect(gate.history, isNotEmpty);

      gate.reset();

      expect(gate.history, isEmpty);
      expect(gate.page, 0);
      expect(gate.lastPage, 1);
      expect(gate.totalRows, 0);
      expect(gate.stats.total, 0);
      expect(gate.hasMoreHistory, isFalse);
    });

    test('statistik gagal dilaporkan sebagai error, bukan angka nol', () async {
      final service = _PagedService();
      final gate = GateProvider(service);
      await gate.loadStats();
      final before = gate.stats.total;

      service.statsError = networkError();
      await gate.loadStats();

      expect(gate.statsError, contains('Tidak dapat terhubung'));
      expect(
        gate.stats.total,
        before,
        reason: 'angka terakhir tidak disamarkan jadi nol',
      );
    });
  });

  group('GateSessionProvider', () {
    test('lookup gagal tidak menyisakan dokumen sebelumnya', () async {
      final service = FakeGateService();
      final session = GateSessionProvider(service);

      await session.lookup('PO-1');
      expect(session.found, isNotNull);

      service.lookupError = dioError(
        404,
        message: 'Rencana kirim tidak ditemukan',
      );
      await session.lookup('PO-HANTU');

      expect(
        session.found,
        isNull,
        reason: 'dokumen lama tidak boleh bisa di-Gate-IN setelah lookup gagal',
      );
      expect(session.resultError, 'Rencana kirim tidak ditemukan');
    });

    test('lookup kosong diabaikan', () async {
      final service = FakeGateService();
      final session = GateSessionProvider(service);

      await session.lookup('   ');

      expect(service.calls, isEmpty);
      expect(session.found, isNull);
    });

    test('lookup kedua menggantikan hasil pertama yang telat', () async {
      final service = _SlowLookupService();
      final session = GateSessionProvider(service);

      final first = session.lookup('lama');
      final second = session.lookup('baru');
      await Future.wait([first, second]);

      expect(session.found?.poTransporter, 'PO-BARU');
    });

    test('gateIn berhasil: dokumen dibersihkan & data dimuat ulang', () async {
      final service = FakeGateService();
      var refreshed = 0;
      final session = GateSessionProvider(
        service,
        onCommitted: () async => refreshed++,
      );

      await session.lookup('PO-1');
      final ok = await session.gateIn();

      expect(ok, isTrue);
      expect(session.found, isNull);
      expect(session.resultOk, contains('Gate IN berhasil'));
      expect(refreshed, 1);
      expect(service.calls, contains('gateIn:PO-1'));
    });

    test('refresh gagal tidak mengubah pesan sukses jadi error', () async {
      final session = GateSessionProvider(
        FakeGateService(),
        onCommitted: () async => throw networkError(),
      );

      await session.lookup('PO-1');
      final ok = await session.gateIn();

      expect(ok, isTrue);
      expect(session.resultError, isNull);
    });

    test('aksi tanpa dokumen aktif tidak memanggil service', () async {
      final service = FakeGateService();
      final session = GateSessionProvider(service);

      expect(await session.gateIn(), isFalse);
      expect(await session.gateOut(), isFalse);
      expect(await session.verify(), isFalse);
      expect(service.calls, isEmpty);
    });

    test('aksi yang ditolak server menampilkan pesan dari backend', () async {
      final session = GateSessionProvider(FakeGateService());
      await session.lookup('PO-1');
      final rejected = GateSessionProvider(_RejectingService());
      await rejected.lookup('PO-1');

      final ok = await rejected.gateIn();

      expect(ok, isFalse);
      expect(rejected.resultError, contains('hanya dapat dilakukan'));
      expect(session.resultError, isNull);
    });
  });
}

class _PagedService extends FakeGateService {
  int lastPage = 3;
  int? failPage;
  final List<int> pagesRequested = [];
  final List<String> searches = [];

  @override
  Future<GateHistoryPage> history({String search = '', int page = 1}) async {
    pagesRequested.add(page);
    searches.add(search);
    calls.add('history:$page:$search');
    if (failPage == page) {
      throw networkError();
    }
    return GateHistoryPage(
      items: [historyItem(id: page, po: 'PO-$page')],
      currentPage: page,
      lastPage: lastPage,
      total: lastPage,
    );
  }
}

class _SlowLookupService extends FakeGateService {
  @override
  Future<RencanaKirimSummary> lookup(String nomor) async {
    if (nomor == 'lama') {
      await Future<void>.delayed(const Duration(milliseconds: 30));
      return rencana('SCHEDULED', po: 'PO-LAMA');
    }
    return rencana('SCHEDULED', po: 'PO-BARU');
  }
}

class _RejectingService extends FakeGateService {
  @override
  Future<String> gateIn(RencanaKirimSummary rk) async {
    throw dioError(
      422,
      message: 'Gate INBOUND hanya dapat dilakukan untuk rencana SCHEDULED.',
    );
  }
}
