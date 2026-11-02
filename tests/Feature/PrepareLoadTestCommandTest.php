<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Tests\TestCase;

class PrepareLoadTestCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_refuses_to_run_outside_local_or_testing(): void
    {
        $rolesBefore = Role::count();
        $usersBefore = User::count();
        $this->app->detectEnvironment(fn (): string => 'production');

        $exitCode = Artisan::call('loadtest:prepare', [
            '--users' => 1,
            '--rows' => 1,
        ]);

        $this->assertSame(Command::FAILURE, $exitCode);
        $this->assertStringContainsString('local atau testing', Artisan::output());
        $this->assertSame($rolesBefore, Role::count());
        $this->assertSame($usersBefore, User::count());
    }

    public function test_it_writes_tokens_to_a_private_temporary_file_without_printing_them(): void
    {
        $exitCode = Artisan::call('loadtest:prepare', [
            '--users' => 1,
            '--rows' => 1,
        ]);
        $output = Artisan::output();

        $this->assertSame(Command::SUCCESS, $exitCode, $output);
        $this->assertMatchesRegularExpression('/File token sementara: (.+)/', $output);
        preg_match('/File token sementara: (.+)/', $output, $matches);

        $tokenFile = trim($matches[1]);
        try {
            $this->assertFileExists($tokenFile);

            $permissions = fileperms($tokenFile);
            $this->assertNotFalse($permissions);
            $this->assertSame(0, $permissions & 0077);

            $tokens = file_get_contents($tokenFile);
            $this->assertNotFalse($tokens);
            $this->assertNotEmpty($tokens);
            $this->assertStringNotContainsString($tokens, $output);
        } finally {
            if (is_file($tokenFile) && ! unlink($tokenFile)) {
                throw new \RuntimeException('Could not remove the test token file.');
            }
        }
    }
}
