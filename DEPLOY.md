# Manual API Deploy (without GitHub Actions)

Use these steps whenever you need to deploy API changes directly to the Hetzner server.

---

## Prerequisites

- Docker Desktop running on your machine
- A GitHub Personal Access Token (PAT) with `write:packages` scope
  - Create one at: https://github.com/settings/tokens → "Generate new token (classic)"
- SSH access to the server (`root@178.104.68.233`)

---

## Step 1 — Log in to GitHub Container Registry

Run from your local machine:

```bash
echo YOUR_PAT | docker login ghcr.io -u pointerjs00 --password-stdin
```

`YOUR_PAT` must be a **classic** token (`ghp_…`) with `write:packages` (and `repo` while the repo is private). Fine-grained tokens fail with "token provided does not match expected scopes". If a push is still denied, run `docker logout ghcr.io` first: Docker may be reusing an old login.

---

## Step 2 — Build and push the Docker image

Run from the **root of the repo**:

```bash
docker build -f apps/api/Dockerfile -t ghcr.io/pointerjs00/bet-intel/betintel-api:latest .

docker push ghcr.io/pointerjs00/bet-intel/betintel-api:latest
```

This takes a few minutes. The first build is slower; subsequent builds use the cache.

---

## Step 3 — Upload config files to the server

Run from the **root of the repo** (only needed if `docker-compose.yml` changed):

```bash
scp apps/api/docker-compose.yml root@178.104.68.233:~/betintel/apps/api/docker-compose.yml
```

If the `.env` on the server doesn't exist yet (first deploy), create it:

```bash
ssh root@178.104.68.233
mkdir -p ~/betintel/apps/api
nano ~/betintel/apps/api/.env
```

Paste the production env values (see `apps/api/.env` as reference, with the changes below):

| Variable | Production value |
|---|---|
| `DATABASE_URL` | `postgresql://betintel_user:fortunageracional21@172.17.0.1:5432/betintel` |
| `REDIS_URL` | `redis://172.17.0.1:6379` |
| `PORT` | `3000` |
| `NODE_ENV` | `production` |
| `APP_URL` | Your domain (e.g. `https://yourdomain.com`) |
| `ALLOWED_ORIGINS` | Your domain(s) |
| `PUPPETEER_EXECUTABLE_PATH` | _(remove this line — not needed on Linux)_ |

Save with **Ctrl+O → Enter → Ctrl+X**.

---

## Step 4 — SSH into the server and deploy

```bash
ssh root@178.104.68.233
```

Set variables:

```bash
ENV_FILE="$HOME/betintel/apps/api/.env"
COMPOSE_FILE="$HOME/betintel/apps/api/docker-compose.yml"
IMAGE="ghcr.io/pointerjs00/bet-intel/betintel-api:latest"
```

Pull the new image:

```bash
echo YOUR_PAT | docker login ghcr.io -u pointerjs00 --password-stdin
docker pull "$IMAGE"
```

Ensure the Docker network exists:

```bash
docker network inspect app_network >/dev/null 2>&1 || docker network create app_network
```

Run Prisma migrations:

```bash
docker run --rm --env-file "$ENV_FILE" --network app_network "$IMAGE" \
  sh -c "cd /app/apps/api && npx prisma migrate deploy --schema=./prisma/schema.prisma"
```

Run seed:

```bash
docker run --rm --env-file "$ENV_FILE" --network app_network "$IMAGE" \
  sh -c "cd /app/apps/api && node dist/prisma/seed.js"
```

Restart the API container:

```bash
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --no-deps --force-recreate api
```

Check that the container runs the image you just pulled (both must say `ghcr.io/pointerjs00/...`):

```bash
grep image: "$COMPOSE_FILE"
docker inspect api-api-1 --format '{{.Config.Image}}'
```

Clean up old images:

```bash
docker image prune -f
```

---

## Verify

Check the container is running:

```bash
docker ps
```

Check logs:

```bash
docker logs api-api-1 --tail 50
```
