<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Permission untuk master Cluster / Principal.
     *
     * Grant mengikuti pasangan NPN (npn.view -> cluster_principal.view, dan
     * seterusnya): siapa pun yang sudah dipercaya mengelola master produk otomatis
     * bisa mengelola master cluster/principal juga, sehingga tidak ada akses yang
     * hilang atau menu yang tiba-tiba tersembunyi setelah deploy.
     *
     * Role baru cukup dicentang manual di Roles & Permissions.
     */
    public function up(): void
    {
        $definitions = [
            'cluster_principal.view' => ['Cluster Principal View', 'building-office', 'cluster_principal.index', 245],
            'cluster_principal.create' => ['Cluster Principal Create', 'plus', 'cluster_principal.create', 246],
            'cluster_principal.edit' => ['Cluster Principal Edit', 'edit', 'cluster_principal.edit', 247],
            'cluster_principal.delete' => ['Cluster Principal Delete', 'trash', 'cluster_principal.destroy', 248],
        ];

        // Setiap permission baru mewarisi satu permission NPN yang setara.
        $inheritFrom = [
            'cluster_principal.view' => 'npn.view',
            'cluster_principal.create' => 'npn.create',
            'cluster_principal.edit' => 'npn.edit',
            'cluster_principal.delete' => 'npn.delete',
        ];

        foreach ($definitions as $slug => [$name, $icon, $route, $sortOrder]) {
            DB::table('permissions')->updateOrInsert(
                ['slug' => $slug],
                [
                    'name' => $name,
                    'slug' => $slug,
                    'menu_group' => 'Cluster Principal',
                    'icon' => $icon,
                    'route' => $route,
                    'sort_order' => $sortOrder,
                    'is_active' => true,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]
            );

            $sourceId = DB::table('permissions')->where('slug', $inheritFrom[$slug])->value('id');
            $targetId = DB::table('permissions')->where('slug', $slug)->value('id');

            if (! $sourceId || ! $targetId) {
                continue;
            }

            $roleIds = DB::table('role_permission')->where('permission_id', $sourceId)->pluck('role_id');
            foreach ($roleIds as $roleId) {
                DB::table('role_permission')->updateOrInsert(
                    ['role_id' => $roleId, 'permission_id' => $targetId],
                    ['created_at' => now(), 'updated_at' => now()]
                );
            }
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        $ids = DB::table('permissions')->where('slug', 'like', 'cluster_principal.%')->pluck('id');
        DB::table('role_permission')->whereIn('permission_id', $ids)->delete();
        DB::table('permissions')->whereIn('id', $ids)->delete();
    }
};
