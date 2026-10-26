<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\ApprovalAssignment;
use App\Models\DepotSetting;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Validation\Rule;

class ApprovalAssignmentController extends Controller
{
    private const LEVELS = ['BLC', 'BAC', 'RLH', 'RFAH'];

    public function index(Request $request): JsonResponse
    {
        // `input()` (bukan `query()`) agar respons `upsert()` — yang memanggil
        // index dengan `kode_depo` di body JSON — mencerminkan depo yang baru
        // disimpan, bukan depo default user (yang bisa 'ADMIN').
        $defaultDepo = $request->user()->depot_codes[0] ?? $request->user()->kode_depo;
        $kodeDepo = $request->input('kode_depo', $defaultDepo);
        abort_unless($this->canAccessDepot($request->user(), $kodeDepo), 403);
        $module = $request->input('module') === ApprovalAssignment::MODULE_RETRIBUSI
            ? ApprovalAssignment::MODULE_RETRIBUSI
            : ApprovalAssignment::MODULE_THL;

        // GET tidak digate permission karena nama approver dibutuhkan preview
        // PDF semua role. Email bukan kebutuhan preview: sembunyikan dari
        // pemegang izin baca dasar agar daftar akun tidak bocor ke seluruh
        // user terautentikasi.
        $canSeeEmail = $request->user()->hasPermission('approval.manage')
            || $request->user()->hasPermission('users.view');
        $userColumns = ['id', 'full_name', 'level', 'kode_depo', 'nama_depo', 'status'];
        if ($canSeeEmail) {
            $userColumns[] = 'email';
        }

        $assignments = ApprovalAssignment::query()
            ->where('module', $module)
            ->with('user:'.implode(',', $userColumns))
            // `ADMIN` hanya fallback untuk approver final (RLH/RFAH), selaras
            // dengan ensureApprover()/approverName(). Menampilkan ADMIN untuk
            // BLC/BAC membuat penetapan yang tak berpengaruh terlihat berlaku.
            ->where(function ($query) use ($kodeDepo): void {
                $query->where('kode_depo', $kodeDepo)
                    ->orWhere(function ($query): void {
                        $query->where('kode_depo', 'ADMIN')
                            ->whereIn('approval_level', ['RLH', 'RFAH']);
                    });
            })
            ->where('is_active', true)
            ->orderByRaw('CASE WHEN kode_depo = ? THEN 1 ELSE 0 END', [$kodeDepo])
            ->get()
            ->keyBy('approval_level');

        return response()->json([
            'data' => $assignments,
            'depots' => $this->depotOptions($request->user()),
            'users' => User::query()
                ->where('status', 'active')
                ->when($request->user()->isDepotScoped(), fn ($query) => $query->where('kode_depo', $kodeDepo))
                ->orderBy('full_name')
                ->get($userColumns),
            'levels' => self::LEVELS,
        ]);
    }

    /**
     * Daftar depo nyata untuk dropdown selector. Sumber primernya
     * `depot_settings` (bukan `users.kode_depo`, yang memuat akun peran seperti
     * ADMIN/BLC-01/BAC-01). Bila tabel setting belum terisi (DB lama), fallback
     * ke kode_depo user yang benar-benar punya BLC & BAC aktif — akun peran
     * dikecualikan agar default tidak jatuh ke 'ADMIN'.
     *
     * @return Collection<int, mixed>
     */
    private function depotOptions(User $user): Collection
    {
        $query = DepotSetting::query()
            ->where('is_active', true)
            ->orderBy('kode_depo');

        if ($user->isDepotScoped()) {
            $user->applyDepotFilter($query, 'kode_depo');
        }

        $depots = $query->get(['kode_depo', 'nama_depo']);

        if ($depots->isNotEmpty()) {
            return $depots->values();
        }

        if ($user->isDepotScoped()) {
            return collect($user->depot_codes)->map(fn (string $kode) => [
                'kode_depo' => $kode,
                'nama_depo' => DepotSetting::where('kode_depo', $kode)->value('nama_depo') ?? $kode,
            ])->values();
        }

        return User::query()
            ->whereNotNull('kode_depo')
            ->whereNotIn('kode_depo', ['', 'ADMIN'])
            ->select(['kode_depo', 'nama_depo'])
            ->orderBy('kode_depo')
            ->get()
            ->unique('kode_depo')
            ->filter(fn (User $depot): bool => User::query()
                ->where('kode_depo', $depot->kode_depo)
                ->where('status', 'active')
                ->whereIn('level', ['blc', 'bac'])
                ->distinct()
                ->count('level') === 2)
            ->values();
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
        return ! $user->isDepotScoped() || in_array($kodeDepo, $user->depot_codes, true);
    }
}
