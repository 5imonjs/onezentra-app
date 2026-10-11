<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        @page { margin: 10px; size: A4 landscape; }
        body { font-family: DejaVu Sans, sans-serif; font-size: 7.5px; margin: 0; color: #111827; }
        table { border-collapse: collapse; width: 100%; table-layout: fixed; }
        .pdf-table { width: 100%; max-width: 100%; table-layout: fixed; }
        td, th { border: 1px solid #222; padding: 3px 4px; vertical-align: top; }
        .header { background: #f3f4f6; border: 1px solid #1f2937; }
        .header td { height: 34px; vertical-align: middle; }
        .brand { width: 14%; text-align: center; font-weight: bold; font-size: 10px; }
        .brand img { display: block; width: 30px; height: 30px; max-width: 100%; margin: 0 auto; object-fit: contain; }
        .header .title { width: 60%; text-align: center; vertical-align: middle; font-weight: bold; font-size: 11px; line-height: 1.2; }
        .meta { width: 26%; font-size: 7px; }
        .meta div { padding: 2px 0; }
        .section-date { font-weight: bold; height: 12px; }
        .data th { background: #d2d2d2; text-align: center; font-weight: bold; padding: 4px; }
        .data td { height: 14px; vertical-align: top; }
        .summary .col-no { width: 3%; }
        .summary .col-nopol { width: 23%; }
        .summary .col-type { width: 18%; }
        .summary .col-sj { width: 20%; }
        .summary .col-nominal { width: 18%; }
        .summary .col-paraf { width: 18%; }
        .thl-data .col-no { width: 3%; }
        .thl-data .col-name { width: 29%; }
        .thl-data .col-kubikasi { width: 11%; }
        .thl-data .col-drop-point { width: 14%; }
        .thl-data .col-position { width: 17%; }
        .thl-data .col-time { width: 13%; }
        .center { text-align: center; }
        .right { text-align: right; }
        .approval .col-heading { width: 15%; }
        .approval .col-signature { width: 42.5%; }
        .approval { margin: 7px 0; }
        .approval td { text-align: center; vertical-align: middle; }
        .approval .heading { height: 12px; font-weight: bold; }
        .approval .signature-space { height: 42px; }
        .approval .role { height: 13px; font-weight: bold; }
        .approval .signature-space { position: relative; }
        .stamp { display: inline-block; padding: 7px 16px; border: 2.5px solid currentColor; border-radius: 10px; transform: rotate(-14deg); opacity: 0.72; }
        .stamp-green { color: #15803d; border-color: #15803d; }
        .stamp-red { color: #dc2626; border-color: #dc2626; }
        .stamp-orange { color: #d97706; border-color: #d97706; }
        .stamp-text { display: block; font-size: 15px; font-weight: bold; letter-spacing: 3px; text-align: center; }
        .stamp-date { display: block; font-size: 7px; letter-spacing: 1px; text-align: center; border-top: 1px solid currentColor; margin-top: 2px; padding-top: 2px; }
        .reject-note { margin-top: 4px; font-size: 8px; font-weight: bold; color: #b91c1c; border: 1.5px solid #b91c1c; padding: 3px 6px; }
        .revisi-note { margin-top: 4px; font-size: 8px; font-weight: bold; color: #b45309; border: 1.5px solid #b45309; padding: 3px 6px; }
        .note { margin: 7px 0 8px; font-weight: bold; }
        .thl-header .title { width: 86%; }
        .thl-header td { height: 34px; }
        .thl-photos { height: 62px; vertical-align: top; padding: 3px; }
        .thl-photos img { width: 48px; height: 58px; object-fit: cover; margin-right: 3px; border: 1px solid #555; }
        .documents { margin-top: 8px; }
    </style>
</head>
<body>

<table class="header pdf-table">
    <colgroup>
        <col style="width: 14%;"><col style="width: 60%;"><col style="width: 26%;">
    </colgroup>
    <tr>
        <td class="brand">
            @if(!empty($logoData))
                <img src="data:image/jpeg;base64,{{ $logoData }}" alt="SNS">
            @else
                SNS
            @endif
        </td>
        <td class="title">FORM KLAIM BIAYA PENGAJUAN RETRIBUSI</td>
        <td class="meta">
            <div><b>DEPO</b> : {{ $biayaRetribusi->nama_depo ?: $biayaRetribusi->kode_depo }}</div>
            <div><b>Tanggal Pengajuan</b> : {{ optional($biayaRetribusi->tanggal_pengajuan)->format('d F Y') }}</div>
        </td>
    </tr>
</table>

<!-- Summary Table: No, NO KENDARAAN, JENIS KENDARAAN, SURAT JALAN, NOMINAL, Paraf -->
<table class="data summary pdf-table" style="margin-bottom: 8px;">
    <colgroup>
        <col class="col-no"><col class="col-nopol"><col class="col-type"><col class="col-sj"><col class="col-nominal"><col class="col-paraf">
    </colgroup>
    <thead>
        <tr><th>No</th><th>NO KENDARAAN</th><th>JENIS KENDARAAN</th><th>SURAT JALAN</th><th>NOMINAL</th><th>Paraf</th></tr>
    </thead>
    <tbody>
        @foreach($biayaRetribusi->details as $detail)
            <tr>
                <td class="center">{{ $loop->iteration }}</td>
                @php($kendaraanNopol = collect([$detail->nopol_kendaraan, $detail->biayaThlDetail?->kendaraan_nopol, ...($detail->biayaThlDetail?->vehicles?->pluck('nopol')->all() ?? [])])->flatMap(fn ($value) => preg_split('/[,;\n]+/', (string) $value))->map(fn ($value) => trim($value))->filter()->unique()->implode(', '))
                @php($kendaraanType = collect([$detail->type_kendaraan, $detail->biayaThlDetail?->kendaraan_type, ...($detail->biayaThlDetail?->vehicles?->pluck('type')->all() ?? [])])->flatMap(fn ($value) => preg_split('/[,;\n]+/', (string) $value))->map(fn ($value) => trim($value))->filter()->unique()->implode(', '))
                <td>{{ $kendaraanNopol ?: '-' }}</td>
                <td>{{ $kendaraanType ?: '-' }}</td>
                <td>
                    @php($suratJalans = collect([$detail->no_surat_jalan, $detail->biayaThlDetail?->kendaraan_sj, ...($detail->biayaThlDetail?->vehicles?->pluck('sj')->all() ?? [])])->flatMap(fn ($value) => preg_split('/[,;\n]+/', (string) $value))->map(fn ($value) => trim($value))->filter()->unique()->implode(', '))
                    {{ $suratJalans ?: '-' }}
                </td>
                <td class="center">Rp {{ number_format($detail->nominal_biaya, 0, ',', '.') }}</td>
                <td></td>
            </tr>
        @endforeach
        <tr><td colspan="4" class="center"><b>Total</b></td><td class="center"><b>Rp {{ number_format($biayaRetribusi->nominal_biaya, 0, ',', '.') }}</b></td><td></td></tr>
    </tbody>
</table>

<!-- Approval Table: Mengajukan, Mengetahui, Menyetujui, RFAH* -->
<table class="approval pdf-table" style="margin: 8px 0;">
    <colgroup>
        <col class="col-heading"><col class="col-signature"><col class="col-signature">
    </colgroup>
    <tr>
        @foreach(array_slice($approvalSections, 0, 2) as $section)
            <td class="heading">{{ $section['title'] }}</td>
        @endforeach
        @if(count($approvalSections) > 2)
            <td class="heading" colspan="{{ count($approvalSections) - 2 }}">Menyetujui</td>
        @endif
    </tr>
    <tr>
        @foreach($approvalSections as $section)
            <td class="signature-space">
                @php($stamp = $stamps[$section['title']] ?? null)
                @if($stamp)
                        @php($stampClass = match($stamp['text']) {
                            'DITOLAK' => 'stamp-red',
                            'REVISI' => 'stamp-orange',
                            default => 'stamp-green',
                        })
                    <div class="stamp {{ $stampClass }}">
                        <span class="stamp-text">{{ $stamp['text'] }}</span>
                        <span class="stamp-date">{{ $stamp['date'] }}</span>
                    </div>
                @endif
            </td>
        @endforeach
    </tr>
    <tr>
        @foreach($approvalSections as $section)
            <td>{{ $section['title'] === 'Mengajukan' ? ($biayaRetribusi->approval_pengajuan ?: '-') : ($section['people'][0]['name'] ?? '-') }}</td>
        @endforeach
    </tr>
    <tr>
        @foreach($approvalSections as $section)
            <td class="role">{{ $section['title'] === 'Mengajukan' ? ($biayaRetribusi->approval_pengajuan_level ?: 'BLC') : ($section['people'][0]['role'] ?? '-') }}</td>
        @endforeach
    </tr>
</table>

@if(collect($stamps)->contains(fn ($stamp) => ($stamp['text'] ?? null) === 'DITOLAK'))
    <div class="reject-note">DITOLAK — {{ $biayaRetribusi->rejection_reason ?: 'Tanpa alasan' }}</div>
@endif

@if(collect($stamps)->contains(fn ($stamp) => ($stamp['text'] ?? null) === 'REVISI'))
    <div class="revisi-note">REVISI — {{ $biayaRetribusi->revisi_reason ?: 'Tanpa catatan' }}</div>
@endif

<div class="note">Note: * Jika pengajuan biaya > Rp 750.000</div>

<!-- THL Header: FORM KLAIM TENAGA HARIAN LEPAS -->
<table class="header thl-header pdf-table" style="margin: 8px 0;">
    <colgroup>
        <col style="width: 14%;"><col style="width: 86%;">
    </colgroup>
    <tr>
        <td class="brand">
            @if(!empty($logoData))
                <img src="data:image/jpeg;base64,{{ $logoData }}" alt="SNS">
            @else
                SNS
            @endif
        </td>
        <td class="title">FORM KLAIM TENAGA HARIAN LEPAS</td>
    </tr>
    <tr><td colspan="2" class="section-date">TANGGAL {{ optional($biayaRetribusi->tanggal_pengajuan)->format('d F Y') }}</td></tr>
</table>

<!-- THL Data Table: No, Nama, Kubikasi, Drop Point, Posisi, Jam Datang, Jam Pulang -->
<table class="data thl-data pdf-table">
    <colgroup>
        <col class="col-no"><col class="col-name"><col class="col-kubikasi"><col class="col-drop-point"><col class="col-position"><col class="col-time"><col class="col-time">
    </colgroup>
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
                <td class="center">{{ $thl?->droppoint ?: 0 }}</td>
                <td>{{ $thl?->posisi ?: 'THL GUDANG' }}</td>
                <td class="center">{{ $thl?->jam_datang?->format('H:i') ?: '-' }}</td>
                <td class="center">{{ $thl?->jam_pulang?->format('H:i') ?: '-' }}</td>
            </tr>
        @endforeach
    </tbody>
</table>

<table class="pdf-table">
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
    <table class="data documents pdf-table">
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