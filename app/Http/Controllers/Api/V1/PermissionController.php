<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Permission;
use Illuminate\Http\Request;

class PermissionController extends Controller
{
    public function index(Request $request)
    {
        $query = Permission::query();
        if ($request->filled('search')) {
            $query->where('name', 'like', '%'.$request->search.'%')
                ->orWhere('slug', 'like', '%'.$request->search.'%');
        }
        if ($request->filled('menu_group')) {
            $query->where('menu_group', $request->menu_group);
        }
        $permissions = $query
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
        ]);

        $permission->update($validated);

        return response()->json(['message' => 'Permission updated', 'data' => $permission]);
    }

    public function destroy(Permission $permission)
    {
        if ($permission->roles()->exists()) {
            return response()->json(['message' => 'Cannot delete permission assigned to roles'], 422);
        }
        $permission->delete();

        return response()->json(['message' => 'Permission deleted']);
    }
}
