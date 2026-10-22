/// Models for the Validasi SJ (document validation) menu.
library;

String? _readString(dynamic value) {
  if (value == null) {
    return null;
  }
  var text = value.toString();
  return text.isEmpty ? null : text;
}

int? _readInt(dynamic value) {
  if (value is int) {
    return value;
  }
  if (value is num) {
    return value.toInt();
  }
  return int.tryParse(value?.toString() ?? '');
}

double? _readDouble(dynamic value) {
  if (value is num) {
    return value.toDouble();
  }
  return double.tryParse(value?.toString() ?? '');
}

DateTime? _readDate(dynamic value) {
  if (value is String && value.isNotEmpty) {
    return DateTime.tryParse(value);
  }
  return null;
}

Map<String, dynamic>? _readMap(dynamic value) =>
    value is Map ? Map<String, dynamic>.from(value) : null;

/// Status label and progress rules for an SJ validation session.
///
/// Mirrors the web app's `validasi-sj/page.tsx`: a session is created
/// `IN_PROGRESS` straight away ("menunggu" does not exist) and ends as
/// `COMPLETED` or `CANCELLED`.
class ValidationStatus {
  ValidationStatus._();

  static const Map<String, String> _labels = {
    'IN_PROGRESS': 'Berjalan',
    'COMPLETED': 'Selesai',
    'CANCELLED': 'Dibatalkan',
  };

  static String label(String status) => _labels[status] ?? status;
}

/// Status of a single validation line.
class ValidationItemStatus {
  ValidationItemStatus._();

  static const Map<String, String> _labels = {
    'PENDING': 'Belum',
    'VALIDATED': 'Sesuai',
    'MISMATCH': 'Selisih',
  };

  static String label(String status) => _labels[status] ?? status;
}

/// Physical condition vocabulary (canonical `FISIK_*` set).
///
/// The server rejects a problem condition without a photo; the mobile app
/// has no photo picker, so picking one of these surfaces the server message
/// telling the operator to continue on the web app.
class ValidationCondition {
  ValidationCondition._();

  static const Map<String, String> _labels = {
    'FISIK_BAGUS': 'Fisik bagus',
    'FISIK_RUSAK': 'Fisik rusak',
    'QTY_KURANG': 'Qty kurang',
    'ISI_KEMASAN_KURANG': 'Isi kemasan kurang',
    'EXPIRED_TIDAK_STANDAR': 'Expired tidak standar',
    'LAINNYA': 'Lainnya',
  };

  static const List<String> values = [
    'FISIK_BAGUS',
    'FISIK_RUSAK',
    'QTY_KURANG',
    'ISI_KEMASAN_KURANG',
    'EXPIRED_TIDAK_STANDAR',
    'LAINNYA',
  ];

  /// Conditions the server only accepts together with a photo upload.
  static const List<String> requiresPhoto = [
    'FISIK_RUSAK',
    'QTY_KURANG',
    'ISI_KEMASAN_KURANG',
    'EXPIRED_TIDAK_STANDAR',
    'LAINNYA',
  ];

  static String label(String condition) => _labels[condition] ?? condition;
}

/// One rencana kirim line with its product reference.
class ValidationDocItem {
  const ValidationDocItem({
    this.id,
    this.kodeBarang,
    this.namaBarang,
    this.jumlah,
    this.satuan,
  });

  factory ValidationDocItem.fromJson(Map<String, dynamic> json) =>
      ValidationDocItem(
        id: _readInt(json['id']),
        kodeBarang: _readString(json['kode_barang']),
        namaBarang: _readString(json['nama_barang']),
        jumlah: _readDouble(json['jumlah']),
        satuan: _readString(json['satuan']),
      );
  final int? id;
  final String? kodeBarang;
  final String? namaBarang;
  final double? jumlah;
  final String? satuan;
}

/// The rencana kirim document behind a validation session.
class ValidationDocument {
  const ValidationDocument({
    this.id,
    this.poTransporter,
    this.nopol,
    this.driverName,
    this.status = '',
    this.items = const [],
  });

  factory ValidationDocument.fromJson(Map<String, dynamic> json) {
    var rawItems = json['items'];
    return ValidationDocument(
      id: _readInt(json['id']),
      poTransporter: _readString(json['po_transporter']),
      nopol: _readString(json['nopol']),
      driverName: _readString(json['driver_name']),
      status: _readString(json['status']) ?? '',
      items: rawItems is List
          ? rawItems
                .whereType<Map>()
                .map(
                  (item) => ValidationDocItem.fromJson(
                    Map<String, dynamic>.from(item),
                  ),
                )
                .toList()
          : const [],
    );
  }
  final int? id;
  final String? poTransporter;
  final String? nopol;
  final String? driverName;
  final String status;
  final List<ValidationDocItem> items;
}

/// The latest standarisasi tumpukan record attached to a validation line
/// by the server (lookup by `npn_id`), or null when the product has none.
///
/// Mirrors the web rule: a line can only be validated once its
/// standarisasi is `approved` by BLC. Anything else routes the operator
/// to the standarisasi input first.
class ItemStandarisasi {
  const ItemStandarisasi({this.tier, this.tinggiTumpukan, this.status});

  factory ItemStandarisasi.fromJson(Map<String, dynamic> json) =>
      ItemStandarisasi(
        tier: _readInt(json['tier']),
        tinggiTumpukan: _readInt(json['tinggi_tumpukan']),
        status: _readString(json['status']),
      );
  final int? tier;
  final int? tinggiTumpukan;
  final String? status;

  bool get isApproved => status == 'approved';
}

/// One validation line: expected vs actual quantity, condition, expiry.
class ValidationBatch {
  const ValidationBatch({
    required this.id,
    this.batchNumber,
    this.barcodeLabel,
    this.batchNumberLabel,
    this.printedAt,
    this.createdAt,
    this.status,
  });

  factory ValidationBatch.fromJson(
    Map<String, dynamic> json,
  ) => ValidationBatch(
    id: _readInt(json['id']) ?? 0,
    batchNumber: _readString(json['batch_number']),
    // `barcode_label` adalah identitas fisik label; nilainya harus sama
    // persis dengan yang dicetak ke kertas, jadi barcodenya bisa dibaca mesin.
    barcodeLabel: _readString(json['barcode_label']),
    batchNumberLabel: _readString(json['batch_number_label']),
    printedAt: _readDate(json['printed_at']),
    createdAt: _readString(json['created_at']),
    status: _readString(json['status']),
  );

  final int id;
  final String? batchNumber;
  final String? barcodeLabel;
  final String? batchNumberLabel;
  final DateTime? printedAt;
  final String? createdAt;
  final String? status;

  /// Label sudah dilaporkan tercetak ke server (sumber kebenaran lintas device).
  bool get isPrinted => printedAt != null;

  /// Batch yang dibatalkan tidak boleh dicetak ulang.
  bool get isCancelled => status == 'CANCELLED';
}

class SjValidationItem {
  const SjValidationItem({
    required this.id,
    required this.validationId,
    this.npnId,
    this.kodeBarang,
    this.namaBarang,
    this.expectedQty,
    this.actualQty,
    this.satuan,
    this.barcode,
    this.condition = 'FISIK_BAGUS',
    this.expiredDate,
    this.notes,
    this.hasPhoto = false,
    this.status = 'PENDING',
    this.standarisasi,
    this.batch,
  });

  factory SjValidationItem.fromJson(Map<String, dynamic> json) {
    var standarisasi = _readMap(json['standarisasi']);
    var batch = _readMap(json['batch']);
    return SjValidationItem(
      id: _readInt(json['id']) ?? 0,
      validationId: _readInt(json['sj_validation_id']) ?? 0,
      npnId: _readInt(json['npn_id']),
      kodeBarang: _readString(json['kode_barang']),
      namaBarang: _readString(json['nama_barang']),
      expectedQty: _readDouble(json['expected_qty']),
      actualQty: _readDouble(json['actual_qty']),
      satuan: _readString(json['satuan']),
      barcode: _readString(json['barcode']),
      condition: _readString(json['condition']) ?? 'FISIK_BAGUS',
      expiredDate: _readString(json['expired_date']),
      notes: _readString(json['notes']),
      hasPhoto: _readString(json['photo']) != null,
      status: _readString(json['status']) ?? 'PENDING',
      standarisasi: standarisasi == null
          ? null
          : ItemStandarisasi.fromJson(standarisasi),
      batch: batch == null ? null : ValidationBatch.fromJson(batch),
    );
  }
  final int id;
  final int validationId;
  final int? npnId;
  final String? kodeBarang;
  final String? namaBarang;
  final double? expectedQty;
  final double? actualQty;
  final String? satuan;
  final String? barcode;
  final String condition;
  final String? expiredDate;
  final String? notes;
  final bool hasPhoto;
  final String status;
  final ItemStandarisasi? standarisasi;

  /// Batch label yang dibuat server saat item ini divalidasi. Null berarti item
  /// belum divalidasi, jadi belum ada label yang bisa dicetak.
  final ValidationBatch? batch;

  bool get isPending => status == 'PENDING';

  bool get hasExpiredDate =>
      expiredDate != null && expiredDate!.trim().isNotEmpty;

  /// Sama dengan aturan kelengkapan web: qty, tanggal expired, dan status
  /// validasi harus terisi sebelum sesi boleh ditutup.
  bool get isComplete => !isPending && actualQty != null && hasExpiredDate;

  /// Label hanya bisa dicetak kalau server sudah Issuing batch untuk item ini.
  bool get hasLabel => batch?.barcodeLabel != null;

  /// Label batch yang sudah dibatalkan tidak berlaku lagi.
  bool get canPrintLabel => hasLabel && batch?.isCancelled != true;

  /// Web parity: only an approved standarisasi unlocks validation.
  bool get canValidate => standarisasi?.isApproved ?? false;

  /// Difference actually entered vs expected, mirroring the server-side
  /// `selisih_qty` the selisih email reports on.
  double? get selisih {
    var expected = expectedQty;
    var actual = actualQty;
    if (expected == null || actual == null) {
      return null;
    }
    return actual - expected;
  }

  /// Human reason for a mismatch, using the exact server mapping from
  /// `SjValidationController::ensureReceiving` so the app and the email
  /// always tell the same story.
  String? get selisihReason {
    var diff = selisih;
    if (diff == null || diff == 0) {
      return null;
    }
    return switch (condition) {
      'FISIK_RUSAK' => 'Barang rusak',
      'QTY_KURANG' => 'Qty kurang dari rencana',
      'ISI_KEMASAN_KURANG' => 'Isi kemasan kurang',
      'EXPIRED_TIDAK_STANDAR' => 'Expired tidak standar',
      'LAINNYA' => 'Lainnya',
      _ => 'Selisih qty',
    };
  }
}

/// An SJ validation session with its document and lines.
class SjValidation {
  const SjValidation({
    required this.id,
    this.rencanaKirimId,
    this.scanCode,
    this.status = 'IN_PROGRESS',
    this.startedAt,
    this.completedAt,
    this.durationSeconds,
    this.document,
    this.items = const [],
    this.validatorName,
    this.itemsCount,
    this.validatedItemsCount,
    this.canCorrectCompleted = false,
  });

  factory SjValidation.fromJson(Map<String, dynamic> json) {
    var document = _readMap(json['rencana_kirim']);
    var validator = _readMap(json['validator']);
    var rawItems = json['items'];
    var items = rawItems is List
        ? rawItems
              .whereType<Map>()
              .map(
                (item) =>
                    SjValidationItem.fromJson(Map<String, dynamic>.from(item)),
              )
              .toList()
        : <SjValidationItem>[];
    return SjValidation(
      id: _readInt(json['id']) ?? 0,
      rencanaKirimId: _readInt(json['rencana_kirim_id']),
      scanCode: _readString(json['scan_code']),
      status: _readString(json['status']) ?? 'IN_PROGRESS',
      startedAt: _readDate(json['started_at']),
      completedAt: _readDate(json['completed_at']),
      durationSeconds: _readInt(json['duration_seconds']),
      document: document == null ? null : ValidationDocument.fromJson(document),
      items: items,
      validatorName: _readString(validator?['full_name']),
      // `index` hanya mengirim counter (tanpa semua item) agar riwayat tetap
      // ringan. Detail sesi tetap memakai hitungan dari daftar item.
      itemsCount: _readInt(json['items_count']) ?? items.length,
      validatedItemsCount:
          _readInt(json['validated_items_count']) ??
          items.where((item) => !item.isPending).length,
      canCorrectCompleted: json['can_correct_completed'] == true,
    );
  }
  final int id;
  final int? rencanaKirimId;
  final String? scanCode;
  final String status;
  final DateTime? startedAt;
  final DateTime? completedAt;
  final int? durationSeconds;
  final ValidationDocument? document;
  final List<SjValidationItem> items;
  final String? validatorName;
  final int? itemsCount;
  final int? validatedItemsCount;

  /// Dihitung server; hanya supervisor dengan `sj_validation.edit_completed`
  /// dan Receiving yang masih terbuka yang mendapat izin koreksi.
  final bool canCorrectCompleted;

  bool get isRunning => status == 'IN_PROGRESS';

  bool get isCompleted => status == 'COMPLETED';

  bool get isCancelled => status == 'CANCELLED';

  int get totalItemCount => itemsCount ?? items.length;

  int get validatedCount =>
      validatedItemsCount ?? items.where((item) => !item.isPending).length;
}

/// One row of the validation history (Laravel paginator may embed the full
/// session or a summary — both parse through [SjValidation.fromJson]).
class ValidationHistoryPage {
  const ValidationHistoryPage({
    required this.items,
    required this.currentPage,
    required this.lastPage,
    required this.total,
  });

  factory ValidationHistoryPage.fromJson(Map<String, dynamic> json) {
    var rawItems = json['data'];
    var items = rawItems is List
        ? rawItems
              .whereType<Map>()
              .map(
                (item) =>
                    SjValidation.fromJson(Map<String, dynamic>.from(item)),
              )
              .toList()
        : <SjValidation>[];
    return ValidationHistoryPage(
      items: items,
      currentPage: _readInt(json['current_page']) ?? 1,
      lastPage: _readInt(json['last_page']) ?? 1,
      total: _readInt(json['total']) ?? items.length,
    );
  }
  final List<SjValidation> items;
  final int currentPage;
  final int lastPage;
  final int total;
}

/// Counters shown in the dark header of the Validasi SJ screen.
class ValidationStats {
  const ValidationStats({
    this.total = 0,
    this.hariIni = 0,
    this.berjalan = 0,
    this.selesai = 0,
    this.cancelled = 0,
  });

  factory ValidationStats.fromJson(Map<String, dynamic> json) =>
      ValidationStats(
        total: _readInt(json['total']) ?? 0,
        hariIni: _readInt(json['today']) ?? 0,
        berjalan: _readInt(json['in_progress']) ?? 0,
        selesai: _readInt(json['completed']) ?? 0,
        cancelled: _readInt(json['cancelled']) ?? 0,
      );
  final int total;
  final int hariIni;
  final int berjalan;
  final int selesai;
  final int cancelled;
}

/// Success / failure banner shown after a lookup or a validation action.
class ValidationActionMessage {
  const ValidationActionMessage({required this.success, required this.message});

  const ValidationActionMessage.success(this.message) : success = true;

  const ValidationActionMessage.failure(this.message) : success = false;
  final bool success;
  final String message;
}
