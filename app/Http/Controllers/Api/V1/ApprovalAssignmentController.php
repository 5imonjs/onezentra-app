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
        $module = $request->query('module') === ApprovalAssignment::MODULE_RETRIBUSI
            ? ApprovalAssignment::MODULE_RETRIBUSI
            : ApprovalAssignment::MODULE_THL;

        $assignments = ApprovalAssignment::query()
            ->where('module', $module)
            ->with('user:id,full_name,email,level,kode_depo,nama_depo,status')
            ->where(function ($query) use ($kodeDepo): void {
                $query->where('kode_depo', 'ADMIN')
                    ->orWhere('kode_depo', $kodeDepo);
            })
            ->where('is_active', true)
            ->orderByRaw('CASE WHEN kode_depo = ? THEN 1 ELSE 0 END', [$kodeDepo])
            ->get()
            ->keyBy('approval_level');

        $depots = User::query()
            ->whereNotNull('kode_depo')
            ->where('kode_depo', '!=', '')
            ->select(['kode_depo', 'nama_depo'])
            ->distinct()
            ->orderBy('nama_depo')
            ->get();

        return response()->json([
            'data' => $assignments,
            'depots' => $depots,
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
            'module' => ['nullable', 'string', Rule::in([ApprovalAssignment::MODULE_THL, ApprovalAssignment::MODULE_RETRIBUSI])],
            'assignments' => ['required', 'array'],
            'assignments.*.approval_level' => ['required', Rule::in(self::LEVELS)],
            'assignments.*.user_id' => ['required', 'integer', 'exists:users,id'],
        ]);
        $module = $validated['module'] ?? ApprovalAssignment::MODULE_THL;
        abort_unless($this->canAccessDepot($user, $validated['kode_depo']), 403);

        foreach ($validated['assignments'] as $assignment) {
            $approver = User::query()->whereKey($assignment['user_id'])->where('status', 'active')->firstOrFail();
            abort_unless(! $user->isDepotScoped() || $approver->kode_depo === $validated['kode_depo'], 422);

            ApprovalAssignment::updateOrCreate(
                ['module' => $module, 'kode_depo' => $validated['kode_depo'], 'approval_level' => $assignment['approval_level']],
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
