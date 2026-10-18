<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\EmailRecipient;
use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class EmailRecipientController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        // Filter dipisah sebagai factory agar tiap kebutuhan (ringkasan,
        // daftar depo, halaman aktif, sampel bermasalah) memakai builder
        // bersih dan tidak saling mewarisi klausa.
        $makeQuery = fn (): Builder => EmailRecipient::query()
            ->when($request->filled('document_type'), fn ($q) => $q->where('document_type', $request->document_type))
            ->when($request->filled('trigger'), fn ($q) => $q->where('trigger', $request->trigger))
            ->when($request->filled('field'), fn ($q) => $q->where('field', $request->field))
            ->when($request->filled('kode_depo'), fn ($q) => $q->where('kode_depo', $request->input('kode_depo')))
            ->when($request->filled('search'), function ($q) use ($request) {
                // Cermin lapangan yang dicari di klien agar hasil konsisten
                // ketika pencarian dipindah ke server (paginasi). Wildcard
                // LIKE di-escape agar `%`/`_` diperlakukan sebagai teks biasa.
                $pattern = $this->likeContains((string) $request->input('search'));
                $q->where(function ($qq) use ($pattern) {
                    $qq->whereRaw('email LIKE ? ESCAPE ?', [$pattern, '\\']);
                    foreach (['label', 'role_slug', 'document_type', 'trigger', 'field', 'kode_depo'] as $column) {
                        $qq->orWhereRaw("{$column} LIKE ? ESCAPE ?", [$pattern, '\\']);
                    }
                    $qq->orWhereHas('user', fn ($u) => $u->whereRaw('users.full_name LIKE ? ESCAPE ?', [$pattern, '\\']));
                });
            });

        $orderByRecipient = fn (Builder $query): Builder => $query
            ->orderBy('document_type')
            ->orderBy('trigger')
            ->orderBy('field');

        // Klien lama (tanpa parameter paginasi) tetap menerima seluruh baris.
        if (! $request->filled('per_page') && ! $request->filled('page')) {
            $data = $orderByRecipient($makeQuery()->with('user:id,full_name,email'))->get();

            return response()->json(['data' => $this->withResolution($data)]);
        }

        // Ringkasan dihitung di SQL atas SELURUH baris terfilter, tanpa
        // menghidrasi tabel hanya untuk keperluan hitungan.
        $aggregate = $makeQuery()
            ->selectRaw('COUNT(*) as total')
            ->selectRaw("SUM(CASE WHEN field = 'TO' THEN 1 ELSE 0 END) as to_count")
            ->selectRaw("SUM(CASE WHEN field = 'CC' THEN 1 ELSE 0 END) as cc_count")
            ->first();
        $totalRows = (int) ($aggregate->total ?? 0);
        $toCount = (int) ($aggregate->to_count ?? 0);
        $ccCount = (int) ($aggregate->cc_count ?? 0);

        // UI mengelompokkan penerima per depo. Paginasi dilakukan per DEPO
        // (bukan per baris) agar satu halaman selalu berisi grup depo yang
        // utuh — tampilan TO/CC per depo tidak pernah terpotong. Depot blank
        // (null/''/spasi) dinormalkan ke satu grup Global.
        $depotKeys = $makeQuery()->select('kode_depo')->distinct()->pluck('kode_depo')
            ->map(fn ($kode) => blank($kode) ? null : (string) $kode)
            ->unique()
            ->sort(function ($a, $b): int {
                if ($a === $b) {
                    return 0;
                }
                if ($a === null) {
                    return -1;
                }
                if ($b === null) {
                    return 1;
                }

                return strcmp($a, $b);
            })
            ->values();

        $perPage = min(max($request->integer('per_page', 8), 1), 50);
        $lastPage = max((int) ceil($depotKeys->count() / $perPage), 1);
        $page = min(max($request->integer('page', 1), 1), $lastPage);
        $pageKeys = $depotKeys->slice(($page - 1) * $perPage, $perPage)
            ->map(fn ($kode) => (string) ($kode ?? ''))
            ->values()
            ->all();

        $rows = $this->constrainToDepotKeys(
            $orderByRecipient($makeQuery()->with('user:id,full_name,email')),
            $pageKeys,
        )->get();

        // Baris bermasalah dihitung di SQL (bukan dari koleksi penuh); hanya
        // sampelnya (maks 5) yang dihidrasi agar `resolved_count` ikut terisi.
        $brokenQuery = fn (): Builder => $this->unresolvedQuery($makeQuery());
        $brokenCount = $brokenQuery()->count();
        $brokenSample = $orderByRecipient($brokenQuery()->with('user:id,full_name,email'))
            ->limit(5)
            ->get();

        return response()->json([
            'data' => $this->withResolution($rows),
            'meta' => [
                'group' => 'depo',
                'page' => $page,
                'per_page' => $perPage,
                'last_page' => $lastPage,
                'total_groups' => $depotKeys->count(),
                'total_rows' => $totalRows,
                'has_prev' => $page > 1,
                'has_next' => $page < $lastPage,
            ],
            // Ringkasan dihitung dari SELURUH baris terfilter (bukan hanya
            // halaman aktif) supaya kartu audit & alert tetap akurat.
            'summary' => [
                'total' => $totalRows,
                'to' => $toCount,
                'cc' => $ccCount,
                'ok' => max($totalRows - $brokenCount, 0),
                'broken' => $brokenCount,
                'broken_sample' => $this->withResolution($brokenSample),
            ],
        ]);
    }

    /**
     * Batasi query ke baris pada grup depo halaman aktif. Kunci `''` mewakili
     * grup Global (kode_depo null / kosong / spasi-putih) — penanganan spasi
     * harus sama dengan normalisasi `blank()` agar baris tak "menghilang".
     *
     * @param  array<int, string>  $pageKeys
     */
    private function constrainToDepotKeys(Builder $query, array $pageKeys): Builder
    {
        $includeGlobal = in_array('', $pageKeys, true);
        $codes = array_values(array_filter($pageKeys, fn (string $kode): bool => $kode !== ''));

        if (! $includeGlobal && $codes === []) {
            return $query->whereRaw('1 = 0');
        }

        return $query->where(function ($q) use ($includeGlobal, $codes): void {
            if ($includeGlobal) {
                $q->where(function ($qq): void {
                    $qq->whereNull('kode_depo')->orWhereRaw("TRIM(kode_depo) = ''");
                });
            }
            if ($codes !== []) {
                $q->orWhereIn('kode_depo', $codes);
            }
        });
    }

    /**
     * Batasi query ke baris aktif yang TIDAK akan terkirim — cermin
     * `resolveProblem` di web: alamat email kosong, user nonaktif/tanpa
     * email/dihapus, atau role tanpa user aktif ber-email. Dibuat di SQL agar
     * hitungan & sampel tidak perlu menghidrasi seluruh tabel.
     */
    private function unresolvedQuery(Builder $query): Builder
    {
        return $query->where('is_active', true)->where(function ($q): void {
            $q->where(function ($email): void {
                $email->whereNotIn('recipient_type', ['role', 'user'])
                    ->where(fn ($e) => $e->whereNull('email')->orWhere('email', ''));
            })->orWhere(function ($user): void {
                $user->where('recipient_type', 'user')
                    ->where(function ($u): void {
                        $u->whereNull('user_id')->orWhereNotExists(fn ($sub) => $sub
                            ->selectRaw('1')
                            ->from('users')
                            ->whereColumn('users.id', 'email_recipients.user_id')
                            ->where('users.status', 'active')
                            ->whereNotNull('users.email')
                            ->where('users.email', '<>', ''));
                    });
            })->orWhere(function ($role): void {
                $role->where('recipient_type', 'role')
                    ->where(function ($r): void {
                        $r->whereNull('role_slug')->orWhereNotExists(fn ($sub) => $sub
                            ->selectRaw('1')
                            ->from('users')
                            ->join('role_user', 'role_user.user_id', '=', 'users.id')
                            ->join('roles', 'roles.id', '=', 'role_user.role_id')
                            ->whereColumn('roles.slug', 'email_recipients.role_slug')
                            ->where('users.status', 'active')
                            ->whereNotNull('users.email')
                            ->where('users.email', '<>', ''));
                    });
            });
        });
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $this->validateRecipient($request);

        $recipient = EmailRecipient::create($validated);

        return response()->json([
            'message' => 'Email recipient created',
            'data' => $this->withResolution(collect([$recipient->load('user:id,full_name,email')]))->first(),
        ], 201);
    }

    public function update(Request $request, EmailRecipient $emailRecipient): JsonResponse
    {
        $validated = $this->validateRecipient($request, $emailRecipient->id);

        $emailRecipient->update($validated);

        return response()->json([
            'message' => 'Email recipient updated',
            'data' => $this->withResolution(collect([$emailRecipient->fresh('user:id,full_name,email')]))->first(),
        ]);
    }

    public function destroy(EmailRecipient $emailRecipient): JsonResponse
    {
        $emailRecipient->delete();

        return response()->json(['message' => 'Email recipient deleted']);
    }

    public function options(): JsonResponse
    {
        $users = User::where('status', 'active')->select('id', 'full_name', 'email')->orderBy('full_name')->get();
        $roles = Role::select('id', 'name', 'slug')->orderBy('name')->get();
        $depots = User::whereNotNull('kode_depo')
            ->select('kode_depo', 'nama_depo')
            ->distinct()
            ->orderBy('kode_depo')
            ->get();
        $types = ['rencana_kirim', 'sj_ba', 'receiving', 'selisih', 'standarisasi_tumpukan', 'biaya_thl', 'biaya_retribusi', 'opname_expired'];
        $triggers = ['created', 'cancelled', 'validated', 'completed', 'selisih_qty', 'approved', 'rejected', 'submitted', 'checked', 'rlh_approved', 'revisi', 'reminder'];
        $fields = ['TO', 'CC'];

        return response()->json([
            'document_types' => $types,
            'triggers' => $triggers,
            'fields' => $fields,
            'users' => $users,
            'roles' => $roles,
            'depots' => $depots,
        ]);
    }

    /**
     * Tambahkan status resolusi per baris agar UI bisa menandai penerima
     * yang tidak akan terkirim (role yatim / tanpa user aktif / user nonaktif).
     * Dihitung batch (2 query) agar tidak N+1.
     *
     * @param  Collection<int, EmailRecipient>  $recipients
     * @return Collection<int, array>
     */
    private function withResolution($recipients)
    {
        $roleSlugs = $recipients->where('recipient_type', 'role')->pluck('role_slug')->filter()->unique()->values();
        $existingRoles = $roleSlugs->isNotEmpty()
            ? Role::whereIn('slug', $roleSlugs)->pluck('slug')->all()
            : [];
        $roleCounts = $roleSlugs->isNotEmpty()
            ? DB::table('users')
                ->join('role_user', 'role_user.user_id', '=', 'users.id')
                ->join('roles', 'roles.id', '=', 'role_user.role_id')
                ->where('users.status', 'active')
                ->whereNotNull('users.email')
                ->where('users.email', '<>', '')
                ->whereIn('roles.slug', $roleSlugs)
                ->groupBy('roles.slug')
                ->selectRaw('roles.slug, COUNT(DISTINCT users.id) as c')
                ->pluck('c', 'slug')
            : collect();

        $userIds = $recipients->where('recipient_type', 'user')->pluck('user_id')->filter()->unique()->values();
        $validUserIds = $userIds->isNotEmpty()
            ? User::whereIn('id', $userIds)->where('status', 'active')->whereNotNull('email')->where('email', '<>', '')->pluck('id')->all()
            : [];

        return $recipients->map(function (EmailRecipient $r) use ($roleCounts, $validUserIds) {
            $arr = $r->toArray();
            $arr['resolved_count'] = match ($r->recipient_type) {
                'role' => (int) ($roleCounts[$r->role_slug] ?? 0),
                'user' => in_array($r->user_id, $validUserIds, true) ? 1 : 0,
                default => blank($r->email) ? 0 : 1,
            };

            return $arr;
        });
    }

    private function validateRecipient(Request $request, ?int $ignoreId = null): array
    {
        $data = $request->validate([
            'document_type' => 'required|string|in:rencana_kirim,sj_ba,receiving,selisih,standarisasi_tumpukan,biaya_thl,biaya_retribusi,opname_expired',
            'trigger' => 'required|string|in:created,cancelled,validated,completed,selisih_qty,approved,rejected,submitted,checked,rlh_approved,revisi,reminder',
            'recipient_type' => 'required|string|in:email,user,role',
            'field' => 'required|string|in:TO,CC',
            'kode_depo' => 'nullable|string|max:10',
            'email' => 'nullable|email|max:255',
            'user_id' => 'nullable|exists:users,id',
            'role_slug' => 'nullable|string|exists:roles,slug|max:50',
            'label' => 'nullable|string|max:100',
            'is_active' => 'nullable|boolean',
        ]);

        $errors = match ($data['recipient_type']) {
            'email' => blank($data['email'] ?? null) ? ['email' => ['Email wajib diisi untuk recipient type email.']] : [],
            'user' => empty($data['user_id']) ? ['user_id' => ['User wajib dipilih untuk recipient type user.']] : [],
            'role' => blank($data['role_slug'] ?? null) ? ['role_slug' => ['Role wajib dipilih untuk recipient type role.']] : [],
        };

        if ($errors) {
            throw ValidationException::withMessages($errors);
        }

        return $data;
    }
}
