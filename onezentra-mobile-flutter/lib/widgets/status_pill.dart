import 'package:flutter/material.dart';
import 'package:onezentra_mobile/theme/app_colors.dart';

/// Nada pill status. Web memakai pasangan `bg-*`/`text-*` (mis. pill
/// "bg-red-50 text-red-700"); mobile memakai enum agar pasangan warnanya
/// tidak bisa terbalik di satu widget.
enum PillTone {
  neutral,
  primary,
  success,
  warning,
  danger,
  info,
  blue,
  violet,
  orange,
}

extension PillToneColors on PillTone {
  Color get background => switch (this) {
    PillTone.neutral => AppColors.gray100,
    PillTone.primary => AppColors.primary50,
    PillTone.success => AppColors.successBg,
    PillTone.warning => AppColors.warningBg,
    PillTone.danger => AppColors.red50,
    PillTone.info => AppColors.sky50,
    PillTone.blue => AppColors.blue50,
    PillTone.violet => AppColors.violet50,
    PillTone.orange => AppColors.orange50,
  };

  Color get foreground => switch (this) {
    PillTone.neutral => AppColors.gray700,
    PillTone.primary => AppColors.primary700,
    PillTone.success => AppColors.success,
    PillTone.warning => AppColors.amber700,
    PillTone.danger => AppColors.red600,
    PillTone.info => AppColors.sky700,
    PillTone.blue => AppColors.blue700,
    PillTone.violet => AppColors.violet700,
    PillTone.orange => AppColors.orange700,
  };
}

/// Label kecil berbentuk kapsul untuk status/kategori.
///
/// [dot] dipakai untuk status lalu lintas proses (mis. riwayat gate) supaya
/// warna pill tidak sendirian yang membawa makna.
class StatusPill extends StatelessWidget {
  const StatusPill({
    super.key,
    required this.label,
    this.tone = PillTone.neutral,
    this.dot = false,
    this.icon,
  });

  final String label;
  final PillTone tone;
  final bool dot;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.symmetric(horizontal: dot ? 8 : 10, vertical: 5),
      decoration: BoxDecoration(
        color: tone.background,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (dot) ...[
            Container(
              width: 7,
              height: 7,
              decoration: BoxDecoration(
                color: tone.foreground,
                shape: BoxShape.circle,
              ),
            ),
            const SizedBox(width: 6),
          ],
          if (icon != null) ...[
            Icon(icon, size: 13, color: tone.foreground),
            const SizedBox(width: 4),
          ],
          // `Flexible` wajib: pill dipakai di dalam `Row` yang sempit (baris
          // aktivitas terbaru), dan tanpa itu teksnya memakai lebar tak
          // terbatas sehingga pill justru yang meluber keluar baris.
          Flexible(
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w800,
                color: tone.foreground,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
