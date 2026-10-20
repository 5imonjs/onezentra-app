<?php

namespace App\Services;

use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Isi `kode_depo` pada baris operasional legacy yang masih kosong — HANYA
 * dari sumber yang deterministik:
 *
 * - relasi dokumen (receiving → rencana, THL → detail retribusi, retribusi →
 *   receiving, standarisasi → NPN);
 * - nama depo yang setelah dinormalisasi cocok PERSIS dengan satu
 *   `depot_settings.nama_depo`, atau dengan kode depo itu sendiri.
 *
 * Tidak ada fuzzy matching dan tidak pernah menimpa `kode_depo` yang sudah
 * terisi. Bila dua sumber memberi depo berbeda, baris dibiarkan kosong dan
 * dilaporkan sebagai "konflik" agar master memutuskan manual.
 */
class LegacyDepotBackfillService
{
    /**
     * Tabel operasional yang di-reset per depo dan punya kolom `kode_depo`
     * langsung. `receiving_items` ikut karena reset/export memfilter kolom itu.
     *
     * @var array<int, string>
     */
    private const TABLES = [
        'rencana_kirim',
        'receiving_items',
        'penerimaan',
        'opname_expired_sessions',
        'opname_expired_waves',
        'standarisasi_tumpukan',
        'biaya_thls',
        'biaya_retribusis',
    ];

    /**
     * @return array{
     *     dry_run: bool,
     *     candidates: array<string, array{total: int, resolved: int, unresolved: int, samples: array<int, array<string, mixed>>, unresolved_samples: array<int, array<string, mixed>>}>,
     *     applied: array<string, int>
     * }
     */
    public function run(bool $dryRun = true): array
    {
        $depots = $this->depotMap();
        $summary = [];
        $applied = [];

        $work = function () use ($depots, $dryRun, &$summary, &$applied): void {
            foreach (self::TABLES as $table) {
                $stat = [
                    'total' => 0,
                    'resolved' => 0,
                    'unresolved' => 0,
                    'samples' => [],
                    'unresolved_samples' => [],
                ];

                DB::table($table)
                    ->where(function ($query): void {
                        $query->whereNull('kode_depo')->orWhere('kode_depo', '');
                    })
                    ->orderBy('id')
                    ->chunkById(500, function (Collection $rows) use ($table, $depots, $dryRun, &$stat, &$applied): void {
                        foreach ($rows as $row) {
                            $stat['total']++;

                            [$code, $source, $reason] = $this->resolve($table, $row, $depots);

                            if ($code === null) {
                                $stat['unresolved']++;
                                if (count($stat['unresolved_samples']) < 10) {
                                    $stat['unresolved_samples'][] = [
                                        'id' => $row->id,
                                        'nama_depo' => $row->nama_depo ?? null,
                                        'alasan' => $reason,
                                    ];
                                }

                                continue;
                            }

                            $stat['resolved']++;
                            if (count($stat['samples']) < 10) {
                                $stat['samples'][] = [
                                    'id' => $row->id,
                                    'nama_depo' => $row->nama_depo ?? null,
                                    'kode_depo' => $code,
                                    'sumber' => $source,
                                ];
                            }

                            if (! $dryRun) {
                                $applied[$table] = ($applied[$table] ?? 0) + DB::table($table)
                                    ->where('id', $row->id)
                                    ->where(function ($query): void {
                                        $query->whereNull('kode_depo')->orWhere('kode_depo', '');
                                    })
                                    ->update(['kode_depo' => $code]);
                            }
                        }
                    });

                $summary[$table] = $stat;
            }
        };

        if ($dryRun) {
            $work();
        } else {
            DB::transaction($work);
        }

        return [
            'dry_run' => $dryRun,
            'candidates' => $summary,
            'applied' => $applied,
        ];
    }

    /**
     * @return array{codes: array<string, string>, by_name: array<string, array<int, string>>}
     */
    private function depotMap(): array
    {
        $rows = DB::table('depot_settings')
            ->where('is_active', true)
            ->get(['kode_depo', 'nama_depo']);

        $codes = [];
        $byName = [];

        foreach ($rows as $row) {
            $code = trim((string) $row->kode_depo);
            if ($code === '') {
                continue;
            }

            $codes[$code] = $code;

            $key = $this->normalizeName($row->nama_depo);
            if ($key !== '') {
                $byName[$key][] = $code;
            }

            // Sebagian data legacy menyimpan kode di kolom nama_depo.
            $codeKey = $this->normalizeName($code);
            if ($codeKey !== '') {
                $byName[$codeKey][] = $code;
            }
        }

        return ['codes' => $codes, 'by_name' => $byName];
    }

    /**
     * @param  array{codes: array<string, string>, by_name: array<string, array<int, string>>}  $depots
     * @return array{0: string|null, 1: string, 2: string|null}
     */
    private function resolve(string $table, object $row, array $depots): array
    {
        $candidates = [];
        $ambiguousName = false;

        $nameCodes = $this->codesFromName($row->nama_depo ?? null, $depots);
        if (count($nameCodes) === 1) {
            $candidates['nama_depo'] = $nameCodes[0];
        } elseif (count($nameCodes) > 1) {
            $ambiguousName = true;
        }

        switch ($table) {
            case 'receiving_items':
                $rencana = DB::table('receivings as rc')
                    ->join('rencana_kirim as rk', 'rk.id', '=', 'rc.rencana_kirim_id')
                    ->where('rc.id', $row->receiving_id)
                    ->first(['rk.kode_depo', 'rk.nama_depo']);

                $code = $this->validCode($rencana->kode_depo ?? null, $depots)
                    ?? $this->singleCode($this->codesFromName($rencana->nama_depo ?? null, $depots));

                if ($code !== null) {
                    $candidates['relasi receiving'] = $code;
                }
                break;

            case 'standarisasi_tumpukan':
                $npn = $row->npn_id
                    ? DB::table('npn')->where('id', $row->npn_id)->first(['kode_depo', 'nama_depo'])
                    : null;

                $code = $this->validCode($npn->kode_depo ?? null, $depots)
                    ?? $this->singleCode($this->codesFromName($npn->nama_depo ?? null, $depots));

                if ($code !== null) {
                    $candidates['relasi NPN'] = $code;
                }
                break;

            case 'biaya_thls':
                $relationCodes = collect();

                if ($row->biaya_retribusi_detail_id) {
                    $relationCodes = $relationCodes->merge(
                        DB::table('biaya_retribusi_details as d')
                            ->join('biaya_retribusis as r', 'r.id', '=', 'd.biaya_retribusi_id')
                            ->where('d.id', $row->biaya_retribusi_detail_id)
                            ->pluck('r.kode_depo')
                    );
                }

                // Back-reference: detail retribusi yang menunjuk THL ini.
                $relationCodes = $relationCodes->merge(
                    DB::table('biaya_retribusi_details as d')
                        ->join('biaya_retribusis as r', 'r.id', '=', 'd.biaya_retribusi_id')
                        ->where('d.biaya_thl_id', $row->id)
                        ->pluck('r.kode_depo')
                );

                $relationCodes = $this->validCodes($relationCodes, $depots);
                if ($relationCodes->count() > 1) {
                    return [null, '', 'relasi retribusi menunjukkan lebih dari satu depo: '.$relationCodes->implode(', ')];
                }
                if ($relationCodes->count() === 1) {
                    $candidates['relasi retribusi'] = $relationCodes->first();
                }
                break;

            case 'biaya_retribusis':
                $relationCodes = $this->validCodes(
                    DB::table('biaya_retribusi_details as d')
                        ->join('receivings as rc', 'rc.id', '=', 'd.receiving_id')
                        ->join('rencana_kirim as rk', 'rk.id', '=', 'rc.rencana_kirim_id')
                        ->where('d.biaya_retribusi_id', $row->id)
                        ->pluck('rk.kode_depo'),
                    $depots
                );

                if ($relationCodes->count() > 1) {
                    return [null, '', 'relasi receiving menunjukkan lebih dari satu depo: '.$relationCodes->implode(', ')];
                }
                if ($relationCodes->count() === 1) {
                    $candidates['relasi receiving'] = $relationCodes->first();
                }
                break;
        }

        if ($candidates === []) {
            return [null, '', $ambiguousName
                ? 'nama depo cocok ke lebih dari satu depo'
                : 'nama depo tidak cocok unik dan tidak ada relasi yang bisa dipakai'];
        }

        $uniqueCodes = array_values(array_unique($candidates));
        if (count($uniqueCodes) > 1) {
            $detail = collect($candidates)
                ->map(fn (string $code, string $source): string => "{$source}={$code}")
                ->implode(', ');

            return [null, '', 'sumber memberi depo berbeda: '.$detail];
        }

        return [$uniqueCodes[0], (string) array_key_first($candidates), null];
    }

    /**
     * @param  array{codes: array<string, string>, by_name: array<string, array<int, string>>}  $depots
     */
    private function validCode(?string $code, array $depots): ?string
    {
        $code = trim((string) $code);

        return $code !== '' && isset($depots['codes'][$code]) ? $code : null;
    }

    /**
     * @param  Collection<int, string|null>  $codes
     * @param  array{codes: array<string, string>, by_name: array<string, array<int, string>>}  $depots
     * @return Collection<int, string>
     */
    private function validCodes(Collection $codes, array $depots): Collection
    {
        return $codes
            ->map(fn (?string $code): ?string => $this->validCode($code, $depots))
            ->filter()
            ->unique()
            ->values();
    }

    /**
     * @param  array{codes: array<string, string>, by_name: array<string, array<int, string>>}  $depots
     * @return array<int, string>
     */
    private function codesFromName(?string $name, array $depots): array
    {
        $key = $this->normalizeName($name);

        return $key === '' ? [] : array_values(array_unique($depots['by_name'][$key] ?? []));
    }

    /**
     * @param  array<int, string>  $codes
     */
    private function singleCode(array $codes): ?string
    {
        return count($codes) === 1 ? $codes[0] : null;
    }

    private function normalizeName(?string $name): string
    {
        $name = trim((string) $name);

        if ($name === '') {
            return '';
        }

        return mb_strtolower(preg_replace('/\s+/u', ' ', $name) ?? $name);
    }
}
