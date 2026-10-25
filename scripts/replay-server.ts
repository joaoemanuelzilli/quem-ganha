// ════════════════════════════════════════════════════════════════════════════
//  SERVIDOR DE REPLAY — imita a API do TSE reproduzindo uma apuração real
//  (na ordem em que os boletins chegaram), em velocidade acelerada.
//  Serve para o ENSAIO GERAL do worker + dashboard antes das 17h.
//
//   npx tsx scripts/replay-server.ts [timeline] [velocidade]
//     timeline   : timeline_2026_t1_c1.csv.gz (padrão) — Lula(13) x Flávio(22)
//     velocidade : minutos de apuração por segundo real (padrão 0.5)
//
//   TSE_BASE=http://localhost:8790/oficial USE_TSE_CLOCK=1 COUNT_START=... npm run worker
// ════════════════════════════════════════════════════════════════════════════
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { unpack } from '../engine/priors';
import { ROOT, readTimeline } from './lib/data';

const file = process.argv[2] ?? 'timeline_2026_t1_c1.csv.gz';
const speed = Number(process.argv[3] ?? 0.5);
const PORT = Number(process.env.REPLAY_PORT ?? 8790);
const tl = readTimeline(file, 'c13', 'c22');
const priors = unpack(JSON.parse(readFileSync(`${ROOT}data/priors/t1_2026_mun.json`, 'utf8')));
const prior = new Map(priors.map((p) => [p.id, p]));
const t0 = Date.now();
const DAY = '25/10/2026';

const simMinute = () => ((Date.now() - t0) / 1000) * speed - 1; // começa 1 min antes das 17h
interface Acc { st: number; est: number; c: number; l: number; f: number; b: number; n: number }
let cursor = 0;
const acc = new Map<string, Acc>();
function advance() {
  const m = simMinute();
  while (cursor < tl.length && tl[cursor].minute <= m) {
    const r = tl[cursor++];
    const a = acc.get(r.id) ?? { st: 0, est: 0, c: 0, l: 0, f: 0, b: 0, n: 0 };
    a.st += r.secoes; a.est += r.aptos; a.c += r.comp; a.l += r.a; a.f += r.b; a.b += r.brancos; a.n += r.nulos;
    acc.set(r.id, a);
  }
}
const hg = () => {
  const m = Math.max(0, simMinute());
  const d = new Date(Date.UTC(2026, 9, 25, 20, 0, 0) + m * 60000); // 17:00 BRT = 20:00 UTC
  return d.toISOString().slice(11, 19).replace(/^(\d\d)/, (h) => String((Number(h) + 21) % 24).padStart(2, '0'));
};

function agg(ids: string[]) {
  const o = { ts: 0, st: 0, te: 0, est: 0, c: 0, l: 0, f: 0, b: 0, n: 0 };
  for (const id of ids) {
    const p = prior.get(id); if (!p) continue;
    o.ts += p.secoes; o.te += p.aptos;
    const a = acc.get(id); if (!a) continue;
    o.st += a.st; o.est += a.est; o.c += a.c; o.l += a.l; o.f += a.f; o.b += a.b; o.n += a.n;
  }
  return o;
}
const S = (x: number) => String(Math.round(x));
function resultJson(o: ReturnType<typeof agg>) {
  return {
    ele: '6258', t: '2', dg: DAY, hg: hg(),
    carg: [{ cd: '1', agr: [{ par: [{ n: '22', cand: [{ n: '22', nmu: 'FLAVIO BOLSONARO', vap: S(o.f) }] }] }, { par: [{ n: '13', cand: [{ n: '13', nmu: 'LULA', vap: S(o.l) }] }] }] }],
    s: { ts: S(o.ts), st: S(o.st), pst: (o.ts ? (100 * o.st) / o.ts : 0).toFixed(2).replace('.', ',') },
    e: { te: S(o.te), est: S(o.est), c: S(o.c), a: S(o.est - o.c) },
    v: { vv: S(o.l + o.f), vb: S(o.b), tvn: S(o.n) },
  };
}
const byUF = new Map<string, string[]>();
for (const p of priors) { if (!byUF.has(p.uf)) byUF.set(p.uf, []); byUF.get(p.uf)!.push(p.id); }

http.createServer((req, res) => {
  advance();
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  const url = req.url ?? '';
  let m: RegExpExecArray | null;
  if ((m = /\/dados\/(\w\w)\/(\w+)-c0001-e006258-u\.json/.exec(url))) {
    const abr = m[2];
    const ids = abr === 'br' ? priors.map((p) => p.id) : abr.length === 2 ? byUF.get(abr) ?? [] : [abr];
    res.end(JSON.stringify(resultJson(agg(ids)))); return;
  }
  if ((m = /\/dados\/(\w\w)\/\w\w-e006258-ab\.json/.exec(url))) {
    const uf = m[1];
    const rows = (uf === 'br' ? [...byUF.keys()].map((u) => ({ tp: 'uf', cd: u, o: agg(byUF.get(u)!) })) : (byUF.get(uf) ?? []).map((id) => ({ tp: 'mu', cd: id.slice(2), o: agg([id]) })));
    res.end(JSON.stringify({ ele: '6258', dg: DAY, hg: hg(), abr: rows.map((r) => ({ tpabr: r.tp, cdabr: r.cd, s: { ts: S(r.o.ts), st: S(r.o.st) }, e: { te: S(r.o.te), est: S(r.o.est), c: S(r.o.c) } })) }));
    return;
  }
  res.statusCode = 404; res.end('{}');
}).listen(PORT, () => console.log(`replay ${file} ×${speed} min/s em http://localhost:${PORT}/oficial — ${tl.length} linhas`));
setInterval(() => { advance(); const o = agg(priors.map((p) => p.id)); console.log(`[replay] ${hg()} ${(100 * o.st / o.ts).toFixed(2)}% Lula ${(100 * o.l / Math.max(1, o.l + o.f)).toFixed(2)}%`); }, 10000);
