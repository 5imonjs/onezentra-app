import 'dart:async';

import 'package:flutter_test/flutter_test.dart';

import 'package:onezentra_mobile/core/network/api_client.dart';
import 'package:onezentra_mobile/features/gate/models/gate_models.dart';
import 'package:onezentra_mobile/features/gate/providers/gate_provider.dart';
import 'package:onezentra_mobile/features/gate/repositories/gate_repository.dart';

/// Repository yang menjawab langsung untuk lookup pertama dan menahan
/// lookup kedua sampai completer diselesaikan — agar jendela loading
/// antar-pencarian bisa diamati.
class _PendingGateRepository extends GateRepository {
  _PendingGateRepository(this.first, this.secondCompleter);
  final RencanaKirim first;
  final Completer<RencanaKirim> secondCompleter;
  var calls = 0;

  @override
  Future<RencanaKirim> findByNoDokumen(String nomor) {
    calls++;
    if (calls == 1) {
      return Future.value(first);
    }
    return secondCompleter.future;
  }
}

void main() {
  test('lookup baru membuang kartu lama selama pencarian berjalan', () async {
    var pending = Completer<RencanaKirim>();
    var repository = _PendingGateRepository(
      const RencanaKirim(id: 1, poTransporter: 'PO-A'),
      pending,
    );
    var provider = GateProvider(repository: repository);

    await provider.lookup('PO-A');
    expect(provider.found?.poTransporter, 'PO-A');

    // Pencarian kedua masih berjalan: kartu lama tidak boleh terpajang.
    var second = provider.lookup('PO-B');
    await Future<void>.delayed(Duration.zero);
    expect(provider.lookupBusy, isTrue);
    expect(provider.found, isNull);

    pending.complete(const RencanaKirim(id: 2, poTransporter: 'PO-B'));
    await second;
    expect(provider.found?.poTransporter, 'PO-B');

    provider.dispose();
  });

  test('lookup gagal membuang kartu lama', () async {
    var repository = _FailingGateRepository();
    var provider = GateProvider(repository: repository);

    await provider.lookup('PO-A');
    expect(provider.found?.poTransporter, 'PO-A');

    await provider.lookup('PO-HILANG');
    expect(provider.found, isNull);
    expect(provider.message?.success, isFalse);

    provider.dispose();
  });

  test('hasil pencarian gate lama tidak menimpa query terbaru', () async {
    var repository = _OutOfOrderGateRepository();
    var provider = GateProvider(repository: repository);

    var firstRequest = provider.loadItems();
    provider.setSearch('terbaru');
    await Future<void>.delayed(const Duration(milliseconds: 420));
    expect(repository.searches, [null, 'terbaru']);

    repository.requests[1].complete(_historyPage(2));
    await Future<void>.delayed(Duration.zero);
    repository.requests[0].complete(_historyPage(1));
    await firstRequest;
    await Future<void>.delayed(Duration.zero);

    expect(provider.items.single.poTransporter, 'PO-2');
    provider.dispose();
  });
}

class _FailingGateRepository extends GateRepository {
  var calls = 0;

  @override
  Future<RencanaKirim> findByNoDokumen(String nomor) async {
    calls++;
    if (calls == 1) {
      return const RencanaKirim(id: 1, poTransporter: 'PO-A');
    }
    throw const ApiException('Rencana kirim tidak ditemukan.', 404);
  }
}

class _OutOfOrderGateRepository extends GateRepository {
  final requests = <Completer<GateTransactionPage>>[];
  final searches = <String?>[];

  @override
  Future<GateTransactionPage> list({
    String? search,
    int page = 1,
    int perPage = 20,
  }) {
    searches.add(search);
    var request = Completer<GateTransactionPage>();
    requests.add(request);
    return request.future;
  }
}

GateTransactionPage _historyPage(int id) => GateTransactionPage(
  items: [
    GateTransaction(
      id: id,
      rencanaKirimId: id,
      gateType: 'INBOUND',
      poTransporter: 'PO-$id',
    ),
  ],
  currentPage: 1,
  lastPage: 1,
  total: 1,
);
