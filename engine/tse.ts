// Cliente da API pública de Divulgação de Resultados do TSE (resultados.tse.jus.br).
// Mesma estrutura usada pelo app oficial. CORS liberado → funciona no Node e no navegador.
//
//  config/mun-e<ele>-cm.json              → lista de UFs e municípios
//  dados/<abr>/<abr>-c0001-e<ele>-u.json  → totalização de BR, UF ou município (votos por candidato)
//  dados/<uf>/<uf>-e<ele>-ab.json         → andamento (seções totalizadas) de cada município da UF
//  dados/br/br-e<ele>-ab.json             → andamento de cada UF

import type { UnitObs } from './types';

// (no Node, TSE_BASE pode ser trocado por variável de ambiente — usado no ensaio com o servidor de replay)
const envBase = typeof process !== 'undefined' ? process.env?.TSE_BASE : undefined;
export const TSE_BASE = envBase || 'https://resultados.tse.jus.br/oficial';
export const CICLO = 'ele2026';
export const ELE_T1 = '6257';
export const ELE_T2 = '6258';
export const NR_LULA = 13;
export const NR_FLAVIO = 22;

const pad = (e: string) => e.padStart(6, '0');

export const UFS = ['ac', 'al', 'ap', 'am', 'ba', 'ce', 'df', 'es', 'go', 'ma', 'mt', 'ms', 'mg', 'pa', 'pb', 'pr', 'pe', 'pi', 'rj', 'rn', 'rs', 'ro', 'rr', 'sc', 'sp', 'se', 'to', 'zz'] as const;

export const UF_NAMES: Record<string, string> = {
  ac: 'Acre', al: 'Alagoas', ap: 'Amapá', am: 'Amazonas', ba: 'Bahia', ce: 'Ceará', df: 'Distrito Federal',
  es: 'Espírito Santo', go: 'Goiás', ma: 'Maranhão', mt: 'Mato Grosso', ms: 'Mato Grosso do Sul', mg: 'Minas Gerais',
  pa: 'Pará', pb: 'Paraíba', pr: 'Paraná', pe: 'Pernambuco', pi: 'Piauí', rj: 'Rio de Janeiro', rn: 'Rio Grande do Norte',
  rs: 'Rio Grande do Sul', ro: 'Rondônia', rr: 'Roraima', sc: 'Santa Catarina', sp: 'São Paulo', se: 'Sergipe',
  to: 'Tocantins', zz: 'Exterior',
};

export const urls = {
  config: (ele = ELE_T2) => `${TSE_BASE}/${CICLO}/${ele}/config/mun-e${pad(ele)}-cm.json`,
  /** abr = 'br' | uf | uf+codmun (ex.: 'sp71072') */
  result: (abr: string, ele = ELE_T2) => {
    const uf = abr === 'br' ? 'br' : abr.slice(0, 2);
    return `${TSE_BASE}/${CICLO}/${ele}/dados/${uf}/${abr}-c0001-e${pad(ele)}-u.json`;
  },
  progress: (uf: string, ele = ELE_T2) => `${TSE_BASE}/${CICLO}/${ele}/dados/${uf}/${uf}-e${pad(ele)}-ab.json`,
};

export const num = (x: unknown): number => {
  if (x === undefined || x === null || x === '') return 0;
  const n = Number(String(x).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

export interface TseResult {
  abr: string;
  dg: string; hg: string;
  secoes: number; secoesTot: number;
  aptos: number; aptosTot: number;
  comp: number;
  validos: number; brancos: number; nulos: number;
  votes: Record<number, number>;   // nº do candidato → votos
}

/** Converte o JSON "-u" do TSE (BR, UF ou município) em números. */
export function parseResult(abr: string, j: any): TseResult {
  const votes: Record<number, number> = {};
  for (const carg of j.carg ?? []) {
    for (const agr of carg.agr ?? []) {
      for (const par of agr.par ?? []) {
        for (const c of par.cand ?? []) votes[Number(c.n)] = num(c.vap);
      }
    }
  }
  const s = j.s ?? {}, e = j.e ?? {}, v = j.v ?? {};
  return {
    abr, dg: j.dg ?? '', hg: j.hg ?? '',
    secoes: num(s.ts), secoesTot: num(s.st),
    aptos: num(e.te), aptosTot: num(e.est),
    comp: num(e.c),
    validos: num(v.vv), brancos: num(v.vb), nulos: num(v.tvn),
    votes,
  };
}

export function resultToObs(id: string, r: TseResult): UnitObs {
  return {
    id, secoes: r.secoes, secoesTot: r.secoesTot, aptos: r.aptos, aptosTot: r.aptosTot,
    comp: r.comp, lula: r.votes[NR_LULA] ?? 0, flavio: r.votes[NR_FLAVIO] ?? 0,
    brancos: r.brancos, nulos: r.nulos,
  };
}

export interface ProgressRow { abr: string; tp: string; secoes: number; secoesTot: number; aptos: number; aptosTot: number; comp: number }

/** Converte o JSON "-ab" (andamento por município ou por UF). */
export function parseProgress(j: any): { dg: string; hg: string; rows: ProgressRow[] } {
  const rows: ProgressRow[] = [];
  for (const a of j.abr ?? []) {
    rows.push({
      abr: String(a.cdabr), tp: String(a.tpabr),
      secoes: num(a.s?.ts), secoesTot: num(a.s?.st),
      aptos: num(a.e?.te), aptosTot: num(a.e?.est), comp: num(a.e?.c),
    });
  }
  return { dg: j.dg ?? '', hg: j.hg ?? '', rows };
}

export async function fetchJson(url: string, timeoutMs = 15000): Promise<any> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctl.signal, cache: 'no-store' as RequestCache });
    if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

/** "24/10/2026" + "19:19:13" (horário de Brasília) → Date */
export function tseDate(dg: string, hg: string): Date | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dg ?? '');
  if (!m || !hg) return null;
  return new Date(`${m[3]}-${m[2]}-${m[1]}T${hg}-03:00`);
}
