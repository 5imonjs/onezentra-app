<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class EmailRecipient extends Model
{
    protected $fillable = [
        'document_type', 'trigger', 'recipient_type', 'field',
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
        if ($this->recipient_type === 'email' && $this->email) {
            return $this->email;
        }
        if ($this->recipient_type === 'user' && $this->user_id) {
            return $this->user?->email;
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
}
