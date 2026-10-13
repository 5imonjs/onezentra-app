<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\EmailRecipient;
use App\Models\Role;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class EmailRecipientController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = EmailRecipient::with('user:id,full_name,email')
            ->when($request->document_type, fn ($q) => $q->where('document_type', $request->document_type))
            ->when($request->trigger, fn ($q) => $q->where('trigger', $request->trigger))
            ->when($request->search, function ($q) use ($request) {
                $q->where(function ($qq) use ($request) {
                    $qq->where('email', 'like', "%{$request->search}%")
                        ->orWhere('label', 'like', "%{$request->search}%")
                        ->orWhereHas('user', fn ($u) => $u->where('full_name', 'like', "%{$request->search}%"));
                });
            })
            ->orderBy('document_type')
            ->orderBy('trigger')
            ->orderBy('field');

        return response()->json(['data' => $this->withResolution($query->get())]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $this->validateRecipient($request);

        $recipient = EmailRecipient::create($validated);

        return response()->json([
            'message' => 'Email recipient created',
            'data' => $this->withResolution(collect([$recipient->load('user:id,full_name,email')]))->first(),
        ], 201);
    }

    public function update(Request $request, EmailRecipient $emailRecipient): JsonResponse
    {
        $validated = $this->validateRecipient($request, $emailRecipient->id);

        $emailRecipient->update($validated);

        return response()->json([
            'message' => 'Email recipient updated',
            'data' => $this->withResolution(collect([$emailRecipient->fresh('user:id,full_name,email')]))->first(),
        ]);
    }

    public function destroy(EmailRecipient $emailRecipient): JsonResponse
    {
        $emailRecipient->delete();

        return response()->json(['message' => 'Email recipient deleted']);
    }

    public function options(): JsonResponse
    {
        $users = User::where('status', 'active')->select('id', 'full_name', 'email')->orderBy('full_name')->get();
        $roles = Role::select('id', 'name', 'slug')->orderBy('name')->get();
        $depots = User::where('status', 'active')
            ->whereNotNull('kode_depo')
            ->select('kode_depo', 'nama_depo')
            ->distinct()
            ->orderBy('kode_depo')
            ->get();
        $types = ['rencana_kirim', 'sj_ba', 'receiving', 'selisih', 'standarisasi_tumpukan', 'biaya_thl', 'biaya_retribusi', 'opname_expired'];
        $triggers = ['created', 'cancelled', 'validated', 'completed', 'selisih_qty', 'approved', 'rejected', 'submitted', 'checked', 'rlh_approved', 'revisi', 'reminder'];
        $fields = ['TO', 'CC'];

        return response()->json([
            'document_types' => $types,
            'triggers' => $triggers,
            'fields' => $fields,
            'users' => $users,
            'roles' => $roles,
            'depots' => $depots,
        ]);
    }

    /**
     * Tambahkan status resolusi per baris agar UI bisa menandai penerima
     * yang tidak akan terkirim (role yatim / tanpa user aktif / user nonaktif).
     * Dihitung batch (2 query) agar tidak N+1.
     *
     * @param  Collection<int, EmailRecipient>  $recipients
     * @return Collection<int, array>
     */
    private function withResolution($recipients)
    {
        $roleSlugs = $recipients->where('recipient_type', 'role')->pluck('role_slug')->filter()->unique()->values();
        $existingRoles = $roleSlugs->isNotEmpty()
            ? Role::whereIn('slug', $roleSlugs)->pluck('slug')->all()
            : [];
        $roleCounts = $roleSlugs->isNotEmpty()
            ? DB::table('users')
                ->join('role_user', 'role_user.user_id', '=', 'users.id')
                ->join('roles', 'roles.id', '=', 'role_user.role_id')
                ->where('users.status', 'active')
                ->whereNotNull('users.email')
                ->where('users.email', '<>', '')
                ->whereIn('roles.slug', $roleSlugs)
                ->groupBy('roles.slug')
                ->selectRaw('roles.slug, COUNT(DISTINCT users.id) as c')
                ->pluck('c', 'slug')
            : collect();

        $userIds = $recipients->where('recipient_type', 'user')->pluck('user_id')->filter()->unique()->values();
        $validUserIds = $userIds->isNotEmpty()
            ? User::whereIn('id', $userIds)->where('status', 'active')->whereNotNull('email')->where('email', '<>', '')->pluck('id')->all()
            : [];

        return $recipients->map(function (EmailRecipient $r) use ($roleCounts, $validUserIds) {
            $arr = $r->toArray();
            $arr['resolved_count'] = match ($r->recipient_type) {
                'role' => (int) ($roleCounts[$r->role_slug] ?? 0),
                'user' => in_array($r->user_id, $validUserIds, true) ? 1 : 0,
                default => blank($r->email) ? 0 : 1,
            };

            return $arr;
        });
    }

    private function validateRecipient(Request $request, ?int $ignoreId = null): array
    {
        $data = $request->validate([
            'document_type' => 'required|string|in:rencana_kirim,sj_ba,receiving,selisih,standarisasi_tumpukan,biaya_thl,biaya_retribusi,opname_expired',
            'trigger' => 'required|string|in:created,cancelled,validated,completed,selisih_qty,approved,rejected,submitted,checked,rlh_approved,revisi,reminder',
            'recipient_type' => 'required|string|in:email,user,role',
            'field' => 'required|string|in:TO,CC',
            'email' => 'nullable|email|max:255',
            'user_id' => 'nullable|exists:users,id',
            'role_slug' => 'nullable|string|exists:roles,slug|max:50',
            'label' => 'nullable|string|max:100',
            'is_active' => 'nullable|boolean',
        ]);

        $errors = match ($data['recipient_type']) {
            'email' => blank($data['email'] ?? null) ? ['email' => ['Email wajib diisi untuk recipient type email.']] : [],
            'user' => empty($data['user_id']) ? ['user_id' => ['User wajib dipilih untuk recipient type user.']] : [],
            'role' => blank($data['role_slug'] ?? null) ? ['role_slug' => ['Role wajib dipilih untuk recipient type role.']] : [],
        };

        if ($errors) {
            throw ValidationException::withMessages($errors);
        }

        return $data;
    }
}
