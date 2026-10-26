<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Jobs\LogUserActivity;
use App\Models\DepotSetting;
use App\Models\Role;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function register(Request $request)
    {
        $validated = $request->validate([
            'kode_depo' => 'required|string|max:20',
            'nama_depo' => 'required|string|max:100',
            'full_name' => 'required|string|max:100',
            'email' => 'required|email|max:255|unique:users,email',
            'password' => 'required|string|min:8|confirmed',
            'level' => 'nullable|in:'.implode(',', Role::LEVEL_SLUGS),
        ]);

        $actor = $request->user();
        $validated['level'] = $validated['level'] ?? 'staff_logistic';
        abort_unless(
            $actor->isMasterScope() || $validated['level'] !== 'admin_master',
            403,
            'Hanya scope Master yang dapat menetapkan role admin master.'
        );

        $role = Role::with('permissions')->where('slug', $validated['level'])->first();
        abort_unless($role && $role->is_active, 422, 'Role yang dipilih tidak aktif.');

        // Register adalah jalur lama; jangan biarkan aktor depo memberi role
        // yang membuka akses semua depo (eskalasi di luar /users).
        abort_if(
            ! $actor->isMasterScope() && $role->permissions->contains('slug', 'depot.view_all'),
            403,
            'Anda tidak berwenang menetapkan role dengan akses semua depo.'
        );

        $validated['password'] = Hash::make($validated['password']);
        $validated['status'] = 'active';
        // Hanya master yang boleh membuat admin_master; user itu memang
        // global. Semua role lain dari jalur lama ini tetap depot-scoped.
        $validated['scope_level'] = $actor->isMasterScope() && $role->slug === 'admin_master'
            ? 'master'
            : 'depot';
        $validated['kode_ps'] = null;

        $requestedDepot = DepotSetting::query()
            ->where('kode_depo', $validated['kode_depo'])
            ->where('is_active', true)
            ->first();

        if ($actor->isMasterScope()) {
            // Master boleh memilih depo aktif; region mengikuti depo tersebut.
            abort_unless($requestedDepot, 422, 'Depo yang dipilih tidak aktif.');
            $validated['region_id'] = $requestedDepot->region_id;
            $validated['nama_depo'] = $requestedDepot->nama_depo;
        } else {
            // Aktor ter-scope: depo SELALU depo aktor, bukan input klien.
            $validated = $actor->depotAttributes($validated);
            $depot = DepotSetting::query()
                ->where('kode_depo', $validated['kode_depo'])
                ->first();
            $validated['region_id'] = $depot?->region_id ?? $actor->region_id;
            $validated['nama_depo'] = $depot?->nama_depo ?? $actor->nama_depo ?? $validated['kode_depo'];
        }

        $user = User::create($validated);

        if ($role) {
            $user->roles()->attach($role);
            // forceFill: 'role_id' sengaja tidak fillable (lihat User::$fillable).
            $user->forceFill(['role_id' => $role->id])->save();
        }

        return response()->json([
            'message' => 'Registration successful',
            'user' => $user->load('roles'),
        ], 201);
    }

    public function login(Request $request)
    {
        $request->validate([
            'email' => 'required|email',
            'password' => 'required',
        ]);

        $user = User::where('email', $request->email)->first();

        if (! $user || ! Hash::check($request->password, $user->password)) {
            throw ValidationException::withMessages([
                'email' => ['The provided credentials are incorrect.'],
            ]);
        }

        if ($user->status !== 'active') {
            // Cabang ini hanya tercapai setelah password diverifikasi BENAR,
            // jadi status akun tidak bisa di-enumerasi tanpa kredensial yang
            // valid. Staf yang dinonaktifkan diberi pesan jelas agar tahu harus
            // menghubungi admin (pesan dipetakan ke bahasa Indonesia di klien).
            throw ValidationException::withMessages([
                'email' => ['Your account is inactive.'],
            ]);
        }

        // Autentikasi SPA ini murni berbasis cookie Sanctum (stateful).
        // Jangan terbitkan Bearer token: frontend tidak pernah mengirim
        // header Authorization sehingga token hanya menumpuk tak terpakai.
        if ($request->hasSession()) {
            Auth::login($user);
            $request->session()->regenerate();
        }

        $this->trackAuthEvent($user, 'LOGIN', 'auth.login');

        return response()->json([
            'message' => 'Login successful',
            'user' => $user->load('roles'),
            'permissions' => $user->getAssignedPermissionSlugs(),
        ]);
    }

    public function logout(Request $request)
    {
        $user = $request->user();

        // Hapus HANYA token akses yang dipakai request ini (multi-device safe).
        // Jangan pakai `$user->tokens()->delete()`: itu akan mencabut token
        // mobile / perangkat lain saat user logout dari web.
        $currentToken = $user?->currentAccessToken();
        if ($currentToken && method_exists($currentToken, 'delete')) {
            $currentToken->delete();
        }

        // Untuk login berbasis session (jika ada), invalidasi session.
        // Pakai guard "web" (SessionGuard): guard default saat request
        // Sanctum adalah RequestGuard yang tidak punya method logout().
        if ($request->hasSession()) {
            auth('web')->logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }

        if ($user !== null) {
            $this->trackAuthEvent($user, 'LOGOUT', 'auth.logout');
        }

        return response()->json(['message' => 'Logged out successfully']);
    }

    /**
     * Login khusus mobile (React Native / Flutter) berbasis Bearer token.
     *
     * Web SPA tetap memakai cookie stateful via `login()` dan TIDAK pernah
     * menerima token. Endpoint ini satu-satunya yang menerbitkan
     * `personal_access_token`, satu token per perangkat (`device_name`)
     * sehingga logout di satu perangkat tidak menendang perangkat lain.
     */
    public function mobileLogin(Request $request)
    {
        $validated = $request->validate([
            'email' => 'required|email',
            'password' => 'required',
            'device_name' => 'nullable|string|max:100',
        ]);

        $user = User::where('email', $validated['email'])->first();

        if (! $user || ! Hash::check($validated['password'], $user->password)) {
            throw ValidationException::withMessages([
                'email' => ['The provided credentials are incorrect.'],
            ]);
        }

        if ($user->status !== 'active') {
            // Cabang ini hanya tercapai setelah password diverifikasi BENAR,
            // jadi status akun tidak bisa di-enumerasi tanpa kredensial yang
            // valid. Staf yang dinonaktifkan diberi pesan jelas agar tahu harus
            // menghubungi admin (pesan dipetakan ke bahasa Indonesia di klien).
            throw ValidationException::withMessages([
                'email' => ['Your account is inactive.'],
            ]);
        }

        $deviceName = $validated['device_name'] ?? 'mobile';
        $expirationMinutes = (int) config('sanctum.expiration', 480);
        $expiresAt = now()->addMinutes($expirationMinutes);

        $token = $user->createToken($deviceName, ['*'], $expiresAt);

        $this->trackAuthEvent($user, 'LOGIN', 'auth.mobile_login');

        return response()->json([
            'message' => 'Login successful',
            'token' => $token->plainTextToken,
            'token_type' => 'Bearer',
            'expires_at' => $expiresAt->toIso8601String(),
            'user' => $user->load('roles'),
            'permissions' => $user->getAssignedPermissionSlugs(),
        ]);
    }

    /**
     * Logout khusus mobile: cabut HANYA token perangkat ini.
     * Token perangkat lain milik user yang sama tetap berlaku.
     */
    public function mobileLogout(Request $request)
    {
        $user = $request->user();
        $currentToken = $user?->currentAccessToken();
        if ($currentToken && method_exists($currentToken, 'delete')) {
            $currentToken->delete();
        }

        if ($user !== null) {
            $this->trackAuthEvent($user, 'LOGOUT', 'auth.mobile_logout');
        }

        return response()->json(['message' => 'Logged out successfully']);
    }

    public function user(Request $request)
    {
        $user = $request->user();

        return response()->json([
            'user' => $user->load('roles'),
            'permissions' => $user->getAssignedPermissionSlugs(),
        ]);
    }

    public function updateProfile(Request $request)
    {
        $user = $request->user();

        $validated = $request->validate([
            'full_name' => 'sometimes|string|max:100',
            'email' => 'sometimes|email|unique:users,email,'.$user->id,
            // Ganti email MAUPUN password wajib membuktikan kepemilikan akun:
            // tanpa ini sesi tertinggal bisa membajak akun lewat ganti email
            // (lalu reset password) tanpa tahu password lama.
            'current_password' => 'required_with:password,email|current_password',
            'password' => 'sometimes|string|min:8|confirmed',
        ]);

        unset($validated['current_password']);

        if (isset($validated['password'])) {
            $validated['password'] = Hash::make($validated['password']);
        }

        $user->update($validated);

        return response()->json([
            'message' => 'Profile updated',
            'user' => $user->load('roles'),
        ]);
    }

    /**
     * Catat login/logout sebagai bagian dari mobilitas pengguna. Middleware
     * TrackUserActivity sengaja melewati rute auth agar tidak terjadi dobel.
     */
    private function trackAuthEvent(User $user, string $method, string $route): void
    {
        dispatch(new LogUserActivity(
            $user->id,
            $method,
            $route,
            now()->toDateTimeString(),
        ))->afterResponse();
    }
}
