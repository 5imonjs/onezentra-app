<?php

namespace Tests\Feature;

// use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ExampleTest extends TestCase
{
    /**
     * Aplikasi ini API-only (tidak ada route web root).
     * Smoke test: endpoint login API harus terjangkau.
     */
    public function test_the_application_login_endpoint_is_reachable(): void
    {
        $response = $this->postJson('/api/v1/login');

        $response->assertStatus(422);
    }
}
