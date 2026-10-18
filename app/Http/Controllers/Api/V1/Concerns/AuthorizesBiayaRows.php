<?php

namespace App\Http\Controllers\Api\V1\Concerns;

use App\Models\ApprovalAssignment;
use App\Models\User;
use Illuminate\Support\Facades\Auth;

/**
 * Otorisasi baris Biaya (THL & Retribusi) yang berbagi aturan sama:
 * admin/pemilik penuh, peran pengaju se-depo, dan approver yang ditetapkan.
 * Perbedaan antar modul disuntikkan lewat parameter (module & permission).
 */
trait AuthorizesBiayaRows
{
    /**
     * Boleh melihat: admin master, peran pengaju, pembuat, atau approver
     * (BAC/RLH/RFAH) yang ditetapkan untuk depo pengajuan.
     */
    protected function authorizeBiayaRowViewer(object $row, string $module, bool $allowAdminRole = false): void
    {
        /** @var User|null $user */
        $user = Auth::user();
        if (! $user) {
            abort(403);
        }

        if ($user->isAdminMaster() || ($allowAdminRole && $user->hasRole('admin_master')) || $row->created_by === $user->id) {
            return;
        }

        // Peran pengaju hanya boleh melihat data depo-nya sendiri.
        if (($user->hasRole('blc') || $user->hasRole('staff_logistic'))
            && $user->canAccessDepotRow($row->kode_depo, $row->nama_depo)) {
            return;
        }

        $assigned = ApprovalAssignment::query()
            ->where('module', $module)
            ->where('user_id', $user->id)
            ->whereIn('approval_level', ['BAC', 'RLH', 'RFAH'])
            ->where('is_active', true)
            ->where(function ($query) use ($row): void {
                $query->where('kode_depo', $row->kode_depo)
                    ->orWhere('kode_depo', 'ADMIN');
            })
            ->exists();

        abort_unless($assigned, 403, 'Anda bukan approver yang ditetapkan untuk pengajuan ini.');
    }

    /**
     * Boleh mengubah/menghapus: admin master, pembuat, atau peran pengaju /
     * pemegang kendali penuh — dibatasi ke depo-nya sendiri (cegah IDOR).
     */
    protected function authorizeBiayaRowCreator(object $row, string $permission): void
    {
        /** @var User|null $user */
        $user = Auth::user();
        if (! $user) {
            abort(403);
        }

        if ($user->isAdminMaster() || $row->created_by === $user->id) {
            return;
        }

        $canManage = $user->hasRole('blc')
            || $user->hasRole('staff_logistic')
            || $user->hasPermission($permission);

        abort_unless(
            $canManage && $user->canAccessDepotRow($row->kode_depo, $row->nama_depo),
            403,
            'Anda tidak memiliki izin untuk mengubah data ini.'
        );
    }
}
