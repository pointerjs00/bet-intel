#!/usr/bin/env bash
# BetIntel — O1: testa, a partir desta máquina, se as casas de apostas respondem
# aos pedidos que o comparador de odds vai usar. Só faz ~8 pedidos, espaçados.
# Não envia credenciais nem cookies. Não altera nada.
#
# Uso:   bash probe-odds.sh            (ligação direta)
#        PROXY=http://user:pass@host:port bash probe-odds.sh   (opcional, via proxy)
#
# Para cada pedido mostra: HTTP, tamanho, tempo e um diagnóstico
# (OK / BLOQUEADO (desafio Cloudflare/WAF) / VAZIO / ERRO).

set -u
UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36'
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
PROXY_ARGS=()
[ -n "${PROXY:-}" ] && PROXY_ARGS=(-x "$PROXY")

line() { printf '%-34s %-6s %-9s %-7s %s\n' "$1" "$2" "$3" "$4" "$5"; }

# probe NAME EXPECT_REGEX curl-args...
probe() {
  local name=$1 expect=$2; shift 2
  local out="$TMP/body" hdr="$TMP/hdr"
  local meta
  meta=$(curl -sS -L --compressed --max-time 15 "${PROXY_ARGS[@]}" -A "$UA" \
         -H 'Accept-Language: pt-PT,pt;q=0.9' -D "$hdr" -o "$out" \
         -w '%{http_code} %{size_download} %{time_total}' "$@" 2>"$TMP/err")
  local rc=$?
  local code size time verdict
  read -r code size time <<<"$meta"
  if [ $rc -ne 0 ] && [ "${size:-0}" = "0" ]; then
    verdict="ERRO ($(head -c 80 "$TMP/err"))"
  elif [ "$code" = "403" ] || [ "$code" = "429" ] || [ "$code" = "451" ]; then
    verdict="BLOQUEADO (HTTP $code)"
  elif grep -qaE "$expect" "$out"; then
    verdict="OK"
  elif grep -qiE 'cf-mitigated|x-datadome' "$hdr" || grep -qiE 'Just a moment|challenge-platform|Access Denied|Request unsuccessful' "$out"; then
    verdict="BLOQUEADO (desafio anti-bot)"
  else
    verdict="VAZIO/INESPERADO (início: $(head -c 60 "$out" | tr -cd '[:print:]'))"
  fi
  line "$name" "${code:-?}" "${size:-0}" "${time:-?}" "$verdict"
  sleep 2
}

echo "BetIntel probe-odds — $(date -u +%FT%TZ) — $(hostname)"
[ -n "${PROXY:-}" ] && echo "(via proxy)"
line "PEDIDO" "HTTP" "BYTES" "SEG" "DIAGNÓSTICO"

# Betclic — HTML SSR com ng-state
probe "Betclic SSR futebol" 'ng-state' 'https://www.betclic.pt/futebol-sfootball'

# Betclic — gRPC-web MatchService (futebol, pt, offset 0, limit 5)
printf '\x00\x00\x00\x00\x12\x0a\x08football\x1a\x02pt\x20\x00\x28\x05' > "$TMP/grpc.bin"
probe "Betclic gRPC-web futebol" 'Liga|League|Cup|Ta[cç]a|[A-Z][a-z]+' \
  -X POST --max-time 8 \
  -H 'content-type: application/grpc-web+proto' -H 'x-grpc-web: 1' \
  -H 'x-bg-ref-brand: BETCLIC' -H 'x-bg-ref-platform: DESKTOP' \
  -H 'x-bg-ref-regulator-zone: PT' -H 'x-bg-regulation: PT' \
  -H 'origin: https://www.betclic.pt' -H 'referer: https://www.betclic.pt/' \
  --data-binary @"$TMP/grpc.bin" \
  'https://offering.begmedia.com/web/offering.access.api/offering.access.api.MatchService/GetMatchesBySportWithNotifications'

# Betano — overview ao vivo (JSON)
probe "Betano ao vivo (JSON)" '"events"' -H 'Accept: application/json' \
  'https://www.betano.pt/danae-webapi/api/live/overview/latest?includeVirtuals=true&queryLanguageId=5&queryOperatorId=7'

# Betano — página de liga (initial_state)
probe "Betano página de liga" 'initial_state' 'https://www.betano.pt/sport/futebol/portugal/liga-2/17385/'

# Placard / Solverde — handshake Socket.IO do widget
probe "Placard Socket.IO handshake" '"sid"' 'https://sportswidget.placard.pt/vws/?EIO=4&transport=polling'
probe "Solverde Socket.IO handshake" '"sid"' 'https://sportswidget.solverde.pt/vws/?EIO=4&transport=polling'

# Lebull — página de desporto (a API própria é acrescentada depois do estudo)
probe "Lebull página de desporto" '<html' 'https://www.lebull.pt/'

# Lebull — API do sportsbook (tenant id público lido da config do próprio site)
probe "Lebull API desportos" '"id"' -H 'Accept: application/json'   -H 'X-Auth-Tenant-Id: 126dc7bf-288b-4f72-9536-3aa54648c0f4'   'https://betting-platform.prod.sbteam.xyz/sports?lang=pt&currency=EUR'

echo
echo "Copia esta tabela e envia-a ao Claude."
