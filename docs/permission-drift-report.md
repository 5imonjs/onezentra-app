# Laporan Drift Permission (DB dev vs PermissionSeeder)

Dibuat: 2026-10-09 · Sumber: `database/seeders/PermissionSeeder.php` (target) vs DB dev `onezentra_warehouse`.

## Status penerapan

**Re-seed sudah dijalankan** di DB dev `onezentra_warehouse` pada 2026-10-09.

- Hasil akhir (saat laporan dibuat): `roles=12`, `permissions=97`, `role_permission=447`; verifikasi ulang **drift revoke=0 / add=0**.
- **Update 2026-10-09**: level/role `ga` (viewer luas, view-only) & `bh` (mirror `admin_planner`) ditambahkan lewat migration `2026_10_09_061200_add_ga_bh_roles` (tidak re-seed). Target baru: `roles=14`, `permission=97`, `role_permission=511` (grant `ga`=20 + `bh`=44).
- Backup (dump `role_permission`, DROP+CREATE+INSERT):
  - `storage/backups/role_permission_20261009_093409.sql` — 458 baris (kondisi drift, sebelum re-seed #1)
  - `storage/backups/role_permission_20261009_093801.sql` — 451 baris (sebelum pemutusan mirror `operator`)
  - `storage/backups/role_permission_20261009_094759.sql` — 446 baris (sebelum revisi `depot.view_all` BLC)
- Semua file ada di `.gitignore` (artefak lokal).

### Riwayat

1. Seeder diselaraskan (`opname.progress_all` mengikuti `opname.view`) + keputusan akses 5 role → target 451.
2. Re-seed #1 → `role_permission=451`.
3. Keputusan **putus mirror**: `operator` tidak mewarisi 5 aksi sensitif `cheker` → target 446.
4. Re-seed #2 → `role_permission=446`, `operator=34`.
5. Revisi keputusan: `depot.view_all` BLC dicabut (saklar global terlalu luas) → diganti permission sempit `standarisasi.view_all`; migration `2026_10_09_024637_add_standarisasi_view_all_permission` → target 447.
6. Re-seed #3 → `role_permission=447`, `permissions=97`, `blc=49` (tukar grant), `admin_master=97`.

### Count per role (final)

| Role | Permission |
|---|---:|
| `admin_master` | 97 |
| `admin_distirbusi` | 59 |
| `blc` | 49 |
| `admin_planner` | 44 |
| `cheker` | 39 |
| `staff_logistic` | 39 |
| `operator` | 34 |
| `bac` | 25 |
| `sac` | 25 |
| `rlh` | 15 |
| `rfah` | 15 |
| `rh` | 6 |
| `ga` | 20 (baru 2026-10-09) |
| `bh` | 44 (baru 2026-10-09, mirror admin_planner) |

## Keputusan akses yang tertanam di seeder (2026-10-09)

Dikunci oleh `SeederRoleVerificationTest::test_keputusan_akses_2026_10_09_tertanam_di_seeder`, `test_blc_scoped_global_diganti_permission_standarisasi_lintas_depo`, dan `test_sac_and_operator_mirror_bac_and_cheker_permissions`.

| Role | Grant dipertahankan |
|---|---|
| `staff_logistic` | `depot.view_all` (role lintas-depo) |
| `admin_planner` | `depot.view_all` (menyusun rencana kirim antar depo) |
| `cheker` | `approval.submit`, `retribusi_rates.manage`, `sj_validation.edit_completed`, `opname.edit`, `penerimaan.delete` |
| `blc` | `standarisasi.view_all` (lintas depo **khusus modul standarisasi**); tetap memegang `sj_validation.create/edit/validate/complete`, `standarisasi.create/delete/export/template`, `cluster_principal.create/delete/edit`, `biaya_retribusi.delete/import`, `biaya_thl.delete/import`, `opname.create/edit`, `rencana_kirim.view`, `retribusi_rates.manage`. **Tidak** lagi `depot.view_all`. |
| `bac` | (tidak ada — seeder menang penuh) |
| `operator` | **tidak** mewarisi 5 aksi sensitif `cheker` (mirror diputus); sisanya tetap mirror `cheker` |
| `ga` (baru 2026-10-09) | Viewer luas: semua modul **view-only** lintas depo (`depot.view_all`). Tanpa aksi tulis apa pun. Dikunci `test_ga_viewer_luas_dan_bh_mirror_admin_planner`. |
| `bh` (baru 2026-10-09) | Mirror penuh `admin_planner` (termasuk `depot.view_all`). Dikunci test yang sama. |

## Catatan khusus

- **`opname.progress_all`** diturunkan otomatis dari `opname.view` di seeder (pola sama seperti `biaya_*.export`) agar `sync()` tidak mencabut grant migration `2026_10_06_051424_grant_opname_progress_all_to_opname_viewers`. Role mirror `operator`/`sac` mewarisinya dari `cheker`/`bac`.
- **`approval.view`** tetap **hanya `admin_master`** (menu Pengaturan Approval). Tidak dipertahankan untuk blc/bac meski ada di DB.
- **Mirror `operator`**: sebelumnya `operator ≡ cheker`. Kini `operator = cheker − {approval.submit, retribusi_rates.manage, sj_validation.edit_completed, opname.edit, penerimaan.delete}`.
- **`depot.view_all` BLC dicabut (revisi 2026-10-09)**: `depot.view_all` adalah saklar scoping **global** (`User::isDepotScoped()`), sehingga BLC ikut melihat semua depo di semua modul + filter depo dashboard. Diganti `standarisasi.view_all` yang hanya melewati scoping di modul standarisasi (lihat `StandarisasiTumpukanController::canManageRow`, `filteredQuery`, dan `StandarisasiTumpukanExport`). Pemegang `depot.view_all` final: `admin_master`, `admin_planner`, `bh`, `ga`, `staff_logistic`.

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
