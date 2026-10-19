<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use SplFileInfo;

/**
 * Guard statis: setiap query LIKE di `app/` wajib lewat
 * App\Support\LikePattern::contains() dan klausa `LIKE ? ESCAPE ?`.
 *
 * Ini melindungi refactor escape LIKE dari regresi — tanpa tes ini, pola mentah
 * bisa masuk kembali tanpa ketahuan (dan diam-diam berperilaku beda di SQLite
 * vs MySQL, atau membiarkan user memakai `%`/`_` sebagai wildcard).
 */
class LikeEscapingGuardTest extends TestCase
{
    /** Satu-satunya file yang boleh memakai addcslashes(). */
    private const ALLOWED_ADDCSLASHES_FILE = 'Support/LikePattern.php';

    public function test_app_code_never_builds_a_raw_like_pattern(): void
    {
        $appPath = dirname(__DIR__, 2).'/app';
        $violations = [];

        foreach ($this->phpFiles($appPath) as $path) {
            $relative = str_replace($appPath.'/', '', $path);
            $contents = file_get_contents($path);

            // 1. Escape wildcard hanya boleh ada di helper terpusat.
            $isHelper = str_ends_with($relative, self::ALLOWED_ADDCSLASHES_FILE);

            if (! $isHelper && str_contains($contents, 'addcslashes(')) {
                $violations[] = "{$relative}: addcslashes() hanya boleh di App\\Support\\LikePattern";
            }

            // Helper-nya sendiri adalah satu-satunya tempat pola mentah yang sah.
            if ($isHelper) {
                continue;
            }

            // 2. Tidak boleh membangun pola `'%'.$x.'%'` sendiri.
            foreach (preg_split('/\R/', $contents) as $index => $line) {
                if (str_contains($line, "'%'.") || str_contains($line, '"%".')) {
                    $violations[] = "{$relative}:".($index + 1)." pola LIKE mentah ('%'.…) — pakai LikePattern::contains()";
                }

                // 3. Operator builder `'like'` hanya aman untuk pola literal;
                //    pola dinamis wajib whereRaw(... LIKE ? ESCAPE ?).
                if (preg_match('/([\'"])like\1/i', $line, $match, PREG_OFFSET_CAPTURE)) {
                    $after = substr($line, $match[0][1] + strlen($match[0][0]));
                    if (str_contains($after, '$')) {
                        $violations[] = "{$relative}:".($index + 1)." operator 'like' dengan pola dinamis — pakai whereRaw('… LIKE ? ESCAPE ?', [\$this->likeContains(...)])";
                    }
                }
            }

            // 4. Setiap `LIKE ?` harus segera diikuti `ESCAPE`.
            if (preg_match_all('/\bLIKE\s*\?(?!\s*ESCAPE\b)/i', $contents, $matches)) {
                foreach ($matches[0] as $ignored) {
                    $violations[] = "{$relative}: 'LIKE ?' tanpa klausa ESCAPE";
                }
            }
        }

        $this->assertSame(
            [],
            $violations,
            "Query LIKE mentah terdeteksi — wajib LikePattern::contains() + `LIKE ? ESCAPE ?`:\n".implode("\n", $violations)
        );
    }

    /**
     * @return list<string>
     */
    private function phpFiles(string $directory): array
    {
        $files = [];

        $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($directory));
        foreach ($iterator as $file) {
            if ($file instanceof SplFileInfo && $file->isFile() && $file->getExtension() === 'php') {
                $files[] = $file->getPathname();
            }
        }

        return $files;
    }
}
