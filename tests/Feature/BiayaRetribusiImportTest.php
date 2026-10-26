<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class BiayaRetribusiImportTest extends TestCase
{
    use RefreshDatabase;

    private User $importer;

    protected function setUp(): void
    {
        parent::setUp();

        $importRole = Role::firstOrCreate(['slug' => 'biaya_retribusi_importer'], ['name' => 'Biaya Retribusi Importer']);
        $importRole->permissions()->syncWithoutDetaching([
            Permission::firstOrCreate(['slug' => 'biaya_retribusi.import'], ['name' => 'biaya_retribusi.import', 'menu_group' => 'Biaya Retribusi'])->id,
        ]);
        $this->importer = $this->makeUser('biaya-retribusi-importer@test.com', $importRole);
    }

    public function test_pdf_upload_returns_file_url_and_stores_compressed_file(): void
    {
        Storage::fake('public');
        Sanctum::actingAs($this->importer);

        $pdfBytes = $this->buildPdfWithUncompressedStream(4096);

        $response = $this->post('/api/v1/biaya-retribusi/import', [
            'file' => UploadedFile::fake()->createWithContent('dokumen.pdf', $pdfBytes),
        ], ['Accept' => 'application/json']);

        $response->assertOk()
            ->assertJsonPath('message', 'Import berhasil')
            ->assertJsonStructure(['data' => ['file_url', 'file_name', 'file_size']]);

        $fileUrl = $response->json('data.file_url');
        $this->assertStringContainsString('/api/v1/biaya-retribusi/import/', $fileUrl);
        $this->assertSame('dokumen.pdf', $response->json('data.file_name'));

        $path = 'biaya_retribusi/import/'.basename((string) parse_url($fileUrl, PHP_URL_PATH));
        Storage::disk('public')->assertExists($path);

        $storedSize = Storage::disk('public')->size($path);
        $this->assertLessThan(strlen($pdfBytes), $storedSize, 'qpdf harus mengurangi ukuran PDF sebelum disimpan.');
        $this->assertSame($storedSize, $response->json('data.file_size'));

        $this->get(parse_url($fileUrl, PHP_URL_PATH), ['Accept' => 'application/pdf'])
            ->assertOk()
            ->assertHeader('Content-Type', 'application/pdf');
    }

    public function test_disallowed_file_type_returns_422(): void
    {
        Storage::fake('public');
        Sanctum::actingAs($this->importer);

        $response = $this->post('/api/v1/biaya-retribusi/import', [
            'file' => UploadedFile::fake()->createWithContent('dokumen.txt', 'bukan pdf'),
        ], ['Accept' => 'application/json']);

        $response->assertStatus(422)->assertJsonValidationErrors('file');
        Storage::disk('public')->assertDirectoryEmpty('biaya_retribusi');
    }

    public function test_request_without_import_permission_returns_403(): void
    {
        Storage::fake('public');
        $viewerRole = Role::firstOrCreate(['slug' => 'biaya_retribusi_viewer_only'], ['name' => 'Biaya Retribusi Viewer Only']);
        $viewer = $this->makeUser('biaya-retribusi-viewer@test.com', $viewerRole);

        Sanctum::actingAs($viewer);

        $response = $this->post('/api/v1/biaya-retribusi/import', [
            'file' => UploadedFile::fake()->createWithContent('dokumen.pdf', $this->buildPdfWithUncompressedStream(64)),
        ], ['Accept' => 'application/json']);

        $response->assertStatus(403);
        Storage::disk('public')->assertDirectoryEmpty('biaya_retribusi');

        $this->get('/api/v1/biaya-retribusi/import/apa-saja.pdf')->assertForbidden();
    }

    public function test_unauthenticated_request_returns_401(): void
    {
        $response = $this->post('/api/v1/biaya-retribusi/import', [], ['Accept' => 'application/json']);

        $response->assertStatus(401);
    }

    /**
     * PDF valid dengan content stream tanpa kompresi, agar efek qpdf --compress-streams terukur.
     */
    private function buildPdfWithUncompressedStream(int $streamSize): string
    {
        $stream = str_repeat(' ', $streamSize);
        $objects = [
            1 => '<< /Type /Catalog /Pages 2 0 R >>',
            2 => '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
            3 => '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << >> >>',
            4 => '<< /Length '.strlen($stream)." >>\nstream\n".$stream."\nendstream",
        ];

        $pdf = "%PDF-1.4\n";
        $offsets = [];
        foreach ($objects as $number => $body) {
            $offsets[$number] = strlen($pdf);
            $pdf .= "{$number} 0 obj\n{$body}\nendobj\n";
        }

        $xrefOffset = strlen($pdf);
        $pdf .= "xref\n0 5\n0000000000 65535 f \n";
        foreach ($offsets as $offset) {
            $pdf .= sprintf("%010d 00000 n \n", $offset);
        }

        return $pdf."trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n{$xrefOffset}\n%%EOF\n";
    }

    private function makeUser(string $email, Role $role): User
    {
        $user = User::factory()->create([
            'email' => $email,
            'kode_depo' => 'DPT-A',
            'nama_depo' => 'Depo A',
            'level' => 'staff_logistic',
        ]);
        $user->roles()->attach($role->id);

        return $user;
    }
}
