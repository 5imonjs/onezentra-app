# Runbook Deploy ONEZENTRA ke Hostinger

Panduan langkah demi langkah men-deploy **backend Laravel** + **web Next.js** ke
Hostinger, sehingga `BACKEND_URL` di web benar-benar mengarah ke API yang hidup.

Domain final yang dipakai runbook ini:

| Peran | URL |
|---|---|
| Web (Next.js) | `https://onezentra.sbs` |
| API (Laravel) | `https://api.onezentra.sbs` |

> Aturan repo: **JANGAN** `migrate:fresh` / `db:wipe` / seed yang menghapus data
> tanpa konfirmasi. Semua perintah di sini non-destruktif (`migrate --force`
> hanya menjalankan migrasi yang belum jalan).

---

## 1. Arsitektur target (2 origin)

```
        Browser
           │  https://onezentra.sbs        (browser HANYA ke domain web)
           ▼
   ┌──────────────────────────┐   proxy  /api/v1/*  +  /sanctum/*
   │ Next.js (onezentra-web)   │ ─────────────────────────────────────┐
   │ proxy.ts + next.config    │   header Origin/Referer diteruskan   │
   └──────────────────────────┘                                      ▼
           ▲                                        ┌────────────────────────────┐
           │  Set-Cookie diteruskan balik ke         │ Laravel API (backend)      │
           │  domain WEB (bukan domain API)          │ https://api.onezentra.sbs  │
           └─────────────────────────────────────────│ + MySQL + queue            │
                                                      └────────────────────────────┘
```

Yang penting dipahami:

- Browser **hanya** berkomunikasi dengan domain **web** (same-origin). Semua
  request `/api/v1/*` dan `/sanctum/*` di-proxy di sisi server Next ke
  `BACKEND_URL` (`onezentra-web/next.config.ts` rewrites + `onezentra-web/src/proxy.ts`).
- Cookie sesi (`laravel-session`) di-set pada **domain web**, karena proxy
  menyalin `Set-Cookie` dari backend ke respons browser.
- Karena itu **`SANCTUM_STATEFUL_DOMAINS` = domain WEB** (`onezentra.sbs`),
  bukan domain API — supaya `Origin`/`Referer` yang diteruskan dianggap stateful
  → cookie dibaca.

Konsekuensi: butuh **dua host**, yaitu `onezentra.sbs` (web) dan
`api.onezentra.sbs` (backend), keduanya **HTTPS**.

---

## 2. Prasyarat

| Kebutuhan | Detail |
|---|---|
| Domain | `onezentra.sbs` (web) + subdomain `api.onezentra.sbs` (backend) |
| GitHub | repo `5imonjs/project-onezentra`, branch `main` (privat tidak masalah) |
| Node | **≥ 20.9** (Next 16.3.4). Pilih Node 20/22 di panel |
| PHP | **≥ 8.3** (`composer.json` mensyaratkan `^8.3`), ekstensi: `mbstring xml curl zip gd bcmath intl mysql dom` |
| Database | MySQL/MariaDB |
| Redis | opsional (hanya bila `QUEUE_CONNECTION=redis` / `CACHE_STORE=redis`) |

**Pilihan infra di Hostinger:**

- **Jalur 1 (dipakai runbook ini)** — **Web App (Node.js hosting)** untuk web di
  `onezentra.sbs`, dan **PHP hosting (hPanel)** untuk Laravel di
  `api.onezentra.sbs`. Keduanya di plan Hostinger (Business/Cloud) yang sama.
- **Jalur 2 (alternatif)** — **1 VPS** untuk backend (nginx + PHP-FPM + MySQL +
  queue) dan Node.js hosting untuk web. Lebih leluasa, tapi Anda mengelola
  server sendiri. Lihat Bagian A → Jalur 2.

> Backend **tidak butuh** asset build (scaffold Vite Laravel sudah dihapus
> 2026-10-09). Cukup `composer install`. Tidak perlu `npm run build` di backend.

---

## 3. Bagian A — Deploy backend Laravel

Pilih **salah satu** jalur. Jalur 1 asumsi plan Hostinger tanpa akses root.

### Jalur 1 — Laravel di Hostinger PHP hosting (hPanel)  ← diminta

Hostinger tidak mengizinkan mengubah document root situs menjadi
`public/` secara bebas, jadi polanya: **seluruh app Laravel ditaruh di dalam
`public_html` domain/subdomain, lalu `.htaccess` mengarahkan semua request ke
`public/`**. Ini pola resmi Hostinger.

#### A1. Buat subdomain + PHP

1. hPanel → **Domains / Websites** → tambah **Subdomain**: `api.onezentra.sbs`.
   Catat folder-nya, mis. `~/domains/api.onezentra.sbs/public_html`.
2. Set **versi PHP** subdomain ke **8.3 atau lebih baru** (hPanel → PHP
   Configuration). Aktifkan ekstensi: `mbstring, xml, curl, zip, gd, bcmath,
   intl, mysql, dom, fileinfo, openssl`.
3. Aktifkan **SSH Access** (hPanel → Advanced → SSH Access). Catat host, user
   (`uXXXXXXXX`), dan port.

#### A2. Ambil kode (SSH)

```bash
# dari folder public_html subdomain
cd ~/domains/api.onezentra.sbs/public_html

# clone isi repo (repo root = aplikasi Laravel)
git clone https://github.com/5imonjs/project-onezentra.git .
```

> Repo adalah monorepo (berisi `onezentra-web/`, `onezentra_mobile/`). Itu tidak
> mengganggu: `.htaccess` di langkah A4 hanya mengekspos `public/`, sisanya
> tidak dapat diakses dari web.

#### A3. Install dependency

```bash
cd ~/domains/api.onezentra.sbs/public_html

# composer tersedia global di banyak plan; kalau tidak ada:
php -r "copy('https://getcomposer.org/installer', 'composer-setup.php');"
php composer-setup.php --quiet && rm composer-setup.php
# lalu pakai `php composer.phar` sebagai ganti `composer` di bawah

php composer.phar install --no-dev --optimize-autoloader
```

Jika `php -v` di SSH bukan 8.3+, pakai binary berversi (mis. `php8.3`) atau
sesuaikan PATH agar CLI memakai versi yang sama dengan web.

#### A4. `.htaccess` di root (WAJIB)

Buat file `~/domains/api.onezentra.sbs/public_html/.htaccess`:

```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteRule ^(.*)$ public/$1 [L]
</IfModule>
```

Ini membuat `https://api.onezentra.sbs/...` selalu dilayani dari
`public/...`, sementara `.env`, `vendor/`, `storage/` tetap berada di luar jangkauan
web. Kalau muncul loop rewrite, ganti baris `RewriteRule` menjadi:

```apache
  RewriteCond %{REQUEST_URI} !^/public/
  RewriteRule ^(.*)$ public/$1 [L]
```

#### A5. `.env` produksi (dan bikin database dulu)

Buat DB MySQL di hPanel (hPanel → Databases → MySQL Databases), lalu isi
`public_html/.env`:

```dotenv
APP_NAME=Laravel
APP_ENV=production
APP_DEBUG=false
APP_KEY=                       # diisi oleh: php artisan key:generate
APP_URL=https://api.onezentra.sbs
FRONTEND_URL=https://onezentra.sbs

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=uXXXXXXXX_onezentra
DB_USERNAME=uXXXXXXXX_onezentra
DB_PASSWORD=***wajib-diisi***

SESSION_DRIVER=database
SESSION_ENCRYPT=true
SESSION_SECURE_COOKIE=true     # WAJIB true di HTTPS
SESSION_SAME_SITE=lax          # 'lax' karena web & api beda host (subdomain)
SESSION_DOMAIN=null            # biarkan host-only -> cookie diset di domain web oleh proxy
SANCTUM_STATEFUL_DOMAINS=onezentra.sbs   # domain WEB, tanpa skema/port

CACHE_STORE=database
QUEUE_CONNECTION=sync          # shared hosting tanpa worker -> job jalan inline

LOG_CHANNEL=stack
LOG_STACK=single
LOG_LEVEL=warning              # jangan debug di prod

MAIL_MAILER=smtp
MAIL_HOST=smtp.example.com
MAIL_PORT=587
MAIL_ENCRYPTION=tls
MAIL_USERNAME=***
MAIL_PASSWORD=***wajib-diisi***
MAIL_FROM_ADDRESS="noreply@onezentra.sbs"
MAIL_FROM_NAME="${APP_NAME}"
```

**⚠️ Jebakan nama cookie.** Cookie sesi = `Str::slug(APP_NAME) . '-session'`
(`config/session.php`). Dengan `APP_NAME=Laravel` → `laravel-session` (default
yang diharapkan proxy web). Kalau `APP_NAME` diganti (mis. `OneZentra` →
`onezentra-session`), Anda **wajib** set `SESSION_COOKIE_NAME=onezentra-session`
di env **web** (Bagian B). Kalau tidak, user akan selalu dipantulkan ke `/login`.

`FRONTEND_URL` juga mengisi allowlist CORS (`config/cors.php`,
`supports_credentials=true`) dan ikut membentuk stateful domains. Set eksplisit
`SANCTUM_STATEFUL_DOMAINS` agar tidak bergantung derivasi.

#### A6. Inisialisasi aplikasi (SSH)

```bash
cd ~/domains/api.onezentra.sbs/public_html
php artisan key:generate
php artisan migrate --force        # BUKAN migrate:fresh
php artisan storage:link           # foto validasi/label & upload import
php artisan config:cache
php artisan route:cache
php artisan view:cache
```

Pastikan `storage/` dan `bootstrap/cache/` writable (umumnya sudah; kalau perlu
`chmod -R 775 storage bootstrap/cache`).

Setiap kali `.env` berubah: `php artisan config:clear && php artisan config:cache`
(config ter-cache tidak membaca env baru).

#### A7. HTTPS subdomain

hPanel → SSL → pasang **Let's Encrypt** gratis untuk `api.onezentra.sbs`, lalu
aktifkan "Force HTTPS".

#### A8. Cron scheduler

`routes/console.php` menjadwalkan `sanctum:prune-expired --hours=24` harian.
hPanel → Advanced → **Cron Jobs**, buat satu job per menit:

```
/usr/bin/php /home/uXXXXXXXX/domains/api.onezentra.sbs/public_html/artisan schedule:run
```

(Ganti `uXXXXXXXX` dengan user SSH Anda.)

#### A9. Queue

Plan PHP hosting tidak menjalankan proses long-running, jadi `QUEUE_CONNECTION=sync`
(job `LogUserActivity` jalan inline). Kalau plan Anda punya cron/worker khusus,
boleh dialihkan ke `database` + worker — tapi `sync` paling sederhana dan cukup
untuk saat ini.

---

### Jalur 2 — Laravel di VPS (nginx + PHP-FPM)

#### B1. Siapkan server (Ubuntu 24.04)

```bash
sudo apt update && sudo apt -y upgrade
sudo apt -y install nginx git unzip curl \
  php8.3-fpm php8.3-cli php8.3-mysql php8.3-mbstring php8.3-xml \
  php8.3-curl php8.3-zip php8.3-gd php8.3-bcmath php8.3-intl \
  mariadb-server redis-server

# Composer
curl -sS https://getcomposer.org/installer | php
sudo mv composer.phar /usr/local/bin/composer
```

#### B2. Ambil kode

```bash
sudo mkdir -p /var/www/onezentra && sudo chown -R $USER:www-data /var/www/onezentra
git clone https://github.com/5imonjs/project-onezentra.git /var/www/onezentra
cd /var/www/onezentra
composer install --no-dev --optimize-autoloader
```

#### B3. `.env` produksi

Sama seperti A5, tetapi ganti nilai DB ke DB VPS dan (opsional) redis:

```dotenv
APP_URL=https://api.onezentra.sbs
FRONTEND_URL=https://onezentra.sbs
SANCTUM_STATEFUL_DOMAINS=onezentra.sbs
SESSION_SECURE_COOKIE=true
SESSION_SAME_SITE=lax
SESSION_DOMAIN=null
QUEUE_CONNECTION=database      # atau redis
CACHE_STORE=database           # atau redis
```

#### B4. Inisialisasi

```bash
cd /var/www/onezentra
php artisan key:generate
php artisan migrate --force        # BUKAN migrate:fresh
php artisan storage:link
php artisan config:cache && php artisan route:cache && php artisan view:cache

sudo chown -R www-data:www-data storage bootstrap/cache
sudo find storage bootstrap/cache -type d -exec chmod 775 {} \;
```

#### B5. Nginx + TLS

`/etc/nginx/sites-available/onezentra-api`:

```nginx
server {
    listen 80;
    server_name api.onezentra.sbs;
    root /var/www/onezentra/public;
    index index.php;
    client_max_body_size 20M;               # upload Excel/foto

    location / { try_files $uri $uri/ /index.php?$query_string; }

    location ~ \.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/run/php/php8.3-fpm.sock;
    }

    location ~ /\.(?!well-known).* { deny all; }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/onezentra-api /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo apt -y install certbot python3-certbot-nginx
sudo certbot --nginx -d api.onezentra.sbs     # HTTPS otomatis
```

#### B6. Queue worker

`app/Jobs/LogUserActivity.php` mengimplementasikan `ShouldQueue`. Tanpa worker,
job menumpuk di tabel `jobs`. Pilih salah satu:

- **Worker:** `/etc/systemd/system/onezentra-queue.service`:

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

- **Tanpa worker:** `QUEUE_CONNECTION=sync`.

#### B7. Scheduler (cron)

```bash
sudo crontab -u www-data -e
# tambahkan:
* * * * * cd /var/www/onezentra && php artisan schedule:run >> /dev/null 2>&1
```

---

## 4. Bagian B — Deploy web Next.js (Hostinger Web App / Node.js)

Di **hPanel → Websites → Add Website → Node.js web app → Import Git repository**:

| Setting | Nilai |
|---|---|
| Repository | `5imonjs/project-onezentra` (branch `main`) |
| Framework preset | **Next.js** |
| Branch | `main` |
| Node.js version | **22** (minimal 20.9) |
| **Root directory** | **`onezentra-web`** ← WAJIB |
| Build command | **`build`** |
| Package manager | **npm** |
| Output directory | **`.next`** |
| Entry file | **kosongkan** (Next.js diabaikan) |

Environment variables (isi **sebelum** klik Deploy — `BACKEND_URL` dipakai
saat build untuk `rewrites` + `images.remotePatterns`):

```dotenv
NEXT_PUBLIC_API_URL=/api/v1
BACKEND_URL=https://api.onezentra.sbs
# SESSION_COOKIE_NAME=onezentra-session   # hanya bila APP_NAME backend ≠ Laravel
```

Setelah build hijau, pasang domain `onezentra.sbs` ke Web App ini + aktifkan
**SSL**. Tiap push ke `main` memicu build ulang otomatis.

> **Kenapa Root Directory harus `onezentra-web`:** repo monorepo — root repo
> adalah aplikasi Laravel (PHP), sedangkan web Next.js ada di subfolder. Root
> repo hanya punya `package.json` delegasi (`cd onezentra-web && ...`) dan `next`
> tidak ter-install di root; kalau dibiarkan `/`, build pasti gagal.

> **Jalur satu VPS untuk keduanya:** jalankan web dengan
> `cd onezentra-web && npm ci && npm run build && pm2 start "npm run start" --name oz-web`
> lalu reverse-proxy nginx `onezentra.sbs` → `http://127.0.0.1:3000`
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

> Untuk Hostinger hPanel: import `.sql.gz` lewat **phpMyAdmin** (Databases →
> Enter phpMyAdmin → Import) ke database yang sudah dibuat di A5.

### Opsi 2 — mulai bersih

```bash
php artisan migrate --force
php artisan db:seed --class=PermissionSeeder --force   # izin/level — KONFIRMASI dulu
# buat user admin pertama (password kuat) — jangan pakai akun dev ga@/bh@
php artisan tinker --execute 'App\Models\User::create([...]);'
```

**APP_KEY penting:** jangan regenerate setelah ada data terenkripsi
(sesi terenkripsi, kolom terenkripsi). Simpan `APP_KEY` produksi baik-baik.

---

## 6. Bagian D — Verifikasi end-to-end

```bash
# 1) API hidup & menjawab JSON (401 = benar untuk tamu, bukan 500/HTML)
curl -i https://api.onezentra.sbs/api/v1/user

# 2) Cek cookie sesi setelah login: nama, HttpOnly, Secure
#    (DevTools → Application → Cookies di https://onezentra.sbs)
```

Checklist manual:

- [ ] Buka `https://onezentra.sbs` → redirect ke `/login` (belum ada cookie).
- [ ] Login → masuk `/dashboard` tanpa memantul balik ke `/login`.
- [ ] Network tab: request ke `/api/v1/*` berstatus 200 (bukan 401/419/502).
- [ ] Import batch expired (upload Excel) → file tersimpan (uji `storage:link`).
- [ ] Gambar dari API tampil (uji `images.remotePatterns` dari `BACKEND_URL`).
- [ ] Kirim notifikasi email test dari menu Penerima Email → masuk SMTP.
- [ ] Queue (`sync` atau worker) mencatat aktivitas.
- [ ] Cron `schedule:run` jalan (cek `php artisan schedule:list`).

---

## 7. Troubleshooting

| Gejala | Penyebab umum | Perbaikan |
|---|---|---|
| Login selalu balik ke `/login` | `SANCTUM_STATEFUL_DOMAINS` bukan domain **web**; `SESSION_SECURE_COOKIE=false` di HTTPS; nama cookie beda (`APP_NAME` ≠ Laravel tanpa `SESSION_COOKIE_NAME`) | Perbaiki env backend lalu `config:cache`; samakan nama cookie di env web |
| `419 Page Expired` / CSRF | Origin/Referer tidak stateful | Pastikan `SANCTUM_STATEFUL_DOMAINS`/`FRONTEND_URL` = origin web tepat (tanpa trailing slash) |
| `502 Backend tidak dapat dihubungi` | `BACKEND_URL` salah / API tak dijangkau dari server web / firewall | Cek `curl` `BACKEND_URL` dari server web; buka port 443 |
| Semua API `401` | Backend tak mengenali request sebagai dari frontend | Cek `stateful`, dan header `Origin`/`Referer` diteruskan (jangan matikan proxy) |
| API mengembalikan halaman/HTML bukan JSON | `.htaccess` rewrite belum ada / salah | Pastikan A4 terpasang; `https://api.onezentra.sbs/api/v1/user` harus JSON 401 |
| Tampil 404 di semua rute termasuk `/` | `.htaccess` mengarah ke `public/` tapi folder `public/` tak ada/salah lokasi | Cek struktur: `public_html/public/index.php` harus ada |
| Gambar API tidak muncul | `BACKEND_URL` belum diset saat build | Set env lalu build/rebuild web di Hostinger |
| Perubahan `.env` backend tak berefek | `config:cache` menyimpan nilai lama | `php artisan config:clear && php artisan config:cache` |
| Web build gagal di Hostinger | Root Directory bukan `onezentra-web` | Set Root Directory = `onezentra-web`, rebuild |
| `composer install` gagal di SSH | Ekstensi PHP kurang / versi PHP CLI beda | Aktifkan ekstensi di hPanel; pakai binary `php8.3` |
| Kolom "Kode Batch" banyak `-` | Baris warisan pra-migrasi | Jalankan migrasi backfill; jangan paksa manual |

---

## 8. Ringkasan urutan deploy

1. Backend: buat subdomain `api.onezentra.sbs` + set PHP 8.3 + aktifkan SSH (A1).
2. Clone repo ke `public_html`, `composer install --no-dev` (A2–A3).
3. Pasang `.htaccess` rewrite ke `public/` (A4).
4. Buat DB + isi `.env` produksi — **domain web** di `FRONTEND_URL` +
   `SANCTUM_STATEFUL_DOMAINS` (A5).
5. `key:generate` → `migrate --force` → `storage:link` → `config/route/view:cache` (A6).
6. SSL subdomain + cron `schedule:run`; queue `sync` (A7–A9).
7. Web: Hostinger **Node.js web app**, Root Directory `onezentra-web`,
   env `BACKEND_URL=https://api.onezentra.sbs`, build `build`, output `.next`,
   lalu pasang domain `onezentra.sbs` + SSL (Bagian B).
8. Pindahkan/import database lewat phpMyAdmin atau `mysqldump|mysql` (Bagian C).
9. Verifikasi end-to-end (Bagian D).
