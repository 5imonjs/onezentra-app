# Contoh Implementasi Mobile per Proses

Dokumen ini memetakan setiap **proses pengguna** ke **implementasi nyata** di aplikasi
Flutter (`onezentra_mobile/`): layar, provider, repository, endpoint API, dan permission.

---

## 1. Login & Sesi

- **Layar**: `lib/features/auth/pages/login_page.dart`
- **Provider**: `AuthProvider` (`lib/features/auth/providers/auth_provider.dart`)
- **Repository**: `AuthRepository` (`lib/features/auth/repositories/auth_repository.dart`)
- **Endpoint**: `POST /api/v1/mobile/login` (Bearer token), `POST /api/v1/mobile/logout`
- **Penyimpanan token**: `FlutterSecureStorage` (iOS Keychain / Android EncryptedSharedPreferences)
- **Profil & preferensi**: `SharedPreferences`
- **Permission check**: `User.hasPermission()` / `hasAnyPermission()` di `auth_models.dart`
- **Contoh kode (login)**:
```dart
final response = await _post('/mobile/login', request.toJson());
// token disimpan di SecureStorage, profil di SharedPreferences
```
- **Contoh permission**:
```dart
authProvider.user?.hasPermission('gate.view');
```

## 2. Check In Point (Gate IN)

- **Layar**: `lib/features/gate/pages/gate_page.dart` (scan), `gate_scanner_page.dart` (kamera)
- **Provider**: `GateProvider`
- **Repository**: `GateRepository`
- **Endpoint**:
  - `GET /gate-transactions/search/by-dokumen?po_transporter=...` (cari PO/Nopol)
  - `POST /gate-transactions` (catat Gate IN, `gate_type`)
  - `GET /gate-transactions/stats` (statistik header)
- **Permission**: `gate.view`, `gate.create`, `rencana_kirim.edit`
- **Contoh kode (record gate)**:
```dart
await _post('/gate-transactions', {
  'rencana_kirim_id': id,
  'gate_type': gateType, // Gate IN
  'nopol': rencanaKirim.nopol,
  'driver_name': rencanaKirim.driverName,
  'po_transporter': rencanaKirim.poTransporter,
});
```
- **Handoff**: setelah Gate IN sukses, PO terakhir ditawarkan satu-tap ke Validasi SJ (`_justCheckedInPo`).

## 3. Validasi SJ

- **Layar**: `lib/features/validation/pages/validation_page.dart`, `validation_session_page.dart`
- **Provider**: `ValidationProvider`
- **Repository**: `ValidationRepository`
- **Endpoint**:
  - `GET /sj-validations/lookup?scan_code=...`
  - `POST /sj-validations/start-by-code` (buka/resume sesi)
  - `POST /sj-validations/{id}/scan` (validasi per item; multipart jika ada foto)
  - `POST /sj-validations/{id}/complete` / `cancel`
- **Permission**: `sj_validation.view`
- **Fitur khusus**:
  - Qty aktual diinput manual (qty rencana hanya pembanding).
  - Kondisi tertentu wajib bukti foto (multipart upload via `postMultipart`).
  - Batch + label dicetak otomatis (ESC/POS Bluetooth, fallback dialog print).
- **Contoh kode (scan item dengan foto)**:
```dart
await _postMultipart(
  '/sj-validations/$id/scan',
  fields,
  fileField: 'photo',
  filePath: photoPath,
);
```

## 4. Check Out Point (Bongkar / Receiving)

- **Layar**: `lib/features/unload/pages/unload_page.dart`
- **Provider**: `UnloadProvider`
- **Repository**: `UnloadRepository`
- **Endpoint**:
  - `GET /receivings/stats` (satu agregat)
  - `GET /receivings?status=PENDING|IN_PROGRESS` (per halaman)
  - `GET /receivings/{id}` (exact PO match)
  - `POST /receivings/{id}/start` / `complete` / `cancel`
- **Permission**: `receiving.view`, `receiving.edit`
- **Catatan**: pencarian PO dibatasi ke receiving aktif yang cocok persis (tidak fallback ke kandidat pertama).

## 5. Riwayat (Terpadu)

- **Layar**: `lib/features/history/pages/history_page.dart`
- **Repository**: `GateRepository`, `ValidationRepository`, `InboundRepository`
- **Endpoint**:
  - `GET /gate-transactions`
  - `GET /sj-validations`
  - `GET /receivings`
- **Permission**: `gate.view`, `sj_validation.view`, `receiving.view`
- **Catatan**: satu halaman untuk Gate, Validasi, dan Penerimaan (tab), sesuai izin pengguna.

## 6. Opname Expired & Sesi Opname

- **Layar**: `lib/features/opname/pages/opname_expired_page.dart`, `opname_expired_session_page.dart`
- **Repository**: `OpnameExpiredRepository`, `OpnameExpiredSessionRepository`
- **Endpoint**:
  - `GET /opname-expired`
  - `GET /opname-expired-sessions`, `start`, verifikasi item, `submit`, `cancel`, `assign`
- **Permission**: `opname.view`, `opname.session.view`
- **Catatan**: sesi dibuat & ditugaskan dari web; mobile menampilkan & mengerjakan tugas hitung fisik.

## 7. Navigasi & Guard (Router)

- **File**: `lib/main.dart` → `buildRouter()`
- **Library**: `GoRouter`
- **Guard**: redirect ke `/login` jika belum auth; cek permission per route (`_routePermissions`).
- **Contoh**:
```dart
const Map<String, List<String>> _routePermissions = {
  '/gate': ['gate.view'],
  '/validasi-sj': ['sj_validation.view'],
  '/bongkar': ['receiving.view'],
  '/riwayat': _historyViewPermissions,
  '/opname-expired': ['opname.view'],
  '/opname-expired-sessions': ['opname.session.view'],
};
```

## 8. Tema & UI

- **File**: `lib/core/theme/app_theme.dart`, `theme_provider.dart`
- **Penyimpanan preferensi**: `SharedPreferences`
- **Default**: `ThemeMode.light`; mendukung light/dark.

## 9. Server / API URL

- **File**: `lib/core/network/api_client.dart`
- **Prioritas**: `--dart-define` > pilihan panel Server (login) > default release (HTTPS produksi) > default debug per platform.
- **Panel Server** di layar login: isi alamat baru → sesi lama dibuang, login ulang.

## 10. Offline & Update

- **Banner offline**: `lib/shared/widgets/network_banner.dart` + `NetworkStatusProvider`.
- **App update gate**: `lib/core/app_update/app_update_gate.dart`, `app_update_checker.dart`.

---

## Ringkasan Pemetaan Proses → File

| Proses | Layar utama | Provider | Repository |
|---|---|---|---|
| Login | `auth/pages/login_page.dart` | `AuthProvider` | `AuthRepository` |
| Check In | `gate/pages/gate_page.dart` | `GateProvider` | `GateRepository` |
| Validasi SJ | `validation/pages/validation_page.dart` | `ValidationProvider` | `ValidationRepository` |
| Check Out | `unload/pages/unload_page.dart` | `UnloadProvider` | `UnloadRepository` |
| Riwayat | `history/pages/history_page.dart` | — | Gate/Validation/Inbound Repo |
| Opname | `opname/pages/opname_expired*.dart` | — | Opname Repositories |
| Navigasi | `main.dart` (GoRouter) | `AuthProvider` | — |