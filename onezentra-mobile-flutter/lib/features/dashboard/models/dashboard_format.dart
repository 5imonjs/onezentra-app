/// Format tanggal/waktu Bahasa Indonesia untuk Beranda.
///
/// Ditulis manual (bukan `intl`) supaya aplikasi tidak menambah dependency
/// hanya untuk nama hari & bulan — hasilnya tetap sama dengan
/// `toLocaleDateString('id-ID', …)` di web.
///
/// Angka dibulatkan ke bawah (seperti `Math.floor` versi web) jadi "baru saja"
/// berlaku sampai 59 detik, lalu langsung "1 mnt lalu".
library;

const _dayNames = <String>[
  'Senin',
  'Selasa',
  'Rabu',
  'Kamis',
  'Jumat',
  'Sabtu',
  'Minggu',
];

const _monthNames = <String>[
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

const _monthShortNames = <String>[
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

/// Sapaan sesuai jam — sama dengan `greetingFor` di
/// `dashboard/page.tsx`. Jam dibulatkan ke bawah terhadap tengah malam
/// (`DateTime.hour` sudah 0–23).
String greetingFor(int hour) {
  if (hour >= 4 && hour < 11) return 'Selamat pagi';
  if (hour >= 11 && hour < 15) return 'Selamat siang';
  if (hour >= 15 && hour < 18) return 'Selamat sore';
  return 'Selamat malam';
}

/// Tanggal panjang: "Sabtu, 26 September 2026" — padanan
/// `toLocaleDateString('id-ID', { weekday: 'long', … })` di web.
String formatLongDate(DateTime date) {
  final local = date.toLocal();
  return '${_dayNames[local.weekday - 1]}, ${local.day} '
      '${_monthNames[local.month - 1]} ${local.year}';
}

/// Waktu relatif untuk aktivitas terbaru — padanan `formatRelativeTime` di
/// `dashboardSummary.ts`. String kosong bila timestamp kosong/tidak valid.
String formatRelativeTime(String? iso, {DateTime? now}) {
  if (iso == null || iso.isEmpty) {
    return '';
  }
  final parsed = DateTime.tryParse(iso);
  if (parsed == null) {
    return '';
  }
  final reference = now ?? DateTime.now();
  final diff = reference.difference(parsed);
  if (diff.isNegative) {
    // Timestamp di masa depan (jam perangkat salah atau data belum sinkron) —
    // jangan tampilkan "−5 mnt lalu".
    return 'baru saja';
  }
  final minutes = diff.inMinutes;
  if (minutes < 1) {
    return 'baru saja';
  }
  if (minutes < 60) {
    return '$minutes mnt lalu';
  }
  final hours = diff.inHours;
  if (hours < 24) {
    return '$hours jam lalu';
  }
  final days = diff.inDays;
  if (days < 7) {
    return '$days hari lalu';
  }
  final local = parsed.toLocal();
  return '${local.day} ${_monthShortNames[local.month - 1]} ${local.year}';
}
