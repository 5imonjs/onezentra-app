# Mobile rules (`onezentra_mobile/**`)

- Tema dikelola secara global: `AppTheme.light`/`AppTheme.dark` + `ThemeColors`
  extension + `ThemeProvider`. Hanya Light dan Dark (manual), TIDAK mengikuti
  brightness sistem. Default pertama kali = Light; preferensi user tersimpan di
  SharedPreferences (`theme_mode`) dan dipulihkan tanpa restart. Toggle di AppBar
  Home memanggil `ThemeProvider.setMode`. `lib/main.dart` memakai
  `themeMode: tp.mode`. `test/core/theme/theme_guard_test.dart` menjaga disiplin.
- Auth tokens live in `flutter_secure_storage`; the
  production API base URL is `https://api.onezentra.sbs/api/v1`
  (`lib/core/network/api_client.dart`). The previous IP-only trial endpoint
  `https://187.77.121.102/api/v1` remains available only as an explicit
  override, with its exact self-signed certificate pinned in the client.
- CI gates on formatting/analysis/tests. Before pushing run, in
  `onezentra_mobile/`: `dart format lib test`,
  `dart format --output=none --set-exit-if-changed lib test`,
  `flutter analyze`, `flutter test`.
