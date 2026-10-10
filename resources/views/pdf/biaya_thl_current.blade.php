<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        @page { margin: 10px; size: A4 landscape; }
        body { font-family: DejaVu Sans, sans-serif; font-size: 8px; margin: 0; color: #111; }
        table { border-collapse: collapse; width: 100%; table-layout: fixed; }
        .pdf-table { width: 100%; max-width: 100%; table-layout: fixed; }
        td, th { border: 1px solid #222; padding: 3px 4px; }
        .header td { height: 24px; vertical-align: middle; }
        .brand { width: 14%; text-align: center; font-weight: bold; font-size: 10px; font-style: italic; color: #1f5d70; }
        .brand span { display: inline-block; border-bottom: 2px solid #e36f32; padding: 0 5px 1px; }
        .title { text-align: center; font-weight: bold; font-size: 13px; }
        .date { height: 15px; font-weight: bold; }
        .data th { background: #d2d2d2; text-align: center; font-weight: bold; }
        .data td { height: 16px; }
        .center { text-align: center; }
        .photos { height: 78px; vertical-align: top; padding: 4px; }
        .photos img { width: 62px; height: 70px; object-fit: cover; margin-right: 4px; border: 1px solid #555; }
    </style>
</head>
<body>
    <table class="header pdf-table">
        <colgroup>
            <col style="width: 14%;"><col style="width: 86%;">
        </colgroup>
        <tr>
            <td class="brand"><span>SNS</span></td>
            <td class="title">FORM KLAIM TENAGA HARIAN LEPAS</td>
        </tr>
        <tr><td colspan="2" class="date">TANGGAL {{ optional($biayaThl->tanggal_pengajuan)->format('d F Y') }}</td></tr>
    </table>

    <table class="data pdf-table">
        <colgroup>
            <col style="width: 3%;"><col style="width: 29%;"><col style="width: 11%;"><col style="width: 14%;"><col style="width: 17%;"><col style="width: 13%;"><col style="width: 13%;">
        </colgroup>
        <thead>
            <tr><th>No</th><th>Nama</th><th>Kubikasi</th><th>Drop Point</th><th>Posisi</th><th>Jam Datang</th><th>Jam Pulang</th></tr>
        </thead>
        <tbody>
            @foreach($biayaThl->details as $detail)
                <tr>
                    <td class="center">{{ $loop->iteration }}</td>
                    <td>{{ $detail->nopol_kendaraan ?: '-' }}@if($detail->kendaraan_sj) (SJ {{ $detail->kendaraan_sj }})@endif - {{ $detail->nama_thl ?: $detail->driver_name ?: '-' }}</td>
                    <td class="center">{{ $detail->kubikasi ?? 0 }}</td>
                    <td>{{ $detail->droppoint ?: 0 }}</td>
                    <td>{{ $detail->posisi ?: 'THL GUDANG' }}</td>
                    <td class="center">{{ $detail->jam_datang?->format('H:i') ?: '-' }}</td>
                    <td class="center">{{ $detail->jam_pulang?->format('H:i') ?: '-' }}</td>
                </tr>
            @endforeach
        </tbody>
    </table>

    <table class="pdf-table">
        <tr><td class="photos">
            @foreach($biayaThl->details as $detail)
                @foreach($detail->photos as $photo)
                    @php($photoPath = storage_path('app/public/'.$photo->file_path))
                    @if(file_exists($photoPath))
                        <img src="data:image/{{ pathinfo($photo->file_name, PATHINFO_EXTENSION) }};base64,{{ base64_encode(file_get_contents($photoPath)) }}" alt="{{ $photo->file_name }}">
                    @endif
                @endforeach
            @endforeach
        </td></tr>
    </table>
</body>
</html>
