<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <title>Rencana Tiba Terlewat</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#18181b;">
    <div style="max-width:620px;margin:24px auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e4e4e7;">
        <div style="background:#27272a;padding:20px 24px;color:#ffffff;">
            <p style="margin:0;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#a5b4fc;">OneZentra WMS</p>
            <h1 style="margin:6px 0 0;font-size:20px;">⏰ Rencana Tiba Terlewat — Belum Check-in</h1>
        </div>
        <div style="padding:24px;">
            <p style="margin:0 0 16px;font-size:14px;line-height:1.6;">
                Rencana kirim berikut sudah melewati <strong>rencana tiba</strong> yang ditentukan planner, tetapi kendaraan <strong>belum melakukan check-in</strong> di depo.
            </p>
            <table style="width:100%;border-collapse:collapse;font-size:14px;">
                <tr>
                    <td style="padding:10px 12px;border:1px solid #e4e4e7;background:#fafafa;width:150px;"><strong>Dokumen</strong></td>
                    <td style="padding:10px 12px;border:1px solid #e4e4e7;">{{ $documentTitle }}</td>
                </tr>
                <tr>
                    <td style="padding:10px 12px;border:1px solid #e4e4e7;background:#fafafa;"><strong>Depo Tujuan</strong></td>
                    <td style="padding:10px 12px;border:1px solid #e4e4e7;">{{ $depot }}</td>
                </tr>
                <tr>
                    <td style="padding:10px 12px;border:1px solid #e4e4e7;background:#fafafa;"><strong>Rencana Tiba</strong></td>
                    <td style="padding:10px 12px;border:1px solid #e4e4e7;">{{ $etaDate }}</td>
                </tr>
                <tr>
                    <td style="padding:10px 12px;border:1px solid #e4e4e7;background:#fafafa;"><strong>Keterlambatan</strong></td>
                    <td style="padding:10px 12px;border:1px solid #e4e4e7;font-weight:bold;">{{ $daysOverdue }} hari</td>
                </tr>
            </table>
            <p style="margin:20px 0 0;font-size:13px;line-height:1.6;color:#52525b;">
                Silakan cek status pengiriman di modul Rencana Kirim. Pengingat ini dikirim otomatis maksimal sekali setiap 2 jam per dokumen.
            </p>
        </div>
    </div>
</body>
</html>
