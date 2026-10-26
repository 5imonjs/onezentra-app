<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\BiayaRetribusiDocument;
use App\Models\BiayaThlPhoto;
use App\Models\OpnameExpiredSessionItem;
use App\Models\ReceivingItem;
use App\Models\SjValidationItem;
use App\Support\EvidenceStorage;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

/**
 * Penyajian file bukti (foto validasi, dokumen biaya) dengan otorisasi
 * per-baris: file hanya bisa dibuka user yang boleh mengakses depo pemilik
 * baris yang merujuk path tersebut. Path tanpa pemilik di database = 404
 * (fail-closed, sekaligus menutup enumerasi path).
 */
class StorageController extends Controller
{
    public function show(Request $request, string $path): BinaryFileResponse
    {
        abort_unless(EvidenceStorage::exists($path), 404);

        $owner = $this->resolveOwner($path);
        abort_unless($owner !== null, 404);
        // Seragam 404 untuk lintas-depo: beda 403 vs 404 menjadi oracle
        // enumerasi path valid milik depo lain.
        abort_unless(
            $request->user()->canAccessDepotRow($owner['kode_depo'], $owner['nama_depo']),
            404
        );

        $absolutePath = EvidenceStorage::path($path);
        abort_unless($absolutePath !== null, 404);

        return response()->file($absolutePath);
    }

    /**
     * @return array{kode_depo: string|null, nama_depo: string|null}|null
     */
    private function resolveOwner(string $path): ?array
    {
        // Foto validasi/receiving/opname selalu disimpan di folder ini.
        if ($this->isUnderPrefix($path, 'validation-photos')) {
            $receivingItem = ReceivingItem::where('photo', $path)->first(['kode_depo', 'nama_depo']);
            if ($receivingItem) {
                return ['kode_depo' => $receivingItem->kode_depo, 'nama_depo' => $receivingItem->nama_depo];
            }

            $sjItem = SjValidationItem::with('validation.rencanaKirim')->where('photo', $path)->first();
            if ($sjItem) {
                $rencana = $sjItem->validation?->rencanaKirim;

                return ['kode_depo' => $rencana?->kode_depo, 'nama_depo' => $rencana?->nama_depo];
            }

            $sessionItem = OpnameExpiredSessionItem::with('session')->where('photo', $path)->first();
            if ($sessionItem) {
                $session = $sessionItem->session;

                return ['kode_depo' => $session?->kode_depo, 'nama_depo' => $session?->nama_depo];
            }
        }

        $thlPhoto = BiayaThlPhoto::with('biayaThl')->where('file_path', $path)->first();
        if ($thlPhoto && $this->isUnderPrefix($path, "biaya_thl/{$thlPhoto->biaya_thl_id}")) {
            $parent = $thlPhoto->biayaThl;

            return ['kode_depo' => $parent?->kode_depo, 'nama_depo' => $parent?->nama_depo];
        }

        $retribusiDoc = BiayaRetribusiDocument::with('biayaRetribusi')->where('file_path', $path)->first();
        if ($retribusiDoc && $this->isUnderPrefix($path, "biaya_retribusi/{$retribusiDoc->biaya_retribusi_id}")) {
            $parent = $retribusiDoc->biayaRetribusi;

            return ['kode_depo' => $parent?->kode_depo, 'nama_depo' => $parent?->nama_depo];
        }

        return null;
    }

    private function isUnderPrefix(string $path, string $prefix): bool
    {
        $prefix = rtrim($prefix, '/').'/';

        return str_starts_with($path, $prefix)
            && ! str_contains($path, '..')
            && ! str_contains($path, '\\');
    }
}
