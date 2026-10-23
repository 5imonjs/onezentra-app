import 'package:flutter_test/flutter_test.dart';

import 'package:onezentra_mobile/features/unload/models/unload_models.dart';
import 'package:onezentra_mobile/features/unload/repositories/unload_repository.dart';

Map<String, dynamic> _receivingRow({
  int id = 7,
  String po = 'PO-042',
  String status = 'PENDING',
}) => {
  'id': id,
  'status': status,
  'total_expected_qty': 100,
  'total_received_qty': 0,
  'rencana_kirim': {
    'id': 11,
    'po_transporter': po,
    'nopol': 'B 9999 ZZ',
    'driver_name': 'Andi',
  },
};

Map<String, dynamic> _sessionBody({String status = 'PENDING'}) => {
  'data': {
    'id': 7,
    'status': status,
    'total_expected_qty': 100,
    'total_received_qty': 0,
    'rencana_kirim': {
      'id': 11,
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
  },
};

void main() {
  group('UnloadRepository', () {
    test('stats memakai satu permintaan agregat', () async {
      var requestedEndpoints = <String>[];
      var repository = UnloadRepository(
        get: (endpoint) async {
          requestedEndpoints.add(endpoint);
          return {
            'data': {
              'total': 12,
              'pending': 3,
              'in_progress': 4,
              'completed': 5,
            },
          };
        },
        post: (_, _) async => throw StateError('unexpected POST'),
      );

      var stats = await repository.stats();

      expect(requestedEndpoints, ['/receivings/stats']);
      expect(stats.total, 12);
      expect(stats.pending, 3);
      expect(stats.inProgress, 4);
      expect(stats.completed, 5);
    });

    test(
      'listActive memuat receiving menunggu dan diproses per halaman',
      () async {
        var requestedStatuses = <String>[];
        var repository = UnloadRepository(
          get: (endpoint) async {
            var query = Uri.parse(endpoint).queryParameters;
            var status = query['status']!;
            requestedStatuses.add('$status:${query['page']}');
            return {
              'data': [_receivingRow(status: status)],
              'total': 10,
              'last_page': 3,
            };
          },
          post: (_, _) async => throw StateError('unexpected POST'),
        );

        var result = await repository.listActive(page: 2, perPage: 5);

        expect(requestedStatuses, ['PENDING:2', 'IN_PROGRESS:2']);
        expect(result.items.map((row) => row.status).toList(), [
          'PENDING',
          'IN_PROGRESS',
        ]);
        expect(result.items, hasLength(2));
        expect(result.total, 20);
        expect(result.page, 2);
        expect(result.lastPage, 3);
      },
    );

    test('findByPo memakai satu endpoint lookup PO eksak', () async {
      String? requestedEndpoint;
      var repository = UnloadRepository(
        get: (endpoint) async {
          requestedEndpoint = endpoint;
          return _sessionBody();
        },
        post: (_, _) async => throw StateError('unexpected POST'),
      );

      var session = await repository.findByPo('po-042');

      expect(session, isA<UnloadSession>());
      expect(session.id, 7);
      expect(
        Uri.parse(requestedEndpoint!).path,
        '/receivings/search/by-po',
      );
      expect(
        Uri.parse(requestedEndpoint!).queryParameters['po_transporter'],
        'po-042',
      );
      expect(session.plan, hasLength(1));
    });

    test('scan mengirim field kontrak receiving', () async {
      Map<String, dynamic>? hitBody;
      String? hitEndpoint;
      var repository = UnloadRepository(
        get: (_) async => throw StateError('unexpected GET'),
        post: (endpoint, body) async {
          hitEndpoint = endpoint;
          hitBody = body;
          return {'message': 'Item scanned successfully', 'data': {}};
        },
      );

      await repository.scan(
        receivingId: 7,
        kodeBarang: 'BRG-1',
        actualQty: 100,
        namaBarang: 'Gula 50kg',
        satuan: 'zak',
        rencanaKirimItemId: 101,
      );

      expect(hitEndpoint, '/receivings/7/scan');
      expect(hitBody, {
        'kode_barang': 'BRG-1',
        'actual_qty': 100.0,
        'nama_barang': 'Gula 50kg',
        'satuan': 'zak',
        'condition': 'FISIK_BAGUS',
        'rencana_kirim_item_id': 101,
      });
    });

    test('complete mengirim PO sebagai barcode penutup', () async {
      Map<String, dynamic>? hitBody;
      var repository = UnloadRepository(
        get: (_) async => throw StateError('unexpected GET'),
        post: (endpoint, body) async {
          hitBody = body;
          return _sessionBody(status: 'COMPLETED');
        },
      );

      var session = await repository.complete(7, barcode: 'PO-042');

      expect(hitBody, {'barcode': 'PO-042'});
      expect(session.status, 'COMPLETED');
    });
  });
}
