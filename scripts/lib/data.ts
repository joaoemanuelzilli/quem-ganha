// Leitura dos dados processados (data/processed/*.csv.gz) e montagem de priors/linhas do tempo.
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import type { UnitPrior } from '../../engine/types';

export const ROOT = new URL('../../', import.meta.url).pathname;
export const PROC = `${ROOT}data/processed/`;

export function readCsvGz(path: string): Record<string, string>[] {
  const txt = gunzipSync(readFileSync(path)).toString('utf8');
  const lines = txt.split(/\r?\n/).filter(Boolean);
  const head = lines[0].split(',');
  return lines.slice(1).map((l) => {
    const cells = l.split(',');
    const o: Record<string, string> = {};
    for (let i = 0; i < head.length; i++) o[head[i]] = cells[i];
    return o;
  });
}

export const unitId = (uf: string, cd: string | number) => `${uf.toLowerCase()}${String(cd).padStart(5, '0')}`;
export const exists = (f: string) => existsSync(`${PROC}${f}`);
export const candCols = (row: Record<string, string>) => Object.keys(row).filter((k) => /^c\d+$/.test(k));
const N = (x: string | undefined) => (x ? Number(x) : 0);

/** Priors no formato do motor a partir de um arquivo mun_*.csv.gz, com A no papel de "lula" e B de "flavio". */
export function priorsFromMun(file: string, a: string, b: string): UnitPrior[] {
  const rows = readCsvGz(`${PROC}${file}`);
  const cols = candCols(rows[0]);
  return rows.map((r) => {
    const tot = cols.reduce((s, c) => s + N(r[c]), 0);
    const lula = N(r[a]), flavio = N(r[b]);
    return {
      id: unitId(r.uf, r.cd_mun), uf: r.uf.toLowerCase(), name: r.nm_mun,
      aptos: N(r.aptos), secoes: N(r.secoes),
      t1: { lula, flavio, outros: tot - lula - flavio, validos: tot, brancos: N(r.brancos), nulos: N(r.nulos), comp: N(r.comp) },
    };
  });
}

export interface Truth { units: Map<string, { aptos: number; secoes: number; a: number; b: number; comp: number }>; aPct: number; a: number; b: number }

export function truthFromMun(file: string, a: string, b: string): Truth {
  const rows = readCsvGz(`${PROC}${file}`);
  const units = new Map<string, { aptos: number; secoes: number; a: number; b: number; comp: number }>();
  let A = 0, B = 0;
  for (const r of rows) {
    units.set(unitId(r.uf, r.cd_mun), { aptos: N(r.aptos), secoes: N(r.secoes), a: N(r[a]), b: N(r[b]), comp: N(r.comp) });
    A += N(r[a]); B += N(r[b]);
  }
  return { units, a: A, b: B, aPct: (100 * A) / (A + B) };
}

export interface TimelineRow { id: string; uf: string; minute: number; secoes: number; aptos: number; comp: number; brancos: number; nulos: number; a: number; b: number }

export function readTimeline(file: string, a: string, b: string): TimelineRow[] {
  const rows = readCsvGz(`${PROC}${file}`).map((r) => ({
    id: unitId(r.uf, r.cd_mun), uf: r.uf.toLowerCase(),
    // urnas recebidas antes das 17h (exterior, fusos) só são divulgadas às 17h
    minute: Math.max(0, N(r.minute)),
    secoes: N(r.secoes), aptos: N(r.aptos), comp: N(r.comp), brancos: N(r.brancos), nulos: N(r.nulos), a: N(r[a]), b: N(r[b]),
  }));
  rows.sort((x, y) => x.minute - y.minute);
  return rows;
}
