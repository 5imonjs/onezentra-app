<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Permission;
use App\Models\User;
use App\Support\LikePattern;
use Illuminate\Http\Request;

class PermissionController extends Controller
{
    public function index(Request $request)
    {
        $query = Permission::query();
        if ($request->filled('search')) {
            $like = LikePattern::contains($request->search);
            $query->where(function ($q) use ($like) {
                $q->whereRaw('name LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('slug LIKE ? ESCAPE ?', [$like, '\\']);
            });
        }
        if ($request->filled('menu_group')) {
            $query->where('menu_group', $request->menu_group);
        }
        $permissions = $query
            ->with('parent:id,name,slug')
            ->withCount('roles')
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();
        $groups = Permission::whereNotNull('menu_group')
            ->selectRaw('menu_group, MIN(sort_order) as min_sort')
            ->groupBy('menu_group')
            ->orderBy('min_sort')
            ->pluck('menu_group');

        return response()->json(['data' => $permissions, 'groups' => $groups]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:100',
            'slug' => 'required|string|max:100|unique:permissions,slug',
            'description' => 'nullable|string|max:255',
            'menu_group' => 'nullable|string|max:100',
            'icon' => 'nullable|string|max:50',
            'route' => 'nullable|string|max:255',
            'parent_id' => 'nullable|integer|exists:permissions,id',
        ]);

        $permission = Permission::create($validated);

        return response()->json(['message' => 'Permission created', 'data' => $permission], 201);
    }

    public function show(Permission $permission)
    {
        $permission->load('roles');

        return response()->json(['data' => $permission]);
    }

    public function update(Request $request, Permission $permission)
    {
        $validated = $request->validate([
            'name' => 'sometimes|string|max:100',
            'slug' => 'sometimes|string|max:100|unique:permissions,slug,'.$permission->id,
            'description' => 'nullable|string|max:255',
            'menu_group' => 'nullable|string|max:100',
            'icon' => 'nullable|string|max:50',
            'route' => 'nullable|string|max:255',
            'is_active' => 'nullable|boolean',
            'parent_id' => 'nullable|integer|exists:permissions,id',
        ]);

        // Slug permission adalah acuan gate CheckPermission di routes — rename
        // diam-diam memutus/mengalihkan gate. Immutable bagi non-Master.
        if (array_key_exists('slug', $validated) && $validated['slug'] !== $permission->slug) {
            abort_unless($request->user()?->isMasterScope(), 403, 'Hanya scope Master yang boleh mengubah slug permission.');
        }

        if (array_key_exists('parent_id', $validated)) {
            $this->assertValidParentId($permission, $validated['parent_id']);
        }

        $permission->update($validated);

        $this->clearAffectedUserCache($permission);

        return response()->json(['message' => 'Permission updated', 'data' => $permission]);
    }

    public function destroy(Permission $permission)
    {
        if ($permission->roles()->exists()) {
            return response()->json(['message' => 'Cannot delete permission assigned to roles'], 422);
        }
        $this->clearAffectedUserCache($permission);
        $permission->delete();

        return response()->json(['message' => 'Permission deleted']);
    }

    /**
     * Cegah siklus pada hierarki tampilan: sebuah permission tidak boleh menjadi
     * induk dirinya sendiri atau dipindah ke bawah salah satu turunannya.
     */
    private function assertValidParentId(Permission $permission, ?int $parentId): void
    {
        if ($parentId === null) {
            return;
        }

        abort_if($parentId === $permission->id, 422, 'Permission tidak boleh menjadi induk dirinya sendiri.');

        $cursor = Permission::find($parentId);
        $visited = [];
        while ($cursor !== null && ! in_array($cursor->id, $visited, true)) {
            $visited[] = $cursor->id;
            abort_if($cursor->id === $permission->id, 422, 'Permission tidak boleh dipindah ke bawah turunannya sendiri.');
            $cursor = $cursor->parent_id ? Permission::find($cursor->parent_id) : null;
        }
    }

    /**
     * Invalidate permission cache semua user yang terdampak permission ini
     * (user dengan role yang memegang permission tersebut).
     * Satu query pluck id lalu clear per user — tanpa N+1 model.
     */
    private function clearAffectedUserCache(Permission $permission): void
    {
        User::whereHas('roles.permissions', fn ($q) => $q->where('permissions.id', $permission->id))
            ->pluck('users.id')
            ->each(fn (int $userId) => User::clearPermissionCache($userId));
    }
}
