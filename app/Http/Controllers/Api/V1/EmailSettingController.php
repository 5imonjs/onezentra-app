<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\EmailNotificationLog;
use App\Models\EmailSetting;
use App\Services\EmailNotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Mail;

class EmailSettingController extends Controller
{
    public function __construct(private EmailNotificationService $emailService) {}

    public function show(): JsonResponse
    {
        $setting = EmailSetting::latest('id')->first();

        return response()->json([
            'data' => $setting ? $setting->makeHidden(['password']) : [
                'mailer' => 'smtp',
                'host' => null,
                'port' => 587,
                'username' => null,
                'password' => null,
                'encryption' => 'tls',
                'from_address' => null,
                'from_name' => null,
                'from_system_env' => true,
                'is_active' => false,
            ],
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'mailer' => 'nullable|string|max:20',
            'host' => 'nullable|string|max:255',
            'port' => 'nullable|integer',
            'username' => 'nullable|string|max:255',
            'password' => 'nullable|string|max:255',
            'encryption' => 'nullable|string|max:20',
            'from_address' => 'nullable|email|max:255',
            'from_name' => 'nullable|string|max:255',
            'from_system_env' => 'nullable|boolean',
            'is_active' => 'nullable|boolean',
        ]);

        // Password SMTP harus di-encrypt (bukan bcrypt) agar bisa didekripsi saat applySmtpSettings.
        // Cast 'encrypted' di model akan otomatis encrypt saat set.
        if (array_key_exists('password', $validated) && blank($validated['password'])) {
            unset($validated['password']);
        }

        if (array_key_exists('encryption', $validated) && $validated['encryption'] === null) {
            $validated['encryption'] = '';
        }

        $setting = EmailSetting::latest('id')->first();
        if ($setting) {
            $setting->update($validated);
        } else {
            $setting = EmailSetting::create($validated);
        }

        return response()->json([
            'message' => 'Email setting saved',
            'data' => $setting->makeHidden(['password']),
        ]);
    }

    public function test(Request $request): JsonResponse
    {
        $to = $request->validate(['to' => 'required|email'])['to'];

        try {
            // Uji kredensial yang tersimpan walau pengiriman belum diaktifkan,
            // agar admin bisa memastikan konfigurasi benar sebelum go-live.
            $this->emailService->applySmtpSettings(force: true);

            // Transport bisa sudah dibuat sebelum config diubah; buang agar
            // percobaan ini memakai host/kredensial yang baru.
            $mailer = Mail::getFacadeRoot();
            if (method_exists($mailer, 'purge')) {
                $mailer->purge();
            }

            $driver = (string) config('mail.default');
            if ($driver === 'log') {
                return response()->json([
                    'message' => 'Email test tidak dikirim: mailer masih "log". Matikan "Gunakan kredensial dari .env" atau isi MAIL_* di .env, lalu simpan ulang.',
                ], 422);
            }

            Mail::raw(
                'Test email dari ONEZENTRA Warehouse System. Pengaturan email berhasil.',
                function ($message) use ($to) {
                    $message->to($to)->subject('Test Email ONEZENTRA');
                }
            );

            return response()->json([
                'message' => 'Email test sent',
                'mailer' => $driver,
                'host' => config('mail.mailers.smtp.host'),
                'port' => config('mail.mailers.smtp.port'),
            ]);
        } catch (\Throwable $e) {
            report($e);

            $raw = $e->getMessage();
            $firstLine = trim((string) strtok($raw, "\n"));

            // Gmail menolak password akun biasa (535) — arahkan ke App Password
            // supaya admin tidak mengulang kesalahan yang sama.
            if (str_contains($raw, '535') || str_contains($raw, 'Username and Password not accepted')) {
                $firstLine = 'Kredensial SMTP ditolak (535). Untuk Gmail gunakan App Password 16 karakter, bukan password akun, dan pastikan 2-Step Verification aktif.';
            }

            return response()->json([
                'message' => 'Gagal mengirim email uji: '.$firstLine,
            ], 500);
        }
    }

    /**
     * Jejak kegagalan/skip notifikasi (hanya yang bermasalah yang dicatat).
     */
    public function notificationLogs(Request $request): JsonResponse
    {
        $query = EmailNotificationLog::query()->orderByDesc('id');

        if ($request->filled('status')) {
            $query->where('status', $request->input('status'));
        }

        return response()->json(['data' => $query->paginate($this->perPage($request, 25))]);
    }
}
