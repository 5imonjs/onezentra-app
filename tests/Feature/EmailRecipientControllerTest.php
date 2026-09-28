<?php

namespace Tests\Feature;

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
}
