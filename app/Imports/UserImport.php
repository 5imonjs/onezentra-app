<?php

namespace App\Imports;

use App\Models\Role;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Maatwebsite\Excel\Concerns\ToCollection;
use Maatwebsite\Excel\Concerns\WithHeadingRow;

class UserImport implements ToCollection, WithHeadingRow
{
    public int $imported = 0;

    public int $updated = 0;

    public array $errors = [];

    public int $totalRows = 0;

    public function __construct(private readonly User $actor) {}

    public function collection(Collection $rows): void
    {
        foreach ($rows as $index => $row) {
            $this->totalRows++;
            $rowNumber = $index + 2;
            $data = [
                'email' => trim((string) ($row['email'] ?? $row['noemail'] ?? $row['email_address'] ?? '')),
                'full_name' => trim((string) ($row['nama'] ?? $row['name'] ?? $row['full_name'] ?? '')),
                'level' => trim((string) ($row['level'] ?? $row['role'] ?? $row['level_akses'] ?? '')),
                'kode_depo' => trim((string) ($row['depo'] ?? $row['kode_depo'] ?? $row['depot'] ?? '')),
                'nama_depo' => trim((string) ($row['nama_depo'] ?? $row['nama_depot'] ?? '')),
                'alamat' => trim((string) ($row['alamat'] ?? $row['address'] ?? '')),
                'status' => trim((string) ($row['status'] ?? 'active')),
            ];

            if ($data['email'] === '' || filter_var($data['email'], FILTER_VALIDATE_EMAIL) === false) {
                $this->errors[] = ['row' => $rowNumber, 'errors' => 'Email wajib diisi dengan format valid'];

                continue;
            }

            if (mb_strlen($data['full_name']) > 100 || mb_strlen($data['kode_depo']) > 20 || mb_strlen($data['nama_depo']) > 100 || mb_strlen($data['alamat']) > 2000) {
                $this->errors[] = ['row' => $rowNumber, 'errors' => 'Nama/kode depo/alamat melebihi batas panjang'];

                continue;
            }

            if ($data['level'] !== '' && ! in_array($data['level'], Role::LEVEL_SLUGS, true)) {
                $this->errors[] = ['row' => $rowNumber, 'errors' => "Level \"{$data['level']}\" tidak valid"];

                continue;
            }

            if (! in_array($data['status'], ['active', 'inactive'], true)) {
                $this->errors[] = ['row' => $rowNumber, 'errors' => 'Status harus active atau inactive'];

                continue;
            }

            if ($data['level'] === 'admin_master' && ! $this->actor->isAdminMaster()) {
                $this->errors[] = ['row' => $rowNumber, 'errors' => 'Hanya admin master yang dapat menetapkan level admin master'];

                continue;
            }

            $user = User::where('email', $data['email'])->first();

            if ($user) {
                // Proteksi jalur update: target di luar depo aktor tidak boleh
                // disentuh, dan akun admin_master hanya boleh diubah admin master.
                if (! $this->actor->canAccessDepotRow($user->kode_depo, $user->nama_depo)) {
                    $this->errors[] = ['row' => $rowNumber, 'errors' => 'User berada di luar depo Anda'];

                    continue;
                }

                if ($user->isAdminMaster() && ! $this->actor->isAdminMaster()) {
                    $this->errors[] = ['row' => $rowNumber, 'errors' => 'Hanya admin master yang dapat mengubah akun admin master'];

                    continue;
                }

                // Samakan guard dengan UserController::update: perubahan
                // level/status akun hanya admin master. Aktor lain: field itu
                // diabaikan (bukan ditolak barisnya) + dicatat sebagai audit.
                $skipped = [];
                if (! $this->actor->isAdminMaster()) {
                    if ($data['level'] !== '' && $data['level'] !== $user->level) {
                        $skipped[] = 'level';
                        $data['level'] = '';
                    }
                    if ($data['status'] !== $user->status) {
                        $skipped[] = 'status';
                        $data['status'] = $user->status;
                    }
                }

                $data = $this->actor->depotAttributes($data);
                $user->update(array_filter([
                    'full_name' => $data['full_name'] ?: null,
                    'kode_depo' => $data['kode_depo'] ?: null,
                    'nama_depo' => $data['nama_depo'] ?: null,
                    'alamat' => $data['alamat'] ?: null,
                    'level' => $data['level'] ?: null,
                    'status' => $data['status'],
                ], static fn ($value) => $value !== null));
                $user->forceFill(['updated_by' => $this->actor->id])->saveQuietly();
                $this->syncRole($user, $data['level']);
                User::clearPermissionCache($user->id);
                if ($skipped !== []) {
                    $this->errors[] = ['row' => $rowNumber, 'errors' => 'Kolom diabaikan (hanya admin master yang boleh mengubah): '.implode(', ', $skipped)];
                }
                $this->updated++;

                continue;
            }

            $level = $data['level'] ?: 'staff_logistic';
            $data = $this->actor->depotAttributes($data);

            $user = User::create([
                ...$data,
                'level' => $level,
                'full_name' => $data['full_name'] ?: 'User Baru',
                'password' => Hash::make(Str::random(16)),
            ]);
            $user->forceFill(['updated_by' => $this->actor->id])->saveQuietly();
            $this->syncRole($user, $level);
            $this->imported++;
        }
    }

    private function syncRole(User $user, string $level): void
    {
        if ($level === '') {
            return;
        }

        $role = Role::where('slug', $level)->first();
        if ($role) {
            $user->roles()->sync([$role->id]);
            // forceFill: 'role_id' sengaja tidak fillable (lihat User::$fillable),
            // jadi kolom legacy ini hanya boleh ditulis lewat jalur eksplisit.
            $user->forceFill(['role_id' => $role->id])->save();
        }
    }
}
