# FactorRush 서비스 인수인계 문서

이 문서는 형진 님이 지금 시점의 FactorRush를 운영하거나 다음 작업을 이어갈 때 바로 참고할 수 있도록 정리한 최종 운영 문서다.

기준 시점:

- 서비스 URL: `https://prime.0x51018.com`
- 운영 서버: 홈 서버
- 운영 방식: `Docker Compose + Traefik + GitHub Actions`
- 저장소 기본 배포 브랜치: `main`

## 1. 현재 운영 상태

현재 운영 구조는 아래와 같다.

```text
브라우저
  -> https://prime.0x51018.com
  -> Traefik (홈 서버)
     -> factorrush-web 컨테이너
     -> factorrush-server 컨테이너
```

주요 특징:

- 로그인, DB, 공개 매칭 없음
- 모든 방 상태는 서버 메모리에만 존재
- 서버 재시작 또는 재배포 시 진행 중 방은 종료됨
- 프론트와 실시간 서버는 같은 도메인 아래에서 Traefik이 라우팅

## 2. 실제 운영 경로

홈 서버 기준 배포 전용 checkout:

```text
/home/younhj1018/apps/factorrush/deploy-live
```

이 경로를 배포 전용으로 분리한 이유:

- GitHub Actions가 항상 같은 clean checkout만 갱신하게 하기 위함
- 수동 실험으로 생긴 untracked/modified 파일이 자동 배포를 깨지 않게 하기 위함
- 실제 서비스 컨테이너가 어느 checkout을 기준으로 빌드되는지 명확히 하기 위함

중요:

- 수동 실험은 `deploy-live`가 아닌 다른 디렉터리에서 하는 편이 안전하다.
- `deploy-live`는 가급적 GitHub Actions와 수동 복구 외에는 건드리지 않는 것을 권장한다.

## 3. 관련 파일

핵심 운영 파일:

- 홈 서버 배포 워크플로: `.github/workflows/deploy.yml`
- 홈 서버 배포 스크립트: `scripts/deploy-home.sh`
- Docker 빌드 정의: `deploy/home/Dockerfile`
- Compose 정의: `deploy/home/docker-compose.yml`
- 홈 서버 배포 가이드: `docs/deployment-home-server-ko.md`

애플리케이션 핵심:

- 웹 앱: `apps/web`
- 실시간 서버: `apps/server`
- 공통 규칙/타입: `packages/shared`

## 4. 환경 변수와 설정 파일

운영 checkout 안에 아래 파일들이 있어야 한다.

- `deploy/home/.env`
- `deploy/home/web.env`
- `deploy/home/server.env`

현재 기본값:

### `deploy/home/.env`

```env
COMPOSE_PROJECT_NAME=factorrush
FACTORRUSH_HOST=prime.0x51018.com
NEXT_PUBLIC_SERVER_URL=https://prime.0x51018.com
```

### `deploy/home/web.env`

```env
NODE_ENV=production
HOSTNAME=0.0.0.0
PORT=3000
NEXT_PUBLIC_SERVER_URL=https://prime.0x51018.com
```

### `deploy/home/server.env`

```env
NODE_ENV=production
PORT=3001
ALLOWED_ORIGINS=https://prime.0x51018.com
```

보강된 동작:

- `scripts/deploy-home.sh`는 위 파일이 없으면 example 파일에서 자동 생성한다.
- 다만 운영 중 값을 바꾼 적이 있다면, example과 다른 값이 필요한지 먼저 확인하는 편이 좋다.

## 5. 평소 배포 방식

정상 경로는 다음과 같다.

1. `main`에 머지
2. GitHub Actions `Deploy Production` 실행
3. 홈 서버 `deploy-live` checkout 갱신
4. Docker Compose 재빌드/재기동
5. healthcheck 통과 후 완료

현재 GitHub Actions `production` 환경은 아래 값을 사용한다.

- `DEPLOY_HOST=ssh.0x51018.com`
- `DEPLOY_PORT=2222`
- `DEPLOY_USER=younhj1018`
- `DEPLOY_PATH=/home/younhj1018/apps/factorrush/deploy-live`

## 6. 수동 배포 / 수동 복구

자동 배포와 별개로, 홈 서버에서 직접 다시 올릴 때는 아래 명령을 사용하면 된다.

```bash
cd /home/younhj1018/apps/factorrush/deploy-live
bash scripts/deploy-home.sh
```

동작:

- `origin/main` fetch
- 로컬 `main`을 `origin/main` 기준으로 다시 정렬
- 필요 시 env 예시 파일 복사
- Docker Compose `up -d --build --wait`
- 서버/웹 내부 healthcheck 실행

## 7. 상태 확인 명령

홈 서버에서 자주 볼 항목:

```bash
cd /home/younhj1018/apps/factorrush/deploy-live
git rev-parse HEAD
docker compose --env-file deploy/home/.env -f deploy/home/docker-compose.yml ps
docker compose --env-file deploy/home/.env -f deploy/home/docker-compose.yml logs --tail=100
```

외부 확인:

```bash
curl -I https://prime.0x51018.com/
curl -I https://prime.0x51018.com/room/AB12CD
curl 'https://prime.0x51018.com/socket.io/?EIO=4&transport=polling'
```

## 8. 테스트 기준

지금까지 운영 검증에 사용한 명령:

```bash
npm run build
SMOKE_SERVER_URL=https://prime.0x51018.com npm run smoke:dev
PLAYWRIGHT_BASE_URL=https://prime.0x51018.com npm run test:e2e
```

권장 기준:

- 기능 변경 전: `npm run build`
- 배포 직후: `smoke:dev`
- UI/로비/라운드 흐름 변경 시: `test:e2e`

## 9. 알려진 제약

- 방 상태는 메모리 기반이라 무중단 배포가 아니다.
- 서버가 재시작되면 진행 중 세션은 사라진다.
- 지금은 단일 서버 기준 구조다.
- Redis 같은 외부 상태 저장소가 없으므로 다중 인스턴스 확장에는 바로 맞지 않는다.
- 현재 `README`와 일부 과거 Oracle 문서는 레거시 참고 문서 성격이고, 실제 운영 기준은 홈 서버 문서를 우선으로 보면 된다.

## 10. 이번 전환에서 정리된 것

- Oracle 경로는 운영 기준에서 사실상 제외
- 홈 서버 `deploy-live`가 현재 유일한 배포 기준 경로
- GitHub Actions는 홈 서버를 향하도록 전환됨
- 배포 스크립트는 branch sync와 healthcheck 대기까지 보강됨

## 11. 다음에 손대면 좋은 순서

1. GitHub Actions 실패 시 로그를 빠르게 읽을 수 있게 운영 체크리스트 추가
2. `Deploy Production` 성공 후 자동 스모크 테스트 단계를 워크플로에 편입
3. 방 상태 외부화가 필요해질 때 Redis 도입 검토
4. 운영 문서를 기준으로 불필요한 Oracle 문서를 `legacy`로 분리
