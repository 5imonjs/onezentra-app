<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <meta name="supported-color-schemes" content="light dark">
    <title>@yield('title', 'ONEZENTRA')</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;color:#0f172a;font-family:Arial,Helvetica,sans-serif;line-height:1.55;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;">
        <tr>
            <td align="center" style="padding:24px 12px;">
                <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:640px;max-width:100%;background:#ffffff;border:1px solid #cbd5e1;">
                    <tr>
                        <td bgcolor="{{ $headerBg ?? '#0f172a' }}" style="background:{{ $headerBg ?? '#0f172a' }};padding:24px;color:#ffffff;">
                            <h1 style="margin:0;font-size:20px;line-height:1.25;">@yield('title')</h1>
                            <p style="margin:4px 0 0;color:{{ $headerSubColor ?? '#e2e8f0' }};font-size:13px;">ONEZENTRA Warehouse Management</p>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:24px;color:#0f172a;">
                            @yield('content')
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:16px 24px;background:#f8fafc;color:#475569;font-size:13px;border-top:1px solid #cbd5e1;">
                            Email ini dikirim otomatis oleh sistem. Mohon tidak membalas email ini.
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
