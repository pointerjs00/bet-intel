# Guia: passar as apps do servidor Hetzner para o Raspberry Pi de casa

Data: 15/11/2026.

Este guia leva-te, passo a passo, do servidor alugado na Hetzner (na Alemanha) para o Raspberry Pi 5 que tens em casa. O Pi já corre o **Lubuntu** e o **Home Assistant**. No fim, as tuas 4 apps (BetIntel, Stream-Intel, Parlay League e Pricetracker) correm no Pi, continuam nos mesmos endereços de internet, e o Home Assistant e a Alexa continuam a funcionar como hoje.

Não precisas de perceber tudo de uma vez. Segue as secções por ordem e, em cada uma, faz a **verificação** no fim antes de avançar. Se algo não bater certo, para e pede ajuda (ao Claude ou a outra pessoa) com o texto do erro.

---

## Antes de começar

### Onde se escreve cada comando

Vais usar três computadores. Cada bloco de comandos diz no topo onde se escreve:

| Etiqueta | Onde | Como lá chegar |
|---|---|---|
| 🖥️ **PC** | O teu computador Windows | Abre o **Git Bash** (ou o terminal do VS Code) |
| ☁️ **Hetzner** | O servidor antigo, na Alemanha | No PC: `ssh -i ~/.ssh/hetzner_deploy root@178.104.68.233` |
| 🍓 **Pi** | O Raspberry Pi de casa | No PC: `ssh <o-teu-utilizador>@<ip-do-pi>`, ou abre um terminal diretamente no Pi |

**Como saber onde estás:** a linha onde escreves (o "prompt") mostra o nome da máquina. No Hetzner aparece `root@ubuntu-4gb-nbg1-1`; no Pi aparece o nome que deste ao Pi; no PC aparece o nome do teu computador. Antes de colar um comando, confirma que estás na máquina certa. Se tiveres dúvidas, escreve `hostname` e carrega Enter.

**Como colar um comando:** copia o bloco inteiro, cola no terminal (no Git Bash: botão direito → Paste, ou Shift+Insert) e carrega Enter. As linhas que começam por `#` são comentários: o terminal ignora-as e servem só para explicar.

**Se um comando ficar "preso"** à espera (por exemplo, a pedir uma palavra-passe que não sabes), carrega **Ctrl+C** para cancelar.

### Palavras que vais encontrar

- **SSH:** forma de abrir um terminal noutro computador através da rede. Usa uma "chave" (um ficheiro no teu PC) em vez de palavra-passe.
- **Docker:** programa que corre cada app numa "caixa" isolada, chamada **contentor**. A caixa leva tudo o que a app precisa, por isso funciona igual em qualquer computador.
- **Imagem:** o "molde" a partir do qual se cria um contentor. O Pi tem um processador diferente do servidor da Hetzner (ARM em vez de x86), por isso as imagens têm de ser construídas para ARM. O guia trata disso.
- **Volume:** pasta onde o Docker guarda os dados de um contentor (por exemplo, a base de dados), para não se perderem quando o contentor é recriado.
- **docker compose:** ficheiro (`docker-compose.yml`) que descreve vários contentores que trabalham juntos (por exemplo: base de dados + app) e os arranca de uma vez.
- **.env:** ficheiro de texto com os "segredos" de uma app (palavras-passe, chaves). Nunca vai para o GitHub.
- **Base de dados (Postgres / SQLite):** onde as apps guardam os dados. Para mudar de servidor, faz-se uma cópia ("dump") e restaura-se no novo.
- **Domínio / DNS:** o domínio é o nome do site (ex.: `stream-intel.online`). O DNS é a "lista telefónica" da internet: diz a que computador corresponde cada nome.
- **Nameservers:** quem gere essa lista para o teu domínio. Vamos passar essa gestão para a Cloudflare.
- **Cloudflare Tunnel:** ligação segura que o Pi abre **para fora**, até à Cloudflare. Quem visita os teus sites fala com a Cloudflare, e a Cloudflare passa o pedido ao Pi pelo túnel. Assim **não é preciso abrir portas novas no router** e o teu IP de casa não fica à vista.
- **Porta:** "número de porta" de um programa num computador (ex.: 443 para sites seguros). As apps vão usar portas internas do Pi (3000, 8000, 8080, 8090) que só o próprio Pi vê.
- **Tailscale:** rede privada entre os teus aparelhos (PC, telemóvel, Pi). Permite-te entrar no Pi por SSH de qualquer lado, sem abrir portas.
- **GitHub Actions / runner:** o GitHub pode correr tarefas automáticas quando mudas o código (testar, publicar). O **runner** é um pequeno programa instalado no Pi que recebe essas tarefas e as executa lá. É assim que uma alteração ao código chega ao Pi sozinha.

### O que muda e o que fica igual

**Fica igual:**
- os endereços das apps: as apps móveis não precisam de ser reinstaladas;
- o Home Assistant, a porta 443 aberta no router e a ligação da Alexa;
- o teu cartão SD/sistema do Pi (não se reinstala nada).

**Muda:**
- as apps passam a correr no Pi, dentro do Docker;
- os sites passam a chegar ao Pi através da Cloudflare (túnel), sem portas novas no router;
- a Hetzner deixa de ser precisa (e de ser paga) no fim.

> ⚠️ **A porta 443 do router fica como está.** A Amazon (Alexa) precisa dela para falar com o Home Assistant. Nada neste guia a fecha ou altera. As apps usam o túnel e não precisam dela.

### Quanto tempo demora

| Parte | Tempo aproximado |
|---|---|
| Preparar o Pi (secção 2) | 1–2 horas |
| Domínios na Cloudflare (secção 3) | 30 min de trabalho + até algumas horas de espera |
| Túnel e runners (secções 4 e 5) | 1 hora |
| Cada app (secção 6) | 30–60 min por app |
| Backups e monitorização (secção 7) | 1 hora |

Podes fazer em vários dias. Enquanto uma app não for "cortada" (secção 6), continua a funcionar no Hetzner.

---

## 1. O que existe hoje e como vai ficar

### Hoje, no Hetzner

| App | Pasta no Hetzner | Onde estão os dados | Endereços |
|---|---|---|---|
| **BetIntel** | `/root/betintel/apps/api` | Base de dados Postgres `betintel` (~300 MB, instalada no sistema) + fotos de perfil (volume `api_uploads_data`) | `betintel-api.stream-intel.online`, `api.stream-intel.online`, e `stream-intel.online/health` e `/socket.io/` |
| **Stream-Intel** | `/home/streamuser/stream-intel` | Um ficheiro SQLite: `data/stream_intel.db` | `streamintel-api.stream-intel.online`, `stream-intel.online/api/` |
| **Parlay League** | `/home/betintel_user/parlay-league` | Base de dados Postgres num contentor (volume `parlay-league_postgres_data`) | `couveflor.site` |
| **Pricetracker** | `/home/betintel_user/pricetracker` | Pasta `data` | `plener.xuxus.site` |

Os dados das 4 apps juntas ocupam menos de 1 GB. O resto do disco do Hetzner são "imagens" do Docker, que não é preciso copiar.

### Como vai ficar

```
Visitante ─► Cloudflare (HTTPS) ─► túnel ─► Pi (porta interna de cada app)
Tu, de fora de casa ─► Tailscale ─► Pi
Alteração no código (GitHub) ─► runner no Pi ─► app atualizada no Pi
Alexa ─► porta 443 do router ─► Home Assistant (como hoje)
```

Pastas no Pi:
```
/srv/betintel/.env        segredos do BetIntel
/srv/stream-intel/        código + dados do Stream-Intel
/srv/parlay-league/       código do Parlay League
/srv/pricetracker/        código + dados do Pricetracker
/srv/backups/             cópias de segurança diárias
~/runners/<app>/          runners do GitHub
```

---

## 2. Preparar o Pi

**Regra de ouro: não reinstalar o sistema nem mexer no Home Assistant.**

### 2.1 Cópia de segurança do Home Assistant

Se algo correr mal, isto permite repor o Home Assistant.

1. Abre o Home Assistant no browser.
2. Vai a **Definições → Sistema → Cópias de segurança**.
3. Carrega em **Criar cópia de segurança** (completa) e espera que termine.
4. Carrega nos três pontinhos da cópia → **Transferir**. Guarda o ficheiro no PC.

✅ **Verificação:** tens um ficheiro `.tar` no PC com a data de hoje.

### 2.1 b) Imagem completa do cartão microSD (recomendado)

Guarda o cartão inteiro (sistema, Home Assistant e configurações) num ficheiro no PC. Se o cartão se estragar, gravas a imagem noutro cartão e o Pi volta a ficar exatamente como estava.

Precisas de um leitor de cartões microSD no PC, de espaço igual ao tamanho do cartão e do programa gratuito **USBImager** (gitlab.com/bztsrc/usbimager, versão Windows).

1. 🍓 **Pi:** `sudo shutdown -h now`. Espera que a luz verde pare de piscar e tira a ficha. O Home Assistant fica parado enquanto o cartão estiver fora.
2. Tira o cartão e mete-o no leitor do PC.
3. ⚠️ **O Windows vai perguntar se queres formatar o disco: carrega SEMPRE em Cancelar.** A parte Linux do cartão não é legível pelo Windows, e formatar apagava o Pi.
4. No **USBImager**:
   - escolhe o cartão na lista de baixo (confirma pelo tamanho);
   - carrega em **Read**;
   - grava como, por exemplo, `D:\Backups\pi-sd-2026-11-15.img.zst`. O `.zst` comprime enquanto lê.
5. No fim (10–30 min), ejeta o cartão, volta a pô-lo no Pi e liga-o.

✅ **Verificação:** o ficheiro existe, a leitura acabou sem erro e o Home Assistant voltou a arrancar.

**Restaurar** (se um dia for preciso): num cartão do mesmo tamanho ou maior, USBImager → escolhe o ficheiro → escolhe o cartão → **Write**.

Nunca guardes esta imagem no SSD do Pi: o passo 2.3 formata-o.

### 2.2 Diagnóstico: saber como o Pi está montado

🍓 **Pi**
```bash
lsb_release -d; uname -m; free -h; df -h /
lsblk -o NAME,SIZE,TYPE,MOUNTPOINT,MODEL
sudo ss -tlnp | grep LISTEN
docker ps 2>/dev/null; systemctl list-units --type=service | grep -iE 'home-?assistant|docker|nginx|caddy'
```
O `sudo` pede a palavra-passe do teu utilizador do Pi (não aparece nada enquanto escreves: é normal).

O que cada linha diz:
- `uname -m` tem de dizer **`aarch64`** (processador ARM de 64 bits).
- `lsblk` mostra os discos:
  - `mmcblk0` é o **cartão SD**;
  - `nvme0n1` é o **SSD**;
  - a linha que tem `/` na coluna MOUNTPOINT é o disco onde o sistema está.
- `ss` mostra que programas estão a usar que portas. Deves ver a 443 e a 8123 (Home Assistant).
- `docker ps` diz se o Docker já existe e se o Home Assistant corre nele.

✅ **Verificação:** cola o resultado ao Claude antes de continuar. Se o Home Assistant aparecer na lista do `docker ps`, os passos 2.3 e 2.5 têm de ser ajustados, para não o afetar.

### 2.3 Pôr o SSD a guardar os dados (só se o sistema estiver no cartão SD)

**Porquê:** as bases de dados escrevem no disco constantemente, e um cartão SD gasta-se e pode estragar-se em meses. O sistema fica no SD, mas os dados das apps passam para o SSD, que aguenta muito mais.

> ⚠️ **Os comandos seguintes apagam tudo o que estiver no SSD.** Confirma no `lsblk` que o SSD se chama `nvme0n1` e que não tem nada que queiras guardar. Se o nome for outro, troca-o em todos os comandos.

🍓 **Pi**
```bash
# 1. Criar uma partição no SSD e formatá-la (APAGA O SSD)
sudo parted /dev/nvme0n1 --script mklabel gpt mkpart srv ext4 0% 100%
sudo mkfs.ext4 -L srv /dev/nvme0n1p1

# 2. Criar a pasta /srv e dizer ao sistema para montar lá o SSD em cada arranque
sudo mkdir -p /srv
echo "UUID=$(sudo blkid -s UUID -o value /dev/nvme0n1p1) /srv ext4 defaults,noatime 0 2" | sudo tee -a /etc/fstab

# 3. Montar agora e dar-te permissão para escrever lá
sudo mount -a
sudo chown "$USER":"$USER" /srv
df -h /srv
```

✅ **Verificação:** o `df -h /srv` mostra o tamanho do SSD (por exemplo `234G`). Reinicia o Pi (`sudo reboot`), volta a entrar e repete o `df -h /srv`: tem de continuar a aparecer.

Se o sistema já arranca do SSD, salta este passo: a pasta `/srv` já está no SSD.

### 2.4 Atualizações automáticas de segurança

🍓 **Pi**
```bash
sudo apt update && sudo apt full-upgrade -y
sudo apt install -y unattended-upgrades git sqlite3 curl
sudo dpkg-reconfigure -plow unattended-upgrades     # responde "Sim/Yes"
```

**Firewall: recomendo não mexer.** O túnel não abre portas e as apps só aceitam ligações do próprio Pi. Ligar a firewall (`ufw`) sem cuidado pode cortar o Home Assistant e a Alexa.

✅ **Verificação:** o Home Assistant continua a abrir normalmente.

### 2.5 Instalar o Docker e pô-lo a guardar tudo no SSD

> Se o diagnóstico (2.2) mostrou que **o Home Assistant corre no Docker**, não faças este passo sem rever com o Claude. Mudar o sítio onde o Docker guarda as coisas mexeria também no Home Assistant.

🍓 **Pi**
```bash
# 1. Instalar o Docker (só se o "docker ps" do 2.2 deu erro)
curl -fsSL https://get.docker.com | sh

# 2. Deixar o teu utilizador usar o Docker sem "sudo"
sudo usermod -aG docker "$USER"
newgrp docker

# 3. Guardar os dados do Docker no SSD e limitar o tamanho dos logs
sudo mkdir -p /srv/docker
echo '{"data-root":"/srv/docker","log-driver":"local","log-opts":{"max-size":"10m","max-file":"3"}}' | sudo tee /etc/docker/daemon.json
sudo systemctl restart docker

# 4. Rede interna partilhada pelas apps
docker network create app_network
```

✅ **Verificação:**
```bash
docker run --rm hello-world                 # deve aparecer "Hello from Docker!"
docker info | grep 'Docker Root Dir'        # deve dizer /srv/docker
```

### 2.6 Tailscale: entrar no Pi de qualquer lado

🍓 **Pi**
```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up --ssh
```
O segundo comando mostra um link. Abre-o no browser e entra com uma conta (Google, por exemplo).

Depois instala a app **Tailscale** no PC (tailscale.com/download) e no telemóvel, e entra com a mesma conta. O Pi aparece na lista de aparelhos, com um nome e um IP do tipo `100.x.y.z`.

✅ **Verificação:** desliga o Wi-Fi do PC e liga-o ao hotspot do telemóvel. Experimenta 🖥️ `ssh <o-teu-utilizador>@<nome-do-pi-no-tailscale>`: tem de entrar no Pi.

### 2.7 (Opcional) Desligar o ambiente gráfico

O Lubuntu tem ambiente gráfico (janelas, rato), que gasta cerca de 0,5–1 GB de memória. Se nunca usas o Pi com ecrã:

🍓 **Pi**
```bash
sudo systemctl set-default multi-user.target && sudo reboot
```
Para voltar a ter ambiente gráfico: `sudo systemctl set-default graphical.target && sudo reboot`.

---

## 3. Passar os domínios para a Cloudflare (sem cortar nada)

**O que vais fazer:** dizer à internet que, a partir de agora, é a Cloudflare que gere os teus 3 domínios (`stream-intel.online`, `couveflor.site` e `xuxus.site`). No início a Cloudflare continua a apontar para o Hetzner, por isso **ninguém nota diferença**.

Para cada um dos 3 domínios:
1. Entra em **dash.cloudflare.com** (cria conta se não tiveres).
2. Carrega em **Add a site** (ou "Add a domain"), escreve o domínio e escolhe o plano **Free**.
3. A Cloudflare procura os registos atuais do domínio e mostra uma lista. Confirma que estão lá os subdomínios que usas:
   - `stream-intel.online`: `api`, `betintel-api`, `streamintel-api` e o próprio domínio;
   - `couveflor.site`: o próprio domínio;
   - `xuxus.site`: `plener`.

   Devem apontar para `178.104.68.233` (o Hetzner). Se faltar algum, acrescenta-o como registo **A** com esse IP.
4. A Cloudflare mostra **dois nameservers** (algo como `ana.ns.cloudflare.com`).
5. Vai ao site onde **compraste** o domínio (o "registrar"), procura "Nameservers" ou "DNS" nas definições do domínio, e troca os que lá estão pelos dois da Cloudflare.
6. Espera pelo e-mail da Cloudflare "Your site is now active". Pode demorar de minutos a algumas horas.

✅ **Verificação:** depois do e-mail, os 3 sites e o BetIntel continuam a funcionar normalmente. 🖥️ `nslookup -type=ns stream-intel.online` mostra nomes terminados em `cloudflare.com`.

---

## 4. Criar o túnel no Pi

**O que vais fazer:** instalar no Pi o programa `cloudflared`, que abre a ligação até à Cloudflare. Ainda não muda nada nos sites.

1. Em dash.cloudflare.com, abre **Zero Trust** no menu da esquerda. Se pedir, escolhe o plano **Free** (pode pedir cartão, mas não cobra nada).
2. Vai a **Networks → Tunnels → Create a tunnel**, escolhe **Cloudflared** e dá-lhe o nome `pi-server`.
3. No ecrã seguinte escolhe **Debian** e **arm64**. Aparece um comando grande que começa por `curl ...` ou `sudo cloudflared service install ...`. Copia-o.
4. 🍓 **Pi:** cola o comando e carrega Enter.
5. Volta à Cloudflare: o túnel deve aparecer como **HEALTHY** (verde).
6. **Ainda não acrescentes rotas** ("Public hostnames"). Cada rota é o momento em que uma app passa do Hetzner para o Pi. Isso faz-se na secção 6, uma app de cada vez.

✅ **Verificação:** 🍓 `systemctl status cloudflared` mostra `active (running)` a verde (sai com a tecla `q`). Na Cloudflare, o túnel está HEALTHY.

---

## 5. Runners do GitHub no Pi

**O que vais fazer:** instalar no Pi um "runner" por cada repositório. Quando alteras o código no GitHub, o runner recebe a ordem, atualiza a app no Pi e reinicia-a sozinho.

> ⚠️ **Os repositórios têm de ser privados.** Num repositório público, qualquer pessoa podia propor uma alteração que corria código no teu Pi (e na tua rede de casa). Confirma em cada repositório: **Settings → General**, no fundo, em "Danger Zone", tem de dizer que é privado.

Para cada repositório (bet-intel, stream-intel, parlay-league e pricetracker):
1. No GitHub, abre o repositório → **Settings → Actions → Runners → New self-hosted runner**.
2. Escolhe **Linux** e **ARM64**. Aparecem dois blocos de comandos: "Download" e "Configure".
3. 🍓 **Pi:**
   ```bash
   mkdir -p ~/runners/<nome-do-repositório> && cd ~/runners/<nome-do-repositório>
   ```
   Troca `<nome-do-repositório>` por `bet-intel`, `stream-intel`, etc.
4. Cola os comandos do bloco "Download", um a um.
5. Cola o comando `./config.sh ...` do bloco "Configure". Às perguntas, carrega só Enter: as respostas por omissão servem.
6. Instala-o como serviço, para arrancar sozinho com o Pi:
   ```bash
   sudo ./svc.sh install "$USER" && sudo ./svc.sh start
   ```

✅ **Verificação:** no GitHub, em Settings → Actions → Runners, o runner aparece **Idle** (verde).

---

## 6. Mudar as apps, uma de cada vez

Ordem, da mais simples para a mais importante: **Pricetracker → Stream-Intel → Parlay League → BetIntel**.

Em cada app o ciclo é sempre o mesmo:
1. **Parar** a app no Hetzner e **copiar** os dados.
2. **Arrancar** a app no Pi com esses dados.
3. **Cortar:** criar a rota no túnel. A partir daqui, o site vai para o Pi.
4. **Testar** o site.
5. **Desligar** a app no Hetzner.

### Como copiar ficheiros do Hetzner para o Pi (vais usar sempre isto)

O Pi não tem acesso direto ao Hetzner, por isso os ficheiros passam pelo PC: primeiro do Hetzner para o PC, depois do PC para o Pi.

🖥️ **PC**
```bash
# Do Hetzner para o PC (para a pasta onde estás)
scp -i ~/.ssh/hetzner_deploy root@178.104.68.233:/tmp/<ficheiro> .
# Do PC para o Pi
scp <ficheiro> <o-teu-utilizador>@<ip-do-pi>:/tmp/
```
Troca `<ficheiro>` pelo nome indicado em cada app.

### Ajuste nas outras apps: portas só para o Pi

Nas apps Pricetracker, Stream-Intel e Parlay League, o ficheiro `docker-compose.yml` tem uma secção `ports:`. Em cada linha, acrescenta `127.0.0.1:` no início, para a app só aceitar ligações do próprio Pi (o túnel). Exemplo:
```yaml
ports:
  - "127.0.0.1:8080:8080"     # antes era "8080:8080"
```
Isto pode ser feito no repositório de cada app (o Claude ajuda).

### 6.1 Pricetracker

☁️ **Hetzner:** parar a app e juntar os dados num ficheiro
```bash
cd /home/betintel_user/pricetracker && docker compose stop
tar czf /tmp/pricetracker.tgz data .env docker-compose.yml
```

🖥️ **PC:** copiar `pricetracker.tgz` do Hetzner para o Pi (ver acima).

🍓 **Pi:** descarregar o código, pôr os dados e arrancar
```bash
git clone git@github.com:<a-tua-conta>/<repositório-do-pricetracker>.git /srv/pricetracker
tar xzf /tmp/pricetracker.tgz -C /srv/pricetracker
cd /srv/pricetracker && docker compose up -d --build
curl -I http://127.0.0.1:8080
```
- O `git clone` pede acesso ao GitHub. Se der erro de permissão, cria uma chave SSH no Pi (`ssh-keygen -t ed25519`, Enter em tudo) e acrescenta o conteúdo de `~/.ssh/id_ed25519.pub` em GitHub → Settings → SSH and GPG keys.
- O `--build` constrói a app para o processador do Pi. A primeira vez demora alguns minutos.
- O `curl -I` tem de mostrar `HTTP/1.1 200` (ou outro código que não seja erro de ligação).

**Corte.** Na Cloudflare: Zero Trust → Networks → Tunnels → `pi-server` → **Public hostname → Add a public hostname**:
- Subdomain: `plener`; Domain: `xuxus.site`.
- Service: Type **HTTP**, URL `localhost:8080`.
- Guardar. A Cloudflare troca sozinha o registo antigo (que apontava para o Hetzner) pelo túnel.

✅ **Verificação:** abre `https://plener.xuxus.site` no browser e confirma que tudo funciona.

☁️ **Hetzner:** só depois de confirmar, desligar a app antiga
```bash
cd /home/betintel_user/pricetracker && docker compose down
```

### 6.2 Stream-Intel (base de dados num ficheiro SQLite)

☁️ **Hetzner**
```bash
cd /home/streamuser/stream-intel && docker compose stop
sqlite3 data/stream_intel.db ".backup /tmp/stream_intel.db"     # cópia segura da base de dados
tar czf /tmp/stream-intel.tgz .env docker-compose.yml
```
Se o `sqlite3` não existir no Hetzner: `apt install -y sqlite3`.

🖥️ **PC:** copiar `stream_intel.db` e `stream-intel.tgz` para o Pi.

🍓 **Pi**
```bash
git clone git@github.com:<a-tua-conta>/<repositório-do-stream-intel>.git /srv/stream-intel
mkdir -p /srv/stream-intel/data
tar xzf /tmp/stream-intel.tgz -C /srv/stream-intel
cp /tmp/stream_intel.db /srv/stream-intel/data/
cd /srv/stream-intel && nano docker-compose.yml
```
No ficheiro que abre, troca a linha `image: ghcr.io/jbsousapsn/stream-intel:latest` por `build: .`, porque a imagem antiga não serve para o processador do Pi. Guarda com **Ctrl+O → Enter → Ctrl+X**. Depois:
```bash
docker compose up -d --build
curl -I http://127.0.0.1:8000
```

**Corte** (duas rotas no túnel):
1. Subdomain `streamintel-api`, domain `stream-intel.online` → HTTP `localhost:8000`.
2. Subdomain vazio, domain `stream-intel.online`, **Path** `^/api/` → HTTP `localhost:8000`.

✅ **Verificação:** a app/site do Stream-Intel funciona e mostra os dados de antes. Depois, ☁️ **Hetzner:** `cd /home/streamuser/stream-intel && docker compose down`.

### 6.3 Parlay League (base de dados Postgres num contentor)

☁️ **Hetzner**
```bash
cd /home/betintel_user/parlay-league
docker compose exec -T postgres pg_dump -U parlay -Fc parlay_league > /tmp/parlay.dump
tar czf /tmp/parlay-conf.tgz .env docker-compose.yml
```
O `pg_dump` faz uma cópia completa da base de dados para o ficheiro `parlay.dump`.

🖥️ **PC:** copiar `parlay.dump` e `parlay-conf.tgz` para o Pi.

🍓 **Pi**
```bash
git clone git@github.com:<a-tua-conta>/<repositório-do-parlay-league>.git /srv/parlay-league
tar xzf /tmp/parlay-conf.tgz -C /srv/parlay-league && cd /srv/parlay-league
docker compose up -d postgres          # arranca só a base de dados (vazia)
sleep 15                               # espera 15 segundos que ela fique pronta
docker compose exec -T postgres pg_restore -U parlay -d parlay_league --no-owner < /tmp/parlay.dump
docker compose up -d --build           # arranca o resto da app
curl -I http://127.0.0.1:8090
```

**Corte:** domain `couveflor.site` (subdomain vazio) → HTTP `localhost:8090`.

✅ **Verificação:** `https://couveflor.site` mostra os dados de antes. Depois, ☁️ **Hetzner:** `cd /home/betintel_user/parlay-league && docker compose down`.

### 6.4 BetIntel (por último, porque é a mais complexa)

O código do BetIntel já está preparado para o Pi. Tem:
- um ficheiro que descreve a app no Pi: base de dados, Redis e API (`deploy/pi/docker-compose.yml`);
- uma lista dos segredos necessários (`deploy/pi/.env.example`);
- uma tarefa automática no GitHub que instala e atualiza a app no Pi (o "job" `deploy-pi`). Só fica ativa quando o mandares (passo b).

#### a) Criar o ficheiro de segredos no Pi

🖥️ **PC** (na pasta do projeto bet-intel): enviar o modelo para o Pi
```bash
scp deploy/pi/.env.example <o-teu-utilizador>@<ip-do-pi>:/tmp/betintel.env
```
☁️ **Hetzner:** ver os valores atuais (para os copiares)
```bash
cat /root/betintel/apps/api/.env
```
🍓 **Pi**
```bash
mkdir -p /srv/betintel
mv /tmp/betintel.env /srv/betintel/.env
chmod 600 /srv/betintel/.env           # só tu podes ler este ficheiro
openssl rand -hex 32                   # gera uma palavra-passe nova (copia o resultado)
openssl rand -hex 64                   # corre 2 vezes: uma para JWT_SECRET, outra para JWT_REFRESH_SECRET
nano /srv/betintel/.env
```
No editor:
- `POSTGRES_PASSWORD=`: cola a palavra-passe **nova** (a antiga está escrita num ficheiro do projeto e deve ser trocada).
- `JWT_SECRET=` e `JWT_REFRESH_SECRET=`: cola os dois valores longos. Isto obriga a fazer login de novo na app, mas é mais seguro.
- Os restantes campos (Firebase, SMTP, Gemini, etc.): copia-os do `.env` do Hetzner. O **`FIREBASE_SERVICE_ACCOUNT_JSON` é obrigatório**: sem ele a API não arranca (aparece o erro `FIREBASE_SERVICE_ACCOUNT_JSON env var is missing`). É uma linha muito comprida; copia-a inteira.
- **Não** acrescentes `DATABASE_URL` nem `REDIS_URL`: o Pi define-os sozinho.
- `SCRAPER_HTTP_PROXY=` fica vazio.

Guarda com **Ctrl+O → Enter → Ctrl+X**.

#### b) Primeira instalação no Pi (ainda sem dados)

1. No GitHub, abre o repositório **bet-intel → Settings → Secrets and variables → Actions → separador Variables → New repository variable**:
   - Name: `DEPLOY_TARGET`
   - Value: `pi`
2. Vai a **Actions → "Build & Deploy API" → Run workflow** (branch `main`) → **Run workflow**.
3. Acompanha a execução. O passo `deploy-pi` corre no Pi; a primeira vez demora cerca de 5–10 minutos, porque constrói a app para o Pi.

✅ **Verificação:** a execução acaba com um ✓ verde e o passo "Health check" diz **API OK**. 🍓 `curl http://127.0.0.1:3000/health` responde.

A partir deste momento, cada alteração ao código no GitHub atualiza o Pi automaticamente, e o Hetzner deixa de receber atualizações.

#### c) Copiar os dados (a app fica parada 15–30 minutos)

☁️ **Hetzner:** parar a app e copiar a base de dados e as fotos de perfil
```bash
docker stop api-api-1
sudo -u postgres pg_dump -Fc betintel > /tmp/betintel.dump
docker run --rm -v api_uploads_data:/d -v /tmp:/b alpine tar czf /b/uploads.tgz -C /d .
```
🖥️ **PC:** copiar `betintel.dump` e `uploads.tgz` para o Pi.

🍓 **Pi:** substituir a base de dados vazia pela cópia
```bash
cd ~/runners/bet-intel/_work/bet-intel/bet-intel        # pasta onde o runner guardou o código
C="docker compose -f deploy/pi/docker-compose.yml --env-file /srv/betintel/.env"
$C stop api
$C exec -T betintel-db psql -U betintel_user -d postgres -c "DROP DATABASE betintel;" -c "CREATE DATABASE betintel OWNER betintel_user;"
$C exec -T betintel-db pg_restore -U betintel_user -d betintel --no-owner < /tmp/betintel.dump
docker run --rm -v betintel_uploads_data:/d -v /tmp:/b alpine sh -c "tar xzf /b/uploads.tgz -C /d"
$C up -d api
sleep 30 && curl -s http://127.0.0.1:3000/health
```
- O `pg_restore` pode mostrar avisos sobre "owner" ou "shadow_db": são normais.
- O último comando tem de responder (algo com `ok`).

#### d) Corte: rotas no túnel

Acrescenta estas rotas ao túnel `pi-server`:

| Subdomain | Domain | Path | Service |
|---|---|---|---|
| `betintel-api` | `stream-intel.online` | (vazio) | HTTP `localhost:3000` |
| `api` | `stream-intel.online` | (vazio) | HTTP `localhost:3000` |
| (vazio) | `stream-intel.online` | `^/health$` | HTTP `localhost:3000` |
| (vazio) | `stream-intel.online` | `^/socket.io/` | HTTP `localhost:3000` |

As duas últimas têm de ficar **acima** da regra `^/api/` do Stream-Intel na lista; no painel podes arrastar para mudar a ordem. A Cloudflare usa a primeira regra que serve.

#### e) Testar na app do telemóvel (a mesma app, sem reinstalar)

- [ ] Fazer login (vai pedir de novo, por causa dos segredos novos)
- [ ] Ver a lista de boletins e abrir um
- [ ] Abrir a Análise
- [ ] Ver "A decorrer" e receber uma notificação de teste
- [ ] Ler um boletim por screenshot
- [ ] Ver a foto de perfil

✅ **Verificação:** tudo funciona. Depois, ☁️ **Hetzner:**
```bash
docker compose -f /root/betintel/apps/api/docker-compose.yml down
```

#### f) Se algo correr mal

🍓 **Pi**
```bash
docker logs betintel-api-1 --tail 100      # últimas mensagens da app (erros aparecem aqui)
docker ps                                  # que contentores estão a correr
```
**Voltar atrás:** apaga as rotas do BetIntel no túnel e, ☁️ no Hetzner, `docker start api-api-1`. Na Cloudflare, os registos voltam a apontar para o IP do Hetzner (`178.104.68.233`). No GitHub, apaga a variável `DEPLOY_TARGET`.

### 6.5 Recolha de odds (o "comparador") a partir de casa

**Porque é que o Pi ajuda:** algumas casas de apostas bloqueiam pedidos vindos de fora de Portugal. No teste feito a partir do Hetzner (Alemanha), a Betano e o site da Lebull recusaram. A partir de casa, o IP é português.

1. **Confirmar que as 5 casas respondem a partir do Pi:**
   🍓 **Pi**
   ```bash
   cd ~/runners/bet-intel/_work/bet-intel/bet-intel && bash scripts/probe-odds.sh
   ```
   Espera cerca de 30 segundos. Todas as linhas têm de dizer **OK**. Se alguma disser BLOQUEADO, guarda a tabela e mostra-a ao Claude.
2. **Importante:** o comparador de odds **ainda não está construído**. Está planeado em `docs/analise-2026-11/PLANO_ODDS.md`. Este passo só confirma que, quando for construído, as casas vão responder a partir do Pi.
3. **Quando o comparador for entrando:** não é preciso fazer nada no Pi. Ele vem dentro da app BetIntel e chega ao Pi sozinho, com cada atualização do código (secção 6.4 b). Só é preciso que `SCRAPER_HTTP_PROXY` continue vazio no `/srv/betintel/.env`.
4. **Ver o estado das casas** (quando existir): 🍓 `curl http://127.0.0.1:3000/api/odds/health`. Se uma casa bloquear, chega um aviso ao telemóvel.
5. **Cuidado com o volume de pedidos:** o IP de casa é o mesmo que toda a família usa. O plano do comparador faz poucos pedidos de propósito, para não haver bloqueios.

---

## 7. Depois de tudo mudado

### 7.1 Trocar segredos que ficaram expostos

Alguns segredos apareceram em sítios onde não deviam (um ficheiro do projeto e uma conversa). Troca-os:

- **Postgres do BetIntel:** já foi trocado no passo 6.4 a). Apaga a palavra-passe antiga do ficheiro `DEPLOY.md` do projeto (o Claude faz isto).
- **Postgres do Parlay League:** 🍓
  ```bash
  cd /srv/parlay-league
  docker compose exec postgres psql -U parlay -d parlay_league -c "ALTER USER parlay PASSWORD '<nova-palavra-passe>';"
  ```
  Depois, troca-a também no `.env` dessa pasta (`nano .env`) e reinicia: `docker compose up -d`.
- **Chaves TMDB e OMDB (Stream-Intel):** gera chaves novas nos sites themoviedb.org e omdbapi.com, põe-nas no `/srv/stream-intel/.env` e reinicia (`docker compose up -d`).
- **GitHub (bet-intel → Settings → Secrets):** quando o Hetzner for apagado, apaga os segredos `HETZNER_HOST`, `HETZNER_USER`, `HETZNER_SSH_KEY` e `DATABASE_URL`.

### 7.2 Cópias de segurança automáticas (todos os dias às 4h)

**Porquê:** se o SSD avariar, ou se o Pi for roubado ou apanhar uma descarga, perdias os dados. As cópias diárias, guardadas também fora de casa, evitam isso.

🍓 **Pi**
```bash
mkdir -p /srv/backups
cp ~/runners/bet-intel/_work/bet-intel/bet-intel/scripts/pi/backup.sh /srv/backups/
chmod +x /srv/backups/backup.sh
/srv/backups/backup.sh                     # primeira cópia, para testar
ls -lh /srv/backups/                       # deve aparecer uma pasta com a data de hoje
(crontab -l 2>/dev/null; echo "0 4 * * * /srv/backups/backup.sh >> /srv/backups/backup.log 2>&1") | crontab -
```
O último comando agenda a cópia para as 4h da manhã, todos os dias. As cópias com mais de 7 dias são apagadas sozinhas.

**Cópia fora de casa (muito recomendado):**
1. 🍓 `sudo apt install -y rclone && rclone config`
2. Escolhe `n` (novo), dá-lhe o nome **`offsite`** e escolhe **Google Drive** (ou Backblaze B2). Segue as perguntas; para o Google Drive, vai pedir para abrir um link e autorizar.
3. A partir daí, o script envia as cópias para lá sozinho.

**Testar que a cópia serve** (faz isto pelo menos uma vez): 🍓
```bash
docker run -d --name pgtest -e POSTGRES_PASSWORD=x postgres:16-alpine
sleep 10
docker exec -i pgtest pg_restore -U postgres -d postgres --create < /srv/backups/$(date +%F)/betintel.dump
docker exec pgtest psql -U postgres -d betintel -c "select count(*) from \"Boletin\";"   # deve mostrar o nº de boletins
docker rm -f pgtest
```

### 7.3 Ser avisado se um site cair

O **Uptime Kuma** verifica os teus sites de minuto a minuto e avisa-te no telemóvel se algum deixar de responder.

🍓 **Pi**
```bash
docker run -d --name uptime-kuma --restart always -p 3001:3001 -v uptime_kuma:/app/data louislam/uptime-kuma:1
```
1. No PC (ligado à Tailscale), abre `http://<nome-do-pi-no-tailscale>:3001`. Cria um utilizador.
2. **Add New Monitor** → tipo **HTTP(s)**, um monitor para cada endereço:
   - `https://api.stream-intel.online/health`
   - `https://streamintel-api.stream-intel.online`
   - `https://couveflor.site`
   - `https://plener.xuxus.site`
3. Em **Settings → Notifications**, liga o **Telegram** ou o **ntfy** (app de notificações) para receberes os avisos no telemóvel.

### 7.4 Desligar a Hetzner

1. Com as 4 apps no Pi e testadas, deixa o servidor da Hetzner ligado (mas sem apps) mais **2 semanas**, por precaução.
2. Se tudo correr bem, na consola da Hetzner (console.hetzner.cloud): servidor → **Delete**. Opcionalmente, antes, faz um **Snapshot** (custa cêntimos por mês) para teres uma cópia do servidor antigo.
3. Apaga os segredos `HETZNER_*` no GitHub (7.1).

### 7.5 Home Assistant e Alexa

**Não muda nada.** A porta 443 continua aberta no router para o Home Assistant, porque a Amazon (Alexa) precisa dela para falar com ele. O túnel da Cloudflare serve só as apps e não interfere com a 443 nem com a 8123.

---

## 8. O que acontece se faltar a luz ou a internet

- **Falta de luz:** o Pi desliga-se e as apps ficam em baixo. Quando a luz volta, o Pi arranca e todas as apps arrancam sozinhas (`restart: always`). Uma UPS pequena (bateria) aguenta quebras curtas.
- **Falha da internet da MEO:** os sites ficam em baixo até a internet voltar. Os dados não se perdem.
- **Velocidade:** o upload da tua internet chega para uso pessoal.

---

## 9. Lista para ir marcando

- [ ] 2.1 Cópia do Home Assistant descarregada para o PC
- [ ] 2.1 b) Imagem do cartão microSD guardada no PC
- [ ] 2.2 Diagnóstico revisto com o Claude
- [ ] 2.3 SSD montado em `/srv` (continua lá depois de reiniciar)
- [ ] 2.4 Atualizações automáticas ligadas
- [ ] 2.5 Docker a funcionar, a guardar em `/srv/docker`; rede `app_network` criada
- [ ] 2.6 Entrar no Pi por SSH fora de casa, pela Tailscale
- [ ] 3 Três domínios ativos na Cloudflare e sites a funcionar
- [ ] 4 Túnel `pi-server` HEALTHY
- [ ] 5 Runners Idle nos 4 repositórios (todos privados)
- [ ] 6.1 Pricetracker no Pi e desligado no Hetzner
- [ ] 6.2 Stream-Intel no Pi e desligado no Hetzner
- [ ] 6.3 Parlay League no Pi e desligado no Hetzner
- [ ] 6.4 BetIntel no Pi (`DEPLOY_TARGET=pi`, dados copiados, rotas, testes na app)
- [ ] 6.5 `probe-odds.sh` no Pi: todas as linhas OK
- [ ] 7.1 Segredos trocados
- [ ] 7.2 Cópias diárias a funcionar, cópia fora de casa e teste de restauro feito
- [ ] 7.3 Uptime Kuma com avisos no telemóvel
- [ ] 7.4 Hetzner apagado ao fim de 2 semanas
- [ ] 7.5 Home Assistant e Alexa continuam a funcionar
