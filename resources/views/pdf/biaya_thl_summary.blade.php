<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        @page { size: A4 landscape; }
        body { font-family: sans-serif; font-size: 10px; margin: 20px; }
        .header { text-align: center; margin-bottom: 15px; }
        .header .logo { margin-bottom: 8px; }
        .header .logo img { height: 60px; }
        .header h1 { font-size: 14px; margin: 0; text-transform: uppercase; letter-spacing: 1px; }
        .header p { font-size: 11px; color: #666; margin: 4px 0 0; }
        .info { margin-bottom: 15px; }
        .info table { width: 100%; border-collapse: collapse; }
        .info td { padding: 4px 8px; }
        .info td:first-child { font-weight: bold; width: 150px; }
        table.data { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
        table.data th, table.data td { border: 1px solid #333; padding: 6px 8px; text-align: left; }
        table.data th { background: #f0f0f0; font-weight: bold; }
        .total { text-align: right; font-weight: bold; font-size: 12px; margin: 10px 0; }
        .approval { margin-top: 30px; }
        .approval table { width: 100%; border-collapse: collapse; }
        .approval td { padding: 8px; text-align: center; vertical-align: top; width: 25%; }
        .approval .title { font-weight: bold; font-size: 10px; margin-bottom: 40px; }
        .approval .name { font-size: 10px; }
        .approval .role { font-size: 9px; color: #666; }
        .rfah { color: #d97706; font-weight: bold; }
        .photos { margin-top: 20px; }
        .photos h3 { font-size: 11px; margin-bottom: 10px; }
        .photo-strip { display: flex; flex-wrap: wrap; gap: 8px; }
        .photo-strip img { width: 120px; height: 90px; object-fit: cover; border: 1px solid #ccc; }
    </style>
</head>
<body>
    <div class="header">
        <div class="logo">
            @if(file_exists(public_path('LOGO.png')))
                <img src="data:image/png;base64,{{ base64_encode(file_get_contents(public_path('LOGO.png'))) }}" alt="Logo">
            @endif
        </div>
        <h1>FORM KLAIM BIAYA PENGAJUAN RETRIBUSI</h1>
        <p>Biaya THL - Ringkasan</p>
    </div>

    <div class="info">
        <table>
            <tr><td>Kode Depo</td><td>: {{ $biayaThl->kode_depo }}</td></tr>
            <tr><td>Nama Depo</td><td>: {{ $biayaThl->nama_depo }}</td></tr>
            <tr><td>Tanggal Pengajuan</td><td>: {{ $biayaThl->tanggal_pengajuan }}</td></tr>
            <tr><td>No. Kendaraan</td><td>: {{ $biayaThl->no_kendaraan ?? '-' }}</td></tr>
            <tr><td>Type Kendaraan</td><td>: {{ $biayaThl->type_kendaraan ?? '-' }}</td></tr>
            <tr><td>No. Surat Jalan</td><td>: {{ $biayaThl->no_surat_jalan ?? '-' }}</td></tr>
        </table>
    </div>

    <table class="data">
        <thead>
            <tr>
                <th>No</th>
                <th>No. SJ</th>
                <th>Nama THL</th>
                <th>Posisi</th>
                <th>Plat Kendaraan</th>
                <th>Type</th>
                <th>Kubikasi</th>
                <th>Droppoint</th>
                <th style="text-align:right">Nominal</th>
            </tr>
        </thead>
        <tbody>
            @foreach($biayaThl->details as $detail)
            <tr>
                <td>{{ $loop->iteration }}</td>
                <td>{{ $detail->no_surat_jalan ?? '-' }}</td>
                <td>{{ $detail->nama_thl }}</td>
                <td>{{ $detail->posisi ?? '-' }}</td>
                <td>{{ $detail->nopol_kendaraan }}</td>
                <td>{{ $detail->type_kendaraan }}</td>
                <td>{{ $detail->kubikasi }}</td>
                <td>{{ $detail->droppoint ?? '-' }}</td>
                <td style="text-align:right">Rp {{ number_format($detail->nominal_biaya, 0, ',', '.') }}</td>
            </tr>
            @endforeach
        </tbody>
    </table>

    <div class="total">
        Total: Rp {{ number_format($biayaThl->nominal_biaya, 0, ',', '.') }}
    </div>

    @if($biayaThl->is_rfah_required)
    <div class="total rfah">
        RFAH: {{ $biayaThl->rfah_name }}
    </div>
    @endif

    <div class="approval">
        <table>
            @foreach($approvalSections as $section)
                @if($section['title'] === 'RFAH*' && !$biayaThl->is_rfah_required)
                    {{-- Skip RFAH* if not required --}}
                @else
                <td>
                    <div class="title">{{ $section['title'] }}</div>
                    <br><br><br>
                    @if($section['title'] === 'Mengajukan')
                        <div class="name">{{ $biayaThl->approval_pengajuan ?? '-' }}</div>
                    @else
                        <div class="name">{{ $section['people'][0]['name'] ?? '-' }}</div>
                    @endif
                    <div class="role">{{ $section['people'][0]['role'] ?? '-' }}</div>
                </td>
                @endif
            @endforeach
        </table>
    </div>

    @php
        $allPhotos = collect();
        foreach($biayaThl->details as $detail) {
            if($detail->photos) {
                $allPhotos = $allPhotos->merge($detail->photos);
            }
        }
    @endphp

    @if($allPhotos->count() > 0)
    <div class="photos">
        <h3>Foto Dokumentasi</h3>
        <div class="photo-strip">
            @foreach($allPhotos as $photo)
                @if(file_exists(storage_path('app/public/' . $photo->file_path)))
                    <img src="data:image/{{ pathinfo($photo->file_name, PATHINFO_EXTENSION) }};base64,{{ base64_encode(file_get_contents(storage_path('app/public/' . $photo->file_path))) }}" alt="{{ $photo->file_name }}">
                @endif
            @endforeach
        </div>
    </div>
    @endif
</body>
</html>
