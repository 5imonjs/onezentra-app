<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class OpnameExpiredSession extends Model
{
    public const STATUS_OPEN = 'OPEN';

    public const STATUS_IN_PROGRESS = 'IN_PROGRESS';

    public const STATUS_PENDING_APPROVAL = 'PENDING_APPROVAL';

    public const STATUS_APPROVED = 'APPROVED';

    /** Sesi lama pra-approval yang tercatat selesai (danger legacy). */
    public const STATUS_COMPLETED = 'COMPLETED';

    public const STATUS_REVISI = 'REVISI';

    public const STATUS_CANCELLED = 'CANCELLED';

    /** Sesi yang wave-nya masih terkunci (belum ditutup definitif). */
    public const OPEN_STATUSES = [
        self::STATUS_OPEN,
        self::STATUS_IN_PROGRESS,
        self::STATUS_PENDING_APPROVAL,
        self::STATUS_REVISI,
    ];

    protected $fillable = [
        'week_start', 'week_end', 'kode_depo', 'nama_depo', 'assigned_to',
        'status', 'notes', 'started_at', 'completed_at', 'created_by',
        'submitted_by', 'submitted_at', 'decided_by', 'decided_at', 'decision_note',
    ];

    protected function casts(): array
    {
        return [
            'started_at' => 'datetime',
            'completed_at' => 'datetime',
            'submitted_at' => 'datetime',
            'decided_at' => 'datetime',
        ];
    }

    public function items(): HasMany
    {
        return $this->hasMany(OpnameExpiredSessionItem::class, 'session_id');
    }

    public function assignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * Petugas yang mengirim sesi untuk persetujuan — penyusun angka.
     */
    public function submitter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'submitted_by');
    }

    /**
     * Approver yang memutuskan (setujui / revisi) — wajib berbeda dari
     * penghitung (segregation of duties).
     */
    public function decider(): BelongsTo
    {
        return $this->belongsTo(User::class, 'decided_by');
    }

    /**
     * Sesi masih "terbuka" — wave-nya terkunci dan hasil hitung masih bisa
     * berubah: OPEN, IN_PROGRESS, menunggu approval, dan sedang revisi.
     * APPROVED / COMPLETED (legacy) / CANCELLED adalah keputusan final.
     */
    public function isOpen(): bool
    {
        return in_array($this->status, self::OPEN_STATUSES, true);
    }

    /**
     * Hasil hitung boleh diubah hanya saat sesi berjalan atau sedang revisi.
     */
    public function acceptsCounting(): bool
    {
        return in_array($this->status, [self::STATUS_IN_PROGRESS, self::STATUS_REVISI], true);
    }

    /**
     * Semua baris sudah dihitung — syarat kirim sesi.
     */
    public function unverifiedCount(): int
    {
        return $this->items()->whereNull('verified_at')->count();
    }
}
