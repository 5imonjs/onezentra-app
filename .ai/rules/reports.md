---
paths:
  - 'onezentra-web/src/app/reports/**'
---

# Reports

## Urutan section baku: Header → Filter → Ringkasan → Tabel
Semua halaman laporan memakai urutan yang sama: header gradient + error banner, panel **Filter Laporan**, kartu **ringkasan/summary**, lalu tabel/detail. JANGAN menaruh kartu ringkasan di atas filter — angka ringkasan adalah hasil filter, jadi kontrol filter harus terbaca lebih dulu. Riwayat: penerimaan & opname-expired pernah terbalik, diperbaiki ke urutan ini.

## Panel filter konsisten
Judul `Filter Laporan` + ikon funnel dalam chip `w-9 h-9 rounded-xl bg-linear-to-br from-slate-900 to-slate-700`, input `text-sm py-2 bg-slate-50 focus:bg-white`, label `text-xs font-semibold uppercase tracking-wider text-slate-400` dengan `htmlFor`/`id` berpasangan (prefix per halaman: `rf-*`, `pf-*`). Tombol aksi: `Terapkan Filter` primer + `Reset` sekunder.

## Data & fetch
- Ringkasan selalu dihitung dari SELURUH baris terfilter, bukan halaman aktif (backend: clone query untuk summary + paginate untuk baris).
- Tabel paginasi 25/halaman dengan reset ke halaman 1 setiap filter berubah; subjudul tabel menampilkan rentang ("Menampilkan X–Y dari Z item").
- Anti race: request-id guard — respons basi (filter sudah berubah) dibuang, `setLoading(false)` hanya oleh request terakhir.
- Kartu ringkasan meredup (`opacity-60` + `aria-busy`) saat refetch agar angka basi terlihat sedang diperbarui.
