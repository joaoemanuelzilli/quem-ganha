#!/usr/bin/env bash
# Mantém o worker rodando a noite toda: reinicia se cair e impede o PC de suspender.
#   ./run-worker.sh            (em primeiro plano)
#   nohup ./run-worker.sh &    (em segundo plano; log em live/worker.log)
SELF="$(readlink -f "$0")"
cd "$(dirname "$SELF")"
mkdir -p live
# no notebook o worker é RESERVA: só publica se a nuvem (GitHub Actions) parar
export WORKER_ROLE="${WORKER_ROLE:-backup}"
loop() {
  while true; do
    echo "=== $(date '+%F %T') iniciando worker ===" >> live/worker.log
    npx tsx worker/index.ts >> live/worker.log 2>&1
    code=$?
    [ "$code" -eq 10 ] && { echo "=== $(date '+%F %T') apuração encerrada ===" >> live/worker.log; break; }
    echo "=== $(date '+%F %T') worker saiu (código $code), reiniciando em 5s ===" >> live/worker.log
    sleep 5
  done
}
# impede suspender — inclusive ao FECHAR A TAMPA (handle-lid-switch); se o inibidor falhar, roda mesmo assim
if command -v systemd-inhibit >/dev/null 2>&1 && [ -z "$QG_INHIBITED" ]; then
  export QG_INHIBITED=1
  systemd-inhibit --what=sleep:idle:handle-lid-switch --who="quem-ganha" --why="Apuração ao vivo das eleições" "$SELF" "$@" && exit 0
  echo "⚠ systemd-inhibit falhou — rodando sem bloqueio de suspensão" >> live/worker.log
fi
loop
