import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import 'package:onezentra_mobile/core/theme/app_theme.dart';

/// Skala tipografi & komponen khusus layar **Opname Expired**.
///
/// Sengaja dipisah dari widget global (`shared/widgets/app_widgets.dart`)
/// supaya redesain cukup diubah di satu tempat dan **tidak** mempengaruhi
/// modul lain. Prinsipnya mengikuti Material 3 & Apple HIG: teks minimal
/// 11–12sp untuk label, 13–16sp untuk isi, angka metrik besar, dan satu
/// warna aksen per kartu — bukan teks 8–10px yang dipaksakan padat.
class OpType {
  OpType._();

  /// Angka/status besar (mis. total batch, persentase).
  static TextStyle display(BuildContext context) => GoogleFonts.roboto(
    fontSize: 26,
    fontWeight: FontWeight.w800,
    height: 1.1,
    letterSpacing: -0.5,
    color: context.colors.foreground,
  );

  /// Judul produk / judul layar — paling menonjol.
  static TextStyle title(BuildContext context) => GoogleFonts.roboto(
    fontSize: 18,
    fontWeight: FontWeight.w700,
    height: 1.25,
    color: context.colors.foreground,
  );

  /// Teks isi utama.
  static TextStyle body(BuildContext context) => GoogleFonts.roboto(
    fontSize: 15,
    fontWeight: FontWeight.w500,
    height: 1.35,
    color: context.colors.foreground,
  );

  /// Teks sekunder (deskripsi, nama depo, dll).
  static TextStyle secondary(BuildContext context) => GoogleFonts.roboto(
    fontSize: 13.5,
    fontWeight: FontWeight.w500,
    height: 1.35,
    color: context.colors.textSecondary,
  );

  /// Teks redup (hint, label kecil).
  static TextStyle muted(BuildContext context) => GoogleFonts.roboto(
    fontSize: 13,
    fontWeight: FontWeight.w400,
    height: 1.35,
    color: context.colors.textMuted,
  );

  /// Label huruf kapital kecil untuk header bagian.
  static TextStyle label(BuildContext context) => GoogleFonts.roboto(
    fontSize: 11.5,
    fontWeight: FontWeight.w800,
    letterSpacing: 0.6,
    color: context.colors.textMuted,
  );

  /// Angka metrik (nilai besar).
  static TextStyle metric(BuildContext context) => GoogleFonts.roboto(
    fontSize: 22,
    fontWeight: FontWeight.w800,
    height: 1.05,
    color: context.colors.foreground,
  );

  /// Kode/barcode (mono) — hanya untuk kode, bukan seluruh teks.
  static TextStyle code(BuildContext context) => GoogleFonts.robotoMono(
    fontSize: 14,
    fontWeight: FontWeight.w700,
    letterSpacing: 0.2,
    color: context.colors.foreground,
  );
}

/// Tone warna untuk [OpBadge] & aksen. Dipetakan ke token tema (well + teks
/// kontras + garis) sehingga konsisten di mode terang & gelap.
enum OpTone { success, warning, critical, danger, info, primary, neutral }

extension OpToneColors on OpTone {
  (Color background, Color foreground, Color border) resolve(ThemeColors c) =>
      switch (this) {
        OpTone.success => (c.successWell, c.successText, c.success),
        OpTone.warning => (c.warningWell, c.warningText, c.warning),
        OpTone.critical => (c.criticalWell, c.criticalText, c.critical),
        OpTone.danger => (c.dangerWell, c.dangerText, c.danger),
        OpTone.info => (c.infoWell, c.infoText, c.info),
        OpTone.primary => (
          c.primaryWell,
          c.primaryWellText,
          c.primaryWellBorder,
        ),
        OpTone.neutral => (c.gray100, c.gray700, c.gray300),
      };

  /// Warna solid untuk dot/ikon (lebih pekat dari foreground well).
  Color solid(ThemeColors c) => resolve(c).$3;
}

/// Tone risiko dari string status backend (EXPIRED/KRITIS/PERHATIAN/AMAN).
OpTone opToneForStatus(String status) => switch (status.trim().toUpperCase()) {
  'EXPIRED' => OpTone.danger,
  'KRITIS' => OpTone.critical,
  'PERHATIAN' => OpTone.warning,
  'AMAN' => OpTone.success,
  _ => OpTone.neutral,
};

IconData? opIconForStatus(String status) =>
    switch (status.trim().toUpperCase()) {
      'EXPIRED' => Icons.error_rounded,
      'KRITIS' => Icons.warning_amber_rounded,
      'PERHATIAN' => Icons.schedule_rounded,
      'AMAN' => Icons.check_circle_rounded,
      _ => null,
    };

/// Badge status dengan ukuran teks terbaca (11.5sp) — pengganti lokal
/// `AppBadge` yang memakai 9sp.
class OpBadge extends StatelessWidget {
  const OpBadge({
    required this.text,
    this.tone = OpTone.info,
    this.icon,
    super.key,
  });

  final String text;
  final OpTone tone;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    var (bg, fg, border) = tone.resolve(context.colors);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: AppTheme.radiusFull,
        border: Border.all(color: border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 13, color: fg),
            const SizedBox(width: 4),
          ],
          Text(
            text,
            style: GoogleFonts.roboto(
              fontSize: 11.5,
              fontWeight: FontWeight.w700,
              color: fg,
            ),
          ),
        ],
      ),
    );
  }
}

/// Kartu statistik besar: ikon + label di atas, angka besar di bawah.
class OpStat extends StatelessWidget {
  const OpStat({
    required this.label,
    required this.value,
    required this.tone,
    this.caption,
    super.key,
  });

  final String label;
  final String value;
  final OpTone tone;
  final String? caption;

  @override
  Widget build(BuildContext context) {
    var c = context.colors;
    return Container(
      padding: const EdgeInsets.all(AppTheme.space3),
      decoration: BoxDecoration(
        color: tone.resolve(c).$1,
        borderRadius: AppTheme.radiusLg,
        border: Border.all(color: tone.solid(c).withValues(alpha: 0.35)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Container(
                width: 7,
                height: 7,
                decoration: BoxDecoration(
                  color: tone.solid(c),
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.roboto(
                    fontSize: 11.5,
                    fontWeight: FontWeight.w700,
                    color: c.textMuted,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: OpType.metric(context),
          ),
          if (caption != null) ...[
            const SizedBox(height: 2),
            Text(
              caption!,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: GoogleFonts.roboto(
                fontSize: 11,
                fontWeight: FontWeight.w500,
                color: c.textMuted,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Metrik ringkas satu baris (ikon + label kecil di atas nilai).
class OpMiniStat extends StatelessWidget {
  const OpMiniStat({
    required this.label,
    required this.value,
    required this.tone,
    this.icon,
    super.key,
  });

  final String label;
  final String value;
  final OpTone tone;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    var c = context.colors;
    var solid = tone.solid(c);
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
        decoration: BoxDecoration(
          color: c.surfaceHover,
          borderRadius: AppTheme.radiusLg,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                if (icon != null) ...[
                  Icon(icon, size: 13, color: solid),
                  const SizedBox(width: 4),
                ],
                Flexible(
                  child: Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.roboto(
                      fontSize: 10.5,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.2,
                      color: c.textMuted,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 4),
            FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerLeft,
              child: Text(
                value,
                maxLines: 1,
                style: GoogleFonts.roboto(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  height: 1.1,
                  color: solid,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Label huruf kapital untuk memisah bagian dalam sebuah layar.
class OpSectionLabel extends StatelessWidget {
  const OpSectionLabel(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) => Text(
    text.toUpperCase(),
    style: GoogleFonts.roboto(
      fontSize: 11.5,
      fontWeight: FontWeight.w800,
      letterSpacing: 0.8,
      color: context.colors.textMuted,
    ),
  );
}
