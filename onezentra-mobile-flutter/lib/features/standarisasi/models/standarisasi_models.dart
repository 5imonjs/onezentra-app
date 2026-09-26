/// Model Standarisasi Tumpukan — mirror `StandarisasiTumpukanController`
/// (`index`, `stats`, `search-product`, `store`, `approve`, `reject`) dan
/// `onezentra-web/src/app/standarisasi/page.tsx` untuk label, warna, dan batas
/// masukan.
///
/// Halaman ini juga menutup jalan buntu di Validasi Dokumen: item yang produknya
/// belum punya standarisasi **disetujui** tidak boleh diperiksa — web
/// mengarahkan operator ke sini (`validasi-sj/page.tsx` `openItem`), dan
/// mobile melakukan hal yang sama lewat [StandarisasiScreen].
library;

import 'package:onezentra_mobile/widgets/status_pill.dart';

const standarisasiStatusPending = 'pending';
const standarisasiStatusApproved = 'approved';
const standarisasiStatusRejected = 'rejected';

/// Batas atas tier/tinggi tumpukan — `StandarisasiTumpukanController`
/// `MAX_DIMENSION` (validasi backend) sekaligus clamp yang sama di form web
/// (`Math.max(1, Math.min(100, …))`).
const maxStackDimension = 100;

/// Samakan nilai tier/tinggi dengan form web: selalu integer 1..100. Kolom
/// kosong atau teks bukan angka menjadi 1, bukan 0 — backend menolak `0`.
int clampStackDimension(int? value) {
  if (value == null) {
    return 1;
  }
  return value.clamp(1, maxStackDimension);
}

/// Label badge status — sama persis dengan `STATUS_META` di
/// `standarisasi/page.tsx` (amber / emerald / red).
const standarisasiStatusLabels = <String, String>{
  standarisasiStatusPending: 'Menunggu',
  standarisasiStatusApproved: 'Disetujui',
  standarisasiStatusRejected: 'Ditolak',
};

String standarisasiStatusLabel(String status) =>
    standarisasiStatusLabels[status] ?? status;

/// Nada pill untuk setiap status.
///
/// [PillTone] milik design system bersama (`widgets/status_pill.dart`),
/// dipinjam ke sini supaya pasangan warna label + pill tidak bisa terbalik di
/// antara daftar dan sheet detail.
PillTone standarisasiStatusTone(String status) => switch (status) {
  standarisasiStatusPending => PillTone.warning,
  standarisasiStatusApproved => PillTone.success,
  standarisasiStatusRejected => PillTone.danger,
  _ => PillTone.neutral,
};

/// Baris standarisasi tumpukan satu produk pada satu depo.
///
/// [npn] tidak selalu ada: `SjValidationController::attachStandarisasiTumpukan`
/// menyisipkan objek ini ke setiap item validasi **tanpa** relasi produknya,
/// sedangkan `GET /standarisasi-tumpukan` memuatnya lewat `with('npn')`.
class StandarisasiTumpukan {
  const StandarisasiTumpukan({
    required this.id,
    required this.npnId,
    required this.tier,
    required this.tinggiTumpukan,
    required this.status,
    this.totalTierTinggi,
    this.npn,
    this.requestedByEmail,
    this.approvedByEmail,
    this.kodeDepo,
    this.namaDepo,
    this.createdAt,
    this.updatedAt,
  });

  factory StandarisasiTumpukan.fromJson(Map<String, dynamic> json) {
    return StandarisasiTumpukan(
      id: _asInt(json['id']),
      npnId: _asIntOrNull(json['npn_id']),
      tier: _asInt(json['tier']),
      tinggiTumpukan: _asInt(json['tinggi_tumpukan']),
      // Backend bisa mengirim `total_tier_tinggi: null` untuk baris yang belum
      // punya dimensi (mis. dibuat dari form validasi tanpa tier/tinggi), jadi
      // nilainya tetap opsional dan [totalTumpukan] yang menghitungnya.
      totalTierTinggi: _asIntOrNull(json['total_tier_tinggi']),
      status: '${json['status'] ?? standarisasiStatusPending}',
      npn: json['npn'] is Map
          ? NpnProduct.fromJson(Map<String, dynamic>.from(json['npn'] as Map))
          : null,
      requestedByEmail: _asString(json['requested_by_email']),
      approvedByEmail: _asString(json['approved_by_email']),
      kodeDepo: _asString(json['kode_depo']),
      namaDepo: _asString(json['nama_depo']),
      createdAt: _asString(json['created_at']),
      updatedAt: _asString(json['updated_at']),
    );
  }

  final int id;
  final int? npnId;
  final int tier;
  final int tinggiTumpukan;
  final int? totalTierTinggi;
  final String status;
  final NpnProduct? npn;
  final String? requestedByEmail;
  final String? approvedByEmail;
  final String? kodeDepo;
  final String? namaDepo;
  final String? createdAt;
  final String? updatedAt;

  bool get isPending => status == standarisasiStatusPending;
  bool get isApproved => status == standarisasiStatusApproved;

  /// Jumlah tumpukan; dihitung ulang bila backend belum menyimpannya, sama
  /// seperti fallback `viewItem.tier * viewItem.tinggi_tumpukan` di web.
  int get totalTumpukan =>
      totalTierTinggi ??
      (tier > 0 && tinggiTumpukan > 0 ? tier * tinggiTumpukan : 0);

  /// Baris "3 tier x 2 tinggi = 6 total" yang dipakai daftar & detail.
  String get dimensionSummary =>
      '$tier tier x $tinggiTumpukan = $totalTumpukan';
}

/// Ringkasan jumlah per status (`GET /standarisasi-tumpukan/stats`) — dihitung
/// backend untuk seluruh depo user, bukan hanya halaman aktif.
class StandarisasiStats {
  const StandarisasiStats({
    required this.total,
    required this.pending,
    required this.approved,
    required this.rejected,
  });

  factory StandarisasiStats.fromJson(Map<String, dynamic> json) {
    int asInt(Object? value) => (value as num?)?.toInt() ?? 0;
    return StandarisasiStats(
      total: asInt(json['total']),
      pending: asInt(json['pending']),
      approved: asInt(json['approved']),
      rejected: asInt(json['rejected']),
    );
  }

  final int total;
  final int pending;
  final int approved;
  final int rejected;

  static const empty = StandarisasiStats(
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
  );
}

/// Satu halaman hasil `GET /standarisasi-tumpukan` (Laravel paginator).
class StandarisasiListPage {
  const StandarisasiListPage({
    required this.entries,
    required this.currentPage,
    required this.lastPage,
    required this.total,
  });

  final List<StandarisasiTumpukan> entries;
  final int currentPage;
  final int lastPage;
  final int total;
}

/// Produk master yang bisa dipilih di form standarisasi
/// (`GET /standarisasi-tumpukan/search-product`).
///
/// Kolom yang dicari endpoint ini sama dengan `NpnController@searchProduct`
/// (delapan kolom termasuk barcode), tapi endpoint ini hanya butuh izin
/// `standarisasi.view` — jadi halaman ini tidak bergantung pada `npn.view`.
class NpnProduct {
  const NpnProduct({
    required this.id,
    required this.bosId,
    required this.sapId,
    required this.barcode,
    this.shortDescription,
    this.nickname,
    this.nicknameNew,
  });

  factory NpnProduct.fromJson(Map<String, dynamic> json) {
    return NpnProduct(
      id: _asInt(json['id']),
      bosId: '${json['BOSnetszProductId'] ?? '-'}',
      sapId: '${json['SAPszProductId'] ?? '-'}',
      barcode: '${json['szBarcode'] ?? '-'}',
      shortDescription: _asString(json['szShortDescription']),
      nickname: _asString(json['szNickName']),
      nicknameNew: _asString(json['szNickNameNew']),
    );
  }

  final int id;
  final String bosId;
  final String sapId;
  final String barcode;
  final String? shortDescription;
  final String? nickname;
  final String? nicknameNew;

  /// Urutan fallback yang sama dengan `szShortDescription || szNickName ||
  /// szNickNameNew || '-'` di web (tabel, picker, dan modal detail).
  String get name => shortDescription ?? nickname ?? nicknameNew ?? '-';

  /// Baris kedua di picker web: `BOS ID · SAP ID`.
  String get identifier => '$bosId · $sapId';
}

/// Tanggal `26 Sep 2026` — padanan `fmtDate` (`toLocaleDateString('id-ID')`)
/// di `standarisasi/page.tsx`. String kosong / tidak bisa diparse tetap
/// dikembalikan apa adanya supaya operator tidak melihat "null".
String formatStandarisasiDate(String? value) {
  if (value == null || value.isEmpty || value == 'null') {
    return '-';
  }
  final parsed = DateTime.tryParse(value);
  if (parsed == null) {
    return value;
  }
  const months = <String>[
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'Mei',
    'Jun',
    'Jul',
    'Agu',
    'Sep',
    'Okt',
    'Nov',
    'Des',
  ];
  final local = parsed.toLocal();
  return '${local.day} ${months[local.month - 1]} ${local.year}';
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

int _asInt(Object? value) => _asIntOrNull(value) ?? 0;

String? _asString(Object? value) {
  if (value == null) {
    return null;
  }
  final text = '$value';
  return text.isEmpty ? null : text;
}
