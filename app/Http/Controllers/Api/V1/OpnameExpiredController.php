<?php

namespace App\Http\Controllers\Api\V1;

use App\Exports\OpnameExpiredExport;
use App\Http\Controllers\Controller;
use App\Models\OpnameExpiredWave;
use App\Models\OpnameSetting;
use App\Services\ExportGuard;
use App\Services\OpnameExpiredService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Maatwebsite\Excel\Facades\Excel;

class OpnameExpiredController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = OpnameExpiredWave::with('validator')->orderByDesc('week_start');

        if ($request->user()->isDepotScoped()) {
            $query->where('kode_depo', $request->user()->kode_depo);
        }

        if ($request->week_start) {
            $query->where('week_start', $request->week_start);
        } else {
            $latest = $query->clone()->value('week_start');
            if ($latest) {
                $query->where('week_start', $latest);
            }
        }

        $statuses = collect(explode(',', (string) $request->statuses))
            ->filter()
            ->map(fn ($s) => strtoupper(trim($s)))
            ->values()
            ->all();

        if ($request->status) {
            $query->where('status_ini', strtoupper(trim($request->status)));
        } elseif ($statuses) {
            $query->whereIn('status_ini', $statuses);
        }

        if ($request->kode_depo && ! $request->user()->isDepotScoped()) {
            $query->where('kode_depo', $request->kode_depo);
        }

        if ($request->search) {
            $query->where(function ($q) use ($request) {
                $like = "%{$request->search}%";
                $q->where('kode_barang', 'like', $like)
                    ->orWhere('nama_barang', 'like', $like)
                    ->orWhere('sumber_material', 'like', $like);
            });
        }

        $perPage = $this->perPage($request);
        $waves = $query->paginate($perPage);

        $weeks = OpnameExpiredWave::query()
            ->when($request->user()->isDepotScoped(), fn ($q) => $q->where('kode_depo', $request->user()->kode_depo))
            ->select('week_start')
            ->distinct()
            ->orderByDesc('week_start')
            ->pluck('week_start');

        $weekStart = $request->week_start ?? $weeks->first();

        $statusSummary = $weekStart ? $this->statusSummary($weekStart, $request) : $this->emptySummary();
        $prevWeekStart = $weekStart ? Carbon::parse($weekStart)->subWeek()->toDateString() : null;
        $prevStatusSummary = $prevWeekStart ? $this->statusSummary($prevWeekStart, $request) : $this->emptySummary();
        $depotSummary = $weekStart ? $this->depotSummary($weekStart, $request) : [];

        return response()->json([
            'data' => $waves,
            'meta' => [
                'weeks' => $weeks,
                'thresholds' => $this->thresholds(),
                'status_summary' => $statusSummary,
                'prev_week_start' => $prevWeekStart,
                'prev_status_summary' => $prevStatusSummary,
                'depot_summary' => $depotSummary,
            ],
        ]);
    }

    public function generate(Request $request, OpnameExpiredService $service): JsonResponse
    {
        $request->validate([
            'week_start' => 'nullable|date',
        ]);

        $weekStart = $request->week_start ? Carbon::parse($request->week_start) : Carbon::today();

        $result = $service->generate($weekStart, $request->user());

        return response()->json([
            'message' => 'Opname expired berhasil dibuat/diperbarui.',
            'data' => $result,
        ]);
    }

    public function show(Request $request, OpnameExpiredWave $wave): JsonResponse
    {
        abort_unless(
            $request->user()->canAccessDepotRow($wave->kode_depo, $wave->nama_depo),
            403,
            'Anda tidak memiliki akses ke data ini.'
        );

        return response()->json(['data' => $wave->load('validator')]);
    }

    public function update(Request $request, OpnameExpiredWave $wave): JsonResponse
    {
        abort_unless(
            $request->user()->canAccessDepotRow($wave->kode_depo, $wave->nama_depo),
            403,
            'Anda tidak memiliki akses ke data ini.'
        );

        $validated = $request->validate([
            'qty_koreksi_crt' => 'nullable|numeric|between:-999999,999999',
            'qty_koreksi_pcs' => 'nullable|numeric|between:-9999999,9999999',
        ]);

        $updates = [];

        if (array_key_exists('qty_koreksi_crt', $validated)) {
            $updates['qty_koreksi_crt'] = $validated['qty_koreksi_crt'];
        }

        if (array_key_exists('qty_koreksi_pcs', $validated)) {
            $updates['qty_koreksi_pcs'] = $validated['qty_koreksi_pcs'];
        }

        if ($updates) {
            $updates['koreksi_by'] = $request->user()->id;
            $updates['koreksi_at'] = now();
            $wave->update($updates);
        }

        return response()->json([
            'message' => 'Batch opname diperbarui.',
            'data' => $wave->fresh()->load('validator'),
        ]);
    }

    public function settings(): JsonResponse
    {
        return response()->json(['data' => $this->thresholds()]);
    }

    public function updateSettings(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'threshold_aman' => 'required|integer|min:1',
            'threshold_perhatian' => 'required|integer|min:1|lte:threshold_aman',
            'threshold_kritis' => 'required|integer|min:1|lte:threshold_perhatian',
        ]);

        foreach ($validated as $key => $value) {
            OpnameSetting::set($key, (int) $value);
        }

        return response()->json([
            'message' => 'Threshold opname diperbarui.',
            'data' => $this->thresholds(),
        ]);
    }

    public function export(Request $request)
    {
        $query = OpnameExpiredWave::query()->orderBy('kode_depo')->orderBy('kode_barang');

        if ($request->user()->isDepotScoped()) {
            $query->where('kode_depo', $request->user()->kode_depo);
        }

        if ($request->kode_depo && ! $request->user()->isDepotScoped()) {
            $query->where('kode_depo', $request->kode_depo);
        }

        if ($request->week_start) {
            $query->where('week_start', $request->week_start);
        } else {
            $latest = $query->clone()->value('week_start');
            if ($latest) {
                $query->where('week_start', $latest);
            }
        }

        if ($request->status) {
            $query->where('status_ini', $request->status);
        } elseif ($request->statuses) {
            $query->whereIn('status_ini', collect(explode(',', $request->statuses))->map(fn ($s) => strtoupper(trim($s)))->filter()->values()->all());
        }

        $filename = 'opname_expired_'.($request->week_start ?? Carbon::today()->toDateString()).'.xlsx';
        ExportGuard::ensureWithinLimit($query);

        return Excel::download(new OpnameExpiredExport($query), $filename);
    }

    private function thresholds(): array
    {
        return [
            'threshold_aman' => OpnameSetting::get('threshold_aman', 90),
            'threshold_perhatian' => OpnameSetting::get('threshold_perhatian', 30),
            'threshold_kritis' => OpnameSetting::get('threshold_kritis', 7),
        ];
    }

    private function emptySummary(): array
    {
        return array_fill_keys(['AMAN', 'PERHATIAN', 'KRITIS', 'EXPIRED'], ['count' => 0, 'qty_crt' => 0]);
    }

    private function statusSummary(string $weekStart, Request $request): array
    {
        $query = OpnameExpiredWave::query()->where('week_start', $weekStart);

        if ($request->user()->isDepotScoped()) {
            $query->where('kode_depo', $request->user()->kode_depo);
        }

        if ($request->search) {
            $like = "%{$request->search}%";
            $query->where(function ($q) use ($like) {
                $q->where('kode_barang', 'like', $like)
                    ->orWhere('nama_barang', 'like', $like)
                    ->orWhere('sumber_material', 'like', $like);
            });
        }

        $summary = $this->emptySummary();

        $query->selectRaw('status_ini, count(*) as c, sum(qty_ini_crt) as qty')
            ->groupBy('status_ini')
            ->get()
            ->each(function ($row) use (&$summary) {
                $summary[$row->status_ini] = [
                    'count' => (int) $row->c,
                    'qty_crt' => (float) ($row->qty ?? 0),
                ];
            });

        return $summary;
    }

    private function depotSummary(string $weekStart, Request $request): array
    {
        $query = OpnameExpiredWave::query()->where('week_start', $weekStart);

        if ($request->user()->isDepotScoped()) {
            $query->where('kode_depo', $request->user()->kode_depo);
        }

        if ($request->kode_depo && ! $request->user()->isDepotScoped()) {
            $query->where('kode_depo', $request->kode_depo);
        }

        if ($request->search) {
            $like = "%{$request->search}%";
            $query->where(function ($q) use ($like) {
                $q->where('kode_barang', 'like', $like)
                    ->orWhere('nama_barang', 'like', $like)
                    ->orWhere('sumber_material', 'like', $like);
            });
        }

        return $query->selectRaw('kode_depo, nama_depo, status_ini, count(*) as c, sum(qty_ini_crt) as qty')
            ->groupBy('kode_depo', 'nama_depo', 'status_ini')
            ->orderBy('kode_depo')
            ->get()
            ->map(fn ($row) => [
                'kode_depo' => $row->kode_depo,
                'nama_depo' => $row->nama_depo ?: $row->kode_depo,
                'status' => $row->status_ini,
                'count' => (int) $row->c,
                'qty_crt' => (float) ($row->qty ?? 0),
            ])
            ->all();
    }

    public function destroy(OpnameExpiredWave $wave): JsonResponse
    {
        $wave->delete();

        return response()->json(['message' => 'Wave deleted']);
    }
}
