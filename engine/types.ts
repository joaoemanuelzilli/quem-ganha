// Contrato de dados compartilhado entre o motor de previsão, o worker e o dashboard.

export type CandKey = 'lula' | 'flavio';

export interface Candidate {
  key: CandKey;
  nr: number;
  name: string;
  fullName: string;
  party: string;
  color: string;
}

/** Uma "unidade" geográfica do modelo: município (worker) ou UF (navegador). */
export interface UnitPrior {
  id: string;          // ex.: "sp71072" (município) ou "sp" (UF)
  uf: string;          // sigla minúscula, "zz" = exterior
  name: string;
  aptos: number;       // eleitorado apto
  secoes: number;      // total de seções
  /** 1º turno 2026 */
  t1: { lula: number; flavio: number; outros: number; validos: number; brancos: number; nulos: number; comp: number };
  /** 2º turno 2022 (Lula x Bolsonaro), quando disponível */
  t22?: { lula: number; bolso: number };
}

/** Apuração observada (parcial) de uma unidade. */
export interface UnitObs {
  id: string;
  secoesTot: number;   // st
  secoes: number;      // ts
  aptosTot: number;    // est (eleitorado das seções totalizadas)
  aptos: number;       // te
  comp: number;
  lula: number;
  flavio: number;
  brancos: number;
  nulos: number;
}

export interface Quantiles { mean: number; p05: number; p25: number; p50: number; p75: number; p95: number }

export interface MethodResult {
  id: string;
  name: string;        // nome "gamer" do método
  desc: string;
  lulaPct: number;     // % dos válidos projetado ao final
  winProbLula?: number;
  weight?: number;     // peso no ensemble
  mae1?: number | null; // erro histórico (pp) com 1% apurado — backtest das presidenciais
  mae5?: number | null; // idem com 5%
  official?: boolean;   // é a previsão oficial do site
}

export interface TrajectoryPoint {
  pct: number;         // % seções totalizadas (0-100)
  t?: string;          // horário ISO previsto
  lula: { p05: number; p50: number; p95: number }; // % válidos do Lula acumulado naquele ponto
}

export interface StateRow {
  uf: string;
  name: string;
  pct: number;               // % seções totalizadas
  lulaPct: number | null;    // % válidos apurados
  projLulaPct: number;       // projeção final
  winProbLula: number;
  aptos: number;
  validosProj: number;
  t1LulaTwoParty: number;    // referência 1º turno (Lula / (Lula+Flávio))
}

export interface HistoryPoint {
  t: string;         // ISO
  pct: number;       // % seções totalizadas
  lulaPct: number;   // % válidos apurados
  projLulaPct: number;
  projLo: number;
  projHi: number;
  winProbLula: number;
}

/** Termômetros populares: "quem ganha em Minas ganha o Brasil" e "o Nordeste decide no fim". */
export interface Thermometers {
  minas: {
    pct: number; lulaPct: number | null; projLulaPct: number; winProbLula: number; leader: CandKey;
    record: string;                    // histórico do termômetro
    impliedNationalLula: number | null; // swing de MG aplicado ao país inteiro
  };
  nordeste: {
    pct: number; lulaPct: number | null; projLulaPct: number;
    neededLulaPct: number;             // quanto Lula precisa no NE (dado o projetado no resto) para chegar a 50%
    t1LulaPct: number;                 // Lula/(Lula+Flávio) no NE no 1º turno
    impliedNationalLula: number | null; // swing do NE aplicado ao país inteiro
  };
}

export interface GameEvent { t: string; kind: 'info' | 'lead' | 'call' | 'state' | 'milestone' | 'swing'; text: string; who?: CandKey }

export interface ForecastState {
  version: 1;
  generatedAt: string;
  source: 'worker' | 'browser' | 'replay' | 'pre';
  election: { id: string; turno: number; name: string };
  status: 'pre' | 'counting' | 'final';
  tse: { dg: string; hg: string };
  candidates: Candidate[];
  progress: {
    secoes: number; secoesTot: number; pct: number;
    aptos: number; aptosTot: number;
    comp: number; turnoutPct: number;
  };
  current: {
    lula: number; flavio: number; validos: number; brancos: number; nulos: number;
    lulaPct: number; flavioPct: number; margin: number; leader: CandKey | null;
  };
  forecast: {
    lulaPct: Quantiles;
    winProbLula: number;
    leader: CandKey;
    /** none = cedo demais; projected = modelo confiante; mathematical = virada impossível */
    call: 'none' | 'lean' | 'projected' | 'mathematical';
    calledAt?: string;
    projVotes: { lula: number; flavio: number; validos: number; comp: number };
    turnoutPct: number;
    swingVsT1: number;          // pontos percentuais de swing (2-partidos) vs 1º turno
    methods: MethodResult[];
    trajectory: TrajectoryPoint[];
    etaFinish: string | null;   // horário previsto para 100%
    units: 'municipio' | 'uf';
    /** true enquanto < 1% apurado: previsão ainda instável (dados entrando com peso reduzido) */
    warmingUp?: boolean;
    unitsReporting: number;
    unitsTotal: number;
  };
  prior: { lulaPct: number; sd: number; source: string };
  thermometers?: Thermometers;
  history: HistoryPoint[];
  states: StateRow[];
  events: GameEvent[];
}
