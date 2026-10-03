/// Models for the Bongkar (receiving execution) menu.
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

/// One planned line from the rencana kirim behind the receiving.
class UnloadPlanLine {
  const UnloadPlanLine({
    this.id,
    this.kodeBarang,
    this.namaBarang,
    this.jumlah,
    this.satuan,
  });

  factory UnloadPlanLine.fromJson(Map<String, dynamic> json) => UnloadPlanLine(
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

/// One already scanned line of the receiving.
class UnloadScannedLine {
  const UnloadScannedLine({
    this.kodeBarang,
    this.namaBarang,
    this.actualQty,
    this.satuan,
    this.condition,
  });

  factory UnloadScannedLine.fromJson(Map<String, dynamic> json) =>
      UnloadScannedLine(
        kodeBarang: _readString(json['kode_barang']),
        namaBarang: _readString(json['nama_barang']),
        actualQty: _readDouble(json['actual_qty']),
        satuan: _readString(json['satuan']),
        condition: _readString(json['condition']),
      );
  final String? kodeBarang;
  final String? namaBarang;
  final double? actualQty;
  final String? satuan;
  final String? condition;
}

/// A receiving being unloaded: plan lines vs scanned lines.
class UnloadSession {
  const UnloadSession({
    required this.id,
    this.status = 'PENDING',
    this.poTransporter,
    this.nopol,
    this.driverName,
    this.totalExpectedQty,
    this.totalReceivedQty,
    this.actualStartTime,
    this.plan = const [],
    this.scanned = const [],
  });

  factory UnloadSession.fromJson(Map<String, dynamic> json) {
    var doc = _readMap(json['rencana_kirim']);
    var rawPlan = doc?['items'];
    var rawScanned = json['items'];
    return UnloadSession(
      id: _readInt(json['id']) ?? 0,
      status: _readString(json['status']) ?? 'PENDING',
      poTransporter: _readString(doc?['po_transporter']),
      nopol: _readString(doc?['nopol']),
      driverName: _readString(doc?['driver_name']),
      totalExpectedQty: _readDouble(json['total_expected_qty']),
      totalReceivedQty: _readDouble(json['total_received_qty']),
      actualStartTime: _readDate(json['actual_start_time']),
      plan: rawPlan is List
          ? rawPlan
                .whereType<Map>()
                .map(
                  (item) => UnloadPlanLine.fromJson(
                    Map<String, dynamic>.from(item),
                  ),
                )
                .toList()
          : const [],
      scanned: rawScanned is List
          ? rawScanned
                .whereType<Map>()
                .map(
                  (item) => UnloadScannedLine.fromJson(
                    Map<String, dynamic>.from(item),
                  ),
                )
                .toList()
          : const [],
    );
  }
  final int id;
  final String status;
  final String? poTransporter;
  final String? nopol;
  final String? driverName;
  final double? totalExpectedQty;
  final double? totalReceivedQty;
  final DateTime? actualStartTime;
  final List<UnloadPlanLine> plan;
  final List<UnloadScannedLine> scanned;

  bool get isStarted => status == 'IN_PROGRESS';

  /// Plan lines already covered by at least one scan (matched by
  /// kode_barang, case-insensitive — the server keys the same way).
  int get coveredCount {
    var scannedCodes = {
      for (var line in scanned)
        (line.kodeBarang ?? '').toLowerCase(),
    };
    return plan
        .where(
          (line) =>
              line.kodeBarang != null &&
              scannedCodes.contains(line.kodeBarang!.toLowerCase()),
        )
        .length;
  }
}

/// Success / failure banner shown after a lookup or an unload action.
class UnloadActionMessage {
  const UnloadActionMessage({required this.success, required this.message});

  const UnloadActionMessage.success(this.message) : success = true;

  const UnloadActionMessage.failure(this.message) : success = false;
  final bool success;
  final String message;
}
