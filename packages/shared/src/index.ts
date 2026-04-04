/**
 * shared 패키지는 서버와 클라이언트가 함께 사용하는 계약 계층이다.
 *
 * 포함 내용:
 * - 소켓 payload / ack / snapshot 타입
 * - 로비 설정과 라운드 상태 타입
 * - 문제 생성, 입력 정규화, 정답 판정, 점수 계산 유틸
 *
 * 이 파일을 기준으로 서버와 클라이언트가 같은 언어로 통신한다.
 * 현재는 단일 파일이지만, 이후 규모가 커지면
 * `types`, `rules`, `scoring`, `room` 등으로 나누기 좋은 구조다.
 */
export const ROOM_ID_LENGTH = 6;
export const ROOM_IDLE_GRACE_MS = 10 * 60 * 1000;
export const MAX_PLAYERS_PER_ROOM = 12;
export const FACTOR_PRIME_SHOUT = "야호 소수다";
export const CHAT_MESSAGE_MAX_LENGTH = 180;
export const SCORE_BASE_POINTS_BY_RANK = [120, 90, 70, 55] as const;
export const SCORE_FALLBACK_POINTS = 40;
export const SCORE_SPEED_BONUS_PER_SECOND = 2;
export const GOLDEN_BELL_WINDOW_MS = 10_000;
export const GOLDEN_BELL_PENALTY_POINTS = 60;
export const MATCH_MAX_DURATION_MS = 60 * 60 * 1000;

export type GameMode = "factor" | "binary";
export type RoomPhase = "lobby" | "round-active" | "round-ended" | "finished";
export type BinaryDirection = "decimal-to-binary" | "binary-to-decimal";
export type FactorPrimeAnswerMode = "phrase" | "number";
export type FactorResolutionMode = "all-play" | "first-correct" | "golden-bell";
export type SubmissionKind = "correct" | "wrong" | "chat";
export type RoomRole = "player" | "spectator";
export type RoomMessageKey =
  | "lobby-ready"
  | "settings-updated"
  | "settings-updated-reset-ready"
  | "round-live"
  | "golden-bell-open"
  | "golden-bell-claimed"
  | "golden-bell-wrong"
  | "golden-bell-timeout"
  | "sudden-death-open"
  | "first-correct"
  | "player-correct"
  | "all-correct"
  | "all-resolved"
  | "time-up"
  | "match-finished"
  | "match-finished-tie"
  | "match-cap-reached"
  | "reset-lobby"
  | "host-transferred"
  | "player-left";

export interface LobbySettings {
  mode: GameMode;
  roundCount: number;
  roundTimeSec: number;
  binaryDecimalToBinaryChance: number;
  binaryLivePreview: boolean;
  factorResolutionMode: FactorResolutionMode;
  factorPrimeAnswerMode: FactorPrimeAnswerMode;
  factorOrderedAnswer: boolean;
  factorSingleAttempt: boolean;
  factorSuddenDeath: boolean;
}

export interface PlayerSummary {
  id: string;
  name: string;
  score: number;
  isHost: boolean;
  connected: boolean;
  correctAnswers: number;
  isReady: boolean;
}

export interface SpectatorSummary {
  id: string;
  name: string;
  connected: boolean;
}

export interface PlayerRoundStatus {
  playerId: string;
  hasSubmitted: boolean;
  isCorrect?: boolean;
  answer?: string;
  submittedAt?: number;
  pointsAwarded?: number;
  scoreDelta?: number;
  rank?: number;
  attemptCount: number;
  lastSubmissionKind?: SubmissionKind;
  lastSubmissionText?: string;
  lastSubmittedAt?: number;
  isLockedOut?: boolean;
  isAnswering?: boolean;
}

export interface RoundSnapshot {
  roundNumber: number;
  mode: GameMode;
  prompt: string;
  helperText: string;
  challengeMeta: PrimeFactorChallengeMeta | BinaryChallengeMeta;
  startedAt: number;
  endsAt: number;
  hasRoundTimer: boolean;
  isSuddenDeath: boolean;
  answeringPlayerId?: string;
  answerWindowEndsAt?: number;
  transitionEndsAt?: number;
  revealedAnswer?: string;
  playerStatuses: PlayerRoundStatus[];
}

export interface RoomSnapshot {
  roomId: string;
  roomName: string;
  invitePath: string;
  phase: RoomPhase;
  settings: LobbySettings;
  players: PlayerSummary[];
  spectators: SpectatorSummary[];
  round: RoundSnapshot | null;
  completedRounds: number;
  finalWinnerIds: string[];
  chatFeed: ChatMessage[];
  matchStartedAt?: number;
  matchEndsAt?: number;
  totalMatchDurationMs: number;
  averageRoundDurationMs: number;
  autoResetAt?: number;
  message: string;
  messageKey: RoomMessageKey;
  messagePlayerName?: string | undefined;
}

export interface PrimeFactorChallengeMeta {
  compositeNumber: number;
  primeFactors: number[];
  isPrimeTarget: boolean;
  primeAnswerMode: FactorPrimeAnswerMode;
  requiresOrderedAnswer: boolean;
}

export interface BinaryChallengeMeta {
  direction: BinaryDirection;
  sourceValue: string;
  targetValue: string;
}

export interface Challenge {
  id: string;
  mode: GameMode;
  prompt: string;
  helperText: string;
  answer: string;
  prettyAnswer: string;
  meta: PrimeFactorChallengeMeta | BinaryChallengeMeta;
}

export interface SubmissionEvaluation {
  normalizedAnswer: string;
  normalizedExpectedAnswer: string;
  isCorrect: boolean;
  reason: SubmissionKind;
}

export interface ChatMessage {
  id: string;
  kind: "player" | "system";
  playerId?: string;
  playerName?: string;
  text: string;
  systemKey?: "match-started" | "player-correct" | "player-wrong";
  answerText?: string;
  createdAt: number;
}

export interface CreateRoomRequest {
  playerName: string;
  settings?: Partial<LobbySettings>;
}

export interface JoinRoomRequest {
  roomId: string;
  playerName: string;
  reconnectMemberId?: string;
  reconnectPlayerId?: string;
}

export interface UpdateSettingsRequest {
  roomId: string;
  settings: LobbySettings;
}

export interface RenameRoomRequest {
  roomId: string;
  roomName: string;
}

export interface RenamePlayerRequest {
  roomId: string;
  playerName: string;
}

export interface SetReadyRequest {
  roomId: string;
  isReady: boolean;
}

export interface RoomActionRequest {
  roomId: string;
}

export interface TransferHostRequest {
  roomId: string;
  playerId: string;
}

export interface SubmitAnswerRequest {
  roomId: string;
  answer: string;
}

export interface SendChatRequest {
  roomId: string;
  text: string;
}

export interface ClaimAnswerRequest {
  roomId: string;
}

export interface SubmitAnswerResult {
  isCorrect: boolean;
  normalizedAnswer: string;
  attemptCount?: number;
  isLockedOut?: boolean;
  wasChatLike?: boolean;
  scoreDelta?: number;
}

export interface JoinRoomResult {
  roomId: string;
  playerId: string;
  role: RoomRole;
}

export type SocketAck<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export const DEFAULT_LOBBY_SETTINGS: LobbySettings = {
  mode: "factor",
  roundCount: 15,
  roundTimeSec: 30,
  binaryDecimalToBinaryChance: 50,
  binaryLivePreview: true,
  factorResolutionMode: "all-play",
  factorPrimeAnswerMode: "phrase",
  factorOrderedAnswer: false,
  factorSingleAttempt: false,
  factorSuddenDeath: false
};

const FACTOR_PRIMES = [2, 3, 5, 7, 11, 13, 17, 19];
const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const SUPERSCRIPT_DIGITS: Record<string, string> = {
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹"
};

export function sanitizePlayerName(input: string) {
  const trimmed = input.replace(/\s+/g, " ").trim();
  return trimmed.slice(0, 18);
}

export function sanitizeRoomId(input: string) {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, ROOM_ID_LENGTH);
}

export function sanitizeChatMessage(input: string) {
  return input.replace(/\s+/g, " ").trim().slice(0, CHAT_MESSAGE_MAX_LENGTH);
}

export function clampSettings(input?: Partial<LobbySettings>): LobbySettings {
  return {
    mode: input?.mode === "binary" ? "binary" : "factor",
    roundCount: clampNumber(input?.roundCount ?? DEFAULT_LOBBY_SETTINGS.roundCount, 3, 50),
    roundTimeSec: clampNumber(input?.roundTimeSec ?? DEFAULT_LOBBY_SETTINGS.roundTimeSec, 15, 90),
    binaryDecimalToBinaryChance: clampNumber(
      input?.binaryDecimalToBinaryChance ?? DEFAULT_LOBBY_SETTINGS.binaryDecimalToBinaryChance,
      0,
      100
    ),
    binaryLivePreview: input?.binaryLivePreview ?? DEFAULT_LOBBY_SETTINGS.binaryLivePreview,
    factorResolutionMode:
      input?.factorResolutionMode === "first-correct" || input?.factorResolutionMode === "golden-bell"
        ? input.factorResolutionMode
        : "all-play",
    factorPrimeAnswerMode: input?.factorPrimeAnswerMode === "number" ? "number" : "phrase",
    factorOrderedAnswer: Boolean(input?.factorOrderedAnswer),
    factorSingleAttempt: Boolean(input?.factorSingleAttempt),
    factorSuddenDeath: Boolean(input?.factorSuddenDeath)
  };
}

export function getModeLabel(mode: GameMode) {
  return mode === "factor" ? "Prime Factor Sprint" : "Decimal / Binary Blitz";
}

export function getModeDescription(mode: GameMode) {
  return mode === "factor"
    ? "Break the target into prime factors faster than everyone else."
    : "Swap between decimal and binary before the room does.";
}

export function createInvitePath(roomId: string) {
  return `/room/${sanitizeRoomId(roomId)}`;
}

export function createRoomCode(randomValue = Math.random) {
  return Array.from({ length: ROOM_ID_LENGTH }, () =>
    ROOM_ALPHABET[Math.floor(randomValue() * ROOM_ALPHABET.length)]
  ).join("");
}

export function createId(prefix: string, randomValue = Math.random) {
  const token = Math.floor(randomValue() * 36 ** 8)
    .toString(36)
    .padStart(8, "0");
  return `${prefix}_${token}`;
}

export function generateChallenge(input: GameMode | LobbySettings, randomValue = Math.random): Challenge {
  const settings =
    typeof input === "string" ? { ...DEFAULT_LOBBY_SETTINGS, mode: input } : clampSettings(input);

  if (settings.mode === "binary") {
    return createBinaryChallenge(settings.binaryDecimalToBinaryChance, randomValue);
  }

  return createFactorChallenge(settings, randomValue);
}

export function evaluateSubmission(challenge: Challenge, answer: string): SubmissionEvaluation {
  // 모드별로 입력 포맷이 다르기 때문에 정규화 후 비교한다.
  if (challenge.mode === "binary") {
    const expected = normalizeBinaryModeAnswer(challenge.meta as BinaryChallengeMeta, challenge.answer);
    const submitted = normalizeBinaryModeAnswer(challenge.meta as BinaryChallengeMeta, answer);

    return {
      normalizedAnswer: submitted,
      normalizedExpectedAnswer: expected,
      isCorrect: submitted.length > 0 && submitted === expected,
      reason: submitted.length === 0 ? "chat" : submitted === expected ? "correct" : "wrong"
    };
  }

  const factorMeta = challenge.meta as PrimeFactorChallengeMeta;
  const expected = factorMeta.isPrimeTarget
    ? normalizePrimeFactorSpecialAnswer(
        factorMeta.compositeNumber,
        factorMeta.primeAnswerMode === "number"
          ? String(factorMeta.compositeNumber)
          : FACTOR_PRIME_SHOUT,
        factorMeta.primeAnswerMode
      )
    : normalizeFactorAnswer(factorMeta.primeFactors.join(" "), factorMeta.requiresOrderedAnswer);
  const submitted = factorMeta.isPrimeTarget
    ? normalizePrimeFactorSpecialAnswer(
        factorMeta.compositeNumber,
        answer,
        factorMeta.primeAnswerMode
      )
    : normalizeFactorAnswer(answer, factorMeta.requiresOrderedAnswer);

  return {
    normalizedAnswer: submitted,
    normalizedExpectedAnswer: expected,
    isCorrect: submitted.length > 0 && submitted === expected,
    reason: submitted.length === 0 ? "chat" : submitted === expected ? "correct" : "wrong"
  };
}

export function calculatePoints(rank: number, endsAt: number, submittedAt: number) {
  // 현재 프로토타입 규칙:
  // - 먼저 맞춘 사람이 높은 기본 점수를 얻고
  // - 남은 시간에 비례한 보너스를 추가로 얻는다.
  const remainingMs = Math.max(0, endsAt - submittedAt);
  const speedBonus = Math.round(remainingMs / 1000) * SCORE_SPEED_BONUS_PER_SECOND;
  const basePoints = SCORE_BASE_POINTS_BY_RANK[rank - 1] ?? SCORE_FALLBACK_POINTS;
  return basePoints + speedBonus;
}

export function getBinaryPreviewValue(meta: BinaryChallengeMeta, value: string) {
  if (meta.direction === "decimal-to-binary") {
    const normalized = value.replace(/^0b/i, "").replace(/\s+/g, "");
    if (!/^[01]+$/.test(normalized)) {
      return "";
    }

    return String(parseInt(normalized, 2));
  }

  const parsed = Number(value.replace(/,/g, "").trim());
  if (!Number.isInteger(parsed) || parsed < 0) {
    return "";
  }

  return parsed.toString(2);
}

export function sortPlayersByScore<T extends Pick<PlayerSummary, "score" | "correctAnswers" | "name">>(
  players: T[]
) {
  return [...players].sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    if (right.correctAnswers !== left.correctAnswers) {
      return right.correctAnswers - left.correctAnswers;
    }

    return left.name.localeCompare(right.name);
  });
}

export function formatPrimeFactorsPretty(primeFactors: number[]) {
  const groupedFactors = new Map<number, number>();

  for (const value of [...primeFactors].sort((left, right) => left - right)) {
    groupedFactors.set(value, (groupedFactors.get(value) ?? 0) + 1);
  }

  return [...groupedFactors.entries()]
    .map(([value, count]) => (count === 1 ? String(value) : `${value}${toSuperscript(count)}`))
    .join(" × ");
}

function createFactorChallenge(settings: LobbySettings, randomValue: () => number): Challenge {
  const targetDigits = randomValue() < 0.75 ? 4 : 3;
  const [minValue, maxValue] = targetDigits === 4 ? [1000, 9999] : [100, 999];

  if (randomValue() < 0.18) {
    const primeNumber = createPrimeTarget(minValue, maxValue, randomValue);
    const primeAnswer =
      settings.factorPrimeAnswerMode === "number"
        ? String(primeNumber)
        : FACTOR_PRIME_SHOUT;

    return {
      id: createId("factor", randomValue),
      mode: "factor",
      prompt: `Factorize ${primeNumber} into prime factors.`,
      helperText:
        settings.factorPrimeAnswerMode === "number"
          ? "If the number itself is prime, enter the number only."
          : `If the number itself is prime, enter "${FACTOR_PRIME_SHOUT}".`,
      answer: primeAnswer,
      prettyAnswer: primeAnswer,
      meta: {
        compositeNumber: primeNumber,
        primeFactors: [primeNumber],
        isPrimeTarget: true,
        primeAnswerMode: settings.factorPrimeAnswerMode,
        requiresOrderedAnswer: false
      }
    };
  }

  for (let attempt = 0; attempt < 400; attempt += 1) {
    const factorCount = targetDigits === 4 ? randomInt(4, 6, randomValue) : randomInt(3, 5, randomValue);
    const primeFactors: number[] = [];
    let compositeNumber = 1;

    for (let factorIndex = 0; factorIndex < factorCount; factorIndex += 1) {
      const prime = pickRandomPrime(randomValue);
      primeFactors.push(prime);
      compositeNumber *= prime;

      if (compositeNumber > maxValue) {
        break;
      }
    }

    if (compositeNumber < minValue || compositeNumber > maxValue) {
      continue;
    }

    primeFactors.sort((left, right) => left - right);
    const prettyAnswer = formatPrimeFactorsPretty(primeFactors);

    return {
      id: createId("factor", randomValue),
      mode: "factor",
      prompt: `Factorize ${compositeNumber} into prime factors.`,
      helperText: settings.factorOrderedAnswer
        ? "Keep the factors in the original decomposition order and separate them with spaces."
        : "Separate the factors with spaces. Example: 2 2 3 7.",
      answer: primeFactors.join(" "),
      prettyAnswer,
      meta: {
        compositeNumber,
        primeFactors,
        isPrimeTarget: false,
        primeAnswerMode: settings.factorPrimeAnswerMode,
        requiresOrderedAnswer: settings.factorOrderedAnswer
      }
    };
  }

  const fallbackFactors = [7, 11, 13];
  return {
    id: createId("factor", randomValue),
    mode: "factor",
    prompt: "Factorize 1001 into prime factors.",
    helperText: settings.factorOrderedAnswer
      ? "Keep the factors in order and separate them with spaces. Example: 7 11 13."
      : "Separate the factors with spaces. Example: 7 11 13.",
    answer: fallbackFactors.join(" "),
    prettyAnswer: formatPrimeFactorsPretty(fallbackFactors),
    meta: {
      compositeNumber: 1001,
      primeFactors: fallbackFactors,
      isPrimeTarget: false,
      primeAnswerMode: settings.factorPrimeAnswerMode,
      requiresOrderedAnswer: settings.factorOrderedAnswer
    }
  };
}

function createBinaryChallenge(decimalToBinaryChance: number, randomValue: () => number): Challenge {
  const direction: BinaryDirection =
    randomValue() * 100 < decimalToBinaryChance ? "decimal-to-binary" : "binary-to-decimal";
  const decimalValue = randomInt(9, 255, randomValue);

  if (direction === "decimal-to-binary") {
    const binaryValue = decimalValue.toString(2);

    return {
      id: createId("binary", randomValue),
      mode: "binary",
      prompt: `Convert ${decimalValue} to binary.`,
      helperText: "Skip the 0b prefix. Example answer: 101011.",
      answer: binaryValue,
      prettyAnswer: binaryValue,
      meta: {
        direction,
        sourceValue: String(decimalValue),
        targetValue: binaryValue
      }
    };
  }

  const sourceValue = decimalValue.toString(2);

  return {
    id: createId("binary", randomValue),
    mode: "binary",
    prompt: `Convert ${sourceValue} to decimal.`,
    helperText: "Enter the base-10 number only.",
    answer: String(decimalValue),
    prettyAnswer: String(decimalValue),
    meta: {
      direction,
      sourceValue,
      targetValue: String(decimalValue)
    }
  };
}

function normalizeFactorAnswer(value: string, keepOrder: boolean) {
  // 기본 입력 형식은 공백 구분이지만, 기존 구분자도 최대한 관대하게 허용한다.
  const factors = value
    .toLowerCase()
    .replace(/[x×*]/g, " ")
    .split(/[\s,]+/)
    .map((piece) => Number(piece))
    .filter((piece) => Number.isInteger(piece) && piece > 1);

  return (keepOrder ? factors : factors.sort((left, right) => left - right)).join("x");
}

function normalizePrimeFactorSpecialAnswer(
  compositeNumber: number,
  value: string,
  primeAnswerMode: FactorPrimeAnswerMode
) {
  if (primeAnswerMode === "number") {
    const parsed = Number(value.replace(/,/g, "").trim());
    return Number.isInteger(parsed) && parsed > 1 ? String(parsed) : "";
  }

  return value
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "")
    .replace(/[!?,.~"'`-]+/g, "")
    .replace(/야호소수다/g, FACTOR_PRIME_SHOUT.replace(/\s+/g, ""));
}

function normalizeBinaryModeAnswer(meta: BinaryChallengeMeta, value: string) {
  if (meta.direction === "decimal-to-binary") {
    // 2진수 답안은 공백과 0b 접두사를 제거한 뒤 문자열 비교한다.
    return value.replace(/^0b/i, "").replace(/\s+/g, "");
  }

  // 10진수 답안은 숫자로 파싱 후 문자열로 다시 맞춰 비교한다.
  const parsed = Number(value.replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? String(parsed) : "";
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function randomInt(min: number, max: number, randomValue: () => number) {
  return Math.floor(randomValue() * (max - min + 1)) + min;
}

function pickRandomPrime(randomValue: () => number) {
  return FACTOR_PRIMES[randomInt(0, FACTOR_PRIMES.length - 1, randomValue)] ?? 2;
}

function createPrimeTarget(minValue: number, maxValue: number, randomValue: () => number) {
  for (let attempt = 0; attempt < 600; attempt += 1) {
    let candidate = randomInt(minValue, maxValue, randomValue);
    if (candidate % 2 === 0) {
      candidate += 1;
    }
    if (candidate > maxValue) {
      candidate -= 2;
    }
    if (candidate >= minValue && isPrimeNumber(candidate)) {
      return candidate;
    }
  }

  return minValue >= 1000 ? 1009 : 997;
}

function isPrimeNumber(value: number) {
  if (value < 2) {
    return false;
  }

  if (value === 2) {
    return true;
  }

  if (value % 2 === 0) {
    return false;
  }

  for (let divisor = 3; divisor * divisor <= value; divisor += 2) {
    if (value % divisor === 0) {
      return false;
    }
  }

  return true;
}

function toSuperscript(value: number) {
  return String(value)
    .split("")
    .map((digit) => SUPERSCRIPT_DIGITS[digit] ?? digit)
    .join("");
}
