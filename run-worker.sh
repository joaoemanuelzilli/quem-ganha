#!/usr/bin/env bash
# Mantém o worker rodando a noite toda: reinicia se cair e impede o PC de suspender.
#   ./run-worker.sh            (em primeiro plano)
#   nohup ./run-worker.sh &    (em segundo plano; log em live/worker.log)
cd "$(dirname "$0")"
mkdir -p live
loop() {
  while true; do
    echo "=== $(date '+%F %T') iniciando worker ===" >> live/worker.log
    npx tsx worker/index.ts >> live/worker.log 2>&1
    echo "=== $(date '+%F %T') worker saiu (código $?), reiniciando em 5s ===" >> live/worker.log
    sleep 5
  done
}
if command -v systemd-inhibit >/dev/null 2>&1 && [ -z "$QG_INHIBITED" ]; then
  export QG_INHIBITED=1
  exec systemd-inhibit --what=sleep:idle --who="quem-ganha" --why="Apuração ao vivo das eleições" "$0" "$@"
fi
loop
