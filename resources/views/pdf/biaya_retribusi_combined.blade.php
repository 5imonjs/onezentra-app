<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        @page { margin: 10px; size: A4 landscape; }
        body { font-family: DejaVu Sans, sans-serif; font-size: 7px; margin: 0; color: #111827; }
        table { border-collapse: collapse; width: 100%; }
        td, th { border: 1px solid #222; padding: 3px 4px; }
        .header { background: #f3f4f6; border: 1px solid #1f2937; }
        .header td { height: 22px; vertical-align: middle; }
        .brand { width: 14%; text-align: center; font-weight: bold; font-size: 10px; }
        .brand span { display: inline-block; border-bottom: 2px solid #f59e0b; padding: 0 5px 1px; }
        .title { text-align: center; font-weight: bold; font-size: 11px; }
        .meta { width: 26%; font-size: 7px; }
        .meta div { padding: 2px 0; }
        .section-date { font-weight: bold; height: 12px; }
        .data th { background: #d2d2d2; text-align: center; font-weight: bold; }
        .data td { height: 13px; }
        .center { text-align: center; }
        .right { text-align: right; }
        .approval { margin-top: 7px; }
        .approval td { height: 18px; text-align: center; vertical-align: middle; }
        .approval .heading { height: 12px; font-weight: bold; }
        .approval .signature-space { height: 42px; }
        .approval .role { height: 12px; font-weight: bold; }
        .approval .signature-space { position: relative; }
        .stamp { display: inline-block; padding: 7px 16px; border: 2.5px solid currentColor; border-radius: 10px; transform: rotate(-14deg); opacity: 0.72; }
        .stamp-text { display: block; font-size: 15px; font-weight: bold; letter-spacing: 3px; text-align: center; }
        .stamp-date { display: block; font-size: 7px; letter-spacing: 1px; text-align: center; border-top: 1px solid currentColor; margin-top: 2px; padding-top: 2px; }
        .reject-note { margin-top: 4px; font-size: 8px; font-weight: bold; color: #b91c1c; border: 1.5px solid #b91c1c; padding: 3px 6px; }
        .revisi-note { margin-top: 4px; font-size: 8px; font-weight: bold; color: #b45309; border: 1.5px solid #b45309; padding: 3px 6px; }
        .note { margin: 7px 0 8px; font-weight: bold; }
        .thl-header td { height: 22px; }
        .thl-photos { height: 62px; vertical-align: top; padding: 3px; }
        .thl-photos img { width: 48px; height: 58px; object-fit: cover; margin-right: 3px; border: 1px solid #555; }
        .documents { margin-top: 8px; }
    </style>
</head>
<body>
    <table class="header">
        <tr>
            <td class="brand"><span>SNS</span></td>
            <td class="title">FORM KLAIM BIAYA PENGAJUAN RETRIBUSI</td>
            <td class="meta">
                <div><b>DEPO</b> : {{ $biayaRetribusi->nama_depo ?: $biayaRetribusi->kode_depo }}</div>
                <div><b>Tanggal Pengajuan</b> : {{ optional($biayaRetribusi->tanggal_pengajuan)->format('d F Y') }}</div>
            </td>
        </tr>
    </table>

    <table class="data">
        <thead>
            <tr><th>No</th><th>NO KENDARAAN</th><th>JENIS KENDARAAN</th><th>SURAT JALAN</th><th>NOMINAL</th><th>Paraf</th></tr>
        </thead>
        <tbody>
            @foreach($biayaRetribusi->details as $detail)
                <tr>
                    <td class="center">{{ $loop->iteration }}</td>
                    <td>{{ $detail->nopol_kendaraan ?: '-' }}</td>
                    <td>{{ $detail->type_kendaraan ?: '-' }}</td>
                    <td>{{ $detail->no_surat_jalan ?: '-' }}</td>
                    <td class="right">{{ number_format($detail->nominal_biaya, 0, ',', '.') }}</td>
                    <td></td>
                </tr>
            @endforeach
            <tr><td colspan="4" class="right"><b>Total</b></td><td class="right"><b>{{ number_format($biayaRetribusi->nominal_biaya, 0, ',', '.') }}</b></td><td></td></tr>
        </tbody>
    </table>

    @php($stamps = $stamps ?? [])
    <table class="approval">
        <tr>
            @foreach(array_slice($approvalSections, 0, 3) as $section)
                <td class="heading">{{ $section['title'] }}</td>
            @endforeach
        </tr>
        <tr>
            @foreach(array_slice($approvalSections, 0, 3) as $section)
                <td class="signature-space">
                    @php($stamp = $stamps[$section['title']] ?? null)
                    @if($stamp)
                        <div class="stamp" style="color: {{ $stamp['color'] }}; border-color: {{ $stamp['color'] }};">
                            <span class="stamp-text">{{ $stamp['text'] }}</span>
                            <span class="stamp-date">{{ $stamp['date'] }}</span>
                        </div>
                    @endif
                </td>
            @endforeach
        </tr>
        <tr>
            @foreach(array_slice($approvalSections, 0, 3) as $section)
                <td>{{ $section['title'] === 'Mengajukan' ? ($biayaRetribusi->approval_pengajuan ?: '-') : ($section['people'][0]['name'] ?? '-') }}</td>
            @endforeach
        </tr>
        <tr>
            @foreach(array_slice($approvalSections, 0, 3) as $section)
                <td class="role">{{ $section['title'] === 'Mengajukan' ? ($biayaRetribusi->approval_pengajuan_level ?: 'BLC') : ($section['people'][0]['role'] ?? '-') }}</td>
            @endforeach
        </tr>
    </table>

    @if(($stamps['Menyetujui']['text'] ?? null) === 'DITOLAK')
        <div class="reject-note">DITOLAK — {{ $biayaRetribusi->rejection_reason ?: 'Tanpa alasan' }}</div>
    @endif

    @if(($stamps['Menyetujui']['text'] ?? null) === 'REVISI')
        <div class="revisi-note">REVISI — {{ $biayaRetribusi->revisi_reason ?: 'Tanpa catatan' }}</div>
    @endif

    <div class="note">Note: * Jika pengajuan biaya &gt; Rp 1 Juta Rupiah</div>

    <table class="header thl-header">
        <tr>
            <td class="brand"><span>SNS</span></td>
            <td class="title">FORM KLAIM TENAGA HARIAN LEPAS</td>
        </tr>
        <tr><td colspan="2" class="section-date">TANGGAL {{ optional($biayaRetribusi->tanggal_pengajuan)->format('d F Y') }}</td></tr>
    </table>

    <table class="data">
        <thead>
            <tr><th>No</th><th>Nama</th><th>Kubikasi</th><th>Drop Point</th><th>Posisi</th><th>Jam Datang</th><th>Jam Pulang</th></tr>
        </thead>
        <tbody>
            @foreach($biayaRetribusi->details as $detail)
                @php($thl = $detail->biayaThlDetail)
                <tr>
                    <td class="center">{{ $loop->iteration }}</td>
                    <td>{{ $detail->nopol_kendaraan ?: '-' }} - {{ $thl?->nama_thl ?: $thl?->driver_name ?: '-' }}</td>
                    <td class="center">{{ $thl?->kubikasi ?? 0 }}</td>
                    <td>{{ $thl?->droppoint ?: 0 }}</td>
                    <td>{{ $thl?->posisi ?: 'THL GUDANG' }}</td>
                    <td class="center">{{ $thl?->jam_datang?->format('H:i') ?: '-' }}</td>
                    <td class="center">{{ $thl?->jam_pulang?->format('H:i') ?: '-' }}</td>
                </tr>
            @endforeach
        </tbody>
    </table>

    <table>
        <tr><td class="thl-photos">
            @foreach($biayaRetribusi->details as $detail)
                @foreach($detail->biayaThlDetail?->photos ?? [] as $photo)
                    @php($photoPath = storage_path('app/public/'.$photo->file_path))
                    @if(file_exists($photoPath))
                        <img src="data:image/{{ pathinfo($photo->file_name, PATHINFO_EXTENSION) }};base64,{{ base64_encode(file_get_contents($photoPath)) }}" alt="{{ $photo->file_name }}">
                    @endif
                @endforeach
            @endforeach
        </td></tr>
    </table>

    @if($biayaRetribusi->documents && $biayaRetribusi->documents->count() > 0)
        <table class="data documents">
            <thead><tr><th>No</th><th>Jenis Dokumen</th><th>Nama File</th></tr></thead>
            <tbody>
                @foreach($biayaRetribusi->documents as $document)
                    <tr><td class="center">{{ $loop->iteration }}</td><td>{{ strtoupper($document->document_type) }}</td><td>{{ $document->file_name }}</td></tr>
                @endforeach
            </tbody>
        </table>
    @endif
</body>
</html>
