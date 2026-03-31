# FactorRush 소켓 API 명세

이 문서는 현재 Next.js 클라이언트와 서버가 사용하는 Socket.IO 이벤트를 정리한 문서입니다.  
모든 요청은 ack 콜백을 사용하며, 응답 형식은 아래와 같습니다.

```ts
type SocketAck<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };
```

## 1. 서버로 보내는 이벤트

### `room:create`

방을 만들고, 요청한 플레이어를 호스트로 입장시킵니다.

요청:

```ts
interface CreateRoomRequest {
  playerName: string;
  settings?: Partial<LobbySettings>;
}
```

성공 응답:

```ts
interface JoinRoomResult {
  roomId: string;
  playerId: string;
}
```

비고:

- 현재 브라우저가 이미 다른 방에 연결된 상태면 실패합니다.

### `room:join`

기존 방에 참가하거나, 저장된 `playerId`를 이용해 재접속을 시도합니다.

요청:

```ts
interface JoinRoomRequest {
  roomId: string;
  playerName: string;
  reconnectPlayerId?: string;
}
```

성공 응답:

```ts
interface JoinRoomResult {
  roomId: string;
  playerId: string;
}
```

비고:

- `reconnectPlayerId`가 유효하고 해당 플레이어가 오프라인 상태면 재접속으로 처리됩니다.
- 아니면 새 플레이어로 입장합니다.

### `room:update-settings`

호스트가 로비 설정을 변경합니다.

요청:

```ts
interface UpdateSettingsRequest {
  roomId: string;
  settings: LobbySettings;
}
```

성공 응답:

```ts
null
```

비고:

- 로비 상태에서만 허용됩니다.
- 호스트만 호출할 수 있습니다.

### `game:start`

호스트가 게임을 시작합니다.

요청:

```ts
interface RoomActionRequest {
  roomId: string;
}
```

성공 응답:

```ts
null
```

비고:

- 점수와 라운드 수를 초기화하고 첫 라운드를 시작합니다.

### `round:submit-answer`

플레이어가 현재 라운드의 답안을 제출합니다.

요청:

```ts
interface SubmitAnswerRequest {
  roomId: string;
  answer: string;
}
```

성공 응답:

```ts
interface SubmitAnswerResult {
  isCorrect: boolean;
  normalizedAnswer: string;
}
```

비고:

- `isCorrect`가 `true`이면 서버가 점수 반영까지 끝낸 상태입니다.
- 오답이라도 ack는 성공일 수 있으며, 이 경우 `isCorrect`만 `false`입니다.

### `round:next`

호스트가 다음 라운드를 시작합니다.

요청:

```ts
interface RoomActionRequest {
  roomId: string;
}
```

성공 응답:

```ts
null
```

비고:

- 현재는 `round-ended` 상태에서만 허용됩니다.

### `room:reset`

호스트가 게임을 다시 로비 상태로 되돌립니다.

요청:

```ts
interface RoomActionRequest {
  roomId: string;
}
```

성공 응답:

```ts
null
```

## 2. 서버가 클라이언트에 푸시하는 이벤트

### `room:state`

서버가 현재 방 상태 전체를 브로드캐스트합니다.  
클라이언트 UI는 이 이벤트를 기준으로 화면을 다시 그립니다.

payload:

```ts
interface RoomSnapshot {
  roomId: string;
  invitePath: string;
  phase: "lobby" | "round-active" | "round-ended" | "finished";
  settings: LobbySettings;
  players: PlayerSummary[];
  round: RoundSnapshot | null;
  finalWinnerIds: string[];
  message: string;
}
```

## 3. 주요 타입 요약

### `LobbySettings`

```ts
interface LobbySettings {
  mode: "factor" | "binary";
  roundCount: number;
  roundTimeSec: number;
}
```

### `PlayerSummary`

```ts
interface PlayerSummary {
  id: string;
  name: string;
  score: number;
  isHost: boolean;
  connected: boolean;
  correctAnswers: number;
}
```

### `RoundSnapshot`

```ts
interface RoundSnapshot {
  roundNumber: number;
  mode: GameMode;
  prompt: string;
  helperText: string;
  startedAt: number;
  endsAt: number;
  revealedAnswer?: string;
  playerStatuses: PlayerRoundStatus[];
}
```

### `PlayerRoundStatus`

```ts
interface PlayerRoundStatus {
  playerId: string;
  hasSubmitted: boolean;
  isCorrect?: boolean;
  answer?: string;
  submittedAt?: number;
  pointsAwarded?: number;
  rank?: number;
}
```

## 4. 현재 API 설계 철학

- 명령은 ack 응답으로 즉시 성공/실패를 받는다.
- 화면 갱신은 `room:state` 단일 브로드캐스트에 최대한 모은다.
- 서버가 상태의 진실 공급원(source of truth)이다.
- 클라이언트는 가능한 한 서버 snapshot을 렌더링하는 역할에 집중한다.
- 현재 연결 구조는 `Next.js(:3000) -> Socket 서버(:3001)`의 분리 프로세스 방식이다.

## 5. 향후 확장 시 추천

규모가 커지면 다음처럼 이벤트를 더 세분화할 수 있습니다.

- `room:chat-message`
- `round:countdown`
- `round:locked-in`
- `game:finished`
- `host:transfer`

다만 현재 프로토타입 단계에서는 이벤트 수를 늘리기보다  
`room:state` 중심 설계를 유지하는 편이 단순하고 안정적입니다.
