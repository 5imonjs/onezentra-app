import 'package:flutter_test/flutter_test.dart';

import 'package:onezentra_mobile/core/network/api_client.dart';
import 'package:onezentra_mobile/features/validation/models/validation_models.dart';
import 'package:onezentra_mobile/features/validation/repositories/validation_repository.dart';

Map<String, dynamic> _sessionBody({
  String status = 'IN_PROGRESS',
  bool extraItems = false,
}) => {
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
    if (extraItems)
      'extra_items': [
        {
          'id': 71,
          'sj_validation_id': 9,
          'kode_barang': 'SKU-LUAR-1',
          'nama_barang': 'Barang di Luar Rencana',
          'qty': 2,
          'satuan': 'CRT',
          'condition': 'FISIK_BAGUS',
          'photo': 'validation-photos/extra.jpg',
          'recorder': {'id': 7, 'full_name': 'Cheker'},
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

    test('searchProduct memanggil endpoint npn dan memparse produk', () async {
      String? hitEndpoint;
      var repository = ValidationRepository(
        get: (endpoint) async {
          hitEndpoint = endpoint;
          // Bentuk respons API asli: {data: [produk...], total, ...} —
          // daftar produk ada di `data` LANGSUNG, bukan `data.data`.
          // Dulu parser membaca `data.data` (bentuk fiktif) sehingga dari
          // server asli selalu menghasilkan daftar kosong dan pencarian di
          // HP terasa "barangnya tidak ada di master NPN".
          return {
            'data': [
              {
                'id': 5,
                'BOSnetszProductId': 'SKU-NPN-77',
                'SAPszProductId': 'MAT-77',
                'SAPszUomId': 'CRT',
                'szNickName': 'Minyak Goreng 2L',
                'szNickNameNew': '',
                'szShortDescription': '',
              },
            ],
            'total': 1,
          };
        },
      );

      var products = await repository.searchProduct('8991234567890');

      expect(hitEndpoint, '/npn/search-product?q=8991234567890&limit=50');
      expect(products, hasLength(1));
      expect(products.first.id, 5);
      expect(products.first.kodeBarang, 'SKU-NPN-77');
      expect(products.first.satuan, 'CRT');
      expect(products.first.displayName, 'Minyak Goreng 2L');
    });

    test(
      'searchProduct toleran bila API membungkus daftar dalam objek',
      () async {
        var repository = ValidationRepository(
          get: (_) async => {
            'data': {
              'data': [
                {'id': 9, 'BOSnetszProductId': 'B-9', 'szNickName': 'AJTM'},
              ],
            },
          },
        );

        var products = await repository.searchProduct('ajtm');

        expect(products, hasLength(1));
        expect(products.first.displayName, 'AJTM');
      },
    );

    test('searchProduct kosong tidak memanggil API sama sekali', () async {
      var calls = 0;
      var repository = ValidationRepository(
        get: (_) async {
          calls++;
          return const {};
        },
      );

      var products = await repository.searchProduct('   ');

      expect(products, isEmpty);
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

    test('reportExtraItem selalu multipart dan foto wajib dikirim', () async {
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
                'message': 'Barang luar rencana tercatat',
                'data': {
                  'id': 71,
                  'sj_validation_id': 9,
                  'kode_barang': 'SKU-LUAR-1',
                  'nama_barang': 'Barang di Luar Rencana',
                  'qty': 7,
                  'satuan': 'CRT',
                  'condition': 'FISIK_BAGUS',
                  'photo': 'validation-photos/extra.jpg',
                  'recorder': {'id': 7, 'full_name': 'Cheker'},
                },
              };
            },
      );

      var extra = await repository.reportExtraItem(
        validationId: 9,
        kodeBarang: 'SKU-LUAR-1',
        namaBarang: 'Barang di Luar Rencana',
        qty: 7,
        satuan: 'CRT',
        notes: 'Ditulis manual di kertas',
        photoPath: '/tmp/bukti.jpg',
      );

      expect(hitEndpoint, '/sj-validations/9/extra-items');
      expect(hitFields, {
        'qty': '7.0',
        'condition': 'FISIK_BAGUS',
        'kode_barang': 'SKU-LUAR-1',
        'nama_barang': 'Barang di Luar Rencana',
        'satuan': 'CRT',
        'notes': 'Ditulis manual di kertas',
      });
      expect(hitFileField, 'photo');
      expect(hitFilePath, '/tmp/bukti.jpg');
      expect(extra, isA<SjValidationExtraItem>());
      expect(extra.kodeBarang, 'SKU-LUAR-1');
      expect(extra.qty, 7);
      expect(extra.hasPhoto, isTrue);
      expect(extra.recorderName, 'Cheker');
    });

    test('reportExtraItem mengirim npn_id dari pilihan master NPN', () async {
      Map<String, String>? hitFields;
      var repository = ValidationRepository(
        postMultipart:
            (endpoint, fields, {required fileField, required filePath}) async {
              hitFields = fields;
              return {
                'data': {
                  'id': 72,
                  'sj_validation_id': 9,
                  'npn_id': 5,
                  'kode_barang': 'SKU-NPN-77',
                  'nama_barang': 'Minyak Goreng 2L',
                  'qty': 5,
                  'satuan': 'CRT',
                  'condition': 'FISIK_BAGUS',
                  'photo': 'validation-photos/extra.jpg',
                },
              };
            },
      );

      var extra = await repository.reportExtraItem(
        validationId: 9,
        npnId: 5,
        qty: 5,
        photoPath: '/tmp/bukti.jpg',
      );

      // Identitas dipegang npn_id; nilai manual tidak dikirim.
      expect(hitFields, {
        'qty': '5.0',
        'condition': 'FISIK_BAGUS',
        'npn_id': '5',
      });
      expect(extra.npnId, 5);
      expect(extra.kodeBarang, 'SKU-NPN-77');
    });

    test('show memparse daftar barang luar rencana', () async {
      var repository = ValidationRepository(
        get: (endpoint) {
          expect(endpoint, '/sj-validations/9');
          return Future.value(_sessionBody(extraItems: true));
        },
        post: (_, _) async => throw StateError('unexpected POST'),
      );

      var session = await repository.show(9);

      expect(session.extraItems, hasLength(1));
      expect(session.extraItems.first.kodeBarang, 'SKU-LUAR-1');
      expect(session.extraItems.first.conditionLabel, 'Fisik bagus');
      expect(session.extraItems.first.recorderName, 'Cheker');
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
