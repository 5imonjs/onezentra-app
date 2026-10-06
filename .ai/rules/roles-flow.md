---
paths:
  - 'app/Http/Controllers/Api/V1/*.php'
  - 'routes/api.php'
  - 'database/seeders/PermissionSeeder.php'
---

# Peran & Alur Sistem (Base Praktik)

Peta peran → aksi → status untuk seluruh alur. Permission mengikuti pola
`modul.view/create/edit/delete` + kata kerja khusus (`validate`, `complete`,
`cancel`, `submit`, `check`, `approve`, `revise`). Tulis butuh cek depo
per baris (`canAccessDepotRow`/`forUserDepot`/`authorizeDepot`); baca master
(NPN, cluster-principal, standar-umur) global. Setiap perubahan akun
mencatat `updated_by`; perubahan level/status akun lain hanya admin master.

## Rantai pasok: rencana → gate → validasi SJ → receiving → opname

| Tahap | Aktor (permission) | Transisi status |
|---|---|---|
| Rencana kirim | Admin planner (`rencana_kirim.create`) | DRAFT → SCHEDULED (`schedule`); edit hanya DRAFT/SCHEDULED; depo dikunci untuk scoped user |
| Gate | Checker (`gate.create`) | INBOUND: SCHEDULED → CHECKED_IN; OUTBOUND: hanya setelah COMPLETED. Hapus hanya INBOUND + RK CHECKED_IN (kembali SCHEDULED); OUTBOUND = jejak audit |
| Validasi SJ | Checker (`sj_validation.validate/complete`, koreksi selesai `edit_completed`, batal `cancel` = IN_PROGRESS saja) | IN_PROGRESS → COMPLETED (transaksional + kunci); tiap item tervalidasi terbit 1 Batch; receiving PENDING terbentuk otomatis |
| Receiving | Checker (`receiving.edit`) | Scan + complete cocok PO case-insensitive (barcode cetak uppercase); cancel/destroy terkunci + cek ulang; RK mundur hanya IN_PROGRESS → VERIFIED |
| Opname | Lihat base praktik opname (`.ai/rules/opname-expired.md`) | Import → pending → Generate → sesi per batch → verifikasi → selesai |

## Biaya: draft → antrean → selesai

`draft → pending → checked (BAC) → rlh_approved (RLH) → approved (+rfah bila nominal lewat ambang)`, cabang `rejected`/`revisi`. Revisi kembali ke status tercatat (THL) — retribusi kembali `pending` (kontrak teruji, jangan disamakan diam-diam). Pengajuan non-draft tanpa depo ditolak. Filter daftar THL memakai modul assignment sendiri (retribusi-only tidak ikut melihat THL).

## Pengguna & peran

- `admin_master`: satu-satunya yang boleh atur akun/level/status admin master; level/status akun lain hanya admin master; tiap update mencatat `updated_by`.
- Import massal user boleh membawa level (kebutuhan onboarding) — audit via `updated_by` + review berkala, bukan pemblokiran.
- Permission mati/tak terpakai tidak boleh dihapus diam-diam bila dipakai test atau sebagai induk grant (`sj_validation.edit` → induk otomatis `cancel`).

## File bukti & notifikasi

- `GET storage/{path}` fail-closed per depo pemilik (dicari di receiving/SJ/sesi/biaya); tanpa pemilik = 404.
- Email async; gagal/skip tercatat di `email_notification_logs` dan terlihat di Setting Email (bukan hanya log file).
