<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class EmailRecipient extends Model
{
    protected $fillable = [
        'document_type', 'trigger', 'kode_depo', 'recipient_type', 'field',
        'email', 'user_id', 'role_slug', 'label', 'is_active',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function resolveEmail(): ?string
    {
        if ($this->recipient_type === 'email') {
            return $this->email ?: null;
        }

        if ($this->recipient_type === 'user' && $this->user_id) {
            // Cermin `EmailRecipientController::withResolution()` + label UI
            // ("User tidak aktif ... email tidak akan terkirim"). Sebelumnya
            // email user nonaktif tetap dikirim walau UI menandainya gagal.
            $user = $this->user;

            return ($user && $user->status === 'active' && filled($user->email))
                ? $user->email
                : null;
        }

        if ($this->recipient_type === 'role' && $this->role_slug) {
            return null; // resolved per shipment via role members
        }

        return null;
    }

    public function resolveRoleEmails(): array
    {
        if ($this->recipient_type !== 'role' || ! $this->role_slug) {
            return [];
        }

        return User::whereHas('roles', function ($q) {
            $q->where('slug', $this->role_slug);
        })->where('status', 'active')->pluck('email')->filter()->values()->all();
    }

    /**
     * Resolve role emails filtered by depot.
     */
    public function resolveRoleEmailsByDepot(?string $kodeDepo = null): array
    {
        if ($this->recipient_type !== 'role' || ! $this->role_slug) {
            return [];
        }

        $query = User::whereHas('roles', function ($q) {
            $q->where('slug', $this->role_slug);
        })->where('status', 'active');

        if ($kodeDepo) {
            $query->where('kode_depo', $kodeDepo);
        }

        return $query->pluck('email')->filter()->values()->all();
    }
}
