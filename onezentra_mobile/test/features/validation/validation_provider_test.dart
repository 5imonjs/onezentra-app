import 'dart:async';

import 'package:flutter_test/flutter_test.dart';

import 'package:onezentra_mobile/core/network/api_client.dart';
import 'package:onezentra_mobile/features/validation/models/validation_models.dart';
import 'package:onezentra_mobile/features/validation/providers/validation_provider.dart';
import 'package:onezentra_mobile/features/validation/repositories/validation_repository.dart';

/// Repository yang menjawab sesuai skenario per panggilan, sehingga jendela
/// loading antar-sesi bisa diamati lewat completer.
class _ScriptedValidationRepository extends ValidationRepository {
  _ScriptedValidationRepository(this.script);
  final List<Future<SjValidation> Function()> script;
  var calls = 0;

  @override
  Future<SjValidation> startByCode(String scanCode) => script[calls++]();
}

class _MarkFakeRepository extends ValidationRepository {
  _MarkFakeRepository(this.session, {this.markError, this.showGate});
  SjValidation session;
  final Object? markError;
  final List<int> markCalls = [];
  var showCalls = 0;

  /// Bila terisi, [show] ditahan sampai completer selesai — untuk
  /// menyimulasikan provider yang sibuk saat laporan cetak masuk.
  Completer<void>? showGate;

  @override
  Future<SjValidation> startByCode(String scanCode) async => session;

  @override
  Future<SjValidation> show(int id) async {
    showCalls++;
    var gate = showGate;
    if (gate != null) {
      await gate.future;
    }
    return session;
  }

  @override
  Future<void> markPrinted(int batchId) async {
    markCalls.add(batchId);
    var error = markError;
    if (error != null) {
      throw error;
    }
  }
}

class _SearchRaceRepository extends ValidationRepository {
  final List<Completer<ValidationHistoryPage>> requests = [];
  final List<String?> searches = [];

  @override
  Future<ValidationHistoryPage> list({
    String? search,
    int page = 1,
    int perPage = 20,
  }) {
    searches.add(search);
    var completer = Completer<ValidationHistoryPage>();
    requests.add(completer);
    return completer.future;
  }

  @override
  Future<ValidationStats> stats() async => const ValidationStats();
}

class _ExtraFakeRepository extends ValidationRepository {
  _ExtraFakeRepository(this.session, {this.reportError});
  SjValidation session;
  final Object? reportError;
  final List<String?> reportKodeBarang = [];
  final List<String?> reportPhotoPath = [];
  var showCalls = 0;

  List<NpnProduct> searchResults = const [];
  Object? searchError;
  int searchCalls = 0;
  String? lastSearchQuery;

  @override
  Future<List<NpnProduct>> searchProduct(String query) async {
    searchCalls++;
    lastSearchQuery = query;
    var error = searchError;
    if (error != null) {
      throw error;
    }
    return searchResults;
  }

  @override
  Future<SjValidation> startByCode(String scanCode) async => session;

  @override
  Future<SjValidation> show(int id) async {
    showCalls++;
    return session;
  }

  @override
  Future<SjValidationExtraItem> reportExtraItem({
    required int validationId,
    required double qty,
    required String photoPath,
    String? barcode,
    int? npnId,
    String? kodeBarang,
    String? namaBarang,
    String? satuan,
    String condition = 'FISIK_BAGUS',
    String? expiredDate,
    String? notes,
  }) async {
    reportKodeBarang.add(kodeBarang);
    reportPhotoPath.add(photoPath);
    var error = reportError;
    if (error != null) {
      throw error;
    }
    return SjValidationExtraItem(
      id: 71,
      validationId: validationId,
      kodeBarang: kodeBarang ?? 'SKU-LUAR-1',
      namaBarang: namaBarang ?? 'Barang di Luar Rencana',
      qty: qty,
      satuan: satuan,
      condition: condition,
      expiredDate: expiredDate,
      notes: notes,
    );
  }
}

void main() {
  test('scan baru membuang sesi lama selama pemindaian berjalan', () async {
    var pending = Completer<SjValidation>();
    var repository = _ScriptedValidationRepository([
      () => Future.value(const SjValidation(id: 1, scanCode: 'PO-A')),
      () => pending.future,
    ]);
    var provider = ValidationProvider(repository: repository);

    await provider.start('PO-A');
    expect(provider.active?.scanCode, 'PO-A');

    // Pemindaian kedua masih berjalan: sesi lama tidak boleh terpajang.
    var second = provider.start('PO-B');
    await Future<void>.delayed(Duration.zero);
    expect(provider.startBusy, isTrue);
    expect(provider.active, isNull);

    pending.complete(const SjValidation(id: 2, scanCode: 'PO-B'));
    await second;
    expect(provider.active?.scanCode, 'PO-B');

    provider.dispose();
  });

  test('notify setelah dispose tidak melempar', () async {
    var pending = Completer<SjValidation>();
    var repository = _ScriptedValidationRepository([() => pending.future]);
    var provider = ValidationProvider(repository: repository);

    var started = provider.start('PO-A');
    provider.dispose();
    pending.complete(const SjValidation(id: 1, scanCode: 'PO-A'));

    // Selesai tanpa "used after being disposed".
    await started;
  });

  test('markLabelPrinted melaporkan lalu memuat ulang sesi', () async {
    var repository = _MarkFakeRepository(
      const SjValidation(id: 9, scanCode: 'PO-042'),
    );
    var provider = ValidationProvider(repository: repository);

    await provider.start('PO-042');
    var ok = await provider.markLabelPrinted(7);

    expect(ok, isTrue);
    expect(repository.markCalls, [7]);
    expect(repository.showCalls, 1);

    provider.dispose();
  });

  test('markLabelPrinted gagal menyampaikan pesan tanpa melempar', () async {
    var repository = _MarkFakeRepository(
      const SjValidation(id: 9, scanCode: 'PO-042'),
      markError: const ApiException('Label dibatalkan.', 422),
    );
    var provider = ValidationProvider(repository: repository);

    await provider.start('PO-042');
    var ok = await provider.markLabelPrinted(7);

    expect(ok, isFalse);
    expect(provider.message?.success, isFalse);
    expect(provider.message?.message, contains('gagal dilaporkan'));

    provider.dispose();
  });

  test(
    'markLabelPrinted menunggu provider sibuk — laporan tidak hilang',
    () async {
      // Regression: dulu laporan cetak dibatalkan DIAM-DIAM kalau provider
      // sedang sibuk — label fisik tercetak tapi server tidak pernah tahu dan
      // web selamanya menampilkan "belum dicetak".
      var gate = Completer<void>();
      var repository = _MarkFakeRepository(
        const SjValidation(id: 9, scanCode: 'PO-042'),
        showGate: gate,
      );
      var provider = ValidationProvider(repository: repository);

      await provider.start('PO-042');

      // Sibukkan provider dengan refresh sesi yang ditahan.
      var refresh = provider.openSession(9);
      var reported = provider.markLabelPrinted(7);

      // Beri waktu laporan menabrak kondisi sibuk, lalu lepaskan.
      await Future<void>.delayed(const Duration(milliseconds: 700));
      gate.complete();
      await Future.wait([refresh, reported]);

      // Laporan tetap terkirim setelah provider bebas.
      expect(repository.markCalls, [7]);

      provider.dispose();
    },
  );

  test('respons pencarian lama tidak menimpa hasil terbaru', () async {
    var repository = _SearchRaceRepository();
    var provider = ValidationProvider(repository: repository);

    provider.setSearch('PO');
    await Future<void>.delayed(const Duration(milliseconds: 450));
    expect(repository.searches, ['PO']);

    provider.setSearch('PO-2');
    await Future<void>.delayed(const Duration(milliseconds: 450));
    expect(repository.searches, ['PO', 'PO-2']);

    // The newer request lands first; the older one must not overwrite it.
    repository.requests[1].complete(
      const ValidationHistoryPage(
        items: [SjValidation(id: 2, scanCode: 'PO-2')],
        currentPage: 1,
        lastPage: 1,
        total: 1,
      ),
    );
    await Future<void>.delayed(Duration.zero);
    repository.requests[0].complete(
      const ValidationHistoryPage(
        items: [SjValidation(id: 1, scanCode: 'PO-OLD')],
        currentPage: 1,
        lastPage: 1,
        total: 1,
      ),
    );
    await Future<void>.delayed(Duration.zero);

    expect(provider.items.single.scanCode, 'PO-2');
    provider.dispose();
  });

  test('reportExtraItem mencatat lalu memuat ulang sesi', () async {
    var repository = _ExtraFakeRepository(
      const SjValidation(id: 9, scanCode: 'PO-042'),
    );
    var provider = ValidationProvider(repository: repository);

    await provider.start('PO-042');
    var ok = await provider.reportExtraItem(
      qty: 7,
      kodeBarang: 'SKU-LUAR-1',
      namaBarang: 'Barang di Luar Rencana',
      photoPath: '/tmp/bukti.jpg',
    );

    expect(ok, isTrue);
    expect(repository.reportKodeBarang, ['SKU-LUAR-1']);
    expect(repository.reportPhotoPath, ['/tmp/bukti.jpg']);
    expect(repository.showCalls, 1);
    expect(provider.message?.success, isTrue);
    expect(provider.message?.message, contains('tercatat'));

    provider.dispose();
  });

  test('reportExtraItem gagal menyampaikan pesan tanpa melempar', () async {
    var repository = _ExtraFakeRepository(
      const SjValidation(id: 9, scanCode: 'PO-042'),
      reportError: const ApiException('Foto wajib diunggah.', 422),
    );
    var provider = ValidationProvider(repository: repository);

    await provider.start('PO-042');
    var ok = await provider.reportExtraItem(
      qty: 1,
      kodeBarang: 'SKU-LUAR-1',
      namaBarang: 'Barang di Luar Rencana',
      photoPath: '/tmp/bukti.jpg',
    );

    expect(ok, isFalse);
    expect(provider.message?.success, isFalse);
    expect(provider.message?.message, contains('Foto wajib'));

    provider.dispose();
  });

  test('searchProduct meneruskan hasil repository', () async {
    var repository =
        _ExtraFakeRepository(const SjValidation(id: 9, scanCode: 'PO-042'))
          ..searchResults = const [
            NpnProduct(
              id: 5,
              kodeBarang: 'SKU-NPN-77',
              satuan: 'CRT',
              nama: 'Minyak Goreng 2L',
            ),
          ];
    var provider = ValidationProvider(repository: repository);

    var products = await provider.searchProduct('8991234567890');

    expect(repository.searchCalls, 1);
    expect(repository.lastSearchQuery, '8991234567890');
    expect(products.single.kodeBarang, 'SKU-NPN-77');
    expect(products.single.displayName, 'Minyak Goreng 2L');

    provider.dispose();
  });

  test('searchProduct gagal mengembalikan daftar kosong', () async {
    var repository = _ExtraFakeRepository(
      const SjValidation(id: 9, scanCode: 'PO-042'),
    )..searchError = const ApiException('Server tidak merespons.', 503);
    var provider = ValidationProvider(repository: repository);

    var products = await provider.searchProduct('8991234567890');

    // Autofill hanyalah kenyamanan: gagal pencarian tidak melempar, form
    // lanjut ke input manual.
    expect(products, isEmpty);

    provider.dispose();
  });
}
