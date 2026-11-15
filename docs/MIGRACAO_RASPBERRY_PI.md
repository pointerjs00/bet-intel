# Migração Hetzner → Raspberry Pi 5 (todas as apps)

15/11/2026. Inventário feito no servidor `ubuntu-4gb-nbg1-1` (Hetzner, Nuremberga). O Pi (8 GB) já corre **Lubuntu + Home Assistant na porta 443**.

Os passos seguem por ordem. Cada um tem uma **verificação** no fim: não avances sem ela.

---

## 0. O que existe hoje

| App | Pasta no Hetzner (compose + .env) | Contentores | Dados a levar | Endereços públicos → porta |
|---|---|---|---|---|
| **BetIntel** | `/root/betintel/apps/api` | `api-api-1` (imagem GHCR), `api-redis-1` | Postgres **do sistema**, base `betintel` (~300 MB); volume `api_uploads_data` (avatares). O Redis é cache e não precisa de ir. | `betintel-api.stream-intel.online` → 3000; `api.stream-intel.online` → 3000; `stream-intel.online/health` e `/socket.io/` → 3000 |
| **Stream-Intel** | `/home/streamuser/stream-intel` | `stream-intel-app-1` (imagem `ghcr.io/jbsousapsn/stream-intel`) | SQLite em `/home/streamuser/stream-intel/data/stream_intel.db` | `streamintel-api.stream-intel.online` → 8000; `stream-intel.online/api/` → 8000 |
| **Parlay League** | `/home/betintel_user/parlay-league` | `web` (Caddy, :8090), `api` (.NET), `postgres:16` | Volume `parlay-league_postgres_data`, base `parlay_league`. O volume `parlay-league_parlay_postgres_data` é antigo e não está em uso. | `couveflor.site` → 8090 |
| **Pricetracker** | `/home/betintel_user/pricetracker` | `pricetracker-api` (:8080) | Pasta `/home/betintel_user/pricetracker/data` | `plener.xuxus.site` → 8080 |

Notas:
- `stream-intel.online/` aponta para a porta 8005, onde não corre nada, e o `streamintell.bak` do Nginx está ativo e duplica blocos. Não se migra o Nginx, por isso isto desaparece.
- A API do BetIntel está publicada em `0.0.0.0:3000`, à margem do Nginx. No Pi, todas as portas ficam só em `127.0.0.1`.
- Os dados das 4 apps somam menos de 1 GB.

## 1. Arquitetura no Pi

```
Internet ─► Cloudflare (DNS + HTTPS) ─► cloudflared (túnel, no Pi) ─► 127.0.0.1:<porta> de cada app
Tu ─► Tailscale ─► SSH ao Pi
GitHub Actions ─► runner no Pi (um por repositório) ─► docker compose up --build (imagem ARM64 nativa)
Home Assistant ─► continua como está (porta 443 do router → Pi)
```

- Nenhuma porta nova aberta no router. Os domínios mantêm-se, por isso **as apps móveis não precisam de build nova**.
- `lusousa.dynip.sapo.pt` (DNS dinâmico da MEO) fica como plano B: abrir portas no router, pôr um Caddy e criar CNAMEs.
- As apps usam só portas locais (3000, 8000, 8080, 8090), longe da 443 e da 8123 do Home Assistant.

Organização no Pi:
```
/srv/betintel/.env        segredos do BetIntel (o código vem do runner do GitHub)
/srv/stream-intel/        repositório clonado + data/
/srv/parlay-league/       repositório clonado
/srv/pricetracker/        repositório clonado + data/
/srv/backups/             backup.sh + dumps diários
~/runners/<app>/          runners do GitHub Actions
```

---

## 2. Preparar o Pi

**Regra: não reinstalar o sistema nem mexer no Home Assistant.**

### 2.1 Backup do Home Assistant
Definições → Sistema → Cópias de segurança → **Criar**. Descarrega a cópia para o PC.

### 2.2 Diagnóstico
```bash
lsb_release -d; uname -m; free -h; df -h /
lsblk -o NAME,SIZE,TYPE,MOUNTPOINT,MODEL
sudo ss -tlnp | grep LISTEN
docker ps 2>/dev/null; systemctl list-units --type=service | grep -iE 'home-?assistant|docker|nginx|caddy'
```
Confirma:
- `uname -m` diz `aarch64`;
- se o sistema está em `mmcblk0` (cartão SD) ou em `nvme0n1` (SSD);
- quem usa a 443;
- se já há Docker, e se o Home Assistant corre nele.

Se o Home Assistant corre em Docker, **não sigas o 2.3 sem rever com o Claude**, porque mudar a pasta do Docker leva-o também.

### 2.3 SSD em `/srv` (se o sistema arranca do cartão SD)
O Postgres a escrever no cartão SD estraga-o em meses. O sistema fica no SD; os dados das apps vão para o SSD.
```bash
lsblk                                   # confirma o nome do SSD (ex.: nvme0n1). ATENÇÃO: o passo seguinte apaga o SSD
sudo parted /dev/nvme0n1 --script mklabel gpt mkpart srv ext4 0% 100%
sudo mkfs.ext4 -L srv /dev/nvme0n1p1
sudo mkdir -p /srv
echo "UUID=$(sudo blkid -s UUID -o value /dev/nvme0n1p1) /srv ext4 defaults,noatime 0 2" | sudo tee -a /etc/fstab
sudo mount -a && df -h /srv
sudo chown "$USER":"$USER" /srv
```
Verificação: `df -h /srv` mostra o tamanho do SSD.

Se o sistema já arranca do SSD, salta este passo e usa `/srv` diretamente.

### 2.4 Pacotes e atualizações automáticas
```bash
sudo apt update && sudo apt full-upgrade -y
sudo apt install -y unattended-upgrades git sqlite3 curl
sudo dpkg-reconfigure -plow unattended-upgrades
```
**Firewall.** Recomendado: deixar o `ufw` desligado. O túnel não abre portas e as apps só ouvem em `127.0.0.1`. Se o quiseres ligar, autoriza primeiro o Home Assistant (ajusta a rede):
```bash
sudo ufw allow 443/tcp
sudo ufw allow from 192.168.1.0/24 to any port 8123
sudo ufw allow from 192.168.1.0/24 to any port 22
sudo ufw default deny incoming && sudo ufw enable
```

### 2.5 Docker (com os dados no SSD)
```bash
curl -fsSL https://get.docker.com | sh          # só se ainda não existir
sudo usermod -aG docker "$USER" && newgrp docker
sudo mkdir -p /srv/docker
echo '{"data-root":"/srv/docker","log-driver":"local","log-opts":{"max-size":"10m","max-file":"3"}}' | sudo tee /etc/docker/daemon.json
sudo systemctl restart docker
docker info | grep 'Docker Root Dir'            # deve dizer /srv/docker
docker network create app_network
```
Se o Docker já existia com contentores (por exemplo, o Home Assistant), não mudes o `data-root` sem rever com o Claude.

### 2.6 Tailscale (SSH de qualquer lado)
```bash
curl -fsSL https://tailscale.com/install.sh | sh && sudo tailscale up --ssh
```
Instala a app Tailscale no PC e no telemóvel, com a mesma conta. Verificação: no PC, `ssh <utilizador>@<nome-do-pi>` funciona fora de casa (testa com os dados móveis).

### 2.7 Sem ambiente gráfico (opcional, liberta ~0,5–1 GB de RAM)
`sudo systemctl set-default multi-user.target && sudo reboot`. Para reverter: `graphical.target`.

---

## 3. Domínios na Cloudflare (sem corte)

Para cada domínio (`stream-intel.online`, `couveflor.site`, `xuxus.site`):
1. dash.cloudflare.com → **Add a site** → plano **Free**.
2. A Cloudflare importa os registos DNS, que ainda apontam para o Hetzner (178.104.68.233). Confirma que estão lá todos os subdomínios da secção 0.
3. No registo onde compraste o domínio, muda os nameservers para os dois que a Cloudflare indica.
4. Espera pelo e-mail "Your site is active" (minutos a horas). As apps continuam no Hetzner, por isso ninguém nota nada.

Verificação: `nslookup -type=ns stream-intel.online` mostra nameservers da Cloudflare.

## 4. Túnel Cloudflare no Pi

1. Cloudflare → **Zero Trust** (cria a conta Free se pedir) → Networks → Tunnels → **Create a tunnel** → Cloudflared → nome `pi-server`.
2. Escolhe "Debian" e "arm64" e corre no Pi o comando que aparece (instala o `cloudflared` e regista-o como serviço com o token).
3. O túnel tem de aparecer como **HEALTHY**.
4. **Ainda não cries rotas.** Cada rota é o "corte" de uma app (secção 6). Ao criar uma rota, a Cloudflare substitui o registo A do Hetzner por um CNAME para o túnel.

Verificação: `systemctl status cloudflared` está `active (running)`.

## 5. Runners do GitHub Actions no Pi

⚠️ **Só com repositórios privados.** Num repositório público, qualquer PR podia correr código no teu Pi. Confirma em cada repositório: Settings → General → Danger Zone → visibilidade.

Para cada repositório (bet-intel, stream-intel, parlay-league, pricetracker):
1. GitHub → repositório → Settings → Actions → Runners → **New self-hosted runner** → Linux → **ARM64**.
2. No Pi:
   ```bash
   mkdir -p ~/runners/<app> && cd ~/runners/<app>
   # colar os comandos "Download" e "Configure" do GitHub (aceitar as labels por omissão)
   sudo ./svc.sh install "$USER" && sudo ./svc.sh start
   ```
3. Verificação: o runner aparece **Idle** no GitHub.

O runner do BetIntel usa as labels `self-hosted, linux, ARM64`. O workflow (`.github/workflows/build-api.yml`, job `deploy-pi`) já está preparado no repositório.

---

## 6. Migrar cada app

Ordem, da mais simples para a mais crítica: **Pricetracker → Stream-Intel → Parlay League → BetIntel.** Cada app segue o mesmo ciclo: ensaio → corte (rota no túnel) → teste → desligar no Hetzner.

Para copiar ficheiros do Hetzner para o Pi, a partir do Pi: `scp root@178.104.68.233:/tmp/<ficheiro> /tmp/`. Se o Pi não tiver acesso por chave ao Hetzner, copia pelo PC: `scp` do Hetzner para o PC e do PC para o Pi.

Em todos os `docker-compose.yml` das outras apps, muda os `ports` para `"127.0.0.1:<porta>:<porta>"`.

### 6.1 Pricetracker
```bash
# Hetzner
cd /home/betintel_user/pricetracker && docker compose stop
tar czf /tmp/pricetracker.tgz data .env docker-compose.yml
# Pi
git clone git@github.com:<conta>/<repo-pricetracker>.git /srv/pricetracker
tar xzf /tmp/pricetracker.tgz -C /srv/pricetracker
cd /srv/pricetracker && docker compose up -d --build
curl -I http://127.0.0.1:8080
```
Corte: no túnel → Public hostname → `plener.xuxus.site` → Service `HTTP` → `localhost:8080`.

Teste no browser, depois desliga no Hetzner: `docker compose down`.

### 6.2 Stream-Intel (SQLite)
```bash
# Hetzner
cd /home/streamuser/stream-intel && docker compose stop
sqlite3 data/stream_intel.db ".backup /tmp/stream_intel.db"
tar czf /tmp/stream-intel.tgz .env docker-compose.yml
# Pi
git clone git@github.com:<conta>/<repo-stream-intel>.git /srv/stream-intel
mkdir -p /srv/stream-intel/data
tar xzf /tmp/stream-intel.tgz -C /srv/stream-intel && cp /tmp/stream_intel.db /srv/stream-intel/data/
cd /srv/stream-intel && docker compose up -d --build     # no compose, trocar `image: ghcr.io/...` por `build: .`
curl -I http://127.0.0.1:8000
```
Corte:
- `streamintel-api.stream-intel.online` → `localhost:8000`;
- `stream-intel.online` com Path `^/api/` → `localhost:8000`.

### 6.3 Parlay League (Postgres em contentor)
```bash
# Hetzner
cd /home/betintel_user/parlay-league
docker compose exec -T postgres pg_dump -U parlay -Fc parlay_league > /tmp/parlay.dump
tar czf /tmp/parlay-conf.tgz .env docker-compose.yml
# Pi
git clone git@github.com:<conta>/<repo-parlay-league>.git /srv/parlay-league
tar xzf /tmp/parlay-conf.tgz -C /srv/parlay-league && cd /srv/parlay-league
docker compose up -d postgres && sleep 15
docker compose exec -T postgres pg_restore -U parlay -d parlay_league --no-owner < /tmp/parlay.dump
docker compose up -d --build
curl -I http://127.0.0.1:8090
```
Corte: `couveflor.site` → `localhost:8090`. Os volumes do Caddy não são precisos, porque o HTTPS passa a ser da Cloudflare.

### 6.4 BetIntel (por último, porque tem o tracker ao vivo)

O repositório já tem tudo o que o Pi precisa:
- `deploy/pi/docker-compose.yml`: Postgres 16, Redis e a API (construída no Pi, só em `127.0.0.1:3000`).
- `deploy/pi/.env.example`: as variáveis.
- Job `deploy-pi` em `.github/workflows/build-api.yml`: corre no runner do Pi quando a variável do repositório `DEPLOY_TARGET` é `pi`. Enquanto não for, o deploy continua no Hetzner.
- O Prisma já inclui o motor ARM64 (`linux-musl-arm64-openssl-3.0.x`).

**a) `.env` no Pi**
```bash
mkdir -p /srv/betintel && cd /srv/betintel
curl -fsSL -o .env https://raw.githubusercontent.com/pointerjs00/bet-intel/main/deploy/pi/.env.example   # ou copiar o ficheiro
chmod 600 .env && nano .env
```
- Copia os valores do `.env` do Hetzner (`/root/betintel/apps/api/.env`).
- **Novos:** `POSTGRES_PASSWORD`, `JWT_SECRET` e `JWT_REFRESH_SECRET`, gerados com `openssl rand -hex 32` e `openssl rand -hex 64`. Mudar os JWT obriga a novo login na app.
- **Não** ponhas `DATABASE_URL` nem `REDIS_URL`: o compose do Pi define-os.
- `SCRAPER_HTTP_PROXY` fica vazio.

Se o repositório for privado, o `curl` acima não funciona. Nesse caso copia o `deploy/pi/.env.example` do PC com `scp`.

**b) Primeira subida (base vazia), pelo GitHub**
1. GitHub → bet-intel → Settings → Secrets and variables → Actions → **Variables** → New → `DEPLOY_TARGET` = `pi`.
2. Actions → "Build & Deploy API" → **Run workflow** (branch `main`).
3. O job `deploy-pi` corre no Pi. A primeira build ARM64 demora cerca de 5–10 min.

Verificação: o job acaba verde com "API OK", e `curl http://127.0.0.1:3000/health` no Pi responde.

A partir daqui, cada push para `main` faz deploy no Pi, e o Hetzner deixa de receber deploys.

**c) Copiar os dados (janela de 15–30 min)**
```bash
# Hetzner
docker stop api-api-1
sudo -u postgres pg_dump -Fc betintel > /tmp/betintel.dump
docker run --rm -v api_uploads_data:/d -v /tmp:/b alpine tar czf /b/uploads.tgz -C /d .
# Pi (copiar /tmp/betintel.dump e /tmp/uploads.tgz para /tmp do Pi)
cd ~/runners/bet-intel/_work/bet-intel/bet-intel        # checkout feito pelo runner
C="docker compose -f deploy/pi/docker-compose.yml --env-file /srv/betintel/.env"
$C stop api
$C exec -T betintel-db psql -U betintel_user -d postgres -c "DROP DATABASE betintel;" -c "CREATE DATABASE betintel OWNER betintel_user;"
$C exec -T betintel-db pg_restore -U betintel_user -d betintel --no-owner < /tmp/betintel.dump
docker run --rm -v betintel_uploads_data:/d -v /tmp:/b alpine sh -c "tar xzf /b/uploads.tgz -C /d"
$C up -d api && sleep 20 && curl -s http://127.0.0.1:3000/health
```
O `pg_restore` pode avisar sobre `prisma_migrate_shadow_db` ou sobre owners; é normal. No arranque, a API corre `prisma migrate deploy`, que não faz nada se a base já estiver atualizada.

**d) Corte (rotas no túnel)**
- `betintel-api.stream-intel.online` → `localhost:3000`;
- `api.stream-intel.online` → `localhost:3000`;
- `stream-intel.online` com Path `^/health$` → `localhost:3000`;
- `stream-intel.online` com Path `^/socket.io/` → `localhost:3000`.

Estas regras de `stream-intel.online` têm de ficar **acima** da regra `^/api/` do Stream-Intel (no painel, arrastar para cima). O WebSocket do Socket.IO passa pelo túnel sem configuração extra.

**e) Testar na app** (é a mesma build; o domínio é o mesmo)
- [ ] Login (vai pedir de novo, porque os JWT mudaram)
- [ ] Lista de boletins e detalhe
- [ ] Análise (estatísticas)
- [ ] "A decorrer" e uma notificação de teste
- [ ] Scan de um screenshot (Gemini)
- [ ] Avatar do perfil

Depois, no Hetzner: `docker compose -f /root/betintel/apps/api/docker-compose.yml down`.

**f) Logs úteis no Pi**
```bash
docker logs -f betintel-api-1 --tail 100
docker stats --no-stream
```

### 6.5 Recolha de odds (scrapers) a partir de casa

Em casa o IP é português, e isso resolve os bloqueios vistos no Hetzner (Betano 403, site da Lebull 451).

1. **Confirmar que as 5 casas respondem a partir do Pi:**
   ```bash
   cd ~/runners/bet-intel/_work/bet-intel/bet-intel && bash scripts/probe-odds.sh
   ```
   Todas as linhas têm de dizer **OK**. O handshake da Placard e da Solverde só confirma que a ligação abre. O protocolo dessas duas ainda está por capturar (ver `docs/analise-2026-11/ESTUDO_ODDS.md`).
2. **Estado atual:** o comparador de odds ainda **não está construído**. É o plano em `docs/analise-2026-11/PLANO_ODDS.md`, fases 1 a 7. Enquanto não for implementado, não há scrapers para ligar. A API atual não faz recolha de odds.
3. **Quando as fases forem entrando:** não há nada a configurar no Pi. Os adaptadores correm dentro da API, que já está no Pi. Basta:
   - `SCRAPER_HTTP_PROXY` vazio no `/srv/betintel/.env`;
   - depois de cada deploy, ver o estado de cada casa em `curl http://127.0.0.1:3000/api/odds/health` (fase 1 do plano);
   - se uma casa bloquear o IP de casa, o alerta de saúde avisa por push.
4. **Limite de tráfego:** o plano mantém poucos pedidos (calendário de 10 em 10 min; mercados só quando abres um jogo). Ajuda a não arriscar bloqueios no teu IP de casa, que é o mesmo do resto da família.

---

## 7. Depois de migrar

### 7.1 Trocar segredos expostos
- A palavra-passe do Postgres do BetIntel (escrita no `DEPLOY.md` e no histórico do git): feito no 6.4 a). Apaga-a do `DEPLOY.md`.
- A palavra-passe do Postgres do Parlay e as chaves TMDB/OMDB do Stream-Intel, que foram coladas numa conversa:
  - Parlay: `ALTER USER parlay PASSWORD '<nova>';` e atualizar o `.env`.
  - TMDB/OMDB: gerar chaves novas nos sites deles.
- No GitHub (bet-intel): apagar os segredos `HETZNER_HOST`, `HETZNER_USER`, `HETZNER_SSH_KEY` e `DATABASE_URL` quando o Hetzner sair. Os jobs do Hetzner já não correm com `DEPLOY_TARGET=pi`.

### 7.2 Backups diários
```bash
sudo mkdir -p /srv/backups && sudo chown "$USER" /srv/backups
cp ~/runners/bet-intel/_work/bet-intel/bet-intel/scripts/pi/backup.sh /srv/backups/ && chmod +x /srv/backups/backup.sh
/srv/backups/backup.sh                                       # primeiro teste
(crontab -l 2>/dev/null; echo "0 4 * * * /srv/backups/backup.sh >> /srv/backups/backup.log 2>&1") | crontab -
```
Cópia para fora de casa (recomendado):
1. `sudo apt install rclone && rclone config`.
2. Cria um remoto chamado `offsite` (Google Drive ou Backblaze B2). O script envia para lá automaticamente.

**Faz um restauro de teste** num Postgres temporário:
```bash
docker run -d --name pgtest -e POSTGRES_PASSWORD=x postgres:16-alpine
docker exec -i pgtest pg_restore -U postgres -d postgres --create < /srv/backups/<data>/betintel.dump
docker rm -f pgtest
```

### 7.3 Monitorização
```bash
docker run -d --name uptime-kuma --restart always -p 127.0.0.1:3001:3001 -v uptime_kuma:/app/data louislam/uptime-kuma:1
```
1. Abre `http://<ip-do-pi>:3001` pela Tailscale. Se usares só `127.0.0.1`, abre por túnel SSH: `ssh -L 3001:localhost:3001 <pi>`.
2. Cria monitores HTTP para:
   - `https://api.stream-intel.online/health`;
   - `https://streamintel-api.stream-intel.online`;
   - `https://couveflor.site`;
   - `https://plener.xuxus.site`.
3. Liga as notificações à app no telemóvel (Ntfy ou Telegram).

### 7.4 Desligar o Hetzner
- Com tudo migrado: parar os contentores lá e deixar o servidor ligado mais 2 semanas.
- Sem problemas: snapshot (opcional) e apagar o servidor na consola da Hetzner.

### 7.5 (Opcional) Home Assistant pelo túnel
1. Rota `casa.stream-intel.online` → `localhost:8123`.
2. No `configuration.yaml`:
   ```yaml
   http:
     use_x_forwarded_for: true
     trusted_proxies: [127.0.0.1, ::1]
   ```
3. Depois fecha a 443 no router. Ganhas HTTPS sem certificados no Pi e deixas de expor o IP de casa.

## 8. Limites a aceitar

Se a luz ou a internet de casa falharem, as apps ficam em baixo. Uma UPS pequena cobre as quebras curtas, e com `restart: always` tudo volta sozinho quando o Pi arranca. A velocidade de upload da MEO chega para uso pessoal.

## 9. Lista de verificação rápida

- [ ] 2.1 Backup do Home Assistant descarregado
- [ ] 2.2 Diagnóstico revisto
- [ ] 2.3 SSD montado em `/srv`
- [ ] 2.5 Docker com `data-root` em `/srv/docker`; rede `app_network` criada
- [ ] 2.6 SSH pela Tailscale fora de casa
- [ ] 3 Três domínios ativos na Cloudflare
- [ ] 4 Túnel `pi-server` HEALTHY
- [ ] 5 Runners Idle nos 4 repositórios (privados)
- [ ] 6.1 Pricetracker migrado
- [ ] 6.2 Stream-Intel migrado
- [ ] 6.3 Parlay League migrado
- [ ] 6.4 BetIntel migrado (`DEPLOY_TARGET=pi`, dados restaurados, rotas, testes na app)
- [ ] 6.5 `probe-odds.sh` no Pi: todas as linhas OK
- [ ] 7.1 Segredos trocados
- [ ] 7.2 Backups com cron, cópia fora de casa e restauro testado
- [ ] 7.3 Uptime Kuma com alertas
- [ ] 7.4 Hetzner apagado ao fim de 2 semanas
