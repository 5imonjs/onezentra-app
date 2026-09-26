/// Model ringkasan Beranda — mirror payload `GET /api/v1/dashboard/summary`
/// (`DashboardController::summary`) yang juga dipakai web lewat
/// `useDashboardSummary` (`onezentra-web/src/lib/dashboardSummary.ts`).
///
/// Kontrak yang dipakai di sini **sama persis** dengan web, jadi aplikasi
/// mobile dan web menampilkan angka yang identik untuk satu sumber data —
/// tanpa perlu endpoint baru.
library;

/// Ringkasan satu request: total & tren per modul, peringatan, flag kualitas
/// data, SLA, dan aktivitas terbaru.
class DashboardSummary {
  const DashboardSummary({
    required this.totals,
    required this.new7d,
    required this.alerts,
    required this.quality,
    required this.sla,
    required this.recent,
    this.depot,
  });

  factory DashboardSummary.fromJson(Map<String, dynamic> json) {
    return DashboardSummary(
      depot: _asString(json['depot']),
      totals: _asIntMap(json['totals']),
      new7d: _asIntMap(json['new_7d']),
      alerts: DashboardAlerts.fromJson(_asMap(json['alerts'])),
      quality: DashboardQuality.fromJson(_asMap(json['quality'])),
      sla: DashboardSla.fromJson(_asMap(json['sla'])),
      recent: _asList(json['recent'])
          .whereType<Map>()
          .map(
            (e) => DashboardRecentItem.fromJson(Map<String, dynamic>.from(e)),
          )
          .toList(),
    );
  }

  static const empty = DashboardSummary(
    totals: <String, int>{},
    new7d: <String, int>{},
    alerts: DashboardAlerts(),
    quality: DashboardQuality(),
    sla: DashboardSla(),
    recent: <DashboardRecentItem>[],
  );

  /// Depo hasil filter; null = semua depo (user global).
  final String? depot;

  /// Key = modul (`gate`, `sj_validation`, `npn`, …), value = total baris.
  final Map<String, int> totals;

  /// Key modul sama dengan [totals], value = baris baru 7 hari terakhir.
  final Map<String, int> new7d;

  final DashboardAlerts alerts;
  final DashboardQuality quality;
  final DashboardSla sla;
  final List<DashboardRecentItem> recent;

  /// Total sebuah modul, atau null bila backend tidak mengirimkannya —
  /// artinya user tidak punya izin modul itu (bukan nol).
  int? totalOf(String moduleKey) => totals[moduleKey];

  /// Baris baru 7 hari terakhir, atau null bila modul tidak dikirim.
  int? deltaOf(String moduleKey) => new7d[moduleKey];
}

/// Peringatan operasional (kedaluwarsa & approval tertunda).
class DashboardAlerts {
  const DashboardAlerts({
    this.expiredKritis = 0,
    this.expiredTotal = 0,
    this.standarisasiPending = 0,
  });

  factory DashboardAlerts.fromJson(Map<String, dynamic> json) {
    return DashboardAlerts(
      expiredKritis: _asInt(json['expired_kritis']),
      expiredTotal: _asInt(json['expired_total']),
      standarisasiPending: _asInt(json['standarisasi_pending']),
    );
  }

  final int expiredKritis;
  final int expiredTotal;
  final int standarisasiPending;
}

/// Produk master yang datanya belum lengkap.
class DashboardQuality {
  const DashboardQuality({this.npnNoVolume = 0, this.npnNoUmur = 0});

  factory DashboardQuality.fromJson(Map<String, dynamic> json) {
    return DashboardQuality(
      npnNoVolume: _asInt(json['npn_no_volume']),
      npnNoUmur: _asInt(json['npn_no_umur']),
    );
  }

  final int npnNoVolume;
  final int npnNoUmur;

  /// Total produk yang perlu dilengkapi datanya.
  int get incomplete => npnNoVolume + npnNoUmur;
}

/// Indikator ketepatan waktu & dokumen yang masih terbuka.
class DashboardSla {
  const DashboardSla({
    this.avgGateToReceivingHours,
    this.sjOpenCount = 0,
    this.sjOldestDays,
  });

  factory DashboardSla.fromJson(Map<String, dynamic> json) {
    return DashboardSla(
      avgGateToReceivingHours: _asDoubleOrNull(
        json['avg_gate_to_receiving_hours'],
      ),
      sjOpenCount: _asInt(json['sj_open_count']),
      sjOldestDays: _asIntOrNull(json['sj_oldest_days']),
    );
  }

  /// Rata-rata jam Gate → Receiving 30 hari terakhir; null = belum ada data
  /// (bukan nol).
  final double? avgGateToReceivingHours;

  /// Validasi SJ yang masih `IN_PROGRESS`.
  final int sjOpenCount;

  /// Umur validasi terbuka terlama, dalam hari.
  final int? sjOldestDays;
}

/// Halaman mandiri (di luar empat tab) yang bisa dibuka dari Beranda.
///
/// Tab punya ikon sendiri di bottom navigation, sedangkan modul master hanya
/// punya kartu statistik — jadi_alasannya disimpan sebagai enum supaya
/// `DashboardScreen` tahu harus menutup tab lalu mendorong halaman baru.
enum DashboardPage { standarisasi }

/// Satu baris aktivitas lintas modul (`recentActivity` di backend).
class DashboardRecentItem {
  const DashboardRecentItem({
    required this.type,
    required this.title,
    required this.subtitle,
    required this.href,
    this.at,
  });

  factory DashboardRecentItem.fromJson(Map<String, dynamic> json) {
    return DashboardRecentItem(
      type: _asString(json['type']) ?? '',
      title: _asString(json['title']) ?? '-',
      subtitle: _asString(json['subtitle']) ?? '',
      // Backend mengirim path web; mobile memetakannya ke tabnya sendiri lewat
      // [targetTab].
      href: _asString(json['href']) ?? '',
      at: _asString(json['at']),
    );
  }

  final String type;
  final String title;
  final String subtitle;
  final String href;
  final String? at;

  /// Key tab mobile yang harus dibuka saat baris diketuk; null = modulnya
  /// belum tersedia di aplikasi mobile. Nilainya memakai key yang sama dengan
  /// destination bottom navigation `HomeShell`.
  /// Backend mengirim path web, jadi dipetakan manual. `/rencana-kirim` ikut
  /// diarahkan ke tab Check In karena di mobile itulah daftar rencana kirim
  /// (operator memindai PO di sana) — jauh lebih berguna daripada
  /// "segera hadir" padahal datanya memang sudah ada di aplikasi.
  String? get targetTab => switch (href) {
    '/gate' || '/rencana-kirim' => 'gate',
    '/validasi-sj' => 'validation',
    _ => null,
  };

  /// Halaman non-tab yang dibuka baris ini; null = tidak ada (modulnya belum
  /// tersedia di aplikasi mobile, atau memang tab tujuan seperti di atas).
  ///
  /// `recentActivity` backend mengirim `/standarisasi` untuk permintaan
  /// standarisasi baru — datanya sudah ada di aplikasi, jadi barisnya harus
  /// membuka halaman sungguhan, bukan "segera hadir".
  DashboardPage? get targetPage => switch (href) {
    '/standarisasi' => DashboardPage.standarisasi,
    _ => null,
  };
}

Map<String, dynamic> _asMap(Object? value) =>
    value is Map ? Map<String, dynamic>.from(value) : <String, dynamic>{};

/// Daftar yang aman: field yang Expected-nya bukan list tidak boleh membuat
/// parsing seluruh ringkasan gagal (backend/Proxy bisa mengembalikan bentuk
/// lain bila ada error di sisi lain).
List<Object?> _asList(Object? value) {
  return value is List ? value : const <Object?>[];
}

Map<String, int> _asIntMap(Object? value) {
  if (value is! Map) {
    return const <String, int>{};
  }
  return <String, int>{
    for (final entry in value.entries) '${entry.key}': _asInt(entry.value),
  };
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

double? _asDoubleOrNull(Object? value) {
  if (value == null) {
    return null;
  }
  if (value is num) {
    return value.toDouble();
  }
  return double.tryParse('$value');
}

String? _asString(Object? value) {
  if (value == null) {
    return null;
  }
  final text = '$value';
  return text.isEmpty ? null : text;
}
