<?php

namespace App\Exports;

use App\Models\Npn;
use Illuminate\Database\Eloquent\Builder as EloquentBuilder;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Database\Query\Builder;
use Maatwebsite\Excel\Concerns\FromQuery;
use Maatwebsite\Excel\Concerns\ShouldAutoSize;
use Maatwebsite\Excel\Concerns\WithHeadings;
use Maatwebsite\Excel\Concerns\WithMapping;
use Maatwebsite\Excel\Concerns\WithStyles;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;

class NpnExport implements FromQuery, ShouldAutoSize, WithHeadings, WithMapping, WithStyles
{
    public ?string $search = null;

    public function __construct(
        ?string $search = null,
    ) {
        $this->search = $search;
    }

    public function query(): Builder|EloquentBuilder|Relation
    {
        $query = Npn::query();

        if ($this->search) {
            $query->where(function ($q) {
                $q->where('szNickName', 'like', '%'.$this->search.'%')
                    ->orWhere('BOSnetszProductId', 'like', '%'.$this->search.'%')
                    ->orWhere('SAPszProductId', 'like', '%'.$this->search.'%')
                    ->orWhere('szShortDescription', 'like', '%'.$this->search.'%')
                    ->orWhere('szBarcode', 'like', '%'.$this->search.'%');
            });
        }

        return $query->orderByRaw('szNickName IS NULL, szNickName ASC');
    }

    public function headings(): array
    {
        return [
            'BOSnetszProductId',
            'SAPszProductId',
            'szNickName',
            'szNickNameNew',
            'szShortDescription',
            'szLongDescription',
            'szCategory_1',
            'szCat1Description',
            'szCategory_2',
            'szCat2Description',
            'szCategory_3',
            'szCat3Description',
            'szCategory_4',
            'szCat4Description',
            'szCategory_5',
            'szCat5Description',
            'szCategory_6',
            'szCat6Description',
            'szCategory_7',
            'szCat7Description',
            'szCategory_8',
            'szCat8Description',
            'szCategory_9',
            'szCat9Description',
            'szCategory_10',
            'szCat10Description',
            'szCompUomId',
            'szCompUomDesc',
            'BOSnetszUomId',
            'BOSnetdecUom',
            'SAPszUomId',
            'SAPdecUom',
            'decUomConversion1',
            'decUomConversion2',
            'decWeight',
            'decLength',
            'decWidth',
            'decHeight',
            'decVolume',
            'decStoreTemp',
            'szBarcode',
            'szBarcodeSekunder',
            'szBarcodeTersier',
            'szStatus',
            'dtmValidEnd',
            'SAPszSalesOrgId',
            'szTaxTypeId',
            'decRate',
        ];
    }

    public function map($npn): array
    {
        return [
            $npn->BOSnetszProductId,
            $npn->SAPszProductId,
            $npn->szNickName,
            $npn->szNickNameNew,
            $npn->szShortDescription,
            $npn->szLongDescription,
            $npn->szCategory_1,
            $npn->szCat1Description,
            $npn->szCategory_2,
            $npn->szCat2Description,
            $npn->szCategory_3,
            $npn->szCat3Description,
            $npn->szCategory_4,
            $npn->szCat4Description,
            $npn->szCategory_5,
            $npn->szCat5Description,
            $npn->szCategory_6,
            $npn->szCat6Description,
            $npn->szCategory_7,
            $npn->szCat7Description,
            $npn->szCategory_8,
            $npn->szCat8Description,
            $npn->szCategory_9,
            $npn->szCat9Description,
            $npn->szCategory_10,
            $npn->szCat10Description,
            $npn->szCompUomId,
            $npn->szCompUomDesc,
            $npn->BOSnetszUomId,
            $npn->BOSnetdecUom,
            $npn->SAPszUomId,
            $npn->SAPdecUom,
            $npn->decUomConversion1,
            $npn->decUomConversion2,
            $npn->decWeight,
            $npn->decLength,
            $npn->decWidth,
            $npn->decHeight,
            $npn->decVolume,
            $npn->decStoreTemp,
            $npn->szBarcode,
            $npn->szBarcodeSekunder,
            $npn->szBarcodeTersier,
            $npn->szStatus,
            $npn->dtmValidEnd,
            $npn->SAPszSalesOrgId,
            $npn->szTaxTypeId,
            $npn->decRate,
        ];
    }

    public function styles(Worksheet $sheet): array
    {
        return [
            1 => [
                'font' => ['bold' => true, 'size' => 11],
                'fill' => ['fillType' => 'solid', 'color' => ['rgb' => '4F46E5']],
                'font' => ['bold' => true, 'color' => ['rgb' => 'FFFFFF']],
            ],
        ];
    }
}
