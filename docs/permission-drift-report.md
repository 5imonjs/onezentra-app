# Laporan Drift Permission (DB dev vs PermissionSeeder)

Dibuat: 2026-10-09 · Sumber: `database/seeders/PermissionSeeder.php` (target) vs DB dev `onezentra_warehouse`.

## Ringkasan

| Metrik | DB dev (live) | Target seeder | Delta |
|---|---:|---:|---:|
| roles | 12 | 12 | 0 |
| permissions | 96 | 96 | 0 |
| role_permission | 458 | 418 | **+40 net** |

Angka net +40 menyesatkan: selisihnya adalah **88 grant yang akan DICABUT** dikurangi **48 grant yang akan DITAMBAH** oleh `sync()` saat `PermissionSeeder` dijalankan ulang (diregenerasi 2026-10-09 setelah `opname.progress_all` mengikuti `opname.view` di seeder). Jadi re-seed **bukan** sekadar mencabut 40 baris — ia mengganti set permission tiap role secara persis dan mengubah akses 7 dari 12 role.

> **Jangan jalankan `php artisan db:seed --class=PermissionSeeder --force`** sampai baris di bawah ini disetujui satu per satu.

## Rekomendasi: jangan "perbaiki" dengan re-seed buta

Drift muncul dari grant manual lewat UI Roles & Permissions setelah seed terakhir. Sebagian memang sengaja, sebagian lain perlu ditinjau. Kontradiksi `opname.progress_all` (migration vs seeder) **sudah diperbaiki**: `PermissionSeeder` kini menurunkannya otomatis dari `opname.view`, sehingga `sync()` tidak lagi mencabutnya. Doc `.ai/rules/database.md` & `.ai/rules/seeders.md` sudah diperbarui ke angka target 96/418 plus catatan drift.

## Rincian per role

### admin_master — live 96 / target 96
Tidak ada selisih.

### admin_distirbusi — live 59 / target 59
Tidak ada selisih (`opname.progress_all` kini mengikuti `opname.view` di seeder).

### operator — live 34 / target 34
Tidak ada selisih (mirror `cheker`, ikut membawa `opname.progress_all`).

### rfah — live 15 / target 15
Tidak ada selisih (`opname.progress_all` kini mengikuti `opname.view`).

### rlh — live 15 / target 15
Tidak ada selisih (`opname.progress_all` kini mengikuti `opname.view`).

### rh — live 6 / target 6
Tidak ada selisih (`opname.progress_all` kini mengikuti `opname.view`).

### sac — live 25 / target 25
Tidak ada selisih (mirror `bac`, ikut membawa `opname.progress_all`).

### staff_logistic — live 62 / target 38
**Akan dicabut (27):**
`approval.manage`, `biaya_thl.full_control`, `cluster_principal.create`, `cluster_principal.delete`, `cluster_principal.edit`, `depot.view_all`, `emails.view`, `gate.create`, `gate.view`, `npn.create`, `npn.delete`, `npn.edit`, `penerimaan.delete`, `receiving.view`, `rencana_kirim.create`, `rencana_kirim.delete`, `rencana_kirim.edit`, `rencana_kirim.import`, `retribusi_rates.manage`, `sj_validation.edit_completed`, `sj_validation.view`, `standar_umur.create`, `standar_umur.delete`, `standar_umur.edit`, `standarisasi.approve`, `standarisasi.create`, `standarisasi.delete`

**Akan ditambah (3):**
`receiving.export`, `receiving.import`, `receiving.template`

> Catatan: `depot.view_all` untuk `staff_logistic` adalah yang membuat role ini lintas-depo di DB dev meski seeder berniat ter-scope. Ini juga yang menutupi bug cross-depot H1–H3 sebelum diperbaiki.

### blc — live 57 / target 30
**Akan dicabut (28):**
`approval.view`, `biaya_retribusi.delete`, `biaya_retribusi.import`, `biaya_thl.delete`, `biaya_thl.import`, `cluster_principal.create`, `cluster_principal.delete`, `cluster_principal.edit`, `gate.create`, `gate.view`, `opname.create`, `opname.edit`, `penerimaan.create`, `receiving.create`, `receiving.export`, `receiving.import`, `receiving.template`, `receiving.view`, `rencana_kirim.view`, `retribusi_rates.manage`, `sj_validation.complete`, `sj_validation.create`, `sj_validation.edit`, `sj_validation.validate`, `standarisasi.create`, `standarisasi.delete`, `standarisasi.export`, `standarisasi.template`

**Akan ditambah (1):**
`depot.view_all`

### cheker — live 52 / target 34
**Akan dicabut (24):**
`approval.submit`, `biaya_retribusi.create`, `biaya_retribusi.delete`, `biaya_retribusi.edit`, `biaya_retribusi.export`, `biaya_retribusi.import`, `biaya_retribusi.view`, `biaya_thl.create`, `biaya_thl.delete`, `biaya_thl.edit`, `biaya_thl.import`, `opname.edit`, `penerimaan.delete`, `receiving.export`, `receiving.import`, `receiving.template`, `retribusi_rates.manage`, `sj_validation.edit_completed`, `standarisasi.create`, `standarisasi.delete`, `standarisasi.edit`, `standarisasi.export`, `standarisasi.import`, `standarisasi.template`

**Akan ditambah (6):**
`penerimaan.edit`, `rencana_kirim.edit`, `reports.biaya_retribusi`, `reports.biaya_thl`, `reports.view`, `sj_validation.cancel`

### admin_planner — live 15 / target 41
**Akan dicabut (3):**
`gate.view`, `receiving.view`, `sj_validation.view`

**Akan ditambah (29):**
`biaya_retribusi.create`, `biaya_retribusi.edit`, `biaya_retribusi.export`, `biaya_retribusi.view`, `biaya_thl.create`, `biaya_thl.edit`, `biaya_thl.export`, `biaya_thl.import`, `biaya_thl.view`, `gate.delete`, `gate.edit`, `opname.create`, `opname.delete`, `opname.progress_all`, `opname.view`, `receiving.export`, `receiving.import`, `receiving.template`, `reports.biaya_retribusi`, `reports.biaya_thl`, `reports.view`, `roles.export`, `roles.import`, `roles.template`, `standarisasi.export`, `standarisasi.import`, `standarisasi.template`, `users.import`, `users.view`

### bac — live 22 / target 25
**Akan dicabut (6):**
`approval.view`, `gate.view`, `receiving.view`, `rencana_kirim.view`, `sj_validation.view`, `standarisasi.export`

**Akan ditambah (9):**
`approval.revise`, `biaya_retribusi.create`, `biaya_retribusi.edit`, `biaya_thl.create`, `biaya_thl.edit`, `gate.delete`, `gate.edit`, `opname.delete`, `standarisasi.import`

## Catatan khusus: `opname.progress_all`

Status: **selesai — tidak lagi menjadi drift.** `PermissionSeeder` kini menambahkan `opname.progress_all` untuk setiap role yang punya `opname.view` (blok "Progres opname mengikuti opname.view" di seeder), persis pola `biaya_*.export`. Migration `2026_10_06_051424_grant_opname_progress_all_to_opname_viewers` tetap berlaku untuk grant manual setelahnya; role yang ditambahkan ke `rolePermMap` dengan `opname.view` otomatis ikut, dan role mirror `operator`/`sac` mewarisinya dari `cheker`/`bac`.

Dengan aturan ini, re-seed tidak lagi mencabut `opname.progress_all` dari 10 role. Efek samping: `admin_planner` (punya `opname.view` di seeder tetapi belum memiliki `opname.progress_all` di DB dev) akan mendapatkannya saat re-seed — sekaligus masuk daftar "akan ditambah".

## Cara menghasilkan ulang laporan ini

```bash
php artisan tinker --execute '
$capture = fn () => DB::table("roles")->orderBy("slug")->get()->mapWithKeys(function ($r) {
    return [$r->slug => DB::table("role_permission")->where("role_id", $r->id)
        ->join("permissions","permissions.id","=","role_permission.permission_id")
        ->orderBy("permissions.slug")->pluck("permissions.slug")->all()];
})->all();
$live = $capture();
DB::beginTransaction();
Artisan::call("db:seed", ["--class" => "PermissionSeeder", "--force" => true]);
$intended = $capture();
DB::rollBack();
foreach ($intended as $role => $perms) {
    $extra = array_values(array_diff($live[$role] ?? [], $perms));
    $missing = array_values(array_diff($perms, $live[$role] ?? []));
    if ($extra || $missing) {
        echo "== $role ==\n  extra: ".implode(", ", $extra)."\n  missing: ".implode(", ", $missing)."\n";
    }
}
'
```
