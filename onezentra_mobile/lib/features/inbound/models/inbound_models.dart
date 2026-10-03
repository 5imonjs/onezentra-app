/// Models for the Hasil Penerimaan (inbound history) menu.
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

/// Status label for a receiving record.
class ReceivingStatus {
  ReceivingStatus._();

  static const Map<String, String> _labels = {
    'PENDING': 'Menunggu',
    'IN_PROGRESS': 'Berjalan',
    'COMPLETED': 'Selesai',
    'CANCELLED': 'Dibatalkan',
  };

  static String label(String status) => _labels[status] ?? status;
}

/// One received line of a receiving record.
class ReceivedItem {
  const ReceivedItem({
    this.kodeBarang,
    this.namaBarang,
    this.expectedQty,
    this.actualQty,
    this.satuan,
    this.condition,
    this.selisihQty,
    this.selisihReason,
    this.expiredDate,
  });

  factory ReceivedItem.fromJson(Map<String, dynamic> json) => ReceivedItem(
    kodeBarang: _readString(json['kode_barang']),
    namaBarang: _readString(json['nama_barang']),
    expectedQty: _readDouble(json['expected_qty']),
    actualQty: _readDouble(json['actual_qty']),
    satuan: _readString(json['satuan']),
    condition: _readString(json['condition']),
    selisihQty: _readDouble(json['selisih_qty']),
    selisihReason: _readString(json['selisih_reason']),
    expiredDate: _readString(json['expired_date']),
  );
  final String? kodeBarang;
  final String? namaBarang;
  final double? expectedQty;
  final double? actualQty;
  final String? satuan;
  final String? condition;
  final double? selisihQty;
  final String? selisihReason;
  final String? expiredDate;
}

/// One inbound receiving record with its document and lines.
class Receiving {
  const Receiving({
    required this.id,
    this.rencanaKirimId,
    this.poTransporter,
    this.nopol,
    this.driverName,
    this.status = 'PENDING',
    this.totalExpectedQty,
    this.totalReceivedQty,
    this.notes,
    this.createdAt,
    this.items = const [],
  });

  factory Receiving.fromJson(Map<String, dynamic> json) {
    var doc = _readMap(json['rencana_kirim']);
    var rawItems = json['items'];
    return Receiving(
      id: _readInt(json['id']) ?? 0,
      rencanaKirimId: _readInt(json['rencana_kirim_id']),
      poTransporter: _readString(doc?['po_transporter']),
      nopol: _readString(doc?['nopol']),
      driverName: _readString(doc?['driver_name']),
      status: _readString(json['status']) ?? 'PENDING',
      totalExpectedQty: _readDouble(json['total_expected_qty']),
      totalReceivedQty: _readDouble(json['total_received_qty']),
      notes: _readString(json['notes']),
      createdAt: _readDate(json['created_at']),
      items: rawItems is List
          ? rawItems
                .whereType<Map>()
                .map(
                  (item) => ReceivedItem.fromJson(
                    Map<String, dynamic>.from(item),
                  ),
                )
                .toList()
          : const [],
    );
  }
  final int id;
  final int? rencanaKirimId;
  final String? poTransporter;
  final String? nopol;
  final String? driverName;
  final String status;
  final double? totalExpectedQty;
  final double? totalReceivedQty;
  final String? notes;
  final DateTime? createdAt;
  final List<ReceivedItem> items;
}

/// One page of the inbound history (Laravel paginator payload).
class ReceivingPage {
  const ReceivingPage({
    required this.items,
    required this.currentPage,
    required this.lastPage,
    required this.total,
  });

  factory ReceivingPage.fromJson(Map<String, dynamic> json) {
    var rawItems = json['data'];
    var items = rawItems is List
        ? rawItems
              .whereType<Map>()
              .map(
                (item) => Receiving.fromJson(
                  Map<String, dynamic>.from(item),
                ),
              )
              .toList()
        : <Receiving>[];
    return ReceivingPage(
      items: items,
      currentPage: _readInt(json['current_page']) ?? 1,
      lastPage: _readInt(json['last_page']) ?? 1,
      total: _readInt(json['total']) ?? items.length,
    );
  }
  final List<Receiving> items;
  final int currentPage;
  final int lastPage;
  final int total;
}
