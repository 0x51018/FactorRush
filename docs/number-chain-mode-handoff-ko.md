# Number Chain 모드 인수인계 문서

이 문서는 `codex/turn-based-number-chain` 브랜치에서 진행한 신규 게임 모드 작업을 다음 에이전트가 바로 이어받을 수 있도록 정리한 문서다.

## 1. 이번 작업의 목표

기존 동시 입력형 모드와 별개로, 한 사람씩 차례가 돌아가는 생존형 숫자 체인 모드를 추가했다.

핵심 의도:

- 이전 수의 마지막 자리 숫자로 시작하는 새 수를 제시
- 턴마다 소수 / 합성수 조건이 랜덤으로 주어짐
- 이미 나온 수는 재사용 불가
- `1` 금지
- `0`으로 끝나는 수 금지
- 한 자리 수 허용
- 실패 또는 시간 초과 시 감점 후 즉시 탈락
- 마지막 생존자 1명이 우승

## 2. 현재 구현 완료 범위

### 공통 규칙 / shared

파일:

- `packages/shared/src/index.ts`

반영 사항:

- `GameMode`에 `chain` 추가
- 체인 모드용 snapshot / challenge meta / failure code / room message key 추가
- 체인 턴 문제 생성기 추가
- 체인 제출 검증 로직 추가
- 체인 점수 계산 상수 및 함수 추가

점수 규칙:

- 성공 턴 기본 점수: `50`
- 초당 속도 보너스: `1`
- 탈락 패널티: `-35`

### 서버 상태 머신

파일:

- `apps/server/src/roomStore.ts`

반영 사항:

- 체인 모드 전용 상태 `numberChainState` 추가
- 게임 시작 시 seed 수 + 생존자 목록 + 현재 턴 플레이어 초기화
- `submitAnswer`에서 체인 모드 분기 처리
- 성공 시 체인 수 갱신 / 점수 지급 / 다음 턴 준비
- 실패 시 감점 / 탈락 / 제거 처리
- 시간 초과 시 자동 탈락 처리
- 플레이어 중도 이탈 시 현재 턴이면 다음 생존자로 즉시 넘김
- 생존자가 1명만 남으면 바로 결과 단계로 종료

### 웹 UI

파일:

- `apps/web/src/lib/game-copy.ts`
- `apps/web/src/components/game-shell.tsx`
- `apps/web/src/components/game-shell.module.css`

반영 사항:

- 랜딩에서 `Number Chain Mode` 선택 가능
- 로비 설정 팝업에 체인 모드 추가
- 체인 모드에서는 라운드 수 대신 "마지막 1명까지" 규칙 표시
- 인게임 challenge 패널에 현재 수 / 현재 차례 / 생존자 / 사용된 수 표시
- 현재 차례 플레이어만 입력 가능
- 내 차례가 아니면 waiting panel 노출
- 탈락 플레이어는 eliminated panel 노출
- 리더보드 정렬을 체인 모드에 맞게 조정
  - 생존자 우선
  - 이후 탈락 순서 기준
- 룰 요약 / 점수 공식 팝업에 체인 모드 설명 추가
- 체인 전용 실패 피드백 문구 추가
- 체인 관련 system chat 문구 추가

## 3. 테스트 / 검증

실행 완료:

```bash
npm install
npm run build
npm run smoke:dev
npx playwright test tests/e2e/room-flow.spec.ts
```

결과:

- 빌드 통과
- dev smoke 통과
- `room-flow` 전체 `17 passed`

추가:

- 체인 모드 e2e 추가
  - 호스트가 첫 턴 진행
  - 게스트가 다음 턴으로 전환됨
  - 게스트가 잘못된 수(`1`) 제출 후 탈락
  - 마지막 생존자 결과 화면 진입 검증
- dev smoke에 체인 시나리오 추가
  - 첫 턴 성공
  - 다음 턴 탈락
  - 최종 승자 확정

## 4. 이번 브랜치에서 같이 정리한 테스트 취약점

기존 테스트 중 아래 두 개가 현재 UI/랜덤 동작과 맞지 않아 같이 정리했다.

- spectator 진입 검증 문구가 대소문자에 과도하게 의존하던 문제
- binary preview 테스트가 랜덤 문제 방향을 고려하지 않고 고정 문자열을 기대하던 문제

둘 다 현재 UI 동작 기준으로 더 안정적인 검증으로 바꿨다.

## 5. 다음 에이전트가 보면 좋은 파일 순서

1. `packages/shared/src/index.ts`
2. `apps/server/src/roomStore.ts`
3. `apps/web/src/lib/game-copy.ts`
4. `apps/web/src/components/game-shell.tsx`
5. `tests/e2e/room-flow.spec.ts`

## 6. 남은 리스크 / 후속 검토 포인트

현재 기준으로 기능은 돌아가지만, 다음 에이전트가 이어서 확인하면 좋은 포인트는 아래다.

- 체인 모드 점수 설계가 실제 플레이 감각에 맞는지 밸런스 재검토
- 탈락 순서와 점수 중 무엇을 최종 순위 기준으로 더 강하게 둘지 UX 관점에서 재검토
- allow mid-match join이 체인 모드에서 정말 원하는 경험인지 플레이 테스트 필요
- 체인 모드 전용 결과/리더보드 시각 표현을 더 공격적으로 다듬을 여지 있음
- 모바일에서 체인 모드 문구 밀도는 아직 충분히 다듬을 수 있음

## 7. 현재 브랜치 목적

이 브랜치는 바로 merge 용이라기보다, 다음 작업자가 PR 위에서 체인 모드 디테일을 계속 다듬을 수 있게 만든 작업 베이스다.

즉, 현재 상태는:

- 기능적으로는 완성된 첫 버전
- 회귀 테스트 포함
- 다음 polish / UX tuning 작업이 가능한 상태
