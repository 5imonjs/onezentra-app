import 'dart:convert';
import 'dart:typed_data';

/// Identitas sistem yang dicetak pada setiap label, supaya label yang lepas dari
/// kardus atau tersesat bisa ditelusuri balik ke sistem asalnya.
const String systemIdentity = 'ONEZENTRA by LANGKAU KAMI';

/// Penyusun byte ESC/POS untuk printer thermal Bluetooth Classic.
///
/// Printer thermal murah umumnya punya dua mode: mode teks (semua byte dicetak
/// apa adanya) dan mode ESC/POS (byte kontrol diterjemahkan jadi perintah).
/// Kode ini dipakai untuk menghasilkan byte ESC/POS.
///
/// Catatan penting: **barcode HANYA muncul kalau printer-nya benar-benar
/// mendukung perintah GS k.** Printer teks polos akan mencetak byte kontrol itu
/// sebagai karakter aneh. Karena itu pemanggil harus menyediakan jalur cadangan
/// teks lewat [buildLabelText].
class EscPosBuilder {
  EscPosBuilder();

  final BytesBuilder _buffer = BytesBuilder();

  // Kode kontrol ESC/POS.
  static const int _esc = 0x1B;
  static const int _gs = 0x1D;
  static const int _lf = 0x0A;

  /// Kode symbologi barcode: 73 = CODE39, format yang didukung hampir semua
  /// printer thermal entry-level.
  static const int code39 = 73;

  /// Set alignment baris: 0 kiri, 1 tengah, 2 kanan.
  EscPosBuilder align(int value) {
    _buffer.add([_esc, 0x61, value]);
    return this;
  }

  EscPosBuilder center() => align(1);

  EscPosBuilder left() => align(0);

  /// Nyalakan atau matikan huruf tebal.
  EscPosBuilder bold({bool enabled = true}) {
    _buffer.add([_esc, 0x45, if (enabled) 1 else 0]);
    return this;
  }

  /// Set ukuran huruf (lebar 1..8, tinggi 1..8). Tidak efektif di printer yang
  /// cuma punya satu ukuran.
  EscPosBuilder textSize({int width = 1, int height = 1}) {
    var w = width.clamp(1, 8);
    var h = height.clamp(1, 8);
    _buffer.add([_gs, 0x21, ((w - 1) << 4) | (h - 1)]);
    return this;
  }

  /// Reset ukuran huruf ke normal.
  EscPosBuilder normalSize() => textSize();

  EscPosBuilder text(String value) {
    _buffer.add(utf8.encode(value));
    return this;
  }

  /// Tulis teks lalu turun satu baris.
  EscPosBuilder line(String value) {
    _buffer.add(utf8.encode(value));
    return feed();
  }

  /// Turunkan [lines] baris kosong.
  EscPosBuilder feed([int lines = 1]) {
    for (var i = 0; i < lines; i++) {
      _buffer.add([_lf]);
    }
    return this;
  }

  /// Set tinggi barcode dalam titik (dot). 60 ≈ 6 mm, cukup untuk discan
  /// scanner tangan.
  EscPosBuilder barcodeHeight(int dots) {
    _buffer.add([_gs, 0x68, dots.clamp(1, 255)]);
    return this;
  }

  /// Set lebar modul barcode dalam titik, 2..6. Makin lebar makin mudah dibaca
  /// dan makin lebar hasil cetak.
  EscPosBuilder barcodeModuleWidth(int dots) {
    _buffer.add([_gs, 0x77, dots.clamp(2, 6)]);
    return this;
  }

  /// Cetak barcode Code39.
  ///
  /// Panjang data dibatasi 48 karakter sesuai spesifikasi printer; data yang
  /// lebih panjang dipotong di sini agar tidak tercetak terpotong tanpa
  /// pemberitahuan ke operator.
  EscPosBuilder barcode(String data, {int moduleWidth = 3, int height = 70}) {
    if (data.isEmpty) {
      return this;
    }
    var value = data.length > 48 ? data.substring(0, 48) : data;
    barcodeModuleWidth(moduleWidth);
    barcodeHeight(height);
    _buffer.add([_gs, 0x6B, code39, value.length]);
    _buffer.add(utf8.encode(value));
    return this;
  }

  /// Potong kertas. Printer tanpa pisau-cutting akan mengabaikannya; karena itu
  /// hanya dikirim kalau [enabled] diaktifkan.
  EscPosBuilder cut({required bool enabled}) {
    if (!enabled) {
      return this;
    }
    _buffer.add([_gs, 0x56, 0x00]);
    return this;
  }

  Uint8List build() => _buffer.toBytes();
}

/// Daftar karakter yang aman untuk Code39.
///
/// Code39 hanya bisa membawa angka, huruf besar, spasi, dan beberapa tanda
/// baca. `barcode_label` dari server sudah berawalan `LBL-` dan hanya berisi
/// A-Z/0-9, tapi data dari sumber lain belum tentu — karakter di luar daftar
/// ini diganti titik agar barcode tetap tercetak utuh (dan tetap bisa discan)
/// alih-alih ditolak printer.
String sanitizeCode39(String value) {
  const allowed = r'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ -. $/+%';
  var buffer = StringBuffer();
  for (var char in value.toUpperCase().split('')) {
    buffer.write(allowed.contains(char) ? char : '.');
  }
  return buffer.toString();
}
