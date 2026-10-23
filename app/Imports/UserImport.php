<?php

namespace App\Imports;

use App\Models\DepotSetting;
use App\Models\Region;
use App\Models\Role;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
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
            $this->importRow(collect($row), $index + 2);
        }
    }

    /**
     * @param  Collection<string, mixed>  $row
     */
    private function importRow(Collection $row, int $rowNumber): void
    {
        $email = trim((string) ($row['email'] ?? $row['noemail'] ?? $row['email_address'] ?? ''));
        if ($email === '' || mb_strlen($email) > 255 || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
            $this->addError($rowNumber, 'Email wajib diisi dengan format valid');

            return;
        }

        $fullName = trim((string) ($row['nama'] ?? $row['name'] ?? $row['full_name'] ?? ''));
        $alamat = trim((string) ($row['alamat'] ?? $row['address'] ?? ''));
        $primaryDepotCode = trim((string) ($row['depo'] ?? $row['kode_depo'] ?? $row['depot'] ?? ''));
        $depotName = trim((string) ($row['nama_depo'] ?? $row['nama_depot'] ?? ''));
        $requestedRegion = trim((string) ($row['region_id'] ?? ''));
        $regionWasProvided = $row->has('region_id') && $requestedRegion !== '';
        if ($regionWasProvided && ! Region::where('code', $requestedRegion)->exists()) {
            $this->addError($rowNumber, "Region \"{$requestedRegion}\" tidak ditemukan");

            return;
        }
        $hasDepotCodesColumn = $row->has('depot_codes');
        $depotCodesInput = $row->get('depot_codes') ?: $primaryDepotCode;
        $depotCodes = $this->parseDepotCodes($depotCodesInput);
        $hasDepotAssignments = $hasDepotCodesColumn || $primaryDepotCode !== '';
        $requestedLevel = trim((string) ($row['level'] ?? $row['role'] ?? $row['level_akses'] ?? ''));
        $requestedStatus = trim((string) ($row['status'] ?? ''));

        if (mb_strlen($fullName) > 100 || mb_strlen($primaryDepotCode) > 20
            || mb_strlen($depotName) > 100 || mb_strlen($alamat) > 2000
            || mb_strlen($requestedRegion) > 20
        ) {
            $this->addError($rowNumber, 'Nama/kode depo/region/alamat melebihi batas panjang');

            return;
        }

        $user = User::where('email', $email)->first();
        if ($user && ! $this->actor->canAccessDepotRow($user->kode_depo, $user->nama_depo)) {
            $this->addError($rowNumber, 'User berada di luar depo Anda');

            return;
        }

        if ($user?->isAdminMaster() && ! $this->actor->isAdminMaster()) {
            $this->addError($rowNumber, 'Hanya admin master yang dapat mengubah akun admin master');

            return;
        }

        $level = $requestedLevel !== ''
            ? $requestedLevel
            : ($user?->level ?? 'staff_logistic');
        $role = Role::where('slug', $level)->first();
        if ($role === null && ! in_array($level, Role::LEVEL_SLUGS, true)) {
            $this->addError($rowNumber, "Role \"{$level}\" tidak ditemukan");

            return;
        }

        if ($role !== null && ! $role->is_active && ($user === null || $user->level !== $level)) {
            $this->addError($rowNumber, "Role \"{$level}\" tidak aktif");

            return;
        }

        if ($level === 'admin_master' && ! $this->actor->isAdminMaster()) {
            $this->addError($rowNumber, 'Hanya admin master yang dapat menetapkan level admin master');

            return;
        }

        $status = $requestedStatus !== '' ? $requestedStatus : ($user?->status ?? 'active');
        if (! in_array($status, ['active', 'inactive'], true)) {
            $this->addError($rowNumber, 'Status harus active atau inactive');

            return;
        }

        $skipped = [];
        if ($user !== null && ! $this->actor->isAdminMaster()) {
            if ($requestedLevel !== '' && $requestedLevel !== $user->level) {
                $skipped[] = 'level';
                $level = $user->level;
                $role = Role::where('slug', $level)->first();
            }
            if ($requestedStatus !== '' && $requestedStatus !== $user->status) {
                $skipped[] = 'status';
                $status = $user->status;
            }
            if ($regionWasProvided && $requestedRegion !== $user->region_id) {
                $skipped[] = 'region_id';
                $requestedRegion = (string) ($user->region_id ?? '');
            }
        }

        if ($user !== null && ! $this->actor->isAdminMaster() && $user->level !== $level) {
            $this->addError($rowNumber, 'Role user tidak dapat diubah oleh aktor ini');

            return;
        }

        if ($role === null && ! in_array($level, Role::LEVEL_SLUGS, true)) {
            $this->addError($rowNumber, 'Role user yang sedang digunakan tidak ditemukan');

            return;
        }

        if ($user === null && $this->actor->isDepotScoped()) {
            $requestedRegion = (string) ($this->actor->region_id ?? '');
            $regionWasProvided = $requestedRegion !== '';
        } elseif ($user !== null && ! $this->actor->isAdminMaster()) {
            $requestedRegion = (string) ($user->region_id ?? '');
            $regionWasProvided = $requestedRegion !== '';
        }

        if ($user !== null && $regionWasProvided && $requestedRegion !== $user->region_id
            && ! $hasDepotAssignments
        ) {
            $hasDepotAssignments = true;
            $depotCodes = [];
        }

        $targetRegion = $regionWasProvided
            ? $requestedRegion
            : ($user?->region_id);
        $depotAssignments = null;
        if ($hasDepotAssignments) {
            $depotAssignments = $this->resolveDepotAssignments(
                $depotCodes,
                $targetRegion,
                $rowNumber
            );
            if ($depotAssignments === null) {
                return;
            }

            if ($this->actor->isDepotScoped()) {
                $outsideActorScope = array_diff($depotCodes, $this->actor->depot_codes);
                if ($outsideActorScope !== []) {
                    $this->addError($rowNumber, 'Anda tidak berwenang menetapkan depo di luar cakupan Anda');

                    return;
                }
            }
        }

        $resolvedRegion = $targetRegion;
        if ($depotAssignments !== null && $depotAssignments->isNotEmpty()) {
            $resolvedRegion = $depotAssignments->first()->region_id;
        }
        $regionWasResolvedFromAssignments = ! blank($resolvedRegion)
            && $resolvedRegion !== $targetRegion;

        if ($primaryDepotCode === 'ADMIN' && $level === 'admin_master'
            && ($depotAssignments === null || $depotAssignments->isEmpty())
        ) {
            $primaryDepotCode = 'ADMIN';
        } elseif ($depotAssignments !== null) {
            $primaryDepot = $depotAssignments->first();
            $primaryDepotCode = $primaryDepot?->kode_depo ?? '';
            $depotName = $primaryDepot?->nama_depo ?? '';
        }

        if ($user !== null && ! $this->actor->isAdminMaster()) {
            $attributes = [
                'full_name' => $fullName,
                'alamat' => $alamat,
            ];
            $attributes = array_filter($attributes, static fn (string $value): bool => $value !== '');
        } else {
            $attributes = array_filter([
                'full_name' => $fullName,
                'alamat' => $alamat,
                'level' => $level,
                'status' => $status,
                'region_id' => $regionWasProvided
                    || $user === null
                    || ($hasDepotAssignments && $regionWasResolvedFromAssignments)
                    ? ($resolvedRegion ?: null)
                    : null,
            ], static fn (?string $value): bool => $value !== null && $value !== '');
        }

        if ($depotAssignments !== null) {
            $attributes['kode_depo'] = $primaryDepotCode;
            $attributes['nama_depo'] = $depotName;
        } elseif ($user === null && $primaryDepotCode !== 'ADMIN') {
            $attributes['kode_depo'] = $primaryDepotCode;
            $attributes['nama_depo'] = $depotName;
        }

        if ($user === null) {
            $attributes['email'] = $email;
            $attributes['password'] = Hash::make(Str::random(16));
            $attributes['status'] ??= 'active';
            $attributes['level'] ??= $level;
            if (! array_key_exists('kode_depo', $attributes)) {
                $attributes['kode_depo'] = '';
                $attributes['nama_depo'] = '';
            }
            $attributes = $this->actor->depotAttributes($attributes);
        }

        DB::transaction(function () use ($user, $attributes, $role, $depotAssignments): void {
            $target = $user ?? User::create($attributes);
            if ($user !== null) {
                $target->update($attributes);
            }

            if ($role !== null && ($user === null || array_key_exists('level', $attributes))) {
                $target->roles()->sync([$role->id]);
                $target->forceFill(['role_id' => $role->id])->save();
            }

            if ($depotAssignments !== null) {
                DB::table('user_depots')->where('user_id', $target->id)->delete();
                if ($depotAssignments->isNotEmpty()) {
                    DB::table('user_depots')->insert(
                        $depotAssignments->map(fn (DepotSetting $depot): array => [
                            'user_id' => $target->id,
                            'kode_depo' => $depot->kode_depo,
                            'assigned_at' => now(),
                        ])->all()
                    );
                }
            }

            $target->forceFill(['updated_by' => $this->actor->id])->saveQuietly();
            User::clearPermissionCache($target->id);
        });

        if ($skipped !== []) {
            $this->addError(
                $rowNumber,
                'Kolom diabaikan (hanya admin master yang boleh mengubah): '.implode(', ', $skipped)
            );
        }

        if ($user === null) {
            $this->imported++;
        } else {
            $this->updated++;
        }
    }

    /**
     * @param  array<int, string>  $depotCodes
     * @return Collection<int, DepotSetting>|null
     */
    private function resolveDepotAssignments(array $depotCodes, ?string $regionId, int $rowNumber): ?Collection
    {
        if ($depotCodes === []) {
            return collect();
        }

        $depots = DepotSetting::query()
            ->whereIn('kode_depo', $depotCodes)
            ->where('is_active', true)
            ->get(['kode_depo', 'nama_depo', 'region_id']);
        $invalidCodes = array_diff($depotCodes, $depots->pluck('kode_depo')->all());
        if ($invalidCodes !== []) {
            $this->addError(
                $rowNumber,
                'Depo berikut tidak valid atau tidak aktif: '.implode(', ', $invalidCodes)
            );

            return null;
        }

        $regions = $depots->pluck('region_id')->unique();
        if ($regions->count() > 1 || ($regionId !== null && $depots->contains(
            fn (DepotSetting $depot): bool => $depot->region_id !== $regionId
        ))) {
            $this->addError(
                $rowNumber,
                'Semua depo yang dipilih harus berasal dari region user.'
            );

            return null;
        }

        return $depots;
    }

    /**
     * @return array<int, string>
     */
    private function parseDepotCodes(mixed $value): array
    {
        $values = is_array($value) ? $value : preg_split('/[,;|]+/', (string) $value);

        return collect($values ?: [])
            ->map(static fn (mixed $code): string => trim((string) $code))
            ->filter()
            ->unique()
            ->values()
            ->all();
    }

    private function addError(int $rowNumber, string $message): void
    {
        $this->errors[] = ['row' => $rowNumber, 'errors' => $message];
    }
}
