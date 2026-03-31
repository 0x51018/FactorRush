import {
  FACTOR_PRIME_SHOUT,
  type BinaryChallengeMeta,
  type FactorResolutionMode,
  type GameMode,
  type PrimeFactorChallengeMeta,
  type RoomMessageKey,
  type RoomPhase,
  type RoundSnapshot
} from "@factorrush/shared";

export type Locale = "ko" | "en";

const COPY = {
  ko: {
    mastheadKicker: "숫자 게임",
    connectionLive: "실시간 연결됨",
    connectionReconnecting: "재연결 중",
    stackSummary: "링크 초대 · 실시간 판정",
    languageLabel: "언어",
    themeLabel: "테마",
    themeLight: "라이트",
    themeDark: "다크",
    heroKicker: "링크만 공유하고 바로 시작",
    heroTitleTop: "숫자 레이스",
    heroTitleBottom: "즉시 시작",
    heroDescription: "방을 열고 링크를 보내면 바로 함께 플레이할 수 있습니다.",
    hostSignal: "새 방",
    createRoomTitle: "방 열기",
    joinFeed: "참가",
    joinRoomTitle: "방 입장",
    nicknameLabel: "닉네임",
    startModeLabel: "시작 모드",
    roomCodeLabel: "방 코드",
    createRoomButton: "초대용 방 열기",
    creatingRoomButton: "방 생성 중...",
    joinRoomButton: "방 참가",
    joiningRoomButton: "입장 중...",
    joinViaLinkButton: "이 링크로 입장",
    storyOne: "문제 생성과 정답 판정은 서버가 담당합니다.",
    storyTwo: "저장된 세션으로 재접속을 시도할 수 있습니다.",
    storyThree: "현재는 프로토타입 규칙으로 동작합니다.",
    roomBroadcast: "방",
    currentPhase: "현재 단계",
    currentPhaseLobby: "로비 조정",
    currentPhaseActive: "라운드",
    currentPhaseReview: "라운드 결과",
    currentPhaseFinished: "최종 결과",
    playersUnit: "명",
    gameModeField: "게임 모드",
    roundCountField: "라운드 수",
    timeLimitField: "제한 시간",
    binaryRatioField: "10진수 -> 2진수 비율",
    binaryRatioHint: "0%는 항상 2진수 -> 10진수, 100%는 항상 10진수 -> 2진수입니다.",
    factorResolutionField: "라운드 진행 방식",
    factorResolutionAllPlay: "기본 모드",
    factorResolutionFirstCorrect: "선착순 모드",
    factorResolutionGoldenBell: "골든벨 모드",
    factorResolutionHint: "기본은 모두 입력, 선착순은 첫 정답으로 종료, 골든벨은 먼저 외친 사람만 답합니다.",
    factorPrimeAnswerField: "소수 문제 정답",
    factorPrimeAnswerPhrase: `"${FACTOR_PRIME_SHOUT}" 입력`,
    factorPrimeAnswerNumber: "수 하나만 입력",
    factorPrimeAnswerHint: "소수 문제가 나왔을 때 어떤 답안을 인정할지 정합니다.",
    roundsUnit: "라운드",
    secondsUnit: "초",
    lobbyRosterLabel: "참가 명단",
    lobbyRosterTitle: "참가자",
    lobbyRosterBody: "누가 들어와 있는지 중앙에서 바로 보입니다.",
    lobbySettingsLabel: "게임 설정",
    lobbySettingsTitle: "매치 규칙 조정",
    lobbySettingsBody: "모드와 시간은 팝업에서 조정하고, 로비 중앙은 참가자 확인에 집중합니다.",
    lobbyRuleCardLabel: "현재 룰",
    lobbyRuleCardTitle: "매치 브리프",
    lobbyStartHint: "모두 준비되면 시작하세요. 설정은 언제든 다시 열 수 있습니다.",
    openSettings: "설정 열기",
    closePanel: "닫기",
    transferHost: "방장 위임",
    liveBoardLabel: "실시간 레이스",
    liveBoardTitle: "진행 보드",
    liveBoardBody: "점수와 제출 상태를 한눈에 확인할 수 있습니다.",
    scoreLabel: "점수",
    progressLabel: "진행",
    submittedLabel: "제출 완료",
    pendingLabel: "대기 중",
    resultsLabel: "경기 결과",
    resultsTitle: "이번 판 결산",
    resultsBody: "로비로 돌아가기 전에 최종 순위와 점수 차이를 확인하세요.",
    resultsWinnerLabel: "최종 우승",
    resultsStandingsLabel: "최종 순위",
    resultsTableRank: "순위",
    resultsTablePlayer: "플레이어",
    resultsTableScore: "점수",
    resultsTableCorrect: "정답 수",
    resultsResetHint: "누구나 바로 로비로 돌아갈 수 있고, 잠시 뒤 자동으로 함께 이동합니다.",
    resultsAutoResetLabel: "잠시 뒤 자동으로 로비로 이동합니다.",
    resultsReturnNow: "로비로 돌아가기",
    championLabel: "우승",
    runnerUpLabel: "준우승",
    thirdPlaceLabel: "3위",
    enterFocusHint: "엔터 키를 누르면 바로 입력 칸으로 이동합니다.",
    settingsApply: "설정 반영",
    settingsSaving: "저장 중...",
    startMatch: "매치 시작",
    startingMatch: "시작 중...",
    waitingHostTitle: "호스트가 규칙을 확정하는 중입니다.",
    waitingHostBody: "로비에서는 방장만 모드와 라운드 시간을 바꿀 수 있습니다.",
    challengeLabel: "문제",
    answerInputLabel: "답안 입력",
    answerHintFactorInline: "(수들은 공백으로 구분하세요. 예: 2 2 3 7)",
    answerHintFactorPrimePhrase: `(공백 구분 · 소수면 "${FACTOR_PRIME_SHOUT}")`,
    answerHintFactorPrimeNumber: "(공백 구분 · 소수면 수 하나만 입력)",
    answerRevealLabel: "정답 공개",
    answerPlaceholderFactor: "2 2 3 7",
    answerPlaceholderBinary: "101011",
    submitAnswer: "정답 제출",
    claimAnswerTurn: "정답 외치기",
    claimingAnswerTurn: "외치는 중...",
    goldenBellWaiting: "다른 플레이어의 답변 차례입니다.",
    goldenBellAnswering: "지금 답변권을 가진 상태입니다.",
    goldenBellWindowLabel: "답변권 제한 시간",
    checkingAnswer: "검사 중...",
    answerLocked: "정답 잠김",
    nextRound: "다음 라운드",
    nextRoundLoading: "이동 중...",
    resetLobby: "로비로 되돌리기",
    resettingLobby: "초기화 중...",
    leaderboardLabel: "리더보드",
    leaderboardTitle: "현재 순위",
    inviteLineLabel: "초대 링크",
    shareUrlLabel: "공유 URL",
    copyLink: "링크 복사",
    systemNotesLabel: "현재 프로토타입",
    systemNotesTitle: "시스템 메모",
    systemNoteOne: "문제 생성과 정답 판정은 모두 서버 기준입니다.",
    systemNoteTwo: "세션 정보는 브라우저 로컬 스토리지에 저장됩니다.",
    systemNoteThree: "방 상태는 서버 메모리에만 존재하며 DB는 없습니다.",
    inviteCopied: "초대 링크를 복사했습니다.",
    reconnectSuccess: "이전 세션에 다시 연결했습니다.",
    reconnectExpired: "저장된 세션이 만료되어 다시 입장해야 합니다.",
    enterNicknameFirst: "닉네임을 먼저 입력해 주세요.",
    enterValidRoomCode: "유효한 방 코드를 입력해 주세요.",
    settingsUpdated: "룰이 변경되었습니다.",
    firstRoundStarted: "첫 라운드를 시작했습니다.",
    movedToNextRound: "다음 라운드로 이동했습니다.",
    resetToLobbyDone: "로비 상태로 되돌렸습니다.",
    answerAccepted: "정답을 맞췄습니다!",
    answerWrong: "아직 정답은 아닙니다. 한 번 더 확인해 보세요.",
    answerParseFailed: "입력 형식을 해석하지 못했습니다.",
    hostSuffix: "방장",
    offlineSuffix: "오프라인",
    correctCountSuffix: "정답",
    noGuestsLabel: "게스트 없음",
    rankLocked: "잠김",
    rankLive: "풀이 중",
    rankMissed: "실패"
  },
  en: {
    mastheadKicker: "Number Game",
    connectionLive: "socket live",
    connectionReconnecting: "reconnecting",
    stackSummary: "invite link · realtime judge",
    languageLabel: "Language",
    themeLabel: "Theme",
    themeLight: "Light",
    themeDark: "Dark",
    heroKicker: "Share a link and start immediately",
    heroTitleTop: "Number race",
    heroTitleBottom: "ready now",
    heroDescription: "Open a room, send the link, and play right away.",
    hostSignal: "Host",
    createRoomTitle: "Open room",
    joinFeed: "Join",
    joinRoomTitle: "Enter room",
    nicknameLabel: "Nickname",
    startModeLabel: "Starting mode",
    roomCodeLabel: "Room code",
    createRoomButton: "Open invite room",
    creatingRoomButton: "Creating room...",
    joinRoomButton: "Join room",
    joiningRoomButton: "Joining...",
    joinViaLinkButton: "Join this link",
    storyOne: "The server owns challenge generation and answer validation.",
    storyTwo: "Stored session data can be used to reconnect.",
    storyThree: "The current rules are still prototype-level.",
    roomBroadcast: "Room",
    currentPhase: "Current Phase",
    currentPhaseLobby: "Lobby Calibration",
    currentPhaseActive: "Round",
    currentPhaseReview: "Round Review",
    currentPhaseFinished: "Final Score",
    playersUnit: "players",
    gameModeField: "Game mode",
    roundCountField: "Round count",
    timeLimitField: "Time limit",
    binaryRatioField: "Decimal -> binary ratio",
    binaryRatioHint: "0% means binary -> decimal only, and 100% means decimal -> binary only.",
    factorResolutionField: "Round flow",
    factorResolutionAllPlay: "All-play mode",
    factorResolutionFirstCorrect: "First-correct mode",
    factorResolutionGoldenBell: "Golden bell mode",
    factorResolutionHint: "All-play keeps all inputs open, first-correct ends on the first solve, and golden bell gives one player the answer turn.",
    factorPrimeAnswerField: "Prime target answer",
    factorPrimeAnswerPhrase: `Enter "${FACTOR_PRIME_SHOUT}"`,
    factorPrimeAnswerNumber: "Enter the number only",
    factorPrimeAnswerHint: "Choose how prime-number prompts should be answered.",
    roundsUnit: "rounds",
    secondsUnit: "seconds",
    lobbyRosterLabel: "Roster",
    lobbyRosterTitle: "Players",
    lobbyRosterBody: "See who is in the room right from the center panel.",
    lobbySettingsLabel: "Game settings",
    lobbySettingsTitle: "Tune the match rules",
    lobbySettingsBody: "Adjust the rules in a popup so the lobby center can stay focused on players.",
    lobbyRuleCardLabel: "Current rules",
    lobbyRuleCardTitle: "Match brief",
    lobbyStartHint: "Start as soon as everyone is ready. You can reopen the settings at any time.",
    openSettings: "Open settings",
    closePanel: "Close",
    transferHost: "Transfer host",
    liveBoardLabel: "Live race",
    liveBoardTitle: "Progress board",
    liveBoardBody: "See score and submission state at a glance.",
    scoreLabel: "Score",
    progressLabel: "Progress",
    submittedLabel: "Submitted",
    pendingLabel: "Waiting",
    resultsLabel: "Match results",
    resultsTitle: "Round wrap-up",
    resultsBody: "Review the final order and score gap before returning to the lobby.",
    resultsWinnerLabel: "Match winner",
    resultsStandingsLabel: "Final standings",
    resultsTableRank: "Rank",
    resultsTablePlayer: "Player",
    resultsTableScore: "Score",
    resultsTableCorrect: "Correct",
    resultsResetHint: "Anyone can return to the lobby immediately, and the room will move back soon automatically.",
    resultsAutoResetLabel: "Returning to the lobby automatically soon.",
    resultsReturnNow: "Return to lobby",
    championLabel: "Champion",
    runnerUpLabel: "Runner-up",
    thirdPlaceLabel: "3rd",
    enterFocusHint: "Press Enter to jump straight into the input field.",
    settingsApply: "Apply settings",
    settingsSaving: "Saving...",
    startMatch: "Start match",
    startingMatch: "Starting...",
    waitingHostTitle: "The host is still tuning the rules.",
    waitingHostBody: "Only the host can change the mode and round timer in the lobby.",
    challengeLabel: "Challenge",
    answerInputLabel: "Your answer",
    answerHintFactorInline: "(Use spaces between factors. Example: 2 2 3 7)",
    answerHintFactorPrimePhrase: `(Use spaces · if prime, enter "${FACTOR_PRIME_SHOUT}")`,
    answerHintFactorPrimeNumber: "(Use spaces · if prime, enter the number only)",
    answerRevealLabel: "Answer reveal",
    answerPlaceholderFactor: "2 2 3 7",
    answerPlaceholderBinary: "101011",
    submitAnswer: "Submit answer",
    claimAnswerTurn: "Buzz for answer",
    claimingAnswerTurn: "Buzzing...",
    goldenBellWaiting: "Another player currently owns the answer turn.",
    goldenBellAnswering: "You currently own the answer turn.",
    goldenBellWindowLabel: "Answer window",
    checkingAnswer: "Checking...",
    answerLocked: "Locked",
    nextRound: "Next round",
    nextRoundLoading: "Moving...",
    resetLobby: "Return to lobby",
    resettingLobby: "Resetting...",
    leaderboardLabel: "Leaderboard",
    leaderboardTitle: "Current standings",
    inviteLineLabel: "Invite link",
    shareUrlLabel: "Share URL",
    copyLink: "Copy link",
    systemNotesLabel: "Current Prototype",
    systemNotesTitle: "System Notes",
    systemNoteOne: "Challenge generation and validation are both server-authoritative.",
    systemNoteTwo: "Session recovery uses browser local storage.",
    systemNoteThree: "Room state only lives in server memory. There is no database yet.",
    inviteCopied: "Invite link copied.",
    reconnectSuccess: "Reconnected to the previous session.",
    reconnectExpired: "The saved session expired. Please join again.",
    enterNicknameFirst: "Please enter your nickname first.",
    enterValidRoomCode: "Please enter a valid room code.",
    settingsUpdated: "Rules updated.",
    firstRoundStarted: "The first round has started.",
    movedToNextRound: "Moved to the next round.",
    resetToLobbyDone: "Returned to the lobby.",
    answerAccepted: "Correct answer!",
    answerWrong: "Not correct yet. Check one more time.",
    answerParseFailed: "The answer format could not be parsed.",
    hostSuffix: "host",
    offlineSuffix: "offline",
    correctCountSuffix: "correct",
    noGuestsLabel: "no guests",
    rankLocked: "locked",
    rankLive: "live",
    rankMissed: "miss"
  }
} as const;

export function getDefaultLocale(): Locale {
  if (typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("ko")) {
    return "ko";
  }

  return "en";
}

export function getCopy(locale: Locale) {
  return COPY[locale];
}

export function getModeLabelByLocale(locale: Locale, mode: GameMode) {
  if (locale === "ko") {
    return mode === "factor" ? "Prime Factor 모드" : "Decimal / Binary 모드";
  }

  return mode === "factor" ? "Prime Factor Sprint" : "Decimal / Binary Blitz";
}

export function getModeDescriptionByLocale(locale: Locale, mode: GameMode) {
  if (locale === "ko") {
    return mode === "factor"
      ? "제시된 수를 가장 빠르게 소인수분해하세요."
      : "10진수와 2진수를 서로 가장 빠르게 변환하세요.";
  }

  return mode === "factor"
    ? "Break the target into prime factors faster than everyone else."
    : "Swap between decimal and binary before the room does.";
}

export function getBinaryRatioSummary(locale: Locale, chance: number) {
  const clampedChance = Math.max(0, Math.min(100, Math.round(chance)));

  if (locale === "ko") {
    if (clampedChance === 100) {
      return "항상 10진수 -> 2진수";
    }

    if (clampedChance === 0) {
      return "항상 2진수 -> 10진수";
    }

    return `10진수 -> 2진수 ${clampedChance}% · 2진수 -> 10진수 ${100 - clampedChance}%`;
  }

  if (clampedChance === 100) {
    return "Always decimal -> binary";
  }

  if (clampedChance === 0) {
    return "Always binary -> decimal";
  }

  return `Decimal -> binary ${clampedChance}% · binary -> decimal ${100 - clampedChance}%`;
}

export function getFactorResolutionSummary(locale: Locale, mode: FactorResolutionMode) {
  const copy = getCopy(locale);
  if (mode === "first-correct") {
    return copy.factorResolutionFirstCorrect;
  }

  if (mode === "golden-bell") {
    return copy.factorResolutionGoldenBell;
  }

  return copy.factorResolutionAllPlay;
}

export function getPhaseHeadlineByLocale(locale: Locale, phase: RoomPhase, roundNumber: number) {
  const copy = getCopy(locale);

  if (phase === "lobby") {
    return copy.currentPhaseLobby;
  }

  if (phase === "round-active") {
    return `${copy.currentPhaseActive} ${roundNumber}`;
  }

  if (phase === "round-ended") {
    return `${copy.currentPhaseReview} ${roundNumber}`;
  }

  return copy.currentPhaseFinished;
}

export function getChallengeCopy(locale: Locale, round: Pick<RoundSnapshot, "mode" | "challengeMeta">) {
  if (round.mode === "factor") {
    const meta = round.challengeMeta as PrimeFactorChallengeMeta;
    return {
      prompt:
        locale === "ko"
          ? `${meta.compositeNumber}를 소인수분해하세요.`
          : `Factorize ${meta.compositeNumber} into prime factors.`,
      helper:
        meta.isPrimeTarget
          ? locale === "ko"
            ? meta.primeAnswerMode === "number"
              ? "이 수가 소수라면 수 하나만 입력하세요."
              : `"${FACTOR_PRIME_SHOUT}"를 입력하세요.`
            : meta.primeAnswerMode === "number"
              ? "If the number is prime, enter the number only."
              : `If the number is prime, enter "${FACTOR_PRIME_SHOUT}".`
          : locale === "ko"
            ? "수들은 공백으로 구분해서 입력하세요. 예: 2 2 3 7"
            : "Separate the factors with spaces. Example: 2 2 3 7."
    };
  }

  const meta = round.challengeMeta as BinaryChallengeMeta;
  if (meta.direction === "decimal-to-binary") {
    return {
      prompt:
        locale === "ko"
          ? `${meta.sourceValue}를 2진수로 바꾸세요.`
          : `Convert ${meta.sourceValue} to binary.`,
      helper:
        locale === "ko"
          ? "0b 없이 입력하세요. 예: 101011"
          : "Enter the binary digits without 0b. Example: 101011."
    };
  }

  return {
    prompt:
      locale === "ko"
        ? `${meta.sourceValue}를 10진수로 바꾸세요.`
        : `Convert ${meta.sourceValue} to decimal.`,
    helper:
      locale === "ko"
        ? "10진수 숫자만 입력하세요."
        : "Enter the base-10 number only."
  };
}

export function getRoomMessageByLocale(
  locale: Locale,
  messageKey: RoomMessageKey,
  playerName?: string
) {
  const actor = playerName ?? (locale === "ko" ? "플레이어" : "player");

  const messages = {
    ko: {
      "lobby-ready": "초대 링크를 공유하고 방 설정을 조정해 보세요.",
      "settings-updated": "룰이 변경되었습니다.",
      "settings-updated-reset-ready": "룰이 변경되어 준비 상태가 해제되었습니다.",
      "round-live": "라운드가 시작되었습니다. 빠르게 맞힐수록 점수를 더 받습니다.",
      "golden-bell-open": "골든벨 모드입니다. 먼저 정답 외치기 버튼을 누른 사람이 답변권을 가집니다.",
      "golden-bell-claimed": `${actor}님이 정답 외치기에 성공했습니다.`,
      "golden-bell-wrong": `${actor}님이 골든벨 기회를 놓쳐 점수가 깎였습니다.`,
      "golden-bell-timeout": `${actor}님이 골든벨 제한 시간 안에 답하지 못했습니다.`,
      "first-correct": `${actor}님이 가장 먼저 정답을 제출했습니다.`,
      "player-correct": `${actor}님이 정답을 제출했습니다.`,
      "all-correct": "현재 접속 중인 모든 플레이어가 정답을 제출했습니다.",
      "time-up": "시간이 종료되었습니다. 정답을 확인하고 다음 라운드로 이동하세요.",
      "match-finished": "게임이 종료되었습니다. 최종 점수가 확정되었습니다.",
      "match-finished-tie": "동점으로 게임이 종료되었습니다.",
      "reset-lobby": "로비로 돌아왔습니다. 설정을 바꾸거나 다시 시작할 수 있습니다.",
      "host-transferred": `${actor}님이 새로운 방장이 되었습니다.`,
      "player-left": `${actor}님이 방을 나갔습니다.`
    },
    en: {
      "lobby-ready": "Share the invite link and tune the room settings.",
      "settings-updated": "Rules updated.",
      "settings-updated-reset-ready": "Rules changed and ready states were cleared.",
      "round-live": "The round is live. Faster correct answers earn more points.",
      "golden-bell-open": "Golden bell mode is live. Buzz first to earn the answer turn.",
      "golden-bell-claimed": `${actor} claimed the answer turn.`,
      "golden-bell-wrong": `${actor} missed the golden bell answer and lost points.`,
      "golden-bell-timeout": `${actor} ran out of time on the golden bell turn.`,
      "first-correct": `${actor} found the first correct answer.`,
      "player-correct": `${actor} locked in a correct answer.`,
      "all-correct": "Everyone still connected solved the round.",
      "time-up": "Time is up. Review the answer and move to the next round.",
      "match-finished": "The match is over. Final scores are locked in.",
      "match-finished-tie": "The match ended with a tie at the top.",
      "reset-lobby": "Back in the lobby. Adjust the settings or start again.",
      "host-transferred": `${actor} is now the host.`,
      "player-left": `${actor} left the room.`
    }
  } as const;

  return messages[locale][messageKey];
}
