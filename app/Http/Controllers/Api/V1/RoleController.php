<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Http\Request;

class RoleController extends Controller
{
    public function index(Request $request)
    {
        $query = Role::query();
        if ($request->filled('search')) {
            $query->where('name', 'like', '%'.$request->search.'%')
                ->orWhere('slug', 'like', '%'.$request->search.'%');
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

        if (isset($validated['is_active']) && ! $validated['is_active'] && $role->users()->exists()) {
            return response()->json([
                'message' => 'Peran dengan user aktif tidak dapat dinonaktifkan.',
            ], 422);
        }

        $role->update($validated);

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

        $role->permissions()->sync($validated['permission_ids']);

        // Invalidate permission cache untuk semua user yang memakai role ini
        $role->users()->pluck('users.id')->each(fn (int $userId) => User::clearPermissionCache($userId));

        return response()->json(['message' => 'Permissions synced to role']);
    }
}
