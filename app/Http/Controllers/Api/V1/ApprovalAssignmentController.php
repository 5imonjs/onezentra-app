<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\ApprovalAssignment;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ApprovalAssignmentController extends Controller
{
    private const LEVELS = ['BLC', 'BAC', 'RLH', 'RFAH'];

    public function index(Request $request): JsonResponse
    {
        $kodeDepo = $request->query('kode_depo', $request->user()->kode_depo);
        abort_unless($this->canAccessDepot($request->user(), $kodeDepo), 403);

        return response()->json([
            'data' => ApprovalAssignment::query()
                ->with('user:id,full_name,email,level,kode_depo,nama_depo,status')
                ->where('kode_depo', $kodeDepo)
                ->where('is_active', true)
                ->get()
                ->keyBy('approval_level'),
            'users' => User::query()
                ->where('status', 'active')
                ->when($request->user()->isDepotScoped(), fn ($query) => $query->where('kode_depo', $kodeDepo))
                ->orderBy('full_name')
                ->get(['id', 'full_name', 'email', 'level', 'kode_depo', 'nama_depo']),
            'levels' => self::LEVELS,
        ]);
    }

    public function upsert(Request $request): JsonResponse
    {
        $user = $request->user();
        $validated = $request->validate([
            'kode_depo' => ['required', 'string', 'max:50'],
            'assignments' => ['required', 'array'],
            'assignments.*.approval_level' => ['required', Rule::in(self::LEVELS)],
            'assignments.*.user_id' => ['required', 'integer', 'exists:users,id'],
        ]);
        abort_unless($this->canAccessDepot($user, $validated['kode_depo']), 403);

        foreach ($validated['assignments'] as $assignment) {
            $approver = User::query()->whereKey($assignment['user_id'])->where('status', 'active')->firstOrFail();
            abort_unless(! $user->isDepotScoped() || $approver->kode_depo === $validated['kode_depo'], 422);

            ApprovalAssignment::updateOrCreate(
                ['kode_depo' => $validated['kode_depo'], 'approval_level' => $assignment['approval_level']],
                ['user_id' => $approver->id, 'is_active' => true]
            );
        }

        return $this->index($request);
    }

    private function canAccessDepot(User $user, string $kodeDepo): bool
    {
        return ! $user->isDepotScoped() || $user->kode_depo === $kodeDepo;
    }
}
