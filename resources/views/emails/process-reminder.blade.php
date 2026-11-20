<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <title>Pengingat Proses Tertunda</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#18181b;">
    <div style="max-width:620px;margin:24px auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e4e4e7;">
        <div style="background:#27272a;padding:20px 24px;color:#ffffff;">
            <p style="margin:0;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#a5b4fc;">OneZentra WMS</p>
            <h1 style="margin:6px 0 0;font-size:20px;">⏰ Pengingat Proses Tertunda</h1>
        </div>
        <div style="padding:24px;">
            <p style="margin:0 0 16px;font-size:14px;line-height:1.6;">
                Berikut proses yang belum selesai lebih dari <strong>{{ $elapsedMinutes }} menit</strong> dan memerlukan tindakan:
            </p>
            <table style="width:100%;border-collapse:collapse;font-size:14px;">
                <tr>
                    <td style="padding:10px 12px;border:1px solid #e4e4e7;background:#fafafa;width:150px;"><strong>Proses</strong></td>
                    <td style="padding:10px 12px;border:1px solid #e4e4e7;">{{ $processLabel }}</td>
                </tr>
                <tr>
                    <td style="padding:10px 12px;border:1px solid #e4e4e7;background:#fafafa;"><strong>Dokumen</strong></td>
                    <td style="padding:10px 12px;border:1px solid #e4e4e7;">{{ $documentTitle }}</td>
                </tr>
                <tr>
                    <td style="padding:10px 12px;border:1px solid #e4e4e7;background:#fafafa;"><strong>Depo</strong></td>
                    <td style="padding:10px 12px;border:1px solid #e4e4e7;">{{ $depot }}</td>
                </tr>
                <tr>
                    <td style="padding:10px 12px;border:1px solid #e4e4e7;background:#fafafa;"><strong>Tertunda</strong></td>
                    <td style="padding:10px 12px;border:1px solid #e4e4e7;font-weight:bold;">{{ $elapsedMinutes }} menit</td>
                </tr>
            </table>
            <p style="margin:20px 0 0;font-size:13px;line-height:1.6;color:#52525b;">
                Silakan buka aplikasi ONEZENTRA untuk menindaklanjuti. Pengingat ini dikirim otomatis maksimal sekali setiap 2 jam per dokumen.
            </p>
        </div>
    </div>
</body>
</html>
