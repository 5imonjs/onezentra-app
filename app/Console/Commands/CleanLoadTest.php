<?php

namespace App\Console\Commands;

use App\Models\ClusterPrincipal;
use App\Models\Npn;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Menghapus semua jejak load test dari database dev.
 *
 * Sengaja refuses destroy data yang bukan hasil load test: master bisa sudah
 * diisi user lewat UI. Pola penghapusan dibatasi ke SKU berawalan "SKU-" dan
 * NPN "PROD-", jadi data asli tidak pernah ikut terhapus.
 */
class CleanLoadTest extends Command
{
    protected $signature = 'loadtest:clean {--force : lewati konfirmasi}';

    protected $description = 'Hapus user, token, dan data dummy hasil load test';

    public function handle(): int
    {
        $users = User::where('email', 'like', 'loadtest%@local.test')->pluck('id');

        $cpTotal = ClusterPrincipal::count();
        $cpSynthetic = ClusterPrincipal::where('product_sku', 'like', 'SKU-%')->count();
        $npnTotal = Npn::count();
        $npnSynthetic = Npn::where('szNickName', 'like', 'PROD-%')->count();

        $this->components->info('Kandidat yang akan dihapus:');
        $this->line("  user loadtest*        : {$users->count()}");
        $this->line("  cluster_principal SKU : {$cpSynthetic} dari {$cpTotal}");
        $this->line("  npn PROD-*            : {$npnSynthetic} dari {$npnTotal}");

        if ($cpSynthetic < $cpTotal || $npnSynthetic < $npnTotal) {
            $this->components->warn(
                'Ada baris NON-loadtest. Hanya baris berpola SKU-/PROD- yang dihapus; data lain dipertahankan.'
            );
        }

        if (! $this->option('force') && ! $this->confirm('Lanjutkan penghapusan?', true)) {
            $this->components->warn('Dibatalkan.');

            return self::FAILURE;
        }

        // Token & session dihapus eksplisit sebelum user supaya tidak menggantung.
        // Catatan: personal_access_tokens bersifat POLYMORPHIC — kolomnya
        // tokenable_type/tokenable_id, bukan user_id. Menghapus berdasarkan
        // user_id akan gagal "Unknown column".
        if ($users->isNotEmpty()) {
            DB::table('personal_access_tokens')
                ->where('tokenable_type', User::class)
                ->whereIn('tokenable_id', $users)
                ->delete();
            DB::table('sessions')->whereIn('user_id', $users)->delete();
        }

        $deletedUsers = $users->isNotEmpty() ? User::whereIn('id', $users)->delete() : 0;
        $deletedCp = ClusterPrincipal::where('product_sku', 'like', 'SKU-%')->delete();
        $deletedNpn = Npn::where('szNickName', 'like', 'PROD-%')->delete();

        $this->newLine();
        $this->components->info('Selesai.');
        $this->line("  user dihapus    : {$deletedUsers}");
        $this->line("  cp dihapus      : {$deletedCp}");
        $this->line("  npn dihapus     : {$deletedNpn}");

        return self::SUCCESS;
    }
}
