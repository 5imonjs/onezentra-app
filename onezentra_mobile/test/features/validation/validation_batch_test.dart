import 'package:flutter_test/flutter_test.dart';

import 'package:onezentra_mobile/features/validation/models/validation_models.dart';

void main() {
  group('SjValidationItem.batch', () {
    test('membaca batch dari respons scan server', () {
      // Server sudah mengembalikan relasi batch dari scan(); tanpa ini, label
      // tidak akan pernah bisa dicetak dari HP.
      final item = SjValidationItem.fromJson({
        'id': 1,
        'sj_validation_id': 2,
        'kode_barang': '90103211143100',
        'status': 'VALIDATED',
        'batch': {
          'id': 9,
          'batch_number': 'BATCH-EQYELKCY',
          'barcode_label': 'LBL-LDWDPPJNMP',
        },
      });

      expect(item.batch, isNotNull);
      expect(item.batch!.batchNumber, 'BATCH-EQYELKCY');
      expect(item.batch!.barcodeLabel, 'LBL-LDWDPPJNMP');
    });

    test('batch null bila server belum menerbitkan label', () {
      // Item yang belum divalidasi belum punya label; UI harus membedakan
      // kondisi ini dari label yang hilang karena bug.
      final item = SjValidationItem.fromJson({'id': 1, 'sj_validation_id': 2});
      expect(item.batch, isNull);
      expect(item.hasLabel, isFalse);
    });

    test('tidak crash saat field batch null', () {
      final item = SjValidationItem.fromJson({
        'id': 1,
        'sj_validation_id': 2,
        'batch': null,
      });
      expect(item.batch, isNull);
      expect(item.hasLabel, isFalse);
    });

    test('hasLabel hanya true kalau barcode_label terisi', () {
      // Batch tanpa barcode_label tidak bisa dicetak sebagai barcode, jadi
      // tombol cetak tidak boleh muncul dan menjanjikan sesuatu yang tak ada.
      final tanpaBarcode = SjValidationItem.fromJson({
        'id': 1,
        'sj_validation_id': 2,
        'batch': {'id': 9, 'batch_number': 'BATCH-1'},
      });
      expect(tanpaBarcode.hasLabel, isFalse);

      final denganBarcode = SjValidationItem.fromJson({
        'id': 1,
        'sj_validation_id': 2,
        'batch': {'id': 9, 'barcode_label': 'LBL-1'},
      });
      expect(denganBarcode.hasLabel, isTrue);
    });

    test('batch_label kosong tidak dianggap punya label', () {
      // String kosong akan tercetak sebagai label tanpa barcode — persis bug
      // yang harus dihindari.
      final item = SjValidationItem.fromJson({
        'id': 1,
        'sj_validation_id': 2,
        'batch': {'id': 9, 'barcode_label': ''},
      });
      expect(item.hasLabel, isFalse);
    });
  });
}
