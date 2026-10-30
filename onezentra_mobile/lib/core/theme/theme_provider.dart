import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Manages the app's theme mode (light/dark/system) and persists the choice.
class ThemeProvider extends ChangeNotifier {
  static const _key = 'theme_mode';
  ThemeMode _mode = ThemeMode.dark;

  ThemeMode get mode => _mode;

  Future<void> init() async {
    var prefs = await SharedPreferences.getInstance();
    var saved = prefs.getString(_key);
    if (saved == 'light') {
      _mode = ThemeMode.light;
    } else if (saved == 'dark') {
      _mode = ThemeMode.dark;
    } else {
      _mode = ThemeMode.system;
    }
    notifyListeners();
  }

  Future<void> setMode(ThemeMode mode) async {
    _mode = mode;
    var prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      _key,
      mode == ThemeMode.light
          ? 'light'
          : mode == ThemeMode.dark
              ? 'dark'
              : 'system',
    );
    notifyListeners();
  }

  bool get isDark => _mode == ThemeMode.dark;
}
