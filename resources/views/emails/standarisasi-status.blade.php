<!DOCTYPE html>
<html>
<body style="font-family: Arial, Helvetica, sans-serif; color: #1f2937; line-height: 1.5;">
    <div style="max-width: 640px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
        <div style="background: linear-gradient(to right, #111827, #1f2937); padding: 24px; color: #fff;">
            <h1 style="margin: 0; font-size: 20px;">Standarisasi Tumpukan {{ $standarisasi->status === 'approved' ? 'Disetujui' : ($standarisasi->status === 'rejected' ? 'Ditolak' : 'Diajukan') }}</h1>
            <p style="margin: 4px 0 0; color: #9ca3af; font-size: 13px;">ONEZENTRA Warehouse Management</p>
        </div>
        <div style="padding: 24px;">
            <p>Halo,<br><br>
                Standarisasi tumpukan untuk produk <strong>{{ $standarisasi->npn->szNickName ?? $standarisasi->npn->BOSnetszProductId ?? '-' }}</strong>
                telah <strong>{{ $standarisasi->status === 'approved' ? 'DISETUJUI' : ($standarisasi->status === 'rejected' ? 'DITOLAK' : 'DIAJUKAN') }}</strong>
                @if($standarisasi->status === 'approved' && $standarisasi->approved_by_email)
                    oleh {{ $standarisasi->approved_by_email }}
                @elseif($standarisasi->status === 'pending' && $standarisasi->requested_by_email)
                    oleh {{ $standarisasi->requested_by_email }}
                @endif
                pada <strong>{{ $standarisasi->updated_at ? optional($standarisasi->updated_at)->format('d-m-Y H:i') : date('d-m-Y H:i') }}</strong>.
            </p>

            <table style="width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 14px;">
                <tr>
                    <td style="padding: 6px 0; color: #6b7280; width: 160px;">Kode Produk (BOSnet)</td>
                    <td style="padding: 6px 0; font-weight: 600;">{{ $standarisasi->npn->BOSnetszProductId ?? '-' }}</td>
                </tr>
                <tr>
                    <td style="padding: 6px 0; color: #6b7280;">Nama Produk</td>
                    <td style="padding: 6px 0; font-weight: 600;">{{ $standarisasi->npn->szNickName ?? '-' }}</td>
                </tr>
                <tr>
                    <td style="padding: 6px 0; color: #6b7280;">Tier</td>
                    <td style="padding: 6px 0; font-weight: 600;">{{ $standarisasi->tier ?? '-' }}</td>
                </tr>
                <tr>
                    <td style="padding: 6px 0; color: #6b7280;">Tinggi Tumpukan</td>
                    <td style="padding: 6px 0; font-weight: 600;">{{ $standarisasi->tinggi_tumpukan ?? '-' }}</td>
                </tr>
                <tr>
                    <td style="padding: 6px 0; color: #6b7280;">Total Tier &times; Tinggi</td>
                    <td style="padding: 6px 0; font-weight: 600;">{{ $standarisasi->total_tier_tinggi ?? '-' }}</td>
                </tr>
                <tr>
                    <td style="padding: 6px 0; color: #6b7280;">Status</td>
                    <td style="padding: 6px 0; font-weight: 600;">
                        <span style="{{ $standarisasi->status === 'approved' ? 'color: #047857;' : ($standarisasi->status === 'rejected' ? 'color: #b91c1c;' : 'color: #b45309;') }}">
                            {{ strtoupper($standarisasi->status ?? '-') }}
                        </span>
                    </td>
                </tr>
                @if($standarisasi->kode_depo)
                <tr>
                    <td style="padding: 6px 0; color: #6b7280;">Depo</td>
                    <td style="padding: 6px 0; font-weight: 600;">{{ $standarisasi->nama_depo ?? $standarisasi->kode_depo }}</td>
                </tr>
                @endif
            </table>

            <p style="margin-top: 20px; font-size: 13px; color: #6b7280;">Email ini dikirim otomatis oleh sistem. Mohon tidak membalas email ini.</p>
        </div>
    </div>
</body>
</html>