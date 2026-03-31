#!/usr/bin/env bash
set -Eeuo pipefail

# 홈 서버에서 실행되는 Docker 기반 배포 스크립트.
# 전제:
# - APP_DIR 아래에 저장소가 clone 되어 있어야 한다.
# - deploy/home/.env, deploy/home/server.env, deploy/home/web.env 가 준비되어 있어야 한다.
# - Docker와 Docker Compose Plugin이 설치되어 있어야 한다.

APP_DIR="${APP_DIR:-$HOME/apps/factorrush/live}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
COMPOSE_FILE="${COMPOSE_FILE:-deploy/home/docker-compose.yml}"
COMPOSE_ENV_FILE="${COMPOSE_ENV_FILE:-deploy/home/.env}"

echo "[FactorRush] Home deploy from ${APP_DIR} (${DEPLOY_BRANCH})"
cd "${APP_DIR}"

git fetch origin "${DEPLOY_BRANCH}" --depth=1

# 배포 전용 checkout은 원격 브랜치 상태와 정확히 맞추는 편이 안전하다.
# clone 당시 어느 브랜치를 기준으로 만들었는지와 관계없이
# 항상 origin/<branch> 기준으로 작업 트리를 다시 정렬한다.
git checkout -B "${DEPLOY_BRANCH}" "origin/${DEPLOY_BRANCH}"

test -f "${COMPOSE_FILE}"
test -f "${COMPOSE_ENV_FILE}"
test -f "deploy/home/server.env"
test -f "deploy/home/web.env"

docker compose --env-file "${COMPOSE_ENV_FILE}" -f "${COMPOSE_FILE}" up -d --build

docker compose --env-file "${COMPOSE_ENV_FILE}" -f "${COMPOSE_FILE}" exec -T server \
  node -e "fetch('http://127.0.0.1:3001/health').then((response)=>{if(!response.ok)process.exit(1)}).catch(()=>process.exit(1))"

docker compose --env-file "${COMPOSE_ENV_FILE}" -f "${COMPOSE_FILE}" exec -T web \
  node -e "fetch('http://127.0.0.1:3000').then((response)=>{if(!response.ok)process.exit(1)}).catch(()=>process.exit(1))"

echo "[FactorRush] Home deploy finished successfully."
