import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

const scriptPath = join(dirname(fileURLToPath(import.meta.url)), 'api-load.mjs');

test('reads and removes the token file without printing token values', async () => {
  const token = 'token-under-test';
  const tokenFile = join(tmpdir(), `onezentra-loadtest-${randomUUID()}`);
  writeFileSync(tokenFile, token, { mode: 0o600 });

  let output = '';
  let errorOutput = '';
  try {
    const child = spawn(process.execPath, [
      scriptPath,
      '--users=1',
      '--duration=0',
      '--warmup=0',
      `--tokens-file=${tokenFile}`,
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    child.stdout.setEncoding('utf8').on('data', (chunk) => { output += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { errorOutput += chunk; });

    const exitCode = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
    });

    assert.equal(exitCode, 1, errorOutput);
    assert.match(output, /tokens=1/);
    assert.equal(existsSync(tokenFile), false);
    assert.equal(output.includes(token), false);
    assert.equal(errorOutput.includes(token), false);
  } finally {
    if (existsSync(tokenFile)) {
      unlinkSync(tokenFile);
    }
  }
});
