<?php

namespace App\Exports;

use Illuminate\Database\Eloquent\Builder as EloquentBuilder;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Carbon;
use Maatwebsite\Excel\Concerns\FromQuery;
use Maatwebsite\Excel\Concerns\ShouldAutoSize;
use Maatwebsite\Excel\Concerns\WithColumnFormatting;
use Maatwebsite\Excel\Concerns\WithEvents;
use Maatwebsite\Excel\Concerns\WithHeadings;
use Maatwebsite\Excel\Concerns\WithMapping;
use Maatwebsite\Excel\Concerns\WithStyles;
use Maatwebsite\Excel\Events\AfterSheet;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;

/**
 * Laporan gabungan: penerimaan produk + status batch expired.
 *
 * Format kolom mengikuti format standar gudang:
 *   NO | GROUPING BY CLUSTER | PRODUK | NAMA PRODUK | PRINCIPAL 1 | PRINCIPAL 2
 *   | DUS/BALL | PCS | TANGGAL EXPIRED | TANGGAL PENERIMAAN | WEEKDAY
 *   | SISA SIMPAN | SISA HARI
 *
 * PRODUK, CLUSTER, dan PRINCIPAL bukan input operator — semuanya hasil lookup
 * otomatis dari master (NPN → Standar Umur → Cluster Principal).
 *
 * WEEKDAY dan SISA SIMPAN sengaja ditulis sebagai FORMULA Excel, bukan teks
 * hasil hitungan PHP, supaya nilainya ikut bergerak saat file dibuka di hari
 * berikutnya (TODAY() ikut bergeser, tidak beku seperti tanggal hasil
 * hitungan server).
 *
 * Huruf kolom pada formula dibangun dari konstanta di bawah, bukan ditulis
 * manual — kalau urutan kolom berubah, formulanya ikut menyesuaikan.
 */
class PenerimaanExpiredReportExport implements FromQuery, ShouldAutoSize, WithColumnFormatting, WithEvents, WithHeadings, WithMapping, WithStyles
{
    /**
     * Posisi kolom (1-based) pada sheet export — sumber tunggal untuk semua
     * rumus Excel di bawah. Tambah/kurangi kolom cukup ubah di sini:
     *
     *   A NO | B CLUSTER | C PRODUK | D NAMA PRODUK | E PRINCIPAL 1 |
     *   F PRINCIPAL 2 | G DUS/BALL | H PCS | I TANGGAL EXPIRED |
     *   J TANGGAL PENERIMAAN | K WEEKDAY | L SISA SIMPAN | M SISA HARI
     *
     * TANGGAL EXPIRED sengaja berada di kolom I sehingga formula WEEKDAY
     * terbaca persis seperti format standar gudang: =IF(I2>TODAY(),...).
     */
    public const CLUSTER_COLUMN = 2;

    public const EXPIRED_COLUMN = 9;

    public const PENERIMAAN_COLUMN = 10;

    public const WEEKDAY_COLUMN = 11;

    public const SISA_SIMPAN_COLUMN = 12;

    private int $rowNumber = 0;

    /**
     * Tanggal expired per nomor baris, dipakai AfterSheet untuk mewarnai
     * baris yang sudah lewat tanggal. Dicatat saat mapping (bukan dibaca
     * ulang dari cell) supaya tidak bergantung parsing serial Excel.
     *
     * @var array<int, string>
     */
    private array $expiredByRow = [];

    public function __construct(public EloquentBuilder|Relation $query) {}

    public function query(): Builder|EloquentBuilder|Relation
    {
        return $this->query;
    }

    public function headings(): array
    {
        return [
            'NO',
            'GROUPING BY CLUSTER',
            'PRODUK',
            'NAMA PRODUK',
            'PRINCIPAL 1',
            'PRINCIPAL 2',
            'DUS/BALL',
            'PCS',
            'TANGGAL EXPIRED',
            'TANGGAL PENERIMAAN',
            'WEEKDAY',
            'SISA SIMPAN',
            'SISA HARI',
        ];
    }

    public function map($item): array
    {
        $this->rowNumber++;
        $row = $this->rowNumber + 1; // +1 karena baris 1 dipakai heading

        $tanggalMasuk = $item->tanggal_penerimaan
            ? Carbon::parse($item->tanggal_penerimaan)->startOfDay()
            : null;

        $expired = $item->expired_date
            ? Carbon::parse($item->expired_date)->startOfDay()
            : null;

        if ($expired) {
            $this->expiredByRow[$row] = $expired->toDateString();
        }

        $sisaHari = $expired
            ? (int) Carbon::today()->startOfDay()->diffInDays($expired, false)
            : null;

        $eks = self::letterForColumn(self::EXPIRED_COLUMN);
        $penerimaan = self::letterForColumn(self::PENERIMAAN_COLUMN);

        // Tanggal harus ditulis sebagai SERIAL ANGKA Excel, bukan string
        // ("2027-04-10 00:00:00"). Kalau string, perbandingan G2>TODAY()
        // membandingkan TEKS dengan angka dan selalu salah (hasilnya Past
        // untuk batch yang jelas masih months), serta DATEDIF gagal.
        // Tampilan dd-mm-yyyy/Amplop datang dari columnFormats().
        return [
            $this->rowNumber,
            $item->cluster ?: 'TANPA CLUSTER',
            // Kolom PRODUK memakai SKU pendek (ESVAG150) sesuai format laporan
            // manual gudang; jatuh ke kode_barang bila NPN belum punya nickname.
            $item->sku ?: $item->kode_barang,
            $item->nama_barang ?: $item->kode_barang,
            // Principal sudah COALESCE di query service (kunci stabil BOSnet →
            // komposit nickname → nickname pendek → principal standar umur);
            // "-" hanya bila tidak ada master yang mengenal produk ini.
            $item->principal_1 ?: '-',
            $item->principal_2 ?: '-',
            (float) $item->actual_qty,
            $item->totalPcs(),
            self::toExcelDate($expired),
            self::toExcelDate($tanggalMasuk),
            "=IF({$eks}{$row}=\"\",\"-\",IF({$eks}{$row}>TODAY(),\"Future\",\"Past\"))",
            $tanggalMasuk && $expired
                ? "=IFERROR(DATEDIF({$penerimaan}{$row},{$eks}{$row},\"Y\")&\" Thn \"&DATEDIF({$penerimaan}{$row},{$eks}{$row},\"YM\")&\" Bln \"&DATEDIF({$penerimaan}{$row},{$eks}{$row},\"MD\")&\" Hr\",\"-\")"
                : '-',
            $sisaHari ?? '-',
        ];
    }

    public function registerEvents(): array
    {
        // Listener dipanggil sebagai callable($event), jadi nama method polos
        // akan diperlakukan sebagai fungsi global dan gagal ("Call to
        // undefined function"). Closure yang membungkusnya.
        return [
            AfterSheet::class => fn (AfterSheet $event) => $this->afterSheet($event),
        ];
    }

    /**
     * Validasi otomatis: baris dengan expired < today diberi fill merah
     * supaya terlihat sekilas tanpa harus membaca kolom.
     */
    public function afterSheet(AfterSheet $event): void
    {
        // Sheet::getDelegate() yang mengembalikan Worksheet — tidak ada
        // getWorksheet() di versi Maatwebsite ini.
        $sheet = $event->sheet->getDelegate();
        $today = Carbon::today()->startOfDay();
        $lastColumn = self::letterForColumn(count($this->headings()));

        foreach ($this->expiredByRow as $row => $tanggal) {
            if (Carbon::parse($tanggal)->startOfDay()->greaterThanOrEqualTo($today)) {
                continue;
            }

            $sheet->getStyle('A'.$row.':'.$lastColumn.$row)->applyFromArray([
                'fill' => [
                    'fillType' => Fill::FILL_SOLID,
                    'startColor' => ['rgb' => 'FEE2E2'],
                    'endColor' => ['rgb' => 'FEE2E2'],
                ],
                'font' => ['color' => ['rgb' => '991B1B']],
            ]);
        }
    }

    public function columnFormats(): array
    {
        return [
            'A' => '0',
            'G' => '#,##0',
            'H' => '#,##0',
            self::letterForColumn(self::EXPIRED_COLUMN) => 'dd-mm-yyyy',
            self::letterForColumn(self::PENERIMAAN_COLUMN) => 'dd-mm-yyyy',
            self::letterForColumn(self::WEEKDAY_COLUMN) => '@',
            self::letterForColumn(self::SISA_SIMPAN_COLUMN) => '@',
            self::letterForColumn(self::SISA_SIMPAN_COLUMN + 1) => '#,##0',
        ];
    }

    public function styles(Worksheet $sheet): array
    {
        return [
            1 => [
                'font' => ['bold' => true, 'size' => 11, 'color' => ['rgb' => 'FFFFFF']],
                'fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['rgb' => '0F172A']],
            ],
        ];
    }

    /**
     * Tanggal → serial number Excel (basis 1899-12-30).
     *
     * PhpSpreadsheet::DATE() sudah mengembalikan serial, tapi disimpan sebagai
     * TYPE_STRING oleh value binder sehingga perbandingan dengan TODAY()
     * gagal. Serial float dipaksakan lewat setCellValueExplicit.
     */
    private static function toExcelDate(?Carbon $date): ?float
    {
        return $date?->copy()->setTime(0, 0)->getTimestamp() / 86400 + 25569;
    }

    /**
     * Ubah indeks kolom 1-based menjadi huruf kolom Excel (1 → A, 27 → AA).
     */
    public static function letterForColumn(int $index): string
    {
        $letters = '';

        while ($index > 0) {
            $letters = chr(65 + ($index - 1) % 26).$letters;
            $index = intdiv($index - 1, 26);
        }

        return $letters;
    }
}
