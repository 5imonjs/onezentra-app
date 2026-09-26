import 'package:flutter/material.dart';

/// Design tokens — mirror 1:1 dari `onezentra-mobile/src/theme/tokens.ts`
/// (sumbernya `onezentra-web/src/app/globals.css`).
abstract final class AppColors {
  static const primary50 = Color(0xFFEEF2FF);
  static const primary100 = Color(0xFFE0E7FF);
  static const primary200 = Color(0xFFC7D2FE);
  static const primary300 = Color(0xFFA5B4FC);
  static const primary400 = Color(0xFF818CF8);
  static const primary500 = Color(0xFF6366F1);
  static const primary600 = Color(0xFF4F46E5);
  static const primary700 = Color(0xFF4338CA);
  static const primary800 = Color(0xFF3730A3);
  static const primary900 = Color(0xFF312E81);
  static const primary950 = Color(0xFF1E1B4B);

  static const accent400 = Color(0xFF2DD4BF);
  static const accent500 = Color(0xFF14B8A6);

  static const surface = Color(0xFFF8FAFC);
  static const card = Colors.white;

  static const gray50 = Color(0xFFF8FAFC);
  static const gray100 = Color(0xFFF1F5F9);
  static const gray200 = Color(0xFFE2E8F0);
  static const gray300 = Color(0xFFCBD5E1);
  static const gray400 = Color(0xFF94A3B8);
  static const gray500 = Color(0xFF64748B);
  static const gray600 = Color(0xFF475569);
  static const gray700 = Color(0xFF334155);
  static const gray800 = Color(0xFF1E293B);
  static const gray900 = Color(0xFF0F172A);

  static const errorBg = Color(0xFFFEF2F2);
  static const errorBorder = Color(0xFFFECACA);
  static const errorText = Color(0xFFDC2626);

  static const successBg = Color(0xFFECFDF5);
  static const successBorder = Color(0xFFA7F3D0);
  static const success = Color(0xFF059669);
  static const successBright = Color(0xFF10B981);

  static const warningBg = Color(0xFFFFFBEB);
  static const warningBorder = Color(0xFFFDE68A);
  static const warningText = Color(0xFF92400E);

  // Pill arah gate pada web memakai `bg-violet-50 text-violet-700`; warna itu
  // tidak didefinisikan eksplisit di `globals.css`, jadi ditokenkan di sini
  // bersama pasangannya.
  static const violet50 = Color(0xFFF5F3FF);
  static const violet700 = Color(0xFF6D28D9);

  static const darkGradient = [gray900, primary950, gray900];

  // --- Tone status & per modul (padanan kelas Tailwind di globals.css) ---
  // Web memakai palet amber/sky/emerald/teal/indigo/slate untuk membedakan
  // modul pada kartu statistik & peringatan dashboard; token yang sama
  // dipakai mobile supaya warnanya identik di kedua aplikasi.

  static const amber50 = Color(0xFFFFFBEB);
  static const amber100 = Color(0xFFFEF3C7);
  static const amber200 = Color(0xFFFDE68A);
  static const amber500 = Color(0xFFF59E0B);
  static const amber600 = Color(0xFFD97706);
  static const amber700 = Color(0xFFB45309);
  // Judul banner "Standarisasi Tumpukan Belum Disetujui" di web memakai
  // `text-amber-900` — satu-satunya tempat yang butuh amber lebih gelap dari
  // amber700.
  static const amber900 = Color(0xFF78350F);

  static const sky50 = Color(0xFFF0F9FF);
  static const sky200 = Color(0xFFBAE6FD);
  static const sky600 = Color(0xFF0284C7);
  static const sky700 = Color(0xFF0369A1);

  static const blue50 = Color(0xFFEFF6FF);
  static const blue200 = Color(0xFFBFDBFE);
  static const blue600 = Color(0xFF2563EB);
  static const blue700 = Color(0xFF1D4ED8);

  // Pill status rencana kirim pada web memakai `bg-orange-50 text-orange-700`
  // untuk `IN_PROGRESS` (bongkar sedang berjalan) — harus beda dari amber
  // `CHECKED_IN`, jadi token_oranye ikut ditokenkan.
  static const orange50 = Color(0xFFFFF7ED);
  static const orange700 = Color(0xFFC2410C);

  static const emerald600 = Color(0xFF059669);

  static const teal50 = Color(0xFFF0FDFA);
  static const teal100 = Color(0xFFCCFBF1);
  static const teal600 = Color(0xFF0D9488);
  static const teal700 = Color(0xFF0F766E);

  static const indigo50 = Color(0xFFEEF2FF);
  static const indigo100 = Color(0xFFE0E7FF);
  static const indigo600 = Color(0xFF4F46E5);
  static const indigo700 = Color(0xFF4338CA);

  static const red50 = Color(0xFFFEF2F2);
  static const red200 = Color(0xFFFECACA);
  static const red600 = Color(0xFFDC2626);
  static const red700 = Color(0xFFB91C1C);
}

abstract final class AppRadius {
  static const input = 12.0;
  static const card = 24.0;
  static const feature = 16.0;

  /// Radius standar seluruh kartu aplikasi — padanan `rounded-2xl` web.
  static const panel = 20.0;
  static const chip = 12.0;
}
