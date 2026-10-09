# Laporan Drift Permission (DB dev vs PermissionSeeder)

Dibuat: 2026-10-09 · Sumber: `database/seeders/PermissionSeeder.php` (target) vs DB dev `onezentra_warehouse`.

## Ringkasan

| Metrik | DB dev (live) | Target seeder | Delta |
|---|---:|---:|---:|
| roles | 12 | 12 | 0 |
| permissions | 96 | 96 | 0 |
| role_permission | 458 | 451 | **+7 net** |

Angka net +7 menyesatkan: selisihnya adalah **60 grant yang akan DICABUT** dikurangi **53 grant yang akan DITAMBAH** oleh `sync()` saat `PermissionSeeder` dijalankan ulang (diregenerasi 2026-10-09 setelah keputusan akses per role). Re-seed **bukan** sekadar mencabut 7 baris — ia mengganti set tiap role secara persis dan mengubah akses 6 dari 12 role.

> **Jangan jalankan `php artisan db:seed --class=PermissionSeeder --force`** tanpa menyetujui baris di bawah ini lebih dulu.

## Keputusan akses yang sudah tertanam (2026-10-09)

Agar grant live yang memang disengaja tidak dicabut `sync()`, grant berikut **sudah dipindahkan ke `rolePermMap`** dan dikunci oleh `SeederRoleVerificationTest::test_keputusan_akses_2026_10_09_tertanam_di_seeder`:

| Role | Grant dipertahankan |
|---|---|
| `staff_logistic` | `depot.view_all` (role ini memang lintas-depo) |
| `cheker` | `approval.submit`, `retribusi_rates.manage`, `sj_validation.edit_completed`, `opname.edit`, `penerimaan.delete` |
| `blc` | `sj_validation.create/edit/validate/complete`, `standarisasi.create/delete/export/template`, `cluster_principal.create/delete/edit`, `biaya_retribusi.delete/import`, `biaya_thl.delete/import`, `opname.create/edit`, `rencana_kirim.view`, `retribusi_rates.manage` |
| `admin_planner` | `gate.view`, `receiving.view`, `sj_validation.view` |
| `bac` | (tidak ada — seeder menang penuh) |

Selain itu, `opname.progress_all` kini **diturunkan otomatis dari `opname.view`** di seeder (lihat §Catatan khusus), dan `approval.view` tetap **admin_master-only** (tidak dipertahankan meski ada di DB bac/blc).

## Rekomendasi: jangan "perbaiki" dengan re-seed buta

Sisa drift di bawah adalah grant manual yang **tidak** disetujui untuk dipertahankan. Sebelum re-seed: backup tabel `role_permission`, lalu jadwalkan. Grant yang ternyata masih dibutuhkan cukup dimasukkan ke seeder (jangan lewat UI) agar ter-audit.

## Rincian per role

### admin_master — live 96 / target 96
Tidak ada selisih.

### admin_distirbusi — live 59 / target 59
Tidak ada selisih.

### rfah — live 15 / target 15
Tidak ada selisih.

### rlh — live 15 / target 15
Tidak ada selisih.

### rh — live 6 / target 6
Tidak ada selisih.

### sac — live 25 / target 25
Tidak ada selisih (mirror `bac`; `bac` tidak berubah).

### operator — live 34 / target 39
**Akan ditambah (5):**
`approval.submit`, `opname.edit`, `penerimaan.delete`, `retribusi_rates.manage`, `sj_validation.edit_completed`

> Ini **efek samping mirror**: `operator` menyalin `cheker`, dan 5 grant di atas baru saja dipertahankan untuk `cheker`. Sesuai desain mirror (`operator` ≡ `cheker`), `operator` ikut mendapatkannya. Tidak ada extra yang dicabut.

### staff_logistic — live 62 / target 39
**Akan dicabut (26):**
`approval.manage`, `biaya_thl.full_control`, `cluster_principal.create`, `cluster_principal.delete`, `cluster_principal.edit`, `emails.view`, `gate.create`, `gate.view`, `npn.create`, `npn.delete`, `npn.edit`, `penerimaan.delete`, `receiving.view`, `rencana_kirim.create`, `rencana_kirim.delete`, `rencana_kirim.edit`, `rencana_kirim.import`, `retribusi_rates.manage`, `sj_validation.edit_completed`, `sj_validation.view`, `standar_umur.create`, `standar_umur.delete`, `standar_umur.edit`, `standarisasi.approve`, `standarisasi.create`, `standarisasi.delete`

**Akan ditambah (3):**
`receiving.export`, `receiving.import`, `receiving.template`

> `depot.view_all` **tidak** lagi dicabut — sudah dipindahkan ke seeder (keputusan lintas-depo).

### blc — live 57 / target 49
**Akan dicabut (9):**
`approval.view`, `gate.create`, `gate.view`, `penerimaan.create`, `receiving.create`, `receiving.export`, `receiving.import`, `receiving.template`, `receiving.view`

**Akan ditambah (1):**
`depot.view_all`

> `approval.view` tetap dicabut (admin_master-only). `gate.create/view`, `receiving.*`, `penerimaan.create` tidak dipertahankan.

### cheker — live 52 / target 39
**Akan dicabut (19):**
`biaya_retribusi.create`, `biaya_retribusi.delete`, `biaya_retribusi.edit`, `biaya_retribusi.export`, `biaya_retribusi.import`, `biaya_retribusi.view`, `biaya_thl.create`, `biaya_thl.delete`, `biaya_thl.edit`, `biaya_thl.import`, `receiving.export`, `receiving.import`, `receiving.template`, `standarisasi.create`, `standarisasi.delete`, `standarisasi.edit`, `standarisasi.export`, `standarisasi.import`, `standarisasi.template`

**Akan ditambah (6):**
`penerimaan.edit`, `rencana_kirim.edit`, `reports.biaya_retribusi`, `reports.biaya_thl`, `reports.view`, `sj_validation.cancel`

### admin_planner — live 15 / target 44
**Akan dicabut:** tidak ada.

**Akan ditambah (29):**
`biaya_retribusi.create`, `biaya_retribusi.edit`, `biaya_retribusi.export`, `biaya_retribusi.view`, `biaya_thl.create`, `biaya_thl.edit`, `biaya_thl.export`, `biaya_thl.import`, `biaya_thl.view`, `gate.delete`, `gate.edit`, `opname.create`, `opname.delete`, `opname.progress_all`, `opname.view`, `receiving.export`, `receiving.import`, `receiving.template`, `reports.biaya_retribusi`, `reports.biaya_thl`, `reports.view`, `roles.export`, `roles.import`, `roles.template`, `standarisasi.export`, `standarisasi.import`, `standarisasi.template`, `users.import`, `users.view`

> Literal matching live sudah nol, `gate.view/receiving.view/sj_validation.view` dipertahankan. 5 grant sensitif (`users.view/import`, `roles.export/import/template`) ikut karena seeder memang menetapkannya.

### bac — live 22 / target 25
**Akan dicabut (6):**
`approval.view`, `gate.view`, `receiving.view`, `rencana_kirim.view`, `sj_validation.view`, `standarisasi.export`

**Akan ditambah (9):**
`approval.revise`, `biaya_retribusi.create`, `biaya_retribusi.edit`, `biaya_thl.create`, `biaya_thl.edit`, `gate.delete`, `gate.edit`, `opname.delete`, `standarisasi.import`

## Catatan khusus: `opname.progress_all`

Status: **selesai — tidak lagi menjadi drift.** `PermissionSeeder` menambahkan `opname.progress_all` untuk setiap role yang punya `opname.view` (blok "Progres opname mengikuti opname.view" di seeder), sama seperti pola `biaya_*.export`. Migration `2026_10_06_051424_grant_opname_progress_all_to_opname_viewers` tetap berlaku untuk grant manual setelahnya; role yang ditambahkan ke `rolePermMap` dengan `opname.view` otomatis ikut, dan role mirror `operator`/`sac` mewarisinya dari `cheker`/`bac`.

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
