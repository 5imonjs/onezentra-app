<?php

namespace App\Models;

use App\Models\Concerns\HasDepotScope;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;

class BiayaThl extends Model
{
    use HasDepotScope;
    use HasFactory;

    protected $table = 'biaya_thls';

    protected $fillable = [
        'tanggal_pengajuan', 'kode_depo', 'nama_depo',
        'no_kendaraan', 'type_kendaraan', 'no_surat_jalan',
        'kubikasi_base', 'nominal_biaya', 'is_rfah_required', 'rfah_name',
        'approval_pengajuan', 'approval_pengajuan_level', 'created_by', 'status',
        'submitted_by', 'submitted_at', 'checked_by', 'checked_at',
        'rlh_approved_by', 'rlh_approved_at',
        'approved_by', 'approved_at',
        'rejected_by', 'rejected_at', 'rejection_reason',
        'revised_by', 'revised_at', 'revisi_reason',
        'resubmitted_by', 'resubmitted_at',
        'revision_return_status',
    ];

    protected function casts(): array
    {
        return [
            'tanggal_pengajuan' => 'date',
            'kubikasi_base' => 'decimal:2',
            'nominal_biaya' => 'decimal:2',
            'is_rfah_required' => 'boolean',
            'submitted_by' => 'integer', 'submitted_at' => 'datetime',
            'checked_by' => 'integer', 'checked_at' => 'datetime',
            'rlh_approved_by' => 'integer', 'rlh_approved_at' => 'datetime',
            'approved_by' => 'integer', 'approved_at' => 'datetime',
            'rejected_by' => 'integer', 'rejected_at' => 'datetime',
            'revised_by' => 'integer', 'revised_at' => 'datetime',
            'resubmitted_by' => 'integer', 'resubmitted_at' => 'datetime',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }

    public function details(): HasMany
    {
        return $this->hasMany(BiayaThlDetail::class)->orderBy('order');
    }

    public function approvalHistories(): MorphMany
    {
        return $this->morphMany(ApprovalHistory::class, 'subject')->orderBy('id');
    }

    public function photos(): HasMany
    {
        return $this->hasMany(BiayaThlPhoto::class)->orderBy('order');
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function checkedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'checked_by');
    }

    public function submittedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'submitted_by');
    }

    public function rlhApprovedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'rlh_approved_by');
    }

    public function rejectedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'rejected_by');
    }

    public function approvedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function revisedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'revised_by');
    }

    public function resubmittedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'resubmitted_by');
    }

    public function biayaRetribusiDetail(): BelongsTo
    {
        return $this->belongsTo(BiayaRetribusiDetail::class);
    }
}
