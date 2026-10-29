import 'package:onezentra_mobile/core/printer/escpos.dart';

/// Konfigurasi label thermal.
///
/// Printer thermal diukur dalam **jumlah karakter per baris**, bukan milimeter.
/// 58 mm ≈ 32 karakter, 80 mm ≈ 48 karakter — angka itu yang dipakai printer
/// untuk membungkus teks, dan itulah satu-satunya angka yang selalu sama
/// antar merek. Memakai mm langsung akan sering salah karena font printer
/// berbeda-beda.
enum LabelWidth {
  w58(charsPerLine: 32),
  w80(charsPerLine: 48),
  w110(charsPerLine: 64);

  const LabelWidth({required this.charsPerLine});

  final int charsPerLine;

  String get label => switch (this) {
    LabelWidth.w58 => '58 mm',
    LabelWidth.w80 => '80 mm',
    LabelWidth.w110 => '110 mm',
  };
}

/// Data satu label batch, diambil dari item yang baru divalidasi.
class BatchLabelData {
  const BatchLabelData({
    required this.batchNumber,
    required this.barcodeLabel,
    this.batchId,
    this.kodeBarang,
    this.namaBarang,
    this.actualQty,
    this.satuan,
    this.expiredDate,
    this.condition,
    this.namaDepo,
    this.poTransporter,
    this.isCopy = false,
  });

  /// Id batch server — untuk lapor mark-printed setelah cetak fisik.
  final int? batchId;
  final String? batchNumber;
  final String? barcodeLabel;
  final String? kodeBarang;
  final String? namaBarang;
  final double? actualQty;
  final String? satuan;
  final String? expiredDate;
  final String? condition;
  final String? namaDepo;
  final String? poTransporter;

  /// Label ini cetakan ulang (aslinya sudah pernah dicetak) — kertas
  /// membawa tanda COPY supaya operator tidak menempelkannya sebagai
  /// label asli.
  final bool isCopy;
}

/// Peta kondisi validasi ke bahasa yang tampil di label.
const Map<String, String> conditionLabel = {
  'FISIK_BAGUS': 'Fisik Bagus',
  'FISIK_RUSAK': 'Fisik Rusak',
  'QTY_KURANG': 'Qty Kurang',
  'ISI_KEMASAN_KURANG': 'Isi Kemasan Kurang',
  'EXPIRED_TIDAK_STANDAR': 'Expired/Tdk Standar',
  'SURPLUS': 'Qty Lebih',
  'FISIK_TIDAK_ADA': 'Fisik Tidak Ada',
  'LAINNYA': 'Lainnya',
};

/// Bangun teks label yang dikirim ke printer.
///
/// Sengaja **tidak** memakai `new Date()` untuk tanggal: printer hanya
/// menerima teks, dan kalau tanggal pernah dihitung ulang dari objek Date,
/// zona waktu perangkat bisa menggesernya satu hari. Expired yang bergeser
/// berarti produk diletakkan di rak yang salah.
String buildLabelText(BatchLabelData data, LabelWidth width) {
  var cols = width.charsPerLine;
  var buf = StringBuffer();

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

  String centered(String text) {
    var pad = (cols - text.length) ~/ 2;
    if (pad <= 0) {
      return text;
    }
    return ' ' * pad + text;
  }

  buf.writeln(line('BATCH LABEL', data.poTransporter ?? ''));
  buf.writeln('-' * cols);

  // Tanda cetakan ulang: aslinya sudah pernah dicetak — jangan dipakai
  // sebagai label asli.
  if (data.isCopy) {
    buf.writeln(centered('*** COPY ***'));
  }

  // Kode barang dicetak utuh di satu baris — operator membacanya untuk
  // memindai ulang, jadi tidak boleh dipecah. Tapi kalau lebih panjang dari
  // lebar printer, printer akan membungkusnya sendiri dengan cara yang tidak
  // kita kendalikan; dipotong di sini dengan tanda pemutus supaya operator tahu
  // itu kode terpotong, bukan satu kode utuh.
  var kode = safe(data.kodeBarang);
  buf.writeln(kode.length <= cols ? kode : '${kode.substring(0, cols - 1)}…');
  wrap(safe(data.namaBarang), cols).forEach(buf.writeln);

  var qty = data.actualQty == null ? '-' : trimLabelNumber(data.actualQty!);
  var condition = conditionLabel[data.condition] ?? safe(data.condition);
  buf.writeln(line('QTY $qty ${safe(data.satuan)}', condition));
  buf.writeln(
    line('EXP ${formatExpiredDate(data.expiredDate)}', safe(data.namaDepo)),
  );

  buf.writeln('-' * cols);

  // Barcode dicetak sekali sebagai teks pada jalur tanpa ESC/POS. Pada jalur
  // ESC/POS (lihat [buildLabelBytes]) barcode-nya jadi gambar yang bisa discan
  // dan teks ini jadi catatan baca-manual — bukan duplikat yang sia-sia.
  buf.writeln(safe(data.barcodeLabel));
  buf.writeln('BATCH ${safe(data.batchNumber)}');

  // Identitas sistem supaya label yang lepas dari kardus masih bisa
  // ditelusuri balik ke sistem asalnya.
  buf.writeln(systemIdentity);

  return buf.toString();
}

/// Potong teks ke lebar printer dan pecah jadi beberapa baris.
///
/// Dipisah ke fungsi tingkat atas supaya penyusun ESC/POS memakai algoritma
/// pembungkus yang sama persis dengan jalur teks — kalau keduanya berbeda,
/// label akan terlihat berbeda tergantung printer yang dipakai.
List<String> wrapLabelText(String text, int maxChars) {
  if (text.length <= maxChars) {
    return [text];
  }
  var words = text.split(' ');
  var lines = <String>[];
  var current = '';
  for (var word in words) {
    var candidate = current.isEmpty ? word : '$current $word';
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      if (current.isNotEmpty) {
        lines.add(current);
      }
      // Kata tunggal yang lebih panjang dari label dipotong paksa, bukan
      // membuat baris yang melebihi lebar dan merusak layout.
      current = word.length > maxChars ? word.substring(0, maxChars) : word;
    }
  }
  if (current.isNotEmpty) {
    lines.add(current);
  }
  return lines;
}

String trimLabelNumber(double value) {
  if (value == value.roundToDouble()) {
    return value.toStringAsFixed(0);
  }
  return value.toStringAsFixed(2);
}

/// Format tanggal expired untuk dicetak pada label.
///
/// Menerima string dalam berbagai format (YYYY-MM-DD, YYYY-MM-DDTHH:mm:ss,
/// YYYY-MM-DDTHH:mm:ss.sssZ, dll.) dan mengembalikan `dd/MM/yyyy`.
/// Mengembalikan `-` jika nilai null, kosong, atau tidak dapat di-parse.
String formatExpiredDate(String? value) {
  if (value == null || value.trim().isEmpty) {
    return '-';
  }

  var trimmed = value.trim();
  var compactDate = RegExp(r'^(\d{4})(\d{2})(\d{2})$').firstMatch(trimmed);
  var isoDate = RegExp(
    r'^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])',
  ).firstMatch(trimmed);
  var dateMatch = compactDate ?? isoDate;
  if (dateMatch != null) {
    var year = int.parse(dateMatch.group(1)!);
    var month = int.parse(dateMatch.group(2)!);
    var day = int.parse(dateMatch.group(3)!);
    var date = DateTime.utc(year, month, day);
    if (date.year != year || date.month != month || date.day != day) {
      return '-';
    }
    return '${day.toString().padLeft(2, '0')}/'
        '${month.toString().padLeft(2, '0')}/$year';
  }

  var parsed = DateTime.tryParse(trimmed);
  if (parsed == null) {
    return '-';
  }
  return '${parsed.day.toString().padLeft(2, '0')}/${parsed.month.toString().padLeft(2, '0')}/${parsed.year}';
}
