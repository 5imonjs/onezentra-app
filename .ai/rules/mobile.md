# Mobile rules (`onezentra_mobile/**`)

- The app is dark-first. Keep `themeMode: ThemeMode.dark` in `lib/main.dart`;
  `test/core/theme/theme_guard_test.dart` guards it. Forcing light/dark variants
  is what causes hardcoded dark pages to render unreadable.
- Auth tokens live in `flutter_secure_storage`; the production API base URL is
  `https://api.onezentra.sbs` (`lib/core/network/api_client.dart`).
- CI gates on formatting/analysis/tests. Before pushing run, in
  `onezentra_mobile/`: `dart format lib test`,
  `dart format --output=none --set-exit-if-changed lib test`,
  `flutter analyze`, `flutter test`.
