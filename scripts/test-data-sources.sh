#!/usr/bin/env bash
# Checks that the free sports data sources answer from this machine's IP (run it on the Hetzner VPS).
# Plain, identified requests only. Usage: bash scripts/test-data-sources.sh
set -u
UA="Mozilla/5.0 (compatible; personal-sports-research/1.0)"
TODAY=$(date -u +%Y%m%d)

check() {
  local name="$1" url="$2"
  local out
  out=$(curl -s -o /dev/null -w "%{http_code} %{time_total}s %{size_download}B" -H "User-Agent: $UA" -H "Accept: application/json" --max-time 20 "$url")
  printf "%-28s %s\n" "$name" "$out"
}

echo "Free sports data sources — $(date -u '+%Y-%m-%d %H:%M UTC') — host $(hostname)"
check "ESPN football scoreboard"  "https://site.api.espn.com/apis/site/v2/sports/soccer/por.1/scoreboard"
check "ESPN football summary"     "https://site.api.espn.com/apis/site/v2/sports/soccer/por.1/summary?event=401885402"
check "ESPN standings"            "https://site.api.espn.com/apis/v2/sports/soccer/por.1/standings"
check "ESPN tennis ATP"           "https://site.api.espn.com/apis/site/v2/sports/tennis/atp/scoreboard"
check "ESPN tennis WTA"           "https://site.api.espn.com/apis/site/v2/sports/tennis/wta/scoreboard"
check "FotMob matches by date"    "https://www.fotmob.com/api/data/matches?date=$TODAY"
check "FotMob match details"      "https://www.fotmob.com/api/data/matchDetails?matchId=5887676"
check "LiveScore football by date" "https://prod-public-api.livescore.com/v1/api/app/date/soccer/$TODAY/0?MD=1"
check "LiveScore tennis live"     "https://prod-public-api.livescore.com/v1/api/app/live/tennis/0?MD=1"
check "WTA official tournaments"  "https://api.wtatennis.com/tennis/tournaments/?page=0&pageSize=5&excludeLevels=ITF"
echo "Expected: 200 on every line. A 403 or 429 means that source blocks or limits this IP."
