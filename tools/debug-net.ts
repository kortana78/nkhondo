import { Battle } from '../shared/sim/battle';
import { STARTER_DECK } from '../shared/sim/cards';
const b2 = new Battle(55, ['mfiti', 'fisi', 'mlonda', 'woweta', 'njuchi', 'watchtower', 'rain', 'roadblock'], [...STARTER_DECK]);
b2.energy[0] = 10; b2.energy[1] = 10;
b2.hands[0] = ['mfiti', 'fisi', 'mlonda', 'woweta'];
b2.hands[1] = ['fisi', 'mlonda', 'njuchi', 'woweta'];
console.log('deploy1', b2.deploy(1, 'fisi', 9, 20), 'deploy0', b2.deploy(0, 'mfiti', 9, 13));
console.log('units', b2.units.map((u) => ({ id: u.id, card: u.card, owner: u.owner, x: u.x.toFixed(1), z: u.z.toFixed(1) })));
for (let i = 0; i < 15; i++) {
  b2.step();
  const evs = b2.drainEvents();
  for (const e of evs) console.log(`tick ${b2.tick} ev ${e.kind} a=${e.a} b=${e.b} dmg=${e.dmg} x=${e.x?.toFixed(1)} z=${e.z?.toFixed(1)}`);
}
