# Mobile rules (`onezentra_mobile/**`)

- The app is dark-first. Keep `themeMode: ThemeMode.dark` in `lib/main.dart`;
  `test/core/theme/theme_guard_test.dart` guards it. Forcing light/dark variants
  is what causes hardcoded dark pages to render unreadable.
- Auth tokens live in `flutter_secure_storage`; during the current trial the
  production API base URL is `https://187.77.121.102/api/v1`
  (`lib/core/network/api_client.dart`). The server's self-signed certificate is
  pinned there; revert to `https://api.onezentra.sbs` after the trial.
- CI gates on formatting/analysis/tests. Before pushing run, in
  `onezentra_mobile/`: `dart format lib test`,
  `dart format --output=none --set-exit-if-changed lib test`,
  `flutter analyze`, `flutter test`.
