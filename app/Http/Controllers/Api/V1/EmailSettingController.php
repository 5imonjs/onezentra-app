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
            $this->emailService->applySmtpSettings();

            Mail::raw(
                'Test email dari ONEZENTRA Warehouse System. Pengaturan email berhasil.',
                function ($message) use ($to) {
                    $message->to($to)->subject('Test Email ONEZENTRA');
                }
            );

            return response()->json(['message' => 'Email test sent']);
        } catch (\Throwable $e) {
            report($e);

            return response()->json(['message' => 'Gagal mengirim email uji.'], 500);
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
