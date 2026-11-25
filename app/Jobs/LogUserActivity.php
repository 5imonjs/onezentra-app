<?php

namespace App\Jobs;

use App\Models\UserActivityLog;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Str;

class LogUserActivity implements ShouldQueue
{
    use Queueable;

    public function __construct(
        public int $userId,
        public string $method,
        public string $route,
        public string $occurredAt,
        public ?string $ipAddress = null,
        public ?string $userAgent = null,
        public ?string $deviceName = null,
    ) {}

    public function handle(): void
    {
        UserActivityLog::create([
            'user_id' => $this->userId,
            'method' => $this->method,
            'route' => $this->route,
            'occurred_at' => $this->occurredAt,
            'ip_address' => $this->ipAddress,
            'user_agent' => $this->userAgent === null
                ? null
                : Str::limit($this->userAgent, 1000, ''),
            'device_name' => $this->deviceName === null
                ? null
                : Str::limit($this->deviceName, 100, ''),
        ]);
    }
}
