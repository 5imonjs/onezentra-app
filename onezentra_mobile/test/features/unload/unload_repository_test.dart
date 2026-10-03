import 'package:flutter_test/flutter_test.dart';

import 'package:onezentra_mobile/core/network/api_client.dart';
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
    test('findByPo memilih cocok persis, bukan kandidat pertama', () async {
      String? detailEndpoint;
      var repository = UnloadRepository(
        get: (endpoint) async {
          if (endpoint.startsWith('/receivings?')) {
            return {
              'data': [
                _receivingRow(id: 1, po: 'PO-0420'),
                _receivingRow(id: 7, po: 'PO-042'),
              ],
              'current_page': 1,
              'last_page': 1,
              'total': 2,
            };
          }
          detailEndpoint = endpoint;
          return _sessionBody();
        },
        post: (_, _) async => throw StateError('unexpected POST'),
      );

      var session = await repository.findByPo('po-042');

      expect(session, isA<UnloadSession>());
      expect(session.id, 7);
      expect(detailEndpoint, '/receivings/7');
      expect(session.plan, hasLength(1));
    });

    test('findByPo tanpa cocok persis menjawab 404', () async {
      var repository = UnloadRepository(
        get: (_) async => {
          'data': [_receivingRow(po: 'PO-0420')],
          'current_page': 1,
          'last_page': 1,
          'total': 1,
        },
        post: (_, _) async => throw StateError('unexpected POST'),
      );

      await expectLater(
        repository.findByPo('PO-042'),
        throwsA(
          isA<ApiException>().having((e) => e.statusCode, 'status', 404),
        ),
      );
    });

    test('findByPo menolak dokumen yang sudah selesai', () async {
      var repository = UnloadRepository(
        get: (endpoint) async {
          if (endpoint.startsWith('/receivings?')) {
            return {
              'data': [_receivingRow(status: 'COMPLETED')],
              'current_page': 1,
              'last_page': 1,
              'total': 1,
            };
          }
          throw StateError('detail must not be fetched');
        },
        post: (_, _) async => throw StateError('unexpected POST'),
      );

      await expectLater(
        repository.findByPo('PO-042'),
        throwsA(
          isA<ApiException>().having(
            (e) => e.message,
            'message',
            contains('Hasil Penerimaan'),
          ),
        ),
      );
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
      expect(
        hitBody,
        {
          'kode_barang': 'BRG-1',
          'actual_qty': 100.0,
          'nama_barang': 'Gula 50kg',
          'satuan': 'zak',
          'condition': 'FISIK_BAGUS',
          'rencana_kirim_item_id': 101,
        },
      );
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
