<?php

namespace App\Services\Biaya;

use App\Models\BiayaThlDetail;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

/**
 * Validasi payload pengajuan Biaya THL (draft & lengkap), termasuk aturan
 * silang antar-baris (posisi, durasi kerja, kepemilikan id baris, batas foto).
 */
class BiayaThlValidator
{
    /**
     * @return array<string, mixed>
     */
    public function validate(Request $request, bool $isUpdate = false, ?int $parentId = null): array
    {
        // Mode draft (is_draft=true): simpan apa adanya tanpa syarat lengkap.
        // Kelengkapan diverifikasi saat submit (BiayaApprovalService::submit).
        if ($request->boolean('is_draft')) {
            return Validator::make($request->all(), [
                'tanggal_pengajuan' => 'nullable|date',
                'details' => 'nullable|array|max:20',
                'details.*.id' => 'nullable|integer|exists:biaya_thl_details,id',
                'details.*.no_surat_jalan' => 'nullable|string|max:50',
                'details.*.nama_thl' => 'nullable|string|max:150',
                'details.*.driver_name' => 'nullable|string|max:150',
                'details.*.nopol_kendaraan' => 'nullable|string|max:20',
                'details.*.type_kendaraan' => 'nullable|string|max:50',
                'details.*.nominal_biaya' => 'nullable|numeric|min:0',
                'details.*.kubikasi' => 'nullable|numeric|min:0',
                'details.*.droppoint' => 'nullable|string|max:100',
                'details.*.posisi' => 'nullable|string|max:50',
                'details.*.jam_datang' => 'nullable|date',
                'details.*.jam_pulang' => 'nullable|date',
                'details.*.kendaraan_tambahan' => 'nullable|boolean',
                'details.*.kendaraan_sj' => 'nullable|string|max:50',
                'details.*.kendaraan_nopol' => 'nullable|string|max:20',
                'details.*.kendaraan_type' => 'nullable|string|max:50',
                'details.*.order' => 'nullable|integer',
                'details.*.photos' => 'nullable|array|max:1',
                'details.*.photos.*' => 'image|mimes:jpg,jpeg,png|max:2048',
                'details.*.photos_remove' => 'nullable|array',
                'details.*.photos_remove.*' => 'integer',
                // Kendaraan tambahan N per detail (opsional). Jika ada, tiap baris
                // wajib sj, nopol, type. Legacy single fields dibawah tetap
                // diterima sebagai fallback.
                'details.*.kendaraan' => 'nullable|array',
                'details.*.kendaraan.*.sj' => 'nullable|string|max:50',
                'details.*.kendaraan.*.nopol' => 'nullable|string|max:20',
                'details.*.kendaraan.*.type' => 'nullable|string|max:50',
            ])->validate();
        }

        $rules = [
            'tanggal_pengajuan' => 'required|date',
            'biaya_retribusi_detail_id' => 'nullable|exists:biaya_retribusi_details,id',
            'kubikasi_base' => 'nullable|numeric|min:0',
            'details' => 'required|array|min:1|max:20',
            'details.*.id' => 'nullable|integer|exists:biaya_thl_details,id',
            'details.*.no_surat_jalan' => 'nullable|string|max:50',
            'details.*.nama_thl' => 'required|string|max:150',
            'details.*.driver_name' => 'nullable|string|max:150',
            // Dokumentasi: plat + type per baris untuk SEMUA posisi,
            // termasuk THL GUDANG.
            'details.*.nopol_kendaraan' => 'required|string|max:20',
            'details.*.type_kendaraan' => 'required|string|max:50',
            'details.*.nominal_biaya' => 'required|numeric|min:1',
            'details.*.kubikasi' => 'nullable|numeric|min:0',
            'details.*.droppoint' => 'nullable|string|max:100',
            'details.*.posisi' => 'required|string|in:THL HELPER,THL DRIVER,THL GUDANG',
            'details.*.jam_datang' => 'nullable|date',
            'details.*.jam_pulang' => 'nullable|date',
            'details.*.kendaraan_tambahan' => 'nullable|boolean',
            'details.*.kendaraan_sj' => 'nullable|string|max:50',
            'details.*.kendaraan_nopol' => 'nullable|string|max:20',
            'details.*.kendaraan_type' => 'nullable|string|max:50',
            'details.*.order' => 'nullable|integer',
            'details.*.photos' => 'nullable|array|max:1',
            'details.*.photos.*' => 'image|mimes:jpg,jpeg,png|max:2048',
            'details.*.kendaraan' => 'nullable|array',
            'details.*.kendaraan.*.sj' => 'nullable|string|max:50',
            'details.*.kendaraan.*.nopol' => 'nullable|string|max:20',
            'details.*.kendaraan.*.type' => 'nullable|string|max:50',
        ];

        if ($isUpdate) {
            $rules['details.*.photos_remove'] = 'nullable|array';
            $rules['details.*.photos_remove.*'] = 'integer';
        }

        $validator = Validator::make($request->all(), $rules);
        $validator->after(function ($validator) use ($request, $isUpdate, $parentId): void {
            foreach ($request->input('details', []) as $index => $detail) {
                $position = strtoupper(trim((string) ($detail['posisi'] ?? '')));
                if (in_array($position, ['THL HELPER', 'THL DRIVER'], true)) {
                    foreach (['no_surat_jalan', 'driver_name', 'kubikasi', 'droppoint', 'jam_datang', 'jam_pulang'] as $field) {
                        if (blank($detail[$field] ?? null)) {
                            $validator->errors()->add(
                                "details.{$index}.{$field}",
                                "{$field} wajib diisi untuk posisi {$position}."
                            );
                        }
                    }
                }

                if (! empty($detail['jam_datang'] ?? null) && ! empty($detail['jam_pulang'] ?? null)
                    && $detail['jam_pulang'] <= $detail['jam_datang']) {
                    $validator->errors()->add(
                        "details.{$index}.jam_pulang",
                        'Jam Pulang harus setelah Jam Datang.'
                    );
                }

                // Paritas dengan FE (getMissingFields): durasi kerja maksimal 18 jam.
                if (! empty($detail['jam_datang'] ?? null) && ! empty($detail['jam_pulang'] ?? null)
                    && $detail['jam_pulang'] > $detail['jam_datang']) {
                    $datang = strtotime((string) $detail['jam_datang']);
                    $pulang = strtotime((string) $detail['jam_pulang']);
                    if ($datang && $pulang && ($pulang - $datang) > 18 * 3600) {
                        $validator->errors()->add(
                            "details.{$index}.jam_pulang",
                            'Durasi kerja melebihi 18 jam — periksa kembali jam datang/pulang.'
                        );
                    }
                }

                // ID baris harus milik pengajuan yang sedang diedit (anti-id asing).
                if ($isUpdate && $parentId && ! empty($detail['id'])) {
                    $owned = BiayaThlDetail::whereKey((int) $detail['id'])
                        ->where('biaya_thl_id', $parentId)
                        ->exists();
                    if (! $owned) {
                        $validator->errors()->add(
                            "details.{$index}.id",
                            'ID baris tidak dikenal pada pengajuan ini.'
                        );
                    }
                }

                if ($position === 'THL GUDANG') {
                    foreach (['jam_datang', 'jam_pulang'] as $field) {
                        if (blank($detail[$field] ?? null)) {
                            $validator->errors()->add(
                                "details.{$index}.{$field}",
                                "{$field} wajib diisi untuk posisi {$position}."
                            );
                        }
                    }
                }

                if ($position === 'THL GUDANG') {
                    // Kendaraan tambahan: dukung N per detail via `kendaraan` array.
                    // Jika array `kendaraan` ada dan non-kosong, validasi tiap baris.
                    $vehicles = $detail['kendaraan'] ?? [];
                    if (! empty($vehicles)) {
                        foreach ($vehicles as $vIndex => $vehicle) {
                            foreach (['sj', 'nopol', 'type'] as $field) {
                                if (blank($vehicle[$field] ?? null)) {
                                    $validator->errors()->add(
                                        "details.{$index}.kendaraan.{$vIndex}.{$field}",
                                        "Kendaraan ke-{$vIndex}: {$field} wajib diisi untuk kendaraan tambahan."
                                    );
                                }
                            }
                        }
                    }
                    // Legacy fallback: `kendaraan_tambahan` + `kendaraan_sj/nopol/type`
                    // hanya divalidasi bila `kendaraan` array tidak disediakan.
                    elseif (filter_var($detail['kendaraan_tambahan'] ?? false, FILTER_VALIDATE_BOOLEAN)) {
                        foreach (['kendaraan_sj', 'kendaraan_nopol', 'kendaraan_type'] as $field) {
                            if (blank($detail[$field] ?? null)) {
                                $validator->errors()->add(
                                    "details.{$index}.{$field}",
                                    "{$field} wajib diisi untuk kendaraan tambahan."
                                );
                            }
                        }
                    }
                }

                // SJ sama antar-baris sah (multi-pekerja 1 SJ/truk) — cek
                // duplikat hanya berlaku antar-GRUP di frontend (groupId),
                // bukan antar-baris, sehingga backend tidak menolaknya.

                // Batas 1 foto per baris: tolak bila foto tersimpan + unggahan baru > 1.
                if ($isUpdate && ! empty($detail['id'])) {
                    $row = BiayaThlDetail::whereKey((int) $detail['id'])->first();
                    if ($row) {
                        $remove = $detail['photos_remove'] ?? [];
                        $kept = $row->photos()->whereNotIn('id', array_map('intval', (array) $remove))->count();
                        $uploads = $request->file("details.{$index}.photos", []);
                        $newCount = is_array($uploads) ? count($uploads) : 1;
                        if ($kept + $newCount > 1) {
                            $validator->errors()->add(
                                "details.{$index}.photos",
                                'Maksimal 1 foto bukti per baris — hapus foto lama sebelum mengunggah yang baru.'
                            );
                        }
                    }
                }
            }
        });

        return $validator->validate();
    }
}
