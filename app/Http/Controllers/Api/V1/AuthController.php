<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
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

        abort_unless(
            $request->user()->isAdminMaster() || ($validated['level'] ?? null) !== 'admin_master',
            403,
            'Hanya admin master yang dapat membuat admin master.'
        );

        $validated['password'] = Hash::make($validated['password']);
        $validated['status'] = 'active';
        $validated['level'] = $validated['level'] ?? 'staff_logistic';
        $validated = $request->user()->depotAttributes($validated);

        $user = User::create($validated);

        $role = Role::where('slug', $validated['level'])->first();
        if ($role) {
            $user->roles()->attach($role);
            $user->update(['role_id' => $role->id]);
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

        return response()->json([
            'message' => 'Login successful',
            'user' => $user->load('roles'),
            'permissions' => $user->getAssignedPermissionSlugs(),
        ]);
    }

    public function logout(Request $request)
    {
        // Untuk API Bearer token: hapus token akses yang sedang dipakai.
        // Guard method_exists karena sesi cookie stateful memakai
        // TransientToken yang tidak memiliki method delete().
        $currentToken = $request->user()?->currentAccessToken();
        if ($currentToken && method_exists($currentToken, 'delete')) {
            $currentToken->delete();
        }

        // Bersihkan sisa Bearer token yatim milik user ini.
        $request->user()?->tokens()->delete();

        // Untuk login berbasis session (jika ada), invalidasi session.
        // Pakai guard "web" (SessionGuard): guard default saat request
        // Sanctum adalah RequestGuard yang tidak punya method logout().
        if ($request->hasSession()) {
            auth('web')->logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();
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
            'current_password' => 'required_with:password|current_password',
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
}
