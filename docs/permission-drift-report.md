# Laporan Drift Permission (DB dev vs PermissionSeeder)

Dibuat: 2026-10-09 · Sumber: `database/seeders/PermissionSeeder.php` (target) vs DB dev `onezentra_warehouse`.

## Status penerapan

**Re-seed sudah dijalankan** di DB dev `onezentra_warehouse` pada 2026-10-09.

- Hasil akhir: `roles=12`, `permissions=96`, `role_permission=446`; verifikasi ulang **drift revoke=0 / add=0**.
- Backup (dump `role_permission`, DROP+CREATE+INSERT):
  - `storage/backups/role_permission_20261009_093409.sql` — 458 baris (kondisi drift, sebelum re-seed #1)
  - `storage/backups/role_permission_20261009_093801.sql` — 451 baris (sebelum pemutusan mirror `operator`)
- Kedua file ada di `.gitignore` (artefak lokal).

### Riwayat

1. Seeder diselaraskan (`opname.progress_all` mengikuti `opname.view`) + keputusan akses 5 role → target 451.
2. Re-seed #1 → `role_permission=451`.
3. Keputusan **putus mirror**: `operator` tidak mewarisi 5 aksi sensitif `cheker` → target 446.
4. Re-seed #2 → `role_permission=446`, `operator=34`.

### Count per role (final)

| Role | Permission |
|---|---:|
| `admin_master` | 96 |
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

## Keputusan akses yang tertanam di seeder (2026-10-09)

Dikunci oleh `SeederRoleVerificationTest::test_keputusan_akses_2026_10_09_tertanam_di_seeder` dan `test_sac_and_operator_mirror_bac_and_cheker_permissions`.

| Role | Grant dipertahankan |
|---|---|
| `staff_logistic` | `depot.view_all` (role lintas-depo) |
| `cheker` | `approval.submit`, `retribusi_rates.manage`, `sj_validation.edit_completed`, `opname.edit`, `penerimaan.delete` |
| `blc` | `sj_validation.create/edit/validate/complete`, `standarisasi.create/delete/export/template`, `cluster_principal.create/delete/edit`, `biaya_retribusi.delete/import`, `biaya_thl.delete/import`, `opname.create/edit`, `rencana_kirim.view`, `retribusi_rates.manage` |
| `admin_planner` | `gate.view`, `receiving.view`, `sj_validation.view` |
| `bac` | (tidak ada — seeder menang penuh) |
| `operator` | **tidak** mewarisi 5 aksi sensitif `cheker` (mirror diputus); sisanya tetap mirror `cheker` |

## Catatan khusus

- **`opname.progress_all`** diturunkan otomatis dari `opname.view` di seeder (pola sama seperti `biaya_*.export`) agar `sync()` tidak mencabut grant migration `2026_10_06_051424_grant_opname_progress_all_to_opname_viewers`. Role mirror `operator`/`sac` mewarisinya dari `cheker`/`bac`.
- **`approval.view`** tetap **hanya `admin_master`** (menu Pengaturan Approval). Tidak dipertahankan untuk blc/bac meski ada di DB.
- **Mirror `operator`**: sebelumnya `operator ≡ cheker`. Kini `operator = cheker − {approval.submit, retribusi_rates.manage, sj_validation.edit_completed, opname.edit, penerimaan.delete}`.

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
