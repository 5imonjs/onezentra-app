/// Model & label untuk sesi opname expired (aturan A2).
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

Map<String, dynamic>? _readMap(dynamic value) {
  if (value is Map) {
    return Map<String, dynamic>.from(value);
  }
  return null;
}

/// Status sesi opname lapangan.
class OpnameSessionStatus {
  OpnameSessionStatus._();

  static const Map<String, String> _labels = {
    'OPEN': 'Terbuka',
    'IN_PROGRESS': 'Berjalan',
    'PENDING_APPROVAL': 'Menunggu Persetujuan',
    'APPROVED': 'Disetujui',
    'COMPLETED': 'Selesai',
    'REVISI': 'Revisi',
    'CANCELLED': 'Dibatalkan',
  };

  static String label(String? status) {
    var key = status?.trim().toUpperCase() ?? '';
    return _labels[key] ?? key;
  }
}

/// Satu baris verifikasi dalam sesi: qty fisik + disposisi per batch.
class OpnameExpiredSessionItem {
  const OpnameExpiredSessionItem({
    required this.id,
    required this.sessionId,
    required this.waveId,
    this.batchId,
    this.kodeBarang,
    this.namaBarang,
    this.kodeDepo,
    this.namaDepo,
    this.expiredDateIni,
    this.sisaHari,
    this.qtyFisikCrt,
    this.qtyFisikPcs,
    this.condition,
    this.disposition,
    this.notes,
    this.verifiedAt,
    this.verifiedBy,
    this.verifiedVia,
    this.expectedCrt,
    this.expectedPcs,
    this.batchNumber,
    this.barcodeLabel,
    this.qtyWaveCrt,
    this.qtyWavePcs,
    this.statusIni,
    this.tanggalPenerimaan,
    this.conditionTerima,
    this.selisihTerima,
    this.umurSimpanHari,
    this.sisaHariBatch,
    this.diterimaMingguIni = false,
    this.clusterLabel,
    this.compositeUnit,
  });

  factory OpnameExpiredSessionItem.fromJson(Map<String, dynamic> json) =>
      OpnameExpiredSessionItem(
        id: _readInt(json['id']) ?? 0,
        clusterLabel:
            _readString(_readMap(json['wave'])?['principal_1']) ??
            _readString(_readMap(json['wave'])?['principal_2']),
        sessionId: _readInt(json['session_id']) ?? 0,
        waveId: _readInt(json['wave_id']) ?? 0,
        batchId: _readInt(json['batch_id']),
        kodeBarang: _readString(_readMap(json['wave'])?['kode_barang']),
        namaBarang: _readString(_readMap(json['wave'])?['nama_barang']),
        kodeDepo: _readString(_readMap(json['wave'])?['kode_depo']),
        namaDepo: _readString(_readMap(json['wave'])?['nama_depo']),
        expiredDateIni: _readString(
          _readMap(json['wave'])?['expired_date_ini'],
        ),
        sisaHari: _readInt(_readMap(json['wave'])?['sisa_hari']),
        // Label batch fisik terpasang di gudang — petugas mencocokkan
        // nomor batch ini dengan label tercetak saat memverifikasi.
        batchNumber: _readString(_readMap(json['batch'])?['batch_number']),
        barcodeLabel: _readString(_readMap(json['batch'])?['barcode_label']),
        // Konteks penerimaan per batch untuk analisa (petugas = penerima
        // barang): tanggal terima, kondisi saat terima, dan selisih yang
        // sudah ada sejak terima.
        tanggalPenerimaan: _readString(json['tanggal_penerimaan']),
        conditionTerima: _readString(json['condition_terima']),
        selisihTerima: _readDouble(json['selisih_terima']),
        // Sisa umur simpan per batch (hitungan live backend): umur simpan
        // yang dirancang saat terima & sisa hari sekarang.
        umurSimpanHari: _readInt(json['umur_simpan_hari']),
        sisaHariBatch: _readInt(json['sisa_hari']),
        // Penanda barang baru diterima di minggu sesi penerimaan —
        // dibedakan warna agar stok baru terlihat berbeda dari barang
        // bawaan minggu sebelumnya.
        diterimaMingguIni: json['diterima_minggu_ini'] == true,
        // Satuan komposit dari master NPN (aktif saat setting global
        // `composite_unit` di OpnameExpiredService dinyalakan).
        compositeUnit: _readString(json['composite_unit']),
        // Qty wave minggu ini: acuan stok sesi dari backend.
        qtyWaveCrt: _readDouble(_readMap(json['wave'])?['qty_ini_crt']),
        qtyWavePcs: _readDouble(_readMap(json['wave'])?['qty_ini_pcs']),
        statusIni: _readString(_readMap(json['wave'])?['status_ini']),
        qtyFisikCrt: _readDouble(json['qty_fisik_crt']),
        qtyFisikPcs: _readDouble(json['qty_fisik_pcs']),
        condition: _readString(json['condition']),
        disposition: _readString(json['disposition']),
        notes: _readString(json['notes']),
        verifiedAt: _readString(json['verified_at']),
        verifiedBy: _readInt(json['verified_by']),
        verifiedVia: _readString(json['verified_via']),
        expectedCrt: _readDouble(json['expected_crt']),
        expectedPcs: _readDouble(json['expected_pcs']),
      );

  final int id;
  final int sessionId;
  final int waveId;
  final int? batchId;
  final String? kodeBarang;
  final String? namaBarang;
  final String? kodeDepo;
  final String? namaDepo;
  final String? expiredDateIni;
  final int? sisaHari;
  final String? batchNumber;
  final String? barcodeLabel;
  final String? clusterLabel;
  final double? qtyWaveCrt;
  final double? qtyWavePcs;
  final String? statusIni;
  final String? tanggalPenerimaan;
  final String? conditionTerima;
  final double? selisihTerima;
  final int? umurSimpanHari;
  final int? sisaHariBatch;
  final bool diterimaMingguIni;
  final double? qtyFisikCrt;
  final double? qtyFisikPcs;

  /// Satuan komposit dari master NPN (non-null saat setting global
  /// `composite_unit` dinyalakan & produk punya data NPN).
  final String? compositeUnit;
  final String? condition;
  final String? disposition;
  final String? notes;
  final String? verifiedAt;
  final int? verifiedBy;
  final String? verifiedVia;
  final double? expectedCrt;
  final double? expectedPcs;

  /// Patch hasil hitung ke baris yang sudah termuat dari endpoint detail.
  /// Field tampilan (label batch, barcode, acuan, konteks terima, umur simpan)
  /// sengaja diambil dari `this` — response verify hanya menjamin field hasil
  /// hitung, jadi mengganti seluruh objek membuat label batch hilang di layar.
  OpnameExpiredSessionItem withVerification(
    OpnameExpiredSessionItem verified,
  ) => OpnameExpiredSessionItem(
    id: id,
    sessionId: sessionId,
    waveId: waveId,
    batchId: verified.batchId ?? batchId,
    kodeBarang: verified.kodeBarang ?? kodeBarang,
    namaBarang: verified.namaBarang ?? namaBarang,
    kodeDepo: verified.kodeDepo ?? kodeDepo,
    namaDepo: verified.namaDepo ?? namaDepo,
    expiredDateIni: verified.expiredDateIni ?? expiredDateIni,
    sisaHari: verified.sisaHari ?? sisaHari,
    batchNumber: verified.batchNumber ?? batchNumber,
    barcodeLabel: verified.barcodeLabel ?? barcodeLabel,
    clusterLabel: verified.clusterLabel ?? clusterLabel,
    qtyWaveCrt: verified.qtyWaveCrt ?? qtyWaveCrt,
    qtyWavePcs: verified.qtyWavePcs ?? qtyWavePcs,
    statusIni: verified.statusIni ?? statusIni,
    tanggalPenerimaan: verified.tanggalPenerimaan ?? tanggalPenerimaan,
    conditionTerima: verified.conditionTerima ?? conditionTerima,
    selisihTerima: verified.selisihTerima ?? selisihTerima,
    umurSimpanHari: verified.umurSimpanHari ?? umurSimpanHari,
    sisaHariBatch: verified.sisaHariBatch ?? sisaHariBatch,
    diterimaMingguIni: diterimaMingguIni || verified.diterimaMingguIni,
    qtyFisikCrt: verified.qtyFisikCrt,
    qtyFisikPcs: verified.qtyFisikPcs,
    condition: verified.condition,
    disposition: verified.disposition,
    notes: verified.notes,
    verifiedAt: verified.verifiedAt,
    verifiedBy: verified.verifiedBy,
    verifiedVia: verified.verifiedVia,
    expectedCrt: verified.expectedCrt ?? expectedCrt,
    expectedPcs: verified.expectedPcs ?? expectedPcs,
  );

  bool get isVerified => verifiedAt != null;
}

/// Sesi opname lapangan: periode + petugas + status + item verifikasi.
class OpnameExpiredSession {
  const OpnameExpiredSession({
    required this.id,
    this.weekStart,
    this.weekEnd,
    this.kodeDepo,
    this.namaDepo,
    this.assignedTo,
    this.assigneeName,
    this.status = 'OPEN',
    this.notes,
    this.startedAt,
    this.completedAt,
    this.createdBy,
    this.submittedBy,
    this.submittedAt,
    this.inputCompletedAt,
    this.finishedAt,
    this.decidedBy,
    this.decidedAt,
    this.decisionNote,
    this.itemsCount,
    this.verifiedCount,
    this.items = const <OpnameExpiredSessionItem>[],
  });

  factory OpnameExpiredSession.fromJson(Map<String, dynamic> json) {
    var rawItems = json['items'];
    return OpnameExpiredSession(
      id: _readInt(json['id']) ?? 0,
      weekStart: _readString(json['week_start']),
      weekEnd: _readString(json['week_end']),
      kodeDepo: _readString(json['kode_depo']),
      namaDepo: _readString(json['nama_depo']),
      assignedTo: _readInt(json['assigned_to']),
      assigneeName: _readString(_readMap(json['assignee'])?['full_name']),
      status: _readString(json['status']) ?? 'OPEN',
      notes: _readString(json['notes']),
      startedAt: _readString(json['started_at']),
      completedAt: _readString(json['completed_at']),
      createdBy: _readInt(json['created_by']),
      submittedBy: _readInt(json['submitted_by']),
      submittedAt: _readString(json['submitted_at']),
      inputCompletedAt: _readString(json['input_completed_at']),
      finishedAt: _readString(json['finished_at']),
      decidedBy: _readInt(json['decided_by']),
      decidedAt: _readString(json['decided_at']),
      decisionNote: _readString(json['decision_note']),
      // Endpoint daftar mengirim dua agregat ini tanpa items — detail
      // tetap mengirim items lengkap.
      itemsCount: _readInt(json['items_count']),
      verifiedCount: _readInt(json['verified_count']),
      items: rawItems is List
          ? rawItems
                .whereType<Map>()
                .map(
                  (e) => OpnameExpiredSessionItem.fromJson(
                    Map<String, dynamic>.from(e),
                  ),
                )
                .toList()
          : const <OpnameExpiredSessionItem>[],
    );
  }

  final int id;
  final String? weekStart;
  final String? weekEnd;
  final String? kodeDepo;
  final String? namaDepo;
  final int? assignedTo;
  final String? assigneeName;
  final String status;
  final String? notes;
  final String? startedAt;
  final String? completedAt;
  final int? createdBy;
  final int? submittedBy;
  final String? submittedAt;
  final String? inputCompletedAt;
  final String? finishedAt;
  final int? decidedBy;
  final String? decidedAt;
  final String? decisionNote;
  final int? itemsCount;
  final int? verifiedCount;
  final List<OpnameExpiredSessionItem> items;

  /// Salin sesi dengan daftar item baru. Dipakai klien untuk patch state
  /// lokal setelah verifikasi/aksi, tanpa mengunduh ulang detail penuh.
  OpnameExpiredSession withItems(List<OpnameExpiredSessionItem> nextItems) =>
      OpnameExpiredSession(
        id: id,
        weekStart: weekStart,
        weekEnd: weekEnd,
        kodeDepo: kodeDepo,
        namaDepo: namaDepo,
        assignedTo: assignedTo,
        assigneeName: assigneeName,
        status: status,
        notes: notes,
        startedAt: startedAt,
        completedAt: completedAt,
        createdBy: createdBy,
        submittedBy: submittedBy,
        submittedAt: submittedAt,
        inputCompletedAt: inputCompletedAt,
        finishedAt: finishedAt,
        decidedBy: decidedBy,
        decidedAt: decidedAt,
        decisionNote: decisionNote,
        itemsCount: itemsCount,
        verifiedCount: verifiedCount,
        items: nextItems,
      );

  /// Salin sesi dengan jumlah item yang sudah diverifikasi. Respons verify
  /// server tidak membawa `verified_count` (hanya ada di endpoint daftar),
  /// jadi klien hitung dari item yang sudah terpatch.
  OpnameExpiredSession withVerifiedCount(int verifiedCount) =>
      OpnameExpiredSession(
        id: id,
        weekStart: weekStart,
        weekEnd: weekEnd,
        kodeDepo: kodeDepo,
        namaDepo: namaDepo,
        assignedTo: assignedTo,
        assigneeName: assigneeName,
        status: status,
        notes: notes,
        startedAt: startedAt,
        completedAt: completedAt,
        createdBy: createdBy,
        submittedBy: submittedBy,
        submittedAt: submittedAt,
        inputCompletedAt: inputCompletedAt,
        finishedAt: finishedAt,
        decidedBy: decidedBy,
        decidedAt: decidedAt,
        decisionNote: decisionNote,
        itemsCount: itemsCount,
        verifiedCount: verifiedCount,
        items: items,
      );

  bool get isOpen => status == 'OPEN';
  bool get acceptsCounting => status == 'IN_PROGRESS' || status == 'REVISI';
  bool get isPendingApproval => status == 'PENDING_APPROVAL';
}
