// Live check through the deployed Worker: $env:SNEL_PROXY='https://…workers.dev'; node test/live.mjs GV AMPO [HH:MM] [minT]
import { makeApi, plan, arrOf, depOf, transfers } from '../planner.js';
const [from = 'GV', to = 'AMPO', hm = null, minT = '2'] = process.argv.slice(2);
if (!process.env.SNEL_PROXY) { console.error('Set SNEL_PROXY to your Worker address first.'); process.exit(1); }
const api = makeApi(process.env.SNEL_PROXY);
await api.loadStations();
const when = new Date(); if (hm) { const [h, m] = hm.split(':'); when.setHours(+h, +m, 0, 0); }
const t0 = Date.now();
const { results, nsBest, calls } = await plan(api, api.station(from), api.station(to), when, +minT);
const f = d => d.toTimeString().slice(0, 5);
console.log(`NS best: ${nsBest ? f(depOf(nsBest)) + ' -> ' + f(arrOf(nsBest)) : 'none'} | ${calls} calls, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
for (const r of results.slice(0, 5)) {
  console.log(`${f(depOf(r))} -> ${f(arrOf(r))} [${r.source}] ` + r.legs.map(l => l.walk ? 'walk' : `${l.cat} ${l.from.name} ${f(l.from.time)} (${l.from.track}) > ${l.to.name} ${f(l.to.time)} (${l.to.track})`).join(' | '));
  console.log('   transfers:', transfers(r, +minT).map(t => `${t.at} ${t.gap}min${t.tight ? ' TIGHT' : ''}`).join(', '));
}
