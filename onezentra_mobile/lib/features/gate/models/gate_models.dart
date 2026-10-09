/// Models for the Check In Point (gate) menu.
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

DateTime? _readDate(dynamic value) {
  if (value is String && value.isNotEmpty) {
    return DateTime.tryParse(value);
  }
  return null;
}

Map<String, dynamic>? _readMap(dynamic value) =>
    value is Map ? Map<String, dynamic>.from(value) : null;

/// Status label and gate action rules for a rencana kirim document.
///
/// Mirrors the web app's `statusLabels`, `STATUS_GUIDE` and the action
/// buttons on `gate/page.tsx`.
class GateStatus {
  GateStatus._();

  static const Map<String, String> _labels = {
    'DRAFT': 'Draft',
    'SCHEDULED': 'Dijadwalkan',
    'CHECKED_IN': 'Check In',
    'VERIFIED': 'Terverifikasi',
    'IN_PROGRESS': 'Diproses',
    'COMPLETED': 'Selesai',
    'CANCELLED': 'Dibatalkan',
  };

  static const Map<String, String> _guides = {
    'DRAFT':
        'Dokumen masih Draft. Jadwalkan terlebih dahulu di menu Replenishment.',
    'VERIFIED':
        'Dokumen sudah diverifikasi dan menunggu proses bongkar. Tidak ada aksi gate saat ini.',
    'IN_PROGRESS': 'Bongkar sedang berjalan. Tidak ada aksi gate saat ini.',
    'COMPLETED': 'Dokumen selesai. Tidak ada aksi gate tersisa.',
    'CANCELLED': 'Dokumen dibatalkan dan tidak dapat diproses di gate.',
  };

  static String label(String status) => _labels[status] ?? status;

  /// The gate action available for [status], or [GateStatusAction.none] when
  /// the document is not at a gate checkpoint.
  static GateStatusAction actionFor(String status) => switch (status) {
    'SCHEDULED' => GateStatusAction.gateIn,
    'CHECKED_IN' => GateStatusAction.verify,
    _ => GateStatusAction.none,
  };

  /// Explanation shown instead of an action button when the status has none.
  static String guide(String status) =>
      _guides[status] ?? 'Tidak ada aksi gate untuk status ini.';
}

/// Action a document status allows at the gate (receiving-only: Gate IN).
enum GateStatusAction { gateIn, verify, none }

/// A rencana kirim as returned by the gate lookup (`search/by-dokumen`).
class RencanaKirim {
  const RencanaKirim({
    this.id,
    this.poTransporter,
    this.nopol,
    this.driverName,
    this.status = 'DRAFT',
    this.kodeDepo,
    this.namaDepo,
    this.itemCount,
  });

  factory RencanaKirim.fromJson(Map<String, dynamic> json) => RencanaKirim(
    id: _readInt(json['id']),
    poTransporter: _readString(json['po_transporter']),
    nopol: _readString(json['nopol']),
    driverName: _readString(json['driver_name']),
    status: _readString(json['status']) ?? 'DRAFT',
    kodeDepo: _readString(json['kode_depo']),
    namaDepo: _readString(json['nama_depo']),
    itemCount: json['items'] is List
        ? (json['items'] as List).length
        : _readInt(json['item_count']),
  );
  final int? id;
  final String? poTransporter;
  final String? nopol;
  final String? driverName;
  final String status;
  final String? kodeDepo;
  final String? namaDepo;
  final int? itemCount;
}

/// One gate scan record (INBOUND) of a rencana kirim.
class GateTransaction {
  const GateTransaction({
    required this.id,
    required this.rencanaKirimId,
    required this.gateType,
    this.nopol,
    this.driverName,
    this.poTransporter,
    this.containerNumber,
    this.notes,
    this.status = '',
    this.scanTime,
    this.rencanaKirim,
  });

  factory GateTransaction.fromJson(Map<String, dynamic> json) {
    var rencanaKirim = _readMap(json['rencana_kirim']);
    return GateTransaction(
      id: _readInt(json['id']) ?? 0,
      rencanaKirimId: _readInt(json['rencana_kirim_id']) ?? 0,
      gateType: _readString(json['gate_type']) ?? 'INBOUND',
      nopol: _readString(json['nopol']),
      driverName: _readString(json['driver_name']),
      poTransporter: _readString(json['po_transporter']),
      containerNumber: _readString(json['container_number']),
      notes: _readString(json['notes']),
      status: _readString(json['status']) ?? '',
      scanTime: _readDate(json['scan_time']),
      rencanaKirim: rencanaKirim == null
          ? null
          : RencanaKirim.fromJson(rencanaKirim),
    );
  }
  final int id;
  final int rencanaKirimId;
  final String gateType;
  final String? nopol;
  final String? driverName;
  final String? poTransporter;
  final String? containerNumber;
  final String? notes;
  final String status;
  final DateTime? scanTime;
  final RencanaKirim? rencanaKirim;

  /// The document status shown in the history pill: the transaction's own
  /// status is always `COMPLETED`, so the rencana kirim status wins.
  String get documentStatus => rencanaKirim?.status ?? status;
}

/// One page of the gate history (Laravel paginator payload).
class GateTransactionPage {
  const GateTransactionPage({
    required this.items,
    required this.currentPage,
    required this.lastPage,
    required this.total,
  });

  factory GateTransactionPage.fromJson(Map<String, dynamic> json) {
    var rawItems = json['data'];
    var items = rawItems is List
        ? rawItems
              .whereType<Map>()
              .map(
                (item) =>
                    GateTransaction.fromJson(Map<String, dynamic>.from(item)),
              )
              .toList()
        : <GateTransaction>[];
    return GateTransactionPage(
      items: items,
      currentPage: _readInt(json['current_page']) ?? 1,
      lastPage: _readInt(json['last_page']) ?? 1,
      total: _readInt(json['total']) ?? items.length,
    );
  }
  final List<GateTransaction> items;
  final int currentPage;
  final int lastPage;
  final int total;
}

/// Counters shown in the dark header of the Check In Point screen.
class GateStats {
  const GateStats({
    this.total = 0,
    this.hariIni = 0,
    this.terjadwal = 0,
    this.selesai = 0,
  });

  factory GateStats.fromJson(Map<String, dynamic> json) => GateStats(
    total: _readInt(json['total']) ?? 0,
    hariIni: _readInt(json['hari_ini']) ?? 0,
    terjadwal: _readInt(json['terjadwal']) ?? 0,
    selesai: _readInt(json['selesai']) ?? 0,
  );
  final int total;
  final int hariIni;
  final int terjadwal;
  final int selesai;
}

/// Success / failure banner shown after a lookup or a gate action.
class GateActionMessage {
  const GateActionMessage({required this.success, required this.message});

  const GateActionMessage.success(this.message) : success = true;

  const GateActionMessage.failure(this.message) : success = false;
  final bool success;
  final String message;
}
