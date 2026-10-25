#!/usr/bin/env bash
# Grava um snapshot da previsão no branch "ao-vivo" (registro público, com horário, do que o
# modelo dizia durante a apuração). Chamado pelo worker a cada 10 min. Usa um worktree separado
# para nunca mexer no branch principal.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
# nunca pede senha, desiste de conexão travada, uma execução por vez
export GIT_TERMINAL_PROMPT=0 GIT_HTTP_LOW_SPEED_LIMIT=1000 GIT_HTTP_LOW_SPEED_TIME=20
mkdir -p "$ROOT/live"
exec 9>"$ROOT/live/.snapshot.lock"
flock -n 9 || exit 0
git worktree prune 2>/dev/null || true
WT="$ROOT/../quem-ganha-ao-vivo"
if [ ! -d "$WT/.git" ] && [ ! -f "$WT/.git" ]; then
  if git ls-remote --exit-code --heads origin ao-vivo >/dev/null 2>&1; then
    git fetch -q origin ao-vivo:ao-vivo 2>/dev/null || true
    git worktree add -q "$WT" ao-vivo
  else
    git worktree add -q --orphan -b ao-vivo "$WT"
  fi
fi
[ -f "$ROOT/live/state.public.json" ] || exit 0
# parte sempre do que já está no GitHub (a nuvem e o notebook podem se revezar)
git -C "$WT" rebase --abort 2>/dev/null || true
rm -f "$(git -C "$WT" rev-parse --git-dir 2>/dev/null)/index.lock" 2>/dev/null || true
git -C "$WT" checkout -q ao-vivo 2>/dev/null || true
timeout 60 git -C "$WT" fetch -q origin ao-vivo 2>/dev/null && git -C "$WT" reset -q --hard origin/ao-vivo || true
mkdir -p "$WT/snapshots"
TS=$(TZ=America/Sao_Paulo date +%Y%m%d-%H%M)
cp "$ROOT/live/state.public.json" "$WT/snapshots/$TS.json"
cp "$ROOT/live/state.public.json" "$WT/latest.json"
[ -f "$ROOT/live/history.ndjson" ] && cp "$ROOT/live/history.ndjson" "$WT/history.ndjson"
MSG=$(python3 -c "
import json;from datetime import datetime,timedelta;s=json.load(open('$WT/latest.json'));f=s['forecast']
t=(datetime.fromisoformat(s['generatedAt'].replace('Z','+00:00'))-timedelta(hours=3)).strftime('%H:%M')
print('Previsão %s (Brasília) — %.2f%% apurado · Lula %.2f%% [%.1f–%.1f] · P(Lula) %.1f%%' % (t, s['progress']['pct'], f['lulaPct']['mean'], f['lulaPct']['p05'], f['lulaPct']['p95'], 100*f['winProbLula']))")
cd "$WT"
if [ ! -f README.md ]; then
  printf '# 📼 Gravação ao vivo — QUEM GANHA? 2026\n\nSnapshots automáticos da previsão durante a apuração do 2º turno (25/10/2026), gravados pelo worker a cada 10 minutos.\n\n- `latest.json`: último estado publicado\n- `snapshots/AAAAMMDD-HHMM.json`: estado em cada momento (horário de Brasília)\n- `history.ndjson`: todos os ciclos do modelo (%% apurado, previsão, intervalo, chance)\n\nO commit de cada snapshot registra a hora em que a previsão foi feita.\n' > README.md
fi
git add -A
git commit -q -m "$MSG" || exit 0
timeout 90 git push -q origin HEAD:ao-vivo \
  || { timeout 60 git fetch -q origin ao-vivo && git rebase -q -X theirs origin/ao-vivo && timeout 90 git push -q origin HEAD:ao-vivo; } \
  || { git rebase --abort 2>/dev/null; exit 1; }
