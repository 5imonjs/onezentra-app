# Laporan Drift Permission (DB dev vs PermissionSeeder)

Dibuat: 2026-10-09 · Sumber: `database/seeders/PermissionSeeder.php` (target) vs DB dev `onezentra_warehouse`.

## Ringkasan

| Metrik | DB dev (live) | Target seeder | Delta |
|---|---:|---:|---:|
| roles | 12 | 12 | 0 |
| permissions | 96 | 96 | 0 |
| role_permission | 458 | 407 | **+51 net** |

Angka net +51 menyesatkan: selisihnya adalah **98 grant yang akan DICABUT** dikurangi **47 grant yang akan DITAMBAH** oleh `sync()` saat `PermissionSeeder` dijalankan ulang (diregenerasi 2026-10-09 setelah migrasi `depot.move`). Jadi re-seed **bukan** sekadar mencabut 51 baris — ia mengganti set permission tiap role secara persis dan mengubah akses 10 dari 12 role.

> **Jangan jalankan `php artisan db:seed --class=PermissionSeeder --force`** sampai baris di bawah ini disetujui satu per satu.

## Rekomendasi: jangan "perbaiki" dengan re-seed buta

Drift muncul dari grant manual lewat UI Roles & Permissions setelah seed terakhir. Sebagian memang sengaja (mis. `opname.progress_all` yang bahkan punya migration sendiri `2026_10_06_051424_grant_opname_progress_all_to_opname_viewers`), sebagian lain perlu ditinjau. Doc `.ai/rules/database.md` & `.ai/rules/seeders.md` sudah diperbarui ke angka target seeder (96/407) plus catatan drift.

## Rincian per role

### admin_master — live 96 / target 96
Tidak ada selisih.

### staff_logistic — live 62 / target 37
**Akan dicabut (28):**
`approval.manage`, `biaya_thl.full_control`, `cluster_principal.create`, `cluster_principal.delete`, `cluster_principal.edit`, `depot.view_all`, `emails.view`, `gate.create`, `gate.view`, `npn.create`, `npn.delete`, `npn.edit`, `opname.progress_all`, `penerimaan.delete`, `receiving.view`, `rencana_kirim.create`, `rencana_kirim.delete`, `rencana_kirim.edit`, `rencana_kirim.import`, `retribusi_rates.manage`, `sj_validation.edit_completed`, `sj_validation.view`, `standar_umur.create`, `standar_umur.delete`, `standar_umur.edit`, `standarisasi.approve`, `standarisasi.create`, `standarisasi.delete`

**Akan ditambah (3):**
`receiving.export`, `receiving.import`, `receiving.template`

> Catatan: `depot.view_all` untuk `staff_logistic` adalah yang membuat role ini lintas-depo di DB dev meski seeder berniat ter-scope. Ini juga yang menutupi bug cross-depot H1–H3 sebelum diperbaiki.

### blc — live 57 / target 29
**Akan dicabut (29):**
`approval.view`, `biaya_retribusi.delete`, `biaya_retribusi.import`, `biaya_thl.delete`, `biaya_thl.import`, `cluster_principal.create`, `cluster_principal.delete`, `cluster_principal.edit`, `gate.create`, `gate.view`, `opname.create`, `opname.edit`, `opname.progress_all`, `penerimaan.create`, `receiving.create`, `receiving.export`, `receiving.import`, `receiving.template`, `receiving.view`, `rencana_kirim.view`, `retribusi_rates.manage`, `sj_validation.complete`, `sj_validation.create`, `sj_validation.edit`, `sj_validation.validate`, `standarisasi.create`, `standarisasi.delete`, `standarisasi.export`, `standarisasi.template`

**Akan ditambah (1):**
`depot.view_all`

### cheker — live 52 / target 33
**Akan dicabut (25):**
`approval.submit`, `biaya_retribusi.create`, `biaya_retribusi.delete`, `biaya_retribusi.edit`, `biaya_retribusi.export`, `biaya_retribusi.import`, `biaya_retribusi.view`, `biaya_thl.create`, `biaya_thl.delete`, `biaya_thl.edit`, `biaya_thl.import`, `opname.edit`, `opname.progress_all`, `penerimaan.delete`, `receiving.export`, `receiving.import`, `receiving.template`, `retribusi_rates.manage`, `sj_validation.edit_completed`, `standarisasi.create`, `standarisasi.delete`, `standarisasi.edit`, `standarisasi.export`, `standarisasi.import`, `standarisasi.template`

**Akan ditambah (6):**
`penerimaan.edit`, `rencana_kirim.edit`, `reports.biaya_retribusi`, `reports.biaya_thl`, `reports.view`, `sj_validation.cancel`

### admin_planner — live 15 / target 40
**Akan dicabut (3):**
`gate.view`, `receiving.view`, `sj_validation.view`

**Akan ditambah (28):**
`biaya_retribusi.create`, `biaya_retribusi.edit`, `biaya_retribusi.export`, `biaya_retribusi.view`, `biaya_thl.create`, `biaya_thl.edit`, `biaya_thl.export`, `biaya_thl.import`, `biaya_thl.view`, `gate.delete`, `gate.edit`, `opname.create`, `opname.delete`, `opname.view`, `receiving.export`, `receiving.import`, `receiving.template`, `reports.biaya_retribusi`, `reports.biaya_thl`, `reports.view`, `roles.export`, `roles.import`, `roles.template`, `standarisasi.export`, `standarisasi.import`, `standarisasi.template`, `users.import`, `users.view`

### bac — live 22 / target 24
**Akan dicabut (7):**
`approval.view`, `gate.view`, `opname.progress_all`, `receiving.view`, `rencana_kirim.view`, `sj_validation.view`, `standarisasi.export`

**Akan ditambah (9):**
`approval.revise`, `biaya_retribusi.create`, `biaya_retribusi.edit`, `biaya_thl.create`, `biaya_thl.edit`, `gate.delete`, `gate.edit`, `opname.delete`, `standarisasi.import`

### admin_distirbusi — live 59 / target 58
**Akan dicabut (1):** `opname.progress_all`

### operator — live 34 / target 33
**Akan dicabut (1):** `opname.progress_all`

### rfah — live 15 / target 14
**Akan dicabut (1):** `opname.progress_all`

### rlh — live 15 / target 14
**Akan dicabut (1):** `opname.progress_all`

### sac — live 25 / target 24
**Akan dicabut (1):** `opname.progress_all`

### rh — live 6 / target 5
**Akan dicabut (1):** `opname.progress_all`

## Catatan khusus: `opname.progress_all`

Permission ini muncul sebagai "extra" di **10 role** (semua kecuali admin_master). Ia tidak ditulis di `rolePermMap` seeder, tetapi ada migration `2026_10_06_051424_grant_opname_progress_all_to_opname_viewers` yang memberikannya. Artinya menghapusnya dari seeder-sync akan bertentangan dengan migration itu. Perlu keputusan: pindahkan grant ke `rolePermMap`, atau terima bahwa re-seed mencabutnya.

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
