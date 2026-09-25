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

  static const darkGradient = [gray900, primary950, gray900];
}

abstract final class AppRadius {
  static const input = 12.0;
  static const card = 24.0;
  static const feature = 16.0;
}
