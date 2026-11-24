// Fake NS API that replays 24 Nov 2026, Den Haag HS -> Almere Poort.
const T = hm => `2026-11-24T${hm}:00+0100`;
const ST = [
  ['GV', 8400282, 'Den Haag HS'], ['LEDN', 8400390, 'Leiden Centraal'], ['HLM', 8400285, 'Haarlem'],
  ['ASS', 8400058, 'Amsterdam Sloterdijk'], ['ASD', 8400058 + 1, 'Amsterdam Centraal'], ['WP', 8400731, 'Weesp'],
  ['ALMR', 8400081, 'Almere Poort'],
];
const stationsPayload = { payload: ST.map(([code, uic, name]) => ({ code, UICCode: uic, namen: { lang: name }, land: 'NL' })) };
const uic = c => String(ST.find(s => s[0] === c)[1]);
const stop = (c, arr, dep, tr) => ({ uicCode: uic(c), name: ST.find(s => s[0] === c)[2],
  plannedArrivalDateTime: arr && T(arr), plannedDepartureDateTime: dep && T(dep), plannedArrivalTrack: tr, plannedDepartureTrack: tr });
const leg = (num, cat, stops) => ({ travelType: 'PUBLIC_TRANSIT', product: { number: num, shortCategoryName: cat, displayName: cat },
  direction: 'x', origin: { uicCode: stops[0].uicCode, name: stops[0].name, plannedDateTime: stops[0].plannedDepartureDateTime, plannedTrack: stops[0].plannedDepartureTrack },
  destination: { uicCode: stops.at(-1).uicCode, name: stops.at(-1).name, plannedDateTime: stops.at(-1).plannedArrivalDateTime, plannedTrack: stops.at(-1).plannedArrivalTrack },
  stops });

const IC = leg('2334', 'IC', [stop('GV', null, '12:49', '6'), stop('LEDN', '13:02', '13:03', '5b'), stop('HLM', '13:22', '13:23', '1'),
  stop('ASS', '13:31', '13:32', '8'), stop('ASD', '13:37', null, '2a')]);
const SPR_ASD = leg('4649', 'SPR', [stop('ASD', null, '13:52', '15a'), stop('ALMR', '14:17', null, '2')]);
const SPR_10B = leg('5847', 'SPR', [stop('ASD', null, '13:41', '10b'), stop('WP', '13:57', null, '2')]);
const SPR_WP = leg('4347', 'SPR', [stop('WP', null, '13:59', '1'), stop('ALMR', '14:05', null, '2')]);

function fakeTrips(from, dt) {
  const t = dt.slice(11, 16);
  if (from === 'GV') return [{ status: 'NORMAL', legs: [IC, SPR_ASD] }];
  if (from === 'ASD' && t <= '13:41') return [{ status: 'NORMAL', legs: [SPR_10B, SPR_WP] }, { status: 'NORMAL', legs: [SPR_ASD] }];
  if (from === 'ASD') return [{ status: 'NORMAL', legs: [SPR_ASD] }];
  if (from === 'ASS') return [{ status: 'NORMAL', legs: [leg('2334', 'IC', IC.stops.slice(3)), SPR_ASD] }];
  return [];
}
export let n = 0;
export const fetchFn = async url => {
  n++;
  const u = new URL(url);
  const body = u.pathname.endsWith('/stations') ? stationsPayload
    : { trips: fakeTrips(u.searchParams.get('fromStation'), u.searchParams.get('dateTime')) };
  return { ok: true, json: async () => body };
};

