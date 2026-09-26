import 'package:flutter/material.dart';
import 'package:onezentra_mobile/theme/app_colors.dart';
import 'package:onezentra_mobile/widgets/pressable.dart';

/// Kartu putih standar aplikasi — padanan `rounded-2xl bg-white border
/// border-gray-100` yang dipakai web di setiap halaman.
///
/// Tanpa [onTap] kartu hanya menampilkan isi (statistik, ringkasan); dengan
/// [onTap] kartu jadi target sentuh lewat [Pressable] sehingga ripple-nya
/// mengikuti bentuk kartu, bukan kotak persegi.
class SectionCard extends StatelessWidget {
  const SectionCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.onTap,
    this.color = AppColors.card,
    this.borderColor = AppColors.gray200,
    this.radius = AppRadius.panel,
    this.semanticLabel,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;
  final Color color;
  final Color borderColor;
  final double radius;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final borderRadius = BorderRadius.circular(radius);
    final body = Padding(padding: padding, child: child);

    if (onTap == null) {
      return _StaticCard(
        color: color,
        borderRadius: borderRadius,
        borderColor: borderColor,
        child: body,
      );
    }
    return Pressable(
      color: color,
      borderRadius: borderRadius,
      border: BorderSide(color: borderColor),
      semanticLabel: semanticLabel,
      onTap: onTap!,
      child: body,
    );
  }
}

class _StaticCard extends StatelessWidget {
  const _StaticCard({
    required this.color,
    required this.borderRadius,
    required this.borderColor,
    required this.child,
  });

  final Color color;
  final BorderRadius borderRadius;
  final Color borderColor;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: color,
        borderRadius: borderRadius,
        border: Border.all(color: borderColor),
      ),
      child: child,
    );
  }
}

/// Kepala kartu: judul, keterangan, dan aksi kanan (chip jumlah/link).
///
/// Judul memakai warna `gray-900` dan keterangan `gray-500` — sama seperti
/// header kartu web (`text-lg font-semibold text-gray-900` + subjudul
/// `text-sm text-gray-500`).
class SectionHeader extends StatelessWidget {
  const SectionHeader({
    super.key,
    required this.title,
    this.subtitle,
    this.trailing,
    this.icon,
  });

  final String title;
  final String? subtitle;
  final Widget? trailing;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 12),
      child: Row(
        children: [
          if (icon != null) ...[
            Icon(icon, size: 18, color: AppColors.primary600),
            const SizedBox(width: 8),
          ],
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    color: AppColors.gray900,
                  ),
                ),
                if (subtitle != null) ...[
                  const SizedBox(height: 2),
                  Text(
                    subtitle!,
                    style: const TextStyle(
                      fontSize: 12.5,
                      color: AppColors.gray500,
                    ),
                  ),
                ],
              ],
            ),
          ),
          if (trailing != null) ...[const SizedBox(width: 8), trailing!],
        ],
      ),
    );
  }
}

/// Label kategori di atas sekelompok kartu — `text-[11px] uppercase
/// tracking-widest text-slate-400` di web.
class SectionLabel extends StatelessWidget {
  const SectionLabel(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 0, 4, 8),
      child: Text(
        text.toUpperCase(),
        style: const TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          letterSpacing: 1.2,
          color: AppColors.gray400,
        ),
      ),
    );
  }
}
