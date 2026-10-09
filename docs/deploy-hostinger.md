# Runbook Deploy ONEZENTRA ke Hostinger

Panduan langkah demi langkah men-deploy **backend Laravel** + **web Next.js** ke
Hostinger, sehingga `BACKEND_URL` di web benar-benar mengarah ke API yang hidup.

> Aturan repo: **JANGAN** `migrate:fresh` / `db:wipe` / seed yang menghapus data
> tanpa konfirmasi. Semua perintah di sini non-destruktif (`migrate --force`
> hanya menjalankan migrasi yang belum jalan).

---

## 1. Arsitektur target (2 origin)

```
        Browser
           │  https://app.example.com   (hanya ke domain web)
           ▼
   ┌───────────────────────┐        proxy /api/v1/*  +  /sanctum/*
   │  Next.js (onezentra-web) │ ─────────────────────────────────────┐
   │  proxy.ts + rewrites     │   header Origin/Referer diteruskan   │
   └───────────────────────┘                                      ▼
           ▲                                        ┌──────────────────────────┐
           │  Set-Cookie diteruskan balik ke         │  Laravel API (backend)   │
           │  domain WEB (bukan domain API)          │  https://api.example.com │
           └─────────────────────────────────────────│  + MySQL + queue         │
                                                      └──────────────────────────┘
```

Yang penting dipahami:

- Browser **hanya** berkomunikasi dengan domain **web** (same-origin). Semua
  request `/api/v1/*` dan `/sanctum/*` di-proxy di sisi server Next ke
  `BACKEND_URL` (`onezentra-web/next.config.ts` rewrites + `onezentra-web/src/proxy.ts`).
- Cookie sesi (`laravel-session`) di-set pada **domain web**, karena proxy
  menyalin `Set-Cookie` dari backend ke respons browser.
- Karena itu **`SANCTUM_STATEFUL_DOMAINS` = domain WEB** (bukan domain API),
  supaya `Origin`/`Referer` yang diteruskan dianggap stateful → cookie dibaca.

Konsekuensi: kamu butuh **dua host/domain**:
`app.example.com` (web) dan `api.example.com` (backend), keduanya **HTTPS**.

---

## 2. Prasyarat

| Kebutuhan | Detail |
|---|---|
| Domain | 1 domain + 2 subdomain: `app.` (web) dan `api.` (backend) |
| GitHub | repo `5imonjs/project-onezentra`, branch `main` (privat tidak masalah) |
| Node | **≥ 20.9** (Next 16.3.4). Pilih Node 20/22 di panel |
| PHP | **≥ 8.3** (produksi app ini PHP 8.5), ekstensi: `mbstring xml curl zip gd bcmath intl mysql dom` |
| Database | MySQL/MariaDB |
| Redis | opsional (kalau `QUEUE_CONNECTION=redis` / `CACHE_STORE=redis`) |

**Pilihan infra di Hostinger:**

- **Direkomendasikan** — 1 VPS untuk backend (nginx + PHP-FPM + MySQL + queue),
  dan **Node.js hosting** (hPanel) untuk web. Bersih & terpisah.
- **Alternatif** — 1 VPS menjalankan keduanya (backend nginx/php-fpm + web via
  `next start`/PM2 di belakang nginx). Lebih murah, konfigurasi nginx lebih
  rumit. Runbook ini fokus jalur pertama, dengan catatan untuk jalur kedua.

> Backend **tidak butuh** asset build (scaffold Vite Laravel sudah dihapus
> 2026-10-09). Cukup `composer install`. Tidak perlu `npm run build` di backend.

---

## 3. Bagian A — Deploy backend Laravel (VPS)

### A1. Siapkan server (Ubuntu 24.04)

```bash
sudo apt update && sudo apt -y upgrade
sudo apt -y install nginx git unzip curl \
  php8.5-fpm php8.5-cli php8.5-mysql php8.5-mbstring php8.5-xml \
  php8.5-curl php8.5-zip php8.5-gd php8.5-bcmath php8.5-intl \
  mariadb-server redis-server

# Composer
curl -sS https://getcomposer.org/installer | php
sudo mv composer.phar /usr/local/bin/composer
```

### A2. Ambil kode

```bash
sudo mkdir -p /var/www/onezentra && sudo chown -R $USER:www-data /var/www/onezentra
git clone https://github.com/5imonjs/project-onezentra.git /var/www/onezentra
cd /var/www/onezentra
composer install --no-dev --optimize-autoloader
```

### A3. `.env` produksi

Buat database dulu, lalu isi `.env` (contoh nilai — ganti domain & secret):

```dotenv
APP_NAME=Laravel
APP_ENV=production
APP_DEBUG=false
APP_KEY=                       # diisi oleh: php artisan key:generate
APP_URL=https://api.example.com
FRONTEND_URL=https://app.example.com

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=onezentra_warehouse
DB_USERNAME=onezentra
DB_PASSWORD=***wajib-diisi***

SESSION_DRIVER=database
SESSION_ENCRYPT=true
SESSION_SECURE_COOKIE=true     # WAJIB true di HTTPS
SESSION_SAME_SITE=strict       # 'lax' bila perlu navigasi lintas-site
SANCTUM_STATEFUL_DOMAINS=app.example.com   # domain WEB, tanpa skema/port

CACHE_STORE=database           # production beban tinggi: redis
QUEUE_CONNECTION=database      # production beban tinggi: redis
LOG_CHANNEL=stack
LOG_STACK=single
LOG_LEVEL=warning              # jangan debug di prod

MAIL_MAILER=smtp
MAIL_HOST=smtp.example.com
MAIL_PORT=587
MAIL_ENCRYPTION=tls
MAIL_USERNAME=***
MAIL_PASSWORD=***wajib-diisi***
MAIL_FROM_ADDRESS="noreply@example.com"
MAIL_FROM_NAME="${APP_NAME}"
```

**⚠️ Jebakan nama cookie.** Cookie sesi = `Str::slug(APP_NAME) . '-session'`
(`config/session.php`). Dengan `APP_NAME=Laravel` → `laravel-session` (default
yang diharapkan proxy web). Kalau `APP_NAME` diganti (mis. `OneZentra` →
`onezentra-session`), kamu **wajib** set `SESSION_COOKIE_NAME=onezentra-session`
di env **web** (bagian B). Kalau tidak, user akan selalu dipantulkan ke `/login`.

`FRONTEND_URL` juga mengisi allowlist CORS (`config/cors.php`,
`supports_credentials=true`) dan ikut membentuk stateful domains. Set eksplisit
`SANCTUM_STATEFUL_DOMAINS` agar tidak bergantung derivasi.

### A4. Inisialisasi aplikasi

```bash
cd /var/www/onezentra
php artisan key:generate
php artisan migrate --force        # BUKAN migrate:fresh
php artisan storage:link           # foto validasi/label & upload import
php artisan config:cache
php artisan route:cache
php artisan view:cache

sudo chown -R www-data:www-data storage bootstrap/cache
sudo find storage bootstrap/cache -type d -exec chmod 775 {} \;
```

Setiap kali `.env` berubah: `php artisan config:clear && php artisan config:cache`
(config ter-cache tidak membaca env baru).

### A5. Nginx + TLS

`/etc/nginx/sites-available/onezentra-api`:

```nginx
server {
    listen 80;
    server_name api.example.com;
    root /var/www/onezentra/public;
    index index.php;
    client_max_body_size 20M;               # upload Excel/foto

    location / { try_files $uri $uri/ /index.php?$query_string; }

    location ~ \.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/run/php/php8.5-fpm.sock;
    }

    location ~ /\.(?!well-known).* { deny all; }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/onezentra-api /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo apt -y install certbot python3-certbot-nginx
sudo certbot --nginx -d api.example.com     # HTTPS otomatis
```

### A6. Queue worker

`app/Jobs/LogUserActivity.php` mengimplementasikan `ShouldQueue`. Tanpa worker,
job menumpuk di tabel `jobs` (log aktivitas tertunda). Pilih salah satu:

- **Worker (disarankan):** `/etc/systemd/system/onezentra-queue.service`:

  ```ini
  [Unit]
  Description=ONEZENTRA queue worker
  After=network.target mariadb.service

  [Service]
  User=www-data
  WorkingDirectory=/var/www/onezentra
  ExecStart=/usr/bin/php artisan queue:work --sleep=3 --tries=3
  Restart=always

  [Install]
  WantedBy=multi-user.target
  ```

  ```bash
  sudo systemctl enable --now onezentra-queue
  ```

- **Tanpa worker:** set `QUEUE_CONNECTION=sync` di `.env` (job jalan inline).

### A7. Scheduler (cron)

`routes/console.php` menjadwalkan `sanctum:prune-expired --hours=24` harian:

```bash
sudo crontab -u www-data -e
# tambahkan:
* * * * * cd /var/www/onezentra && php artisan schedule:run >> /dev/null 2>&1
```

---

## 4. Bagian B — Deploy web Next.js (Hostinger Node.js hosting)

Di **hPanel → Advanced → Node.js** (atau "Deploy from GitHub"):

| Setting | Nilai |
|---|---|
| Repository | `https://github.com/5imonjs/project-onezentra.git` |
| Branch | `main` |
| **Root directory** | **`onezentra-web`** ← WAJIB (app ada di subfolder) |
| Node version | 20 atau 22 (≥ 20.9) |
| Build command | `npm run build` |
| Start command | `npm run start` |

Environment variables (set **sebelum** build pertama — `BACKEND_URL` dipakai
saat build untuk `rewrites` + `images.remotePatterns`):

```dotenv
BACKEND_URL=https://api.example.com
# SESSION_COOKIE_NAME=onezentra-session   # hanya bila APP_NAME backend ≠ Laravel
# NEXT_PUBLIC_API_URL=                    # biarkan kosong -> default '/api/v1' (same-origin)
```

Aktifkan **SSL** untuk domain web (otomatis gratis di Hostinger). Setelah
deploy, tiap kali push ke `main` Hostinger menarik ulang + build ulang.

> Kenapa Root Directory harus `onezentra-web`: root repo hanya punya
> `package.json` delegasi (`cd onezentra-web && ...`) dan `next` tidak
> ter-install di root — kalau dibiarkan `/`, build pasti gagal.

> Kalau memilih satu VPS untuk keduanya, jalankan web dengan
> `cd onezentra-web && npm ci && npm run build && pm2 start "npm run start" --name oz-web`
> lalu reverse-proxy nginx `app.example.com` → `http://127.0.0.1:3000`
> (`proxy_pass` harus mengirim header `Host`, `X-Forwarded-*`).

---

## 5. Bagian C — Database produksi

### Opsi 1 — pindahkan data yang ada (paling realistis)

```bash
# Di mesin LOKAL (dari MySQL onezentra_warehouse):
mysqldump -u root -p --single-transaction --routines --triggers \
  onezentra_warehouse | gzip > onezentra.sql.gz

# Kirim ke server, lalu di server:
gunzip -c onezentra.sql.gz | mysql -u onezentra -p onezentra_warehouse
```

Setelah import, jalankan `php artisan migrate --force` untuk migrasi yang lebih
baru, lalu `config:cache`.

### Opsi 2 — mulai bersih

```bash
php artisan migrate --force
php artisan db:seed --class=PermissionSeeder --force   # izin/level
# buat user admin pertama (password kuat) — jangan pakai akun dev ga@/bh@
php artisan tinker --execute 'App\Models\User::create([...]);'
```

**APP_KEY penting:** jangan regenerate setelah ada data terenkripsi
(sesi terenkripsi, kolom terenkripsi). Simpan `APP_KEY` produksi baik-baik.

---

## 6. Bagian D — Verifikasi end-to-end

```bash
# 1) API hidup & menjawab JSON (401 = benar untuk tamu, bukan 500/HTML)
curl -i https://api.example.com/api/v1/user

# 2) Cek cookie sesi setelah login: nama, HttpOnly, Secure
#    (DevTools → Application → Cookies di https://app.example.com)
```

Checklist manual:

- [ ] Buka `https://app.example.com` → redirect ke `/login` (belum ada cookie).
- [ ] Login → masuk `/dashboard` tanpa memantul balik ke `/login`.
- [ ] Network tab: request ke `/api/v1/*` berstatus 200 (bukan 401/419/502).
- [ ] Import batch expired (upload Excel) → file tersimpan (uji `storage:link`).
- [ ] Gambar dari API tampil (uji `images.remotePatterns` dari `BACKEND_URL`).
- [ ] Kirim notifikasi email test dari menu Penerima Email → masuk SMTP.
- [ ] `php artisan queue:work` (atau `sync`) mencatat aktivitas.
- [ ] Cron `schedule:run` jalan (cek `php artisan schedule:list`).

---

## 7. Troubleshooting

| Gejala | Penyebab umum | Perbaikan |
|---|---|---|
| Login selalu balik ke `/login` | `SANCTUM_STATEFUL_DOMAINS` bukan domain **web**; `SESSION_SECURE_COOKIE=false` di HTTPS; nama cookie beda (`APP_NAME` ≠ Laravel tanpa `SESSION_COOKIE_NAME`) | Perbaiki env backend lalu `config:cache`; samakan nama cookie di env web |
| `419 Page Expired` / CSRF | Origin/Referer tidak stateful | Pastikan `SANCTUM_STATEFUL_DOMAINS`/`FRONTEND_URL` = origin web tepat (tanpa trailing slash) |
| `502 Backend tidak dapat dihubungi` | `BACKEND_URL` salah / API tak dijangkau dari server web / firewall | Cek `curl` `BACKEND_URL` dari server web; buka port 443 |
| Semua API `401` | Backend tak mengenali request sebagai dari frontend | Cek `stateful`, dan header `Origin`/`Referer` diteruskan (jangan matikan proxy) |
| Gambar API tidak muncul | `BACKEND_URL` belum diset saat build | Set env lalu build/rebuild web |
| Perubahan `.env` backend tak berefek | `config:cache` menyimpan nilai lama | `php artisan config:clear && php artisan config:cache` |
| Web build gagal di Hostinger | Root Directory bukan `onezentra-web` | Set Root Directory = `onezentra-web`, rebuild |
| Kolom "Kode Batch" banyak `-` | Baris warisan pra-migrasi | Jalankan migrasi backfill; jangan paksa manual |

---

## 8. Ringkasan urutan deploy

1. Siapkan VPS, install nginx/PHP/MySQL/Redis (A1).
2. Clone repo + `composer install` (A2).
3. Isi `.env` produksi — **domain web** di `FRONTEND_URL` + `SANCTUM_STATEFUL_DOMAINS` (A3).
4. `key:generate` → `migrate --force` → `storage:link` → `config/route/view:cache` (A4).
5. Nginx vhost + `certbot` HTTPS (A5).
6. Queue worker + cron scheduler (A6–A7).
7. Hostinger Node.js hosting: Root Directory `onezentra-web`, env `BACKEND_URL`, build `npm run build`, start `npm run start`, SSL (B).
8. Pindahkan/import database (C).
9. Verifikasi end-to-end (D).
