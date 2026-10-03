<?php

namespace App\Imports;

use RuntimeException;

/**
 * Import gagal karena ada baris yang tidak valid → pemanggil wajib rollback.
 *
 * Exception terpisah (bukan pesan string) supaya pemanggil bisa membedakan
 * "gagal karena data" dari "gagal karena sistem". Yang pertama layak
 * dikembalikan ke user sebagai 422 beserta daftar baris; yang kedua jadi 500.
 */
class ReceivingImportFailed extends RuntimeException
{
    /**
     * @param  array<int, array{row: int, errors: string}>  $rowErrors
     */
    public function __construct(public readonly array $rowErrors)
    {
        $failed = count($rowErrors);

        parent::__construct("Import gagal: {$failed} baris tidak valid. Tidak ada data yang disimpan.");
    }

    /**
     * @param  array<int, array{row: int, errors: string}>  $rowErrors
     */
    public static function withRowErrors(array $rowErrors): self
    {
        return new self($rowErrors);
    }
}
