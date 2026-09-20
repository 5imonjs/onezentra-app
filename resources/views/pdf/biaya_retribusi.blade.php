<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        @page { size: A4 landscape; margin: 10px; }
        body { font-family: DejaVu Sans, sans-serif; font-size: 7px; margin: 0; color: #111827; }
        table { border-collapse: collapse; width: 100%; }
        td, th { border: 1px solid #222; padding: 3px 4px; }
        .header-box { border: 1px solid #1f2937; background: #f3f4f6; margin-bottom: 6px; }
        .brand-row { height: 22px; }
        .brand-block { width: 14%; text-align: center; font-weight: bold; font-size: 10px; color: #0f172a; }
        .brand-inline { display: inline-block; border-bottom: 2px solid #f59e0b; padding: 0 5px 1px; }
        .title-main { text-align: center; font-size: 11px; font-weight: bold; }
        .meta-col { width: 26%; font-size: 7px; }
        .meta-col div { padding: 2px 0; }
        .section-title { font-size: 7.5px; font-weight: bold; margin: 4px 0 2px; }
        .data th { background: #d1d5db; text-align: center; font-weight: bold; }
        .data td { height: 13px; }
        .center { text-align: center; }
        .right { text-align: right; }
        .total { text-align: right; font-weight: bold; margin: 3px 0; }
        .rfah { text-align: right; color: #b45309; font-weight: bold; margin: 2px 0; }
        .approval { margin-top: 6px; }
        .approval td { height: 18px; text-align: center; vertical-align: middle; }
        .approval .heading { height: 12px; font-weight: bold; }
        .approval .role { height: 12px; font-weight: bold; }
        .photos { border: 1px solid #333; padding: 3px; min-height: 36px; }
        .photos img { width: 48px; height: 38px; object-fit: cover; border: 1px solid #555; margin-right: 3px; }
        .attachment { page-break-before: always; }
        .attachment img { max-width: 100%; max-height: 650px; }
    </style>
</head>
<body>
    <table class="header-box">
        <tr class="brand-row">
            <td class="brand-block"><span class="brand-inline">SNS</span></td>
            <td class="title-main">FORM KLAIM BIAYA PENGAJUAN RETRIBUSI</td>
            <td class="meta-col">
                <div><b>DEPO</b> : {{ $biayaRetribusi->nama_depo ?: $biayaRetribusi->kode_depo }}</div>
                <div><b>Tanggal Pengajuan</b> : {{ $biayaRetribusi->tanggal_pengajuan?->format('d F Y') ?? '-' }}</div>
            </td>
        </tr>
    </table>

    <div class="section-title">DATA RETRIBUSI</div>
    <table class="data">
        <thead>
            <tr>
                <th>No</th><th>No Kendaraan</th><th>Jenis Kendaraan</th><th>Surat Jalan</th><th>Nominal</th><th>Paraf</th>
            </tr>
        </thead>
        <tbody>
            @foreach($biayaRetribusi->details as $detail)
                <tr>
                    <td class="center">{{ $loop->iteration }}</td>
                    <td>{{ $detail->nopol_kendaraan ?: '-' }}</td>
                    <td>{{ $detail->type_kendaraan ?: '-' }}</td>
                    <td>{{ $detail->no_surat_jalan ?: '-' }}</td>
                    <td class="right">Rp {{ number_format($detail->nominal_biaya, 0, ',', '.') }}</td>
                    <td></td>
                </tr>
            @endforeach
        </tbody>
    </table>

    <div class="total">Total: Rp {{ number_format($biayaRetribusi->nominal_biaya, 0, ',', '.') }}</div>
    @if($biayaRetribusi->is_rfah_required)
        <div class="rfah">RFAH: {{ $biayaRetribusi->rfah_name }}</div>
    @endif

    <table class="approval">
        <tr>
            @foreach($approvalSections as $section)
                @if($section['title'] === 'RFAH*' && !$biayaRetribusi->is_rfah_required)
                    @continue
                @endif
                <td class="heading">{{ $section['title'] }}</td>
            @endforeach
        </tr>
        <tr>
            @foreach($approvalSections as $section)
                @if($section['title'] === 'RFAH*' && !$biayaRetribusi->is_rfah_required)
                    @continue
                @endif
                <td></td>
            @endforeach
        </tr>
        <tr>
            @foreach($approvalSections as $section)
                @if($section['title'] === 'RFAH*' && !$biayaRetribusi->is_rfah_required)
                    @continue
                @endif
                <td>{{ $section['title'] === 'Mengajukan' ? ($biayaRetribusi->approval_pengajuan ?: '-') : ($section['people'][0]['name'] ?? '-') }}</td>
            @endforeach
        </tr>
        <tr>
            @foreach($approvalSections as $section)
                @if($section['title'] === 'RFAH*' && !$biayaRetribusi->is_rfah_required)
                    @continue
                @endif
                <td class="role">{{ $section['people'][0]['role'] ?? '-' }}</td>
            @endforeach
        </tr>
    </table>

    <div class="section-title" style="margin-top: 8px;">FORM KLAIM TENAGA HARIAN LEPAS</div>
    <table class="data">
        <thead>
            <tr>
                <th>No</th><th>Nama</th><th>Kubikasi</th><th>Drop Point</th><th>Posisi</th><th>Jam Datang</th><th>Jam Pulang</th>
            </tr>
        </thead>
        <tbody>
            @foreach($biayaRetribusi->details as $detail)
                @php($source = $detail->biayaThlDetail)
                <tr>
                    <td class="center">{{ $loop->iteration }}</td>
                    <td>{{ $source?->nama_thl ?: $source?->driver_name ?: '-' }}</td>
                    <td class="center">{{ $source?->kubikasi ?? 0 }}</td>
                    <td>{{ $source?->droppoint ?: '0' }}</td>
                    <td>{{ $source?->posisi ?: '-' }}</td>
                    <td class="center">{{ $source?->jam_datang?->format('H:i') ?? '-' }}</td>
                    <td class="center">{{ $source?->jam_pulang?->format('H:i') ?? '-' }}</td>
                </tr>
            @endforeach
        </tbody>
    </table>

    @php
        $photos = $biayaRetribusi->details->flatMap(fn ($detail) => $detail->biayaThlDetail?->photos ?? []);
    @endphp
    <div class="photos">
        @foreach($photos->take(10) as $photo)
            @if(file_exists(storage_path('app/public/'.$photo->file_path)))
                <img src="data:{{ $photo->mime_type ?: 'image/jpeg' }};base64,{{ base64_encode(file_get_contents(storage_path('app/public/'.$photo->file_path))) }}" alt="{{ $photo->file_name }}">
            @endif
        @endforeach
    </div>

    @if($biayaRetribusi->documents->count() > 0)
        <div class="attachment">
            <div class="section-title">LAMPIRAN DOKUMEN (BA / SJ / INVOICE)</div>
            <table class="data">
                <thead><tr><th>No</th><th>Tipe</th><th>Nama File</th></tr></thead>
                <tbody>
                    @foreach($biayaRetribusi->documents as $document)
                        <tr><td class="center">{{ $loop->iteration }}</td><td>{{ strtoupper($document->document_type) }}</td><td>{{ $document->file_name }}</td></tr>
                    @endforeach
                </tbody>
            </table>
            @foreach($biayaRetribusi->documents as $document)
                @if(file_exists(storage_path('app/public/'.$document->file_path)))
                    @php
                        $path = storage_path('app/public/'.$document->file_path);
                        $extension = strtolower(pathinfo($document->file_name, PATHINFO_EXTENSION));
                    @endphp
                    @if(in_array($extension, ['jpg', 'jpeg', 'png', 'webp'], true))
                        <div class="attachment">
                            <div class="section-title">{{ strtoupper($document->document_type) }} - {{ $document->file_name }}</div>
                            <img src="data:{{ $document->mime_type ?: 'image/'.$extension }};base64,{{ base64_encode(file_get_contents($path)) }}" alt="{{ $document->file_name }}">
                        </div>
                    @endif
                @endif
            @endforeach
        </div>
    @endif
</body>
</html>
