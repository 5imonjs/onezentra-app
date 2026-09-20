<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\UserActivityLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DashboardController extends Controller
{
    public function activity(Request $request): JsonResponse
    {
        $days = min(max($request->integer('days', 30), 7), 90);
        $since = now()->subDays($days - 1)->startOfDay();
        $logs = UserActivityLog::query()
            ->where('occurred_at', '>=', $since)
            ->whereHas('user', fn ($query) => $query->forUserDepot($request->user()))
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
}
