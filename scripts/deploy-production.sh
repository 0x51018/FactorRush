#!/usr/bin/env bash
set -Eeuo pipefail

# 서버에서 실행되는 최소 배포 스크립트.
# 전제:
# - APP_DIR 아래에 저장소가 clone 되어 있어야 한다.
# - systemd 서비스와 env 파일은 이미 1회 수동 설치되어 있어야 한다.
# - 현재 스크립트는 main 브랜치 자동 배포를 기준으로 한다.

APP_DIR="${APP_DIR:-/srv/factorrush/app}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"

echo "[FactorRush] Deploying from ${APP_DIR} (${DEPLOY_BRANCH})"
cd "${APP_DIR}"

current_branch="$(git rev-parse --abbrev-ref HEAD)"
if [[ "${current_branch}" != "${DEPLOY_BRANCH}" ]]; then
  git checkout "${DEPLOY_BRANCH}"
fi

git fetch origin "${DEPLOY_BRANCH}" --depth=1
git pull --ff-only origin "${DEPLOY_BRANCH}"

npm ci
npm run build

sudo -n /bin/systemctl restart factorrush-server.service
sudo -n /bin/systemctl restart factorrush-web.service

curl --fail --silent --show-error http://127.0.0.1:3001/health >/dev/null
curl --fail --silent --show-error http://127.0.0.1:3000/ >/dev/null

echo "[FactorRush] Deploy finished successfully."
