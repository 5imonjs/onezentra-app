<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Mail\OpnameExpiredNotification;
use App\Models\OpnameExpiredSession;
use App\Models\OpnameExpiredSessionItem;
use App\Models\OpnameExpiredWave;
use App\Models\ReceivingItem;
use App\Models\User;
use App\Services\EmailNotificationService;
use App\Services\OpnameExpiredService;
use App\Support\EvidenceStorage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Sesi opname lapangan (aturan A2): supervisor membuat sesi per minggu +
 * depo dan menugaskan petugas; petugas memverifikasi fisik per baris wave;
 * verifikasi menerbitkan Batch untuk baris ledger yang belum berlabel.
 */
class OpnameExpiredSessionController extends Controller
{
    public function __construct(private EmailNotificationService $emailService) {}

    public function index(Request $request): JsonResponse
    {
        $query = OpnameExpiredSession::with(['assignee', 'creator', 'items.wave', 'items.batch'])
            ->orderByDesc('week_start')
            ->orderByDesc('id');

        if ($request->user()->isDepotScoped()) {
            $request->user()->applyDepotFilter($query, 'kode_depo');
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

    /**
     * Kandidat petugas untuk modal "Buat Sesi" — dipanggil per depo agar
     * supervisor tidak mengetik ID manual. Dibatasi ke akun aktif di depo
     * yang diminta dan dicek akses deponya; endpoint terpisah dari /users
     * (yang butuh users.view) supaya pemegang opname.create bisa menugaskan
     * tanpa diberi akses kelola user.
     */
    public function officers(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'kode_depo' => 'required|string|max:20',
        ]);

        abort_unless(
            $request->user()->canAccessDepotRow($validated['kode_depo']),
            403,
            'Anda tidak memiliki akses ke depo ini.'
        );

        $officers = User::query()
            ->where('kode_depo', $validated['kode_depo'])
            ->where('status', 'active')
            ->orderBy('full_name')
            ->get(['id', 'full_name', 'email', 'level']);

        return response()->json(['data' => $officers]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'week_start' => 'nullable|date',
            'kode_depo' => 'required|string|max:20',
            'nama_depo' => 'nullable|string|max:100',
            'assigned_to' => 'required|exists:users,id',
            'wave_ids' => 'required|array|min:1|max:500|distinct',
            'wave_ids.*' => 'integer|exists:opname_expired_waves,id',
            'notes' => 'nullable|string',
        ]);

        $weekStart = isset($validated['week_start'])
            ? Carbon::parse($validated['week_start'])->startOfWeek(Carbon::MONDAY)
            : Carbon::today()->startOfWeek(Carbon::MONDAY);

        $user = $request->user();
        if ($user->isDepotScoped() && ! in_array($validated['kode_depo'], $user->depot_codes, true)) {
            abort(403, 'Anda hanya bisa membuat sesi untuk depo dalam cakupan Anda.');
        }

        // Assignee wajib satu depo dengan sesi: sesi lintas-depo membuat
        // baris tak terlihat siapa pun (?mine= lolos, open 403).
        $assignee = User::findOrFail($validated['assigned_to']);
        abort_unless(
            $assignee->kode_depo === $validated['kode_depo'],
            422,
            'Petugas yang ditugaskan harus dari depo yang sama dengan sesi.'
        );

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

        // Kunci wave: yang sudah masuk sesi berjalan tidak boleh ditugaskan
        // lagi — verifikasi ganda = koreksi ganda. Di luar transaksi ini hanya
        // fail-fast; pengecekan final diulang di dalam transaksi setelah lock.
        $this->assertWavesUnlocked($waves);

        // Pembuatan sesi + ekspansi item atomik: double-submit tidak boleh
        // menggandakan sesi atas wave yang sama.
        $service = app(OpnameExpiredService::class);
        [$session, $itemCount] = DB::transaction(function () use ($validated, $weekStart, $user, $waves, $service): array {
            // Kunci baris wave lalu cek ulang di dalam transaksi: cek di luar
            // transaksi bisa dilewati dua request bersamaan sebelum salah satu
            // menulis item sesi.
            OpnameExpiredWave::whereIn('id', $waves->pluck('id'))->lockForUpdate()->get();
            $this->assertWavesUnlocked($waves);

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

            return [$session, $itemCount];
        });

        return response()->json([
            'message' => "Sesi opname dibuat ({$itemCount} verifikasi).",
            'data' => $session->load(['assignee', 'items.wave', 'items.batch']),
        ], 201);
    }

    public function show(Request $request, OpnameExpiredSession $session): JsonResponse
    {
        $this->authorizeSession($request, $session);

        $session->load(['assignee', 'creator', 'items.wave', 'items.batch', 'items.verifier']);

        // Qty acuan per batch (sistem) agar petugas tahu angka pembanding
        // tiap label: satu query per sumber, bukan N+1.
        $batches = $session->items->map->batch->filter()->unique('id')->values();
        $byReceiving = ReceivingItem::whereIn('id', $batches->pluck('receiving_item_id')->filter()->all())
            ->get()->keyBy('id');
        $bySj = ReceivingItem::whereIn('sj_validation_item_id', $batches->pluck('sj_validation_item_id')->filter()->all())
            ->get()->keyBy('sj_validation_item_id');

        $items = $session->items->map(function (OpnameExpiredSessionItem $item) use ($byReceiving, $bySj): array {
            $source = $item->batch
                ? ($item->batch->receiving_item_id
                    ? ($byReceiving[$item->batch->receiving_item_id] ?? null)
                    : ($bySj[$item->batch->sj_validation_item_id] ?? null))
                : null;

            return array_merge($item->toArray(), [
                'expected_crt' => $source ? (float) $source->actual_qty : null,
                'expected_pcs' => $source && $source->qty_pcs !== null ? (float) $source->qty_pcs : null,
            ]);
        })->all();

        $data = $session->toArray();
        $data['items'] = $items;

        return response()->json(['data' => $data]);
    }

    public function start(Request $request, OpnameExpiredSession $session): JsonResponse
    {
        $this->authorizeSession($request, $session);

        $session = DB::transaction(function () use ($session) {
            $locked = OpnameExpiredSession::whereKey($session->id)->lockForUpdate()->firstOrFail();
            abort_unless($locked->status === OpnameExpiredSession::STATUS_OPEN, 422, 'Sesi sudah dimulai atau selesai.');

            $locked->update([
                'status' => OpnameExpiredSession::STATUS_IN_PROGRESS,
                'started_at' => now(),
            ]);

            return $locked;
        });

        return response()->json([
            'message' => 'Sesi dimulai.',
            'data' => $session->fresh()->load(['items.wave', 'items.batch']),
        ]);
    }

    public function verifyItem(Request $request, OpnameExpiredSession $session, OpnameExpiredSessionItem $item, OpnameExpiredService $service): JsonResponse
    {
        $this->authorizeSession($request, $session);

        abort_unless($item->session_id === $session->id, 404);
        // Alur baku: sesi harus dimulai dulu (Mulai Sesi) sebelum input
        // lapangan. OPEN = belum dikerjakan; verifikasi saat OPEN membikin
        // langkah "Mulai Sesi" jadi kosmetik dan status sesi tak akurat
        // (bisa loncat OPEN → COMPLETED tanpa pernah IN_PROGRESS).
        abort_unless(
            $session->status === OpnameExpiredSession::STATUS_IN_PROGRESS,
            422,
            'Verifikasi hanya bisa saat sesi berjalan — klik "Mulai Sesi" dulu.'
        );

        $validated = $request->validate([
            'qty_fisik_crt' => 'required|numeric|min:0',
            'qty_fisik_pcs' => 'nullable|numeric|min:0',
            'condition' => ['nullable', 'string', 'max:32', Rule::in(ReceivingItem::CONDITIONS)],
            'notes' => 'nullable|string',
            'photo' => 'nullable|image|max:10240',
            // Base praktik: scan dulu, input qty kemudian. Identifikasi
            // manual hanya fallback label rusak — wajib tercatat.
            'identified_via' => 'required|string|in:scan,manual',
        ]);

        if (in_array($validated['condition'] ?? null, ReceivingItem::CONDITIONS_REQUIRING_PHOTO, true) && empty($item->photo) && ! $request->hasFile('photo')) {
            throw ValidationException::withMessages([
                'photo' => ['Foto wajib disertakan untuk kondisi barang ini.'],
            ]);
        }

        $data = $validated;
        if ($request->hasFile('photo')) {
            if ($item->photo) {
                EvidenceStorage::delete($item->photo);
            }
            $data['photo'] = EvidenceStorage::putFile($request->file('photo'), 'validation-photos');
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

        // Kunci dulu, cek kemudian: interleaving complete↔cancel/verify
        // terserialisasi; last-write-wins pasca-kunci tidak mungkin.
        $session = DB::transaction(function () use ($session) {
            $locked = OpnameExpiredSession::whereKey($session->id)->lockForUpdate()->firstOrFail();
            abort_unless($locked->isOpen(), 422, 'Sesi sudah selesai atau dibatalkan.');

            $unverified = $locked->items()->whereNull('verified_at')->count();
            abort_unless($unverified === 0, 422, "Masih ada {$unverified} baris belum diverifikasi.");

            $locked->update([
                'status' => OpnameExpiredSession::STATUS_COMPLETED,
                'completed_at' => now(),
            ]);

            return $locked;
        });

        $fresh = $session->fresh()->load(['items.wave', 'items.batch']);

        $this->emailService->send(
            'opname_expired',
            'completed',
            $fresh,
            new OpnameExpiredNotification('completed', substr((string) $fresh->week_start, 0, 10), [[
                'kode_depo' => $fresh->kode_depo,
                'nama_depo' => $fresh->nama_depo,
                'total' => $fresh->items->count(),
                'validated' => $fresh->items->count(),
                'submitted' => true,
            ]]),
            $fresh->kode_depo
        );

        return response()->json([
            'message' => 'Sesi selesai.',
            'data' => $fresh,
        ]);
    }

    public function cancel(Request $request, OpnameExpiredSession $session): JsonResponse
    {
        $this->authorizeSession($request, $session);

        $validated = $request->validate(['notes' => 'nullable|string']);

        $session = DB::transaction(function () use ($session, $validated) {
            $locked = OpnameExpiredSession::whereKey($session->id)->lockForUpdate()->firstOrFail();
            abort_unless($locked->isOpen(), 422, 'Sesi sudah selesai atau dibatalkan.');

            $locked->update([
                'status' => OpnameExpiredSession::STATUS_CANCELLED,
                'notes' => $validated['notes'] ?? $locked->notes,
                'completed_at' => now(),
            ]);

            return $locked;
        });

        return response()->json([
            'message' => 'Sesi dibatalkan.',
            'data' => $session->fresh(),
        ]);
    }

    /**
     * Tambah wave susulan ke sesi berjalan (wave minggu+depo sama yang
     * belum masuk sesi berjalan mana pun). Diekspansi ke batch seperti store.
     */
    public function addWaves(Request $request, OpnameExpiredSession $session, OpnameExpiredService $service): JsonResponse
    {
        $this->authorizeSession($request, $session);

        abort_unless($session->isOpen(), 422, 'Sesi sudah selesai atau dibatalkan.');

        $validated = $request->validate([
            'wave_ids' => 'required|array|min:1|max:500|distinct',
            'wave_ids.*' => 'integer|exists:opname_expired_waves,id',
        ]);

        $user = $request->user();
        $waves = OpnameExpiredWave::whereIn('id', $validated['wave_ids'])->get();
        $added = 0;

        DB::transaction(function () use ($user, $session, $waves, $service, &$added): void {
            // Kunci sesi + cek ulang status di dalam transaksi: complete/cancel
            // bersamaan tidak boleh menyisipkan item ke sesi yang sudah tutup.
            $lockedSession = OpnameExpiredSession::whereKey($session->id)->lockForUpdate()->firstOrFail();
            abort_unless($lockedSession->isOpen(), 422, 'Sesi sudah selesai atau dibatalkan.');

            // Kunci baris wave lalu cek ulang: dua penambahan bersamaan atas
            // wave yang sama terserialisasi sehingga cek "sedang berjalan"
            // tidak bisa dilewati.
            OpnameExpiredWave::whereIn('id', $waves->pluck('id'))->lockForUpdate()->get();
            $this->assertWavesUnlocked($waves);

            foreach ($waves as $wave) {
                abort_unless(
                    Carbon::parse($wave->week_start)->toDateString() === Carbon::parse($session->week_start)->toDateString()
                        && $wave->kode_depo === $session->kode_depo
                        && $user->canAccessDepotRow($wave->kode_depo, $wave->nama_depo),
                    422,
                    "Wave {$wave->kode_barang} tidak satu minggu/depo dengan sesi."
                );

                $sources = $service->waveSourceItems($wave);

                if ($sources->isEmpty()) {
                    OpnameExpiredSessionItem::firstOrCreate([
                        'session_id' => $session->id,
                        'wave_id' => $wave->id,
                        'batch_id' => null,
                    ]);
                    $added++;

                    continue;
                }

                foreach ($sources as $source) {
                    $batch = $source->batch ?? $source->verifiedBatch;
                    OpnameExpiredSessionItem::firstOrCreate([
                        'session_id' => $session->id,
                        'wave_id' => $wave->id,
                        'batch_id' => $batch?->id,
                    ]);
                    $added++;
                }
            }
        });

        return response()->json([
            'message' => "Ditambahkan {$added} verifikasi ke sesi.",
            'data' => $session->fresh()->load(['items.wave', 'items.batch']),
        ]);
    }

    /**
     * Pastikan tidak ada wave yang sedang berjalan di sesi lain (OPEN /
     * IN_PROGRESS). Dipanggil dua kali: di luar transaksi sebagai fail-fast dan
     * di dalam transaksi setelah baris wave dikunci, supaya dua request
     * bersamaan tidak sama-sama lolos (TOCTOU) dan menugaskan wave yang sama
     * dua kali — verifikasi ganda = koreksi ganda.
     *
     * @param  Collection<int, OpnameExpiredWave>  $waves
     */
    private function assertWavesUnlocked(Collection $waves): void
    {
        foreach ($waves as $wave) {
            $lockedWave = OpnameExpiredSessionItem::where('wave_id', $wave->id)
                ->whereHas('session', fn ($q) => $q->whereIn('status', [
                    OpnameExpiredSession::STATUS_OPEN,
                    OpnameExpiredSession::STATUS_IN_PROGRESS,
                ]))
                ->exists();

            abort_if($lockedWave, 422, "Wave {$wave->kode_barang} sedang berjalan di sesi lain.");
        }
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
