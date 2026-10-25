// QUEM GANHA? 2026 — orquestra o dashboard a partir do feed (ou da demo).
import type { ForecastState } from '../../engine/types';
import type { FeedMeta } from './feed';
import { startMock } from './mock';
import { $, fmtNum, timeHMS } from './format';
import { Hud } from './hud';
import { Arena } from './arena';
import { Power } from './power';
import { Projection } from './projection';
import { Methods } from './methods';
import { LevelMap } from './map';
import { BattleLog } from './log';
import { Thermo } from './thermo';
import { mountPoly } from './polymarket';
import { Pregame } from './pregame';
import { sfx } from './sound';
import { confetti, roundSplash, startSky } from './fx';
import { iconSvg } from './sprites';

const params = new URLSearchParams(location.search);
const demoParam = params.get('demo');

startSky(document.getElementById('sky') as HTMLCanvasElement);

const app = $('app');
const game = $('game');
const hud = new Hud($('hud'));
const arena = new Arena($('arena-plot'), $('arena-legend'), $('arena-table'));
const power = new Power($('power'));
const proj = new Projection($('proj'));
const methods = new Methods($('methods'));
const map = new LevelMap($('map'));
const log = new BattleLog($('log'));
const thermo = new Thermo($('thermo'));
const pregame = new Pregame($('pregame'));
let polyStop: (() => void) | null = null;

// ---------------------------------------------------------------- som
const btnSound = $('btn-sound');
const paintSound = () => {
  btnSound.setAttribute('aria-pressed', String(!sfx.muted));
  btnSound.querySelector('.snd-ico')!.innerHTML = iconSvg(sfx.muted ? 'mute' : 'speaker', sfx.muted ? '#8686bd' : '#ffd400', 14);
  btnSound.querySelector('.snd-txt')!.textContent = sfx.muted ? 'SOM OFF' : 'SOM ON';
  btnSound.setAttribute('aria-label', sfx.muted ? 'Ligar efeitos sonoros' : 'Desligar efeitos sonoros');
};
btnSound.addEventListener('click', () => { sfx.setMuted(!sfx.muted); paintSound(); });
paintSound();

// ---------------------------------------------------------------- topo e rodapé
const STAGES = ['Primeiras urnas', 'Primeiros golpes', 'Troca de golpes', 'Pressão total', 'Metade do caminho', 'Reta decisiva', 'Contra-ataque', 'Últimos combos', 'Sprint final', 'Últimas seções'];
const MODE_TXT: Record<FeedMeta['mode'], string> = { demo: 'MODO DEMO', worker: 'AO VIVO', browser: 'AO VIVO', pre: 'PRÉ-JOGO' };

function paintTop(s: ForecastState, meta: FeedMeta): void {
  const badge = $('mode-badge');
  const shown: FeedMeta['mode'] = s.status === 'pre' && meta.mode !== 'demo' ? 'pre' : meta.mode;
  badge.textContent = MODE_TXT[shown] ?? shown;
  badge.title = meta.mode === 'demo' ? 'Apuração simulada para demonstração — não são dados reais' : meta.mode === 'pre' ? 'A apuração ainda não começou' : 'Dados reais do TSE';
  badge.dataset.mode = shown;
  const st = $('stage');
  const n = st.querySelector('.stage-n')!;
  const name = st.querySelector('.stage-name')!;
  if (s.status === 'pre') { n.textContent = 'STAGE 0'; name.textContent = 'Tela de título'; return; }
  if (s.status === 'final') { n.textContent = 'FIM DE JOGO'; name.textContent = 'Apuração encerrada'; return; }
  const pct = Number.isFinite(s.progress?.pct) ? s.progress.pct : 0;
  const k = Math.max(0, Math.min(9, Math.floor(pct / 10)));
  n.textContent = `STAGE ${k + 1}`;
  name.textContent = `${STAGES[k]} — ${pct >= 100 ? '100' : fmtNum(Math.floor(pct * 10) / 10, 1)}% apurado`;
}

const footer = $('footer');
footer.innerHTML = `
  <div class="fl">
    <span class="src" data-f="src">…</span>
    <span>Atualizado <b data-f="upd">—</b> <span data-f="ago"></span></span>
    <span>TSE gerou <b data-f="tse">—</b></span>
  </div>
  <div class="fl">
    <a href="https://resultados.tse.jus.br/oficial/app/index.html#/eleicao/6258/uf/br/cargo/1/vis/nominal/resultados" target="_blank" rel="noopener">Resultados oficiais no TSE ↗</a>
    <a href="https://github.com/joaoemanuelzilli/quem-ganha" target="_blank" rel="noopener">Código no GitHub ↗</a>
    <a data-f="demo" href="?demo=1">▶ Jogar demo</a>
  </div>
  <p class="disc">Projeto independente, não oficial. Previsão estatística — resultado oficial só no TSE.</p>`;
const ff = (k: string) => footer.querySelector<HTMLElement>(`[data-f="${k}"]`)!;
let lastOk = 0;
function paintFooter(s: ForecastState, meta: FeedMeta): void {
  const src = ff('src');
  src.dataset.mode = meta.mode;
  src.textContent = meta.mode === 'demo' ? 'FONTE: DEMO (SIMULADA)' : meta.mode === 'worker' ? 'FONTE: WORKER' : meta.mode === 'browser' ? 'FONTE: NAVEGADOR' : 'FONTE: PRÉ-JOGO';
  src.title = meta.error ?? '';
  lastOk = meta.lastOk;
  lastMode = meta.mode;
  ff('upd').textContent = timeHMS(meta.lastOk);
  ff('tse').textContent = s.tse?.hg ? `${s.tse.dg ?? ''} ${s.tse.hg}`.trim() : '—';
  const demo = ff('demo') as HTMLAnchorElement;
  if (meta.mode === 'demo') { demo.textContent = '■ Sair da demo'; demo.href = location.pathname; }
  else { demo.textContent = '▶ Jogar demo'; demo.href = '?demo=1'; }
}
let lastMode: FeedMeta['mode'] | null = null;
setInterval(() => {
  if (!lastOk) return;
  const badge = $('mode-badge');
  if (lastMode !== 'demo' && Date.now() - lastOk > 120_000) { badge.textContent = 'RECONECTANDO…'; badge.dataset.mode = 'stale'; badge.title = 'Sem dados novos há mais de 2 minutos — tentando de novo automaticamente'; }
  const s = Math.max(0, Math.round((Date.now() - lastOk) / 1000));
  ff('ago').textContent = s < 5 ? '(agora)' : `(há ${s < 60 ? `${s} s` : `${Math.floor(s / 60)} min`})`;
}, 1000);

// ---------------------------------------------------------------- transições do jogo
let prev: ForecastState | null = null;
let celebrated = '';

function moments(s: ForecastState, meta: FeedMeta): void {
  const p = prev;
  if (s.status === 'pre') return;
  // queda grande de % só significa reinício na DEMO (ao vivo pode ser só troca de fonte)
  const restarted = !p || p.status === 'pre' || (meta.mode === 'demo' && s.progress.pct + 5 < p.progress.pct);
  if (restarted && s.status === 'counting' && s.progress.pct < 5) {
    roundSplash('ROUND 1', 'FIGHT!');
    sfx.fight();
    celebrated = '';
    return;
  }
  if (!p) return;
  if (p.current.leader && s.current.leader && p.current.leader !== s.current.leader) sfx.lead();
  else if (Math.floor(s.progress.pct / 10) > Math.floor(p.progress.pct / 10)) sfx.milestone();
  const call = s.forecast.call;
  if (s.forecast.warmingUp) return;
  if ((call === 'projected' || call === 'mathematical') && celebrated !== `${call}:${s.forecast.leader}`) {
    const firstCall = !celebrated;
    celebrated = `${call}:${s.forecast.leader}`;
    if (firstCall || call === 'mathematical') {
      const c = s.forecast.leader === 'lula' ? ['#e8222e', '#ff6b72', '#ffd400', '#ffffff'] : ['#19c35a', '#7cf2a4', '#ffd400', '#ffffff'];
      confetti($('fx'), c);
      sfx.call();
    }
  }
}

// ---------------------------------------------------------------- render
const safe = (name: string, f: () => void) => { try { f(); } catch (e) { console.error(`[quem-ganha] painel ${name}`, e); } };
function onState(s: ForecastState, meta: FeedMeta): void {
  try {
    app.classList.remove('is-loading');
    paintTop(s, meta);
    paintFooter(s, meta);
    app.classList.toggle('is-pre', s.status === 'pre');
    if (s.status === 'pre') {
      game.hidden = true;
      pregame.show(s);
      if (polyStop) { polyStop(); polyStop = null; }
    } else {
      pregame.hide();
      game.hidden = false;
      if (!polyStop) polyStop = mountPoly($('poly'));
      // cada painel isolado: um erro num deles nunca congela os outros
      safe('hud', () => hud.update(s, meta));
      safe('arena', () => arena.update(s));
      safe('power', () => power.update(s));
      safe('proj', () => proj.update(s));
      safe('methods', () => methods.update(s));
      safe('map', () => map.update(s));
      safe('thermo', () => thermo.update(s));
      safe('log', () => log.update(s));
      safe('moments', () => moments(s, meta));
      const c = s.current;
      document.title = c.validos > 0
        ? `${fmtNum(c.lulaPct, 1)}% LULA × FLÁVIO ${fmtNum(c.flavioPct, 1)}% · ${fmtNum(s.progress.pct, 0)}% apurado — QUEM GANHA?`
        : 'QUEM GANHA? 2026 — Lula x Flávio ao vivo';
    }
    prev = s;
  } catch (err) {
    console.error('[quem-ganha] falha ao renderizar estado', err);
  }
}

// A demo não depende do motor: o feed ao vivo é carregado sob demanda.
if (demoParam === 'pre') startMock(onState, { pre: true });
else if (demoParam != null && demoParam !== '0') startMock(onState);
else {
  import('./feed')
    .then((m) => m.startFeed(onState))
    .catch((err) => {
      console.error('[quem-ganha] falha ao carregar o feed ao vivo', err);
      app.classList.remove('is-loading');
      game.hidden = true;
      const pg = $('pregame');
      pg.hidden = false;
      pg.innerHTML = `<section class="panel feed-err">
        <h2 class="panel-title">SEM SINAL<small>Não foi possível carregar os dados ao vivo. Recarregue a página em alguns segundos.</small></h2>
        <a class="btn-play" href="?demo=1">JOGAR DEMO</a></section>`;
      const badge = $('mode-badge');
      badge.textContent = 'OFFLINE';
      const src = footer.querySelector<HTMLElement>('[data-f="src"]');
      if (src) src.textContent = 'FONTE: OFFLINE';
    });
}
