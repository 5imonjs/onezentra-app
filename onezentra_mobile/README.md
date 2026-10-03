# OneZentra Mobile

Aplikasi mobile Flutter untuk sistem manajemen gudang OneZentra, terintegrasi dengan API Laravel yang sudah ada.

## Fitur

- **Login Page** - Desain konsisten dengan web app (Tailwind CSS theme)
- **Authentication** - Menggunakan Sanctum Bearer token untuk mobile
- **Theme System** - Mencerminkan design system web app (Indigo primary, Teal accent)
- **State Management** - Provider pattern untuk auth state
- **Navigation** - GoRouter untuk routing dengan auth guard
- **API Client** - HTTP client dengan auto token management

## Tech Stack

- Flutter 3.x
- Dart 3.x
- Provider (State Management)
- GoRouter (Navigation)
- HTTP (API Calls)
- SharedPreferences (Token Storage)
- Google Fonts (Roboto - matching web)

## Struktur Project

```
lib/
├── core/
│   ├── network/
│   │   └── api_client.dart          # HTTP client dengan auth
│   └── theme/
│       └── app_theme.dart           # Theme system matching web
├── features/
│   └── auth/
│       ├── models/
│       │   └── auth_models.dart     # User, Role, Permission, AuthResponse
│       ├── repositories/
│       │   └── auth_repository.dart # API calls untuk auth
│       ├── providers/
│       │   └── auth_provider.dart   # State management
│       └── pages/
│           └── login_page.dart      # Login UI
├── shared/
│   └── widgets/
│       └── app_widgets.dart         # Reusable UI components
└── main.dart                        # App entry point
```

## API Integration

Aplikasi terintegrasi dengan endpoint Laravel yang sudah ada:

- `POST /api/v1/mobile/login` - Login mobile (Bearer token)
- `POST /api/v1/mobile/logout` - Logout mobile
- `GET /api/v1/user` - Get current user profile
- `PUT /api/v1/user` - Update profile

## Setup & Installation

### Prerequisites

- Flutter SDK 3.11+
- Android Studio / Xcode
- Laravel backend running (default: http://10.0.2.2:8000 untuk Android emulator)

### Install Dependencies

```bash
cd onezentra_mobile
flutter pub get
```

### Konfigurasi API URL

Base URL diatur lewat `--dart-define` saat run, **tidak** perlu edit kode.
`flutter run` me-restart penuh saat build berubah, jadi hot reload saja tidak
cukup untuk mengganti alamat server.

```bash
# Android Emulator (10.0.2.2 = host machine dari dalam emulator)
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:8000/api/v1

# iOS Simulator
flutter run --dart-define=API_BASE_URL=http://localhost:8000/api/v1

# Physical Device — wajib pakai IP LAN komputer, bukan localhost.
# localhost di HP menunjuk ke HP itu sendiri, bukan ke PC.
flutter run --dart-define=API_BASE_URL=http://192.168.x.x:8000/api/v1
```

Tanpa `--dart-define`, app memakai default per platform: `10.0.2.2:8000` di
Android dan `localhost:8000` di iOS. Default ini **tidak** bekerja di physical
device dan akan berakhir dengan pesan "Tidak ada koneksi ke server".

Catatan tambahan:

- `php artisan serve` hanya bind ke `127.0.0.1` secara default, sehingga tidak
  terjangkau dari physical device. Jalankan dengan
  `php artisan serve --host=0.0.0.0 --port=8000`.
- Server bawaan PHP bersifat single-threaded; permintaan yang tumpang tindih
  bisa membuat koneksi terputus. app menangani ini dengan pesan yang jelas.
- Android memblokir HTTP cleartext sejak API 28. Build `debug` sudah punya
  `network_security_config.xml` yang mengizinkan; build `release` hanya
  mengizinkan HTTPS.
- iOS sudah punya `NSLocalNetworkUsageDescription` di `Info.plist`; pengguna
  tetap harus menyetujui izin local network saat app pertama kali meminta.

### Run Development

```bash
# Android
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:8000/api/v1

# iOS Simulator
flutter run --dart-define=API_BASE_URL=http://localhost:8000/api/v1
```

### Melihat error yang tidak terduga

Layar login menampilkan pesan generik bila error tidak terpetakan. Penyebab
aslinya tetap dicatat ke log console:

```bash
flutter logs
# atau
flutter run 2>&1 | grep -i 'ApiClient\|AuthProvider'
```

## Design System

Theme mobile mengikuti **dark aurora** yang sama dengan web app (`globals.css`)
dan halaman login: indigo primary, teal accent, Roboto, kanvas gelap.

### Colors
Ramp netral **dibalik** terhadap Tailwind: `gray50` = permukaan terdalam,
`gray900` = teks paling terang. Konsekuensinya, angka besar bukan "lebih
terang" — pilih berdasarkan **peran**:

| Peran | Token |
|---|---|
| Kanvas aplikasi | `background`, `gray100` |
| Card | `surfaceCard`, `gray200` |
| Border / hairline | `gray300` |
| Teks muted | `gray400`, `gray500` |
| Teks body | `gray600`, `gray700` |
| Judul | `gray800`, `gray900` |
| Panel selalu gelap (hero, header modal) | `ink800`, `ink900`, `ink950` |
| Well status gelap | `successWell`, `warningWell`, `dangerWell`, `infoWell` |
| Teks status terbaca | `successText`, `warningText`, `dangerText`, `infoText` |
| Aksen solid (bar, dot, state aktif) | `success`, `warning`, `danger`, `info` |

**Jangan** menulis warna langsung (`Color(0x...)`) untuk status — pakai token
di atas. Semua warna status hardcode yang tersisa sudah dipetakan; menambah
hex baru berpotensi menghasilkan teks tak terbaca di kanvas gelap.

`main.dart` mengunci `ThemeMode.dark`. Dulu tidak ada `themeMode` sehingga
default `ThemeMode.system` menukar `AppTheme.dark` masuk sementara halaman
masih menyematkan `AppTheme.background` (terang) — teks hitam di atas
background terang. Jangan dikembalikan ke `system` tanpa sekalian membuat
seluruh halaman memakai `Theme.of(context)` dan bukan warna statis.

### Brand
- **Primary (Indigo)**: 50-950 scale
- **Accent (Teal)**: 400, 500
- **Gray Scale**: 50-900 (dark-first, lihat tabel di atas)
- **Ink Scale**: 700-950 (selalu gelap)
- **Semantic**: `success`/`warning`/`danger`/`info` + pasangan `*Text`/`*Well`

### Typography
- Font: Roboto (matching web)
- Scale: xs(12) → sm(14) → base(16) → lg(18) → xl(20) → 2xl(24) → 3xl(30)

### Components
- **AppTextField** - Input field dengan style web
- **AppPrimaryButton** - Button primary (indigo)
- **AppSecondaryButton** - Button outline
- **AppTextButton** - Text button
- **AppCard** - Card dengan shadow
- **AppBadge** - Badge variants (success, warning, danger, info)
- **AppErrorDisplay** - Error message dengan retry
- **AppEmptyState** - Empty state illustration
- **AppLoadingOverlay** - Loading overlay

## Authentication Flow

1. User masukkan email & password
2. App call `POST /api/v1/mobile/login` dengan `device_name`
3. Server return `token` (Bearer) + `user` + `permissions`
4. Token disimpan di SharedPreferences
5. Request selanjutnya pakai header `Authorization: Bearer <token>`
6. Logout hapus token local & call `POST /api/v1/mobile/logout`

## Permissions

User permissions di-load saat login dan tersedia via:
```dart
final authProvider = context.read<AuthProvider>();
authProvider.user?.hasPermission('permission.slug');
authProvider.user?.hasAnyPermission(['perm1', 'perm2']);
```

## Build Production

```bash
# Android APK
flutter build apk --release

# Android App Bundle
flutter build appbundle --release

# iOS
flutter build ios --release
```

## Testing

```bash
# Unit & Widget tests
flutter test

# Coverage
flutter test --coverage
```

## Troubleshooting

### NDK Issue (macOS)
Jika build Android gagal dengan error NDK:
```bash
rm -rf /opt/homebrew/share/android-commandlinetools/ndk/28.2.13676358
flutter build apk --debug
```

### Clear Cache
```bash
flutter clean
flutter pub get
```

### iOS Pods
```bash
cd ios
pod install
cd ..
```

## Contributing

1. Follow Laravel Boost guidelines
2. Run `flutter analyze` before commit
3. Run `flutter test` before commit
4. Follow existing code conventions
5. Use package imports (`package:onezentra_mobile/...`)

## License

Private - OneZentra Warehouse Management System