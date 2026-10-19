<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Services\ExportGuard;
use App\Support\LikePattern;
use Illuminate\Http\Request;
use Maatwebsite\Excel\Facades\Excel;

class RoleController extends Controller
{
    public function index(Request $request)
    {
        $query = Role::query();
        if ($request->filled('search')) {
            // Escape wildcard LIKE (% _) agar input dianggap literal.
            $like = LikePattern::contains($request->search);
            $query->where(function ($q) use ($like) {
                $q->whereRaw('name LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('slug LIKE ? ESCAPE ?', [$like, '\\']);
            });
        }
        $roles = $query
            ->withCount('users')
            ->with('permissions:id,menu_group')
            ->orderBy('name')
            ->get()
            ->map(function ($role) {
                $grouped = $role->permissions->pluck('menu_group')->unique()->filter()->values();

                return array_merge($role->toArray(), [
                    'permissions_count' => $role->permissions->count(),
                    'menu_groups' => $grouped,
                ]);
            });

        return response()->json([
            'data' => $roles,
            'meta' => ['total_permissions' => Permission::count()],
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:100',
            'slug' => 'required|string|max:100|unique:roles,slug',
            'description' => 'nullable|string|max:255',
        ]);

        $role = Role::create($validated);

        return response()->json(['message' => 'Role created', 'data' => $role], 201);
    }

    public function show(Role $role)
    {
        $role->load(['users', 'permissions']);

        return response()->json(['data' => $role]);
    }

    public function update(Request $request, Role $role)
    {
        $validated = $request->validate([
            'name' => 'sometimes|string|max:100',
            'slug' => 'sometimes|string|max:100|unique:roles,slug,'.$role->id,
            'description' => 'nullable|string|max:255',
            'is_active' => 'nullable|boolean',
        ]);

        // Slug bersifat immutable bagi non-admin_master: slug dipakai acuan
        // permission/level di banyak tempat, rename diam-diam = bypass gate.
        if (array_key_exists('slug', $validated) && $validated['slug'] !== $role->slug) {
            abort_unless($request->user()?->level === 'admin_master', 403, 'Hanya admin master yang boleh mengubah slug peran.');
        }

        if (isset($validated['is_active']) && ! $validated['is_active'] && $role->users()->exists()) {
            // Pengaman data: role ber-user tidak boleh mati agar user tidak
            // kehilangan akses diam-diam — kecuali admin master yang
            // melakukannya secara sadar lewat konfirmasi di UI.
            abort_unless(
                $request->user()?->level === 'admin_master',
                422,
                'Peran dengan user aktif tidak dapat dinonaktifkan.'
            );
        }

        $role->update($validated);

        $this->clearRoleUserCache($role);

        return response()->json(['message' => 'Role updated', 'data' => $role]);
    }

    public function destroy(Role $role)
    {
        if ($role->users()->exists()) {
            return response()->json(['message' => 'Cannot delete role with assigned users'], 422);
        }
        $role->delete();

        return response()->json(['message' => 'Role deleted']);
    }

    public function getPermissions(Role $role)
    {
        $allPermissions = Permission::orderBy('sort_order')->orderBy('id')->get();
        $assignedIds = $role->permissions()->pluck('permissions.id')->toArray();

        return response()->json([
            'role' => $role,
            'permissions' => $allPermissions->map(function ($p) use ($assignedIds) {
                return [
                    'id' => $p->id,
                    'name' => $p->name,
                    'slug' => $p->slug,
                    'menu_group' => $p->menu_group,
                    'icon' => $p->icon,
                    'assigned' => in_array($p->id, $assignedIds),
                ];
            }),
            'assignedIds' => $assignedIds,
        ]);
    }

    public function syncPermissions(Request $request, Role $role)
    {
        $validated = $request->validate([
            'permission_ids' => 'required|array',
            'permission_ids.*' => 'exists:permissions,id',
        ]);

        $actor = $request->user();

        // Permission sensitif (users.*, roles.*) hanya boleh di-sync oleh
        // admin_master — tanpa ini pemegang roles.edit bisa memberi dirinya
        // users.edit lalu menaikkan level akun kompromi (eskalasi mandiri).
        $requestedSlugs = Permission::whereIn('id', $validated['permission_ids'])->pluck('slug');
        $touchesSensitive = $requestedSlugs->contains(
            fn (string $slug): bool => str_starts_with($slug, 'users.') || str_starts_with($slug, 'roles.')
        );
        if ($touchesSensitive) {
            abort_unless($actor?->level === 'admin_master', 403, 'Hanya admin master yang boleh mengatur permission sensitif (users.*, roles.*).');
        }

        // Anti-eskalasi mandiri: role yang dipakai aktor sendiri tidak boleh
        // diberi permission di luar yang ia miliki — itu pemberian hak baru
        // ke diri sendiri tanpa jejak persetujuan admin master.
        $isOwnRole = $actor && $actor->roles()->where('roles.id', $role->id)->exists();
        if ($isOwnRole && $actor?->level !== 'admin_master') {
            $beyondOwn = $requestedSlugs->diff($actor->getAssignedPermissionSlugs());
            abort_if($beyondOwn->isNotEmpty(), 403, 'Tidak dapat memberi role sendiri permission di luar yang Anda miliki: '.$beyondOwn->implode(', '));
        }

        $role->permissions()->sync($validated['permission_ids']);

        // Invalidate permission cache untuk semua user yang memakai role ini
        $this->clearRoleUserCache($role);

        return response()->json(['message' => 'Permissions synced to role']);
    }

    // ==================== IMPORT / EXPORT / TEMPLATE ====================

    /**
     * Invalidate permission cache semua user pemakai role ini.
     * Pluck id dulu (1 query) lalu clear per user — tanpa N+1 model.
     */
    private function clearRoleUserCache(Role $role): void
    {
        $role->users()->pluck('users.id')->each(fn (int $userId) => User::clearPermissionCache($userId));
    }

    public function import(Request $request)
    {
        $request->validate([
            'file' => 'required|file|mimes:xlsx,xls,csv|max:5120',
        ]);

        $file = $request->file('file');
        $data = Excel::toArray(null, $file);
        $rows = $data[0] ?? [];

        $imported = 0;
        $updated = 0;
        $errors = [];
        $headers = ['name', 'slug', 'description', 'is_active'];

        foreach ($rows as $index => $row) {
            if ($index === 0) {
                continue;
            } // skip header

            $rowData = array_combine($headers, array_pad($row, count($headers), null));
            if (! $rowData['name'] || ! $rowData['slug']) {
                $errors[] = ['row' => $index + 2, 'errors' => 'Nama dan slug wajib diisi'];

                continue;
            }

            $slug = strtolower(trim($rowData['slug']));
            $existing = Role::where('slug', $slug)->first();

            if ($existing) {
                $newIsActive = filter_var($rowData['is_active'] ?? true, FILTER_VALIDATE_BOOLEAN);

                // Guard sama seperti update(): peran ber-user tidak boleh dinonaktifkan.
                if (! $newIsActive && $existing->users()->exists()) {
                    $errors[] = ['row' => $index + 2, 'errors' => 'Peran dengan user aktif tidak dapat dinonaktifkan.'];

                    continue;
                }

                // Perubahan is_active via import hanya boleh oleh admin_master.
                if ($newIsActive !== (bool) $existing->is_active && $request->user()?->level !== 'admin_master') {
                    $errors[] = ['row' => $index + 2, 'errors' => 'Hanya admin master yang boleh mengubah status aktif peran via import.'];

                    continue;
                }

                $existing->update([
                    'name' => trim($rowData['name']),
                    'description' => $rowData['description'] ?? null,
                    'is_active' => $newIsActive,
                ]);
                $this->clearRoleUserCache($existing);
                $updated++;

                continue;
            }

            try {
                Role::create([
                    'name' => trim($rowData['name']),
                    'slug' => $slug,
                    'description' => $rowData['description'] ?? null,
                    'is_active' => filter_var($rowData['is_active'] ?? true, FILTER_VALIDATE_BOOLEAN),
                ]);
                $imported++;
            } catch (\Exception $e) {
                $errors[] = ['row' => $index + 2, 'errors' => $e->getMessage()];
            }
        }

        return response()->json([
            'message' => 'Import selesai',
            'data' => ['imported' => $imported, 'updated' => $updated, 'errors' => $errors],
        ]);
    }

    public function export()
    {
        ExportGuard::ensureWithinLimit(Role::query());
        $roles = Role::orderBy('name')->get();
        $filename = 'roles-export-'.now()->format('YmdHis').'.csv';

        $headers = [
            'Content-Type' => 'text/csv',
            'Content-Disposition' => 'attachment; filename="'.$filename.'"',
        ];

        $callback = function () use ($roles) {
            $handle = fopen('php://output', 'w');
            fputcsv($handle, ['ID', 'Nama', 'Slug', 'Deskripsi', 'Aktif', 'Dibuat', 'Diubah']);
            foreach ($roles as $role) {
                fputcsv($handle, [
                    $role->id,
                    $role->name,
                    $role->slug,
                    $role->description ?? '',
                    $role->is_active ? 'Ya' : 'Tidak',
                    $role->created_at->format('Y-m-d H:i:s'),
                    $role->updated_at->format('Y-m-d H:i:s'),
                ]);
            }
            fclose($handle);
        };

        return response()->streamDownload($callback, $filename, $headers);
    }

    public function template()
    {
        $filename = 'role-import-template-'.now()->format('YmdHis').'.csv';

        $headers = [
            'Content-Type' => 'text/csv',
            'Content-Disposition' => 'attachment; filename="'.$filename.'"',
        ];

        $callback = function () {
            $handle = fopen('php://output', 'w');
            fputcsv($handle, ['Nama', 'Slug', 'Deskripsi', 'Aktif (true/false)']);
            fputcsv($handle, ['Contoh Role', 'contoh_role', 'Deskripsi singkat', 'true']);
            fputcsv($handle);
            fputcsv($handle, ['Kolom wajib diisi: Nama, Slug']);
            fclose($handle);
        };

        return response()->streamDownload($callback, $filename, $headers);
    }
}
