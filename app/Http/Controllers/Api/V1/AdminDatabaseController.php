<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Kosongkan data operasional per modul — HANYA level admin_master.
 *
 * Berbeda dengan hapus per-dokumen di controller masing-masing (yang dibatasi
 * status), endpoint ini untuk kebutuhan reset operasional: mengosongkan
 * seluruh isi tabel modul sekaligus dalam satu transaksi.
 *
 * Pengaman berlapis:
 * - gate level admin_master di kedua aksi (403 untuk level lain);
 * - daftar modul fixed allowlist — tidak bisa hapus tabel arbitrer;
 * - konfirmasi teks eksak `HAPUS` wajib dikirim;
 * - dry-run (`?dry_run=1`) hanya menghitung tanpa menghapus;
 * - transaksi DB tunggal: gagal di tengah = rollback penuh.
 *
 * Urutan hapus anak-dulu (batches yatim → validasi → gate → receiving →
 * rencana → penerimaan → opname) agar FK restrict tidak meledak di tengah.
 * Baris biaya retribusi yang mengklaim receiving TIDAK ikut dihapus
 * (FK-nya di-set null otomatis); jumlahnya dilaporkan agar master sadar.
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

        return response()->json(['data' => $this->countAll()]);
    }

    public function purge(Request $request): JsonResponse
    {
        $this->ensureMaster($request);

        $validated = $request->validate([
            'modules' => ['required', 'array', 'min:1'],
            'modules.*' => ['string', Rule::in(self::MODULES)],
            'confirm' => ['required', 'string', 'in:HAPUS'],
            'dry_run' => ['nullable', 'boolean'],
        ]);

        $modules = array_values(array_unique($validated['modules']));
        $counts = $this->countModules($modules);

        if ($request->boolean('dry_run')) {
            return response()->json([
                'message' => 'Dry-run: tidak ada yang dihapus.',
                'data' => ['modules' => $modules, 'counts' => $counts],
            ]);
        }

        $deleted = [];
        DB::transaction(function () use ($modules, &$deleted): void {
            // 1. Batches yatim (validasi + receiving yang ikut terhapus).
            if (array_intersect($modules, ['validasi-sj', 'receiving', 'rencana_kirim'])) {
                $deleted['batches'] = $this->deleteOrphanBatches($modules);
            }
            // 2. Validasi SJ (+items cascade). Bila rencana_kirim ikut
            // dipilih, baris-baris ini ikut terhapus via cascade rencana —
            // dihapus eksplisit di sini agar angka laporan akurat.
            if (in_array('validasi-sj', $modules, true) || in_array('rencana_kirim', $modules, true)) {
                $deleted['sj_validations'] = DB::table('sj_validations')->delete();
            }
            // 3. Gate transactions (receivings.gate_transaction_id di-set null otomatis).
            if (in_array('gate', $modules, true) || in_array('rencana_kirim', $modules, true)) {
                $deleted['gate_transactions'] = DB::table('gate_transactions')->delete();
            }
            // 4. Receiving (+items & batches via receiving_id cascade).
            if (in_array('receiving', $modules, true) || in_array('rencana_kirim', $modules, true)) {
                $deleted['receivings'] = DB::table('receivings')->delete();
            }
            // 5. Rencana kirim (+items cascade).
            if (in_array('rencana_kirim', $modules, true)) {
                $deleted['rencana_kirim'] = DB::table('rencana_kirim')->delete();
            }
            // 6. Penerimaan (tabel mandiri).
            if (in_array('penerimaan', $modules, true)) {
                $deleted['penerimaan'] = DB::table('penerimaan')->delete();
            }
            // 7. Sesi opname (+items cascade). Waves dibiarkan (data referensi batch).
            if (in_array('opname-session', $modules, true)) {
                $deleted['opname_expired_sessions'] = DB::table('opname_expired_sessions')->delete();
            }
        });

        return response()->json([
            'message' => 'Data modul terpilih berhasil dikosongkan.',
            'data' => ['modules' => $modules, 'deleted' => $deleted, 'before' => $counts],
        ]);
    }

    /**
     * Hapus batch yang akan yatim: terkait validasi/receiving yang ikut
     * dihapus, dan tidak terkait receiving lain yang bertahan.
     */
    private function deleteOrphanBatches(array $modules): int
    {
        // Kumpulkan receiving yang akan hilang (langsung atau via rencana).
        $receivingIds = [];
        if (in_array('receiving', $modules, true) || in_array('rencana_kirim', $modules, true)) {
            $receivingIds = DB::table('receivings')->pluck('id')->all();
        }
        $receivingItemIds = $receivingIds === []
            ? []
            : DB::table('receiving_items')->whereIn('receiving_id', $receivingIds)->pluck('id')->all();

        // Kumpulkan item validasi yang akan hilang.
        $validationItemIds = [];
        if (in_array('validasi-sj', $modules, true) || in_array('rencana_kirim', $modules, true)) {
            $validationIds = DB::table('sj_validations')->pluck('id')->all();
            $validationItemIds = $validationIds === []
                ? []
                : DB::table('sj_validation_items')->whereIn('sj_validation_id', $validationIds)->pluck('id')->all();
        }

        $query = DB::table('batches')->where(function ($q) use ($receivingIds, $receivingItemIds, $validationItemIds): void {
            if ($receivingIds !== []) {
                $q->orWhereIn('receiving_id', $receivingIds);
            }
            if ($receivingItemIds !== []) {
                $q->orWhereIn('receiving_item_id', $receivingItemIds);
            }
            if ($validationItemIds !== []) {
                // Hanya batch yang TIDAK menempel ke receiving/item lain
                // yang bertahan — batch gabungan validasi+receiving ikut
                // receiving-nya (cascade), jadi aman dihapus di sini bila
                // receiving-nya juga hilang.
                $q->orWhere(function ($qq) use ($validationItemIds, $receivingIds, $receivingItemIds): void {
                    $qq->whereIn('sj_validation_item_id', $validationItemIds)
                        ->when(
                            $receivingIds !== [] || $receivingItemIds !== [],
                            fn ($qqq) => $qqq->whereNull('receiving_id')->whereNull('receiving_item_id'),
                            fn ($qqq) => $qqq->whereNotNull('sj_validation_item_id')
                        );
                });
            }
        });

        if ($receivingIds === [] && $receivingItemIds === [] && $validationItemIds === []) {
            return 0;
        }

        return $query->delete();
    }

    /**
     * Hitung isi tiap modul (untuk tampilan konfirmasi).
     *
     * @return array<string, int>
     */
    private function countModules(array $modules): array
    {
        $counts = [];
        $all = [
            'rencana_kirim' => 'rencana_kirim',
            'gate' => 'gate_transactions',
            'validasi-sj' => 'sj_validations',
            'receiving' => 'receivings',
            'penerimaan' => 'penerimaan',
            'opname-session' => 'opname_expired_sessions',
        ];
        foreach ($modules as $module) {
            $counts[$module] = DB::table($all[$module])->count();
        }
        // Baris biaya yang referensinya ikut longgar (di-set null, tak dihapus).
        if (array_intersect($modules, ['receiving', 'rencana_kirim'])) {
            $counts['klaim_biaya_terdampak'] = DB::table('biaya_retribusi_details')
                ->whereNotNull('receiving_id')
                ->count();
        }

        return $counts;
    }

    /**
     * @return array<string, int>
     */
    private function countAll(): array
    {
        return $this->countModules(self::MODULES);
    }
}
