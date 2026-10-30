import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Manages the app's theme mode (light/dark) and persists the choice.
///
/// Hanya dua pilihan manual: Light dan Dark. Tidak ada mode `system` —
/// aplikasi tidak mengikuti brightness sistem operasi (standar Global
/// Theme Management). Tema pertama kali (belum ada preferensi tersimpan)
/// adalah Light; preferensi pilihan user tersimpan dan dipulihkan saat
/// aplikasi dibuka kembali tanpa restart.
class ThemeProvider extends ChangeNotifier {
  static const _key = 'theme_mode';
  ThemeMode _mode = ThemeMode.light;

  ThemeMode get mode => _mode;

  Future<void> init() async {
    var prefs = await SharedPreferences.getInstance();
    // Nilai lama 'system' (dari refactor sebelumnya) dipetakan ke light —
    // opsi system sudah tidak ada.
    _mode = prefs.getString(_key) == 'dark' ? ThemeMode.dark : ThemeMode.light;
    notifyListeners();
  }

  Future<void> setMode(ThemeMode mode) async {
    if (mode == ThemeMode.system) {
      // Sistem tidak lagi didukung; abaikan.
      return;
    }
    _mode = mode;
    var prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, mode == ThemeMode.light ? 'light' : 'dark');
    notifyListeners();
  }

  bool get isDark => _mode == ThemeMode.dark;
}
