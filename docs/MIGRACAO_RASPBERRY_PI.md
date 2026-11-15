# Migração Hetzner → Raspberry Pi 5 (todas as apps)

15/11/2026. Inventário feito no servidor `ubuntu-4gb-nbg1-1` (Hetzner, Nuremberga).

## 0. O que existe hoje

| App | Pasta no Hetzner (compose + .env) | Contentores | Dados a levar | Endereços públicos → porta |
|---|---|---|---|---|
| **BetIntel** | `/root/betintel/apps/api` | `api-api-1` (imagem GHCR), `api-redis-1` | Postgres **do sistema**, base `betintel` (~300 MB); volume `api_uploads_data` (avatares). O Redis é cache e não precisa de ir. | `betintel-api.stream-intel.online` → 3000; `api.stream-intel.online` → 3000; `stream-intel.online/health` e `/socket.io/` → 3000 |
| **Stream-Intel** | `/home/streamuser/stream-intel` | `stream-intel-app-1` (imagem `ghcr.io/jbsousapsn/stream-intel`) | SQLite em `/home/streamuser/stream-intel/data/stream_intel.db` | `streamintel-api.stream-intel.online` → 8000; `stream-intel.online/api/` → 8000 |
| **Parlay League** | `/home/betintel_user/parlay-league` | `web` (Caddy, :8090), `api` (.NET), `postgres:16` | Volume `parlay-league_postgres_data`, base `parlay_league`. O volume `parlay-league_parlay_postgres_data` é antigo e não está em uso. | `couveflor.site` → 8090 |
| **Pricetracker** | `/home/betintel_user/pricetracker` | `pricetracker-api` (:8080) | Pasta `/home/betintel_user/pricetracker/data` | `plener.xuxus.site` → 8080 |

Notas:
- `stream-intel.online/` aponta para a porta 8005, onde não corre nada. O ficheiro `streamintell.bak` está ativo e duplica blocos. Não se migra o Nginx, por isso isto desaparece.
- A API do BetIntel está publicada em `0.0.0.0:3000`, à margem do Nginx. No Pi, todas as portas ficam só em `127.0.0.1`.
- Os dados das 4 apps somam menos de 1 GB. O espaço usado no Hetzner é quase todo imagens e cache de build (cerca de 25 GB recuperáveis).

## 1. Arquitetura no Pi

```
Internet ─► Cloudflare (DNS + HTTPS) ─► cloudflared (túnel, no Pi) ─► 127.0.0.1:<porta> de cada app
Tu ─► Tailscale ─► SSH ao Pi
GitHub Actions ─► runner no Pi (um por repositório) ─► docker compose build/up
```

- Nenhuma porta aberta no router.
- Os domínios mantêm-se, por isso **as apps móveis não precisam de build nova**.
- `lusousa.dynip.sapo.pt` (DNS dinâmico da MEO) fica como plano B: abrir as portas 80/443 no router, pôr um Caddy no Pi e criar um CNAME dos domínios para esse endereço.

Organização no Pi:
```
/srv/betintel/       docker-compose.yml, .env, backups/
/srv/stream-intel/   (repositório clonado) + data/
/srv/parlay-league/  (repositório clonado)
/srv/pricetracker/   (repositório clonado) + data/
/srv/backups/        dumps diários
```

## 2. Preparar o Pi

1. SSD no M.2 HAT+, fonte oficial de 27 W, Active Cooler, cabo de rede.
2. Raspberry Pi Imager → **Raspberry Pi OS Lite (64-bit)** gravado no SSD. Nas opções: hostname `pi-server`, o teu utilizador, SSH só com chave (cola `~/.ssh/id_ed25519.pub`).
3. Primeiro arranque e configuração:
   ```bash
   sudo apt update && sudo apt full-upgrade -y
   sudo rpi-eeprom-update -a && sudo raspi-config     # Advanced → Boot Order → NVMe primeiro
   sudo apt install -y unattended-upgrades ufw git sqlite3
   sudo dpkg-reconfigure -plow unattended-upgrades
   sudo ufw default deny incoming && sudo ufw allow from 192.168.1.0/24 to any port 22 && sudo ufw enable
   ```
   No `ufw`, ajusta a rede à do teu router.
4. No router da MEO: **reserva de DHCP** para o Pi.
5. Docker e rotação de logs:
   ```bash
   curl -fsSL https://get.docker.com | sh && sudo usermod -aG docker $USER && newgrp docker
   echo '{"log-driver":"local","log-opts":{"max-size":"10m","max-file":"3"}}' | sudo tee /etc/docker/daemon.json
   sudo systemctl restart docker
   docker network create app_network
   ```
6. Tailscale: `curl -fsSL https://tailscale.com/install.sh | sh && sudo tailscale up --ssh`. Instala também a app no PC e no telemóvel.

## 3. Domínios na Cloudflare (sem corte)

Para cada domínio (`stream-intel.online`, `couveflor.site`, `xuxus.site`):
1. dash.cloudflare.com → **Add a site** → plano Free. A Cloudflare importa os registos DNS atuais, que ainda apontam para o Hetzner (178.104.68.233). Confirma que estão todos.
2. No registo onde compraste o domínio, muda os nameservers para os dois que a Cloudflare indica.
3. Espera pelo e-mail "active" (minutos a horas). Nada muda para quem usa as apps, porque os registos continuam a apontar para o Hetzner.

## 4. Túnel

1. Cloudflare → Zero Trust → Networks → Tunnels → **Create a tunnel** (Cloudflared), com o nome `pi-server`.
2. Copia o comando "Debian / arm64" com o token e corre-o no Pi. Isso instala o `cloudflared` como serviço.
3. As rotas (Public hostnames) entram **uma app de cada vez**, no passo de corte de cada app (secção 6). Quando crias uma rota, a Cloudflare substitui o registo A antigo por um CNAME para o túnel.

## 5. Imagens ARM64 e deploy

O Pi é ARM64, e as imagens atuais são x86.
- **Parlay League, Pricetracker e Stream-Intel:** clonar o repositório no Pi e `docker compose build`. Constrói nativamente em ARM64.
- **BetIntel:** o workflow passa a gerar a imagem `linux/arm64` (QEMU + buildx), e o Prisma ganha `binaryTargets = ["native", "linux-musl-arm64-openssl-3.0.x"]`. Feito no repositório.
- **Deploy automático:** em cada repositório, Settings → Actions → Runners → New self-hosted runner → Linux ARM64. Instala-o no Pi numa pasta própria (`~/runners/<app>`) com `./svc.sh install`. O workflow de deploy passa a `runs-on: [self-hosted, linux, ARM64]` e faz `git pull` + `docker compose up -d --build`, sem SSH. ⚠️ **Só com os repositórios privados.**

## 6. Migrar cada app

Ordem, da mais simples para a mais crítica: **Pricetracker → Stream-Intel → Parlay League → BetIntel.** Cada app segue o mesmo ciclo: ensaio → corte → teste → desligar no Hetzner.

### 6.1 Pricetracker
```bash
# Hetzner
cd /home/betintel_user/pricetracker && docker compose stop
tar czf /tmp/pricetracker-data.tgz data .env docker-compose.yml
# Pi
scp root@178.104.68.233:/tmp/pricetracker-data.tgz /tmp/
git clone git@github.com:<conta>/<repo-pricetracker>.git /srv/pricetracker
tar xzf /tmp/pricetracker-data.tgz -C /srv/pricetracker
cd /srv/pricetracker && docker compose up -d --build
curl -I http://127.0.0.1:8080
```
Corte: no túnel, cria a rota `plener.xuxus.site` → `http://localhost:8080`. Testa no browser. Hetzner: `docker compose down`.

Se o compose tiver `ports: "8080:8080"`, muda para `"127.0.0.1:8080:8080"`. Faz o mesmo nas outras apps.

### 6.2 Stream-Intel (SQLite)
```bash
# Hetzner
cd /home/streamuser/stream-intel && docker compose stop
sqlite3 data/stream_intel.db ".backup /tmp/stream_intel.db"
tar czf /tmp/stream-intel.tgz -C /tmp stream_intel.db -C /home/streamuser/stream-intel .env docker-compose.yml
# Pi
git clone git@github.com:<conta>/<repo-stream-intel>.git /srv/stream-intel
mkdir -p /srv/stream-intel/data && tar xzf /tmp/stream-intel.tgz -C /srv/stream-intel
mv /srv/stream-intel/stream_intel.db /srv/stream-intel/data/
cd /srv/stream-intel && docker compose up -d --build     # build em vez da imagem amd64 do GHCR
```
Corte, com rotas no túnel:
- `streamintel-api.stream-intel.online` → `http://localhost:8000`;
- `stream-intel.online`, caminho `^/api/` → `http://localhost:8000`.

### 6.3 Parlay League (Postgres em contentor)
```bash
# Hetzner
cd /home/betintel_user/parlay-league
docker compose exec -T postgres pg_dump -U parlay -Fc parlay_league > /tmp/parlay.dump
tar czf /tmp/parlay-conf.tgz .env docker-compose.yml
# Pi
git clone git@github.com:<conta>/<repo-parlay-league>.git /srv/parlay-league
tar xzf /tmp/parlay-conf.tgz -C /srv/parlay-league && cd /srv/parlay-league
docker compose up -d postgres && sleep 10
docker compose exec -T postgres pg_restore -U parlay -d parlay_league --no-owner < /tmp/parlay.dump
docker compose up -d --build
```
Corte: `couveflor.site` → `http://localhost:8090`.

Os volumes do Caddy não são precisos, porque o HTTPS passa a ser da Cloudflare.

### 6.4 BetIntel (por último, porque tem o tracker ao vivo)
O ficheiro `/srv/betintel/docker-compose.yml` (preparado no repositório) inclui:
- `postgres:16` (`betintel-db`), com volume, em `app_network`;
- `redis:7-alpine`;
- a API, com `127.0.0.1:3000:3000`.

O `.env` muda em:
- `DATABASE_URL=postgresql://betintel_user:<NOVA>@betintel-db:5432/betintel`;
- `REDIS_URL=redis://redis:6379`.

```bash
# Hetzner (janela de 15–30 min)
docker stop api-api-1
sudo -u postgres pg_dump -Fc betintel > /tmp/betintel.dump
docker run --rm -v api_uploads_data:/d -v /tmp:/b alpine tar czf /b/uploads.tgz -C /d .
# Pi
cd /srv/betintel && docker compose up -d betintel-db redis && sleep 10
docker compose exec -T betintel-db pg_restore -U betintel_user -d betintel --no-owner < /tmp/betintel.dump
docker compose run --rm -v /tmp:/b api sh -c "tar xzf /b/uploads.tgz -C /app/apps/api/uploads"
docker compose up -d api
curl http://127.0.0.1:3000/health
```
Corte, com rotas no túnel:
- `betintel-api.stream-intel.online` → `http://localhost:3000`;
- `api.stream-intel.online` → `http://localhost:3000`;
- `stream-intel.online`, caminhos `^/health$` e `^/socket.io/` → `http://localhost:3000`. Estas entram **antes** da regra `^/api/` do Stream-Intel.

O WebSocket (Socket.IO) passa pelo túnel sem configuração extra.

Teste na app:
- login;
- lista de boletins;
- "A decorrer";
- uma notificação de teste.

## 7. Depois de migrar

- **Trocar segredos** que estiveram expostos:
  - a palavra-passe do Postgres do BetIntel, que está escrita no `DEPLOY.md` e no histórico do git;
  - a palavra-passe do Postgres do Parlay e as chaves TMDB/OMDB do Stream-Intel, que foram coladas numa conversa;
  - `JWT_SECRET` e `JWT_REFRESH_SECRET` do BetIntel.
  Atualiza-os nos `.env` do Pi e nos GitHub Secrets.
- **Backups diários** (`/srv/backups/backup.sh`, cron às 04:00): `pg_dump` do BetIntel e do Parlay, `sqlite3 .backup` do Stream-Intel e `tar` dos dados do Pricetracker e dos uploads do BetIntel. Guarda 7 dias no SSD e envia uma cópia para fora de casa com `rclone` (Google Drive ou Backblaze B2). **Faz um restauro de teste.**
- **Monitorização:** Uptime Kuma num contentor, a vigiar os 5 endereços públicos, com alerta no telemóvel.
- **Hetzner:** desligar sem apagar. Ao fim de 2 semanas sem problemas, fazer um snapshot (opcional) e apagar o servidor. Retirar os segredos `HETZNER_*` do GitHub.
- **BetIntel:** com o IP português de casa, a Betano passa a responder sem proxy (ver `docs/analise-2026-11/ESTUDO_ODDS.md`).

## 8. Limites a aceitar

Se a luz ou a internet de casa falharem, as apps ficam em baixo. Uma UPS pequena cobre as quebras curtas, e com `restart: always` tudo volta sozinho quando o Pi arranca. A velocidade de upload da MEO chega para uso pessoal.
