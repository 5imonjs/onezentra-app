<!DOCTYPE html>
<html>
<body style="font-family: Arial, Helvetica, sans-serif; color: #1f2937; line-height: 1.5;">
    <div style="max-width: 640px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
        <div style="background: linear-gradient(to right, #111827, #1f2937); padding: 24px; color: #fff;">
            <h1 style="margin: 0; font-size: 20px;">Pengajuan {{ $moduleLabel }} {{ $subjectLabel }}</h1>
            <p style="margin: 4px 0 0; color: #9ca3af; font-size: 13px;">ONEZENTRA Warehouse Management</p>
        </div>
        <div style="padding: 24px;">
            <p>Halo,<br><br>
                Pengajuan <strong>{{ $moduleLabel }}</strong> dengan nominal
                <strong>{{ 'Rp ' . number_format((float) $biaya->nominal_biaya, 0, ',', '.') }}</strong>
                telah <strong>{{ $subjectLabel === 'Ditolak' ? 'DITOLAK' : ($subjectLabel === 'Perlu Revisi' ? 'DIKEMBALIKAN UNTUK REVISI' : strtoupper($subjectLabel)) }}</strong>
                @if($actorName)
                    oleh <strong>{{ $actorName }}</strong>
                @endif
                pada <strong>{{ $actorTime ?: date('d-m-Y H:i') }}</strong>.
            </p>

            @if($subjectLabel === 'Ditolak' && $biaya->rejection_reason)
                <div style="margin-top: 16px; padding: 12px 16px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px;">
                    <p style="margin: 0; font-size: 13px; color: #b91c1c;"><strong>Alasan penolakan:</strong><br>{{ $biaya->rejection_reason }}</p>
                </div>
            @endif

            @if($subjectLabel === 'Perlu Revisi' && $biaya->revisi_reason)
                <div style="margin-top: 16px; padding: 12px 16px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px;">
                    <p style="margin: 0; font-size: 13px; color: #b45309;"><strong>Catatan revisi:</strong><br>{{ $biaya->revisi_reason }}</p>
                </div>
            @endif

            <table style="width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 14px;">
                <tr>
                    <td style="padding: 6px 0; color: #6b7280; width: 160px;">Jenis Pengajuan</td>
                    <td style="padding: 6px 0; font-weight: 600;">{{ $moduleLabel }}</td>
                </tr>
                <tr>
                    <td style="padding: 6px 0; color: #6b7280;">Tanggal Pengajuan</td>
                    <td style="padding: 6px 0; font-weight: 600;">{{ optional($biaya->tanggal_pengajuan)->format('d-m-Y') ?: '-' }}</td>
                </tr>
                <tr>
                    <td style="padding: 6px 0; color: #6b7280;">Depo</td>
                    <td style="padding: 6px 0; font-weight: 600;">{{ $biaya->nama_depo ?? $biaya->kode_depo ?? '-' }}</td>
                </tr>
                @if($biaya instanceof \App\Models\BiayaThl)
                <tr>
                    <td style="padding: 6px 0; color: #6b7280;">Kendaraan</td>
                    <td style="padding: 6px 0; font-weight: 600;">{{ $biaya->no_kendaraan ?? '-' }}</td>
                </tr>
                @endif
                <tr>
                    <td style="padding: 6px 0; color: #6b7280;">Total Biaya</td>
                    <td style="padding: 6px 0; font-weight: 600;">{{ 'Rp ' . number_format((float) $biaya->nominal_biaya, 0, ',', '.') }}</td>
                </tr>
                @if($biaya->is_rfah_required)
                <tr>
                    <td style="padding: 6px 0; color: #6b7280;">RFAH*</td>
                    <td style="padding: 6px 0; font-weight: 600;">{{ $biaya->rfah_name ?: 'Diperlukan' }}</td>
                </tr>
                @endif
                <tr>
                    <td style="padding: 6px 0; color: #6b7280;">Status</td>
                    <td style="padding: 6px 0; font-weight: 600;">
                        @if(in_array($subjectLabel, ['Disetujui', 'Disetujui RLH'], true))
                            <span style="color: #047857;">
                        @elseif($subjectLabel === 'Ditolak')
                            <span style="color: #b91c1c;">
                        @else
                            <span style="color: #b45309;">
                        @endif
                            {{ strtoupper($biaya->status ?? '-') }}
                        </span>
                    </td>
                </tr>
            </table>

            @if($biaya->is_rfah_required)
                <p style="margin-top: 16px; font-size: 12px; color: #9ca3af;">
                    * Nilai pengajuan di atas ketentuan sehingga memerlukan pemantauan RFAH ({{ $biaya->rfah_name ?: '-' }}).
                </p>
            @endif

            <p style="margin-top: 20px; font-size: 13px; color: #6b7280;">Email ini dikirim otomatis oleh sistem. Mohon tidak membalas email ini.</p>
        </div>
    </div>
</body>
</html>