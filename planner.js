// Route search on top of the NS Reisinformatie API (v3 trips), with your own minimum transfer time.
// Idea: NS plans well but adds its own transfer margins. So we take NS's trips, and at every stop
// where you could get off we ask NS again "from here, leaving <minTransfer> after I arrive".
// NS treats the start of a trip as "already standing there", so its margin does not apply to that first step.

export const parseNS = s => (s ? new Date(String(s).replace(/([+-]\d{2})(\d{2})$/, '$1:$2')) : null);

export function isoLocal(d) {
  const p = n => String(n).padStart(2, '0');
  const off = -d.getTimezoneOffset(), sg = off >= 0 ? '+' : '-', a = Math.abs(off);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00${sg}${p(Math.floor(a / 60))}:${p(a % 60)}`;
}

const MIN = 60000;
const minutes = (a, b) => Math.round((b - a) / MIN);

export function makeApi(base, fetchFn = (...a) => fetch(...a)) {
  const cache = new Map();
  let stations = null, byUic = new Map(), byCode = new Map();
  let calls = 0;
  async function get(path, params) {
    const url = base.replace(/\/$/, '') + path + '?' + new URLSearchParams(params);
    if (cache.has(url)) return cache.get(url);
    calls++;
    const p = fetchFn(url).then(async r => {
      if (!r.ok) throw new Error(`NS API ${r.status}`);
      return r.json();
    });
    cache.set(url, p);
    p.catch(() => cache.delete(url));
    return p;
  }
  return {
    get calls() { return calls; },
    async loadStations() {
      if (stations) return stations;
      const j = await get('/reisinformatie-api/api/v2/stations', {});
      stations = (j.payload || []).map(s => ({
        code: s.code, uic: String(s.UICCode ?? s.uicCode ?? ''),
        name: s.namen?.lang || s.namen?.middel || s.name || s.code,
        alt: [s.namen?.middel, s.namen?.kort, ...(s.synoniemen || [])].filter(Boolean),
        land: s.land,
      })).filter(s => s.code);
      byUic = new Map(stations.map(s => [s.uic, s]));
      byCode = new Map(stations.map(s => [s.code.toUpperCase(), s]));
      return stations;
    },
    station(uicOrCode) { return byUic.get(String(uicOrCode)) || byCode.get(String(uicOrCode).toUpperCase()) || null; },
    async trips(from, to, dt) {
      const t = new Date(Math.floor(dt.getTime() / MIN) * MIN);
      const j = await get('/reisinformatie-api/api/v3/trips', { fromStation: from.code, toStation: to.code, dateTime: isoLocal(t) });
      return (j.trips || []).map(normTrip).filter(Boolean);
    },
  };
}

function place(o) {
  return { uic: String(o?.uicCode ?? ''), name: o?.name || '', time: parseNS(o?.actualDateTime || o?.plannedDateTime),
    planned: parseNS(o?.plannedDateTime), track: o?.actualTrack || o?.plannedTrack || '' };
}

export function normLeg(leg) {
  const from = place(leg.origin), to = place(leg.destination);
  if (leg.travelType && leg.travelType !== 'PUBLIC_TRANSIT') {
    return { walk: true, from, to, label: leg.travelType === 'WALK' ? 'Lopen' : (leg.name || 'Overig'), stops: [] };
  }
  const stops = (leg.stops || []).filter(s => !s.passing).map(s => ({
    uic: String(s.uicCode ?? ''), name: s.name,
    arr: parseNS(s.actualArrivalDateTime || s.plannedArrivalDateTime),
    dep: parseNS(s.actualDepartureDateTime || s.plannedDepartureDateTime),
    arrTrack: s.actualArrivalTrack || s.plannedArrivalTrack || '',
    depTrack: s.actualDepartureTrack || s.plannedDepartureTrack || '',
    cancelled: !!s.cancelled,
  }));
  const pr = leg.product || {};
  return {
    walk: false, from, to, stops,
    train: String(pr.number ?? ''), cat: pr.shortCategoryName || pr.categoryCode || '',
    label: pr.displayName || pr.longCategoryName || leg.name || 'Trein',
    direction: leg.direction || '', cancelled: !!leg.cancelled,
  };
}

export function normTrip(t) {
  if (!t?.legs?.length) return null;
  const legs = t.legs.map(normLeg);
  return { legs, status: t.status || 'NORMAL', source: 'ns' };
}

export const depOf = it => it.legs[0].from.time;
export const arrOf = it => it.legs[it.legs.length - 1].to.time;
export const rides = it => it.legs.filter(l => !l.walk);

// Transfers between consecutive train legs: gap in minutes and whether it is tight.
export function transfers(it, minT) {
  const out = [];
  for (let i = 1; i < it.legs.length; i++) {
    const a = it.legs[i - 1], b = it.legs[i];
    if (a.walk || b.walk) continue;
    const gap = minutes(a.to.time, b.from.time);
    // Same track means walking across the platform, but a combined track like "1-2" is a whole
    // island, and a train can't leave the second the other one arrives: keep at least 1 minute.
    const same = !!a.to.track && a.to.track === b.from.track && !a.to.track.includes('-');
    out.push({ at: b.from.name, gap, fromTrack: a.to.track, toTrack: b.from.track, same,
      ok: gap >= (same ? Math.min(1, minT) : minT), tight: !same && gap < 5 });
  }
  return out;
}

export function valid(it, minT) {
  if (it.legs.some(l => l.cancelled)) return false;
  if (it.legs.some(l => !l.walk && (!l.from.time || !l.to.time))) return false;
  for (let i = 1; i < it.legs.length; i++) if (it.legs[i].from.time < it.legs[i - 1].to.time) return false;
  return transfers(it, minT).every(t => t.ok);
}

const key = it => rides(it).map(l => `${l.train}@${l.from.uic}>${l.to.uic}`).join('|');

function truncate(leg, k) {
  const s = leg.stops[k];
  return { ...leg, stops: leg.stops.slice(0, k + 1), to: { uic: s.uic, name: s.name, time: s.arr, planned: s.arr, track: s.arrTrack } };
}

function splice(it, i, k, tail) {
  const cut = truncate(it.legs[i], k);
  const legs = [...it.legs.slice(0, i), cut];
  const t0 = tail.legs[0];
  if (t0 && !t0.walk && t0.train && t0.train === cut.train) {
    // Same train continues: merge instead of inventing a transfer.
    legs[legs.length - 1] = { ...cut, to: t0.to, stops: [...cut.stops, ...t0.stops.slice(1)] };
    legs.push(...tail.legs.slice(1));
  } else legs.push(...tail.legs);
  return { legs, status: 'NORMAL', source: 'replan', via: cut.to.name };
}

async function pool(items, n, fn) {
  const out = new Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) { const i = next++; try { out[i] = await fn(items[i]); } catch (e) { out[i] = []; } }
  }));
  return out;
}

// Every stop after boarding (including each leg's end, the NS transfer point) is a place to re-plan from.
async function improve(api, it, to, minT, after, fromLeg = 0) {
  const jobs = [];
  it.legs.forEach((leg, i) => {
    if (leg.walk || i < fromLeg) return;
    leg.stops.forEach((s, k) => {
      if (k === 0 || !s.arr || s.cancelled) return;
      if (s.uic === to.uic) return;
      if (after && s.arr < after) return;
      const st = api.station(s.uic);
      if (!st) return;
      jobs.push({ i, k, st, t: new Date(s.arr.getTime() + minT * MIN) });
    });
  });
  const res = await pool(jobs, 6, async j => (await api.trips(j.st, to, j.t)).map(t => ({ t, j })));
  const out = [];
  for (const list of res) for (const { t, j } of list || []) {
    const n = splice(it, j.i, j.k, t);
    n.fromLeg = j.i + 1;
    out.push(n);
  }
  return out;
}

/**
 * plan(api, from, to, when, minT, opts)
 *  from/to: station objects {code, uic, name}; when: Date; minT: minimum transfer in minutes.
 *  opts.base: an itinerary you are already on (in-train mode); opts.after: ignore stops before this time.
 * Returns { results, nsBest } sorted by arrival.
 */
export async function plan(api, from, to, when, minT, opts = {}) {
  const { depth = 2, maxBase = 4, base = null, after = null, onProgress = () => {} } = opts;
  let bases;
  if (base) bases = [base];
  else {
    bases = (await api.trips(from, to, when)).filter(t => depOf(t) >= new Date(when.getTime() - MIN));
  }
  const pool_ = new Map();
  const add = it => { if (!valid(it, minT)) return false; const k = key(it); const o = pool_.get(k);
    if (!o || arrOf(it) < arrOf(o)) { pool_.set(k, it); return true; } return false; };
  bases.forEach(add);
  const nsValid = bases.filter(t => t.source === 'ns' && t.status === 'NORMAL' && valid(t, minT));
  const nsBest = nsValid.sort((a, b) => arrOf(a) - arrOf(b))[0] || null;

  const byArr = (a, b) => arrOf(a) - arrOf(b) || rides(a).length - rides(b).length || depOf(b) - depOf(a);
  // Frontier: the base trips that use real trains, earliest arrival first. Trips NS marks as
  // "change not possible" are kept, because their trains may still be catchable with your margin.
  let frontier = bases.filter(t => !t.legs.some(l => l.cancelled)).sort(byArr).slice(0, maxBase);
  for (let d = 0; d < depth && frontier.length; d++) {
    onProgress(`Zoeken… ronde ${d + 1}`);
    const lists = await Promise.all(frontier.map(it => improve(api, it, to, minT, after, d === 0 ? 0 : (it.fromLeg || 0))));
    const fresh = lists.flat().filter(add);
    frontier = fresh.sort(byArr).slice(0, 3);
  }
  const results = [...pool_.values()].sort(byArr);
  // Drop results that are strictly worse: leave no earlier and arrive no earlier than another one.
  const kept = results.filter((r, i) => !results.some((o, j) => j !== i &&
    depOf(o) >= depOf(r) && arrOf(o) <= arrOf(r) && rides(o).length <= rides(r).length &&
    (depOf(o) > depOf(r) || arrOf(o) < arrOf(r) || rides(o).length < rides(r).length)));
  return { results: kept.slice(0, 8), nsBest, calls: api.calls };
}
