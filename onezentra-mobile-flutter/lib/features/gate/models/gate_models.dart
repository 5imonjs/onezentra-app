import 'package:onezentra_mobile/widgets/status_pill.dart';

/// Model ringan untuk alur Gate Check In — mirror
/// `onezentra-web/src/app/gate/page.tsx` + `GateTransactionController`.
class RencanaKirimSummary {
  const RencanaKirimSummary({
    required this.id,
    required this.poTransporter,
    required this.nopol,
    required this.driverName,
    required this.status,
    this.kodeDepo = '',
    this.namaDepo = '',
  });

  final int id;
  final String poTransporter;
  final String nopol;
  final String driverName;
  final String status;
  final String kodeDepo;
  final String namaDepo;

  factory RencanaKirimSummary.fromJson(Map<String, dynamic> json) {
    return RencanaKirimSummary(
      id: (json['id'] as num?)?.toInt() ?? 0,
      poTransporter: '${json['po_transporter'] ?? ''}',
      nopol: '${json['nopol'] ?? ''}',
      driverName: '${json['driver_name'] ?? ''}',
      status: '${json['status'] ?? ''}',
      kodeDepo: '${json['kode_depo'] ?? ''}',
      namaDepo: '${json['nama_depo'] ?? ''}',
    );
  }

  /// Salinan dengan status baru — dipakai setelah gate tercatat supaya kartu
  /// lanjutan (Mulai Validasi) mencerminkan status terbaru dokumen.
  RencanaKirimSummary copyWith({String? status}) {
    return RencanaKirimSummary(
      id: id,
      poTransporter: poTransporter,
      nopol: nopol,
      driverName: driverName,
      status: status ?? this.status,
      kodeDepo: kodeDepo,
      namaDepo: namaDepo,
    );
  }
}

class GateTransactionItem {
  const GateTransactionItem({
    required this.id,
    required this.gateType,
    required this.poTransporter,
    required this.nopol,
    required this.driverName,
    required this.scanTime,
    this.rkStatus = '',
  });

  final int id;
  final String gateType;
  final String poTransporter;
  final String nopol;
  final String driverName;
  final String scanTime;
  final String rkStatus;

  factory GateTransactionItem.fromJson(Map<String, dynamic> json) {
    final rk = json['rencana_kirim'];
    return GateTransactionItem(
      id: (json['id'] as num?)?.toInt() ?? 0,
      gateType: '${json['gate_type'] ?? ''}',
      poTransporter: '${json['po_transporter'] ?? ''}',
      nopol: '${json['nopol'] ?? ''}',
      driverName: '${json['driver_name'] ?? ''}',
      scanTime: '${json['scan_time'] ?? ''}',
      rkStatus: rk is Map ? '${rk['status'] ?? ''}' : '',
    );
  }
}

class GateStats {
  const GateStats({
    required this.hariIni,
    required this.terjadwal,
    required this.selesai,
    required this.total,
  });

  final int hariIni;
  final int terjadwal;
  final int selesai;
  final int total;

  factory GateStats.fromJson(Map<String, dynamic> json) {
    int asInt(Object? v) => (v as num?)?.toInt() ?? 0;
    return GateStats(
      hariIni: asInt(json['hari_ini']),
      terjadwal: asInt(json['terjadwal']),
      selesai: asInt(json['selesai']),
      total: asInt(json['total']),
    );
  }

  static const empty = GateStats(
    hariIni: 0,
    terjadwal: 0,
    selesai: 0,
    total: 0,
  );
}

/// Label status dokumen — mirror `statusLabels` di web.
String gateStatusLabel(String status) {
  return switch (status) {
    'DRAFT' => 'Draft',
    'SCHEDULED' => 'Dijadwalkan',
    'CHECKED_IN' => 'Check In',
    'VERIFIED' => 'Terverifikasi',
    'IN_PROGRESS' => 'Diproses',
    'COMPLETED' => 'Selesai',
    'CANCELLED' => 'Dibatalkan',
    _ => status.isEmpty ? '-' : status,
  };
}

/// Nada pill status dokumen — mirror `RK_STATUS_STYLE` di web
/// (`bg-*`/`text-*`/`border-*` per status, dengan titik warna di depan label).
///
/// Status yang tidak dikenal memakai abu-abu, sama seperti fallback
/// `bg-slate-100 text-slate-600` di web: lebih baik netral daripada menebak
/// warna yang berarti status lain.
PillTone gateStatusTone(String status) {
  return switch (status) {
    'DRAFT' => PillTone.neutral,
    'SCHEDULED' => PillTone.blue,
    'CHECKED_IN' => PillTone.warning,
    'VERIFIED' => PillTone.violet,
    'IN_PROGRESS' => PillTone.orange,
    'COMPLETED' => PillTone.success,
    'CANCELLED' => PillTone.danger,
    _ => PillTone.neutral,
  };
}

/// Status dokumen yang masih boleh masuk ke proses Validasi Dokumen.
///
/// Backend (`SjValidationController::startValidation`) menerima SCHEDULED,
/// CHECKED_IN, dan VERIFIED. VERIFIED sengaja tidak ditawarkan di UI: status
/// itu berarti validasi sudah lewat (dokumen menunggu bongkar), sehingga
/// tombolnya hanya muncul saat operator benar-benar masih punya pekerjaan —
/// yang persis setelah Gate IN.
bool isDocumentValidatable(String status) {
  return status == 'SCHEDULED' || status == 'CHECKED_IN';
}

/// Panduan aksi gate — mirror `STATUS_GUIDE` di web.
String? gateStatusGuide(String status) {
  return switch (status) {
    'DRAFT' =>
      'Dokumen masih Draft. Jadwalkan terlebih dahulu di menu Replenishment.',
    'VERIFIED' =>
      'Dokumen sudah diverifikasi dan menunggu proses bongkar. Tidak ada aksi gate saat ini.',
    'IN_PROGRESS' =>
      'Bongkar sedang berjalan. Gate OUT tersedia setelah status Selesai.',
    'CANCELLED' => 'Dokumen dibatalkan dan tidak dapat diproses di gate.',
    _ => null,
  };
}
