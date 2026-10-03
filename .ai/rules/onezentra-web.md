---
paths:
  - 'onezentra-web/**'
---

# Onezentra Web

## Brand logo = public/LOGO.png (white, transparent bg)
Brand logo asset is onezentra-web/public/LOGO.png (645KB, 8451x2048, WHITE on transparent — only visible on dark backgrounds). Used in Sidebar header (expanded: w-full max-h-14 object-left; collapsed: w-8 in a chip) and login page (left panel + small chip). Favicon set via metadata icons "/LOGO.png".

## Design tokens: dark aurora + light, chosen by user (globe)
Satu design system untuk seluruh aplikasi, DNA-nya sama dengan halaman login:
indigo primary, teal accent, Roboto. Tema **terang/gelap dipilih user**.

Ramp netral di `globals.css` **didefinisikan per PERAN, bukan per terang-gelap**:
`gray-50` = permukaan terdalam, `200` = card, `300` = border, `400/500` = teks
muted, `600/700` = body, `800/900` = judul. Di gelap ramp itu berjalan
gelap→terang; di terang terang→gelap. Karena berbasis peran,
`bg-gray-200` / `text-gray-900` tetap benar saat tema ditukar — **tidak ada
varian `dark:` di halaman mana pun**.

Semua warna dilayani variabel `--oz-*` yang didefinisikan dua kali: `:root`
(terang, default) dan `[data-theme='dark']` (gelap). Skala status likewise,
sehingga triplet `bg-X-50 text-X-600/700 border-X-200` terbaca di kedua tema.

**WAJIB:** saat menambah keluarga warna baru, remap SELURUH-nya di kedua blok
dan di `@theme inline` — jangan hanya emerald/amber/red/blue/orange. Yang pernah
terlewat: `cyan` (15), `teal` (23), `sky` (27), `purple` (20), `violet` (11),
`yellow` (12), `pink` (2), `lime` (2), dan `rose` (2). Gejalanya: blok putih
menyala di dark dan teks label hilang. Warna-warna itu justru yang dipakai chart
dashboard. **`rose` juga sempat dipakai di `biaya-thl` + `email-recipients` dan
sudah sekarang punya ramp sendiri** — jangan dikembalikan ke palet default.

### Keluarga warna yang TIDAK terdaftar di @theme = bom kontras diam-diam
Tailwind v4 hanya membalik nilai yang dideklarasikan lewat `@theme`. Keluarga
yang tidak terdaftar **diam-diam jatuh ke palet default Tailwind**: nilainya
`oklch(...)` STATIS yang tidak bergerak saat ganti tema. Digabung ramp netral
yang justru membalik, hasilnya **teks terang di atas latar terang**.

Kasus yang sudah shipped: toast sukses `bg-green-50` + `text-gray-700`. Di light
theme hijau muda + teks gelap = normal (9.89:1), di dark `text-gray-700`
menjadi #e2e8f0 (putih) sementara `bg-green-50` tetap hijau muda statis →
**1.18:1, praktis tak terlihat**. Karena light tema-nya sehat, bug ini
tidak terlihat kalau cuma salah satu tema yang dicek. `green` sudah diganti
`emerald` (warna sukses kanonik app ini, sama dengan `.badge-success`).

Guard: `themeContrast.test.ts` → "palette families are registered in @theme",
yang memindai SELURUH `src/` dan membandingkan keluarga warna yang dipakai vs
terdaftar di `@theme`. Guard ini menangkap `rose` yang luput saat dicek manual.
Kalau guard ini perlu dilonggarkan, jangan dibuat diam — keluarga yang hilang
adalah bug, bukan false positive.

Gradient card-header TIDAK boleh berakhir di `to-white` (atau `from-white`):
header itu pudar ke sana, jadi di tema gelap seluruh strip menyala dan
menelan judulnya. Pakai `to-surface-card`.

**Gradient besar juga TIDAK boleh memakai ramp hue.** Yang/heran, `emerald`
ramp ikut terbalik: `emerald-700/800/900` gelap di light tapi **hampir putih**
di dark (`emerald-900` = `#f0fdf9`). Header tarif-retribusi pernah
`from-emerald-900 via-emerald-800 to-emerald-700` + `text-white`, jadi di dark
banner-nya jadi putih dan judulnya hilang_total. Panel besar yang membawa
heading `text-white` **wajib** `from-ink-900 via-ink-900 to-ink-800` — ramp
`ink` satu-satunya yang tidak bergantung tema. Hue ramp untuk aksen/chip,
bukan untuk permukaan besar.

Corollary: `hover:` pada elemen `bg-ink-*` juga harus tetap di ramp `ink`
(`hover:bg-ink-800`). `hover:bg-slate-700` di dark = `#e2e8f0`, jadi hover
tombol yang selalu gelap berubah jadi putih dengan teks putih.

Tombol **solid berwarna** dengan teks: jangan andalkan `text-white`, karena
`X-600` jadi pastel terang di dark (putih di `X-600` = 1.42:1). Pakai pasangan
yang ikut terbalik: `bg-X-700 text-X-50 hover:bg-X-800` (biru 6.16/14.24,
amber 4.84/15.07 — lolos AA di kedua tema).

Yang TIDAK berubah saat tema ditukar:
- `ink-700..950` — hero, header modal, tombol gelap. Selalu gelap, karena logo
  `LOGO.png` putih transparan dan tidak terbaca di kanvas terang.
- `primary-*`, `accent-*` — identitas brand.

### Menambah kelas baru

**Pola paling berbahaya adalah `bg-white` polos.** Di tema gelap itu bukan
"terang" — ia memotong blok putih ke kanvas, dan teks gelap yang biasa
bertumpu di atasnya jadi tidak terbaca. Yang BOLEH tetap putih hanya:
`bg-white/NN` (kaca di hero gelap), `rounded-full bg-white` (titik status di chip
saturat), dan thumb `ToggleSwitch` (konvensi komponen). Selebihnya wajib token.

Kasus yang pernah bocor — jangan diulang:
- lubang donut chart `bg-white` di tengah lingkaran, teks `text-gray-900`
  ikut tenggelam → pakai `bg-surface-card`.
- `focus:bg-white` pada input yang `bg-surface-raised` → fokus memicu blok putih.
- badge/avatar `rounded-full bg-white ... text-slate-500`.
- gradient card-header yang berakhir di `to-white` → strip menyala.

Card surface: `bg-surface-card`. Elevasi/lift: `bg-overlay-30|50|60|70|90` dan
`bg-zebra` — overlay putih menyilau di gelap, hitam mengotori di terang.
Permukaan gelap: `ink-*`, bukan `gray/slate-800|900|950` (angka itu berarti
"teks terang" pada ramp netral). Status: triplet `bg-X-50 text-X-600/700
border-X-200` tetap bekerja; jangan membuat skala status baru dengan asumsi
light-mode. `indigo-*` sudah di-alias ke `primary-*`.

### Hero panel: `from-ink-900 via-ink-900 to-ink-800`, bukan `bg-ink-950`
Hero, header modal, dan panel detail yang selalu gelap memakai **gradient
`bg-linear-to-br from-ink-900 via-ink-900 to-ink-800`**. `bg-ink-950` (#080d18)
lebih gelap dari `ink-900` sehingga panel terlihat seperti lubang hitam di
dalam card — itulah yang membuat Detail Validasi Dokumen terlihat "beda dari
yang lain". gradient memberi kedalaman tanpa gelap excess.

Tiga aturan yang menyertainya, semuanya dipaksa oleh `src/themeGuard.test.ts`:

- **Foreground di panel gelap = `text-ink-fg` / `text-ink-fg-muted`**, bukan
  `text-white/NN` (terlalu redup, ~3:1) dan bukan `text-slate-100..400`
  (ramp netral berbalik di gelap: 100/200/300 = 1.7/2.1/3.0:1 di atas ink-950,
  jadi copy lenyap). Warna status juga tidak aman di atas `ink` — `text-blue-700`
  flipped jadi terang di gelap tapi gelap di terang, jadi di light theme chip
  status di hero jadi biru tua di atas hitam. Pakai `text-ink-fg` + dot berwarna.
- **Kaca glass `bg-white/10` / `/15` / `/20`**, bukan `bg-white/[0.07]`. Nilai
  arbitrary lolos dari allowlist `bg-white/NN` dan hasilnya satu panel beda
  shade dari semua panel lain.
- **Bayangan jangan dari ramp netral.** `shadow-slate-900/10` = bayangan gelap
  di light theme dan **halo putih** di dark theme (slate-900 = #ffffff di
  gelap). Pakai `shadow-black/NN`.

---

## Light / Dark Mode — WAJIB dijaga, tested, bukan dicek manual
Mode light dan dark **harus selalu berfungsi penuh**. Ini bukan
preferensi — kalau salah satu rusak, user complain dan sulit direplikasi.
Semua warna WAJIB via semantic token (`bg-surface-card`, `text-slate-600`,
`border-gray-100`), JANGAN pernah hardcode hex atau `dark:` variant inline.

### Cara cek (WAJIB setiap selesai ubah styling)
1. `npx vitest run` — `themeGuard.test.ts` + `themeContrast.test.ts` menangkap
   hampir semua regresi tema secara otomatis.
2. Cek manual di kedua tema untuk yang tidak tertangkap guard.

### Kalau tambah guard baru
`themeGuard.test.ts` memindai **per baris**, jadi perhatikan:
- **Pola child line**: `bg-ink-950` di baris 1, `text-slate-300` di baris 3 →
  guard HARUS menelusuri struktur/indentasi, bukan cuma regex satu baris.
- **Gradient vs flat**: `bg-ink-900` DAN `from-ink-900 via-ink-900 to-ink-800`
  dua-duanya dark surface. Kalau regex cuma tahu `bg-ink-`, guard diam-diam
  kehilangan cakupan begitu hero di-migrate ke gradient.
- **False positive**: child yang punya surface sendiri (`bg-surface-card`,
  `bg-*-50`) menetralkan dark ancestor-nya. Guard harus melacak "surface
  terdekat", bukan "apakah ada ancestor gelap".

### Common mistakes (sudah terjadi, jangan diulang)
- `text-slate-300` di atas `bg-ink-950` → lenyap di dark. → `text-ink-fg-muted`.
- `bg-white/60` sebagai background panel → blok putih di dark. → `bg-surface-card`.
- `bg-ink-950` sebagai hero → terlalu gelap, terlihat seperti void. → gradient `ink-900→ink-800`.
- `shadow-slate-900/10` → halo putih di dark. → `shadow-black/20`.
- `text-gray-400` di atas `bg-ink-900` header → hilang di dark. → `text-ink-fg-muted`.
- Hardcode `stroke="#e2e8f0"` di SVG donut/progress → warna light-mode membeku.
  → `stroke="var(--oz-gray-300)"`.
- `bg-white/60` pada input search di dalam panel gelap.

### Tinta redup: jangan pakai `opacity` untuk "mematikan" teks
`text-slate-500 opacity-50` itu **dua** token, bukan satu: ramp netral sudah
resolve per tema, lalu opacity meng-composite-nya sekali lagi. Di step rail
biaya-thl hasilnya #4d5a6d @50% di atas ink-950 = **1.55:1** di light — label
langkah terkunci dan alasannya ("Isi tanggal pengajuan...") praktis tak
terbaca. Alasan sebuah kontrol terkunci adalah informasi yang user BUTUHKAN,
jadi tampilkan state-nya lewat surface + cursor, bukan lewat opacity.
`disabled:opacity-*` tetap boleh (WCAG mengecualikan kontrol nonaktif).

### `text-*-300` di atas surface = 1:1, bukan "lembut"
Karena ramp ber-peran, `gray-300` itu step **hairline** (#cbd5e1 di light,
#24324a di dark). Di atas `bg-surface-raised` itu **1.42:1** dan **1.00:1** —
pill langkah di wizard THL tampak seperti kotak kosong. Tinta copy di atas
surface mulai di **400** (muted), dan **500** (body) kalau itu satu-satunya
penjelasan kenapa kontrol tidak bisa dipakai. Jangan pernah 300 ke bawah
untuk teks.

### Form control: pakai `input-field`, jangan rakus `bg-white/NN`
`bg-white/80` di input itu gaya "frosted field" dan jebakan: di panel terang
hilang, di panel gelap jadi lempeng nyaris putih. Field tanggal THL
mempasangkan `bg-white/80` dengan `text-gray-800` yang resolve jadi #f1f5f9 di
dark — **tinta terang di atas lempeng terang, 1.40:1**. `input-field` sudah
membawa `bg-surface-card` + `text-gray-900` yang ikut berbalik.

### Memilih tinta di atas panel gelap
`text-gray-500` **bukan** perbaikan universal untuk teks di atas `ink`: di
light, panel gelapnya hasilnya 2.19:1 (gagal), di dark 8.02:1 (aman). Yang
benar-benar benar di kedua tema hanya `text-ink-fg` / `text-ink-fg-muted`
karena nilainya tidak bergantung tema. Tab non-aktif di approval-settings
pernah `text-gray-300` di atas kaca `bg-white/10` = **1.19:1 di dark**.

### Toggle tema
- State: **`next-themes`** (`ThemeProvider` di `src/app/layout.tsx` +
  `useTheme` di `src/components/ThemeToggle.tsx`). Jangan tulis store tema
  sendiri — satu-satunya hal yang relevan adalah **atribut mana** yang ditulis.
- `attribute="data-theme"` itu wajib, bukan default yang dibiarkan: `globals.css`
  men-key seluruh palet ke `[data-theme='dark']`. Kalau atributnya diganti ke
  `class`, tombol akan berubah tapi **warna tidak akan pernah bergerak**.
- Opsi lain di layout: `defaultTheme="system"`, `enableSystem` (wajib, tanpa ini
  mode "Sistem" hilang dari UI), `disableTransitionOnChange` (hindari animasi
  saat ganti tema).
- `next-themes` menyuntik `<script>` sendiri yang menulis atribut SEBELUM paint
  pertama, jadi tidak ada kilat putih saat reload. **Jangan dihapus** dan jangan
  diganti setter manual di `useEffect` — itu reintroduksi kilat.
- Tersimpan di `localStorage['theme']`, **per browser, bukan per akun**. Kalau
  suatu saat harus per-user, pindahkan ke tabel `users` (lihat juga: user login
  di browser lain akan mewarisi tema mesin).
- UI: `src/components/ThemeToggle.tsx`, dipakai di halaman Profil.
  Komponen menunggu `mounted` sebelum menampilkan state terpilih — `useTheme`
  mengembalikan `undefined` di server, merender state sebelum mount akan
  menyalahi hydration.
- Test: `src/components/ThemeToggle.test.tsx` — termasuk assert bahwa memilih
  opsi benar-benar menulis `data-theme` (kontrak antara library dan CSS).

### Flutter
`AppTheme` memakai ramp ber-peran yang sama, tapi `main.dart` masih mengunci
`ThemeMode.dark`: halaman menyematkan `AppTheme.*` langsung (203 call site),
sedangkan `static const` di Dart bersifat compile-time sehingga tidak bisa
ditukar saat runtime. Sebelum mobile bisa mendukung light mode,
`AppTheme.*` harus jadi `ThemeExtension` yang dibaca lewat
`Theme.of(context)`, lalu seluruh call site diarahkan ke situ.

## Surat Jalan PDF: client-side & wajib paginasi
PDF di-render client-side di `onezentra-web/src/lib/suratJalanPdf.ts` memakai `jsPDF` + `jspdf-autotable` (bukan endpoint backend). Tabel item HARUS lewat autoTable agar satu RKH dengan banyak item tidak kehilangan baris di luar A4 (autoTable mengulang header tiap halaman + wrap teks sel). Catatan & area tanda tangan diletakkan setelah tabel dengan cek page-break. Barcode yang di-render adalah `po_transporter` (= no_dokumen, nilai yang di-scan di Receiving). Tabel `CODE39_CHARS` disimpan sebagai modul ber-run-length (12 modul, elemen wide = 2 modul) — render lewat run-length (`encodeCode39`), JANGAN memakai paritas index per-bit karena menghasilkan barcode tidak valid. Teks human-readable barcode wajib sama dengan nilai ter-sanitasi (`sanitizeCode39Value`). `normalizeRkhDate` HARUS parse tanggal secara tekstual (regex `^(\d{4})-(\d{2})-(\d{2})`), BUKAN `new Date()` — tanggal ISO tanpa offset diparse sebagai UTC sehingga di timezone negatif tanggal PDF bergeser satu hari.

## Validasi sesi di /login lewat proxy, BUKAN probe /user dari browser
Cookie sesi (`laravel-session`) ber-flag httpOnly, jadi hanya sisi server yang
bisa melihatnya. Validasi "sesi yang sudah ada" dilakukan di
`onezentra-web/src/proxy.ts`: bila `/login` diminta DAN cookie sesi ADA, proxy
memanggil `BACKEND_URL/api/v1/user` dengan header `Cookie` + `Referer`/`Origin`
(wajib — lihat `.ai/rules/general.md`: Sanctum hanya stateful untuk domain
terdaftar). Sesi valid → redirect `/dashboard`; selain itu halaman login
dirender. Backend tak terjangkau = fail-open (jangan pernah memblokir login);
timeout 3 dtk.

**JANGAN** menambahkan kembali probe `loadUser()` / `GET /user` di
`login/page.tsx`. Tamu tanpa cookie memicu 401 yang SELALU tercatat di console
browser — itu log network-level yang tidak bisa disembunyikan JS, walau 401
memang jawaban yang benar (dulu bikin seolah ada error di halaman login).
Halaman login cukup mengurus `if (user) router.push('/dashboard')` pasca-login;
bounce user yang sudah login terjadi di proxy sebelum halaman dirender.

Guard: `proxy.test.ts` (tamu `/login` → nol request; sesi valid → `/dashboard`;
401 → 200; fetch gagal → 200) dan `login/page.test.tsx` (`loadUser` tidak dipanggil).

