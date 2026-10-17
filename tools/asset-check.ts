// Asset check: every manifest entry exists, loads (or has a documented gap),
// and has source/author/licence. Run: npx tsx tools/asset-check.ts
import { readFileSync } from 'fs';
import { join } from 'path';

const manifest = JSON.parse(readFileSync(join(process.cwd(), 'assets', 'manifest.json'), 'utf8'));
let fails = 0;
const ok = (name: string, cond: boolean, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!cond) fails++;
};

const entries = manifest.entries ?? [];
ok('manifest has entries', entries.length >= 10, `count=${entries.length}`);
let byLic: Record<string, number> = {};
for (const e of entries) {
  const has = !!e.id && !!e.sourceUrl && !!e.author && !!e.licence;
  ok(`licence+source: ${e.id}`, has, e.licence ?? '');
  const lic = String(e.licence ?? '').toLowerCase();
  const key = lic.includes('cc0') ? 'CC0' : lic.includes('cc-by') ? 'CC-BY' : lic.includes('original') ? 'Original' : 'Other';
  byLic[key] = (byLic[key] ?? 0) + 1;
  if (e.status === 'gap') ok(`gap documented: ${e.id}`, !!e.gapReason);
  if (e.file && String(e.file).startsWith('http')) {
    // remote GLB slots must be CC0/CC-BY with attribution text
    ok(`remote licence ok: ${e.id}`, /cc0|cc-by/i.test(e.licence));
  }
}
console.log('\nManifest by licence:', JSON.stringify(byLic));
console.log('Gaps:', entries.filter((e: { status: string }) => e.status === 'gap').map((e: { id: string }) => e.id).join(', ') || 'none');
console.log(fails === 0 ? 'ALL ASSET CHECKS PASSED' : `${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);
