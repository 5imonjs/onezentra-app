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

    public function test_index_without_pagination_params_keeps_legacy_shape(): void
    {
        Sanctum::actingAs($this->userWith(['emails.view']));
        $this->recipient(['kode_depo' => 'DPA', 'email' => 'a@test.com']);

        $res = $this->getJson('/api/v1/email-recipients')->assertOk();

        $res->assertJsonCount(1, 'data');
        $res->assertJsonMissingPath('meta');
        $res->assertJsonMissingPath('summary');
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
        $page1->assertJsonPath('meta.total_groups', 4)
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
}
