import 'package:flutter/material.dart';
import 'package:onezentra_mobile/theme/app_colors.dart';
import 'package:onezentra_mobile/widgets/section_card.dart';

/// Warna solid kartu statistik per modul — padanan `iconBg` di
/// `DashboardStatCards.tsx` (`bg-amber-500`, `bg-sky-600`, …).
@immutable
class ModuleTone {
  const ModuleTone({
    required this.iconBackground,
    required this.tint,
    required this.foreground,
  });

  /// Warna kotak ikon (solid, ikon putih).
  final Color iconBackground;

  /// Warna latar kartu kosong / yang perlu perhatian.
  final Color tint;

  /// Warna angka & label saat kartu bernada peringatan.
  final Color foreground;

  static const amber = ModuleTone(
    iconBackground: AppColors.amber500,
    tint: AppColors.amber50,
    foreground: AppColors.amber700,
  );
  static const sky = ModuleTone(
    iconBackground: AppColors.sky600,
    tint: AppColors.sky50,
    foreground: AppColors.sky700,
  );
  static const emerald = ModuleTone(
    iconBackground: AppColors.emerald600,
    tint: AppColors.successBg,
    foreground: AppColors.success,
  );
  static const teal = ModuleTone(
    iconBackground: AppColors.teal600,
    tint: AppColors.teal50,
    foreground: AppColors.teal700,
  );
  static const indigo = ModuleTone(
    iconBackground: AppColors.indigo600,
    tint: AppColors.indigo50,
    foreground: AppColors.indigo700,
  );
  static const slate = ModuleTone(
    iconBackground: AppColors.gray400,
    tint: AppColors.gray50,
    foreground: AppColors.gray600,
  );
  static const danger = ModuleTone(
    iconBackground: AppColors.red600,
    tint: AppColors.red50,
    foreground: AppColors.red700,
  );
}

/// Kartu angka satu modul — padanan `StatCard` di web.
///
/// Tiga kondisi dibedakan secara visual, bukan hanya lewat teks:
/// [StatState.loading] (`…`), [StatState.failed] (`–` amber + border amber),
/// dan angka 0 yang diredupkan supaya operator tidak salah baca "sudah 0"
/// dengan "belum dimuat".
enum StatState { ready, loading, failed }

/// Kartu statistik modular: ikon berwarna + angka besar + label uppercase +
/// tren mingguan opsional.
class StatTile extends StatelessWidget {
  const StatTile({
    super.key,
    required this.label,
    required this.icon,
    required this.tone,
    this.value,
    this.valueText,
    this.delta,
    this.state = StatState.ready,
    this.onTap,
    this.hint,
    this.semanticLabel,
  });

  final String label;
  final IconData icon;
  final ModuleTone tone;
  final int? value;

  /// Teks angka yang sudah diformat — dipakai kartu peringatan yang
  /// nilainya bukan bilangan murni (mis. "3,5 jam"). Bila diisi, mengabaikan
  /// [value].
  final String? valueText;

  final int? delta;
  final StatState state;
  final VoidCallback? onTap;

  /// Baris kecil di bawah label (dipakai kartu peringatan: mis. "12 kritis").
  final String? hint;

  /// Label aksesibilitas; bila null, disusun dari label + nilai.
  final String? semanticLabel;

  bool get _isEmpty => state == StatState.ready && value == 0;

  @override
  Widget build(BuildContext context) {
    final failed = state == StatState.failed;
    final loading = state == StatState.loading;
    final dimmed = _isEmpty;
    final text = valueText ?? _formatNumber(value ?? 0);

    final valueColor = failed
        ? AppColors.amber600
        : dimmed
        ? AppColors.gray300
        : hint != null
        ? tone.foreground
        : AppColors.gray900;
    final labelColor = failed || dimmed
        ? AppColors.gray300
        : hint != null
        ? tone.foreground
        : AppColors.gray500;

    return SectionCard(
      onTap: onTap,
      padding: const EdgeInsets.all(14),
      color: dimmed ? AppColors.gray50 : AppColors.card,
      borderColor: failed ? AppColors.amber200 : AppColors.gray200,
      semanticLabel:
          semanticLabel ??
          '$label: '
              '${failed
                  ? 'data tidak tersedia'
                  : loading
                  ? 'memuat'
                  : text}',
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              // Kartu kosong diredupkan (ikon + latar), bukan diberi tanda
              // khusus, supaya deretan kartu "0" tetap terbaca sebagai data.
              color: dimmed
                  ? tone.iconBackground.withValues(alpha: 0.45)
                  : tone.iconBackground,
              borderRadius: BorderRadius.circular(AppRadius.chip),
            ),
            alignment: Alignment.center,
            child: Icon(icon, size: 20, color: Colors.white),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  switch (state) {
                    StatState.loading => '…',
                    StatState.failed => '–',
                    StatState.ready => text,
                  },
                  maxLines: 1,
                  style: TextStyle(
                    fontSize: 20,
                    height: 1.1,
                    fontWeight: FontWeight.w900,
                    fontFeatures: const [FontFeature.tabularFigures()],
                    color: valueColor,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  label.toUpperCase(),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 10.5,
                    height: 1.2,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.6,
                    color: labelColor,
                  ),
                ),
                if (hint != null) ...[
                  const SizedBox(height: 3),
                  Text(
                    hint!,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 11,
                      height: 1.25,
                      color: AppColors.gray500,
                    ),
                  ),
                ],
                if (!loading && !failed && (delta ?? 0) > 0) ...[
                  const SizedBox(height: 3),
                  Text(
                    '+${_formatNumber(delta!)} minggu ini',
                    style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: AppColors.success,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Angka dengan pemisah ribuan ala Indonesia (1.234) — `toLocaleString('id-ID')`
/// di web.
String _formatNumber(int value) {
  final digits = value.abs().toString();
  final buffer = StringBuffer(value < 0 ? '-' : '');
  for (var i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 == 0) {
      buffer.write('.');
    }
    buffer.write(digits[i]);
  }
  return buffer.toString();
}
