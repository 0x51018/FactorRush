# 반응형 레이아웃 인수인계 문서

이 문서는 `codex/responsive-layout` 브랜치에서 진행한 반응형 레이아웃 정리 작업을
`main` 병합 전후로 빠르게 이해하고 이어갈 수 있도록 정리한 문서입니다.

## 1. 이번 패스의 목표

- 데스크톱 기본 배율부터 `125%` 근처까지는 가능한 한 무스크롤에 가깝게 유지한다.
- `150%`급 이상의 extreme viewport에서는 무리하게 압축하지 않고 자연스럽게 스크롤로 degrade한다.
- 게임 진행 화면에서는 플레이필드를 먼저 보호하고, 규칙/채팅/참가자/리더보드 같은 보조 패널을 먼저 접거나 재배치한다.
- 모바일은 데스크톱 축소판이 아니라 별도 세로 레이아웃으로 취급한다.

## 2. 핵심 설계 원칙

### density 축소 + 패널 접기

- 전역 `transform: scale()` 대신, 화면 크기에 따라 `density`를 `normal / compact / tight`로 나눈다.
- `padding`, `gap`, 카드 최소폭, 패널 폭, 버튼 높이, 일부 텍스트 크기를 함께 줄여서
  "글씨는 그대로인데 레이아웃만 찌그러지는 느낌"을 줄였다.

### extreme 구간 scroll degrade

- `100% ~ 125%` 근처에서는 최대한 레이아웃 재배치와 density 축소로 버틴다.
- `150%`급 또는 매우 낮은 viewport에서는 `fit`을 포기하고 `scroll` 모드로 전환한다.
- 랜딩, 로비, 결과 화면은 문서 전체 스크롤을 허용한다.
- 게임 진행/공개 화면은 가능한 한 `fit`을 유지하되, 진짜 극단적인 구간에서만 `scroll`로 내려오게 했다.

### 모바일 우선 예외 처리

- 모바일에서는 상단 정보 알약을 줄이고, 언어/테마 전환은 브랜드 줄에 붙여 세로 공간을 절약한다.
- 모바일 로비에서는 규칙 카드를 기본적으로 접어서 채팅 높이를 우선 확보한다.
- 모바일 로비의 빈 플레이어 슬롯은 전부 렌더링하지 않고, 실제 플레이어 수 + 최소 여유 좌석 수준으로 줄였다.

## 3. 주요 변경 내용

### 랜딩 화면

- 생성/참가 폼과 hero 영역의 비중을 재조정했다.
- extreme 구간에서는 hero 장식을 줄이고, CTA가 더 빨리 보이도록 압축했다.
- 모바일에서는 `socket live`, `invite link · realtime judge` 알약을 숨기고,
  언어/테마 전환을 제목 오른쪽으로 이동했다.
- 모바일 hero teaser는 더 짧은 카드로 줄여서 폼 아래 길게 남지 않게 했다.

### 로비 화면

- 중앙 로스터 보드가 남는 폭을 더 잘 채우도록 카드 최소폭과 그리드 기준을 조정했다.
- 좁은 데스크톱에서는 우측 패널이 메인 보드를 압박하지 않도록 반응형 폭 조정을 넣었다.
- 로비 규칙 패널은 높이 압박이 생기면 더 빨리 접히도록 바꿨고,
  모바일에서는 기본적으로 접힌 상태를 사용한다.
- 채팅 카드가 납작해지지 않도록 로비 채팅 최소 높이를 보강했다.
- 초대 링크 카드는 긴 URL 때문에 높이가 흔들리지 않도록 한 줄 `ellipsis` 형태로 정리했다.

### 게임 진행 화면

- 참가자 목록은 인원 수와 viewport에 따라 `full / compact / drawer`로 전환된다.
- 좁은 데스크톱 `round-active` 화면에서 왼쪽 stage 카드가 과하게 세로 공간을 먹지 않도록
  콘텐츠 높이 기준으로 정렬을 바꿨다.
- extreme 구간에서는 인게임도 필요한 경우 `scroll` 모드로 내려오게 해서,
  억지로 한 화면에 우겨넣는 대신 자연스럽게 아래로 이어지도록 했다.

### 결과 / 공개 화면

- narrow / extreme 구간에서 podium, 표, 요약 카드가 너무 일찍 깨지지 않도록 재배치했다.
- extreme 구간에서는 결과 오버레이도 스크롤 degrade를 허용하도록 정리했다.

## 4. 핵심 변경 파일

- `apps/web/src/app/globals.css`
- `apps/web/src/components/game-shell.tsx`
- `apps/web/src/components/game-shell.module.css`
- `apps/web/src/lib/game-copy.ts`
- `tests/e2e/room-flow.spec.ts`

## 5. 검증 방식

이번 브랜치에서는 아래 검증을 반복적으로 사용했다.

```bash
npx tsc -p apps/web/tsconfig.json --noEmit
node .codex-artifacts/responsive-audit.mjs
npx playwright test tests/e2e/room-flow.spec.ts --grep "landing keeps both forms inside a 720p viewport|invite flow, ready gate, factor options, and final results all work together"
```

검증 포인트:

- responsive audit: `52개` 화면 캡처
- 기준 화면: landing / lobby / round-active / results 등
- 조합: desktop, narrow, extreme, mobile / ko, en / light, dark
- 최신 기준: `horizontal overflow 0`, `vertical overflow 0`

## 6. 병합 전 권장 확인

- 데스크톱 `100% / 125% / 150%`
- 한국어 / 영어
- 라이트 / 다크
- 로비 `2명`, `6명`
- 인게임 `1명`, 다인 플레이

위 항목은 이미 브라우저와 스크린샷 기준으로 여러 차례 확인했지만,
최종 병합 직전 한 번 더 눈으로 보는 것이 가장 안전합니다.

## 7. 병합 후 follow-up 권장 항목

모바일 실기기 검증은 `main` 반영 후가 더 현실적이므로, 아래 항목은 후속 과제로 남기는 것을 권장합니다.

1. iPhone Safari / Android Chrome 실기기에서 safe area 확인
2. 모바일 키보드 오픈 시 채팅 입력창/버튼 가림 여부 확인
3. 모바일 로비에서 규칙 drawer, 점수 공식, 채팅 입력 흐름 수동 확인
4. 모바일 인게임에서 상단 메타 칩과 채팅/참가자 패널의 실제 터치감 확인

## 8. 이번 브랜치의 해석

이번 작업은 "모든 화면을 끝까지 무스크롤로 고정"하는 시도라기보다,
아래 방향으로 제품을 정리한 작업으로 보는 편이 맞습니다.

- 보통 구간: 압축 + 재배치
- 극단 구간: 자연스러운 scroll degrade
- 모바일: 정보 우선순위 재정리

즉, 반응형 안정화의 큰 구조는 이번 브랜치에서 상당 부분 정리됐고,
이후에는 실기기 검증과 미세 폴리시 중심으로 이어가는 편이 좋습니다.
