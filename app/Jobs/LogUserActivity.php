<?php

namespace App\Jobs;

use App\Models\UserActivityLog;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class LogUserActivity implements ShouldQueue
{
    use Queueable;

    public function __construct(
        public int $userId,
        public string $method,
        public string $route,
        public string $occurredAt,
    ) {}

    public function handle(): void
    {
        UserActivityLog::create([
            'user_id' => $this->userId,
            'method' => $this->method,
            'route' => $this->route,
            'occurred_at' => $this->occurredAt,
        ]);
    }
}
