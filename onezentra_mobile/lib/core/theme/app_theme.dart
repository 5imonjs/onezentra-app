import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// OneZentra Mobile Theme
/// Matches the web app design system from globals.css
class AppTheme {
  // Primary Colors (Indigo)
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

  // Accent Colors (Teal)
  static const Color accent400 = Color(0xFF2DD4BF);
  static const Color accent500 = Color(0xFF14B8A6);

  // Surface Colors
  static const Color surface = Color(0xFFF8FAFC);
  static const Color surfaceCard = Color(0xFFFFFFFF);
  static const Color surfaceHover = Color(0xFFF1F5F9);

  // Gray Scale
  static const Color gray50 = Color(0xFFF8FAFC);
  static const Color gray100 = Color(0xFFF1F5F9);
  static const Color gray200 = Color(0xFFE2E8F0);
  static const Color gray300 = Color(0xFFCBD5E1);
  static const Color gray400 = Color(0xFF94A3B8);
  static const Color gray500 = Color(0xFF64748B);
  static const Color gray600 = Color(0xFF475569);
  static const Color gray700 = Color(0xFF334155);
  static const Color gray800 = Color(0xFF1E293B);
  static const Color gray900 = Color(0xFF0F172A);

  // Semantic Colors
  static const Color success = Color(0xFF10B981);
  static const Color warning = Color(0xFFF59E0B);
  static const Color danger = Color(0xFFEF4444);
  static const Color info = Color(0xFF3B82F6);

  // Background
  static const Color background = Color(0xFFF1F5F9);
  static const Color foreground = Color(0xFF0F172A);

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

  // Text Styles
  static TextTheme get textTheme => GoogleFonts.robotoTextTheme().copyWith(
    displayLarge: GoogleFonts.roboto(
      fontSize: 30,
      fontWeight: FontWeight.w700,
      height: 36 / 30,
      letterSpacing: -0.5,
      color: foreground,
    ),
    displayMedium: GoogleFonts.roboto(
      fontSize: 24,
      fontWeight: FontWeight.w700,
      height: 32 / 24,
      letterSpacing: -0.3,
      color: foreground,
    ),
    displaySmall: GoogleFonts.roboto(
      fontSize: 20,
      fontWeight: FontWeight.w700,
      height: 28 / 20,
      letterSpacing: -0.2,
      color: foreground,
    ),
    headlineLarge: GoogleFonts.roboto(
      fontSize: 18,
      fontWeight: FontWeight.w600,
      height: 28 / 18,
      color: foreground,
    ),
    headlineMedium: GoogleFonts.roboto(
      fontSize: 16,
      fontWeight: FontWeight.w600,
      height: 24 / 16,
      color: foreground,
    ),
    headlineSmall: GoogleFonts.roboto(
      fontSize: 14,
      fontWeight: FontWeight.w600,
      height: 20 / 14,
      color: foreground,
    ),
    titleLarge: GoogleFonts.roboto(
      fontSize: 14,
      fontWeight: FontWeight.w600,
      height: 20 / 14,
      color: gray700,
    ),
    titleMedium: GoogleFonts.roboto(
      fontSize: 12,
      fontWeight: FontWeight.w600,
      height: 16 / 12,
      letterSpacing: 0.5,
      color: gray500,
    ),
    titleSmall: GoogleFonts.roboto(
      fontSize: 12,
      fontWeight: FontWeight.w500,
      height: 16 / 12,
      color: gray600,
    ),
    bodyLarge: GoogleFonts.roboto(
      fontSize: 16,
      fontWeight: FontWeight.w400,
      height: 24 / 16,
      color: gray700,
    ),
    bodyMedium: GoogleFonts.roboto(
      fontSize: 14,
      fontWeight: FontWeight.w400,
      height: 20 / 14,
      color: gray600,
    ),
    bodySmall: GoogleFonts.roboto(
      fontSize: 12,
      fontWeight: FontWeight.w400,
      height: 16 / 12,
      color: gray500,
    ),
    labelLarge: GoogleFonts.roboto(
      fontSize: 14,
      fontWeight: FontWeight.w500,
      height: 20 / 14,
      color: gray700,
    ),
    labelMedium: GoogleFonts.roboto(
      fontSize: 12,
      fontWeight: FontWeight.w500,
      height: 16 / 12,
      color: gray600,
    ),
    labelSmall: GoogleFonts.roboto(
      fontSize: 10,
      fontWeight: FontWeight.w500,
      height: 14 / 10,
      letterSpacing: 0.5,
      color: gray500,
    ),
  );

  // Input Decoration Theme
  static InputDecorationTheme get inputDecorationTheme => InputDecorationTheme(
    filled: true,
    fillColor: surfaceCard,
    contentPadding: const EdgeInsets.symmetric(
      horizontal: space4,
      vertical: space3,
    ),
    border: const OutlineInputBorder(
      borderRadius: radiusXl,
      borderSide: BorderSide(color: gray200),
    ),
    enabledBorder: const OutlineInputBorder(
      borderRadius: radiusXl,
      borderSide: BorderSide(color: gray200),
    ),
    focusedBorder: const OutlineInputBorder(
      borderRadius: radiusXl,
      borderSide: BorderSide(color: primary500, width: 2),
    ),
    errorBorder: const OutlineInputBorder(
      borderRadius: radiusXl,
      borderSide: BorderSide(color: danger),
    ),
    focusedErrorBorder: const OutlineInputBorder(
      borderRadius: radiusXl,
      borderSide: BorderSide(color: danger, width: 2),
    ),
    disabledBorder: const OutlineInputBorder(
      borderRadius: radiusXl,
      borderSide: BorderSide(color: gray200),
    ),
    labelStyle: textTheme.bodyMedium?.copyWith(color: gray600),
    hintStyle: textTheme.bodyMedium?.copyWith(color: gray400),
    errorStyle: textTheme.bodySmall?.copyWith(color: danger),
    floatingLabelBehavior: FloatingLabelBehavior.auto,
    prefixIconColor: gray400,
    suffixIconColor: gray400,
  );

  // Elevated Button Theme
  static ElevatedButtonThemeData get elevatedButtonTheme =>
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
              textStyle: textTheme.labelLarge?.copyWith(
                fontWeight: FontWeight.w600,
              ),
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
  static OutlinedButtonThemeData get outlinedButtonTheme =>
      OutlinedButtonThemeData(
        style:
            OutlinedButton.styleFrom(
              foregroundColor: gray700,
              backgroundColor: surfaceCard,
              side: const BorderSide(color: gray200),
              shape: const RoundedRectangleBorder(borderRadius: radiusXl),
              padding: const EdgeInsets.symmetric(
                horizontal: space6,
                vertical: space3,
              ),
              textStyle: textTheme.labelLarge?.copyWith(
                fontWeight: FontWeight.w500,
              ),
              minimumSize: const Size(double.infinity, 52),
            ).copyWith(
              overlayColor: WidgetStateProperty.resolveWith<Color?>((
                Set<WidgetState> states,
              ) {
                if (states.contains(WidgetState.pressed)) {
                  return gray100;
                }
                if (states.contains(WidgetState.hovered)) {
                  return gray50;
                }
                return null;
              }),
            ),
      );

  // Text Button Theme
  static TextButtonThemeData get textButtonTheme => TextButtonThemeData(
    style:
        TextButton.styleFrom(
          foregroundColor: primary600,
          shape: const RoundedRectangleBorder(borderRadius: radiusLg),
          padding: const EdgeInsets.symmetric(
            horizontal: space3,
            vertical: space2,
          ),
          textStyle: textTheme.labelLarge?.copyWith(
            fontWeight: FontWeight.w500,
          ),
        ).copyWith(
          overlayColor: WidgetStateProperty.resolveWith<Color?>((
            Set<WidgetState> states,
          ) {
            if (states.contains(WidgetState.pressed)) {
              return primary50;
            }
            if (states.contains(WidgetState.hovered)) {
              return primary50;
            }
            return null;
          }),
        ),
  );

  // Card Theme
  static CardThemeData get cardTheme => CardThemeData(
    color: surfaceCard,
    elevation: 0,
    shape: const RoundedRectangleBorder(
      borderRadius: radius2xl,
      side: BorderSide(color: gray100),
    ),
    shadowColor: Colors.black.withValues(alpha: 0.05),
    margin: EdgeInsets.zero,
  );

  // Checkbox Theme
  static CheckboxThemeData get checkboxTheme => CheckboxThemeData(
    fillColor: WidgetStateProperty.resolveWith<Color?>((
      Set<WidgetState> states,
    ) {
      if (states.contains(WidgetState.selected)) {
        return primary600;
      }
      return Colors.transparent;
    }),
    checkColor: WidgetStateProperty.all(Colors.white),
    side: const BorderSide(color: gray300, width: 1.5),
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
    materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
  );

  // Radio Theme
  static RadioThemeData get radioTheme => RadioThemeData(
    fillColor: WidgetStateProperty.resolveWith<Color?>((
      Set<WidgetState> states,
    ) {
      if (states.contains(WidgetState.selected)) {
        return primary600;
      }
      return gray400;
    }),
  );

  // Switch Theme
  static SwitchThemeData get switchTheme => SwitchThemeData(
    thumbColor: WidgetStateProperty.resolveWith<Color?>((
      Set<WidgetState> states,
    ) {
      if (states.contains(WidgetState.selected)) {
        return primary600;
      }
      return gray300;
    }),
    trackColor: WidgetStateProperty.resolveWith<Color?>((
      Set<WidgetState> states,
    ) {
      if (states.contains(WidgetState.selected)) {
        return primary300;
      }
      return gray300;
    }),
    trackOutlineColor: WidgetStateProperty.resolveWith<Color?>((
      Set<WidgetState> states,
    ) {
      if (states.contains(WidgetState.selected)) {
        return primary600;
      }
      return gray300;
    }),
  );

  // Slider Theme
  static SliderThemeData get sliderTheme => SliderThemeData(
    activeTrackColor: primary600,
    inactiveTrackColor: primary200,
    thumbColor: primary600,
    overlayColor: primary100,
    valueIndicatorColor: primary600,
    valueIndicatorTextStyle: textTheme.labelSmall?.copyWith(
      color: Colors.white,
    ),
    trackHeight: 4,
    thumbShape: const RoundSliderThumbShape(),
    overlayShape: const RoundSliderOverlayShape(overlayRadius: 16),
  );

  // Tab Bar Theme
  static TabBarThemeData get tabBarTheme => TabBarThemeData(
    labelColor: primary600,
    unselectedLabelColor: gray500,
    indicatorColor: primary600,
    indicatorSize: TabBarIndicatorSize.label,
    labelStyle: textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w600),
    unselectedLabelStyle: textTheme.labelLarge?.copyWith(
      fontWeight: FontWeight.w500,
    ),
    dividerColor: Colors.transparent,
  );

  // App Bar Theme
  static AppBarTheme get appBarTheme => AppBarTheme(
    backgroundColor: surfaceCard,
    foregroundColor: foreground,
    elevation: 0,
    scrolledUnderElevation: 1,
    shadowColor: Colors.black.withValues(alpha: 0.05),
    surfaceTintColor: Colors.transparent,
    centerTitle: false,
    titleTextStyle: textTheme.headlineMedium?.copyWith(
      fontWeight: FontWeight.w700,
      color: foreground,
    ),
    iconTheme: const IconThemeData(color: gray700, size: 24),
    actionsIconTheme: const IconThemeData(color: gray700, size: 24),
  );

  // Bottom Navigation Bar Theme
  static BottomNavigationBarThemeData get bottomNavigationBarTheme =>
      BottomNavigationBarThemeData(
        backgroundColor: surfaceCard,
        selectedItemColor: primary600,
        unselectedItemColor: gray400,
        selectedLabelStyle: textTheme.labelSmall?.copyWith(
          fontWeight: FontWeight.w600,
        ),
        unselectedLabelStyle: textTheme.labelSmall?.copyWith(
          fontWeight: FontWeight.w500,
        ),
        type: BottomNavigationBarType.fixed,
        elevation: 8,
        showSelectedLabels: true,
        showUnselectedLabels: true,
      );

  // Navigation Rail Theme
  static NavigationRailThemeData get navigationRailTheme =>
      NavigationRailThemeData(
        backgroundColor: surfaceCard,
        selectedIconTheme: const IconThemeData(color: primary600, size: 24),
        unselectedIconTheme: const IconThemeData(color: gray400, size: 24),
        selectedLabelTextStyle: textTheme.labelSmall?.copyWith(
          fontWeight: FontWeight.w600,
          color: primary600,
        ),
        unselectedLabelTextStyle: textTheme.labelSmall?.copyWith(
          fontWeight: FontWeight.w500,
          color: gray500,
        ),
        indicatorColor: primary50,
        indicatorShape: const RoundedRectangleBorder(borderRadius: radiusLg),
        elevation: 0,
      );

  // Divider Theme
  static DividerThemeData get dividerTheme =>
      const DividerThemeData(color: gray200, thickness: 1, space: 1);

  // Chip Theme
  static ChipThemeData get chipTheme => ChipThemeData(
    backgroundColor: gray100,
    disabledColor: gray100,
    selectedColor: primary100,
    secondarySelectedColor: primary100,
    padding: const EdgeInsets.symmetric(horizontal: space3, vertical: space1),
    labelStyle: textTheme.labelSmall?.copyWith(color: gray700),
    secondaryLabelStyle: textTheme.labelSmall?.copyWith(color: primary700),
    brightness: Brightness.light,
    shape: const RoundedRectangleBorder(
      borderRadius: radiusFull,
    ),
  );

  // SnackBar Theme
  static SnackBarThemeData get snackBarTheme => SnackBarThemeData(
    backgroundColor: gray900,
    contentTextStyle: textTheme.bodyMedium?.copyWith(color: Colors.white),
    actionTextColor: accent400,
    behavior: SnackBarBehavior.floating,
    shape: const RoundedRectangleBorder(borderRadius: radiusLg),
    elevation: 6,
  );

  // Dialog Theme
  static DialogThemeData get dialogTheme => DialogThemeData(
    backgroundColor: surfaceCard,
    elevation: 24,
    shadowColor: Colors.black.withValues(alpha: 0.15),
    shape: const RoundedRectangleBorder(borderRadius: radius2xl),
    titleTextStyle: textTheme.headlineSmall?.copyWith(
      fontWeight: FontWeight.w700,
      color: foreground,
    ),
    contentTextStyle: textTheme.bodyMedium?.copyWith(color: gray600),
  );

  // Bottom Sheet Theme
  static BottomSheetThemeData get bottomSheetTheme => BottomSheetThemeData(
    backgroundColor: surfaceCard,
    elevation: 24,
    shadowColor: Colors.black.withValues(alpha: 0.15),
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
    ),
    modalBackgroundColor: surfaceCard,
    dragHandleColor: gray300,
    showDragHandle: true,
  );

  // Complete ThemeData
  static ThemeData get light => ThemeData(
    useMaterial3: true,
    fontFamily: GoogleFonts.roboto().fontFamily,
    colorScheme: const ColorScheme.light(
      primary: primary600,
      secondary: accent500,
      onSecondary: Colors.white,
      tertiary: primary500,
      onTertiary: Colors.white,
      onSurface: foreground,
      surfaceContainerHighest: surfaceHover,
      error: danger,
      outline: gray300,
      outlineVariant: gray200,
    ),
    textTheme: textTheme,
    inputDecorationTheme: inputDecorationTheme,
    elevatedButtonTheme: elevatedButtonTheme,
    outlinedButtonTheme: outlinedButtonTheme,
    textButtonTheme: textButtonTheme,
    cardTheme: cardTheme,
    checkboxTheme: checkboxTheme,
    radioTheme: radioTheme,
    switchTheme: switchTheme,
    sliderTheme: sliderTheme,
    tabBarTheme: tabBarTheme,
    appBarTheme: appBarTheme,
    bottomNavigationBarTheme: bottomNavigationBarTheme,
    navigationRailTheme: navigationRailTheme,
    dividerTheme: dividerTheme,
    chipTheme: chipTheme,
    snackBarTheme: snackBarTheme,
    dialogTheme: dialogTheme,
    bottomSheetTheme: bottomSheetTheme,
    scaffoldBackgroundColor: background,
    canvasColor: surfaceCard,
    // Translucent overlays: an opaque focus/hover/highlight colour would paint
    // over the whole field and hide the typed text (white on white in dark
    // mode), so these stay subtle in both brightness modes.
    splashColor: primary100.withValues(alpha: 0.6),
    highlightColor: primary50.withValues(alpha: 0.6),
    hoverColor: primary50.withValues(alpha: 0.5),
    focusColor: primary100.withValues(alpha: 0.35),
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

  // Dark Theme (for future use)
  static ThemeData get dark => light.copyWith(
    brightness: Brightness.dark,
    colorScheme: const ColorScheme.dark(
      primary: primary400,
      onPrimary: Colors.white,
      secondary: accent400,
      onSecondary: gray900,
      tertiary: primary300,
      onTertiary: gray900,
      surface: gray800,
      onSurface: gray50,
      surfaceContainerHighest: gray700,
      error: danger,
      onError: Colors.white,
      outline: gray600,
      outlineVariant: gray700,
    ),
    scaffoldBackgroundColor: gray900,
    canvasColor: gray800,
    // Overlays stay white and translucent so a focused dark input keeps its
    // dark fill and the white typed text remains readable.
    splashColor: Colors.white.withValues(alpha: 0.14),
    highlightColor: Colors.white.withValues(alpha: 0.08),
    hoverColor: Colors.white.withValues(alpha: 0.06),
    focusColor: Colors.white.withValues(alpha: 0.10),
    cardTheme: cardTheme.copyWith(
      color: gray800,
      shape: const RoundedRectangleBorder(
        borderRadius: radius2xl,
        side: BorderSide(color: gray700),
      ),
    ),
    inputDecorationTheme: inputDecorationTheme.copyWith(
      filled: true,
      fillColor: gray800,
      border: const OutlineInputBorder(
        borderRadius: radiusXl,
        borderSide: BorderSide(color: gray700),
      ),
      enabledBorder: const OutlineInputBorder(
        borderRadius: radiusXl,
        borderSide: BorderSide(color: gray700),
      ),
      focusedBorder: const OutlineInputBorder(
        borderRadius: radiusXl,
        borderSide: BorderSide(color: primary400, width: 2),
      ),
    ),
    bottomSheetTheme: bottomSheetTheme.copyWith(
      backgroundColor: gray800,
      modalBackgroundColor: gray800,
    ),
    dialogTheme: dialogTheme.copyWith(backgroundColor: gray800),
    appBarTheme: appBarTheme.copyWith(
      backgroundColor: gray800,
      foregroundColor: gray50,
      titleTextStyle: textTheme.headlineMedium?.copyWith(
        fontWeight: FontWeight.w700,
        color: gray50,
      ),
      iconTheme: const IconThemeData(color: gray50, size: 24),
      actionsIconTheme: const IconThemeData(color: gray50, size: 24),
    ),
    snackBarTheme: snackBarTheme.copyWith(
      backgroundColor: gray700,
      contentTextStyle: textTheme.bodyMedium?.copyWith(color: Colors.white),
    ),
  );
}
