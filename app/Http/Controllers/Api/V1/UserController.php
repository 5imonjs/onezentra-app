<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Concerns\AuthorizesDepotRow;
use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\StoreUserRequest;
use App\Http\Requests\Api\V1\SyncUserDepotsRequest;
use App\Http\Requests\Api\V1\UpdateUserRequest;
use App\Imports\UserImport;
use App\Models\DepotSetting;
use App\Models\Role;
use App\Models\User;
use App\Support\LikePattern;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Maatwebsite\Excel\Facades\Excel;

class UserController extends Controller
{
    use AuthorizesDepotRow;

    public function index(Request $request)
    {
        $query = User::with('roles')->forUserDepot($request->user());
        $baseQuery = clone $query;
        if ($request->filled('search')) {
            // Escape wildcard LIKE (% _) agar input dianggap literal.
            $like = LikePattern::contains($request->search);
            $query->where(function ($q) use ($like) {
                $q->whereRaw('full_name LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('email LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('kode_depo LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('nama_depo LIKE ? ESCAPE ?', [$like, '\\']);
            });
        }
        if ($request->filled('level')) {
            $query->where('level', $request->level);
        }
        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }
        if ($request->filled('region_id')) {
            $query->where('region_id', $request->region_id);
        }
        $users = $query->orderBy('created_at', 'desc')->paginate($this->perPage($request));
        // Region mengelompokkan depot, tetapi tidak memperluas akses data.
        $users->through(fn (User $user): array => array_merge($user->toArray(), [
            'depot_codes' => $user->depot_codes,
            'has_region_permission' => $user->hasRegionPermission(),
            'uses_global_scope' => ! $user->isDepotScoped(),
        ]));
        $payload = $users->toArray();
        $payload['meta'] = [
            'total' => (clone $baseQuery)->count(),
            'active' => (clone $baseQuery)->where('status', 'active')->count(),
            'inactive' => (clone $baseQuery)->where('status', 'inactive')->count(),
            'admin_master' => (clone $baseQuery)->where('level', 'admin_master')->count(),
        ];

        return response()->json($payload);
    }

    public function store(StoreUserRequest $request)
    {
        $validated = $request->validated();
        $hasDepotAssignments = array_key_exists('depot_codes', $validated);
        $depotCodes = $validated['depot_codes'] ?? [];
        unset($validated['depot_codes']);

        $this->authorize('assignAdminMaster', [User::class, $validated['level'] ?? null]);

        $validated['password'] = Hash::make($validated['password']);
        $validated['status'] = $validated['status'] ?? 'active';
        $validated['kode_depo'] = $validated['kode_depo'] ?? '';
        $validated['nama_depo'] = $validated['nama_depo'] ?? '';
        if (array_key_exists('region_id', $validated) && blank($validated['region_id'])) {
            $validated['region_id'] = null;
        }
        $validated = $request->user()->depotAttributes($validated);

        $depotAssignments = $hasDepotAssignments
            ? $this->activeDepotAssignments($depotCodes, $validated['region_id'] ?? null, $request->user())
            : null;

        $user = DB::transaction(function () use ($validated, $depotAssignments): User {
            $user = User::create($validated);
            $role = Role::where('slug', $validated['level'])->first();
            if ($role) {
                $user->roles()->attach($role);
                // forceFill, bukan update(): 'role_id' sengaja tidak fillable supaya
                // tidak bisa datang dari payload. Kolom legacy ini harus tetap terisi
                // karena masih dibaca kode lama di luar resolusi permission.
                $user->forceFill(['role_id' => $role->id])->save();
                User::clearPermissionCache($user->id);
            }

            if ($depotAssignments !== null) {
                $this->replaceDepotAssignments($user, $depotAssignments);
            }

            return $user;
        });

        return response()->json([
            'message' => 'User created successfully',
            'data' => $user->load('roles'),
        ], 201);
    }

    public function roleOptions()
    {
        $roles = Role::query()
            ->with('permissions:id,slug')
            ->orderBy('name')
            ->get()
            ->map(fn (Role $role): array => [
                'id' => $role->id,
                'name' => $role->name,
                'slug' => $role->slug,
                'is_active' => $role->is_active,
                'has_global_depot_access' => $role->permissions->contains('slug', 'depot.view_all'),
            ]);

        return response()->json(['data' => $roles]);
    }

    private function authorizeDepot(User $user): void
    {
        $this->authorizeDepotRow(
            $user->kode_depo,
            $user->nama_depo,
            'Pengguna tidak ditemukan di depo Anda.'
        );
    }

    public function show(User $user)
    {
        $this->authorizeDepot($user);

        return response()->json(['data' => $user->load('roles')]);
    }

    public function update(UpdateUserRequest $request, User $user)
    {
        $this->authorizeDepot($user);

        $validated = $request->validated();
        if (isset($validated['level']) && $validated['level'] !== $user->level) {
            $requestedRole = Role::where('slug', $validated['level'])->first();
            abort_if($requestedRole && ! $requestedRole->is_active, 422, 'Role yang dipilih tidak aktif.');
        }
        $hasDepotAssignments = array_key_exists('depot_codes', $validated);
        $depotCodes = $validated['depot_codes'] ?? [];
        unset($validated['depot_codes']);

        $this->authorize('assignAdminMaster', [User::class, $validated['level'] ?? null]);

        // Hanya admin master boleh mengubah level/status akun lain.
        // Tanpa ini, pemegang users.edit bisa menaikkan level akun kompromi
        // lalu memakai permission level baru (eskalasi tanpa jejak).
        $actor = $request->user();
        if (! $actor->isAdminMaster()) {
            foreach (['level', 'status', 'region_id'] as $guarded) {
                if (array_key_exists($guarded, $validated) && $validated[$guarded] !== $user->getOriginal($guarded)) {
                    abort(403, 'Hanya admin master yang boleh mengubah level/status/region akun.');
                }
                unset($validated[$guarded]);
            }
        }

        $regionChanged = array_key_exists('region_id', $validated)
            && $validated['region_id'] !== $user->getOriginal('region_id');
        if ($regionChanged && ! $hasDepotAssignments) {
            $hasDepotAssignments = true;
            $depotCodes = [];
        }

        // Hanya admin master yang boleh mengubah user admin master.
        $this->authorize('update', $user);

        if (array_key_exists('region_id', $validated) && blank($validated['region_id'])) {
            $validated['region_id'] = null;
        }
        $depotAssignments = $hasDepotAssignments
            ? $this->activeDepotAssignments($depotCodes, $validated['region_id'] ?? $user->region_id, $actor)
            : null;

        if (! empty($validated['password'])) {
            $isSelf = $actor->id === $user->id;
            if ($isSelf) {
                // Ganti password sendiri wajib membuktikan kepemilikan akun
                // lewat password lama — mencegah penyalahgunaan sesi tertinggal.
                $request->validate(['current_password' => 'required|string']);
                abort_unless(
                    Hash::check((string) $request->input('current_password'), $actor->getAuthPassword()),
                    422,
                    'Password saat ini salah.'
                );
            } else {
                // Reset password akun lain = tindakan sensitif: hanya admin
                // master, dan selalu dicatat (jejak anti-eskalasi diam-diam).
                abort_unless($actor->isAdminMaster(), 403, 'Hanya admin master yang boleh mereset password pengguna lain.');
                Log::info('Password user direset admin.', [
                    'actor_id' => $actor->id,
                    'target_id' => $user->id,
                    'target_email' => $user->email,
                ]);
            }
            $validated['password'] = Hash::make($validated['password']);
        } else {
            unset($validated['password']);
        }

        if ($request->user()->isDepotScoped()) {
            // Aktor depo-scoped tidak boleh memindahkan user ke depo lain:
            // paksa mengikuti depo miliknya (sudah lolos authorizeDepot).
            $validated = $request->user()->depotAttributes($validated);
        } else {
            // Pertahankan kode_depo/nama_depo milik user kecuali eksplisit dikirim
            // (hindari meng-overwrite depot user dengan depot si pembuat saat update).
            $validated = $validated + [
                'kode_depo' => $user->kode_depo,
                'nama_depo' => $user->nama_depo,
            ];
        }

        DB::transaction(function () use ($user, $validated, $request, $depotAssignments): void {
            $user->update($validated);

            $user->forceFill(['updated_by' => $request->user()->id])->saveQuietly();

            if (isset($validated['level'])) {
                $user->roles()->detach();
                $role = Role::where('slug', $validated['level'])->firstOrFail();
                $user->roles()->attach($role);
                // forceFill: 'role_id' sengaja tidak fillable (lihat User::$fillable).
                $user->forceFill(['role_id' => $role->id])->save();
                User::clearPermissionCache($user->id);
            }

            if ($depotAssignments !== null) {
                $this->replaceDepotAssignments($user, $depotAssignments);
            }
        });

        return response()->json([
            'message' => 'User updated successfully',
            'data' => $user->load('roles'),
        ]);
    }

    public function destroy(User $user)
    {
        $this->authorizeDepot($user);
        if ($user->id === Auth::id()) {
            return response()->json(['message' => 'Cannot delete your own account'], 422);
        }
        if ($user->isAdminMaster()) {
            $this->authorize('delete', $user);
            abort_unless(
                User::where('level', 'admin_master')->whereKeyNot($user->id)->exists(),
                422,
                'Tidak dapat menghapus satu-satunya akun admin master.'
            );
        }
        $user->roles()->detach();
        $user->delete();
        User::clearPermissionCache($user->id);

        return response()->json(['message' => 'User deleted successfully']);
    }

    public function import(Request $request)
    {
        $request->validate(['file' => 'required|file|mimes:xlsx,xls,csv|max:10240']);

        $import = new UserImport($request->user());
        DB::transaction(fn () => Excel::import($import, $request->file('file')));

        return response()->json([
            'message' => 'Import selesai',
            'data' => [
                'total_rows' => $import->totalRows,
                'imported' => $import->imported,
                'updated' => $import->updated,
                'errors' => $import->errors,
            ],
        ]);
    }

    /** Get assignments visible to the actor with their current assignment status. */
    public function getDepots(Request $request, User $user)
    {
        $this->authorizeDepot($user);

        $actor = $request->user();
        $depotsQuery = DepotSetting::where('is_active', true);
        if ($actor->isDepotScoped()) {
            $depotsQuery->whereIn('kode_depo', $actor->depot_codes);
        }
        $allDepots = $depotsQuery
            ->orderBy('region_id')
            ->orderBy('kode_depo')
            ->get(['kode_depo', 'nama_depo', 'region_id']);

        $assignedCodes = $user->isDepotScoped()
            ? $user->depot_codes
            : DB::table('user_depots')->where('user_id', $user->id)->pluck('kode_depo')->all();

        if ($assignedCodes === [] && ! blank($user->kode_depo)) {
            $assignedCodes = [$user->kode_depo];
        }

        $data = $allDepots->map(function ($depot) use ($assignedCodes) {
            return [
                'kode_depo' => $depot->kode_depo,
                'nama_depo' => $depot->nama_depo,
                'region_id' => $depot->region_id,
                'assigned' => in_array($depot->kode_depo, $assignedCodes, true),
            ];
        });

        return response()->json([
            'data' => $data,
            'assigned_count' => count($assignedCodes),
            'region_id' => $user->region_id,
            'has_region_permission' => $user->hasRegionPermission(),
            'uses_global_scope' => ! $user->isDepotScoped(),
        ]);
    }

    /**
     * Sync depot assignments for a user.
     * Expects array of kode_depo to assign.
     */
    public function syncDepots(SyncUserDepotsRequest $request, User $user)
    {
        $this->authorizeDepot($user);

        $validated = $request->validated();
        $depotCodes = $validated['depot_codes'] ?? [];
        $existingDepots = $this->activeDepotAssignments($depotCodes, $user->region_id, $request->user());
        DB::transaction(fn () => $this->replaceDepotAssignments($user, $existingDepots));

        // Clear permission cache since depot_codes changed
        User::clearPermissionCache($user->id);

        return response()->json([
            'message' => 'Depot assignments updated',
            'data' => [
                'assigned' => $existingDepots->pluck('kode_depo')->all(),
                'count' => $existingDepots->count(),
            ],
        ]);
    }

    /**
     * @param  array<int, string>  $depotCodes
     * @return Collection<int, DepotSetting>
     */
    private function activeDepotAssignments(array $depotCodes, ?string $regionId, User $actor): Collection
    {
        $depots = DepotSetting::query()
            ->whereIn('kode_depo', $depotCodes)
            ->where('is_active', true)
            ->get(['kode_depo', 'nama_depo', 'region_id']);

        $invalid = array_diff($depotCodes, $depots->pluck('kode_depo')->all());
        abort_if(
            $invalid !== [],
            422,
            'Depot berikut tidak valid atau tidak aktif: '.implode(', ', $invalid)
        );

        if ($actor->isDepotScoped()) {
            $outsideActorScope = array_diff($depotCodes, $actor->depot_codes);
            abort_if(
                $outsideActorScope !== [],
                403,
                'Anda tidak berwenang menetapkan depot di luar cakupan Anda.'
            );
        }

        $outsideUserRegion = $depots->contains(
            fn (DepotSetting $depot): bool => ! blank($regionId) && $depot->region_id !== $regionId
        );
        $selectedRegions = $depots->pluck('region_id')->unique();
        abort_if(
            $outsideUserRegion || (blank($regionId) && $selectedRegions->count() > 1),
            422,
            'Depot yang dipilih harus berasal dari satu region dan sesuai dengan region user.'
        );

        return $depots;
    }

    /**
     * @param  Collection<int, DepotSetting>  $depots
     */
    private function replaceDepotAssignments(User $user, Collection $depots): void
    {
        DB::table('user_depots')->where('user_id', $user->id)->delete();
        $primaryDepot = $depots->first();
        $user->forceFill([
            'kode_depo' => $primaryDepot?->kode_depo ?? '',
            'nama_depo' => $primaryDepot?->nama_depo ?? '',
        ])->save();

        $syncData = [];
        foreach ($depots as $depot) {
            $syncData[] = [
                'user_id' => $user->id,
                'kode_depo' => $depot->kode_depo,
                'assigned_at' => now(),
            ];
        }
        if ($syncData !== []) {
            DB::table('user_depots')->insert($syncData);
        }

        User::clearPermissionCache($user->id);
    }
}
