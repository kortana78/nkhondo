// Server test runner: smoke -> mirror -> woweta -> match -> latency.
// (Load test is separate: npm run test:load — 100 bots, ~60s.)
import { spawnSync } from 'node:child_process';

const suites = ['smoke.ts', 'mirror.ts', 'woweta.ts', 'match.ts', 'latency.ts'];
let failed = 0;
for (const s of suites) {
  console.log(`\n===== ${s} =====`);
  const r = spawnSync(process.execPath, ['--import', 'tsx', `tests/${s}`], { stdio: 'inherit' });
  if (r.status !== 0) {
    console.log(`SUITE FAILED: ${s}`);
    failed++;
    break;
  }
}
if (failed) process.exit(1);
console.log('\nALL SERVER TESTS PASSED');
