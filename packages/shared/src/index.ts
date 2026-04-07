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
export const PLAYER_NAME_MAX_LENGTH = 15;
export const SCORE_BASE_POINTS_BY_RANK = [120, 90, 70, 55] as const;
export const SCORE_FALLBACK_POINTS = 40;
export const SCORE_SPEED_BONUS_PER_SECOND = 2;
export const GOLDEN_BELL_WINDOW_MS = 10_000;
export const GOLDEN_BELL_PENALTY_POINTS = 60;
export const MATCH_MAX_DURATION_MS = 60 * 60 * 1000;

export type GameMode = "factor" | "binary";
export type RoomPhase = "lobby" | "round-active" | "round-ended" | "finished";
export type ConversionBase = 2 | 10 | 16;
export type BaseConversionPair = "2-10" | "10-16" | "2-16";
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
  | "player-kicked"
  | "player-left";

export interface LobbySettings {
  mode: GameMode;
  roundCount: number;
  roundTimeSec: number;
  baseConversionPair: BaseConversionPair;
  binaryLivePreview: boolean;
  factorResolutionMode: FactorResolutionMode;
  factorPrimeAnswerMode: FactorPrimeAnswerMode;
  factorOrderedAnswer: boolean;
  factorSingleAttempt: boolean;
  factorGoldenBellSingleAttempt: boolean;
  factorSuddenDeath: boolean;
}

export interface MatchSettings {
  maxPlayers: number;
  allowMidMatchJoin: boolean;
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
  isMainTimerPaused?: boolean;
  mainTimerRemainingMs?: number;
  isSuddenDeath: boolean;
  answeringPlayerId?: string;
  lastAnsweringPlayerId?: string;
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
  matchSettings: MatchSettings;
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
  direction?: "decimal-to-binary" | "binary-to-decimal";
  sourceBase: ConversionBase;
  targetBase: ConversionBase;
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
  systemKey?:
    | "match-started"
    | "round-started"
    | "player-joined"
    | "player-correct"
    | "player-wrong"
    | "spectator-joined"
    | "player-kicked"
    | "player-left"
    | "spectator-left"
    | "host-transferred";
  answerText?: string;
  createdAt: number;
}

export interface CreateRoomRequest {
  playerName: string;
  settings?: Partial<LobbySettings>;
  matchSettings?: Partial<MatchSettings>;
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

export interface UpdateMatchSettingsRequest {
  roomId: string;
  matchSettings: MatchSettings;
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

export interface KickPlayerRequest {
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
  baseConversionPair: "2-10",
  binaryLivePreview: true,
  factorResolutionMode: "all-play",
  factorPrimeAnswerMode: "phrase",
  factorOrderedAnswer: false,
  factorSingleAttempt: false,
  factorGoldenBellSingleAttempt: false,
  factorSuddenDeath: false
};

export const DEFAULT_MATCH_SETTINGS: MatchSettings = {
  maxPlayers: 6,
  allowMidMatchJoin: false
};

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
  const normalized = input.normalize("NFKC");
  const withoutControls = normalized.replace(/[\p{C}]/gu, "");
  const collapsedWhitespace = withoutControls.replace(/\s+/g, " ").trim();
  const allowedCharactersOnly = [...collapsedWhitespace]
    .filter((character) => /[\p{L}\p{N} _-]/u.test(character))
    .join("");
  return allowedCharactersOnly.slice(0, PLAYER_NAME_MAX_LENGTH);
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
    baseConversionPair:
      input?.baseConversionPair === "10-16" || input?.baseConversionPair === "2-16"
        ? input.baseConversionPair
        : DEFAULT_LOBBY_SETTINGS.baseConversionPair,
    binaryLivePreview: input?.binaryLivePreview ?? DEFAULT_LOBBY_SETTINGS.binaryLivePreview,
    factorResolutionMode:
      input?.factorResolutionMode === "first-correct" || input?.factorResolutionMode === "golden-bell"
        ? input.factorResolutionMode
        : "all-play",
    factorPrimeAnswerMode: input?.factorPrimeAnswerMode === "number" ? "number" : "phrase",
    factorOrderedAnswer: Boolean(input?.factorOrderedAnswer),
    factorSingleAttempt: Boolean(input?.factorSingleAttempt),
    factorGoldenBellSingleAttempt: Boolean(input?.factorGoldenBellSingleAttempt),
    factorSuddenDeath: Boolean(input?.factorSuddenDeath)
  };
}

export function clampMatchSettings(input?: Partial<MatchSettings>): MatchSettings {
  return {
    maxPlayers: clampNumber(input?.maxPlayers ?? DEFAULT_MATCH_SETTINGS.maxPlayers, 2, MAX_PLAYERS_PER_ROOM),
    allowMidMatchJoin: Boolean(input?.allowMidMatchJoin)
  };
}

export function getModeLabel(mode: GameMode) {
  return mode === "factor" ? "Prime Factor Sprint" : "Base Conversion Mode";
}

export function getModeDescription(mode: GameMode) {
  return mode === "factor"
    ? "Break the target into prime factors faster than everyone else."
    : "Convert between base 2, 10, and 16 faster than everyone else.";
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
    return createBinaryChallenge(settings.baseConversionPair, randomValue);
  }

  return createFactorChallenge(settings, randomValue);
}

export function evaluateSubmission(challenge: Challenge, answer: string): SubmissionEvaluation {
  // 모드별로 입력 포맷이 다르기 때문에 정규화 후 비교한다.
  if (challenge.mode === "binary") {
    const expected = normalizeBaseConversionAnswer(challenge.meta as BinaryChallengeMeta, challenge.answer);
    const submitted = normalizeBaseConversionAnswer(challenge.meta as BinaryChallengeMeta, answer);

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
  const parsed = parseBaseValue(value, meta.targetBase);
  if (parsed === null) {
    return "";
  }

  return formatBaseValue(parsed, meta.sourceBase);
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
  const compositeNumber = randomInt(minValue, maxValue, randomValue);
  const primeFactors = factorizeNumber(compositeNumber);
  const isPrimeTarget = primeFactors.length === 1 && primeFactors[0] === compositeNumber;

  if (isPrimeTarget) {
    const primeAnswer =
      settings.factorPrimeAnswerMode === "number"
        ? String(compositeNumber)
        : FACTOR_PRIME_SHOUT;

    return {
      id: createId("factor", randomValue),
      mode: "factor",
      prompt: `Factorize ${compositeNumber} into prime factors.`,
      helperText:
        settings.factorPrimeAnswerMode === "number"
          ? "If the number itself is prime, enter the number only."
          : `If the number itself is prime, enter "${FACTOR_PRIME_SHOUT}".`,
      answer: primeAnswer,
      prettyAnswer: primeAnswer,
      meta: {
        compositeNumber,
        primeFactors,
        isPrimeTarget: true,
        primeAnswerMode: settings.factorPrimeAnswerMode,
        requiresOrderedAnswer: false
      }
    };
  }

  return {
    id: createId("factor", randomValue),
    mode: "factor",
    prompt: `Factorize ${compositeNumber} into prime factors.`,
    helperText: settings.factorOrderedAnswer
      ? "Keep the factors in the original decomposition order and separate them with spaces."
      : "Separate the factors with spaces. Example: 2 2 3 7.",
    answer: primeFactors.join(" "),
    prettyAnswer: formatPrimeFactorsPretty(primeFactors),
    meta: {
      compositeNumber,
      primeFactors,
      isPrimeTarget: false,
      primeAnswerMode: settings.factorPrimeAnswerMode,
      requiresOrderedAnswer: settings.factorOrderedAnswer
    }
  };
}

function createBinaryChallenge(basePair: BaseConversionPair, randomValue: () => number): Challenge {
  const [leftBase, rightBase] = parseBaseConversionPair(basePair);
  const swapDirection = randomValue() < 0.5;
  const sourceBase = swapDirection ? rightBase : leftBase;
  const targetBase = swapDirection ? leftBase : rightBase;
  const decimalValue = createBaseConversionValue(basePair, randomValue);
  const sourceValue = formatBaseValue(decimalValue, sourceBase);
  const targetValue = formatBaseValue(decimalValue, targetBase);

  return {
    id: createId("binary", randomValue),
    mode: "binary",
    prompt: `Convert ${sourceValue} from base ${sourceBase} to base ${targetBase}.`,
    helperText: getBaseHelperText(targetBase),
    answer: targetValue,
    prettyAnswer: targetValue,
    meta: {
      sourceBase,
      targetBase,
      sourceValue,
      targetValue
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

function normalizeBaseConversionAnswer(meta: BinaryChallengeMeta, value: string) {
  const parsed = parseBaseValue(value, meta.targetBase);
  return parsed === null ? "" : formatBaseValue(parsed, meta.targetBase);
}

function parseBaseConversionPair(pair: BaseConversionPair): [ConversionBase, ConversionBase] {
  if (pair === "10-16") {
    return [10, 16];
  }

  if (pair === "2-16") {
    return [2, 16];
  }

  return [2, 10];
}

function createBaseConversionValue(basePair: BaseConversionPair, randomValue: () => number) {
  if (basePair === "10-16") {
    return randomInt(16, 4095, randomValue);
  }

  if (basePair === "2-16") {
    return randomInt(16, 255, randomValue);
  }

  return randomInt(9, 255, randomValue);
}

function getBaseHelperText(base: ConversionBase) {
  if (base === 2) {
    return "Skip the 0b prefix. Example answer: 101011.";
  }

  if (base === 16) {
    return "Use hexadecimal digits without 0x. Example answer: 2F.";
  }

  return "Enter the base-10 number only.";
}

function formatBaseValue(value: number, base: ConversionBase) {
  if (base === 16) {
    return value.toString(16).toUpperCase();
  }

  return value.toString(base);
}

function parseBaseValue(value: string, base: ConversionBase) {
  const normalized = value.replace(/\s+/g, "").replace(/,/g, "").trim();
  if (!normalized) {
    return null;
  }

  if (base === 2) {
    const binary = normalized.replace(/^0b/i, "");
    if (!/^[01]+$/.test(binary)) {
      return null;
    }

    return parseInt(binary, 2);
  }

  if (base === 16) {
    const hexadecimal = normalized.replace(/^0x/i, "").toUpperCase();
    if (!/^[0-9A-F]+$/.test(hexadecimal)) {
      return null;
    }

    return parseInt(hexadecimal, 16);
  }

  const parsed = Number(normalized);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function randomInt(min: number, max: number, randomValue: () => number) {
  return Math.floor(randomValue() * (max - min + 1)) + min;
}

function factorizeNumber(value: number) {
  const primeFactors: number[] = [];
  let remainder = value;

  while (remainder % 2 === 0) {
    primeFactors.push(2);
    remainder /= 2;
  }

  for (let divisor = 3; divisor * divisor <= remainder; divisor += 2) {
    while (remainder % divisor === 0) {
      primeFactors.push(divisor);
      remainder /= divisor;
    }
  }

  if (remainder > 1) {
    primeFactors.push(remainder);
  }

  return primeFactors;
}

function toSuperscript(value: number) {
  return String(value)
    .split("")
    .map((digit) => SUPERSCRIPT_DIGITS[digit] ?? digit)
    .join("");
}
