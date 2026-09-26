/// Model untuk alur Validasi Dokumen — mirror `SjValidationController`
/// (`index`, `stats`, `show`, `scanItem`, `start-by-code`) di backend dan
/// `onezentra-web/src/app/validasi-sj/page.tsx` untuk label/condition.
///
/// Alur mobile sama dengan web: **daftar dokumen** (bisa dicari & difilter) untuk
/// melanjutkan pekerjaan yang tertunda, atau scan/ketik PO untuk dokumen baru.
library;

import 'package:onezentra_mobile/features/standarisasi/models/standarisasi_models.dart';

/// Satu item validasi (satu baris SJ yang harus dicocokkan dengan fisik).
class SjValidationItem {
  const SjValidationItem({
    required this.id,
    required this.kodeBarang,
    required this.namaBarang,
    required this.expectedQty,
    required this.satuan,
    required this.condition,
    required this.status,
    this.npnId,
    this.barcode = '',
    this.actualQty,
    this.expiredDate,
    this.notes,
    this.photo,
    this.umur,
    this.standarisasi,
  });

  factory SjValidationItem.fromJson(Map<String, dynamic> json) {
    final status = '${json['status'] ?? statusPending}';
    return SjValidationItem(
      id: _asInt(json['id']),
      npnId: _asIntOrNull(json['npn_id']),
      kodeBarang: '${json['kode_barang'] ?? '-'}',
      namaBarang: '${json['nama_barang'] ?? '-'}',
      expectedQty: _asDouble(json['expected_qty']),
      // Kolom `actual_qty` di DB ber-default 0 dan tetap terkirim backend
      // untuk item yang belum diperiksa, jadi "0" tidak boleh dianggap
      // "sudah dihitung 0". Status PENDING = operator belum mengisi apa pun.
      actualQty: status == statusPending
          ? null
          : _asDoubleOrNull(json['actual_qty']),
      expiredDate: _asString(json['expired_date']),
      satuan: '${json['satuan'] ?? ''}',
      condition: '${json['condition'] ?? conditionGood}',
      notes: _asString(json['notes']),
      barcode: '${json['barcode'] ?? ''}',
      status: status,
      photo: _asString(json['photo']),
      // Diisi backend dari `standar_umur_produk` (bulan) — null bila produk
      // belum punya master umur, jadi warning umur hanya ditampilkan kalau
      // master-nya ada.
      umur: _asIntOrNull(json['umur']),
      standarisasi: json['standarisasi'] is Map
          ? StandarisasiTumpukan.fromJson(
              Map<String, dynamic>.from(json['standarisasi'] as Map),
            )
          : null,
    );
  }

  final int id;
  final int? npnId;
  final String kodeBarang;
  final String namaBarang;
  final double expectedQty;
  final double? actualQty;
  final String? expiredDate;
  final String satuan;
  final String condition;
  final String? notes;
  final String barcode;
  final String status;
  final String? photo;
  final int? umur;

  /// Standarisasi tumpukan **terverifikasi** untuk produk ini.
  ///
  /// Backend menyisipkannya di setiap item (`attachStandarisasiTumpukan`); null
  /// berarti produk belum pernah punya standarisasi sama sekali, sedangkan
  /// status selain `approved` berarti angkanya sudah ada tapi belum disetujui
  /// BLC.
  final StandarisasiTumpukan? standarisasi;

  bool get isPending => status == statusPending;
  bool get isMismatch => status == statusMismatch;

  /// Item ini belum boleh diperiksa karena standarisasi tumpukan produknya belum
  /// disetujui.
  ///
  /// Aturan yang sama dengan `openItem` di
  /// `onezentra-web/src/app/validasi-sj/page.tsx`: tanpa standarisasi **atau**
  /// statusnya bukan `approved`, operator diarahkan ke halaman Standarisasi.
  /// Backend sendiri tidak menolak `scan`, jadi tanpa gerbang ini mobile akan
  /// Diam-diam menyimpan hasil pemeriksaan di luar alur persetujuan.
  bool get needsStackApproval =>
      standarisasi == null || !standarisasi!.isApproved;

  /// Label singkat untuk badge di baris item: produk belum punya
  /// standarisasi vs. menunggu persetujuan BLC.
  String? get stackWarningLabel {
    final stack = standarisasi;
    if (stack == null) {
      return 'Belum ada standarisasi';
    }
    if (stack.isApproved) {
      return null;
    }
    return stack.status == standarisasiStatusRejected
        ? 'Standarisasi ditolak'
        : 'Standarisasi menunggu approval';
  }

  /// Label ringkas status item untuk chip di daftar.
  String get summaryLabel => isPending
      ? 'Belum diperiksa'
      : '${itemStatusLabel(status)} · ${conditionLabel(condition)}';

  /// Sisa umur dalam bulan, dihitung dari tanggal expired. Null bila tanggal
  /// expired belum diisi.
  int? remainingShelfLifeMonths() => shelfLifeMonths(expiredDate);

  /// Perbandingan umur produk dengan master umur standar (lihat [checkShelfLife]).
  ShelfLifeCheck shelfLife() =>
      checkShelfLife(expiredDate, standardMonths: umur);
}

/// Header dokumen yang sedang divalidasi.
class SjValidation {
  const SjValidation({
    required this.id,
    required this.status,
    required this.poTransporter,
    required this.nopol,
    required this.driverName,
    required this.destinationName,
    required this.items,
    this.scanCode = '',
    this.validatorName,
    this.startedAt,
    this.completedAt,
  });

  factory SjValidation.fromJson(Map<String, dynamic> json) {
    final rk = json['rencana_kirim'] is Map
        ? Map<String, dynamic>.from(json['rencana_kirim'] as Map)
        : const <String, dynamic>{};
    final validator = json['validator'] is Map
        ? Map<String, dynamic>.from(json['validator'] as Map)
        : const <String, dynamic>{};

    return SjValidation(
      id: _asInt(json['id']),
      status: '${json['status'] ?? statusInProgress}',
      scanCode: '${json['scan_code'] ?? rk['po_transporter'] ?? ''}',
      poTransporter: '${rk['po_transporter'] ?? json['scan_code'] ?? '-'}',
      nopol: '${rk['nopol'] ?? '-'}',
      driverName: '${rk['driver_name'] ?? '-'}',
      destinationName: '${rk['destination_name'] ?? '-'}',
      validatorName: _asString(validator['full_name']),
      startedAt: _asString(json['started_at']),
      completedAt: _asString(json['completed_at']),
      items: ((json['items'] as List?) ?? const [])
          .whereType<Map>()
          .map((e) => SjValidationItem.fromJson(Map<String, dynamic>.from(e)))
          .toList(),
    );
  }

  final int id;
  final String status;
  final String scanCode;
  final String poTransporter;
  final String nopol;
  final String driverName;
  final String destinationName;
  final String? validatorName;
  final String? startedAt;
  final String? completedAt;
  final List<SjValidationItem> items;

  bool get isInProgress => status == statusInProgress;

  int get totalItems => items.length;
  int get validatedItems => items.where((i) => !i.isPending).length;
  int get pendingItems => items.where((i) => i.isPending).length;
  int get mismatchItems => items.where((i) => i.isMismatch).length;
  double get progress => totalItems == 0 ? 0 : validatedItems / totalItems;

  /// Salinan dengan sebagian field diganti — dipakai saat backend mengembalikan
  /// ulang dokumen (mis. setelah item dihapus) tanpa membaca ulang JSON.
  SjValidation copyWith({String? status, List<SjValidationItem>? items}) {
    return SjValidation(
      id: id,
      status: status ?? this.status,
      scanCode: scanCode,
      poTransporter: poTransporter,
      nopol: nopol,
      driverName: driverName,
      destinationName: destinationName,
      validatorName: validatorName,
      startedAt: startedAt,
      completedAt: completedAt,
      items: items ?? this.items,
    );
  }
}

/// Satu baris daftar validasi (`GET /sj-validations`).
///
/// Sengaja tidak membawa `items`: backend tidak ikut me-load item pada index,
/// dan daftar sepanjang 20 baris jadi tetap ringan di jaringan. Progres item
/// diambil saat dokumen dibuka lewat `show`.
class SjValidationSummary {
  const SjValidationSummary({
    required this.id,
    required this.status,
    required this.poTransporter,
    required this.driverName,
    required this.destinationName,
    required this.nopol,
    this.validatorName,
    this.startedAt,
    this.completedAt,
  });

  factory SjValidationSummary.fromJson(Map<String, dynamic> json) {
    final rk = json['rencana_kirim'] is Map
        ? Map<String, dynamic>.from(json['rencana_kirim'] as Map)
        : const <String, dynamic>{};
    final validator = json['validator'] is Map
        ? Map<String, dynamic>.from(json['validator'] as Map)
        : const <String, dynamic>{};
    final scanCode = '${json['scan_code'] ?? ''}';

    return SjValidationSummary(
      id: _asInt(json['id']),
      status: '${json['status'] ?? statusInProgress}',
      // `rencana_kirim` bisa null bila dokumen induknya dihapus; scan_code
      // masih menyimpan PO-nya (fallback yang sama dengan `SjValidation`).
      poTransporter:
          '${rk['po_transporter'] ?? (scanCode.isEmpty ? '-' : scanCode)}',
      driverName: '${rk['driver_name'] ?? '-'}',
      destinationName: '${rk['destination_name'] ?? '-'}',
      nopol: '${rk['nopol'] ?? '-'}',
      validatorName: _asString(validator['full_name']),
      startedAt: _asString(json['started_at']),
      completedAt: _asString(json['completed_at']),
    );
  }

  final int id;
  final String status;
  final String poTransporter;
  final String driverName;
  final String destinationName;
  final String nopol;
  final String? validatorName;
  final String? startedAt;
  final String? completedAt;

  bool get isInProgress => status == statusInProgress;
}

/// Satu halaman hasil `GET /sj-validations` (Laravel paginator).
class ValidationListPage {
  const ValidationListPage({
    required this.entries,
    required this.currentPage,
    required this.lastPage,
    required this.total,
  });

  final List<SjValidationSummary> entries;
  final int currentPage;
  final int lastPage;
  final int total;
}

/// Statistik validasi (`GET /sj-validations/stats`) untuk strip ringkasan —
/// angka global per depo, bukan hitungan halaman aktif.
class ValidationStats {
  const ValidationStats({
    required this.today,
    required this.inProgress,
    required this.completed,
    required this.cancelled,
    required this.total,
  });

  final int today;
  final int inProgress;
  final int completed;
  final int cancelled;
  final int total;

  factory ValidationStats.fromJson(Map<String, dynamic> json) {
    int asInt(Object? value) => (value as num?)?.toInt() ?? 0;
    return ValidationStats(
      today: asInt(json['today']),
      inProgress: asInt(json['in_progress']),
      completed: asInt(json['completed']),
      cancelled: asInt(json['cancelled']),
      total: asInt(json['total']),
    );
  }

  static const empty = ValidationStats(
    today: 0,
    inProgress: 0,
    completed: 0,
    cancelled: 0,
    total: 0,
  );
}

/// Tanggal validasi untuk daftar — `dd/MM/yyyy`, sama seperti `fmtDate` di
/// `validasi-sj/page.tsx`. String kosong / "-" untuk tanggal yang belum ada.
String? formatValidationDate(String? value) {
  if (value == null || value.isEmpty || value == 'null') {
    return null;
  }
  final parsed = DateTime.tryParse(value);
  if (parsed == null) {
    return value;
  }
  final local = parsed.toLocal();
  String two(int n) => n.toString().padLeft(2, '0');
  return '${two(local.day)}/${two(local.month)}/${local.year}';
}

// --- Konstanta status & label (semua string ini ada di backend) ---

const conditionGood = 'FISIK_BAGUS';
const conditionDamaged = 'FISIK_RUSAK';
const conditionQtyShort = 'QTY_KURANG';
const conditionContentShort = 'ISI_KEMASAN_KURANG';
const conditionExpiredNonStandard = 'EXPIRED_TIDAK_STANDAR';
const conditionOther = 'LAINNYA';

const statusPending = 'PENDING';
const statusValidated = 'VALIDATED';
const statusMismatch = 'MISMATCH';
const statusInProgress = 'IN_PROGRESS';
const statusCompleted = 'COMPLETED';
const statusCancelled = 'CANCELLED';

/// Backend mewajibkan foto untuk kondisi bermasalah
/// (`SjValidationController::scanItem`).
const conditionsRequiringPhoto = <String>[
  conditionDamaged,
  conditionQtyShort,
  conditionContentShort,
  conditionExpiredNonStandard,
  conditionOther,
];

bool conditionNeedsPhoto(String condition) =>
    conditionsRequiringPhoto.contains(condition);

const conditionLabels = <String, String>{
  conditionGood: 'Fisik Bagus',
  conditionDamaged: 'Fisik Rusak',
  conditionQtyShort: 'Qty Kurang',
  conditionContentShort: 'Isi Kemasan Kurang',
  conditionExpiredNonStandard: 'Expired Tidak Standar',
  conditionOther: 'Lainnya',
};

String conditionLabel(String condition) =>
    conditionLabels[condition] ?? condition;

const itemStatusLabels = <String, String>{
  statusPending: 'Belum',
  statusValidated: 'Sesuai',
  statusMismatch: 'Selisih',
};

String itemStatusLabel(String status) => itemStatusLabels[status] ?? status;

const validationStatusLabels = <String, String>{
  statusInProgress: 'Berjalan',
  statusCompleted: 'Selesai',
  statusCancelled: 'Dibatalkan',
};

String validationStatusLabel(String status) =>
    validationStatusLabels[status] ?? status;

/// Sisa umur dalam bulan, dibulatkan ke bawah.
///
/// Menghitung selisih bulan penuh seperti versi web
/// (`calcUmurInMonths` di `validasi-sj/page.tsx`): expired 31 Jan dihitung 0
/// bulan pada 28 Feb, karena bulan berjalan belum selesai. Tanggal expired
/// yang sudah lewat tidak pernah menghasilkan angka negatif.
int? shelfLifeMonths(String? expiredDate) {
  final value = _dateOnly(expiredDate);
  if (value == null) {
    return null;
  }
  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day);
  var months = (value.year - today.year) * 12 + (value.month - today.month);
  if (value.day < today.day) {
    months -= 1;
  }
  return months < 0 ? 0 : months;
}

/// Tanggal tanpa jam, atau null bila string bukan tanggal yang bisa dibaca.
DateTime? _dateOnly(String? value) {
  if (value == null || value.isEmpty) {
    return null;
  }
  final parsed = DateTime.tryParse(value);
  if (parsed == null) {
    return null;
  }
  return DateTime(parsed.year, parsed.month, parsed.day);
}

/// Sisa umur dalam hari, dibulatkan ke atas — padanan `calcUmurInMonths(...).totalDays`
/// di web. Nilai negatif berarti tanggal expired sudah lewat; nol berarti
/// produk sudah kedaluwarsa hari ini.
int? shelfLifeDays(String? expiredDate) {
  final expired = _dateOnly(expiredDate);
  if (expired == null) {
    return null;
  }
  final now = DateTime.now();
  return expired.difference(DateTime(now.year, now.month, now.day)).inDays;
}

/// Selisih tanggal expired terhadap tanggal standar (hari ini + N bulan),
/// persis seperti `formatUmurSelisih` di web: tanda `-` berarti lebih cepat
/// dari standar, `+` berarti lebih lama, dan bagian yang nol tidak ikut
/// ditulis ("+1 tahun 2 bulan", bukan "+1 tahun 2 bulan 0 hari").
///
/// Tanggal standar memakai clamping tanggal: standar 1 bulan dari 31 Januari
/// jatuh 28/29 Februari, bukan 3 Maret — sama seperti perhitungan kalender
/// yang dipakai web dan disimpan backend.
String? formatUmurSelisihDetail(String? expiredDate, int standardMonths) {
  final expired = _dateOnly(expiredDate);
  if (expired == null) {
    return null;
  }
  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day);
  final monthIndex = today.month - 1 + standardMonths;
  final standardYear = today.year + monthIndex ~/ 12;
  final standardMonth = monthIndex % 12 + 1;
  final lastDay = DateTime(standardYear, standardMonth + 1, 0).day;
  final standard = DateTime(
    standardYear,
    standardMonth,
    today.day > lastDay ? lastDay : today.day,
  );

  final isBeforeStandard = expired.isBefore(standard);
  final start = isBeforeStandard ? expired : standard;
  final end = isBeforeStandard ? standard : expired;
  var years = end.year - start.year;
  var months = end.month - start.month;
  var days = end.day - start.day;
  if (days < 0) {
    months -= 1;
    days += DateTime(end.year, end.month, 0).day;
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  final parts = <String>[
    if (years > 0) '$years tahun',
    if (months > 0) '$months bulan',
    if (days > 0) '$days hari',
  ];
  return '${isBeforeStandard ? '-' : '+'}${parts.isEmpty ? '0 hari' : parts.join(' ')}';
}

/// Rasio sisa umur terhadap standar dalam persen, untuk bilah perbandingan
/// pada kartu "Standar umur produk" (web: `umurRatio`).
int shelfLifeRatioPercent({required int? months, required int standardMonths}) {
  if (standardMonths <= 0 || months == null) {
    return 0;
  }
  return (months / standardMonths * 100).round();
}

/// Ringkasan lengkap perhitungan umur untuk satu item — dipakai kartu standar
/// umur di sheet validasi dan popup "Standar Umur Produk".
///
/// `verdict` & `verdictTone` memakai label yang sama dengan web:
/// `DATA LENGKAP` / `KADALUARSA` / `PERLU PERHATIAN` / `AMAN`.
typedef ShelfLifeReport = ({
  int? months,
  int? days,
  int standardMonths,
  String? selisih,
  int ratioPercent,
  bool hasStandard,
  bool isExpired,
  bool isShort,
  String verdict,
});

/// Hitung ulang laporan umur dari tanggal expired. Null saat tanggal belum
/// diisi — pemanggil wajib menampilkan perintah, bukan angka nol.
ShelfLifeReport? shelfLifeReport(String? expiredDate, {int? standardMonths}) {
  final months = shelfLifeMonths(expiredDate);
  if (months == null) {
    return null;
  }
  final days = shelfLifeDays(expiredDate);
  final standard = standardMonths ?? 0;
  final selisih = formatUmurSelisihDetail(expiredDate, standard);
  final isExpired = days != null && days <= 0;
  final isShort = standard > 0 && months < standard;
  final verdict = standard <= 0
      ? 'DATA LENGKAP'
      : isExpired
      ? 'KADALUARSA'
      : isShort
      ? 'PERLU PERHATIAN'
      : 'AMAN';
  return (
    months: months,
    days: days,
    standardMonths: standard,
    selisih: selisih,
    ratioPercent: shelfLifeRatioPercent(
      months: months,
      standardMonths: standard,
    ),
    hasStandard: standard > 0,
    isExpired: isExpired,
    isShort: isShort,
    verdict: verdict,
  );
}

/// Kalimat kesimpulan untuk laporan umur — padanan blok `<p>` penutup pada
/// kartu standar umur (`validasi-sj/page.tsx`). `short` memakai kalimat ringkas
/// yang dipakai di dalam sheet, `popup` memakai kalimat lengkap untuk popup.
String shelfLifeVerdictText(ShelfLifeReport report, {required bool popup}) {
  if (!report.hasStandard) {
    return popup
        ? 'Standar umur produk tidak tersedia. Data standar umur perlu diisi '
              'di database standar umur produk.'
        : 'Standar umur produk tidak tersedia.';
  }
  if (report.isExpired) {
    return popup
        ? 'Produk sudah kadaluarsa dan perlu penanganan segera.'
        : 'Produk sudah kadaluarsa.';
  }
  if (report.isShort) {
    return 'Sisa simpan kurang dari standar (${report.selisih}).';
  }
  return 'Sisa simpan memenuhi standar (${report.selisih}).';
}

/// Hasil perbandingan umur produk terhadap master umur standar.
typedef ShelfLifeCheck = ({String label, bool isShort, bool isKnown});

/// Bandingkan sisa umur dengan standar, sama seperti `formatUmurSelisih` di web:
/// expire lebih cepat = tidak standar (perlu perhatian), expire lebih lambat =
/// sisa lebih.
///
/// `isKnown` false saat tanggal expired atau master umur belum ada — saat itu
/// UI tidak boleh menampilkan warning apa pun agar tidak membingungkan operator.
ShelfLifeCheck checkShelfLife(String? expiredDate, {int? standardMonths}) {
  final actual = shelfLifeMonths(expiredDate);
  if (actual == null || standardMonths == null || standardMonths <= 0) {
    return (label: '', isShort: false, isKnown: false);
  }
  if (actual < standardMonths) {
    return (
      label: 'Kurang ${standardMonths - actual} bulan dari standar',
      isShort: true,
      isKnown: true,
    );
  }
  if (actual > standardMonths) {
    return (
      label: 'Lebih ${actual - standardMonths} bulan dari standar',
      isShort: false,
      isKnown: true,
    );
  }
  return (label: 'Sesuai standar umur', isShort: false, isKnown: true);
}

/// Label versi verdict untuk teks ringkas; string kosong bila tidak diketahui.
String shelfLifeVerdict(String? expiredDate, {int? standardMonths}) =>
    checkShelfLife(expiredDate, standardMonths: standardMonths).label;

/// Format qty untuk tampilan & isian form: buang desimal yang tidak perlu
/// (`1000.0` → "1000", `12.5` → "12.5") supaya operator tidak salah baca nol
/// dari float yang dikirim backend.
String formatQty(double value) {
  if (value == value.roundToDouble()) {
    return value.toInt().toString();
  }
  return value
      .toStringAsFixed(2)
      .replaceFirst(RegExp(r'0+$'), '')
      .replaceFirst(RegExp(r'\.$'), '');
}

int? _asIntOrNull(Object? value) {
  if (value == null) {
    return null;
  }
  if (value is num) {
    return value.toInt();
  }
  return int.tryParse('$value');
}

double? _asDoubleOrNull(Object? value) {
  if (value == null) {
    return null;
  }
  if (value is num) {
    return value.toDouble();
  }
  return double.tryParse('$value');
}

int _asInt(Object? value) => _asIntOrNull(value) ?? 0;

double _asDouble(Object? value) => _asDoubleOrNull(value) ?? 0;

String? _asString(Object? value) {
  if (value == null) {
    return null;
  }
  final text = '$value';
  return text.isEmpty ? null : text;
}
