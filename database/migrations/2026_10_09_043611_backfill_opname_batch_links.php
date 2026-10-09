<?php

use App\Models\OpnameExpiredSessionItem;
use App\Models\OpnameExpiredWave;
use App\Services\OpnameExpiredService;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    /**
     * Perbaiki jejak data dari bug lama `ReceivingItem::batch()`: relasi dulu
     * membandingkan `batches.sj_validation_item_id` dengan `receiving_items.id`
     * (local key default), sehingga baris hasil validasi SJ selalu terlihat
     * tanpa label. Dua jejaknya:
     *
     * - `opname_expired_waves.batch_numbers` kosong padahal sumbernya berlabel.
     * - `opname_expired_session_items.batch_id` NULL padahal wave-nya berlabel.
     *
     * Hanya menyentuh baris kosong/NULL — data yang sudah terisi tidak diubah
     * dan tidak ada Batch baru yang diterbitkan. Baris warisan yang benar-benar
     * belum berlabel sengaja dibiarkan NULL agar diterbitkan saat verifikasi.
     *
     * Untuk baris sesi, pengaitan hanya dilakukan bila wave punya tepat satu
     * sumber berlabel: kalau lebih dari satu, identitas asal tiap baris sudah
     * hilang saat bug (baris terkolaps jadi satu) sehingga menebak bisa salah.
     */
    public function up(): void
    {
        $service = app(OpnameExpiredService::class);

        OpnameExpiredWave::query()
            ->where(fn ($q) => $q
                ->whereNull('batch_numbers')
                ->orWhere('batch_numbers', '[]')
                ->orWhere('batch_numbers', ''))
            ->chunkById(200, function ($waves) use ($service) {
                foreach ($waves as $wave) {
                    $numbers = $service->waveSourceItems($wave)
                        ->map(fn ($item) => $item->batch?->batch_number ?? $item->verifiedBatch?->batch_number)
                        ->filter()
                        ->unique()
                        ->values()
                        ->all();

                    if ($numbers !== []) {
                        $wave->update(['batch_numbers' => $numbers]);
                    }
                }
            });

        OpnameExpiredSessionItem::query()
            ->whereNull('batch_id')
            ->chunkById(200, function ($items) use ($service) {
                foreach ($items as $item) {
                    $wave = $item->wave;
                    if (! $wave) {
                        continue;
                    }

                    $batches = $service->waveSourceItems($wave)
                        ->map(fn ($source) => $source->batch ?? $source->verifiedBatch)
                        ->filter()
                        ->unique('id')
                        ->values();

                    if ($batches->count() === 1) {
                        $item->update(['batch_id' => $batches->first()->id]);
                    }
                }
            });
    }

    public function down(): void
    {
        // Backfill tidak reversibel (nilai asal tidak terekam).
    }
};
