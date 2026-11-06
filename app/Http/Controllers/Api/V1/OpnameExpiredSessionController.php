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
use App\Services\OpnameSessionLifecycleService;
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
 * depo dan menugaskan petugas; petugas menghitung fisik per batch dengan
 * disposisi tindak lanjut; sesi dikirim untuk persetujuan; approver
 * independen menyetujui — koreksi wave baru berlaku saat itu.
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
        [$session, $itemCount] = DB::transaction(function () use ($validated, $weekStart, $user, $waves): array {
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

        $session->load(['assignee', 'creator', 'submitter', 'decider', 'items.wave', 'items.batch', 'items.verifier']);

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

            // Data penerimaan untuk analisa petugas (yang juga penerima
            // barang): apakah selisih sudah terjadi sejak terima. Aksesor
            // tanggal_penerimaan berupa string (dengan fallback scan-time
            // untuk baris validasi SJ) — ambil 10 digit pertama.
            $tanggalTerima = $source?->tanggal_penerimaan;
            $tanggalTerima = is_string($tanggalTerima)
                ? substr($tanggalTerima, 0, 10)
                : $tanggalTerima?->toDateString();

            return array_merge($item->toArray(), [
                'expected_crt' => $source ? (float) $source->actual_qty : null,
                'expected_pcs' => $source && $source->qty_pcs !== null ? (float) $source->qty_pcs : null,
                'tanggal_penerimaan' => $tanggalTerima,
                'condition_terima' => $source?->condition,
                'selisih_terima' => $source
                    ? (float) $source->actual_qty - (float) $source->expected_qty
                    : null,
            ]);
        })->all();

        $data = $session->toArray();
        $data['items'] = $items;

        return response()->json(['data' => $data]);
    }

    public function start(Request $request, OpnameExpiredSession $session): JsonResponse
    {
        $this->authorizeSession($request, $session);
        $this->authorizeSessionWorker($session, $request->user(), ['Mulai sesi']);

        $session = DB::transaction(function () use ($session) {
            $locked = OpnameExpiredSession::whereKey($session->id)->lockForUpdate()->firstOrFail();
            abort_unless($locked->status === OpnameExpiredSession::STATUS_OPEN, 422, 'Sesi sudah dimulai.');

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
        $this->authorizeSessionWorker($session, $request->user(), ['Menghitung fisik']);

        abort_unless($item->session_id === $session->id, 404);
        // Alur baku: sesi harus dimulai dulu (Mulai Sesi) sebelum input
        // lapangan. OPEN = belum dikerjakan; penghitungan saat OPEN membikin
        // langkah "Mulai Sesi" jadi kosmetik dan status sesi tak akurat.
        abort_unless($session->acceptsCounting(), 422, 'Penghitungan hanya bisa saat sesi berjalan atau revisi — klik "Mulai Sesi" dulu.');

        $validated = $request->validate([
            'qty_fisik_crt' => 'required|numeric|min:0',
            'qty_fisik_pcs' => 'nullable|numeric|min:0',
            'condition' => ['nullable', 'string', 'max:32', Rule::in(ReceivingItem::CONDITIONS)],
            // Disposisi wajib untuk hasil hitung yang berisi barang (aturan
            // F.1). Khusus "tandai habis" (fisik 0) disposisi dilarang —
            // tidak ada barang untuk ditindaklanjuti; koreksi pengurangan
            // tetap menunggu validasi BLC di /approve.
            'disposition' => ['nullable', 'string', Rule::in(OpnameExpiredSessionItem::DISPOSITIONS())],
            'notes' => 'nullable|string',
            'photo' => 'nullable|image|max:10240',
            // Base praktik: scan dulu, input qty kemudian. Identifikasi
            // manual hanya fallback label rusak — wajib tercatat.
            'identified_via' => 'required|string|in:scan,manual',
        ]);

        $qtyCrt = (float) $validated['qty_fisik_crt'];
        $qtyPcs = isset($validated['qty_fisik_pcs']) ? (float) $validated['qty_fisik_pcs'] : 0.0;
        $isMarkedEmpty = $qtyCrt === 0.0 && $qtyPcs === 0.0;

        if ($isMarkedEmpty) {
            if (filled($validated['disposition'] ?? null)) {
                throw ValidationException::withMessages([
                    'disposition' => ['Disposisi tidak berlaku saat fisik 0 (tandai habis) — tidak ada barang untuk ditindaklanjuti.'],
                ]);
            }
            $validated['disposition'] = null;
        } elseif (empty($validated['disposition'])) {
            throw ValidationException::withMessages([
                'disposition' => ['Disposisi wajib dipilih untuk hasil hitung yang berisi barang (aturan F.1).'],
            ]);
        }

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

        // Sesi yang sedang REVISI kembali berjalan saat item pertama
        // diperbaiki: petugas berputar kembali melalui siklus yang sama.
        if ($session->status === OpnameExpiredSession::STATUS_REVISI) {
            $this->reopenAfterRevision($session, $request->user());
        }

        $result = $service->verifySessionItem($item, $data, $request->user());

        return response()->json([
            'message' => "Baris terhitung ({$result['batches_issued']} label diterbitkan).",
            'data' => array_merge($result, ['item' => $item->fresh()->load('wave')]),
        ]);
    }

    /**
     * Petugas mengirim sesi untuk persetujuan (semua baris wajib terhitung).
     * Koreksi wave berlaku di endpoint /approve — bukan di sini.
     */
    public function submit(Request $request, OpnameExpiredSession $session): JsonResponse
    {
        $this->authorizeSession($request, $session);
        $this->authorizeSessionWorker($session, $request->user(), ['Mengirim sesi']);

        app(OpnameSessionLifecycleService::class)->submit($session, $request->user());

        return response()->json([
            'message' => 'Sesi dikirim untuk persetujuan. Koreksi berlaku setelah disetujui.',
            'data' => $session->fresh()->load(['items.wave', 'items.batch']),
        ]);
    }

    public function approve(Request $request, OpnameExpiredSession $session): JsonResponse
    {
        $this->authorizeSession($request, $session);

        app(OpnameSessionLifecycleService::class)->approve($session, $request->user());

        return response()->json([
            'message' => 'Sesi disetujui — koreksi wave berlaku.',
            'data' => $session->fresh()->load(['items.wave', 'items.batch']),
        ]);
    }

    public function revise(Request $request, OpnameExpiredSession $session): JsonResponse
    {
        $this->authorizeSession($request, $session);

        $validated = $request->validate([
            'reason' => 'required|string|min:5',
        ]);

        app(OpnameSessionLifecycleService::class)->revise($session, $request->user(), $validated['reason']);

        return response()->json([
            'message' => 'Sesi dikembalikan ke petugas untuk revisi.',
            'data' => $session->fresh()->load(['items.wave', 'items.batch']),
        ]);
    }

    /**
     * Setelah revisi: item pertama yang diperbaiki mengembalikan sesi ke
     * run (IN_PROGRESS). Kolom keputusan revisi dicatat di decision_note —
     * riwayat lengkap ada di ApprovalHistory.
     */
    private function reopenAfterRevision(OpnameExpiredSession $session, User $actor): void
    {
        DB::transaction(function () use ($session, $actor): void {
            $locked = OpnameExpiredSession::whereKey($session->id)->lockForUpdate()->firstOrFail();
            abort_unless($locked->status === OpnameExpiredSession::STATUS_REVISI, 422, 'Sesi tidak sedang dalam tahap revisi.');
            abort_unless($locked->assigned_to === $actor->id, 403, 'Hanya petugas yang ditugaskan yang dapat merevisi.');

            $locked->update(['status' => OpnameExpiredSession::STATUS_IN_PROGRESS]);
        });
    }

    /**
     * Ganti petugas sesi (oleh pembuat sesi, saat sesi belum tuntas) — sesi
     * terjebak di petugas yang keluar/mutasi tidak lagi menggantung wave.
     */
    public function assign(Request $request, OpnameExpiredSession $session): JsonResponse
    {
        $this->authorizeSession($request, $session);

        $validated = $request->validate([
            'assigned_to' => 'required|exists:users,id',
        ]);

        abort_unless($session->created_by === $request->user()->id, 403, 'Hanya pembuat sesi yang dapat mengganti petugas.');
        abort_unless($session->isOpen(), 422, 'Sesi sudah selesai atau dibatalkan.');

        $newOfficer = User::findOrFail($validated['assigned_to']);
        abort_unless($newOfficer->kode_depo === $session->kode_depo, 422, 'Petugas pengganti harus dari depo yang sama dengan sesi.');
        abort_unless($newOfficer->status === 'active', 422, 'Petugas pengganti harus akun aktif.');

        DB::transaction(function () use ($session, $newOfficer): void {
            OpnameExpiredSession::whereKey($session->id)->lockForUpdate()->firstOrFail();
            $session->update(['assigned_to' => $newOfficer->id]);
        });

        return response()->json([
            'message' => 'Petugas sesi diperbarui.',
            'data' => $session->fresh()->load('assignee'),
        ]);
    }

    public function cancel(Request $request, OpnameExpiredSession $session): JsonResponse
    {
        $this->authorizeSession($request, $session);
        $this->authorizeSessionWorker($session, $request->user(), ['Membatalkan sesi'], allowCreated: true);

        $validated = $request->validate(['notes' => 'nullable|string']);

        $session = DB::transaction(function () use ($session, $validated) {
            $locked = OpnameExpiredSession::whereKey($session->id)->lockForUpdate()->firstOrFail();
            abort_unless($locked->isOpen(), 422, 'Sesi sudah selesai atau dibatalkan.');

            $locked->update([
                'status' => OpnameExpiredSession::STATUS_CANCELLED,
                'notes' => $validated['notes'] ?? $locked->notes,
                'completed_at' => now(),
            ]);

            $this->emailService->send(
                'opname_expired',
                'cancelled',
                $locked,
                new OpnameExpiredNotification('cancelled', substr((string) $locked->week_start, 0, 10), [[
                    'kode_depo' => $locked->kode_depo,
                    'nama_depo' => $locked->nama_depo,
                    'total' => 0,
                    'validated' => 0,
                    'submitted' => false,
                ]]),
                $locked->kode_depo
            );

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
        $this->authorizeSessionWorker($session, $request->user(), ['Menambah wave'], allowCreated: true);

        $validated = $request->validate([
            'wave_ids' => 'required|array|min:1|max:500|distinct',
            'wave_ids.*' => 'integer|exists:opname_expired_waves,id',
        ]);

        $user = $request->user();
        $waves = OpnameExpiredWave::whereIn('id', $validated['wave_ids'])->get();
        $added = 0;

        DB::transaction(function () use ($user, $session, $waves, $service, &$added): void {
            // Kunci sesi + cek ulang status di dalam transaksi: approval/
            // cancel bersamaan tidak boleh menyisipkan item ke sesi yang
            // sudah tutup.
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
     * Pastikan tidak ada wave yang sedang berjalan di sesi lain (belum
     * tutup definitif). Dipanggil dua kali: di luar transaksi sebagai
     * fail-fast dan di dalam transaksi setelah baris wave dikunci, supaya
     * dua request bersamaan tidak sama-sama lolos (TOCTOU) dan menugaskan
     * wave yang sama dua kali — verifikasi ganda = koreksi ganda.
     *
     * @param  Collection<int, OpnameExpiredWave>  $waves
     */
    private function assertWavesUnlocked(Collection $waves): void
    {
        foreach ($waves as $wave) {
            $lockedWave = OpnameExpiredSessionItem::where('wave_id', $wave->id)
                ->whereHas('session', fn ($q) => $q->whereIn('status', OpnameExpiredSession::OPEN_STATUSES))
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

    /**
     * Pemisahan tugas: aksi mengerjakan sesi (mulai, hitung, kirim,
     * batalkan, tambah wave) hanya boleh oleh petugas yang ditugaskan —
     * kecuali pembuat sesi untuk aksi administratif, bila diizinkan.
     *
     * @param  array<int, string>  $actions
     */
    private function authorizeSessionWorker(OpnameExpiredSession $session, User $user, array $actions, bool $allowCreated = false): void
    {
        if ($session->assigned_to === $user->id) {
            return;
        }

        if ($allowCreated && $session->created_by === $user->id) {
            return;
        }

        abort(403, implode('/', $actions).' hanya oleh petugas yang ditugaskan'.($allowCreated ? ' atau pembuat sesi.' : '.'));
    }
}
