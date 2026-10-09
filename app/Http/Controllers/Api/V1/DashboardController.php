<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\GateTransaction;
use App\Models\Npn;
use App\Models\OpnameExpiredWave;
use App\Models\Receiving;
use App\Models\ReceivingItem;
use App\Models\RencanaKirim;
use App\Models\SjValidation;
use App\Models\StandarisasiTumpukan;
use App\Models\StandarUmurProduk;
use App\Models\User;
use App\Models\UserActivityLog;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DashboardController extends Controller
{
    public function activity(Request $request): JsonResponse
    {
        $days = min(max($request->integer('days', 30), 7), 90);
        $since = now()->subDays($days - 1)->startOfDay();
        $depotInput = trim((string) $request->input('kode_depo', ''));
        $depot = $request->user()->isDepotScoped()
            ? $request->user()->kode_depo
            : ($depotInput === '' ? null : $depotInput);
        $logs = UserActivityLog::query()
            ->where('occurred_at', '>=', $since)
            ->whereHas('user', fn ($query) => $query->forUserDepot($request->user())
                ->when($depot, fn ($q) => $q->where('users.kode_depo', $depot)))
            ->selectRaw('DATE(occurred_at) as date, COUNT(*) as requests, COUNT(DISTINCT user_id) as active_users')
            ->groupBy('date')
            ->orderBy('date')
            ->get()
            ->keyBy('date');

        $daily = collect(range(0, $days - 1))->map(function (int $offset) use ($since, $logs): array {
            $date = $since->copy()->addDays($offset)->toDateString();
            $row = $logs->get($date);

            return [
                'date' => $date,
                'requests' => (int) ($row->requests ?? 0),
                'active_users' => (int) ($row->active_users ?? 0),
            ];
        })->values();

        $topUsers = User::query()
            ->forUserDepot($request->user())
            ->when($depot, fn ($query) => $query->where('users.kode_depo', $depot))
            ->where('status', 'active')
            ->whereHas('activityLogs', fn ($query) => $query->where('occurred_at', '>=', $since))
            ->withCount(['activityLogs as usage_count' => fn ($query) => $query->where('occurred_at', '>=', $since)])
            ->orderByDesc('usage_count')
            ->limit(5)
            ->get(['id', 'full_name', 'email', 'level'])
            ->map(fn (User $user): array => [
                'id' => $user->id,
                'name' => $user->full_name ?: $user->email,
                'level' => $user->level,
                'requests' => (int) $user->usage_count,
            ])
            ->values();

        return response()->json([
            'data' => [
                'from' => $since->toDateString(),
                'to' => now()->toDateString(),
                'days' => $days,
                'daily' => $daily,
                'top_users' => $topUsers,
            ],
        ]);
    }

    /**
     * Ringkasan dashboard dalam satu request: total + tren per modul,
     * alert kedaluwarsa & approval, flag kualitas data, SLA, dan aktivitas terbaru.
     *
     * Filter `kode_depo` opsional hanya berlaku untuk user global
     * (user depo otomatis ter-scope ke deponya sendiri).
     */
    public function summary(Request $request): JsonResponse
    {
        $user = $request->user();
        $depot = $this->depotCode($request);
        $can = fn (string $perm): bool => $user->hasPermission($perm);
        $week = now()->subDays(7);

        $totals = [];
        $new7d = [];
        $modules = [
            'rencana_kirim' => 'rencana_kirim.view',
            'gate' => 'gate.view',
            'penerimaan' => 'penerimaan.view',
            'receiving' => 'receiving.view',
            'sj_validation' => 'sj_validation.view',
            'npn' => 'npn.view',
            'standar_umur' => 'standar_umur.view',
            'standarisasi' => 'standarisasi.view',
        ];
        foreach ($modules as $key => $perm) {
            if (! $can($perm)) {
                continue;
            }
            // Satu query agregat untuk total + tren 7 hari, bukan dua count
            // terpisah (memangkas jumlah query dashboard per request).
            $aggregate = (clone $this->moduleQuery($key, $depot, $user))
                ->selectRaw('COUNT(*) as total, SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) as new_7d', [$week])
                ->toBase()
                ->first();
            $totals[$key] = (int) ($aggregate->total ?? 0);
            $new7d[$key] = (int) ($aggregate->new_7d ?? 0);
        }

        $alerts = [
            'expired_kritis' => 0,
            'expired_total' => 0,
            'standarisasi_pending' => 0,
        ];
        if ($can('standarisasi.view')) {
            $alerts['standarisasi_pending'] = $this->moduleQuery('standarisasi', $depot, $user)
                ->where('standarisasi_tumpukan.status', 'pending')->count();
        }
        if ($can('opname.view')) {
            $waveQuery = OpnameExpiredWave::query();
            if ($user->isDepotScoped()) {
                $waveQuery->where('kode_depo', $user->kode_depo);
            } elseif ($depot) {
                $waveQuery->where('kode_depo', $depot);
            }
            $latestWeek = (clone $waveQuery)->orderByDesc('week_start')->value('week_start');
            if ($latestWeek) {
                $weekQuery = (clone $waveQuery)->where('week_start', $latestWeek);
                $alerts['expired_kritis'] = (clone $weekQuery)->where('status_ini', 'KRITIS')->count();
                $alerts['expired_total'] = (clone $weekQuery)->whereIn('status_ini', ['KRITIS', 'EXPIRED'])->count();
            }
        }

        $quality = ['npn_no_volume' => 0, 'npn_no_umur' => 0];
        if ($can('npn.view')) {
            $noVolume = Npn::where('szStatus', 'EXISTING')
                ->where(fn ($q) => $q->whereNull('decVolume')->orWhere('decVolume', 0)
                    ->orWhereNull('SAPdecUom')->orWhere('SAPdecUom', 0));
            $noUmur = Npn::where('npn.szStatus', 'EXISTING')
                ->leftJoin('standar_umur_produk as s', 's.material', '=', 'npn.SAPszProductId')
                ->whereNull('s.id');
            $quality['npn_no_volume'] = $noVolume->count();
            $quality['npn_no_umur'] = $noUmur->count();
        }

        $sla = [
            'avg_gate_to_receiving_hours' => null,
            'sj_open_count' => 0,
            'sj_oldest_days' => null,
        ];
        if ($can('receiving.view')) {
            $pairs = Receiving::query()
                ->whereNotNull('gate_transaction_id')
                ->where('receivings.created_at', '>=', now()->subDays(30))
                ->when($depot, fn ($q) => $q->whereHas('rencanaKirim', fn ($rk) => $rk->where('kode_depo', $depot)))
                ->with(['gateTransaction:id,scan_time'])
                ->limit(500)
                ->get(['id', 'gate_transaction_id', 'created_at']);
            $minutes = $pairs
                ->map(fn (Receiving $r) => $r->gateTransaction?->scan_time
                    ? (int) round(abs($r->created_at->diffInMinutes($r->gateTransaction->scan_time)))
                    : null)
                ->filter(fn ($m) => $m !== null);
            $sla['avg_gate_to_receiving_hours'] = $minutes->isNotEmpty() ? round($minutes->avg() / 60, 1) : null;
        }
        if ($can('sj_validation.view')) {
            $openSj = SjValidation::query()
                ->where('status', 'IN_PROGRESS')
                ->when($depot, fn ($q) => $q->whereHas('rencanaKirim', fn ($rk) => $rk->where('kode_depo', $depot)));
            $sla['sj_open_count'] = (clone $openSj)->count();
            $oldest = (clone $openSj)->min('created_at');
            $sla['sj_oldest_days'] = $oldest ? (int) now()->diffInDays($oldest) : null;
        }

        $recent = [];
        if ($can('rencana_kirim.view') || $can('sj_validation.view') || $can('standarisasi.view') || $can('receiving.view')) {
            $recent = $this->recentActivity($user, $depot, $can);
        }

        // Dua window tren dalam satu query: 0-7 hari vs 7-14 hari lalu.
        $activity = UserActivityLog::query()
            ->where('occurred_at', '>=', $week->copy()->subDays(7))
            ->whereHas('user', fn ($query) => $query->forUserDepot($user))
            ->selectRaw(
                'SUM(CASE WHEN occurred_at >= ? THEN 1 ELSE 0 END) as current_7d, '
                .'SUM(CASE WHEN occurred_at < ? THEN 1 ELSE 0 END) as prev_7d',
                [$week, $week]
            )
            ->toBase()
            ->first();
        $activityNow = (int) ($activity->current_7d ?? 0);
        $activityPrev = (int) ($activity->prev_7d ?? 0);

        return response()->json([
            'data' => [
                'depot' => $depot,
                'totals' => $totals,
                'new_7d' => $new7d,
                'alerts' => $alerts,
                'quality' => $quality,
                'sla' => $sla,
                'recent' => $recent,
                'activity_trend' => ['current_7d' => $activityNow, 'prev_7d' => $activityPrev],
            ],
        ]);
    }

    /**
     * Kode depo untuk filter: user depo terkunci ke deponya,
     * user global boleh kirim kode_depo atau null (= semua depo).
     */
    private function depotCode(Request $request): ?string
    {
        $user = $request->user();
        if ($user->isDepotScoped()) {
            return $user->kode_depo;
        }
        $value = trim((string) $request->input('kode_depo', ''));

        return $value === '' ? null : $value;
    }

    /**
     * Query dasar per modul untuk total & tren, sudah ter-scope depo.
     *
     * @return Builder
     */
    private function moduleQuery(string $key, ?string $depot, User $user)
    {
        $rkScope = fn ($q) => $depot
            ? $q->whereHas('rencanaKirim', fn ($rk) => $rk->where('kode_depo', $depot))
            : $q;

        return match ($key) {
            'rencana_kirim' => RencanaKirim::query()->when($depot, fn ($q) => $q->where('kode_depo', $depot)),
            'gate' => $rkScope(GateTransaction::query()),
            'penerimaan' => ReceivingItem::where('source', ReceivingItem::SOURCE_VALIDASI)
                ->when($user->isDepotScoped(), fn ($q) => $q->where(fn ($qq) => $qq
                    ->where('receiving_items.kode_depo', $user->kode_depo)
                    ->orWhereHas('receiving.rencanaKirim', fn ($r) => $r->forUserDepot($user))))
                ->when($depot, fn ($q) => $q->where('receiving_items.kode_depo', $depot)),
            'receiving' => $rkScope(Receiving::query()),
            'sj_validation' => $rkScope(SjValidation::query()),
            'npn' => Npn::query(),
            'standar_umur' => StandarUmurProduk::query(),
            'standarisasi' => StandarisasiTumpukan::query()->forUserDepot($user)->when($depot, fn ($q) => $q->where('standarisasi_tumpukan.kode_depo', $depot)),
        };
    }

    /**
     * Aktivitas bisnis terbaru lintas modul (bukan hit API mentah).
     *
     * @return list<array{type: string, title: string, subtitle: string, href: string, at: string}>
     */
    private function recentActivity(User $user, ?string $depot, callable $can): array
    {
        $items = [];

        if ($can('rencana_kirim.view')) {
            $rows = RencanaKirim::query()
                ->when($user->isDepotScoped(), fn ($q) => $q->forUserDepot($user))
                ->when($depot, fn ($q) => $q->where('kode_depo', $depot))
                ->orderByDesc('updated_at')->limit(3)
                ->get(['id', 'po_transporter', 'status', 'nama_depo', 'updated_at']);
            foreach ($rows as $row) {
                $items[] = [
                    'type' => 'Rencana Kirim',
                    'title' => $row->po_transporter ?: "#{$row->id}",
                    'subtitle' => trim(($row->status ?? '').' • '.($row->nama_depo ?? ''), ' •'),
                    'href' => '/rencana-kirim',
                    'at' => $row->updated_at?->toIso8601String(),
                ];
            }
        }

        if ($can('sj_validation.view')) {
            $rows = SjValidation::query()
                ->when($depot, fn ($q) => $q->whereHas('rencanaKirim', fn ($rk) => $rk->where('kode_depo', $depot)))
                ->with(['rencanaKirim:id,po_transporter'])
                ->orderByDesc('updated_at')->limit(3)
                ->get(['id', 'rencana_kirim_id', 'status', 'updated_at']);
            foreach ($rows as $row) {
                $items[] = [
                    'type' => 'Validasi SJ',
                    'title' => $row->rencanaKirim?->po_transporter ?: "Validasi #{$row->id}",
                    'subtitle' => (string) ($row->status ?? ''),
                    'href' => '/validasi-sj',
                    'at' => $row->updated_at?->toIso8601String(),
                ];
            }
        }

        if ($can('standarisasi.view')) {
            $rows = StandarisasiTumpukan::query()->forUserDepot($user)
                ->when($depot, fn ($q) => $q->where('standarisasi_tumpukan.kode_depo', $depot))
                ->with(['npn:id,szShortDescription,szNickName'])
                ->orderByDesc('standarisasi_tumpukan.updated_at')->limit(3)
                ->get(['id', 'npn_id', 'status', 'updated_at']);
            foreach ($rows as $row) {
                $items[] = [
                    'type' => 'Standarisasi',
                    'title' => $row->npn?->szShortDescription ?: $row->npn?->szNickName ?: "Item #{$row->id}",
                    'subtitle' => (string) ($row->status ?? ''),
                    'href' => '/standarisasi',
                    'at' => $row->updated_at?->toIso8601String(),
                ];
            }
        }

        if ($can('receiving.view')) {
            $rows = Receiving::query()
                ->when($depot, fn ($q) => $q->whereHas('rencanaKirim', fn ($rk) => $rk->where('kode_depo', $depot)))
                ->with(['rencanaKirim:id,po_transporter'])
                ->orderByDesc('updated_at')->limit(3)
                ->get(['id', 'rencana_kirim_id', 'status', 'updated_at']);
            foreach ($rows as $row) {
                $items[] = [
                    'type' => 'Receiving',
                    'title' => $row->rencanaKirim?->po_transporter ?: "Receiving #{$row->id}",
                    'subtitle' => (string) ($row->status ?? ''),
                    'href' => '/receiving',
                    'at' => $row->updated_at?->toIso8601String(),
                ];
            }
        }

        usort($items, fn ($a, $b) => strcmp($b['at'] ?? '', $a['at'] ?? ''));

        return array_slice($items, 0, 8);
    }
}
