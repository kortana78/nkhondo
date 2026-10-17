import { writeFileSync } from 'fs';
import { CARDS, BALANCE } from '../shared/sim/cards';
const out = JSON.stringify({ cards: CARDS, balance: BALANCE }, null, 2);
writeFileSync('src/data/cards.json', out);
writeFileSync('shared/cards.json', out);
console.log('wrote src/data/cards.json + shared/cards.json with', Object.keys(CARDS).length, 'cards');

