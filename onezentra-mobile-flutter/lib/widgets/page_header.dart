import 'package:flutter/material.dart';
import 'package:onezentra_mobile/theme/app_colors.dart';

/// Pita header gelap yang sama untuk setiap tab — padanan header kartu gelap
/// di web: `bg-slate-950` pada `dashboard/page.tsx` dan
/// `bg-linear-to-r from-gray-900 via-gray-900 to-gray-800` pada
/// `gate/page.tsx` serta `validasi-sj/page.tsx`.
///
/// Di web header itu kartu `rounded-2xl` di dalam halaman; di mobile ia jadi
/// pita full-bleed dengan sudut bawah membulat. Alasannya praktis: kartu inset
/// membuang tinggi layar yang precious di perangkat kecil, dan pita inilah yang
/// menyediakan ruang notch / status bar lewat
/// [MediaQuery.paddingOf] — sehingga semua tab punya bentuk, gradien, dan jarak
/// atas yang identik, bukan "AppBar di sini, hero penuh di sana".
///
/// [stats] memakai bentuk chip yang sama dengan web
/// (`rounded-full border-white/15 bg-white/10` + badge angka `tabular-nums`).
/// Angka yang gagal dimuat ditampilkan `—` dan yang sedang dimuat `…`,
/// aturan yang sama dengan kartu statistik: `0` palsu lebih berbahaya
/// daripada ruang kosong karena operator salah baca.
class PageHeader extends StatelessWidget {
  const PageHeader({
    super.key,
    required this.title,
    this.accent,
    this.subtitle,
    this.icon,
    this.iconSolid = false,
    this.leading,
    this.trailing,
    this.chips = const <HeaderChip>[],
    this.stats = const <HeaderStat>[],
    this.statsLoading = false,
    this.statsError,
    this.onStatsRetry,
  });

  /// Judul utama. Untuk Beranda ini sapaan tanpa nama, dan nama operator
  /// diletakkan di [accent] (web: `<span class="text-primary-300">`).
  final String title;

  /// Potongan warna aksen yang menyusul [title], mis. nama depan di Beranda.
  final String? accent;

  final String? subtitle;
  final IconData? icon;

  /// Web memakai dua gaya tile ikon di header: putih solid di dashboard
  /// (`bg-white text-slate-900`) dan transparan di halaman lain
  /// (`bg-white/10 text-primary-400`).
  final bool iconSolid;

  /// Tombol di kiri header (mis. panah kembali dari detail validasi).
  final Widget? leading;

  /// Aksi di kanan header (mis. "pindai dokumen lain").
  final Widget? trailing;

  /// Chip info non-angka: depot, role, dan sejenisnya.
  final List<HeaderChip> chips;

  /// Angka ringkasan modul, disusun dalam satu baris (wrap di layar sempit).
  final List<HeaderStat> stats;

  final bool statsLoading;
  final String? statsError;
  final VoidCallback? onStatsRetry;

  @override
  Widget build(BuildContext context) {
    final topInset = MediaQuery.paddingOf(context).top;
    return Container(
      width: double.infinity,
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [AppColors.gray900, AppColors.primary950],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.vertical(bottom: Radius.circular(24)),
      ),
      child: Padding(
        padding: EdgeInsets.fromLTRB(16, topInset + 12, 16, 20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (leading != null) ...[leading!, const SizedBox(width: 4)],
                if (icon != null) ...[
                  _IconTile(icon: icon!, solid: iconSolid),
                  const SizedBox(width: 12),
                ],
                Expanded(child: _titleBlock()),
                if (trailing != null) ...[const SizedBox(width: 8), trailing!],
              ],
            ),
            if (chips.isNotEmpty) ...[
              const SizedBox(height: 14),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [for (final chip in chips) chip.build()],
              ),
            ],
            if (stats.isNotEmpty) ...[
              const SizedBox(height: 14),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final stat in stats)
                    _StatChip(stat: stat, state: _state),
                ],
              ),
            ],
            if (statsError != null) ...[
              const SizedBox(height: 10),
              _StatsErrorRow(message: statsError!, onRetry: onStatsRetry),
            ],
          ],
        ),
      ),
    );
  }

  /// Tiga kondisi angka header disatukan di sini supaya semua tab memakai
  /// aturan yang sama, tanpa [_StatChip] perlu tahu detail state-nya.
  ({bool loading, bool failed}) get _state =>
      (loading: statsLoading, failed: statsError != null);

  Widget _titleBlock() {
    final style = const TextStyle(
      color: Colors.white,
      fontWeight: FontWeight.w800,
      fontSize: 20,
      height: 1.2,
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // `Text.rich` (bukan Row) supaya pemotongan ellipsis berlaku untuk
        // sapaan + nama sebagai satu kesatuan; nama depan yang panjang tidak
        // mendorong judul keluar header.
        Text.rich(
          TextSpan(
            children: [
              TextSpan(text: title),
              if (accent != null) TextSpan(text: ' $accent'),
            ],
            style: style,
          ),
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
        ),
        if (subtitle != null) ...[
          const SizedBox(height: 3),
          Text(
            subtitle!,
            style: const TextStyle(color: AppColors.gray300, fontSize: 12.5),
          ),
        ],
      ],
    );
  }
}

/// Chip info non-angka di header (depot, role) — bentuk `bg-white/10` yang
/// sama dengan chip web, hanya dengan ikon sebagai ganti titik.
class HeaderChip {
  const HeaderChip({required this.icon, required this.label});

  final IconData icon;
  final String label;

  Widget build() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 13, color: AppColors.primary400),
          const SizedBox(width: 6),
          // Nama depo bisa jauh lebih panjang dari lebar layar (mis. "Gudang
          // Pusat Surabaya"), jadi teks boleh menyusut dan dipotong, bukan
          // memaksa chip meluber keluar layar.
          Flexible(
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 12,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Angka ringkasan modul di header — padanan
/// `<span class="rounded-full border-white/15 bg-white/10">` + badge
/// `tabular-nums` di header web.
class HeaderStat {
  const HeaderStat({
    required this.label,
    required this.value,
    this.dot = Colors.white,
    this.badge,
    this.onBadge,
  });

  final String label;

  /// Angka siap tampil. [PageHeader] yang menggantinya dengan `…`/`—` saat
  /// masih memuat atau gagal, jadi angka palsuan tidak pernah tampil.
  final String value;

  final Color dot;

  /// Warna badge angka. Default putih transparan (`bg-white/20` di web).
  final Color? badge;
  final Color? onBadge;
}

class _StatChip extends StatelessWidget {
  const _StatChip({required this.stat, required this.state});

  final HeaderStat stat;
  final ({bool loading, bool failed}) state;

  @override
  Widget build(BuildContext context) {
    final value = state.failed
        ? '—'
        : state.loading
        ? '…'
        : stat.value;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: Colors.white.withValues(alpha: 0.15)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(color: stat.dot, shape: BoxShape.circle),
          ),
          const SizedBox(width: 6),
          Text(
            stat.label,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 12,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(width: 6),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
            decoration: BoxDecoration(
              color: stat.badge ?? Colors.white.withValues(alpha: 0.2),
              borderRadius: BorderRadius.circular(6),
            ),
            child: Text(
              value,
              style: TextStyle(
                color: stat.onBadge ?? Colors.white,
                fontSize: 11,
                fontWeight: FontWeight.w900,
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Baris kegagalan statistik: web menampilkan `stats?.x ?? 0` sehingga angka
/// gagal dimuat tampak sungguhan. Mobile menampilkan `—` plus alasannya, jadi
/// operator tidak mengambil keputusan berdasarkan angka yang tidak pernah ada.
class _StatsErrorRow extends StatelessWidget {
  const _StatsErrorRow({required this.message, this.onRetry});

  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Icon(Icons.info_outline, size: 15, color: AppColors.amber200),
        const SizedBox(width: 6),
        Expanded(
          child: Text(
            'Statistik gagal dimuat: $message',
            style: const TextStyle(color: AppColors.amber200, fontSize: 11.5),
          ),
        ),
        if (onRetry != null)
          TextButton(
            onPressed: onRetry,
            style: TextButton.styleFrom(
              foregroundColor: AppColors.amber200,
              minimumSize: const Size(0, 28),
              padding: const EdgeInsets.symmetric(horizontal: 8),
            ),
            child: const Text(
              'Coba lagi',
              style: TextStyle(fontWeight: FontWeight.w700),
            ),
          ),
      ],
    );
  }
}

class _IconTile extends StatelessWidget {
  const _IconTile({required this.icon, required this.solid});

  final IconData icon;
  final bool solid;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 48,
      height: 48,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: solid ? Colors.white : Colors.white.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(AppRadius.feature),
      ),
      child: Icon(
        icon,
        size: 24,
        color: solid ? AppColors.gray900 : AppColors.primary400,
      ),
    );
  }
}
