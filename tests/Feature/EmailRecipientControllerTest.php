<?php

namespace Tests\Feature;

use App\Models\EmailRecipient;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class EmailRecipientControllerTest extends TestCase
{
    use RefreshDatabase;

    private function userWith(array $permSlugs): User
    {
        $role = Role::firstOrCreate(['slug' => 'recipient_test'], ['name' => 'Recipient Test']);
        foreach ($permSlugs as $slug) {
            $perm = Permission::firstOrCreate(['slug' => $slug], ['name' => $slug, 'menu_group' => 'Test']);
            $role->permissions()->syncWithoutDetaching([$perm->id]);
        }
        $user = User::create([
            'email' => 'rec-'.uniqid().'@test.com', 'password' => 'password', 'full_name' => 'Recipient User',
            'kode_depo' => 'DPO', 'nama_depo' => 'Depo Test', 'level' => 'staff_logistic', 'status' => 'active',
        ]);
        $role->users()->attach($user->id);

        return $user;
    }

    private function payload(array $overrides = []): array
    {
        return array_merge([
            'document_type' => 'biaya_thl', 'trigger' => 'submitted',
            'recipient_type' => 'email', 'field' => 'TO', 'email' => 'tujuan@test.com',
        ], $overrides);
    }

    public function test_index_requires_view_permission(): void
    {
        Sanctum::actingAs($this->userWith([]));

        $this->getJson('/api/v1/email-recipients')->assertForbidden();
    }

    public function test_store_requires_email_for_email_type(): void
    {
        Sanctum::actingAs($this->userWith(['emails.view', 'emails.edit']));

        $this->postJson('/api/v1/email-recipients', $this->payload(['email' => null]))
            ->assertStatus(422)
            ->assertJsonFragment(['message' => 'Email wajib diisi untuk recipient type email.']);
    }

    public function test_store_rejects_unknown_document_type(): void
    {
        Sanctum::actingAs($this->userWith(['emails.edit']));

        $this->postJson('/api/v1/email-recipients', $this->payload(['document_type' => 'gaji']))
            ->assertJsonValidationErrors(['document_type']);
    }

    public function test_store_update_delete_flow(): void
    {
        Sanctum::actingAs($this->userWith(['emails.view', 'emails.edit']));

        $id = $this->postJson('/api/v1/email-recipients', $this->payload())
            ->assertCreated()
            ->assertJsonPath('data.resolved_count', 1)
            ->json('data.id');

        $this->putJson("/api/v1/email-recipients/{$id}", $this->payload(['field' => 'CC']))
            ->assertOk()->assertJsonPath('data.field', 'CC');

        $this->deleteJson("/api/v1/email-recipients/{$id}")->assertOk();
        $this->assertDatabaseMissing('email_recipients', ['id' => $id]);
    }

    public function test_options_include_selisih_values(): void
    {
        Sanctum::actingAs($this->userWith(['emails.view']));

        $res = $this->getJson('/api/v1/email-recipients/options')->assertOk();

        $this->assertContains('selisih', $res->json('document_types'));
        $this->assertContains('selisih_qty', $res->json('triggers'));
    }

    public function test_options_expose_document_type_triggers_map(): void
    {
        Sanctum::actingAs($this->userWith(['emails.view']));

        $res = $this->getJson('/api/v1/email-recipients/options')->assertOk();

        // Peta dokumen → trigger adalah sumber dropdown UI; `submitted` untuk
        // Standarisasi Tumpukan pernah hilang dari peta frontend sehingga tak
        // bisa dipilih, padahal controller tetap mengirimnya.
        $this->assertSame(
            ['submitted', 'approved', 'rejected'],
            $res->json('document_type_triggers.standarisasi_tumpukan'),
        );
        $this->assertSame(
            ['created', 'cancelled'],
            $res->json('document_type_triggers.rencana_kirim'),
        );
    }

    public function test_store_rejects_trigger_not_valid_for_document_type(): void
    {
        Sanctum::actingAs($this->userWith(['emails.edit']));

        $this->postJson('/api/v1/email-recipients', $this->payload([
            'document_type' => 'receiving',
            'trigger' => 'reminder',
        ]))->assertStatus(422)->assertJsonValidationErrors(['trigger']);
    }

    public function test_store_accepts_standarisasi_submitted_trigger(): void
    {
        Sanctum::actingAs($this->userWith(['emails.view', 'emails.edit']));

        $this->postJson('/api/v1/email-recipients', $this->payload([
            'document_type' => 'standarisasi_tumpukan',
            'trigger' => 'submitted',
        ]))->assertCreated();
    }

    public function test_store_role_recipient_requires_existing_role(): void
    {
        Sanctum::actingAs($this->userWith(['emails.edit']));

        $this->postJson('/api/v1/email-recipients', $this->payload([
            'recipient_type' => 'role',
            'role_slug' => 'tidak-ada',
        ]))->assertJsonValidationErrors(['role_slug']);
    }

    public function test_store_role_recipient_without_role_slug_is_rejected(): void
    {
        Sanctum::actingAs($this->userWith(['emails.edit']));

        $this->postJson('/api/v1/email-recipients', $this->payload([
            'recipient_type' => 'role',
        ]))->assertStatus(422)
            ->assertJsonFragment(['message' => 'Role wajib dipilih untuk recipient type role.']);
    }

    public function test_store_user_recipient_requires_existing_user(): void
    {
        Sanctum::actingAs($this->userWith(['emails.edit']));

        $this->postJson('/api/v1/email-recipients', $this->payload([
            'recipient_type' => 'user',
            'user_id' => 999999,
        ]))->assertJsonValidationErrors(['user_id']);
    }

    public function test_options_requires_view_permission(): void
    {
        Sanctum::actingAs($this->userWith([]));

        $this->getJson('/api/v1/email-recipients/options')->assertForbidden();
    }

    public function test_destroy_requires_edit_permission(): void
    {
        Sanctum::actingAs($this->userWith(['emails.view']));
        $recipient = $this->recipient();

        $this->deleteJson("/api/v1/email-recipients/{$recipient->id}")->assertForbidden();
        $this->assertDatabaseHas('email_recipients', ['id' => $recipient->id]);
    }

    private function recipient(array $overrides = []): EmailRecipient
    {
        return EmailRecipient::create(array_merge([
            'document_type' => 'rencana_kirim',
            'trigger' => 'created',
            'recipient_type' => 'email',
            'field' => 'TO',
            'email' => 'default@test.com',
            'is_active' => true,
        ], $overrides));
    }

    public function test_index_without_pagination_params_returns_capped_legacy_rows_with_summary(): void
    {
        Sanctum::actingAs($this->userWith(['emails.view']));
        $this->recipient(['kode_depo' => 'DPA', 'email' => 'a@test.com']);

        $res = $this->getJson('/api/v1/email-recipients')->assertOk();

        $res->assertJsonCount(1, 'data');
        $res->assertJsonMissingPath('meta');
        // Ringkasan tetap disertakan agar panel audit klien gaya lama akurat.
        $res->assertJsonPath('summary.total', 1);
    }

    public function test_index_legacy_branch_caps_rows_but_summary_counts_all(): void
    {
        Sanctum::actingAs($this->userWith(['emails.view']));

        $rows = [];
        for ($i = 0; $i < 505; $i++) {
            $rows[] = [
                'document_type' => 'rencana_kirim', 'trigger' => 'created',
                'recipient_type' => 'email', 'field' => 'TO',
                'email' => "r{$i}@test.com", 'is_active' => true, 'kode_depo' => null,
            ];
        }
        EmailRecipient::insert($rows);

        $res = $this->getJson('/api/v1/email-recipients')->assertOk();

        // Baris dibatasi demi keamanan memori, tetapi total sebenarnya tetap
        // dilaporkan lewat ringkasan.
        $res->assertJsonCount(500, 'data');
        $res->assertJsonPath('summary.total', 505);
    }

    public function test_index_accepts_per_page_groups_alias_for_depot_pagination(): void
    {
        Sanctum::actingAs($this->userWith(['emails.view']));
        $this->recipient(['kode_depo' => 'DPA', 'email' => 'a@test.com']);
        $this->recipient(['kode_depo' => 'DPB', 'email' => 'b@test.com']);

        $res = $this->getJson('/api/v1/email-recipients?per_page_groups=1&page=1')->assertOk();

        $res->assertJsonPath('meta.per_page_groups', 1)
            ->assertJsonPath('meta.total_groups', 2)
            ->assertJsonPath('meta.last_page', 2)
            ->assertJsonCount(1, 'data');
    }

    public function test_index_paginates_depot_groups_and_returns_summary(): void
    {
        Sanctum::actingAs($this->userWith(['emails.view']));

        $this->recipient(['kode_depo' => null, 'email' => 'global@test.com']);
        $this->recipient(['kode_depo' => 'DPA', 'email' => 'a@test.com']);
        $this->recipient(['kode_depo' => 'DPB', 'email' => 'b1@test.com', 'field' => 'CC']);
        $this->recipient(['kode_depo' => 'DPB', 'email' => 'b2@test.com']);
        $this->recipient(['kode_depo' => 'DPC', 'email' => 'c@test.com']);

        // Halaman = grup depo utuh: global dulu, lalu alfabetis.
        $page1 = $this->getJson('/api/v1/email-recipients?per_page=2&page=1')->assertOk();
        $page1->assertJsonPath('meta.per_page_groups', 2)
            ->assertJsonPath('meta.total_groups', 4)
            ->assertJsonPath('meta.total_rows', 5)
            ->assertJsonPath('meta.last_page', 2)
            ->assertJsonPath('meta.has_prev', false)
            ->assertJsonPath('meta.has_next', true)
            ->assertJsonPath('summary.total', 5)
            ->assertJsonCount(2, 'data');
        $this->assertSame(
            [null, 'DPA'],
            collect($page1->json('data'))->pluck('kode_depo')->unique()->values()->all(),
        );

        // DPB (TO + CC) tetap utuh dalam satu halaman.
        $page2 = $this->getJson('/api/v1/email-recipients?per_page=2&page=2')->assertOk();
        $page2->assertJsonPath('meta.page', 2)
            ->assertJsonPath('meta.has_prev', true)
            ->assertJsonPath('meta.has_next', false)
            ->assertJsonCount(3, 'data');
        $this->assertSame(
            ['DPB', 'DPC'],
            collect($page2->json('data'))->pluck('kode_depo')->unique()->values()->all(),
        );
        $this->assertSame(
            ['CC', 'TO'],
            collect($page2->json('data'))->where('kode_depo', 'DPB')->pluck('field')->sort()->values()->all(),
        );
    }

    public function test_index_summary_flags_unresolved_recipients(): void
    {
        Sanctum::actingAs($this->userWith(['emails.view']));

        $this->recipient(['recipient_type' => 'email', 'email' => 'ok@test.com']);
        $this->recipient(['recipient_type' => 'role', 'role_slug' => 'tidak-ada', 'email' => null]);

        $res = $this->getJson('/api/v1/email-recipients?per_page=8')->assertOk();

        $res->assertJsonPath('summary.total', 2)
            ->assertJsonPath('summary.ok', 1)
            ->assertJsonPath('summary.broken', 1)
            ->assertJsonCount(1, 'summary.broken_sample')
            ->assertJsonPath('summary.broken_sample.0.role_slug', 'tidak-ada');
    }

    public function test_index_filters_and_search_run_on_server(): void
    {
        Sanctum::actingAs($this->userWith(['emails.view']));

        $this->recipient(['kode_depo' => 'DPA', 'email' => 'a@test.com']);
        $this->recipient(['kode_depo' => 'DPB', 'email' => 'b@test.com', 'field' => 'CC']);

        $this->getJson('/api/v1/email-recipients?per_page=8&kode_depo=DPA')
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.kode_depo', 'DPA');

        // Pencarian kini juga menjangkau kode depo (dulu hanya di klien).
        $this->getJson('/api/v1/email-recipients?per_page=8&search=DPB')
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.email', 'b@test.com');

        $this->getJson('/api/v1/email-recipients?per_page=8&field=CC')
            ->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_index_treats_whitespace_only_depot_as_global_group(): void
    {
        Sanctum::actingAs($this->userWith(['emails.view']));

        $this->recipient(['kode_depo' => ' ', 'email' => 'ws@test.com']);

        // Depot berisi spasi harus ikut grup Global, bukan "menghilang" dari
        // daftar padahal tetap dihitung di ringkasan.
        $res = $this->getJson('/api/v1/email-recipients?per_page=8')->assertOk();

        $res->assertJsonCount(1, 'data')
            ->assertJsonPath('meta.total_groups', 1)
            ->assertJsonPath('summary.total', 1)
            ->assertJsonPath('data.0.email', 'ws@test.com');
    }

    public function test_index_search_treats_like_wildcards_as_literal_text(): void
    {
        Sanctum::actingAs($this->userWith(['emails.view']));

        $this->recipient(['email' => 'plain@test.com']);
        $this->recipient(['email' => 'p_ain@test.com']);
        $this->recipient(['email' => 'lit%eral@test.com']);

        // '%' literal: hanya baris yang benar-benar memuat karakter '%'.
        $this->getJson('/api/v1/email-recipients?'.http_build_query(['per_page' => 8, 'search' => '%']))
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.email', 'lit%eral@test.com');

        // '_' literal: `p_ain` tak boleh cocok dengan `plain`.
        $this->getJson('/api/v1/email-recipients?'.http_build_query(['per_page' => 8, 'search' => 'p_ain']))
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.email', 'p_ain@test.com');
    }

    public function test_index_summary_and_sample_cover_rows_outside_current_page(): void
    {
        Sanctum::actingAs($this->userWith(['emails.view']));

        // Depo halaman 1 sehat; baris bermasalah ada di depo halaman 2.
        $this->recipient(['kode_depo' => 'AAA', 'email' => 'ok@test.com']);
        $this->recipient(['kode_depo' => 'ZZZ', 'recipient_type' => 'role', 'role_slug' => 'tidak-ada', 'email' => null]);

        $res = $this->getJson('/api/v1/email-recipients?per_page=1&page=1')->assertOk();

        // Halaman 1 hanya memuat depo AAA...
        $res->assertJsonPath('meta.total_groups', 2)
            ->assertJsonPath('meta.page', 1)
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.kode_depo', 'AAA');

        // ...tapi ringkasan tetap menghitung baris bermasalah di halaman lain.
        $res->assertJsonPath('summary.total', 2)
            ->assertJsonPath('summary.broken', 1)
            ->assertJsonPath('summary.ok', 1)
            ->assertJsonCount(1, 'summary.broken_sample')
            ->assertJsonPath('summary.broken_sample.0.role_slug', 'tidak-ada');
    }
}
