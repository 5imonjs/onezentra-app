<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\BiayaRetribusi;
use App\Models\BiayaThl;
use App\Models\DepotSetting;
use App\Models\StandarisasiTumpukan;
use App\Models\User;
use App\Services\LegacyDepotBackfillService;
use App\Support\LikePattern;
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
 * Satu pengecualian: master NPN bersifat global (tidak dimiliki satu depo),
 * jadi reset master NPN menghapus seluruh tabel `npn` lintas depo. Dokumen
 * lama tetap ada, tetapi tautan `npn_id` di-set null. Item Rencana Kirim dan
 * Validasi SJ masih menyimpan kode/nama barang; baris Standarisasi kehilangan
 * tautan produknya.
 *
 * Pengaman berlapis:
 * - gate level admin_master di setiap aksi (403 untuk level lain);
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

    /**
     * Master data global yang boleh dikosongkan. Berbeda dengan MODULES,
     * modul di sini tidak dibatasi depo.
     */
    private const MASTER_MODULES = [
        'npn',
    ];

    private function ensureMaster(Request $request): void
    {
        abort_unless(
            $request->user()?->isMasterScope(),
            403,
            'Hanya akun dengan scope Master yang boleh mengosongkan data.'
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
            'master' => $this->countMasterModules(),
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
        DB::transaction(function () use ($modules, $scope, &$deleted): void {
            $this->deleteScoped($modules, $scope, $deleted);
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
     * Kosongkan master data global — saat ini NPN. Tidak membutuhkan depo
     * karena master NPN dipakai bersama oleh semua depo. Konfirmasi sengaja
     * lebih ketat (`HAPUS NPN`) daripada reset operasional biasa.
     */
    public function purgeMaster(Request $request): JsonResponse
    {
        $this->ensureMaster($request);

        $validated = $request->validate([
            'modules' => ['required', 'array', 'min:1'],
            'modules.*' => ['string', Rule::in(self::MASTER_MODULES)],
            'confirm' => ['required', 'string', 'in:HAPUS NPN'],
            'dry_run' => ['nullable', 'boolean'],
        ], [
            'confirm.in' => 'Ketik HAPUS NPN untuk mengosongkan master NPN.',
        ]);

        $modules = array_values(array_unique($validated['modules']));
        $counts = $this->countMasterModules($modules);

        if ($request->boolean('dry_run')) {
            return response()->json([
                'message' => 'Dry-run: tidak ada yang dihapus.',
                'data' => ['modules' => $modules, 'counts' => $counts],
            ]);
        }

        $deleted = [];
        DB::transaction(function () use ($modules, &$deleted): void {
            if (in_array('npn', $modules, true)) {
                // Dokumen historis tetap disimpan; hanya tautan ke master yang
                // dilepas agar FK tidak menggantung. Kode/nama barang sudah
                // tersalin di masing-masing dokumen.
                $deleted['rencana_kirim_items_npn_nulled'] = DB::table('rencana_kirim_items')
                    ->whereNotNull('npn_id')
                    ->update(['npn_id' => null]);
                $deleted['sj_validation_items_npn_nulled'] = DB::table('sj_validation_items')
                    ->whereNotNull('npn_id')
                    ->update(['npn_id' => null]);
                $deleted['standarisasi_tumpukan_npn_nulled'] = DB::table('standarisasi_tumpukan')
                    ->whereNotNull('npn_id')
                    ->update(['npn_id' => null]);
                $deleted['npn'] = DB::table('npn')->delete();
            }
        });

        return response()->json([
            'message' => 'Master NPN berhasil dikosongkan.',
            'data' => [
                'modules' => $modules,
                'deleted' => $deleted,
                'before' => $counts,
            ],
        ]);
    }

    /**
     * Hitung isi master data global (tidak difilter depo).
     *
     * @param  array<int, string>|null  $modules
     * @return array<string, int>
     */
    private function countMasterModules(?array $modules = null): array
    {
        $modules ??= self::MASTER_MODULES;

        $counts = [];
        foreach ($modules as $module) {
            $counts[$module] = match ($module) {
                'npn' => DB::table('npn')->count(),
            };
        }

        return $counts;
    }

    /**
     * Daftar dokumen yang bisa dipilih untuk reset per dokumen. Selalu
     * dibatasi ke depo terpilih; pencarian mencakup nomor PO/SJ/kendaraan
     * yang relevan untuk modul tersebut.
     */
    public function documents(Request $request): JsonResponse
    {
        $this->ensureMaster($request);

        $depots = $this->depotOptions($request->user());
        $validated = $request->validate([
            'kode_depo' => ['nullable', 'string', 'max:50', Rule::in($depots->pluck('kode_depo')->all())],
            'module' => ['required', 'string', Rule::in(self::MODULES)],
            'search' => ['nullable', 'string', 'max:100'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:200'],
        ], [
            'kode_depo.in' => 'Depo tidak dikenal atau tidak aktif.',
        ]);

        $kodeDepo = $this->resolveDepot($request->user(), $depots, $validated['kode_depo'] ?? null);
        $module = $validated['module'];

        return response()->json([
            'data' => $kodeDepo === null
                ? []
                : $this->documentsFor(
                    $module,
                    $kodeDepo,
                    trim((string) ($validated['search'] ?? '')),
                    (int) ($validated['limit'] ?? 50)
                ),
            'module' => $module,
            'kode_depo' => $kodeDepo,
        ]);
    }

    /**
     * Reset HANYA dokumen yang dipilih (per ID), bukan seluruh modul/depo.
     * ID wajib milik depo terpilih; satu ID asing membatalkan seluruh aksi.
     */
    public function purgeItems(Request $request): JsonResponse
    {
        $this->ensureMaster($request);

        $depots = $this->depotOptions($request->user());
        $validated = $request->validate([
            'kode_depo' => ['required', 'string', 'max:50', Rule::in($depots->pluck('kode_depo')->all())],
            'module' => ['required', 'string', Rule::in(self::MODULES)],
            'ids' => ['required', 'array', 'min:1', 'max:200'],
            'ids.*' => ['integer', 'min:1'],
            'confirm' => ['required', 'string', 'in:HAPUS'],
            'dry_run' => ['nullable', 'boolean'],
        ], [
            'kode_depo.in' => 'Depo tidak dikenal atau tidak aktif.',
        ]);

        $kodeDepo = $validated['kode_depo'];
        $module = $validated['module'];
        $ids = array_values(array_unique(array_map('intval', $validated['ids'])));
        $validIds = $this->selectedRootIds($module, $kodeDepo, $ids);
        $invalid = array_values(array_diff($ids, $validIds));

        if ($invalid !== []) {
            throw ValidationException::withMessages([
                'ids' => 'Dokumen berikut tidak ditemukan di depo ini: '.implode(', ', $invalid),
            ]);
        }

        $scope = $this->scopeForItems($module, $validIds);
        $counts = $this->countModules($kodeDepo, $this->selectionModules($module), $scope);

        if ($request->boolean('dry_run')) {
            return response()->json([
                'message' => 'Dry-run: tidak ada yang dihapus.',
                'data' => [
                    'kode_depo' => $kodeDepo,
                    'module' => $module,
                    'ids' => $validIds,
                    'counts' => $counts,
                ],
            ]);
        }

        /** @var array<int, string> $filePaths */
        $filePaths = $this->filePaths([$module], $scope);

        $deleted = [];
        DB::transaction(function () use ($module, $scope, &$deleted): void {
            $this->deleteScoped([$module], $scope, $deleted);
        });

        $deleted['files'] = $this->deleteUnreferencedFiles($filePaths);

        return response()->json([
            'message' => 'Dokumen terpilih berhasil dihapus.',
            'data' => [
                'kode_depo' => $kodeDepo,
                'module' => $module,
                'ids' => $validIds,
                'deleted' => $deleted,
                'before' => $counts,
            ],
        ]);
    }

    /**
     * @param  array<int, string>  $modules
     * @param  array<string, array<int, int>>  $scope
     * @param  array<string, int>  $deleted
     */
    private function deleteScoped(array $modules, array $scope, array &$deleted): void
    {
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
            $deleted['gate_transactions'] = $this->deleteIds('gate_transactions', $scope['gate_ids']);
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
            $deleted['penerimaan'] = $this->deleteIds('penerimaan', $scope['penerimaan_ids']);
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
                'gate' => count($scope['gate_ids']),
                'validasi-sj' => count($scope['validation_ids']),
                'receiving' => count($scope['receiving_ids']),
                'penerimaan' => count($scope['penerimaan_ids']),
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
            $user->applyDepotFilter($query, 'kode_depo');
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
            return collect($user->depot_codes)->map(fn (string $kode): array => [
                'kode_depo' => $kode,
                'nama_depo' => DepotSetting::where('kode_depo', $kode)->value('nama_depo'),
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

        $batchIds = $this->batchIds($receivingIds, $receivingItemIds, $validationItemIds);
        $gateIds = $this->idsWhereIn('gate_transactions', 'rencana_kirim_id', $rencanaIds)->all();
        $penerimaanIds = $this->idsWhere('penerimaan', 'kode_depo', $kodeDepo)->all();

        $sessionIds = $this->idsWhere('opname_expired_sessions', 'kode_depo', $kodeDepo)->all();
        $sessionItemIds = $this->idsWhereIn('opname_expired_session_items', 'session_id', $sessionIds)->all();

        $waveIds = $this->idsWhere('opname_expired_waves', 'kode_depo', $kodeDepo)->all();
        $waveSessionItemIds = $this->idsWhereIn('opname_expired_session_items', 'wave_id', $waveIds)->all();

        $standarisasiIds = $this->idsWhere('standarisasi_tumpukan', 'kode_depo', $kodeDepo)->all();

        $thlIds = $this->idsWhere('biaya_thls', 'kode_depo', $kodeDepo)->all();

        $retribusiIds = $this->idsWhere('biaya_retribusis', 'kode_depo', $kodeDepo)->all();
        $retribusiDetailIds = $this->idsWhereIn('biaya_retribusi_details', 'biaya_retribusi_id', $retribusiIds)->all();
        $retribusiLinkedThlIds = $this->linkedThlIds($retribusiDetailIds);

        return [
            'rencana_ids' => $rencanaIds,
            'receiving_ids' => $receivingIds,
            'receiving_item_ids' => $receivingItemIds,
            'validation_ids' => $validationIds,
            'validation_item_ids' => $validationItemIds,
            'batch_ids' => $batchIds,
            'gate_ids' => $gateIds,
            'penerimaan_ids' => $penerimaanIds,
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
     * @return array<int, array{id: int, label: string, subtitle: string|null, date: string|null, status: string|null}>
     */
    private function documentsFor(string $module, string $kodeDepo, string $search, int $limit): array
    {
        $like = $search === '' ? null : LikePattern::contains($search);

        return match ($module) {
            'rencana_kirim' => $this->rencanaDocuments($kodeDepo, $like, $limit),
            'gate' => $this->gateDocuments($kodeDepo, $like, $limit),
            'validasi-sj' => $this->validationDocuments($kodeDepo, $like, $limit),
            'receiving' => $this->receivingDocuments($kodeDepo, $like, $limit),
            'penerimaan' => $this->penerimaanDocuments($kodeDepo, $like, $limit),
            'opname-session' => $this->sessionDocuments($kodeDepo, $like, $limit),
            'opname-wave' => $this->waveDocuments($kodeDepo, $like, $limit),
            'standarisasi' => $this->standarisasiDocuments($kodeDepo, $like, $limit),
            'biaya-thl' => $this->thlDocuments($kodeDepo, $like, $limit),
            'biaya-retribusi' => $this->retribusiDocuments($kodeDepo, $like, $limit),
        };
    }

    /**
     * @return array<int, array{id: int, label: string, subtitle: string|null, date: string|null, status: string|null}>
     */
    private function rencanaDocuments(string $kodeDepo, ?string $like, int $limit): array
    {
        $query = DB::table('rencana_kirim')->where('kode_depo', $kodeDepo);

        if ($like !== null) {
            $query->where(function ($query) use ($like): void {
                foreach (['po_transporter', 'driver_name', 'nopol', 'destination_name'] as $column) {
                    $query->orWhereRaw("{$column} LIKE ? ESCAPE ?", [$like, '\\']);
                }
            });
        }

        return $query->orderByDesc('created_at')->limit($limit)
            ->get(['id', 'po_transporter', 'rkh_date', 'driver_name', 'nopol', 'destination_name', 'status'])
            ->map(fn ($row): array => [
                'id' => (int) $row->id,
                'label' => $row->po_transporter ?: '#'.$row->id,
                'subtitle' => collect([$row->driver_name, $row->nopol, $row->destination_name])
                    ->filter()->implode(' · ') ?: null,
                'date' => $this->dateString($row->rkh_date),
                'status' => $row->status,
            ])->all();
    }

    /**
     * @return array<int, array{id: int, label: string, subtitle: string|null, date: string|null, status: string|null}>
     */
    private function gateDocuments(string $kodeDepo, ?string $like, int $limit): array
    {
        $query = DB::table('gate_transactions as g')
            ->join('rencana_kirim as rk', 'rk.id', '=', 'g.rencana_kirim_id')
            ->where('rk.kode_depo', $kodeDepo);

        if ($like !== null) {
            $query->where(function ($query) use ($like): void {
                $query->whereRaw('g.po_transporter LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('g.nopol LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('rk.po_transporter LIKE ? ESCAPE ?', [$like, '\\']);
            });
        }

        return $query->orderByDesc('g.created_at')->limit($limit)
            ->get(['g.id', 'g.po_transporter', 'g.nopol', 'g.gate_type', 'g.status', 'g.created_at', 'rk.po_transporter as rencana_po'])
            ->map(fn ($row): array => [
                'id' => (int) $row->id,
                'label' => $row->po_transporter ?: $row->rencana_po ?: '#'.$row->id,
                'subtitle' => collect([$row->gate_type, $row->nopol, $row->rencana_po ? 'PO: '.$row->rencana_po : null])
                    ->filter()->implode(' · ') ?: null,
                'date' => $this->dateString($row->created_at),
                'status' => $row->status,
            ])->all();
    }

    /**
     * @return array<int, array{id: int, label: string, subtitle: string|null, date: string|null, status: string|null}>
     */
    private function validationDocuments(string $kodeDepo, ?string $like, int $limit): array
    {
        $query = DB::table('sj_validations as v')
            ->join('rencana_kirim as rk', 'rk.id', '=', 'v.rencana_kirim_id')
            ->where('rk.kode_depo', $kodeDepo);

        if ($like !== null) {
            $query->where(function ($query) use ($like): void {
                $query->whereRaw('v.scan_code LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('rk.po_transporter LIKE ? ESCAPE ?', [$like, '\\']);
            });
        }

        return $query->orderByDesc('v.created_at')->limit($limit)
            ->get(['v.id', 'v.scan_code', 'v.status', 'v.completed_at', 'v.created_at', 'rk.po_transporter'])
            ->map(fn ($row): array => [
                'id' => (int) $row->id,
                'label' => $row->scan_code ?: $row->po_transporter ?: '#'.$row->id,
                'subtitle' => $row->po_transporter ? 'PO: '.$row->po_transporter : null,
                'date' => $this->dateString($row->completed_at ?? $row->created_at),
                'status' => $row->status,
            ])->all();
    }

    /**
     * @return array<int, array{id: int, label: string, subtitle: string|null, date: string|null, status: string|null}>
     */
    private function receivingDocuments(string $kodeDepo, ?string $like, int $limit): array
    {
        $query = DB::table('receivings as rc')
            ->join('rencana_kirim as rk', 'rk.id', '=', 'rc.rencana_kirim_id')
            ->where('rk.kode_depo', $kodeDepo);

        if ($like !== null) {
            $query->where(function ($query) use ($like): void {
                $query->whereRaw('rk.po_transporter LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('rk.nopol LIKE ? ESCAPE ?', [$like, '\\']);
            });
        }

        return $query->orderByDesc('rc.created_at')->limit($limit)
            ->get(['rc.id', 'rc.status', 'rc.created_at', 'rc.actual_end_time', 'rk.po_transporter', 'rk.nopol', 'rk.jenis_kendaraan'])
            ->map(fn ($row): array => [
                'id' => (int) $row->id,
                'label' => $row->po_transporter ?: '#'.$row->id,
                'subtitle' => collect([$row->nopol, $row->jenis_kendaraan])->filter()->implode(' · ') ?: null,
                'date' => $this->dateString($row->actual_end_time ?? $row->created_at),
                'status' => $row->status,
            ])->all();
    }

    /**
     * @return array<int, array{id: int, label: string, subtitle: string|null, date: string|null, status: string|null}>
     */
    private function penerimaanDocuments(string $kodeDepo, ?string $like, int $limit): array
    {
        $query = DB::table('penerimaan')->where('kode_depo', $kodeDepo);

        if ($like !== null) {
            $query->where(function ($query) use ($like): void {
                $query->whereRaw('no_shipment LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('No_Container LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('nama_depo LIKE ? ESCAPE ?', [$like, '\\']);
            });
        }

        return $query->orderByDesc('created_at')->limit($limit)
            ->get(['id', 'no_shipment', 'No_Container', 'tanggal_penerimaan', 'created_at', 'status', 'nama_depo'])
            ->map(fn ($row): array => [
                'id' => (int) $row->id,
                'label' => $row->no_shipment ?: $row->No_Container ?: '#'.$row->id,
                'subtitle' => collect([$row->No_Container, $row->nama_depo])->filter()->unique()->implode(' · ') ?: null,
                'date' => $this->dateString($row->tanggal_penerimaan ?? $row->created_at),
                'status' => $row->status,
            ])->all();
    }

    /**
     * @return array<int, array{id: int, label: string, subtitle: string|null, date: string|null, status: string|null}>
     */
    private function sessionDocuments(string $kodeDepo, ?string $like, int $limit): array
    {
        $query = DB::table('opname_expired_sessions')->where('kode_depo', $kodeDepo);

        if ($like !== null) {
            $query->where(function ($query) use ($like): void {
                $query->whereRaw('week_start LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('week_end LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('nama_depo LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('notes LIKE ? ESCAPE ?', [$like, '\\']);
            });
        }

        return $query->orderByDesc('week_start')->limit($limit)
            ->get(['id', 'week_start', 'week_end', 'status', 'nama_depo', 'notes'])
            ->map(fn ($row): array => [
                'id' => (int) $row->id,
                'label' => 'Sesi '.$row->week_start.' s/d '.$row->week_end,
                'subtitle' => collect([$row->nama_depo, $row->notes])->filter()->implode(' · ') ?: null,
                'date' => $this->dateString($row->week_start),
                'status' => $row->status,
            ])->all();
    }

    /**
     * @return array<int, array{id: int, label: string, subtitle: string|null, date: string|null, status: string|null}>
     */
    private function waveDocuments(string $kodeDepo, ?string $like, int $limit): array
    {
        $query = DB::table('opname_expired_waves')->where('kode_depo', $kodeDepo);

        if ($like !== null) {
            $query->where(function ($query) use ($like): void {
                $query->whereRaw('kode_barang LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('nama_barang LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('nama_depo LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('week_start LIKE ? ESCAPE ?', [$like, '\\']);
            });
        }

        return $query->orderByDesc('week_start')->limit($limit)
            ->get(['id', 'week_start', 'week_end', 'kode_barang', 'nama_barang', 'status_ini', 'nama_depo'])
            ->map(fn ($row): array => [
                'id' => (int) $row->id,
                'label' => collect([$row->kode_barang, $row->nama_barang])->filter()->implode(' — ') ?: '#'.$row->id,
                'subtitle' => collect([
                    $row->week_start ? 'Minggu '.$row->week_start.' s/d '.$row->week_end : null,
                    $row->nama_depo,
                ])->filter()->implode(' · ') ?: null,
                'date' => $this->dateString($row->week_start),
                'status' => $row->status_ini,
            ])->all();
    }

    /**
     * @return array<int, array{id: int, label: string, subtitle: string|null, date: string|null, status: string|null}>
     */
    private function standarisasiDocuments(string $kodeDepo, ?string $like, int $limit): array
    {
        $query = DB::table('standarisasi_tumpukan as s')
            ->leftJoin('npn as n', 'n.id', '=', 's.npn_id')
            ->where('s.kode_depo', $kodeDepo);

        if ($like !== null) {
            $query->where(function ($query) use ($like): void {
                $query->whereRaw('n.szBarcode LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('n.SAPszProductId LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('n.szNickName LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('s.status LIKE ? ESCAPE ?', [$like, '\\']);
            });
        }

        return $query->orderByDesc('s.created_at')->limit($limit)
            ->get(['s.id', 's.npn_id', 's.status', 's.created_at', 's.nama_depo', 'n.szBarcode', 'n.SAPszProductId', 'n.szNickName'])
            ->map(fn ($row): array => [
                'id' => (int) $row->id,
                'label' => $row->szBarcode ?: $row->SAPszProductId ?: 'NPN #'.$row->npn_id,
                'subtitle' => collect([$row->szNickName, $row->nama_depo])->filter()->implode(' · ') ?: null,
                'date' => $this->dateString($row->created_at),
                'status' => $row->status,
            ])->all();
    }

    /**
     * @return array<int, array{id: int, label: string, subtitle: string|null, date: string|null, status: string|null}>
     */
    private function thlDocuments(string $kodeDepo, ?string $like, int $limit): array
    {
        $query = BiayaThl::query()
            ->where('kode_depo', $kodeDepo)
            ->with([
                'details:id,biaya_thl_id,no_surat_jalan,nopol_kendaraan,type_kendaraan',
                'biayaRetribusiDetail.receiving.rencanaKirim:id,po_transporter',
            ]);

        if ($like !== null) {
            $query->where(function ($query) use ($like): void {
                foreach (['no_surat_jalan', 'no_kendaraan', 'type_kendaraan'] as $column) {
                    $query->orWhereRaw("{$column} LIKE ? ESCAPE ?", [$like, '\\']);
                }
                $query->orWhereHas('details', fn ($detail) => $detail->whereRaw('no_surat_jalan LIKE ? ESCAPE ?', [$like, '\\']));
                $query->orWhereIn('biaya_retribusi_detail_id', DB::table('biaya_retribusi_details as d')
                    ->join('receivings as rc', 'rc.id', '=', 'd.receiving_id')
                    ->join('rencana_kirim as rk', 'rk.id', '=', 'rc.rencana_kirim_id')
                    ->whereRaw('rk.po_transporter LIKE ? ESCAPE ?', [$like, '\\'])
                    ->select('d.id'));
            });
        }

        return $query->orderByDesc('created_at')->limit($limit)->get()
            ->map(function (BiayaThl $thl): array {
                $first = $thl->details->first();
                $po = $thl->biayaRetribusiDetail?->receiving?->rencanaKirim?->po_transporter;

                return [
                    'id' => $thl->id,
                    'label' => $thl->no_surat_jalan ?: $first?->no_surat_jalan ?: '#'.$thl->id,
                    'subtitle' => collect([
                        $thl->no_kendaraan ?: $first?->nopol_kendaraan,
                        $thl->type_kendaraan ?: $first?->type_kendaraan,
                        $po ? 'PO: '.$po : null,
                    ])->filter()->implode(' · ') ?: null,
                    'date' => $thl->tanggal_pengajuan?->toDateString(),
                    'status' => $thl->status,
                ];
            })->all();
    }

    /**
     * @return array<int, array{id: int, label: string, subtitle: string|null, date: string|null, status: string|null}>
     */
    private function retribusiDocuments(string $kodeDepo, ?string $like, int $limit): array
    {
        $query = BiayaRetribusi::query()
            ->where('kode_depo', $kodeDepo)
            ->with([
                'details:id,biaya_retribusi_id,no_surat_jalan,receiving_id',
                'details.receiving.rencanaKirim:id,po_transporter',
            ]);

        if ($like !== null) {
            $query->where(function ($query) use ($like): void {
                $query->whereHas('details', fn ($detail) => $detail->whereRaw('no_surat_jalan LIKE ? ESCAPE ?', [$like, '\\']))
                    ->orWhereHas('details.receiving.rencanaKirim', fn ($rencana) => $rencana->whereRaw('po_transporter LIKE ? ESCAPE ?', [$like, '\\']))
                    ->orWhereRaw('nama_depo LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('status LIKE ? ESCAPE ?', [$like, '\\']);
            });
        }

        return $query->orderByDesc('created_at')->limit($limit)->get()
            ->map(function (BiayaRetribusi $retribusi): array {
                $first = $retribusi->details->first();
                $po = $first?->receiving?->rencanaKirim?->po_transporter;

                return [
                    'id' => $retribusi->id,
                    'label' => $first?->no_surat_jalan ?: 'Retribusi #'.$retribusi->id,
                    'subtitle' => collect([$po ? 'PO: '.$po : null, $retribusi->nama_depo])
                        ->filter()->implode(' · ') ?: null,
                    'date' => $retribusi->tanggal_pengajuan?->toDateString(),
                    'status' => $retribusi->status,
                ];
            })->all();
    }

    private function dateString(mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        if ($value instanceof \DateTimeInterface) {
            return $value->format('Y-m-d');
        }

        return substr((string) $value, 0, 10);
    }

    /**
     * Modul yang ikut terhitung saat satu dokumen root dipilih.
     *
     * @return array<int, string>
     */
    private function selectionModules(string $module): array
    {
        return match ($module) {
            'rencana_kirim' => ['rencana_kirim', 'gate', 'validasi-sj', 'receiving'],
            default => [$module],
        };
    }

    /**
     * Ambil ID root yang benar-benar milik depo terpilih.
     *
     * @param  array<int, int>  $ids
     * @return array<int, int>
     */
    private function selectedRootIds(string $module, string $kodeDepo, array $ids): array
    {
        if ($ids === []) {
            return [];
        }

        $query = match ($module) {
            'rencana_kirim' => DB::table('rencana_kirim')
                ->where('kode_depo', $kodeDepo)
                ->whereIn('id', $ids),
            'gate' => DB::table('gate_transactions as g')
                ->join('rencana_kirim as rk', 'rk.id', '=', 'g.rencana_kirim_id')
                ->where('rk.kode_depo', $kodeDepo)
                ->whereIn('g.id', $ids)
                ->select('g.id as id'),
            'validasi-sj' => DB::table('sj_validations as v')
                ->join('rencana_kirim as rk', 'rk.id', '=', 'v.rencana_kirim_id')
                ->where('rk.kode_depo', $kodeDepo)
                ->whereIn('v.id', $ids)
                ->select('v.id as id'),
            'receiving' => DB::table('receivings as rc')
                ->join('rencana_kirim as rk', 'rk.id', '=', 'rc.rencana_kirim_id')
                ->where('rk.kode_depo', $kodeDepo)
                ->whereIn('rc.id', $ids)
                ->select('rc.id as id'),
            'penerimaan' => DB::table('penerimaan')
                ->where('kode_depo', $kodeDepo)
                ->whereIn('id', $ids),
            'opname-session' => DB::table('opname_expired_sessions')
                ->where('kode_depo', $kodeDepo)
                ->whereIn('id', $ids),
            'opname-wave' => DB::table('opname_expired_waves')
                ->where('kode_depo', $kodeDepo)
                ->whereIn('id', $ids),
            'standarisasi' => DB::table('standarisasi_tumpukan')
                ->where('kode_depo', $kodeDepo)
                ->whereIn('id', $ids),
            'biaya-thl' => DB::table('biaya_thls')
                ->where('kode_depo', $kodeDepo)
                ->whereIn('id', $ids),
            'biaya-retribusi' => DB::table('biaya_retribusis')
                ->where('kode_depo', $kodeDepo)
                ->whereIn('id', $ids),
        };

        return $query->pluck('id')->map(fn ($id): int => (int) $id)->all();
    }

    /**
     * Cakupan anak-dari-root untuk reset dokumen terpilih.
     *
     * @param  array<int, int>  $ids
     * @return array<string, array<int, int>>
     */
    private function scopeForItems(string $module, array $ids): array
    {
        $scope = [
            'rencana_ids' => [],
            'receiving_ids' => [],
            'receiving_item_ids' => [],
            'validation_ids' => [],
            'validation_item_ids' => [],
            'batch_ids' => [],
            'gate_ids' => [],
            'penerimaan_ids' => [],
            'session_ids' => [],
            'session_item_ids' => [],
            'wave_ids' => [],
            'wave_session_item_ids' => [],
            'standarisasi_ids' => [],
            'thl_ids' => [],
            'retribusi_ids' => [],
            'retribusi_detail_ids' => [],
            'retribusi_linked_thl_ids' => [],
        ];

        switch ($module) {
            case 'rencana_kirim':
                $scope['rencana_ids'] = $ids;
                $scope['receiving_ids'] = $this->idsWhereIn('receivings', 'rencana_kirim_id', $ids)->all();
                $scope['receiving_item_ids'] = $this->idsWhereIn('receiving_items', 'receiving_id', $scope['receiving_ids'])->all();
                $scope['validation_ids'] = $this->idsWhereIn('sj_validations', 'rencana_kirim_id', $ids)->all();
                $scope['validation_item_ids'] = $this->idsWhereIn('sj_validation_items', 'sj_validation_id', $scope['validation_ids'])->all();
                $scope['gate_ids'] = $this->idsWhereIn('gate_transactions', 'rencana_kirim_id', $ids)->all();
                $scope['batch_ids'] = $this->batchIds($scope['receiving_ids'], $scope['receiving_item_ids'], $scope['validation_item_ids']);
                break;
            case 'validasi-sj':
                $scope['validation_ids'] = $ids;
                $scope['validation_item_ids'] = $this->idsWhereIn('sj_validation_items', 'sj_validation_id', $ids)->all();
                $scope['batch_ids'] = $this->validationOnlyBatchIds($scope['validation_item_ids'])->all();
                break;
            case 'receiving':
                $scope['receiving_ids'] = $ids;
                $scope['receiving_item_ids'] = $this->idsWhereIn('receiving_items', 'receiving_id', $ids)->all();
                $scope['batch_ids'] = $this->batchIds($ids, $scope['receiving_item_ids'], []);
                break;
            case 'gate':
                $scope['gate_ids'] = $ids;
                break;
            case 'penerimaan':
                $scope['penerimaan_ids'] = $ids;
                break;
            case 'opname-session':
                $scope['session_ids'] = $ids;
                $scope['session_item_ids'] = $this->idsWhereIn('opname_expired_session_items', 'session_id', $ids)->all();
                break;
            case 'opname-wave':
                $scope['wave_ids'] = $ids;
                $scope['wave_session_item_ids'] = $this->idsWhereIn('opname_expired_session_items', 'wave_id', $ids)->all();
                break;
            case 'standarisasi':
                $scope['standarisasi_ids'] = $ids;
                break;
            case 'biaya-thl':
                $scope['thl_ids'] = $ids;
                break;
            case 'biaya-retribusi':
                $scope['retribusi_ids'] = $ids;
                $scope['retribusi_detail_ids'] = $this->idsWhereIn('biaya_retribusi_details', 'biaya_retribusi_id', $ids)->all();
                $scope['retribusi_linked_thl_ids'] = $this->linkedThlIds($scope['retribusi_detail_ids']);
                break;
        }

        return $scope;
    }

    /**
     * @param  array<int, int>  $receivingIds
     * @param  array<int, int>  $receivingItemIds
     * @param  array<int, int>  $validationItemIds
     * @return array<int, int>
     */
    private function batchIds(array $receivingIds, array $receivingItemIds, array $validationItemIds): array
    {
        return $this->idsWhereIn('batches', 'receiving_id', $receivingIds)
            ->merge($this->idsWhereIn('batches', 'receiving_item_id', $receivingItemIds))
            ->merge($this->validationOnlyBatchIds($validationItemIds))
            ->unique()
            ->values()
            ->all();
    }

    /**
     * Batch yang hanya berasal dari validasi (belum menempel ke receiving).
     *
     * @param  array<int, int>  $validationItemIds
     * @return Collection<int, int>
     */
    private function validationOnlyBatchIds(array $validationItemIds): Collection
    {
        return $validationItemIds === []
            ? collect()
            : DB::table('batches')
                ->whereIn('sj_validation_item_id', $validationItemIds)
                // Batch gabungan validasi+receiving ikut receiving-nya;
                // jangan hapus batch yang masih menempel ke receiving
                // depo lain saat modul validasi saja yang dipilih.
                ->whereNull('receiving_id')
                ->whereNull('receiving_item_id')
                ->pluck('id');
    }

    /**
     * @param  array<int, int>  $retribusiDetailIds
     * @return array<int, int>
     */
    private function linkedThlIds(array $retribusiDetailIds): array
    {
        return $this->idsWhereIn('biaya_thls', 'biaya_retribusi_detail_id', $retribusiDetailIds)
            ->merge($this->idsWhereIn('biaya_retribusi_details', 'id', $retribusiDetailIds, 'biaya_thl_id'))
            ->filter()
            ->unique()
            ->values()
            ->all();
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
