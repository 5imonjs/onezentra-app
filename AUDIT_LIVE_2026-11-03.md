# LAPORAN AUDIT LIVE PENUH — OneZentra Web System

**Tanggal:** 3 November 2026 · **Metode:** audit live step-by-step (server berjalan, request nyata + simulasi alur SPA akurat via cookie jar/CSRF) · **Scope:** Laravel backend + Next.js frontend (`onezentra-web/`). Mobile (`onezentra_mobile/`) di luar scope.

---

## Ringkasan Eksekutif

| Aspek | Kondisi Awal | Kondisi Akhir |
| --- | --- | --- |
| HTTP backend (`/up`, semua route) | **500 total** (`MissingAppKeyException`) | 200 / guard 401 ✅ |
| Alur login SPA (region → depo → login) | **Putus total** (region selalu 404) | 200 end-to-end via proxy frontend ✅ |
| Test suite Laravel (856 tes) | **46 gagal** | **0 gagal — 856/856 ✅** |
| Test suite web (419 tes) | 3 gagal (themeGuard) | **0 gagal — 419/419 ✅ + lint bersih ✅** |
| Kebocoran endpoint tanpa auth | — | 115/115 rute GET menolak (401/404) ✅ |
| composer audit / npm audit (prod deps) | — | 0 kerentanan ✅ |
| Integritas DB | — | `integrity_check: ok`, `foreign_key_check` bersih ✅ |
| Server dev frontend | **Meneruskan API ke PRODUKSI** | Diverifikasi lokal (traffic produksi terputus) ⚠️ perlu perbaikan file env |

---

## Bloker #1 — Backend 500 total (AKAR KETEMU & DIPERBAIKI)

**Gejala:** setiap request HTTP ke Laravel 500 `MissingAppKeyException`, tetapi CLI (`php artisan config:show`, tinker) sehat. Diagnosis `"MissingAppKeyException"` muncul hanya di worker (`php -S`).

**Rantai akar masalah (diverifikasi per-langkah dengan diagnostic sementara di worker):**

1. `php artisan serve` meneruskan `APP_ENV` ke worker PHP (daftar passthrough di
   `ServeCommand::$passthroughVariables`).
2. Bootstrap Laravel `checkForSpecificEnvironmentFile()`: bila `APP_ENV` terbaca, ia mencari
   `.env.<APP_ENV>` — dan menemukan **`.env.local` di repo root** (sisa file Next.js).
3. `.env.local` **menggantikan** `.env`: worker hanya memuat `NEXT_PUBLIC_API_URL` (terbukti:
   `$_ENV` hanya berisi 1 variabel itu, `getenv('APP_KEY')` = kosong).
4. CLI tidak kena karena tidak mewarisi `APP_ENV`.

**Perbaikan:** `.env.local` root dinonaktifkan (dipindah ke backup `/tmp/opencode/env.local.root.bak`;
isinya subset dari `onezentra-web/.env.local`, tidak di-track git). Hasil: `/up` 200, seluruh
endpoint hidup. **Rule abadi dicatat di `.ai/rules/backend.md`.**

---

## Bloker #2 — Alur login SPA mati total (DIPERBAIKI + terbukti live)

Alur standar: `/access-gateway` → `POST region-validate` → `GET depo-options` → `POST depo-validate` → `POST login`.

Dua defect lapis yang membuat **setiap** validasi region selalu 404 "Region not found or inactive":

1. **Skema vs kode:** tabel `regions` (dibuat migrasi `create_regions_table`) tidak punya kolom
   `is_active`, padahal `RegionDepoValidationController` memfilter `where('is_active', true)`.
   Di SQLite, quoted-identifier yang tak dikenal jatuh ke string literal → query selalu kosong
   → 404 selamanya. **Fix:** migrasi baru
   `2026_11_03_214501_add_is_active_to_regions_table.php` (idempotent via `hasColumn`; kolom
   dipasang di produksi via migrasi manual sesuai komentar kode lama).
2. **Kontrak controller versi tua:** `$region->id` tidak ada (PK = `code`), session key, field
   respons (`region_name`, `depo_id`, `depo_name`), input `kode_depo`, endpoint **`GET
   /api/v1/depo-options`** (yang direferensikan frontend `src/lib/accessGateway.ts` dan test
   `RegionDepoValidationTest`) — semuanya versi kontrak b066875 yang tidak ikut diimplementasi.
   **Fix:** controller ditulis ulang ke kontrak test + frontend; route `depo-options` ditambahkan;
   cache rute (`bootstrap/cache/routes-v7.php`) di-clear+regenerate.

**Bukti live (via proxy frontend localhost:3000):**
`region-validate 200 → depo-options 200 (4 depo) → depo-validate 200 → login 200 (user+permissions) → logout 200`.

> ⚠️ **Bukti produksi terdampak:** sebelum ditemukan bahwa proxy dev mengarah ke produksi, request
> regreasi ke `api.onezentra.sbs` membalas **500 `Undefined property: stdClass::$id`** — skewema/kode
> bug yang sama kemungkinan besar **masih ter-deploy di produksi**. Deploy Laravel di produksi perlu:
> (1) kode controller yang diperbaiki, (2) migrasi `is_active` dijalankan, (3) `route:clear &&
> route:cache`, (4) restart PHP-FPM.

---

## Perbaikan kontrak scoping Region/Depo (37 kegagalan test → 0)

Sisa 37 kegagalan terkumpul pada satu motif: middleware `ScopeRegionDepo` menolak 403 semua input
`kode_depo` asing, padahal desain (didefinisikan oleh test + frontend) menetapkan kontrak **per modul**:

- **Receiving index & SjValidation index:** user scoped mengirim kode depo asing → **403 "Access
  denied: depo isolation"** (kini ditegakkan di controller masing-masing).
- **Stats/gate/rencana-kirim/email-recipients:** soft (abaikan/clamp/izinkan sesuai modul).
- **`depot.view_all`** = pembaca global; user scope `region` tetap terbatas depot region-nya sendiri
  meski punya `view_all`.
- **Bug cast:** middleware membandingkan `region_id` dengan `(int)` — kode region seperti `"REG-A"`
  jatuh ke `0 === 0` sehingga isolasi region tembus. Kini pakai `sameRegion()` (string).

Ditambah perbaikan login stateless (`AuthController`): request tanpa session tidak lagi 500
("Session store not set"), `Auth::guard('web')` eksplisit, region-gate hanya ditegakkan untuk
request stateful (SPA). Test `HierarchyManagementTest` ada pasangan assertion **terbalik** dari judul
dan aturan arsitektur (`.ai/rules/app.md`) — test dibereskan sesuai aturan (region scope: boleh di
region sendiri 201, lintas region 403 + memastikan tidak ada baris dibuat).

---

## Frontend (3 kegagalan themeGuard → 0)

- `src/app/depo-identify/page.tsx`, `src/app/region-access/page.tsx`: ditulis ulang dari inline
  style dengan 21 literal hex → token kelas aplikasi (`bg-background`, `bg-card`, `input-field`,
  `text-ink-fg(-muted)`, banner `emerald-50`/`red-50`). Kontrak data dipertahankan
  (`sessionStorage.region_access` tetap menulis `{ port, regionCode, regionId }`).
- `src/app/access-gateway/pages/{login,depo-identify,region-access}/page.tsx` (mockup statis):
  inks `text-slate-300/400` di panel gelap → `text-ink-fg`/`text-ink-fg-muted`; plate input
  `bg-white/5` → `input-field`.
- Bonus: typo `disabled:ursor-not-allowed` dibetulkan.

---

## Hasil pengujian

| Item | Hasil |
| --- | --- |
| `vendor/bin/phpunit` (PHPUnit 12.5.34) | **856 tests, 3.541 assertions — OK (0 fail)** ✔️ |
| `npm test` (vitest) | **419/419 passed** ✔️ |
| `npm run lint` (eslint) | bersih ✔️ |
| Pint (`--dirty`) | `passed` pada semua file backend yang disentuh ✔️ |
| Smoke 115 rute GET tanpa auth | 115/115 menolak (401/404), tidak ada kebocoran ✔️ |
| Security headers (proxy + API) | `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, HSTS, CSP nonce ✔️ |
| CSRF | token mismatch ditolak (419/422) tanpa X-XSRF-TOKEN ✔️ |
| composer audit | 0 advisori ✔️ |
| npm audit (prod deps) | 0 vuln ✔️ |
| sqlite integrity / FK check | `ok` / bersih (52 tabel) ✔️ |

**Catatan:** `composer.json` mendeklarasikan `phpunit/phpunit ^12.5` tetapi binary hilang dari
`vendor/` (vendor tidak sinkron dengan lockfile) — dipulihkan lewat `composer install` (state lock
dipertahankan, bukan perubahan dependency).

---

## Temuan yang DIPERBAIKI (update 4 November 2026)

1. ✅ **`onezentra-web/.env` & `.env.local` kini mengarah `BACKEND_URL=http://127.0.0.1:8000`**
   (`SESSION_DOMAIN=null`, host-only). `npm run dev` tanpa override kini 100% lokal —
   diverifikasi live: `region-validate → depo-validate → login → dashboard` semuanya 200 via
   proxy. `.env.production` (gitignored, untuk build produksi) tetap memuat
   `https://api.onezentra.sbs`; deploy Hostinger men-set `BACKEND_URL` produksi lewat panel yang
   meng-override file repo. Catatan: `.env.local` DIDISTRIBUSIKAN via git (ter-track) — bitir
   kebiasaan menyimpan URL produksi di file yang ter-track.
2. ✅ **Paket perbaikan backend siap deploy ke produksi** (lihat runbook di bawah).

### Runbook deploy backend produksi (Hostinger VPS)```bash
cd /var/www/onezentra
sudo -u www-data git pull origin main
# jalankan migrasi baru (idempotent — guard hasColumn):
sudo -u www-data php artisan migrate --force
regenerate cache:
sudo -u www-data php artisan config:clear && sudo -u www-data php artisan config:cache
sudo -u www-data php artisan route:clear && sudo -u www-data php artisan route:cache
sudo -u www-data php artisan view:clear
sudo systemctl restart php8.4-fpm
# Verifikasi (harus 200/JSON valid — bukan 500 "Undefined property: stdClass::$id"):
curl -s https://api.onezentra.sbs/up -o /dev/null -w "%{http_code}\n"
curl -s -X POST https://api.onezentra.sbs/api/v1/region-validate \
  -H 'Content-Type: application/json' -d '{"region_code":"<KODE-REGION-PROD>"}'
# lalu jalankan queue worker restart bila supervisor menahan proses lama:
sudo supervisorctl restart all   # atau systemctl restart <queue-worker>
```

## Temuan yang TIDAK diubah kode (perlu keputusan pemilik)

1. ✅ ~~BACKEND_URL produksi di file env dev~~ — **selesai**, lihat atas.
2. 🔜 **Produksi perlu deploy ulang backend** dengan perbaikan region + migrasi `is_active` + route cache
   clear (runbook di atas — butuh akses SSH VPS pemilik).
3. `database/database.sqlite.sqlite` (0 byte) — artefak salah nama, aman dihapus.
4. `failed_jobs`: 1 job gagal (`StandarisasiTumpukan` not found) — tidak fatal, boleh dibersihkan
   (`queue:flush`) setelah pengecekan.
5. Permintaan `/health` periodik ±30 detik dari sumber tak dikenal terlihat di log serve — kemungkinan
   monitor eksternal; sahkan pemiliknya atau blokir bila tidak dikenal.
6. Sesi CLI test `php artisan test` tidak tersedia (preset testing Laravel tidak terpasang) — gunakan
   `vendor/bin/phpunit` (sesuai aturan proyek).
7. App mobile `onezentra_mobile/` tidak dinaudit kali ini (permintaan audit adalah sistem web); ada
   endpoint `mobile/login` Bearer yang terpisah.

## Daftar perubahan (working tree)

- `database/migrations/2026_11_03_214501_add_is_active_to_regions_table.php` (baru)
- `app/Http/Controllers/Api/V1/RegionDepoValidationController.php` (kontrak baru + `depo-options`)
- `app/Http/Controllers/Api/V1/AuthController.php` (login stateful/stateless guard)
- `app/Http/Controllers/Api/V1/ReceivingController.php`, `SjValidationController.php` (kontrak 403 + view_all)
- `app/Http/Middleware/ScopeRegionDepo.php` (hapus verifikasi kode depo; samakan region)
- `routes/api.php` (+1 route `depo-options`)
- `tests/Feature/HierarchyManagementTest.php` (assertion dibenarkan sesuai aturan)
- `onezentra-web/src/app/{region-access,depo-identify}/page.tsx` + `access-gateway/pages/*/` (token tema)
- `.ai/rules/backend.md`, `.ai/rules/web.md` (rule abadi)
