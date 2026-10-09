import 'dart:typed_data';

import 'package:onezentra_mobile/core/printer/escpos.dart';
import 'package:onezentra_mobile/core/printer/thermal_label.dart';

/// Bangun byte ESC/POS untuk label batch.
///
/// Menghasilkan barcode Code39 yang **bisa discan mesin**, plus teks label
/// sebagai cadangan baca-manual. Karena printer thermal murah punya dua mode
/// (ESC/POS dan mode teks polos), teks dan barcode sengaja dibuat dua jalur:
/// [buildLabelText] untuk printer yang tidak mendukung barcode,
/// fungsi ini untuk yang mendukung.
Uint8List buildLabelBytes(
  BatchLabelData data,
  LabelWidth width, {
  bool enableBarcode = true,
  bool enableCut = true,
}) {
  var cols = width.charsPerLine;
  var esc = EscPosBuilder();

  String safe(Object? v) {
    if (v == null) {
      return '-';
    }
    var text = v.toString().trim();
    return text.isEmpty ? '-' : text;
  }

  List<String> wrap(String text, int maxChars) => wrapLabelText(text, maxChars);

  String line(String left, String right) {
    var gap = cols - left.length - right.length;
    if (gap <= 1) {
      return left;
    }
    return '$left${' ' * gap}$right';
  }

  // Judul: identitas sistem di kiri, nomor PO di kanan.
  esc.left();
  esc.bold();
  esc.line(line('BATCH LABEL', safe(data.poTransporter)));
  esc.bold(enabled: false);
  esc.line('-' * cols);

  esc.line(safe(data.kodeBarang));
  wrap(safe(data.namaBarang), cols).forEach(esc.line);

  var qty = data.actualQty == null ? '-' : trimLabelNumber(data.actualQty!);
  var condition = conditionLabel[data.condition] ?? safe(data.condition);
  esc.line(line('QTY $qty ${safe(data.satuan)}', condition));
  esc.line(line('EXP ${safe(data.expiredDate)}', safe(data.namaDepo)));
  esc.line('-' * cols);

  var barcode = safe(data.barcodeLabel);
  if (enableBarcode) {
    esc.center();
    esc.barcode(sanitizeCode39(barcode));
    // Teks barcode tetap dicetak supaya operator bisa baca dan ketik manual
    // kalau scanner gagal, dan supaya operator bisa cek cepat ke produk yang
    // benar tanpa harus elevate barcode.
    esc.line(barcode);
    esc.left();
  } else {
    esc.line(barcode);
  }
  esc.line('BATCH ${safe(data.batchNumber)}');

  // Identitas sistem, dicetak kecil di footer supaya label yang lepas dari
  // kardus masih bisa ditelusuri balik ke sistem asalnya.
  esc.center();
  esc.line(systemIdentity);

  esc.cut(enabled: enableCut);

  return esc.build();
}

/// Bangun byte ESC/POS untuk printer yang TIDAK mendukung barcode.
///
/// Byte kontrol ESC/POS pada printer mode-teks akan tercetak sebagai karakter
/// aneh, jadi printer seperti ini harus menerima teks polos saja. Label tetap
/// membawa barcode sebagai teks — bisa dibaca manusia, tapi tidak bisa discan
/// mesin.
Uint8List buildLabelBytesWithoutBarcode(BatchLabelData data, LabelWidth width) {
  var bytes = <int>[];
  for (var line in buildLabelText(data, width).split('\n')) {
    bytes.addAll(line.codeUnits);
    bytes.add(0x0A); // LF = turun satu baris
  }
  return Uint8List.fromList(bytes);
}
