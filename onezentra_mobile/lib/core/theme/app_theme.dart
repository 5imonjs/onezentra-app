// JANGAN dihapus: Flutter 3.47 (dipakai CI) memindahkan
// CupertinoPageTransitionsBuilder dari material lib ke cupertino lib, jadi
// import ini wajib untuk kompilasi CI walau analyzer lokal (Flutter 3.41)
// menandainya "unnecessary" karena material lokal masih re-export.
// ignore: unnecessary_import
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Theme-aware color extension. Use via `Theme.of(context).extension<ThemeColors>()`
/// or, singkatnya, `context.colors`.
///
/// In light mode, text colors are dark; in dark mode, they are light.
/// This allows widgets to use theme-aware colors instead of static AppTheme
/// constants that don't change between themes.
///
/// Token yang memang harus sama di kedua mode dideklarasikan di class
/// [AppTheme] (primary/accent brand, panel ink selalu-gelap, radius,
/// spacing, shadow). Semua token di class ini berubah mengikuti tema.
class ThemeColors extends ThemeExtension<ThemeColors> {
  // ignore: sort_constructors_first
  const ThemeColors({
    required this.gray50,
    required this.gray100,
    required this.gray200,
    required this.gray300,
    required this.gray400,
    required this.gray500,
    required this.gray600,
    required this.gray700,
    required this.gray800,
    required this.gray900,
    required this.surface,
    required this.surfaceCard,
    required this.surfaceHover,
    required this.border,
    required this.textPrimary,
    required this.textSecondary,
    required this.textMuted,
    required this.background,
    required this.foreground,
    required this.success,
    required this.successText,
    required this.successWell,
    required this.warning,
    required this.warningText,
    required this.warningWell,
    required this.warningDark,
    required this.danger,
    required this.dangerText,
    required this.dangerWell,
    required this.info,
    required this.infoText,
    required this.infoWell,
    required this.primaryWell,
    required this.primaryWellText,
    required this.primaryWellBorder,
  });

  final Color gray50;
  final Color gray100;
  final Color gray200;
  final Color gray300;
  final Color gray400;
  final Color gray500;
  final Color gray600;
  final Color gray700;
  final Color gray800;
  final Color gray900;
  final Color surface;
  final Color surfaceCard;
  final Color surfaceHover;
  final Color border;
  final Color textPrimary;
  final Color textSecondary;
  final Color textMuted;
  final Color background;
  final Color foreground;

  // --- Semantic status tokens (theme-aware, kontras di kedua mode) -------
  // Warna solid untuk bar, dot dan state aktif — identik di dua mode.
  final Color success;
  final Color successText;
  final Color warning;
  final Color warningText;
  final Color danger;
  final Color dangerText;
  final Color info;
  final Color infoText;

  // Sumur status yang di-tint (padanan `bg-*-50` di web):
  // dark = well gelap dengan teks pastel; light = well pastel muda
  // dengan teks gelap yang kontras.
  final Color successWell;
  final Color warningWell;
  final Color dangerWell;
  final Color infoWell;

  // Tone chip lebih dalam untuk ikon di dalam box notice yang sudah
  // di-tint (agar chip tidak hilang menyatu dengan outline box).
  final Color warningDark;

  // Sumur badge varian primary: dark = navy ink; light = indigo muda.
  final Color primaryWell;
  final Color primaryWellText;
  final Color primaryWellBorder;

  static const dark = ThemeColors(
    gray50: Color(0xFF0A0F1C),
    gray100: Color(0xFF0F172A),
    gray200: Color(0xFF162033),
    gray300: Color(0xFF24324A),
    gray400: Color(0xFF64748B),
    gray500: Color(0xFF94A3B8),
    gray600: Color(0xFFC3CEDD),
    gray700: Color(0xFFE2E8F0),
    gray800: Color(0xFFF1F5F9),
    gray900: Color(0xFFFFFFFF),
    surface: Color(0xFF0F172A),
    surfaceCard: Color(0xFF162033),
    surfaceHover: Color(0xFF1D2942),
    border: Color(0xFF24324A),
    textPrimary: Color(0xFFF1F5F9),
    textSecondary: Color(0xFFE2E8F0),
    textMuted: Color(0xFF94A3B8),
    background: Color(0xFF0F172A),
    foreground: Color(0xFFF1F5F9),
    success: Color(0xFF10B981),
    successText: Color(0xFFA7F3D0),
    successWell: Color(0xFF052E21),
    warning: Color(0xFFF59E0B),
    warningText: Color(0xFFFDE68A),
    warningWell: Color(0xFF2B1A03),
    warningDark: Color(0xFF451A03),
    danger: Color(0xFFEF4444),
    dangerText: Color(0xFFFECACA),
    dangerWell: Color(0xFF2C0A0E),
    info: Color(0xFF3B82F6),
    infoText: Color(0xFFBFDBFE),
    infoWell: Color(0xFF0A1A33),
    primaryWell: Color(0xFF1E1B4B),
    primaryWellText: Color(0xFFC7D2FE),
    primaryWellBorder: Color(0xFF4338CA),
  );

  static const light = ThemeColors(
    gray50: Color(0xFFF8FAFC),
    gray100: Color(0xFFF1F5F9),
    gray200: Color(0xFFE2E8F0),
    gray300: Color(0xFFCBD5E1),
    gray400: Color(0xFF94A3B8),
    gray500: Color(0xFF64748B),
    gray600: Color(0xFF475569),
    gray700: Color(0xFF334155),
    gray800: Color(0xFF1E293B),
    gray900: Color(0xFF0F172A),
    surface: Color(0xFFF1F5F9),
    surfaceCard: Color(0xFFFFFFFF),
    surfaceHover: Color(0xFFF8FAFC),
    border: Color(0xFFCBD5E1),
    textPrimary: Color(0xFF0F172A),
    textSecondary: Color(0xFF1E293B),
    textMuted: Color(0xFF64748B),
    background: Color(0xFFF1F5F9),
    foreground: Color(0xFF0F172A),
    success: Color(0xFF10B981),
    successText: Color(0xFF065F46),
    successWell: Color(0xFFECFDF5),
    warning: Color(0xFFF59E0B),
    warningText: Color(0xFF92400E),
    warningWell: Color(0xFFFFFBEB),
    warningDark: Color(0xFFFDE68A),
    danger: Color(0xFFEF4444),
    dangerText: Color(0xFFB91C1C),
    dangerWell: Color(0xFFFEF2F2),
    info: Color(0xFF3B82F6),
    infoText: Color(0xFF1E40AF),
    infoWell: Color(0xFFEFF6FF),
    primaryWell: Color(0xFFE0E7FF),
    primaryWellText: Color(0xFF4338CA),
    primaryWellBorder: Color(0xFFA5B4FC),
  );

  @override
  ThemeColors copyWith({
    Color? gray50,
    Color? gray100,
    Color? gray200,
    Color? gray300,
    Color? gray400,
    Color? gray500,
    Color? gray600,
    Color? gray700,
    Color? gray800,
    Color? gray900,
    Color? surface,
    Color? surfaceCard,
    Color? surfaceHover,
    Color? border,
    Color? textPrimary,
    Color? textSecondary,
    Color? textMuted,
    Color? background,
    Color? foreground,
    Color? success,
    Color? successText,
    Color? successWell,
    Color? warning,
    Color? warningText,
    Color? warningWell,
    Color? warningDark,
    Color? danger,
    Color? dangerText,
    Color? dangerWell,
    Color? info,
    Color? infoText,
    Color? infoWell,
    Color? primaryWell,
    Color? primaryWellText,
    Color? primaryWellBorder,
  }) => ThemeColors(
    gray50: gray50 ?? this.gray50,
    gray100: gray100 ?? this.gray100,
    gray200: gray200 ?? this.gray200,
    gray300: gray300 ?? this.gray300,
    gray400: gray400 ?? this.gray400,
    gray500: gray500 ?? this.gray500,
    gray600: gray600 ?? this.gray600,
    gray700: gray700 ?? this.gray700,
    gray800: gray800 ?? this.gray800,
    gray900: gray900 ?? this.gray900,
    surface: surface ?? this.surface,
    surfaceCard: surfaceCard ?? this.surfaceCard,
    surfaceHover: surfaceHover ?? this.surfaceHover,
    border: border ?? this.border,
    textPrimary: textPrimary ?? this.textPrimary,
    textSecondary: textSecondary ?? this.textSecondary,
    textMuted: textMuted ?? this.textMuted,
    background: background ?? this.background,
    foreground: foreground ?? this.foreground,
    success: success ?? this.success,
    successText: successText ?? this.successText,
    successWell: successWell ?? this.successWell,
    warning: warning ?? this.warning,
    warningText: warningText ?? this.warningText,
    warningWell: warningWell ?? this.warningWell,
    warningDark: warningDark ?? this.warningDark,
    danger: danger ?? this.danger,
    dangerText: dangerText ?? this.dangerText,
    dangerWell: dangerWell ?? this.dangerWell,
    info: info ?? this.info,
    infoText: infoText ?? this.infoText,
    infoWell: infoWell ?? this.infoWell,
    primaryWell: primaryWell ?? this.primaryWell,
    primaryWellText: primaryWellText ?? this.primaryWellText,
    primaryWellBorder: primaryWellBorder ?? this.primaryWellBorder,
  );

  @override
  ThemeColors lerp(ThemeColors? other, double t) {
    if (other == null) {
      return this;
    }
    return ThemeColors(
      gray50: Color.lerp(gray50, other.gray50, t)!,
      gray100: Color.lerp(gray100, other.gray100, t)!,
      gray200: Color.lerp(gray200, other.gray200, t)!,
      gray300: Color.lerp(gray300, other.gray300, t)!,
      gray400: Color.lerp(gray400, other.gray400, t)!,
      gray500: Color.lerp(gray500, other.gray500, t)!,
      gray600: Color.lerp(gray600, other.gray600, t)!,
      gray700: Color.lerp(gray700, other.gray700, t)!,
      gray800: Color.lerp(gray800, other.gray800, t)!,
      gray900: Color.lerp(gray900, other.gray900, t)!,
      surface: Color.lerp(surface, other.surface, t)!,
      surfaceCard: Color.lerp(surfaceCard, other.surfaceCard, t)!,
      surfaceHover: Color.lerp(surfaceHover, other.surfaceHover, t)!,
      border: Color.lerp(border, other.border, t)!,
      textPrimary: Color.lerp(textPrimary, other.textPrimary, t)!,
      textSecondary: Color.lerp(textSecondary, other.textSecondary, t)!,
      textMuted: Color.lerp(textMuted, other.textMuted, t)!,
      background: Color.lerp(background, other.background, t)!,
      foreground: Color.lerp(foreground, other.foreground, t)!,
      success: Color.lerp(success, other.success, t)!,
      successText: Color.lerp(successText, other.successText, t)!,
      successWell: Color.lerp(successWell, other.successWell, t)!,
      warning: Color.lerp(warning, other.warning, t)!,
      warningText: Color.lerp(warningText, other.warningText, t)!,
      warningWell: Color.lerp(warningWell, other.warningWell, t)!,
      warningDark: Color.lerp(warningDark, other.warningDark, t)!,
      danger: Color.lerp(danger, other.danger, t)!,
      dangerText: Color.lerp(dangerText, other.dangerText, t)!,
      dangerWell: Color.lerp(dangerWell, other.dangerWell, t)!,
      info: Color.lerp(info, other.info, t)!,
      infoText: Color.lerp(infoText, other.infoText, t)!,
      infoWell: Color.lerp(infoWell, other.infoWell, t)!,
      primaryWell: Color.lerp(primaryWell, other.primaryWell, t)!,
      primaryWellText: Color.lerp(primaryWellText, other.primaryWellText, t)!,
      primaryWellBorder: Color.lerp(
        primaryWellBorder,
        other.primaryWellBorder,
        t,
      )!,
    );
  }
}

/// Ringkas akses token warna theme-aware: `context.colors.textMuted`
/// alih-alih `Theme.of(context).extension<ThemeColors>()?.textMuted`.
///
/// Wajib dipakai di dalam widget `BuildContext` yang punya akses tema.
/// Untuk warna yang memang harus sama di kedua mode (panel ink
/// selalu-gelap, brand primary/accent, radius, spacing) tetap memakai
/// konstanta `AppTheme.*` yang statis.
extension ThemeColorsOnContext on BuildContext {
  /// Token warna untuk brightness tema saat ini.
  ///
  /// Jika `ThemeData` tidak membawa `ThemeColors` (mis. tema bawaan
  /// Flutter pada test), kembali ke ramp yang sesuai brightness agar
  /// helper ini tidak pernah null.
  ThemeColors get colors {
    var ext = Theme.of(this).extension<ThemeColors>();
    if (ext != null) {
      return ext;
    }
    return Theme.of(this).brightness == Brightness.dark
        ? ThemeColors.dark
        : ThemeColors.light;
  }
}

class AppTheme {
  // Primary Colors (Indigo) — brand identity, identical in both themes.
  static const Color primary50 = Color(0xFFEEF2FF);
  static const Color primary100 = Color(0xFFE0E7FF);
  static const Color primary200 = Color(0xFFC7D2FE);
  static const Color primary300 = Color(0xFFA5B4FC);
  static const Color primary400 = Color(0xFF818CF8);
  static const Color primary500 = Color(0xFF6366F1);
  static const Color primary600 = Color(0xFF4F46E5);
  static const Color primary700 = Color(0xFF4338CA);
  static const Color primary800 = Color(0xFF3730A3);
  static const Color primary900 = Color(0xFF312E81);
  static const Color primary950 = Color(0xFF1E1B4B);

  // Accent Colors (Teal) — brand identity, identical in both themes.
  static const Color accent400 = Color(0xFF2DD4BF);
  static const Color accent500 = Color(0xFF14B8A6);

  // --- Dark palette (defaults) -------------------------------------------
  // These static consts are the dark aurora values and are what the rest of
  // the app references. A light theme supplies its own ramp via the
  // brightness-aware getters below.
  static const Color surface = Color(0xFF0F172A);
  static const Color surfaceCard = Color(0xFF162033);
  static const Color surfaceHover = Color(0xFF1D2942);

  // Gray Scale — inverted to match the web ramp, so `gray50` is the deepest
  // surface and `gray900` the brightest text. `gray400`–`gray600` stay in the
  // mid band because that is where muted body text lives.
  static const Color gray50 = Color(0xFF0A0F1C);
  static const Color gray100 = Color(0xFF0F172A);
  static const Color gray200 = Color(0xFF162033);
  static const Color gray300 = Color(0xFF24324A);
  static const Color gray400 = Color(0xFF64748B);
  static const Color gray500 = Color(0xFF94A3B8);
  static const Color gray600 = Color(0xFFC3CEDD);
  static const Color gray700 = Color(0xFFE2E8F0);
  static const Color gray800 = Color(0xFFF1F5F9);
  static const Color gray900 = Color(0xFFFFFFFF);

  // Semantic Colors — solid tones for bars, dots and active states. The
  // readable "on well" variants live in [successText] & friends.
  static const Color success = Color(0xFF10B981);
  static const Color warning = Color(0xFFF59E0B);
  static const Color danger = Color(0xFFEF4444);
  static const Color info = Color(0xFF3B82F6);

  // Readable status text/icon tones for use on the dark tinted wells below.
  static const Color successText = Color(0xFFA7F3D0);
  static const Color warningText = Color(0xFFFDE68A);
  static const Color dangerText = Color(0xFFFECACA);
  static const Color infoText = Color(0xFFBFDBFE);

  // Deeper well shade for the icon chip inside an already-tinted notice box,
  // where the outer tint alone would leave the chip invisible.
  static const Color warningDark = Color(0xFF451A03);

  // Tinted status wells (the mobile equivalent of `bg-*-50` on the web).
  static const Color successWell = Color(0xFF052E21);
  static const Color warningWell = Color(0xFF2B1A03);
  static const Color dangerWell = Color(0xFF2C0A0E);
  static const Color infoWell = Color(0xFF0A1A33);

  // Background — dark-first to match the web app's aurora canvas.
  static const Color background = Color(0xFF0F172A);
  static const Color foreground = Color(0xFFF1F5F9);

  // Always-dark panels: hero headers, modal headers, dark buttons. Mirrors
  // the web `ink` scale — these stay dark regardless of brightness.
  static const Color ink800 = Color(0xFF16203A);
  static const Color ink900 = Color(0xFF0F172A);
  static const Color ink950 = Color(0xFF080D18);

  // Focus Ring
  static const Color focusRing = primary600;
  static const Color focusRingLight = Color(0xFFFFFFFF);

  // Shadows
  static const BoxShadow shadowSm = BoxShadow(
    color: Color(0x0A000000),
    offset: Offset(0, 1),
    blurRadius: 2,
  );

  static const BoxShadow shadowMd = BoxShadow(
    color: Color(0x0F000000),
    offset: Offset(0, 4),
    blurRadius: 6,
  );

  static const BoxShadow shadowLg = BoxShadow(
    color: Color(0x14000000),
    offset: Offset(0, 10),
    blurRadius: 15,
  );

  static const BoxShadow shadowXl = BoxShadow(
    color: Color(0x1A000000),
    offset: Offset(0, 20),
    blurRadius: 25,
  );

  static const BoxShadow shadowPrimary = BoxShadow(
    color: Color(0x334F46E5),
    offset: Offset(0, 10),
    blurRadius: 40,
  );

  static const BoxShadow shadowPrimaryHover = BoxShadow(
    color: Color(0x4D4F46E5),
    offset: Offset(0, 15),
    blurRadius: 50,
  );

  // Border Radius
  static const BorderRadius radiusSm = BorderRadius.all(Radius.circular(6));
  static const BorderRadius radiusMd = BorderRadius.all(Radius.circular(8));
  static const BorderRadius radiusLg = BorderRadius.all(Radius.circular(12));
  static const BorderRadius radiusXl = BorderRadius.all(Radius.circular(16));
  static const BorderRadius radius2xl = BorderRadius.all(Radius.circular(24));
  static const BorderRadius radiusFull = BorderRadius.all(
    Radius.circular(9999),
  );

  // Spacing
  static const double space1 = 4;
  static const double space2 = 8;
  static const double space3 = 12;
  static const double space4 = 16;
  static const double space5 = 20;
  static const double space6 = 24;
  static const double space8 = 32;
  static const double space10 = 40;
  static const double space12 = 48;
  static const double space16 = 64;

  // Text Styles — dibangun per-brightness: tone teks mengikuti tema
  // (`ThemeColors`), bukan lagi ramp dark statis yang membuat teks putih
  // tak terbaca di atas permukaan terang.
  static TextTheme _textTheme({
    required Color fg,
    required Color primary,
    required Color secondary,
    required Color muted,
  }) => GoogleFonts.robotoTextTheme().copyWith(
    displayLarge: GoogleFonts.roboto(
      fontSize: 30,
      fontWeight: FontWeight.w700,
      height: 36 / 30,
      letterSpacing: -0.5,
      color: fg,
    ),
    displayMedium: GoogleFonts.roboto(
      fontSize: 24,
      fontWeight: FontWeight.w700,
      height: 32 / 24,
      letterSpacing: -0.3,
      color: fg,
    ),
    displaySmall: GoogleFonts.roboto(
      fontSize: 20,
      fontWeight: FontWeight.w700,
      height: 28 / 20,
      letterSpacing: -0.2,
      color: fg,
    ),
    headlineLarge: GoogleFonts.roboto(
      fontSize: 18,
      fontWeight: FontWeight.w600,
      height: 28 / 18,
      color: fg,
    ),
    headlineMedium: GoogleFonts.roboto(
      fontSize: 16,
      fontWeight: FontWeight.w600,
      height: 24 / 16,
      color: fg,
    ),
    headlineSmall: GoogleFonts.roboto(
      fontSize: 14,
      fontWeight: FontWeight.w600,
      height: 20 / 14,
      color: fg,
    ),
    titleLarge: GoogleFonts.roboto(
      fontSize: 14,
      fontWeight: FontWeight.w600,
      height: 20 / 14,
      color: primary,
    ),
    titleMedium: GoogleFonts.roboto(
      fontSize: 12,
      fontWeight: FontWeight.w600,
      height: 16 / 12,
      letterSpacing: 0.5,
      color: muted,
    ),
    titleSmall: GoogleFonts.roboto(
      fontSize: 12,
      fontWeight: FontWeight.w500,
      height: 16 / 12,
      color: secondary,
    ),
    bodyLarge: GoogleFonts.roboto(
      fontSize: 16,
      fontWeight: FontWeight.w400,
      height: 24 / 16,
      color: primary,
    ),
    bodyMedium: GoogleFonts.roboto(
      fontSize: 14,
      fontWeight: FontWeight.w400,
      height: 20 / 14,
      color: secondary,
    ),
    bodySmall: GoogleFonts.roboto(
      fontSize: 12,
      fontWeight: FontWeight.w400,
      height: 16 / 12,
      color: muted,
    ),
    labelLarge: GoogleFonts.roboto(
      fontSize: 14,
      fontWeight: FontWeight.w500,
      height: 20 / 14,
      color: primary,
    ),
    labelMedium: GoogleFonts.roboto(
      fontSize: 12,
      fontWeight: FontWeight.w500,
      height: 16 / 12,
      color: secondary,
    ),
    labelSmall: GoogleFonts.roboto(
      fontSize: 10,
      fontWeight: FontWeight.w500,
      height: 14 / 10,
      letterSpacing: 0.5,
      color: muted,
    ),
  );

  /// Tone teks per-brightness. `primary` = tone teks kuat (judul isi),
  /// `secondary` = tone isi tubuh, `muted` = tone redup (hint, label kecil).
  static (TextTheme, ThemeColors) _tones(Brightness b) {
    var c = b == Brightness.dark ? ThemeColors.dark : ThemeColors.light;
    var t = _textTheme(
      fg: c.foreground,
      primary: b == Brightness.dark ? c.gray700 : c.gray800,
      secondary: b == Brightness.dark ? c.gray600 : c.gray700,
      muted: c.gray500,
    );
    return (t, c);
  }

  /// Getter kompatibilitas: panel selalu-gelap & kode lama masih pakai ini.
  /// Jangan dipakai untuk tema terang — tone-nya untuk mode gelap.
  static TextTheme get textTheme => _textThemeFor(Brightness.dark);

  static TextTheme _textThemeFor(Brightness b) => _tones(b).$1;

  // Input Decoration Theme
  static InputDecorationTheme _inputDecorationTheme(
    ThemeColors c,
    TextTheme t,
  ) => InputDecorationTheme(
    filled: true,
    fillColor: c.surfaceCard,
    contentPadding: const EdgeInsets.symmetric(
      horizontal: space4,
      vertical: space3,
    ),
    border: OutlineInputBorder(
      borderRadius: radiusXl,
      borderSide: BorderSide(color: c.border),
    ),
    enabledBorder: OutlineInputBorder(
      borderRadius: radiusXl,
      borderSide: BorderSide(color: c.border),
    ),
    focusedBorder: const OutlineInputBorder(
      borderRadius: radiusXl,
      borderSide: BorderSide(color: primary500, width: 2),
    ),
    errorBorder: OutlineInputBorder(
      borderRadius: radiusXl,
      borderSide: BorderSide(color: c.danger),
    ),
    focusedErrorBorder: OutlineInputBorder(
      borderRadius: radiusXl,
      borderSide: BorderSide(color: c.danger, width: 2),
    ),
    disabledBorder: OutlineInputBorder(
      borderRadius: radiusXl,
      borderSide: BorderSide(color: c.border),
    ),
    labelStyle: t.bodyMedium,
    hintStyle: t.bodyMedium?.copyWith(color: c.gray400),
    errorStyle: t.bodySmall?.copyWith(color: c.danger),
    floatingLabelBehavior: FloatingLabelBehavior.auto,
    prefixIconColor: c.gray400,
    suffixIconColor: c.gray400,
  );

  // Elevated Button Theme
  static ElevatedButtonThemeData _elevatedButtonTheme(TextTheme t) =>
      ElevatedButtonThemeData(
        style:
            ElevatedButton.styleFrom(
              backgroundColor: primary600,
              foregroundColor: Colors.white,
              elevation: 4,
              shadowColor: primary600.withValues(alpha: 0.3),
              shape: const RoundedRectangleBorder(borderRadius: radiusXl),
              padding: const EdgeInsets.symmetric(
                horizontal: space6,
                vertical: space3,
              ),
              textStyle: t.labelLarge?.copyWith(fontWeight: FontWeight.w600),
              minimumSize: const Size(double.infinity, 52),
            ).copyWith(
              overlayColor: WidgetStateProperty.resolveWith<Color?>((
                Set<WidgetState> states,
              ) {
                if (states.contains(WidgetState.pressed)) {
                  return Colors.white.withValues(alpha: 0.1);
                }
                if (states.contains(WidgetState.hovered)) {
                  return Colors.white.withValues(alpha: 0.05);
                }
                return null;
              }),
            ),
      );

  // Outlined Button Theme
  static OutlinedButtonThemeData _outlinedButtonTheme(
    ThemeColors c,
    TextTheme t,
  ) => OutlinedButtonThemeData(
    style:
        OutlinedButton.styleFrom(
          foregroundColor: t.titleLarge?.color,
          backgroundColor: c.surfaceCard,
          side: BorderSide(color: c.border),
          shape: const RoundedRectangleBorder(borderRadius: radiusXl),
          padding: const EdgeInsets.symmetric(
            horizontal: space6,
            vertical: space3,
          ),
          textStyle: t.labelLarge?.copyWith(fontWeight: FontWeight.w500),
          minimumSize: const Size(double.infinity, 52),
        ).copyWith(
          overlayColor: WidgetStateProperty.resolveWith<Color?>((
            Set<WidgetState> states,
          ) {
            if (states.contains(WidgetState.pressed)) {
              return c.gray100;
            }
            if (states.contains(WidgetState.hovered)) {
              return c.gray100;
            }
            return null;
          }),
        ),
  );

  // Text Button Theme
  static TextButtonThemeData _textButtonTheme(Brightness b, ThemeColors c) =>
      TextButtonThemeData(
        style:
            TextButton.styleFrom(
              foregroundColor: b == Brightness.dark ? primary400 : primary600,
              shape: const RoundedRectangleBorder(borderRadius: radiusLg),
              padding: const EdgeInsets.symmetric(
                horizontal: space3,
                vertical: space2,
              ),
            ).copyWith(
              overlayColor: WidgetStateProperty.resolveWith<Color?>((
                Set<WidgetState> states,
              ) {
                var pressed =
                    states.contains(WidgetState.pressed) ||
                    states.contains(WidgetState.hovered);
                if (!pressed) {
                  return null;
                }
                return c.primaryWell.withValues(alpha: 0.7);
              }),
            ),
      );

  // Card Theme
  static CardThemeData _cardTheme(ThemeColors c) => CardThemeData(
    color: c.surfaceCard,
    elevation: 0,
    shape: RoundedRectangleBorder(
      borderRadius: radius2xl,
      side: BorderSide(color: c.border),
    ),
    shadowColor: Colors.black.withValues(alpha: 0.05),
    margin: EdgeInsets.zero,
  );

  // Checkbox Theme
  static CheckboxThemeData _checkboxTheme(ThemeColors c) => CheckboxThemeData(
    fillColor: WidgetStateProperty.resolveWith<Color?>((
      Set<WidgetState> states,
    ) {
      if (states.contains(WidgetState.selected)) {
        return primary600;
      }
      return Colors.transparent;
    }),
    checkColor: WidgetStateProperty.all(Colors.white),
    side: BorderSide(color: c.border, width: 1.5),
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
    materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
  );

  // Radio Theme
  static RadioThemeData _radioTheme(ThemeColors c) => RadioThemeData(
    fillColor: WidgetStateProperty.resolveWith<Color?>((
      Set<WidgetState> states,
    ) {
      if (states.contains(WidgetState.selected)) {
        return primary600;
      }
      return c.gray400;
    }),
  );

  // Switch Theme
  static SwitchThemeData _switchTheme(ThemeColors c) => SwitchThemeData(
    thumbColor: WidgetStateProperty.resolveWith<Color?>((
      Set<WidgetState> states,
    ) {
      if (states.contains(WidgetState.selected)) {
        return primary600;
      }
      return c.border;
    }),
    trackColor: WidgetStateProperty.resolveWith<Color?>((
      Set<WidgetState> states,
    ) {
      if (states.contains(WidgetState.selected)) {
        return primary300;
      }
      return c.border;
    }),
    trackOutlineColor: WidgetStateProperty.resolveWith<Color?>((
      Set<WidgetState> states,
    ) {
      if (states.contains(WidgetState.selected)) {
        return primary600;
      }
      return c.border;
    }),
  );

  // Slider Theme
  static SliderThemeData _sliderTheme(Brightness b) => b == Brightness.dark
      ? SliderThemeData(
          activeTrackColor: primary500,
          inactiveTrackColor: primary900,
          thumbColor: primary400,
          overlayColor: primary900.withValues(alpha: 0.6),
          valueIndicatorColor: primary600,
          trackHeight: 4,
        )
      : const SliderThemeData(
          activeTrackColor: primary600,
          inactiveTrackColor: primary200,
          thumbColor: primary600,
          overlayColor: primary100,
          valueIndicatorColor: primary600,
          trackHeight: 4,
        );

  // Tab Bar Theme
  static TabBarThemeData _tabBarTheme(ThemeColors c, TextTheme t) =>
      TabBarThemeData(
        labelColor: primary600,
        unselectedLabelColor: c.textMuted,
        indicatorColor: primary600,
        indicatorSize: TabBarIndicatorSize.label,
        labelStyle: t.labelLarge?.copyWith(fontWeight: FontWeight.w600),
        unselectedLabelStyle: t.labelLarge?.copyWith(
          fontWeight: FontWeight.w500,
        ),
        dividerColor: Colors.transparent,
      );

  // App Bar Theme
  static AppBarTheme _appBarTheme(Brightness b, ThemeColors c, TextTheme t) =>
      AppBarTheme(
        backgroundColor: b == Brightness.dark ? c.surface : c.surfaceCard,
        foregroundColor: c.foreground,
        elevation: 0,
        scrolledUnderElevation: 1,
        shadowColor: Colors.black.withValues(alpha: 0.05),
        surfaceTintColor: Colors.transparent,
        centerTitle: false,
        titleTextStyle: t.headlineMedium?.copyWith(fontWeight: FontWeight.w700),
        iconTheme: IconThemeData(color: c.textSecondary, size: 24),
        actionsIconTheme: IconThemeData(color: c.textSecondary, size: 24),
      );

  // Bottom Navigation Bar Theme
  static BottomNavigationBarThemeData _bottomNavTheme(
    ThemeColors c,
    TextTheme t,
  ) => BottomNavigationBarThemeData(
    backgroundColor: c.surfaceCard,
    selectedItemColor: primary600,
    unselectedItemColor: c.gray400,
    selectedLabelStyle: t.labelSmall?.copyWith(fontWeight: FontWeight.w600),
    unselectedLabelStyle: t.labelSmall?.copyWith(fontWeight: FontWeight.w500),
    type: BottomNavigationBarType.fixed,
    elevation: 8,
    showSelectedLabels: true,
    showUnselectedLabels: true,
  );

  // Navigation Rail Theme
  static NavigationRailThemeData _navRailTheme(ThemeColors c, TextTheme t) =>
      NavigationRailThemeData(
        backgroundColor: c.surfaceCard,
        selectedIconTheme: const IconThemeData(color: primary600, size: 24),
        unselectedIconTheme: IconThemeData(color: c.gray400, size: 24),
        selectedLabelTextStyle: t.labelSmall?.copyWith(
          fontWeight: FontWeight.w600,
          color: primary600,
        ),
        unselectedLabelTextStyle: t.labelSmall?.copyWith(
          fontWeight: FontWeight.w500,
          color: c.gray500,
        ),
        indicatorColor: c.primaryWell,
        indicatorShape: const RoundedRectangleBorder(borderRadius: radiusLg),
        elevation: 0,
      );

  // Divider Theme
  static DividerThemeData _dividerTheme(ThemeColors c) =>
      DividerThemeData(color: c.gray200, thickness: 1, space: 1);

  // Chip Theme
  static ChipThemeData _chipTheme(ThemeColors c, TextTheme t) => ChipThemeData(
    backgroundColor: c.gray100,
    disabledColor: c.gray100,
    selectedColor: c.primaryWell,
    secondarySelectedColor: c.primaryWell,
    padding: const EdgeInsets.symmetric(horizontal: space3, vertical: space1),
    labelStyle: t.labelSmall?.copyWith(color: t.titleLarge?.color),
    secondaryLabelStyle: t.labelSmall?.copyWith(color: c.primaryWellText),
    brightness: Brightness.light,
    shape: const RoundedRectangleBorder(borderRadius: radiusFull),
  );

  // SnackBar Theme
  static SnackBarThemeData _snackBarTheme(
    Brightness b,
    ThemeColors c,
    TextTheme t,
  ) => SnackBarThemeData(
    // Light mode: snack bar gelap klasik; dark mode: panel kartu.
    backgroundColor: b == Brightness.dark ? c.surfaceCard : ink900,
    contentTextStyle: t.bodyMedium?.copyWith(
      color: b == Brightness.dark ? c.foreground : Colors.white,
    ),
    actionTextColor: accent400,
    behavior: SnackBarBehavior.floating,
    shape: const RoundedRectangleBorder(borderRadius: radiusLg),
    elevation: 6,
  );

  // Dialog Theme
  static DialogThemeData _dialogTheme(ThemeColors c, TextTheme t) =>
      DialogThemeData(
        backgroundColor: c.surfaceCard,
        elevation: 24,
        shadowColor: Colors.black.withValues(alpha: 0.15),
        shape: const RoundedRectangleBorder(borderRadius: radius2xl),
        titleTextStyle: t.headlineSmall?.copyWith(fontWeight: FontWeight.w700),
        contentTextStyle: t.bodyMedium,
      );

  // Bottom Sheet Theme
  static BottomSheetThemeData _bottomSheetTheme(ThemeColors c) =>
      BottomSheetThemeData(
        backgroundColor: c.surfaceCard,
        elevation: 24,
        shadowColor: Colors.black.withValues(alpha: 0.15),
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        modalBackgroundColor: c.surfaceCard,
        dragHandleColor: c.border,
        showDragHandle: true,
      );

  // Complete ThemeData
  static ThemeData get light => _build(Brightness.light);

  /// Dark Theme — koheren dengan aplikasi dark-first: permukaan gelap,
  /// teks terang.
  static ThemeData get dark => _build(Brightness.dark);

  static ThemeData _build(Brightness b) {
    var (t, c) = _tones(b);
    var isDark = b == Brightness.dark;
    return ThemeData(
      useMaterial3: true,
      fontFamily: GoogleFonts.roboto().fontFamily,
      brightness: b,
      extensions: [c],
      colorScheme: ColorScheme(
        brightness: b,
        primary: isDark ? primary400 : primary600,
        onPrimary: Colors.white,
        secondary: isDark ? accent400 : accent500,
        onSecondary: Colors.white,
        tertiary: isDark ? primary300 : primary500,
        onTertiary: Colors.white,
        surface: c.surfaceCard,
        onSurface: c.foreground,
        surfaceContainerHighest: c.surfaceHover,
        error: c.danger,
        onError: Colors.white,
        outline: c.border,
        outlineVariant: c.gray200,
      ),
      textTheme: t,
      inputDecorationTheme: _inputDecorationTheme(c, t),
      elevatedButtonTheme: _elevatedButtonTheme(t),
      outlinedButtonTheme: _outlinedButtonTheme(c, t),
      textButtonTheme: _textButtonTheme(b, c),
      cardTheme: _cardTheme(c),
      checkboxTheme: _checkboxTheme(c),
      radioTheme: _radioTheme(c),
      switchTheme: _switchTheme(c),
      sliderTheme: _sliderTheme(b),
      tabBarTheme: _tabBarTheme(c, t),
      appBarTheme: _appBarTheme(b, c, t),
      bottomNavigationBarTheme: _bottomNavTheme(c, t),
      navigationRailTheme: _navRailTheme(c, t),
      dividerTheme: _dividerTheme(c),
      chipTheme: _chipTheme(c, t),
      snackBarTheme: _snackBarTheme(b, c, t),
      dialogTheme: _dialogTheme(c, t),
      bottomSheetTheme: _bottomSheetTheme(c),
      scaffoldBackgroundColor: c.background,
      canvasColor: c.surfaceCard,
      // Translucent overlays: an opaque focus/hover/highlight colour would paint
      // over the whole field and hide the typed text, so these stay subtle in
      // both brightness modes.
      splashColor: isDark
          ? Colors.white.withValues(alpha: 0.14)
          : primary100.withValues(alpha: 0.6),
      highlightColor: isDark
          ? Colors.white.withValues(alpha: 0.08)
          : primary50.withValues(alpha: 0.6),
      hoverColor: isDark
          ? Colors.white.withValues(alpha: 0.06)
          : primary50.withValues(alpha: 0.5),
      focusColor: isDark
          ? Colors.white.withValues(alpha: 0.10)
          : primary100.withValues(alpha: 0.35),
      pageTransitionsTheme: const PageTransitionsTheme(
        builders: {
          TargetPlatform.android: CupertinoPageTransitionsBuilder(),
          TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
          TargetPlatform.macOS: CupertinoPageTransitionsBuilder(),
          TargetPlatform.windows: CupertinoPageTransitionsBuilder(),
          TargetPlatform.linux: CupertinoPageTransitionsBuilder(),
        },
      ),
    );
  }
}
