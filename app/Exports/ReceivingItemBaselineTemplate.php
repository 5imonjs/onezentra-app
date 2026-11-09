<?php

namespace App\Exports;

/**
 * Template Import Saldo Awal (baseline legacy).
 *
 * Kolomnya sengaja sama dengan template stok manual karena keduanya diurai
 * oleh importer yang sama (ReceivingItemImport). Perbedaannya ada pada
 * endpoint dan sumber baris: LEGACY_IMPORT (sekali per depo, punya cutoff)
 * versus IMPORT_MANUAL (stok tambahan yang bisa diimpor berulang).
 */
class ReceivingItemBaselineTemplate extends ReceivingItemTemplate {}
