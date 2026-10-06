<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\OpnameExpiredSession;
use App\Models\OpnameExpiredSessionItem;
use App\Models\OpnameExpiredWave;
use App\Models\ReceivingItem;
use App\Services\OpnameExpiredService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Sesi opname lapangan (aturan A2): supervisor membuat sesi per minggu +
 * depo dan menugaskan petugas; petugas memverifikasi fisik per baris wave;
 * verifikasi menerbitkan Batch untuk baris ledger yang belum berlabel.
 */
class OpnameExpiredSessionController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = OpnameExpiredSession::with(['assignee', 'creator', 'items.wave', 'items.batch'])
            ->orderByDesc('week_start')
            ->orderByDesc('id');

        if ($request->user()->isDepotScoped()) {
            $query->where('kode_depo', $request->user()->kode_depo);
        }

        if ($request->week_start) {
            $query->where('week_start', $request->week_start);
        }

        if ($request->kode_depo && ! $request->user()->isDepotScoped()) {
            $query->where('kode_depo', $request->kode_depo);
        }

        if ($request->status) {
            $query->where('status', strtoupper(trim($request->status)));
        }

        if ($request->boolean('mine')) {
            $query->where('assigned_to', $request->user()->id);
        }

        $sessions = $query->paginate($this->perPage($request));

        return response()->json(['data' => $sessions]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'week_start' => 'nullable|date',
            'kode_depo' => 'required|string|max:20',
            'nama_depo' => 'nullable|string|max:100',
            'assigned_to' => 'required|exists:users,id',
            'wave_ids' => 'required|array|min:1|max:500',
            'wave_ids.*' => 'integer|exists:opname_expired_waves,id',
            'notes' => 'nullable|string',
        ]);

        $weekStart = isset($validated['week_start'])
            ? Carbon::parse($validated['week_start'])->startOfWeek(Carbon::MONDAY)
            : Carbon::today()->startOfWeek(Carbon::MONDAY);

        $user = $request->user();
        if ($user->isDepotScoped() && $validated['kode_depo'] !== $user->kode_depo) {
            abort(403, 'Anda hanya bisa membuat sesi untuk depo sendiri.');
        }

        $waves = OpnameExpiredWave::whereIn('id', $validated['wave_ids'])->get();
        if ($waves->isEmpty()) {
            abort(422, 'Wave tidak ditemukan.');
        }

        foreach ($waves as $wave) {
            abort_unless(
                Carbon::parse($wave->week_start)->toDateString() === $weekStart->toDateString()
                    && $wave->kode_depo === $validated['kode_depo']
                    && $user->canAccessDepotRow($wave->kode_depo, $wave->nama_depo),
                422,
                'Semua wave harus satu minggu dan satu depo dengan sesi.'
            );
        }

        $session = OpnameExpiredSession::create([
            'week_start' => $weekStart->toDateString(),
            'week_end' => $weekStart->copy()->endOfWeek(Carbon::SUNDAY)->toDateString(),
            'kode_depo' => $validated['kode_depo'],
            'nama_depo' => $validated['nama_depo'] ?? null,
            'assigned_to' => $validated['assigned_to'],
            'status' => OpnameExpiredSession::STATUS_OPEN,
            'notes' => $validated['notes'] ?? null,
            'created_by' => $user->id,
        ]);

        // Aturan: item sesi berbutir per batch (satu wave berisi N batch =
        // N verifikasi). Baris warisan tanpa label tetap dibuat dengan
        // batch null — labelnya terbit susulan saat verifikasi pertama.
        $service = app(OpnameExpiredService::class);
        $itemCount = 0;
        foreach ($waves as $wave) {
            $sources = $service->waveSourceItems($wave);

            if ($sources->isEmpty()) {
                OpnameExpiredSessionItem::firstOrCreate([
                    'session_id' => $session->id,
                    'wave_id' => $wave->id,
                    'batch_id' => null,
                ]);
                $itemCount++;

                continue;
            }

            foreach ($sources as $source) {
                $batch = $source->batch ?? $source->verifiedBatch;
                OpnameExpiredSessionItem::firstOrCreate([
                    'session_id' => $session->id,
                    'wave_id' => $wave->id,
                    'batch_id' => $batch?->id,
                ]);
                $itemCount++;
            }
        }

        return response()->json([
            'message' => "Sesi opname dibuat ({$itemCount} verifikasi).",
            'data' => $session->load(['assignee', 'items.wave', 'items.batch']),
        ], 201);
    }

    public function show(Request $request, OpnameExpiredSession $session): JsonResponse
    {
        $this->authorizeSession($request, $session);

        return response()->json(['data' => $session->load(['assignee', 'creator', 'items.wave', 'items.verifier'])]);
    }

    public function start(Request $request, OpnameExpiredSession $session): JsonResponse
    {
        $this->authorizeSession($request, $session);

        abort_unless($session->status === OpnameExpiredSession::STATUS_OPEN, 422, 'Sesi sudah dimulai atau selesai.');

        $session->update([
            'status' => OpnameExpiredSession::STATUS_IN_PROGRESS,
            'started_at' => now(),
        ]);

        return response()->json([
            'message' => 'Sesi dimulai.',
            'data' => $session->fresh()->load(['items.wave', 'items.batch']),
        ]);
    }

    public function verifyItem(Request $request, OpnameExpiredSession $session, OpnameExpiredSessionItem $item, OpnameExpiredService $service): JsonResponse
    {
        $this->authorizeSession($request, $session);

        abort_unless($item->session_id === $session->id, 404);
        abort_unless($session->isOpen(), 422, 'Sesi sudah selesai atau dibatalkan.');

        $validated = $request->validate([
            'qty_fisik_crt' => 'required|numeric|min:0',
            'qty_fisik_pcs' => 'nullable|numeric|min:0',
            'condition' => ['nullable', 'string', 'max:32', Rule::in(ReceivingItem::CONDITIONS)],
            'notes' => 'nullable|string',
            'photo' => 'nullable|image|max:10240',
        ]);

        if (($validated['condition'] ?? null) === 'FISIK_RUSAK' && empty($item->photo) && ! $request->hasFile('photo')) {
            throw ValidationException::withMessages([
                'photo' => ['Foto wajib disertakan untuk kondisi barang ini.'],
            ]);
        }

        $data = $validated;
        if ($request->hasFile('photo')) {
            if ($item->photo) {
                Storage::disk('public')->delete($item->photo);
            }
            $data['photo'] = $request->file('photo')->store('validation-photos', 'public');
        }

        $result = $service->verifySessionItem($item, $data, $request->user());

        return response()->json([
            'message' => "Baris terverifikasi ({$result['batches_issued']} label diterbitkan).",
            'data' => array_merge($result, ['item' => $item->fresh()->load('wave')]),
        ]);
    }

    public function complete(Request $request, OpnameExpiredSession $session): JsonResponse
    {
        $this->authorizeSession($request, $session);

        abort_unless($session->isOpen(), 422, 'Sesi sudah selesai atau dibatalkan.');

        $unverified = $session->items()->whereNull('verified_at')->count();
        abort_unless($unverified === 0, 422, "Masih ada {$unverified} baris belum diverifikasi.");

        $session->update([
            'status' => OpnameExpiredSession::STATUS_COMPLETED,
            'completed_at' => now(),
        ]);

        return response()->json([
            'message' => 'Sesi selesai.',
            'data' => $session->fresh()->load(['items.wave', 'items.batch']),
        ]);
    }

    public function cancel(Request $request, OpnameExpiredSession $session): JsonResponse
    {
        $this->authorizeSession($request, $session);

        abort_unless($session->isOpen(), 422, 'Sesi sudah selesai atau dibatalkan.');

        $validated = $request->validate(['notes' => 'nullable|string']);

        $session->update([
            'status' => OpnameExpiredSession::STATUS_CANCELLED,
            'notes' => $validated['notes'] ?? $session->notes,
            'completed_at' => now(),
        ]);

        return response()->json([
            'message' => 'Sesi dibatalkan.',
            'data' => $session->fresh(),
        ]);
    }

    private function authorizeSession(Request $request, OpnameExpiredSession $session): void
    {
        abort_unless(
            $request->user()->canAccessDepotRow($session->kode_depo, $session->nama_depo),
            403,
            'Anda tidak memiliki akses ke data ini.'
        );
    }
}
