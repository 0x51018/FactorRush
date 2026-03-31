# FactorRush GitHub Actions 배포 가이드

이 문서는 현재 저장소 기준으로 가장 작은 운영 구성을 전제로 작성했다.

- 배포 대상: 임대한 단일 Linux 서버 1대
- 배포 방식: `main` 브랜치 push 기반 GitHub Actions 자동 배포
- 런타임 구조: `Next.js 웹(3000)` + `Express/Socket.IO 서버(3001)` + `Nginx(443)`
- 목적: 프로토타입을 빠르게 서비스하되, 보안상 위험한 기본값은 피하기

## 현재 저장소에 추가된 배포 요소

- GitHub Actions 워크플로: `.github/workflows/deploy.yml`
- 서버 배포 스크립트: `scripts/deploy-production.sh`
- systemd 서비스 예시:
  - `deploy/systemd/factorrush-web.service`
  - `deploy/systemd/factorrush-server.service`
- Nginx 예시:
  - `deploy/nginx/factorrush.conf`
- 운영 환경변수 예시:
  - `deploy/env/web.env.example`
  - `deploy/env/server.env.example`

## 먼저 알아둘 점

- 현재 방 상태는 메모리에만 저장된다.
- 즉, 배포나 재시작이 일어나면 진행 중인 방은 종료된다.
- 이 자동 배포 방식은 프로토타입 운영에는 충분하지만, 무중단 배포 구조는 아니다.
- 운영 중 실사용 인원이 많은 시간대에는 `main` 머지를 신중하게 하는 편이 좋다.

## 권장 운영 구조

```text
사용자 브라우저
  -> https://game.example.com
  -> Nginx
     -> /            -> Next.js (127.0.0.1:3000)
     -> /socket.io/  -> Realtime server (127.0.0.1:3001)
```

핵심은 외부에 Node 포트를 직접 열지 않고, Nginx만 공개하는 것이다.

## 1. 서버 1회 초기 준비

아래 예시는 Ubuntu 계열 서버를 기준으로 설명한다.

### 1-1. 운영 사용자 만들기

전용 사용자를 하나 두는 것을 권장한다.

```bash
sudo adduser --disabled-password --gecos "" factorrush
sudo mkdir -p /srv/factorrush
sudo chown -R factorrush:factorrush /srv/factorrush
sudo mkdir -p /etc/factorrush
```

### 1-2. 필수 패키지 설치

최소한 아래 도구는 필요하다.

- `git`
- `nginx`
- `curl`
- `node` / `npm`

주의:
- systemd 서비스 예시는 `/usr/bin/npm` 경로를 전제로 한다.
- 따라서 운영 서버의 Node.js는 `nvm`보다 시스템 전역 경로 방식으로 설치하는 편이 안전하다.
- Node 22 계열 사용을 권장한다.

### 1-3. 저장소 최초 clone

```bash
sudo -u factorrush -H bash -lc '
  cd /srv/factorrush &&
  git clone <YOUR_REPOSITORY_URL> app &&
  cd app &&
  npm ci &&
  npm run build
'
```

## 2. 운영 환경변수 설치

예시 파일을 복사한 뒤 실제 값으로 수정한다.

```bash
sudo cp /srv/factorrush/app/deploy/env/server.env.example /etc/factorrush/server.env
sudo cp /srv/factorrush/app/deploy/env/web.env.example /etc/factorrush/web.env
```

### `/etc/factorrush/server.env`

```env
NODE_ENV=production
PORT=3001
ALLOWED_ORIGINS=https://game.example.com
```

설명:
- `ALLOWED_ORIGINS`는 꼭 실제 서비스 도메인으로 제한한다.
- 여러 도메인이 필요하면 쉼표로 구분한다.
- 예: `https://game.example.com,https://www.game.example.com`

### `/etc/factorrush/web.env`

```env
NODE_ENV=production
HOSTNAME=127.0.0.1
PORT=3000
NEXT_PUBLIC_SERVER_URL=https://game.example.com
```

설명:
- 프론트는 외부 공개 URL 기준으로 실시간 서버에 붙는다.
- Nginx가 `/socket.io/`를 내부 3001로 프록시하므로 같은 도메인을 넣는 구성이 가장 단순하다.

## 3. systemd 서비스 설치

```bash
sudo cp /srv/factorrush/app/deploy/systemd/factorrush-web.service /etc/systemd/system/
sudo cp /srv/factorrush/app/deploy/systemd/factorrush-server.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable factorrush-web.service
sudo systemctl enable factorrush-server.service
sudo systemctl start factorrush-server.service
sudo systemctl start factorrush-web.service
```

확인:

```bash
systemctl status factorrush-server.service
systemctl status factorrush-web.service
curl http://127.0.0.1:3001/health
curl -I http://127.0.0.1:3000/
```

## 4. Nginx 설치

`deploy/nginx/factorrush.conf`를 기준으로 실제 도메인명과 인증서 경로를 바꾼다.

```bash
sudo cp /srv/factorrush/app/deploy/nginx/factorrush.conf /etc/nginx/sites-available/factorrush.conf
sudo ln -s /etc/nginx/sites-available/factorrush.conf /etc/nginx/sites-enabled/factorrush.conf
sudo nginx -t
sudo systemctl reload nginx
```

주의:
- 예시 파일은 `game.example.com`을 가정한다.
- TLS 인증서는 실제 운영 환경에 맞게 준비해야 한다.
- WebSocket 업그레이드 헤더가 이미 포함되어 있으므로 `/socket.io/` 연결에 맞는 형태다.

## 5. GitHub Actions 자동 배포 설정

자동 배포는 GitHub Actions가 서버에 SSH 접속해서 `scripts/deploy-production.sh`를 실행하는 방식이다.

### 5-1. GitHub Environment 만들기

리포지토리 Settings에서 `production` 환경을 만든다.

이유:
- 배포용 비밀값을 일반 repository secret이 아니라 환경 단위로 분리할 수 있다.
- GitHub는 환경에 대해 브랜치 제한, 보호 규칙, 환경 전용 secret/variable을 제공한다.

### 5-2. GitHub Environment Variables

`production` 환경에 아래 변수를 추가한다.

- `DEPLOY_HOST`
  - 예: `game.example.com`
- `DEPLOY_PORT`
  - 예: `22`
- `DEPLOY_USER`
  - 예: `factorrush`
- `DEPLOY_PATH`
  - 예: `/srv/factorrush/app`

주의:
- `DEPLOY_PATH`는 공백 없는 경로를 권장한다.

### 5-3. GitHub Environment Secrets

`production` 환경에 아래 secret을 추가한다.

- `DEPLOY_SSH_PRIVATE_KEY`
  - 서버의 `factorrush` 사용자로 접속 가능한 배포 전용 개인키
- `DEPLOY_SSH_KNOWN_HOSTS`
  - 서버 호스트키를 미리 고정한 값

예시 생성:

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ./factorrush-deploy-key
ssh-keyscan -H game.example.com
```

사용 방법:
- 공개키는 서버의 `/home/factorrush/.ssh/authorized_keys`에 넣는다.
- 개인키는 GitHub `DEPLOY_SSH_PRIVATE_KEY` secret으로 넣는다.
- `ssh-keyscan -H ...` 결과는 `DEPLOY_SSH_KNOWN_HOSTS`에 넣는다.

주의:
- secret 값은 JSON 같은 구조화 문자열보다 단일 값 형태가 더 안전하다.
- private key는 이 배포용 계정 하나만을 위한 키로 분리하는 것을 권장한다.

## 6. 서버 sudo 권한 최소화

배포 스크립트는 서비스 재시작을 위해 `sudo systemctl restart`가 필요하다.

가장 단순한 방식은 아래처럼 특정 서비스에 대해서만 비밀번호 없는 sudo를 허용하는 것이다.

```bash
sudo visudo -f /etc/sudoers.d/factorrush-deploy
```

내용 예시:

```text
factorrush ALL=(root) NOPASSWD: /bin/systemctl restart factorrush-server.service
factorrush ALL=(root) NOPASSWD: /bin/systemctl restart factorrush-web.service
```

이렇게 하면 GitHub Actions가 서버에 접속하더라도 임의의 root 명령을 전부 실행할 수는 없다.

## 7. GitHub Actions 동작 방식

`.github/workflows/deploy.yml`은 아래 순서로 실행된다.

1. `main` push 또는 수동 실행
2. GitHub runner에서 `npm ci`
3. GitHub runner에서 `npm run build`
4. 성공 시에만 SSH로 서버 접속
5. 서버에서 `scripts/deploy-production.sh` 실행
6. 서버에서:
   - 최신 `main` pull
   - `npm ci`
   - `npm run build`
   - web/server 서비스 재시작
   - `/health`, `/` 확인

이 워크플로는 아래 원칙을 반영한다.

- `GITHUB_TOKEN` 권한은 `contents: read`만 사용
- 액션은 mutable tag 대신 full commit SHA로 pin
- 배포용 비밀값은 `production` 환경 secret으로만 제공
- SSH 접속 시 `StrictHostKeyChecking=yes` 사용
- 서버 접속 후 실행하는 명령은 배포 스크립트 하나로 제한

## 8. 꼭 같이 설정할 GitHub 보안 옵션

아래는 코드 밖에서 꼭 켜두는 것을 권장한다.

- `main` 브랜치 보호
  - direct push 금지
  - pull request merge만 허용
- `.github/workflows/*` 변경 시 리뷰 강제
  - `CODEOWNERS` 사용 권장
- GitHub Actions 정책 강화
  - 가능하면 액션 SHA pinning 강제
- production 환경 브랜치 제한
  - `main`만 배포 가능하도록 제한

자동 배포를 원한다면 `required reviewers`는 필수는 아니다.
다만 자동성을 유지하면서도 보안을 챙기려면 `main 보호 + environment secret 분리 + workflow 파일 리뷰 강제` 조합이 가장 현실적이다.

## 9. 첫 배포 후 확인 항목

```bash
curl https://game.example.com
curl https://game.example.com/room/AB12CD
curl https://game.example.com/socket.io/?EIO=4&transport=polling
journalctl -u factorrush-web.service -n 100 --no-pager
journalctl -u factorrush-server.service -n 100 --no-pager
```

브라우저 확인:
- 홈 진입
- 방 생성
- 링크 복사
- 다른 브라우저/시크릿 창으로 방 참가
- 실시간 입장 반영
- 게임 시작 및 라운드 진행

## 10. 이 구성의 한계

- 배포할 때마다 메모리 룸이 초기화된다.
- 단일 서버 구조라서 수평 확장이 안 된다.
- Redis 같은 외부 상태 저장소가 없어서 다중 인스턴스 운영에 맞지 않는다.
- 자동 배포는 되지만 무중단 배포는 아니다.

## 11. 다음 단계 추천

실서비스 단계로 더 가려면 아래 순서가 좋다.

1. Redis 도입으로 룸 상태 외부화
2. 배포 전 drain 모드 추가
3. 에러 추적 도구(Sentry 등) 추가
4. rate limiting 추가
5. Docker 또는 이미지 기반 배포로 환경 재현성 향상

## 보안 메모

이 문서의 자동 배포 방식은 GitHub Actions와 SSH를 사용한다.
현재 구조에서는 서버가 클라우드 OIDC 대상이 아니라서 long-lived SSH key를 사용하지만, 아래 수칙을 지키면 위험을 크게 줄일 수 있다.

- 배포 전용 계정 사용
- 배포 전용 SSH 키 분리
- known_hosts 고정
- environment secret 사용
- full SHA pinning
- 최소 권한 sudo
- `ALLOWED_ORIGINS` 제한

이후 클라우드 공급자가 OIDC 기반 배포를 쉽게 제공한다면, long-lived SSH key 대신 단기 자격증명 방식으로 전환하는 것이 더 좋다.
