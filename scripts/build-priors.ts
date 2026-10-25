// Baixa o resultado do 1º turno 2026 (eleição 6257) de TODOS os municípios e UFs pela API do TSE
// e o eleitorado/seções do 2º turno (6258). Gera data/priors/*.json usados pelo motor.
//
//   npm run priors
import { mkdirSync, writeFileSync } from 'node:fs';
import { ELE_T1, ELE_T2, NR_FLAVIO, NR_LULA, UFS, UF_NAMES, fetchJson, parseProgress, parseResult, urls, type TseResult } from '../engine/tse';
import type { UnitPrior } from '../engine/types';

const OUT = new URL('../data/priors/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

async function retry<T>(fn: () => Promise<T>, n = 5): Promise<T> {
  let err: unknown;
  for (let i = 0; i < n; i++) {
    try { return await fn(); } catch (e) { err = e; await new Promise((r) => setTimeout(r, 500 * (i + 1))); }
  }
  throw err;
}

async function pool<T, R>(items: T[], conc: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0, done = 0;
  await Promise.all(Array.from({ length: conc }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
      if (++done % 500 === 0) console.log(`  ${done}/${items.length}`);
    }
  }));
  return out;
}

function toPrior(id: string, uf: string, name: string, r: TseResult, aptos2: number, secoes2: number): UnitPrior {
  const lula = r.votes[NR_LULA] ?? 0, flavio = r.votes[NR_FLAVIO] ?? 0;
  return {
    id, uf, name,
    aptos: aptos2 || r.aptos, secoes: secoes2 || r.secoes,
    t1: { lula, flavio, outros: r.validos - lula - flavio, validos: r.validos, brancos: r.brancos, nulos: r.nulos, comp: r.comp },
  };
}

async function main() {
  console.log('config…');
  const cm = await retry(() => fetchJson(urls.config(ELE_T2)));
  const muns: { id: string; uf: string; name: string; ibge: string }[] = [];
  for (const a of cm.abr) for (const m of a.mu) muns.push({ id: `${a.cd}${m.cd}`, uf: a.cd, name: m.nm, ibge: m.cdi });
  console.log(`${muns.length} municípios`);

  // andamento do 2º turno → eleitorado e nº de seções de cada município (2T pode diferir levemente do 1T)
  const ab2 = new Map<string, { aptos: number; secoes: number }>();
  const abUF = new Map<string, { aptos: number; secoes: number }>();
  const brAb = parseProgress(await retry(() => fetchJson(urls.progress('br', ELE_T2))));
  for (const r of brAb.rows) abUF.set(r.abr, { aptos: r.aptos, secoes: r.secoes });
  await pool([...UFS], 8, async (uf) => {
    const p = parseProgress(await retry(() => fetchJson(urls.progress(uf, ELE_T2))));
    for (const r of p.rows) if (r.tp.startsWith('mu')) ab2.set(`${uf}${r.abr}`, { aptos: r.aptos, secoes: r.secoes });
  });
  console.log(`andamento 2T: ${ab2.size} municípios`);

  console.log('resultados 1T por UF…');
  const ufPriors = await pool([...UFS], 8, async (uf) => {
    const r = parseResult(uf, await retry(() => fetchJson(urls.result(uf, ELE_T1))));
    const a = abUF.get(uf);
    return toPrior(uf, uf, UF_NAMES[uf], r, a?.aptos ?? 0, a?.secoes ?? 0);
  });
  const brR = parseResult('br', await retry(() => fetchJson(urls.result('br', ELE_T1))));

  console.log('resultados 1T por município…');
  const munPriors = await pool(muns, 24, async (m) => {
    const r = parseResult(m.id, await retry(() => fetchJson(urls.result(m.id, ELE_T1))));
    const a = ab2.get(m.id);
    return toPrior(m.id, m.uf, m.name, r, a?.aptos ?? 0, a?.secoes ?? 0);
  });

  // checagem: soma municipal = BR
  const sum = (k: 'lula' | 'flavio' | 'validos') => munPriors.reduce((s, p) => s + p.t1[k], 0);
  console.log('BR oficial  :', brR.votes[NR_LULA], brR.votes[NR_FLAVIO], brR.validos);
  console.log('soma munic. :', sum('lula'), sum('flavio'), sum('validos'));

  const fields = ['id', 'uf', 'name', 'aptos', 'secoes', 'lula', 'flavio', 'outros', 'validos', 'brancos', 'nulos', 'comp'];
  const pack = (ps: UnitPrior[]) => ({
    fields,
    rows: ps.map((p) => [p.id, p.uf, p.name, p.aptos, p.secoes, p.t1.lula, p.t1.flavio, p.t1.outros, p.t1.validos, p.t1.brancos, p.t1.nulos, p.t1.comp]),
  });
  const meta = { source: 'TSE resultados.tse.jus.br — eleição 6257 (1º turno 2026) + andamento 6258', generatedAt: new Date().toISOString() };
  writeFileSync(`${OUT}/t1_2026_uf.json`, JSON.stringify({ ...meta, ...pack(ufPriors), br: { lula: brR.votes[NR_LULA], flavio: brR.votes[NR_FLAVIO], validos: brR.validos, brancos: brR.brancos, nulos: brR.nulos, comp: brR.comp, aptos: brR.aptos } }));
  writeFileSync(`${OUT}/t1_2026_mun.json`, JSON.stringify({ ...meta, ...pack(munPriors) }));
  writeFileSync(`${OUT}/municipios.json`, JSON.stringify(muns.map((m) => [m.id, m.ibge, m.name])));
  console.log('ok →', OUT);
}

main().catch((e) => { console.error(e); process.exit(1); });
