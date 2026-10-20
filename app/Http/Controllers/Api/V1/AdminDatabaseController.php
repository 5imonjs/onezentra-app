<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\BiayaRetribusi;
use App\Models\BiayaThl;
use App\Models\DepotSetting;
use App\Models\StandarisasiTumpukan;
use App\Models\User;
use App\Services\LegacyDepotBackfillService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Kosongkan data operasional satu depo — HANYA level admin_master.
 *
 * Berbeda dengan hapus per-dokumen di controller masing-masing (yang dibatasi
 * status), endpoint ini untuk kebutuhan reset operasional: mengosongkan
 * seluruh isi modul terpilih untuk SATU depo dalam satu transaksi. Depo wajib
 * dipilih; tidak ada mode "hapus semua depo" agar reset tidak pernah menyentuh
 * data depo lain.
 *
 * Pengaman berlapis:
 * - gate level admin_master di kedua aksi (403 untuk level lain);
 * - daftar modul fixed allowlist — tidak bisa hapus tabel arbitrer;
 * - `kode_depo` wajib dan harus depo aktif (validasi terhadap depot_settings);
 * - konfirmasi teks eksak `HAPUS` wajib dikirim;
 * - dry-run (`?dry_run=1`) hanya menghitung tanpa menghapus;
 * - transaksi DB tunggal: gagal di tengah = rollback penuh.
 *
 * Urutan hapus anak-dulu (batch → validasi → gate → receiving → rencana →
 * penerimaan → opname → biaya) agar FK restrict tidak meledak di tengah.
 * Baris biaya retribusi yang mengklaim receiving TIDAK ikut dihapus (FK-nya
 * di-set null otomatis); jumlahnya dilaporkan agar master sadar. File storage
 * baru dihapus setelah commit dan hanya bila tidak lagi direferensikan baris
 * lain (foto validasi dipakai ulang oleh receiving_items).
 */
class AdminDatabaseController extends Controller
{
    private const MODULES = [
        'rencana_kirim',
        'gate',
        'validasi-sj',
        'receiving',
        'penerimaan',
        'opname-session',
        'opname-wave',
        'standarisasi',
        'biaya-thl',
        'biaya-retribusi',
    ];

    private function ensureMaster(Request $request): void
    {
        abort_unless(
            $request->user()?->level === 'admin_master',
            403,
            'Hanya akun level admin master yang boleh mengosongkan data.'
        );
    }

    public function summary(Request $request): JsonResponse
    {
        $this->ensureMaster($request);

        $depots = $this->depotOptions($request->user());
        $validated = $request->validate([
            'kode_depo' => ['nullable', 'string', 'max:50', Rule::in($depots->pluck('kode_depo')->all())],
        ], [
            'kode_depo.in' => 'Depo tidak dikenal atau tidak aktif.',
        ]);

        $kodeDepo = $this->resolveDepot($request->user(), $depots, $validated['kode_depo'] ?? null);

        return response()->json([
            'data' => $kodeDepo === null ? [] : $this->countModules($kodeDepo),
            'depots' => $depots,
            'kode_depo' => $kodeDepo,
        ]);
    }

    public function purge(Request $request): JsonResponse
    {
        $this->ensureMaster($request);

        $depots = $this->depotOptions($request->user());
        $validated = $request->validate([
            'kode_depo' => ['required', 'string', 'max:50', Rule::in($depots->pluck('kode_depo')->all())],
            'modules' => ['required', 'array', 'min:1'],
            'modules.*' => ['string', Rule::in(self::MODULES)],
            'confirm' => ['required', 'string', 'in:HAPUS'],
            'dry_run' => ['nullable', 'boolean'],
        ], [
            'kode_depo.in' => 'Depo tidak dikenal atau tidak aktif.',
        ]);

        $kodeDepo = $validated['kode_depo'];
        $modules = array_values(array_unique($validated['modules']));
        $scope = $this->scope($kodeDepo);
        $counts = $this->countModules($kodeDepo, $modules, $scope);

        if ($request->boolean('dry_run')) {
            return response()->json([
                'message' => 'Dry-run: tidak ada yang dihapus.',
                'data' => ['kode_depo' => $kodeDepo, 'modules' => $modules, 'counts' => $counts],
            ]);
        }

        /** @var array<int, string> $filePaths */
        $filePaths = $this->filePaths($modules, $scope);

        $deleted = [];
        DB::transaction(function () use ($modules, $kodeDepo, $scope, &$deleted): void {
            $clearRencana = in_array('rencana_kirim', $modules, true);
            $clearValidation = $clearRencana || in_array('validasi-sj', $modules, true);
            $clearGate = $clearRencana || in_array('gate', $modules, true);
            $clearReceiving = $clearRencana || in_array('receiving', $modules, true);

            // 1. Batches milik depo (validasi/receiving yang ikut terhapus).
            if ($clearValidation || $clearReceiving) {
                $deleted['batches'] = $this->deleteIds('batches', $scope['batch_ids']);
            }
            // 2. Validasi SJ (+items). Bila rencana_kirim ikut dipilih,
            // baris-baris ini ikut terhapus via cascade rencana — dihapus
            // eksplisit di sini agar angka laporan akurat.
            if ($clearValidation) {
                $deleted['sj_validation_items'] = $this->deleteIds('sj_validation_items', $scope['validation_item_ids']);
                $deleted['sj_validations'] = $this->deleteIds('sj_validations', $scope['validation_ids']);
            }
            // 3. Gate transactions (receivings.gate_transaction_id di-set null).
            if ($clearGate) {
                $deleted['gate_transactions'] = $this->deleteWhereIn('gate_transactions', 'rencana_kirim_id', $scope['rencana_ids']);
            }
            // 4. Receiving (+items). Batch sudah dihapus di langkah 1.
            if ($clearReceiving) {
                $deleted['receiving_items'] = $this->deleteIds('receiving_items', $scope['receiving_item_ids']);
                $deleted['receivings'] = $this->deleteIds('receivings', $scope['receiving_ids']);
            }
            // 5. Rencana kirim (+items).
            if ($clearRencana) {
                $deleted['rencana_kirim_items'] = $this->deleteWhereIn('rencana_kirim_items', 'rencana_kirim_id', $scope['rencana_ids']);
                $deleted['rencana_kirim'] = $this->deleteIds('rencana_kirim', $scope['rencana_ids']);
            }
            // 6. Penerimaan (tabel legacy, tetap dibersihkan bila dipilih).
            if (in_array('penerimaan', $modules, true)) {
                $deleted['penerimaan'] = DB::table('penerimaan')->where('kode_depo', $kodeDepo)->delete();
            }
            // 7. Sesi opname (+items).
            if (in_array('opname-session', $modules, true)) {
                $deleted['opname_expired_session_items'] = $this->deleteIds('opname_expired_session_items', $scope['session_item_ids']);
                $deleted['opname_expired_sessions'] = $this->deleteIds('opname_expired_sessions', $scope['session_ids']);
            }
            // 8. Wave Batch Expired (+item sesi yang menunjuk wave tersebut).
            // Sesi induknya tetap ada agar operator bisa melihat sesi kosong.
            if (in_array('opname-wave', $modules, true)) {
                $deleted['opname_expired_wave_session_items'] = $this->deleteIds('opname_expired_session_items', $scope['wave_session_item_ids']);
                $deleted['opname_expired_waves'] = $this->deleteIds('opname_expired_waves', $scope['wave_ids']);
            }
            // 9. Standarisasi tumpukan (+ riwayat approval bila ada).
            if (in_array('standarisasi', $modules, true)) {
                $deleted['standarisasi_tumpukan'] = $this->deleteIds('standarisasi_tumpukan', $scope['standarisasi_ids']);
                $this->deleteApprovalHistories(StandarisasiTumpukan::class, $scope['standarisasi_ids'], $deleted);
            }
            // 10. Biaya THL (+detail, kendaraan, foto via cascade).
            if (in_array('biaya-thl', $modules, true)) {
                $deleted['biaya_thls'] = $this->deleteIds('biaya_thls', $scope['thl_ids']);
                $this->deleteApprovalHistories(BiayaThl::class, $scope['thl_ids'], $deleted);
            }
            // 11. Biaya Retribusi (+detail/dokumen; THL turunan ikut cascade).
            if (in_array('biaya-retribusi', $modules, true)) {
                $deleted['biaya_retribusi_details'] = count($scope['retribusi_detail_ids']);
                $deleted['biaya_retribusi_documents'] = $this->countWhereIn('biaya_retribusi_documents', 'biaya_retribusi_id', $scope['retribusi_ids']);
                $deleted['biaya_thl_terdampak'] = count($scope['retribusi_linked_thl_ids']);
                $deleted['biaya_retribusis'] = $this->deleteIds('biaya_retribusis', $scope['retribusi_ids']);
                $this->deleteApprovalHistories(BiayaRetribusi::class, $scope['retribusi_ids'], $deleted);
                $this->deleteApprovalHistories(BiayaThl::class, $scope['retribusi_linked_thl_ids'], $deleted);
            }
        });

        // File hanya dihapus setelah commit, dan hanya path yang tidak lagi
        // dipakai baris lain (foto validasi disalin ke receiving_items).
        $deleted['files'] = $this->deleteUnreferencedFiles($filePaths);

        return response()->json([
            'message' => "Data modul terpilih untuk depo {$kodeDepo} berhasil dikosongkan.",
            'data' => [
                'kode_depo' => $kodeDepo,
                'modules' => $modules,
                'deleted' => $deleted,
                'before' => $counts,
            ],
        ]);
    }

    /**
     * Isi `kode_depo` baris legacy yang masih kosong agar ikut tercakup reset
     * per depo. Default aman: tanpa `dry_run` eksplisit, aksi hanya pratinjau.
     * Eksekusi wajib konfirmasi teks `BACKFILL`.
     */
    public function backfillDepot(Request $request, LegacyDepotBackfillService $service): JsonResponse
    {
        $this->ensureMaster($request);

        $validated = $request->validate([
            'dry_run' => ['nullable', 'boolean'],
            'confirm' => ['nullable', 'string'],
        ]);

        $dryRun = $request->boolean('dry_run', true);

        if (! $dryRun && ($validated['confirm'] ?? null) !== 'BACKFILL') {
            throw ValidationException::withMessages([
                'confirm' => 'Ketik BACKFILL untuk menjalankan backfill.',
            ]);
        }

        $result = $service->run($dryRun);

        return response()->json([
            'message' => $dryRun
                ? 'Pratinjau backfill: tidak ada data yang diubah.'
                : 'Backfill kode depo selesai.',
            'data' => $result,
        ]);
    }

    /**
     * Hitung isi tiap modul untuk depo terpilih (untuk tampilan konfirmasi).
     *
     * @param  array<int, string>|null  $modules
     * @param  array<string, array<int, int>>|null  $scope
     * @return array<string, int>
     */
    private function countModules(string $kodeDepo, ?array $modules = null, ?array $scope = null): array
    {
        $modules ??= self::MODULES;
        $scope ??= $this->scope($kodeDepo);

        $counts = [];
        foreach ($modules as $module) {
            $counts[$module] = match ($module) {
                'rencana_kirim' => count($scope['rencana_ids']),
                'gate' => $this->countWhereIn('gate_transactions', 'rencana_kirim_id', $scope['rencana_ids']),
                'validasi-sj' => count($scope['validation_ids']),
                'receiving' => count($scope['receiving_ids']),
                'penerimaan' => DB::table('penerimaan')->where('kode_depo', $kodeDepo)->count(),
                'opname-session' => count($scope['session_ids']),
                'opname-wave' => count($scope['wave_ids']),
                'standarisasi' => count($scope['standarisasi_ids']),
                'biaya-thl' => count($scope['thl_ids']),
                'biaya-retribusi' => count($scope['retribusi_ids']),
            };
        }
        // Baris biaya yang referensinya ikut longgar (di-set null, tak dihapus).
        if (array_intersect($modules, ['receiving', 'rencana_kirim'])) {
            $counts['klaim_biaya_terdampak'] = $this->countWhereIn('biaya_retribusi_details', 'receiving_id', $scope['receiving_ids']);
        }

        return $counts;
    }

    /**
     * Daftar depo nyata untuk dropdown. Sumber primernya `depot_settings`
     * (bukan `users.kode_depo`, yang memuat akun peran seperti ADMIN/BLC-01).
     *
     * @return Collection<int, array{kode_depo: string, nama_depo: string|null}>
     */
    private function depotOptions(User $user): Collection
    {
        $query = DepotSetting::query()
            ->where('is_active', true)
            ->orderBy('kode_depo');

        if ($user->isDepotScoped()) {
            $query->where('kode_depo', $user->kode_depo);
        }

        $depots = $query->get(['kode_depo', 'nama_depo']);

        if ($depots->isNotEmpty()) {
            return $depots
                ->map(fn (DepotSetting $depot): array => [
                    'kode_depo' => $depot->kode_depo,
                    'nama_depo' => $depot->nama_depo,
                ])
                ->values();
        }

        if ($user->isDepotScoped()) {
            return collect([[
                'kode_depo' => $user->kode_depo,
                'nama_depo' => $user->nama_depo,
            ]]);
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
            ->map(fn (User $depot): array => [
                'kode_depo' => $depot->kode_depo,
                'nama_depo' => $depot->nama_depo,
            ])
            ->values();
    }

    /**
     * @param  Collection<int, array{kode_depo: string, nama_depo: string|null}>  $depots
     */
    private function resolveDepot(User $user, Collection $depots, ?string $requested): ?string
    {
        if ($requested !== null && $requested !== '') {
            return $depots->contains('kode_depo', $requested) ? $requested : null;
        }

        if ($user->kode_depo !== null && $depots->contains('kode_depo', $user->kode_depo)) {
            return $user->kode_depo;
        }

        $first = $depots->first();

        return is_array($first) ? $first['kode_depo'] : null;
    }

    /**
     * Kumpulkan seluruh ID yang termasuk depo terpilih, sekali jalan, agar
     * hitung, hapus, dan pembersihan file memakai cakupan yang sama.
     *
     * @return array<string, array<int, int>>
     */
    private function scope(string $kodeDepo): array
    {
        $rencanaIds = $this->idsWhere('rencana_kirim', 'kode_depo', $kodeDepo)->all();

        $legacyReceivingIds = DB::table('receiving_items')
            ->where('kode_depo', $kodeDepo)
            ->whereNotNull('receiving_id')
            ->pluck('receiving_id');

        $receivingIds = $this->idsWhereIn('receivings', 'rencana_kirim_id', $rencanaIds)
            ->merge($legacyReceivingIds)
            ->unique()
            ->values()
            ->all();

        $receivingItemIds = $this->idsWhereIn('receiving_items', 'receiving_id', $receivingIds)
            ->merge($this->idsWhere('receiving_items', 'kode_depo', $kodeDepo))
            ->unique()
            ->values()
            ->all();

        $validationIds = $this->idsWhereIn('sj_validations', 'rencana_kirim_id', $rencanaIds)->all();
        $validationItemIds = $this->idsWhereIn('sj_validation_items', 'sj_validation_id', $validationIds)->all();

        $batchIds = $this->idsWhereIn('batches', 'receiving_id', $receivingIds)
            ->merge($this->idsWhereIn('batches', 'receiving_item_id', $receivingItemIds))
            ->merge(
                $validationItemIds === []
                    ? collect()
                    : DB::table('batches')
                        ->whereIn('sj_validation_item_id', $validationItemIds)
                        // Batch gabungan validasi+receiving ikut receiving-nya;
                        // jangan hapus batch yang masih menempel ke receiving
                        // depo lain saat modul validasi saja yang dipilih.
                        ->whereNull('receiving_id')
                        ->whereNull('receiving_item_id')
                        ->pluck('id')
            )
            ->unique()
            ->values()
            ->all();

        $sessionIds = $this->idsWhere('opname_expired_sessions', 'kode_depo', $kodeDepo)->all();
        $sessionItemIds = $this->idsWhereIn('opname_expired_session_items', 'session_id', $sessionIds)->all();

        $waveIds = $this->idsWhere('opname_expired_waves', 'kode_depo', $kodeDepo)->all();
        $waveSessionItemIds = $this->idsWhereIn('opname_expired_session_items', 'wave_id', $waveIds)->all();

        $standarisasiIds = $this->idsWhere('standarisasi_tumpukan', 'kode_depo', $kodeDepo)->all();

        $thlIds = $this->idsWhere('biaya_thls', 'kode_depo', $kodeDepo)->all();

        $retribusiIds = $this->idsWhere('biaya_retribusis', 'kode_depo', $kodeDepo)->all();
        $retribusiDetailIds = $this->idsWhereIn('biaya_retribusi_details', 'biaya_retribusi_id', $retribusiIds)->all();
        $retribusiLinkedThlIds = $this->idsWhereIn('biaya_thls', 'biaya_retribusi_detail_id', $retribusiDetailIds)
            ->merge($this->idsWhereIn('biaya_retribusi_details', 'id', $retribusiDetailIds, 'biaya_thl_id'))
            ->filter()
            ->unique()
            ->values()
            ->all();

        return [
            'rencana_ids' => $rencanaIds,
            'receiving_ids' => $receivingIds,
            'receiving_item_ids' => $receivingItemIds,
            'validation_ids' => $validationIds,
            'validation_item_ids' => $validationItemIds,
            'batch_ids' => $batchIds,
            'session_ids' => $sessionIds,
            'session_item_ids' => $sessionItemIds,
            'wave_ids' => $waveIds,
            'wave_session_item_ids' => $waveSessionItemIds,
            'standarisasi_ids' => $standarisasiIds,
            'thl_ids' => $thlIds,
            'retribusi_ids' => $retribusiIds,
            'retribusi_detail_ids' => $retribusiDetailIds,
            'retribusi_linked_thl_ids' => $retribusiLinkedThlIds,
        ];
    }

    /**
     * Kumpulkan path file milik baris yang akan dihapus, sebelum transaksi.
     *
     * @param  array<int, string>  $modules
     * @param  array<string, array<int, int>>  $scope
     * @return array<int, string>
     */
    private function filePaths(array $modules, array $scope): array
    {
        $paths = [];

        if (array_intersect($modules, ['rencana_kirim', 'validasi-sj'])) {
            $paths = array_merge($paths, $this->nonEmptyColumn('sj_validation_items', 'id', $scope['validation_item_ids'], 'photo'));
        }

        if (array_intersect($modules, ['rencana_kirim', 'receiving'])) {
            $paths = array_merge($paths, $this->nonEmptyColumn('receiving_items', 'id', $scope['receiving_item_ids'], 'photo'));
        }

        if (in_array('opname-session', $modules, true)) {
            $paths = array_merge($paths, $this->nonEmptyColumn('opname_expired_session_items', 'session_id', $scope['session_ids'], 'photo'));
        }

        if (in_array('opname-wave', $modules, true)) {
            $paths = array_merge($paths, $this->nonEmptyColumn('opname_expired_session_items', 'wave_id', $scope['wave_ids'], 'photo'));
        }

        if (in_array('biaya-thl', $modules, true)) {
            $paths = array_merge($paths, $this->nonEmptyColumn('biaya_thl_photos', 'biaya_thl_id', $scope['thl_ids'], 'file_path'));
        }

        if (in_array('biaya-retribusi', $modules, true)) {
            $paths = array_merge($paths, $this->nonEmptyColumn('biaya_retribusi_documents', 'biaya_retribusi_id', $scope['retribusi_ids'], 'file_path'));
            $paths = array_merge($paths, $this->nonEmptyColumn('biaya_thl_photos', 'biaya_thl_id', $scope['retribusi_linked_thl_ids'], 'file_path'));
        }

        return array_values(array_unique(array_filter($paths)));
    }

    /**
     * @param  array<int, string>  $paths
     */
    private function deleteUnreferencedFiles(array $paths): int
    {
        $deleted = 0;
        foreach ($paths as $path) {
            $stillReferenced = DB::table('receiving_items')->where('photo', $path)->exists()
                || DB::table('sj_validation_items')->where('photo', $path)->exists()
                || DB::table('opname_expired_session_items')->where('photo', $path)->exists()
                || DB::table('biaya_thl_photos')->where('file_path', $path)->exists()
                || DB::table('biaya_retribusi_documents')->where('file_path', $path)->exists();

            if (! $stillReferenced && Storage::disk('public')->exists($path)) {
                Storage::disk('public')->delete($path);
                $deleted++;
            }
        }

        return $deleted;
    }

    /**
     * @param  array<int, int>  $ids
     * @param  array<string, int>  $deleted
     */
    private function deleteApprovalHistories(string $subjectType, array $ids, array &$deleted): void
    {
        if ($ids === []) {
            return;
        }

        $deleted['approval_histories'] = ($deleted['approval_histories'] ?? 0)
            + DB::table('approval_histories')
                ->where('subject_type', $subjectType)
                ->whereIn('subject_id', $ids)
                ->delete();
    }

    /**
     * @param  array<int, int>  $ids
     */
    private function deleteIds(string $table, array $ids): int
    {
        return $ids === [] ? 0 : DB::table($table)->whereIn('id', $ids)->delete();
    }

    /**
     * @param  array<int, int>  $ids
     */
    private function deleteWhereIn(string $table, string $column, array $ids): int
    {
        return $ids === [] ? 0 : DB::table($table)->whereIn($column, $ids)->delete();
    }

    /**
     * @param  array<int, int>  $ids
     */
    private function countWhereIn(string $table, string $column, array $ids): int
    {
        return $ids === [] ? 0 : DB::table($table)->whereIn($column, $ids)->count();
    }

    /**
     * @return Collection<int, int>
     */
    private function idsWhere(string $table, string $column, string $value, ?string $pluck = 'id'): Collection
    {
        return DB::table($table)->where($column, $value)->pluck($pluck);
    }

    /**
     * @param  array<int, int>  $ids
     * @return Collection<int, int>
     */
    private function idsWhereIn(string $table, string $column, array $ids, string $pluck = 'id'): Collection
    {
        return $ids === []
            ? collect()
            : DB::table($table)->whereIn($column, $ids)->pluck($pluck);
    }

    /**
     * @param  array<int, int>  $ids
     * @return array<int, string>
     */
    private function nonEmptyColumn(string $table, string $column, array $ids, string $pluck): array
    {
        if ($ids === []) {
            return [];
        }

        return DB::table($table)
            ->whereIn($column, $ids)
            ->whereNotNull($pluck)
            ->where($pluck, '!=', '')
            ->pluck($pluck)
            ->all();
    }
}
