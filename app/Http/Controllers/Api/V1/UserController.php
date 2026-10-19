<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Concerns\AuthorizesDepotRow;
use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\StoreUserRequest;
use App\Http\Requests\Api\V1\UpdateUserRequest;
use App\Imports\UserImport;
use App\Models\Role;
use App\Models\User;
use App\Support\LikePattern;
use Illuminate\Http\Request;
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
        $users = $query->orderBy('created_at', 'desc')->paginate($this->perPage($request));
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

        $this->authorize('assignAdminMaster', [User::class, $validated['level'] ?? null]);

        $validated['password'] = Hash::make($validated['password']);
        $validated['status'] = $validated['status'] ?? 'active';
        $validated = $request->user()->depotAttributes($validated);

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

        return response()->json([
            'message' => 'User created successfully',
            'data' => $user->load('roles'),
        ], 201);
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

        $this->authorize('assignAdminMaster', [User::class, $validated['level'] ?? null]);

        // Hanya admin master boleh mengubah level/status akun lain.
        // Tanpa ini, pemegang users.edit bisa menaikkan level akun kompromi
        // lalu memakai permission level baru (eskalasi tanpa jejak).
        $actor = $request->user();
        if (! $actor->isAdminMaster()) {
            foreach (['level', 'status'] as $guarded) {
                if (array_key_exists($guarded, $validated) && $validated[$guarded] !== $user->getOriginal($guarded)) {
                    abort(403, 'Hanya admin master yang boleh mengubah level/status akun.');
                }
                unset($validated[$guarded]);
            }
        }

        // Hanya admin master yang boleh mengubah user admin master.
        $this->authorize('update', $user);

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

        $user->update($validated);

        $user->forceFill(['updated_by' => $request->user()->id])->saveQuietly();

        if (isset($validated['level'])) {
            $user->roles()->detach();
            $role = Role::where('slug', $validated['level'])->first();
            if ($role) {
                $user->roles()->attach($role);
                // forceFill: 'role_id' sengaja tidak fillable (lihat User::$fillable).
                $user->forceFill(['role_id' => $role->id])->save();
            }
            User::clearPermissionCache($user->id);
        }

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
}
