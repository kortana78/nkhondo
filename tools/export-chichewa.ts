// Export every Chichewa string + card text for native-speaker review.
// Run: npx tsx tools/export-chichewa.ts  (writes docs/CHICHEWA_REVIEW.md)
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const src = readFileSync(join(process.cwd(), 'src', 'ui', 'i18n.ts'), 'utf8');
const rows: { key: string; en: string; ch: string }[] = [];
const re = /(\w+):\s*\{\s*en:\s*'((?:[^'\\]|\\.)*)',\s*ch:\s*'((?:[^'\\]|\\.)*)'\s*\}/g;
let m: RegExpExecArray | null;
while ((m = re.exec(src))) rows.push({ key: m[1], en: m[2], ch: m[3] });

const cards = JSON.parse(readFileSync(join(process.cwd(), 'src', 'data', 'cards.json'), 'utf8'));
const cardRows = Object.values(cards.cards as Record<string, { id: string; nameEn: string; nameCh: string; roleEn: string; roleCh: string; descEn: string; descCh: string; barkEn: string; barkCh: string }>)
  .map((c) => `| ${c.id} | ${c.nameEn} | ${c.nameCh} | ${c.descEn} | ${c.descCh} | ${c.barkCh} |  |`);

const out = `# Chichewa review (native speaker needed pre-launch)

Status: NOT YET REVIEWED. Fill the "OK / fix" column; keep card names as-is unless noted.
Icons and layout are frozen — text only.

## UI strings (${rows.length})
| key | en | ch (current) | OK / fix |
|---|---|---|---|
${rows.map((r) => `| ${r.key} | ${r.en} | ${r.ch} |  |`).join('\n')}

## Card strings
| id | nameEn | nameCh | descEn | descCh | barkCh | OK / fix |
|---|---|---|---|---|---|---|
${cardRows.join('\n')}
`;
writeFileSync(join(process.cwd(), 'docs', 'CHICHEWA_REVIEW.md'), out);
console.log(`wrote docs/CHICHEWA_REVIEW.md with ${rows.length} UI + ${cardRows.length} card rows`);
