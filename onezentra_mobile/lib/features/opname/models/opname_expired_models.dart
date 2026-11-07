/// Model & label untuk halaman Opname Expired (monitoring barang kadaluarsa).
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

Map<String, dynamic>? _readMap(dynamic value) =>
    value is Map ? Map<String, dynamic>.from(value) : null;

/// Status kedaluwarsa: EXPIRED / KRITIS / PERHATIAN / AMAN
/// (threshold OpnameSetting).
class OpnameStatus {
  OpnameStatus._();

  static const Map<String, String> _labels = {
    'EXPIRED': 'Expired',
    'KRITIS': 'Kritis',
    'PERHATIAN': 'Perhatian',
    'AMAN': 'Aman',
  };

  static String label(String? status) {
    var key = status?.trim().toUpperCase() ?? '';
    return _labels[key] ?? key;
  }
}

/// Ringkasan satu status: jumlah wave + total qty crt pada minggu terpilih.
class OpnameStatusCount {
  const OpnameStatusCount({
    required this.status,
    required this.count,
    required this.qtyCrt,
  });

  factory OpnameStatusCount.fromJson(Map<String, dynamic> json) =>
      OpnameStatusCount(
        status: _readString(json['status']) ?? '',
        count: _readInt(json['count']) ?? 0,
        qtyCrt: _readDouble(json['qty_crt']) ?? 0,
      );

  final String status;
  final int count;
  final double qtyCrt;
}

/// Ringkasan status Expired / Kritis / Perhatian / Aman untuk satu minggu.
class OpnameStatusSummary {
  const OpnameStatusSummary({required this.counts});

  factory OpnameStatusSummary.fromJson(Map<String, dynamic> json) {
    var counts = <String, OpnameStatusCount>{};
    json.forEach((status, value) {
      if (value is Map) {
        counts[status] = OpnameStatusCount.fromJson(
          Map<String, dynamic>.from(value),
        );
      }
    });
    return OpnameStatusSummary(counts: counts);
  }

  final Map<String, OpnameStatusCount> counts;

  int get totalCount => counts.values.fold<int>(0, (sum, c) => sum + c.count);

  double get totalQtyCrt =>
      counts.values.fold<double>(0, (sum, c) => sum + c.qtyCrt);

  /// Batch yang perlu ditindak: Expired + Kritis + Perhatian.
  int get riskCount => _riskStatuses.fold<int>(
    0,
    (sum, status) => sum + (countOf(status)?.count ?? 0),
  );

  /// Qty CRT yang perlu ditindak: Expired + Kritis + Perhatian.
  double get riskQtyCrt => _riskStatuses.fold<double>(
    0,
    (sum, status) => sum + (countOf(status)?.qtyCrt ?? 0),
  );

  OpnameStatusCount? countOf(String status) => counts[status];

  static const List<String> _riskStatuses = ['EXPIRED', 'KRITIS', 'PERHATIAN'];
}

/// Satu baris wave expired: produk + depo + expired + qty + status.
class OpnameExpiredWave {
  const OpnameExpiredWave({
    required this.id,
    required this.statusIni,
    this.weekStart,
    this.weekEnd,
    this.kodeDepo,
    this.namaDepo,
    this.kodeBarang,
    this.namaBarang,
    this.sumberMaterial,
    this.tanggalPenerimaan,
    this.expiredDateIni,
    this.expiredDateLalu,
    this.selisihExpiredDate,
    this.sisaHari,
    this.statusLalu,
    this.perubahan,
    this.rekomendasi,
    this.qtyIniCrt,
    this.qtyIniPcs,
    this.qtyLaluCrt,
    this.qtyLaluPcs,
    this.qtyKoreksiCrt,
    this.qtyKoreksiPcs,
    this.batchNumbers = const <String>[],
    this.sourceMix,
    this.validatorName,
    this.principal1,
    this.principal2,
  });

  factory OpnameExpiredWave.fromJson(Map<String, dynamic> json) =>
      OpnameExpiredWave(
        id: _readInt(json['id']) ?? 0,
        weekStart: _readString(json['week_start']),
        weekEnd: _readString(json['week_end']),
        kodeDepo: _readString(json['kode_depo']),
        namaDepo: _readString(json['nama_depo']),
        kodeBarang: _readString(json['kode_barang']),
        namaBarang: _readString(json['nama_barang']),
        sumberMaterial: _readString(json['sumber_material']),
        tanggalPenerimaan: _readString(json['tanggal_penerimaan']),
        expiredDateIni: _readString(json['expired_date_ini']),
        expiredDateLalu: _readString(json['expired_date_lalu']),
        selisihExpiredDate: _readInt(json['selisih_expired_date']),
        sisaHari: _readInt(json['sisa_hari']),
        statusIni: _readString(json['status_ini']) ?? 'AMAN',
        statusLalu: _readString(json['status_lalu']),
        perubahan: _readString(json['perubahan']),
        rekomendasi: _readString(json['rekomendasi']),
        qtyIniCrt: _readDouble(json['qty_ini_crt']),
        qtyIniPcs: _readDouble(json['qty_ini_pcs']),
        qtyLaluCrt: _readDouble(json['qty_lalu_crt']),
        qtyLaluPcs: _readDouble(json['qty_lalu_pcs']),
        qtyKoreksiCrt: _readDouble(json['qty_koreksi_crt']),
        qtyKoreksiPcs: _readDouble(json['qty_koreksi_pcs']),
        batchNumbers: (json['batch_numbers'] is List)
            ? List<String>.from(
                (json['batch_numbers'] as List).map((e) => e.toString()),
              )
            : const <String>[],
        sourceMix: _readMap(json['source_mix']),
        validatorName:
            _readString(_readMap(json['validator'])?['full_name']) ??
            _readString(_readMap(json['validator'])?['name']),
        principal1: _readString(json['principal_1']),
        principal2: _readString(json['principal_2']),
      );

  final int id;

  final String? weekStart;
  final String? weekEnd;
  final String? kodeDepo;
  final String? namaDepo;
  final String? kodeBarang;
  final String? namaBarang;
  final String? sumberMaterial;
  final String? tanggalPenerimaan;
  final String? expiredDateIni;
  final String? expiredDateLalu;
  final int? selisihExpiredDate;
  final int? sisaHari;
  final String statusIni;
  final String? statusLalu;
  final String? perubahan;
  final String? rekomendasi;
  final double? qtyIniCrt;
  final double? qtyIniPcs;
  final double? qtyLaluCrt;
  final double? qtyLaluPcs;
  final double? qtyKoreksiCrt;
  final double? qtyKoreksiPcs;
  final List<String> batchNumbers;
  final Map<String, dynamic>? sourceMix;
  final String? validatorName;
  final String? principal1;
  final String? principal2;

  /// Qty efektif = qty ini + koreksi terkini (sama dengan backend `effectiveCrt`).
  double get effectiveCrt => (qtyIniCrt ?? 0) + (qtyKoreksiCrt ?? 0);

  double get effectivePcs => (qtyIniPcs ?? 0) + (qtyKoreksiPcs ?? 0);

  /// Nama cluster (BOSnet) yang menanggung barang — dipakai pengelompokan.
  String get clusterLabel => principal1 ?? principal2 ?? 'Umum';
}

/// Metadata ringkasan untuk satu minggu pada response list Opname Expired.
class OpnameExpiredMeta {
  const OpnameExpiredMeta({
    required this.weeks,
    required this.thresholds,
    required this.statusSummary,
    required this.prevWeekStart,
    required this.prevStatusSummary,
  });

  factory OpnameExpiredMeta.fromJson(Map<String, dynamic> json) =>
      OpnameExpiredMeta(
        weeks: (json['weeks'] is List)
            ? List<String>.from(
                (json['weeks'] as List).map((e) => e.toString()),
              )
            : const <String>[],
        thresholds: json['thresholds'] is Map
            ? Map<String, dynamic>.from(json['thresholds'] as Map)
            : const <String, dynamic>{},
        statusSummary: OpnameStatusSummary.fromJson(
          _readMap(json['status_summary']) ?? <String, dynamic>{},
        ),
        prevWeekStart: _readString(json['prev_week_start']),
        prevStatusSummary: OpnameStatusSummary.fromJson(
          _readMap(json['prev_status_summary']) ?? <String, dynamic>{},
        ),
      );

  final List<String> weeks;
  final Map<String, dynamic> thresholds;
  final OpnameStatusSummary statusSummary;
  final String? prevWeekStart;
  final OpnameStatusSummary prevStatusSummary;
}

/// Response `GET /opname-expired`: daftar wave expired + meta ringkasan.
class OpnameExpiredList {
  const OpnameExpiredList({required this.waves, required this.meta});

  factory OpnameExpiredList.fromJson(Map<String, dynamic> json) {
    var raw = json['data'];
    var rawWaves = <dynamic>[];
    if (raw is List) {
      rawWaves = raw;
    } else if (raw is Map) {
      var inner = raw['data'];
      if (inner is List) {
        rawWaves = inner;
      }
    }

    return OpnameExpiredList(
      waves: rawWaves
          .whereType<Map>()
          .map<OpnameExpiredWave>(
            (e) => OpnameExpiredWave.fromJson(Map<String, dynamic>.from(e)),
          )
          .toList(),
      meta: json['meta'] is Map
          ? OpnameExpiredMeta.fromJson(
              Map<String, dynamic>.from(json['meta'] as Map),
            )
          : null,
    );
  }

  final List<OpnameExpiredWave> waves;
  final OpnameExpiredMeta? meta;
}
