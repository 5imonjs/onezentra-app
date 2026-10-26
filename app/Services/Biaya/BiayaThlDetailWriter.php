<?php

namespace App\Services\Biaya;

use App\Models\BiayaThl;
use App\Support\EvidenceStorage;

/**
 * Penulisan detail Biaya THL beserta kendaraan tambahan & foto bukti.
 */
class BiayaThlDetailWriter
{
    /**
     * Buat seluruh baris detail untuk pengajuan baru.
     *
     * @param  array<int, array<string, mixed>>  $details
     */
    public function store(BiayaThl $biayaThl, array $details): void
    {
        foreach ($details as $index => $detail) {
            $detailPhotos = $detail['photos'] ?? [];
            $vehicles = $detail['kendaraan'] ?? [];
            unset($detail['photos'], $detail['photos_remove'], $detail['kendaraan']);

            $savedDetail = $biayaThl->details()->create(array_merge($detail, [
                'order' => $index,
                'nominal_biaya' => $detail['nominal_biaya'],
            ]));

            // Simpan kendaraan tambahan (N per detail) — mirror [0] ke legacy
            // supaya frontend lama/export/validasi tetap jalan.
            if (! empty($vehicles)) {
                foreach ($vehicles as $vIndex => $vehicle) {
                    $savedDetail->vehicles()->create([
                        'no_sj' => $vehicle['sj'] ?? null,
                        'nopol' => $vehicle['nopol'] ?? null,
                        'type' => $vehicle['type'] ?? null,
                        'order' => $vIndex,
                    ]);
                }
                // Mirror kendaraan pertama ke kolom legacy (backward compat)
                $first = $vehicles[0];
                $savedDetail->update([
                    'kendaraan_tambahan' => true,
                    'kendaraan_sj' => $first['sj'] ?? null,
                    'kendaraan_nopol' => $first['nopol'] ?? null,
                    'kendaraan_type' => $first['type'] ?? null,
                ]);
            }

            foreach ($detailPhotos as $photoIndex => $photo) {
                $path = EvidenceStorage::putFile($photo, "biaya_thl/{$biayaThl->id}/detail_{$savedDetail->id}");
                $savedDetail->photos()->create([
                    'biaya_thl_id' => $biayaThl->id,
                    'file_path' => $path,
                    'file_name' => $photo->getClientOriginalName(),
                    'mime_type' => $photo->getMimeType(),
                    'file_size' => $photo->getSize(),
                    'order' => $photoIndex,
                ]);
            }
        }
    }

    /**
     * Sinkronisasi detail per baris (bukan hapus-semua-buat-ulang) agar foto
     * yang sudah ada tidak hilang saat edit: baris dikenali via id, foto yang
     * dicentang hapus dibuang dari storage + DB, file baru disimpan.
     *
     * @param  array<int, array<string, mixed>>  $details
     */
    public function sync(BiayaThl $biayaThl, array $details): void
    {
        $existingIds = $biayaThl->details()->pluck('id')->all();
        $keptIds = [];

        foreach ($details as $index => $detail) {
            $detailId = isset($detail['id']) ? (int) $detail['id'] : null;
            $row = null;
            if ($detailId && in_array($detailId, $existingIds, true)) {
                $row = $biayaThl->details()->whereKey($detailId)->first();
                $payload = $detail;
                unset($payload['id'], $payload['photos'], $payload['photos_remove'], $payload['kendaraan']);
                $payload['order'] = $index;
                $row->update($payload);
                $keptIds[] = $detailId;
            } else {
                $payload = $detail;
                unset($payload['id'], $payload['photos'], $payload['photos_remove'], $payload['kendaraan']);
                $payload['order'] = $index;
                $payload['nominal_biaya'] = $detail['nominal_biaya'];
                $row = $biayaThl->details()->create($payload);
                $keptIds[] = $row->id;
            }

            // Sinkron kendaraan tambahan (N per detail): hapus lama, create ulang
            // bila array `kendaraan` disediakan. Mirror [0] ke legacy.
            $vehicles = $detail['kendaraan'] ?? [];
            if (! empty($vehicles)) {
                $row->vehicles()->delete();
                foreach ($vehicles as $vIndex => $vehicle) {
                    $row->vehicles()->create([
                        'no_sj' => $vehicle['sj'] ?? null,
                        'nopol' => $vehicle['nopol'] ?? null,
                        'type' => $vehicle['type'] ?? null,
                        'order' => $vIndex,
                    ]);
                }
                $first = $vehicles[0];
                $row->update([
                    'kendaraan_tambahan' => true,
                    'kendaraan_sj' => $first['sj'] ?? null,
                    'kendaraan_nopol' => $first['nopol'] ?? null,
                    'kendaraan_type' => $first['type'] ?? null,
                ]);
            } else {
                // Array kosong / tidak dikirim → hapus vehicles + reset legacy
                // Hanya reset legacy bila tidak ada `kendaraan_sj/nopol/type` di payload
                // (agar fitur edit/draft tetap bisa menyimpan data lama).
                $hasLegacy = ! empty($detail['kendaraan_sj'] ?? null) || ! empty($detail['kendaraan_nopol'] ?? null) || ! empty($detail['kendaraan_type'] ?? null);
                $row->vehicles()->delete();
                if ($hasLegacy) {
                    // Simpan legacy fields sebagai row tunggal (backward compat)
                    $row->update([
                        'kendaraan_tambahan' => false,
                        'kendaraan_sj' => $detail['kendaraan_sj'] ?? null,
                        'kendaraan_nopol' => $detail['kendaraan_nopol'] ?? null,
                        'kendaraan_type' => $detail['kendaraan_type'] ?? null,
                    ]);
                } else {
                    $row->update([
                        'kendaraan_tambahan' => false,
                        'kendaraan_sj' => null,
                        'kendaraan_nopol' => null,
                        'kendaraan_type' => null,
                    ]);
                }
            }

            foreach ($detail['photos_remove'] ?? [] as $photoId) {
                $photo = $row->photos()->whereKey((int) $photoId)->first();
                if ($photo) {
                    EvidenceStorage::delete($photo->file_path);
                    $photo->delete();
                }
            }

            foreach ($detail['photos'] ?? [] as $photoIndex => $photo) {
                $path = EvidenceStorage::putFile($photo, "biaya_thl/{$biayaThl->id}/detail_{$row->id}");
                $row->photos()->create([
                    'biaya_thl_id' => $biayaThl->id,
                    'file_path' => $path,
                    'file_name' => $photo->getClientOriginalName(),
                    'mime_type' => $photo->getMimeType(),
                    'file_size' => $photo->getSize(),
                    'order' => $photoIndex,
                ]);
            }
        }

        // Baris yang tidak dikirim lagi = dihapus pengguna: bersihkan file-nya
        // agar tidak yatim di storage (cascade DB tidak menghapus file).
        $stale = $biayaThl->details()->whereNotIn('id', $keptIds)->with('photos')->get();
        foreach ($stale as $row) {
            foreach ($row->photos as $photo) {
                EvidenceStorage::delete($photo->file_path);
            }
            $row->delete();
        }
    }
}
