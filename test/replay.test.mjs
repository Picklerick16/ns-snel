// Offline check of the search with a fake NS API that replays 24 Nov 2026 (Den Haag HS -> Almere Poort).
// NS's own answer for the train Dan was on: 14:17 via Amsterdam C 13:52. Expected here: 14:05 via the 13:41 to Weesp.
import { makeApi, plan, arrOf, transfers } from '../planner.js';
import { fetchFn, n } from './fake-ns.mjs';

const api = makeApi('https://proxy.test', fetchFn);
await api.loadStations();
const from = api.station('GV'), to = api.station('ALMR');
const { results, nsBest } = await plan(api, from, to, new Date('2026-11-24T12:45:00+01:00'), 2);
const hm = d => d.toTimeString().slice(0, 5);
const best = results[0];
console.log('NS best :', hm(arrOf(nsBest)));
console.log('Our best:', hm(arrOf(best)), best.legs.map(l => `${l.cat} ${l.from.name} ${hm(l.from.time)} -> ${l.to.name} ${hm(l.to.time)}`).join(' | '));
console.log('Transfers:', JSON.stringify(transfers(best, 2)));
console.log('API calls:', n);
if (hm(arrOf(best)) !== '14:05') { console.error('FAIL: expected 14:05'); process.exit(1); }
// with a 5-minute margin the 2a->10b run (4 min) must not be offered
const api5 = makeApi('https://proxy.test', fetchFn); await api5.loadStations();
const strict = await plan(api5, from, to, new Date('2026-11-24T12:45:00+01:00'), 5);
console.log('5-min margin best:', hm(arrOf(strict.results[0])));
if (hm(arrOf(strict.results[0])) !== '14:17') { console.error('FAIL: 5-min margin should give 14:17'); process.exit(1); }
console.log('PASS');
