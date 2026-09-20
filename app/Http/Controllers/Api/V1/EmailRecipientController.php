<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\EmailRecipient;
use App\Models\Role;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
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

        return response()->json(['data' => $query->get()]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $this->validateRecipient($request);

        $recipient = EmailRecipient::create($validated);

        return response()->json([
            'message' => 'Email recipient created',
            'data' => $recipient->load('user:id,full_name,email'),
        ], 201);
    }

    public function update(Request $request, EmailRecipient $emailRecipient): JsonResponse
    {
        $validated = $this->validateRecipient($request, $emailRecipient->id);

        $emailRecipient->update($validated);

        return response()->json([
            'message' => 'Email recipient updated',
            'data' => $emailRecipient->fresh('user:id,full_name,email'),
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
        $types = ['rencana_kirim', 'sj_ba', 'receiving', 'selisih', 'standarisasi_tumpukan', 'biaya_thl', 'biaya_retribusi'];
        $triggers = ['created', 'validated', 'completed', 'selisih_qty', 'approved', 'rejected', 'submitted', 'checked', 'revisi'];
        $fields = ['TO', 'CC'];

        return response()->json([
            'document_types' => $types,
            'triggers' => $triggers,
            'fields' => $fields,
            'users' => $users,
            'roles' => $roles,
        ]);
    }

    private function validateRecipient(Request $request, ?int $ignoreId = null): array
    {
        $data = $request->validate([
            'document_type' => 'required|string|in:rencana_kirim,sj_ba,receiving,selisih,standarisasi_tumpukan,biaya_thl,biaya_retribusi',
            'trigger' => 'required|string|in:created,validated,completed,selisih_qty,approved,rejected,submitted,checked,revisi',
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
