<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\StoreUserRequest;
use App\Http\Requests\Api\V1\SyncUserDepotsRequest;
use App\Http\Requests\Api\V1\UpdateUserRequest;
use App\Imports\UserImport;
use App\Models\DepotSetting;
use App\Models\PartnerSite;
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
    public function index(Request $request)
    {
        $actor = $request->user();
        $query = User::with('roles');
        if (! $actor->isMasterScope()) {
            if ($actor->scope_level === 'region') {
                $query->where('region_id', $actor->region_id);
            } elseif ($actor->scope_level === 'depot') {
                $query->where('kode_depo', $actor->kode_depo);
            } elseif ($actor->scope_level === 'ps') {
                $query->where('kode_ps', $actor->kode_ps);
            } else {
                $query->whereRaw('1 = 0');
            }
        }
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
        $actor = $request->user();
        $requestedDepotCodes = $validated['depot_codes'] ?? null;
        unset($validated['depot_codes']);
        $depotCode = $validated['kode_depo'];
        $depot = DepotSetting::query()
            ->where('kode_depo', $depotCode)
            ->where('is_active', true)
            ->firstOrFail();
        abort_if(
            $depot->region_id !== $validated['region_id'],
            422,
            'Depo yang dipilih harus berada di region akun.'
        );
        abort_if(
            $requestedDepotCodes !== null && $requestedDepotCodes !== [$depotCode],
            422,
            'Akun hanya dapat ditetapkan ke satu depo dan harus sesuai dengan depo utama.'
        );
        $this->authorizeUserScopeAssignment($validated, $actor);
        if (($validated['scope_level'] ?? null) === 'ps') {
            abort_unless(
                PartnerSite::query()
                    ->where('kode_ps', $validated['kode_ps'])
                    ->where('kode_depo', $depotCode)
                    ->where('is_active', true)
                    ->exists(),
                422,
                'Partner Site harus berada di depo akun.'
            );
        } else {
            $validated['kode_ps'] = null;
        }

        $validated['nama_depo'] = $depot->nama_depo;
        $depotCodes = [$depotCode];

        $this->authorize('assignAdminMaster', [User::class, $validated['level'] ?? null]);

        $validated['password'] = Hash::make($validated['password']);
        $validated['status'] = $validated['status'] ?? 'active';
        $depotAssignments = $this->activeDepotAssignments($depotCodes, $validated['region_id'], $actor);

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
        $actor = Auth::user();
        abort_unless($actor instanceof User, 403);

        if ($actor->isMasterScope()) {
            return;
        }
        abort_if($user->scope_level === 'master', 403, 'Pengguna tidak ditemukan dalam scope Anda.');

        $isWithinScope = match ($actor->scope_level) {
            'region' => filled($actor->region_id) && $user->region_id === $actor->region_id,
            'depot' => filled($actor->kode_depo) && $user->kode_depo === $actor->kode_depo,
            'ps' => filled($actor->kode_ps)
                && $user->kode_depo === $actor->kode_depo
                && $user->kode_ps === $actor->kode_ps,
            default => false,
        };

        abort_unless($isWithinScope, 403, 'Pengguna tidak ditemukan dalam scope Anda.');
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
        $requestedDepotCodes = $validated['depot_codes'] ?? null;
        unset($validated['depot_codes']);

        $this->authorize('assignAdminMaster', [User::class, $validated['level'] ?? null]);

        // Hanya scope Master boleh mengubah role/status akun lain.
        // Tanpa ini, pemegang users.edit bisa menaikkan level akun kompromi
        // lalu memakai permission level baru (eskalasi tanpa jejak).
        $actor = $request->user();
        if (! $actor->isMasterScope()) {
            foreach (['level', 'status'] as $guarded) {
                if (array_key_exists($guarded, $validated) && $validated[$guarded] !== $user->getOriginal($guarded)) {
                    abort(403, 'Hanya scope Master yang boleh mengubah role/status akun.');
                }
                unset($validated[$guarded]);
            }
        }
        if (! $actor->isMasterScope()) {
            foreach (['region_id', 'scope_level', 'kode_depo', 'nama_depo', 'kode_ps'] as $guarded) {
                if (array_key_exists($guarded, $validated) && $validated[$guarded] !== $user->getOriginal($guarded)) {
                    abort(403, 'Hanya Master yang boleh mengubah scope akun.');
                }
                unset($validated[$guarded]);
            }
        }

        // Hanya scope Master yang boleh mengubah akun scope Master.
        $this->authorize('update', $user);

        $scopeFieldsChanged = array_intersect(
            ['scope_level', 'region_id', 'kode_depo', 'kode_ps', 'depot_codes'],
            array_keys($request->validated())
        ) !== [];
        $depotAssignments = null;
        if ($scopeFieldsChanged) {
            $scope = [
                'scope_level' => $validated['scope_level'] ?? $user->scope_level,
                'region_id' => $validated['region_id'] ?? $user->region_id,
                'kode_depo' => $validated['kode_depo'] ?? $requestedDepotCodes[0] ?? $user->kode_depo,
                'kode_ps' => $validated['kode_ps'] ?? $user->kode_ps,
            ];
            $depotCode = $scope['kode_depo'];
            $depot = DepotSetting::query()
                ->where('kode_depo', $depotCode)
                ->where('is_active', true)
                ->first();
            abort_unless($depot, 422, 'Depo akun wajib aktif dan valid.');
            abort_unless($depot->region_id === $scope['region_id'], 422, 'Depo yang dipilih harus berada di region akun.');
            abort_if(
                $requestedDepotCodes !== null && $requestedDepotCodes !== [$depotCode],
                422,
                'Akun hanya dapat ditetapkan ke satu depo dan harus sesuai dengan depo utama.'
            );
            if ($scope['scope_level'] === 'ps') {
                abort_unless(
                    PartnerSite::query()
                        ->where('kode_ps', $scope['kode_ps'])
                        ->where('kode_depo', $depotCode)
                        ->where('is_active', true)
                        ->exists(),
                    422,
                    'Partner Site harus berada di depo akun.'
                );
            } else {
                $validated['kode_ps'] = null;
            }
            $validated['nama_depo'] = $depot->nama_depo;
            $validated['region_id'] = $scope['region_id'];
            $validated['kode_depo'] = $depotCode;
            $validated['scope_level'] = $scope['scope_level'];
            $this->authorizeUserScopeAssignment($scope, $actor, $user);
            $depotAssignments = $this->activeDepotAssignments([$depotCode], $scope['region_id'], $actor);
            unset($validated['depot_codes']);
        }

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
                // Reset password akun lain = tindakan sensitif: hanya scope
                // Master, dan selalu dicatat.
                abort_unless($actor->isMasterScope(), 403, 'Hanya scope Master yang boleh mereset password pengguna lain.');
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
        if ($user->scope_level === 'master') {
            $this->authorize('delete', $user);
            abort_unless(
                User::where('scope_level', 'master')->whereKeyNot($user->id)->exists(),
                422,
                'Tidak dapat menghapus satu-satunya akun Master.'
            );
        }
        $user->roles()->detach();
        $user->delete();
        User::clearPermissionCache($user->id);

        return response()->json(['message' => 'User deleted successfully']);
    }

    public function import(Request $request)
    {
        abort_unless($request->user()?->isMasterScope(), 403, 'Hanya scope Master yang boleh mengimpor pengguna.');
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
        if ($actor->isMasterScope()) {
            // Master scope may assign an account to any active depot.
        } elseif ($actor->scope_level === 'region' && filled($actor->region_id)) {
            $depotsQuery->where('region_id', $actor->region_id);
        } else {
            $depotsQuery->where('kode_depo', $actor->kode_depo);
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
        if ($user->scope_level === 'ps') {
            abort_unless(
                PartnerSite::query()->where('kode_ps', $user->kode_ps)->where('kode_depo', $depotCodes[0] ?? null)->exists(),
                422,
                'Depo harus sesuai dengan Partner Site akun.'
            );
        }
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
        abort_if(count($depotCodes) !== 1, 422, 'Setiap akun harus ditetapkan ke tepat satu depo.');

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

        if (! $actor->isMasterScope()) {
            $allowed = match ($actor->scope_level) {
                'region' => $depots->every(fn (DepotSetting $depot): bool => $depot->region_id === $actor->region_id),
                'depot', 'ps' => $depots->every(fn (DepotSetting $depot): bool => $depot->kode_depo === $actor->kode_depo),
                default => false,
            };
            abort_unless($allowed, 403, 'Anda tidak berwenang menetapkan depo di luar scope Anda.');
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
     * Ensure the requested account scope is a descendant of the actor's scope.
     *
     * @param  array{scope_level: string, region_id: ?string, kode_depo: ?string, kode_ps?: ?string}  $scope
     */
    private function authorizeUserScopeAssignment(array $scope, User $actor): void
    {
        abort_unless(
            filled($scope['region_id']) && filled($scope['kode_depo']),
            422,
            'Setiap akun wajib memiliki region dan depo.'
        );
        abort_if(
            $scope['scope_level'] === 'master' && ! $actor->isMasterScope(),
            403,
            'Hanya Master yang dapat menetapkan scope Master.'
        );

        if ($actor->isMasterScope()) {
            return;
        }

        $allowedLevels = match ($actor->scope_level) {
            'region' => ['depot', 'ps'],
            'depot' => ['depot', 'ps'],
            'ps' => [],
            default => [],
        };
        abort_unless(
            in_array($scope['scope_level'], $allowedLevels, true),
            403,
            'Anda tidak dapat menetapkan akun di luar level scope Anda.'
        );

        if ($actor->scope_level === 'region') {
            abort_unless($scope['region_id'] === $actor->region_id, 403, 'Anda hanya dapat menetapkan akun di region Anda.');
        } elseif ($actor->scope_level === 'depot') {
            abort_unless($scope['kode_depo'] === $actor->kode_depo, 403, 'Anda hanya dapat menetapkan akun di depo Anda.');
        } else {
            abort_unless(
                $scope['kode_depo'] === $actor->kode_depo && ($scope['kode_ps'] ?? null) === $actor->kode_ps,
                403,
                'Anda hanya dapat menetapkan akun di Partner Site Anda.'
            );
        }
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

        if (blank($user->region_id) && filled($primaryDepot?->region_id)) {
            $user->forceFill(['region_id' => $primaryDepot->region_id])->save();
        }

        User::clearPermissionCache($user->id);
    }
}
