<?php

namespace App\Exports;

use App\Models\RencanaKirim;
use Illuminate\Support\Collection;
use Maatwebsite\Excel\Concerns\FromCollection;
use Maatwebsite\Excel\Concerns\ShouldAutoSize;
use Maatwebsite\Excel\Concerns\WithHeadings;
use Maatwebsite\Excel\Concerns\WithMapping;
use Maatwebsite\Excel\Concerns\WithStyles;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;

/**
 * Ekspor isi satu rencana kirim (baris per barang), bukan ringkasan PO.
 */
class RencanaKirimDetailExport implements FromCollection, ShouldAutoSize, WithHeadings, WithMapping, WithStyles
{
    public function __construct(public RencanaKirim $rencanaKirim) {}

    public function collection(): Collection
    {
        return $this->rencanaKirim->items()->with('npn')->orderBy('item_number')->get();
    }

    public function headings(): array
    {
        return [
            'No',
            'Kode Barang',
            'Nama Barang',
            'Jumlah',
            'Satuan',
            'Kubikasi (m³)',
            'Keterangan',
            'Qty Diterima',
        ];
    }

    public function map($item): array
    {
        $npn = $item->npn;
        $kubikasi = $npn && $npn->decVolume !== null && $npn->SAPdecUom !== null
            ? round(
                ((float) $item->jumlah) * ((float) $npn->decVolume) * ((float) $npn->SAPdecUom) / 1_000_000,
                4,
            )
            : null;

        return [
            $item->item_number,
            $item->kode_barang ?? '-',
            $item->nama_barang ?? '-',
            (float) $item->jumlah,
            $item->satuan ?? '-',
            $kubikasi,
            $item->keterangan ?? '-',
            $item->received_qty !== null ? (float) $item->received_qty : null,
        ];
    }

    public function styles(Worksheet $sheet): array
    {
        return [
            1 => [
                'font' => ['bold' => true, 'color' => ['rgb' => 'FFFFFF']],
                'fill' => ['fillType' => 'solid', 'color' => ['rgb' => '0F172A']],
            ],
        ];
    }
}
