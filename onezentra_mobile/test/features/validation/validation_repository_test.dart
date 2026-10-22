import 'package:flutter_test/flutter_test.dart';

import 'package:onezentra_mobile/core/network/api_client.dart';
import 'package:onezentra_mobile/features/validation/models/validation_models.dart';
import 'package:onezentra_mobile/features/validation/repositories/validation_repository.dart';

Map<String, dynamic> _sessionBody({String status = 'IN_PROGRESS'}) => {
  'data': {
    'id': 9,
    'rencana_kirim_id': 11,
    'scan_code': 'PO-042',
    'status': status,
    'started_at': '2026-02-01T08:00:00.000Z',
    'rencana_kirim': {
      'id': 11,
      'po_transporter': 'PO-042',
      'nopol': 'B 9999 ZZ',
      'driver_name': 'Andi',
      'status': 'CHECKED_IN',
    },
    'items': [
      {
        'id': 31,
        'sj_validation_id': 9,
        'kode_barang': 'BRG-1',
        'nama_barang': 'Gula 50kg',
        'expected_qty': 100,
        'actual_qty': null,
        'satuan': 'zak',
        'condition': 'FISIK_BAGUS',
        'status': 'PENDING',
      },
      {
        'id': 32,
        'sj_validation_id': 9,
        'kode_barang': 'BRG-2',
        'nama_barang': 'Terigu 25kg',
        'expected_qty': 50,
        'actual_qty': 50,
        'satuan': 'zak',
        'condition': 'FISIK_BAGUS',
        'status': 'VALIDATED',
      },
    ],
  },
};

void main() {
  group('ValidationRepository', () {
    test('startByCode membuka sesi dari barcode PO', () async {
      String? hitEndpoint;
      Map<String, dynamic>? hitBody;
      var repository = ValidationRepository(
        get: (_) async => throw StateError('unexpected GET'),
        post: (endpoint, body) async {
          hitEndpoint = endpoint;
          hitBody = body;
          return _sessionBody();
        },
      );

      var session = await repository.startByCode('  PO-042 ');

      expect(hitEndpoint, '/sj-validations/start-by-code');
      expect(hitBody, {'scan_code': 'PO-042'});
      expect(session, isA<SjValidation>());
      expect(session.id, 9);
      expect(session.document?.poTransporter, 'PO-042');
      expect(session.items, hasLength(2));
      expect(session.validatedCount, 1);
    });

    test('startByCode menolak kode kosong tanpa memanggil API', () async {
      var calls = 0;
      var repository = ValidationRepository(
        get: (_) async => throw StateError('unexpected GET'),
        post: (_, _) async {
          calls++;
          return _sessionBody();
        },
      );

      await expectLater(
        repository.startByCode('   '),
        throwsA(isA<ApiException>()),
      );
      expect(calls, 0);
    });

    test('scanItem mengirim field validasi dan memparse item', () async {
      Map<String, dynamic>? hitBody;
      var repository = ValidationRepository(
        get: (_) async => throw StateError('unexpected GET'),
        post: (endpoint, body) async {
          expect(endpoint, '/sj-validations/9/scan');
          hitBody = body;
          return {
            'message': 'Item divalidasi',
            'data': {
              'id': 31,
              'sj_validation_id': 9,
              'kode_barang': 'BRG-1',
              'nama_barang': 'Gula 50kg',
              'expected_qty': 100,
              'actual_qty': 95,
              'satuan': 'zak',
              'condition': 'QTY_KURANG',
              'status': 'MISMATCH',
            },
          };
        },
      );

      var item = await repository.scanItem(
        validationId: 9,
        itemId: 31,
        actualQty: 95,
        condition: 'QTY_KURANG',
        notes: 'kurang 5',
      );

      expect(hitBody, {
        'sj_validation_item_id': 31,
        'actual_qty': 95.0,
        'condition': 'QTY_KURANG',
        'notes': 'kurang 5',
      });
      expect(item, isA<SjValidationItem>());
      expect(item.status, 'MISMATCH');
      expect(item.actualQty, 95);
    });

    test('scanItem dengan foto memakai multipart, bukan JSON', () async {
      String? hitEndpoint;
      Map<String, String>? hitFields;
      String? hitFileField;
      String? hitFilePath;
      var repository = ValidationRepository(
        get: (_) async => throw StateError('unexpected GET'),
        post: (_, _) async => throw StateError('unexpected JSON POST'),
        postMultipart:
            (
              endpoint,
              fields, {
              required String fileField,
              required String filePath,
            }) async {
              hitEndpoint = endpoint;
              hitFields = fields;
              hitFileField = fileField;
              hitFilePath = filePath;
              return {
                'message': 'Item divalidasi',
                'data': {
                  'id': 31,
                  'sj_validation_id': 9,
                  'kode_barang': 'BRG-1',
                  'nama_barang': 'Gula 50kg',
                  'expected_qty': 100,
                  'actual_qty': 95,
                  'satuan': 'zak',
                  'condition': 'QTY_KURANG',
                  'photo': 'validation-photos/bukti.jpg',
                  'status': 'MISMATCH',
                },
              };
            },
      );

      var item = await repository.scanItem(
        validationId: 9,
        itemId: 31,
        actualQty: 95,
        condition: 'QTY_KURANG',
        notes: 'kurang 5',
        photoPath: '/tmp/bukti.jpg',
      );

      expect(hitEndpoint, '/sj-validations/9/scan');
      expect(hitFields, {
        'sj_validation_item_id': '31',
        'actual_qty': '95.0',
        'condition': 'QTY_KURANG',
        'notes': 'kurang 5',
      });
      expect(hitFileField, 'photo');
      expect(hitFilePath, '/tmp/bukti.jpg');
      expect(item.hasPhoto, isTrue);
    });

    test('stats tanpa data merosot ke nol, bukan gagal', () async {
      var repository = ValidationRepository(
        get: (_) async => {'unexpected': 'shape'},
        post: (_, _) async => throw StateError('unexpected POST'),
      );

      var stats = await repository.stats();

      expect(stats.total, 0);
      expect(stats.berjalan, 0);
    });

    test('complete memparse sesi selesai', () async {
      var repository = ValidationRepository(
        get: (_) async => throw StateError('unexpected GET'),
        post: (endpoint, _) async {
          expect(endpoint, '/sj-validations/9/complete');
          return _sessionBody(status: 'COMPLETED');
        },
      );

      var session = await repository.complete(9);

      expect(session.status, 'COMPLETED');
      expect(session.isRunning, isFalse);
    });

    test('createStandarisasi mengirim npn + tier × tinggi', () async {
      Map<String, dynamic>? hitBody;
      String? hitEndpoint;
      var repository = ValidationRepository(
        get: (_) async => throw StateError('unexpected GET'),
        post: (endpoint, body) async {
          hitEndpoint = endpoint;
          hitBody = body;
          return {'message': 'Standarisasi tumpukan created', 'data': {}};
        },
      );

      await repository.createStandarisasi(
        npnId: 501,
        tier: 4,
        tinggiTumpukan: 6,
      );

      expect(hitEndpoint, '/standarisasi-tumpukan');
      expect(hitBody, {'npn_id': 501, 'tier': 4, 'tinggi_tumpukan': 6});
    });

    test('respons non-objek ditolak dengan pesan jelas', () async {
      var repository = ValidationRepository(
        get: (_) async => 'proxy HTML page',
        post: (_, _) async => throw StateError('unexpected POST'),
      );

      await expectLater(
        repository.show(9),
        throwsA(
          isA<ApiException>().having(
            (e) => e.message,
            'message',
            contains('tidak valid'),
          ),
        ),
      );
    });
  });
}
