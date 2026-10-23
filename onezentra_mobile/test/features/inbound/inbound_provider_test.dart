import 'dart:async';

import 'package:flutter_test/flutter_test.dart';

import 'package:onezentra_mobile/features/inbound/models/inbound_models.dart';
import 'package:onezentra_mobile/features/inbound/providers/inbound_provider.dart';
import 'package:onezentra_mobile/features/inbound/repositories/inbound_repository.dart';

class _DeferredInboundRepository extends InboundRepository {
  final requests = <Completer<ReceivingPage>>[];
  final searches = <String?>[];

  @override
  Future<ReceivingPage> list({String? search, int page = 1, int perPage = 20}) {
    searches.add(search);
    var request = Completer<ReceivingPage>();
    requests.add(request);
    return request.future;
  }
}

ReceivingPage _page(String po) => ReceivingPage(
  items: [Receiving(id: 1, poTransporter: po)],
  currentPage: 1,
  lastPage: 1,
  total: 1,
);

void main() {
  test('hasil pencarian penerimaan lama tidak menimpa query terbaru', () async {
    var repository = _DeferredInboundRepository();
    var provider = InboundProvider(repository: repository);

    var firstRequest = provider.loadItems();
    provider.setSearch('terbaru');
    await Future<void>.delayed(const Duration(milliseconds: 420));
    expect(repository.searches, [null, 'terbaru']);

    repository.requests[1].complete(_page('PO-TERBARU'));
    await Future<void>.delayed(Duration.zero);
    repository.requests[0].complete(_page('PO-LAMA'));
    await firstRequest;
    await Future<void>.delayed(Duration.zero);

    expect(provider.items.single.poTransporter, 'PO-TERBARU');
    provider.dispose();
  });

  test(
    'respons detail yang datang terlambat diabaikan setelah ditutup',
    () async {
      var detail = Completer<Receiving>();
      var provider = InboundProvider(
        repository: _DeferredDetailInboundRepository(detail),
      );

      var opening = provider.openDetail(1);
      provider.closeDetail();
      detail.complete(const Receiving(id: 1, poTransporter: 'PO-LATE'));
      await opening;

      expect(provider.open, isNull);
      expect(provider.detailBusy, isFalse);
      provider.dispose();
    },
  );
}

class _DeferredDetailInboundRepository extends InboundRepository {
  _DeferredDetailInboundRepository(this.detail);

  final Completer<Receiving> detail;

  @override
  Future<Receiving> show(int id) => detail.future;
}
