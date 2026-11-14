# Flow & Penjelasan Aplikasi Mobile OneZentra

Gambar: `docs/MOBILE_APP_FLOW.png`

## Tujuan
Aplikasi mobile OneZentra adalah alat lapangan (handheld) untuk Security & Cheker agar
proses penerimaan barang berjalan cepat, akurat, dan tercatat, terintegrasi dengan
backend Laravel yang sama dengan web.

## Alur Utama (3 langkah)
1. **Check In Point** — Security scan/ketik PO atau Nopol, periksa dokumen & kendaraan, catat Gate IN (status SCHEDULED → CHECKED_IN).
2. **Validasi SJ** — Cheker buka sesi dari PO, cek tiap item, isi qty aktual, expired, kondisi; kondisi khusus wajib foto; cetak label batch otomatis.
3. **Check Out Point** — Cheker pilih receiving aktif, cek detail, konfirmasi selesai bongkar (status → COMPLETED).

## Fitur Pendukung
- **Riwayat**: Gate, Validasi, dan Penerimaan dalam satu tempat.
- **Opname Expired**: monitoring batch mendekati/melewati expired.
- **Sesi Opname**: tugas hitung fisik & disposisi (ditugaskan dari web).
- **Tema**: light/dark, disimpan di perangkat.
- **Panel Server**: ganti alamat API dari layar login.

## Implementasi (ringkas)
| Proses | Layar | Provider | Repository | Endpoint contoh |
|---|---|---|---|---|
| Login | `auth/pages/login_page.dart` | `AuthProvider` | `AuthRepository` | `POST /api/v1/mobile/login` |
| Check In | `gate/pages/gate_page.dart` | `GateProvider` | `GateRepository` | `POST /gate-transactions` |
| Validasi SJ | `validation/pages/validation_page.dart` | `ValidationProvider` | `ValidationRepository` | `POST /sj-validations/{id}/scan` |
| Check Out | `unload/pages/unload_page.dart` | `UnloadProvider` | `UnloadRepository` | `POST /receivings/{id}/complete` |
| Riwayat | `history/pages/history_page.dart` | — | Gate/Validation/Inbound Repo | `GET /gate-transactions`, `/sj-validations`, `/receivings` |
| Opname | `opname/pages/opname_expired*.dart` | — | Opname Repositories | `GET /opname-expired` |

Permission contoh: `gate.view`, `gate.create`, `sj_validation.view`, `receiving.view`,
`receiving.edit`, `opname.view`, `opname.session.view`.

## Hasil Akhir
Semua transaksi tersimpan dan terlacak: Gate IN → Validasi → Check Out. Data menjadi
dasar laporan dan riwayat yang bisa dilihat kapan saja.