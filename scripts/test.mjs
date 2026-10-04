import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const tests = (await readdir('tests')).filter(file => file.endsWith('.test.mjs'))
  .map(file => `tests/${file}`);
const workers = process.argv.slice(2);
if (!workers.length) workers.push(process.env.CFNEW_WORKER_FILE || '明文源吗');
for (const file of workers) {
  console.log(`Testing ${file}`);
  const result = spawnSync(process.execPath, ['--experimental-vm-modules', '--test', '--test-concurrency=2', ...tests], {
    stdio: 'inherit', env: { ...process.env, CFNEW_WORKER_FILE: file }
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
