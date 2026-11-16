# betano-egress

Sidecar HTTP em Python que faz os pedidos à Betano em nome da API, com o handshake TLS e o
enquadramento HTTP/2 de um browser real. Serve só para ler endpoints JSON públicos que o site já
chama; não há login, contas nem apostas.

## Porque existe

**Porque não `fetch` puro.** O `undici` do Node tem um JA3 com forma de OpenSSL: a ordem das extensões
do ClientHello é fixa no stack TLS. O `curl_cffi` usa o stack do Chrome e reproduz JA3/JA4 e o
fingerprint HTTP/2 à Akamai. Num IP residencial com pouco tráfego o `fetch` passa; com o catálogo a
correr de 10 em 10 minutos é a diferença entre passar e ser limitado.

**Porque sidecar e não subprocess.** Um `curl` por pedido abre conexão nova e perde metade do
benefício. Um `Session` persistente do `curl_cffi` reutiliza a conexão, a sessão TLS e o jar. O sidecar
existe para manter esse objecto vivo entre chamadas.

A Betano corre sobre Cloudflare Bot Management: do IP de um VPS devolve 403, de um IP residencial
português responde. Por isso o sidecar corre no Raspberry Pi, em casa.

## Como corre

É o serviço `betano-egress` do `deploy/pi/docker-compose.yml`, construído no Pi (ARM64, o `curl_cffi`
tem wheels aarch64) e ligado à rede `app_network`. A API chega-lhe em `http://betano-egress:8765`.

```bash
docker compose -f deploy/pi/docker-compose.yml --env-file /srv/betintel/.env up -d --build betano-egress
```

Corre como utilizador não-root, `read_only` com `tmpfs` em `/tmp`, `cap_drop: ALL`, 256 MB de memória.

## Variáveis de ambiente

| Variável | Omissão | Notas |
|---|---|---|
| `BETANO_EGRESS_TOKEN` | (obrigatória) | Partilhada com a API (`openssl rand -hex 32`). Com o valor vazio o sidecar fica inativo (loga em stderr e não serve pedidos, sem reiniciar em ciclo). |
| `BETANO_IMPERSONATE` | `chrome` | Alvo do `curl_cffi`. `chrome` resolve para o Chrome mais recente que a versão instalada conhece. |
| `BETANO_MAX_SESSIONS` | `8` | Máximo de sessões vivas (LRU). |
| `HOST` | `127.0.0.1` | O Dockerfile define `0.0.0.0` (dentro do contentor). |
| `PORT` | `8765` | |

`BETANO_BROWSER_MAJOR` (usada pela API nos headers) deve coincidir com o major do alvo resolvido, ver
abaixo.

## Porque a porta só em 127.0.0.1

A porta é publicada como `127.0.0.1:8765:8765`: serve apenas para verificações no próprio Pi. A API
não a usa pelo host (o loopback do host não é visível do contentor da API); fala com o sidecar pela
rede `app_network`. Assim o sidecar nunca fica exposto à rede doméstica. Além do token
(`x-egress-token`, só `/ping` é aberto), os pedidos só são aceites para `www.betano.pt` e `betano.pt`,
e os redirects são seguidos à mão com verificação do host em cada salto (máx. 5).

## Verificação (no Pi)

```bash
# 1. Vivo e alvo resolvido
curl -s localhost:8765/ping
# {"ok":true,"impersonate":"chrome","resolved":"chrome1xx","sessions":0}

TOKEN=$(grep -oP '(?<=BETANO_EGRESS_TOKEN=).*' /srv/betintel/.env)

# 2. Sem token -> 401
curl -s -o /dev/null -w '%{http_code}\n' localhost:8765/session -X POST

# 3. Com token -> {"sid":"..."}
curl -s localhost:8765/session -X POST -H "x-egress-token: $TOKEN"

# 4. Host não permitido -> 400 "host não permitido"
curl -s localhost:8765/fetch -X POST -H "x-egress-token: $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"sid":"x","url":"http://192.168.1.1/"}'

# 5. Sessão desconhecida -> 404 {"error":"unknown session"}
curl -s localhost:8765/cookies/nao-existe -H "x-egress-token: $TOKEN"
```

### Ler o alvo resolvido

O campo `resolved` do `/ping` é o alvo concreto (por exemplo `chrome136`) que o `curl_cffi` usa para o
alias `chrome`. O major desse alvo é o que deve estar em `BETANO_BROWSER_MAJOR` (em
`/srv/betintel/.env`; com `curl_cffi==0.17.0` é `152`), para os headers `User-Agent` e `sec-ch-ua` da API coincidirem com
o fingerprint TLS. Se diferirem, ajustar a variável e reiniciar a API.

O `curl_cffi` está fixado em `0.17.0` (`requirements.txt`). Ao actualizá-lo, voltar a verificar o `/ping` e
actualizar `BETANO_BROWSER_MAJOR`.

## Challenge

Se a Betano devolver um challenge, a API marca-o e a recolha pára até ser resolvido à mão com o
script de solve (`pnpm --filter api betano:solve`, ver docs/PLANO_BETANO.md), que carrega os cookies para
o Redis.
