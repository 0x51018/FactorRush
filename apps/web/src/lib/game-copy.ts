import {
  type BaseConversionPair,
  FACTOR_PRIME_SHOUT,
  type BinaryChallengeMeta,
  type ChainNumberKind,
  type ConversionBase,
  type FactorResolutionMode,
  type GameMode,
  type NumberChainChallengeMeta,
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
    createRoomButton: "방 생성",
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
    binaryRatioField: "변환 쌍",
    binaryRatioHint: "선택한 두 진법 중 한 방향이 매 라운드마다 랜덤으로 출제됩니다.",
    binaryPreviewToggle: "실시간 변환 프리뷰",
    binaryPreviewHint: "입력 중인 값을 반대 진법으로 바로 보여줍니다.",
    binaryPreviewLabel: "예상 변환",
    factorResolutionField: "라운드 진행 방식",
    factorResolutionAllPlay: "기본 모드",
    factorResolutionFirstCorrect: "선착순 모드",
    factorResolutionGoldenBell: "골든벨 모드",
    factorResolutionAllPlayBody: "모든 플레이어가 끝까지 동시에 정답을 입력하는 기본 대결 방식입니다.",
    factorResolutionFirstCorrectBody: "가장 먼저 정답을 맞힌 플레이어가 나오면 즉시 공개 단계로 넘어갑니다.",
    factorResolutionGoldenBellBody: "정답 외치기에 먼저 성공한 플레이어가 답변권을 가져가며, 기본값은 오답 후에도 다시 도전할 수 있습니다.",
    chainTurnLabel: "현재 차례",
    chainAliveLabel: "생존자",
    chainUsedLabel: "사용된 수",
    chainRequirementPrime: "소수",
    chainRequirementComposite: "합성수",
    chainRequirementMixedLabel: "소수 / 합성수 혼합",
    chainRequirementPrimeOnlyLabel: "소수만",
    chainTurnGoalLastSurvivorLabel: "생존자 1명 남을 때까지",
    chainTurnGoalOneEliminationLabel: "탈락자 1명 나올 때까지",
    chainWaitingTitle: "다른 플레이어 차례입니다.",
    chainWaitingBody: "지금은 입력을 기다리는 중입니다. 이어질 수를 미리 떠올려 보세요.",
    chainEliminatedTitle: "이번 게임에서 탈락했습니다.",
    chainEliminatedBody: "채팅과 리더보드는 계속 볼 수 있고, 결과 화면에서 우승자를 확인할 수 있습니다.",
    chainCurrentLabel: "현재 체인",
    chainInputPlaceholder: "23",
    turnCountField: "진행 턴",
    factorSuddenDeathLabel: "서든데스 연장",
    factorSuddenDeathHint: "기본 모드에서 시간 안에 아무도 못 맞추면, 이후 첫 정답자 1명만 점수를 얻습니다.",
    factorPrimeAnswerField: "소수 문제 정답",
    factorPrimeAnswerPhrase: `"${FACTOR_PRIME_SHOUT}" 입력`,
    factorPrimeAnswerNumber: "숫자로 입력",
    factorPrimeAnswerToggle: `"${FACTOR_PRIME_SHOUT}" 끄기`,
    factorPrimeAnswerHint: `기본은 "${FACTOR_PRIME_SHOUT}"를 입력하며, 켜면 소수는 숫자 하나만 정답으로 인정합니다.`,
    factorOrderedLabel: "소인수 순서까지 맞추기",
    factorOrderedHint: "같은 수라도 제시된 순서를 유지해야 정답 처리됩니다.",
    factorSingleAttemptLabel: "정답 시도 기회 1회 제한",
    factorSingleAttemptHint:
      "켜면 한 번 틀린 뒤 이번 라운드에서 잠기고, 끄면 오답마다 현재 점수의 10%가 차감된 뒤 다시 제출할 수 있습니다.",
    factorGoldenBellSingleAttemptLabel: "골든벨 오답 후 재도전 금지",
    factorGoldenBellSingleAttemptHint: "끄면 오답 패널티를 받고 다시 외칠 수 있고, 켜면 한 번 틀린 뒤 해당 라운드에서 잠깁니다.",
    roundsUnit: "라운드",
    secondsUnit: "초",
    untimedLabel: "무제한",
    goldenBellUntimedHint: "골든벨은 메인 라운드 시간이 흐르다가 외치기 성공 시 잠시 멈추고, 그동안 10초 답변권만 따로 흐릅니다.",
    suddenDeathLive: "서든데스",
    goldenBellLive: "답변권 10초",
    lobbyRosterLabel: "참가 명단",
    lobbyRosterTitle: "참가자",
    lobbyRosterBody: "누가 들어와 있는지 중앙에서 바로 보입니다.",
    spectatorLabel: "관전자",
    spectatorTitle: "관전석",
    spectatorLiveTitle: "이 라운드는 관전 중입니다.",
    spectatorLiveBody: "보드와 정답 공개를 확인하고, 로비에서 다시 참가할 수 있습니다.",
    spectatorSeatJoin: "플레이어로 참가",
    spectatorSeatJoined: "플레이어 좌석에 참가했습니다.",
    spectatorSeatFull: "좌석 가득 참",
    spectatorsUnit: "관전자",
    lobbySettingsLabel: "게임 설정",
    lobbySettingsTitle: "매치 규칙 조정",
    lobbySettingsBody: "모드와 시간은 팝업에서 조정하고, 로비 중앙은 참가자 확인에 집중합니다.",
    lobbyRuleCardLabel: "룰 요약",
    lobbyRuleCardTitle: "현재 룰",
    scoreGuideLabel: "점수 공식",
    scoreGuideTitle: "점수 산식",
    scoreGuideOpen: "점수 공식 보기",
    scoreGuideBody: "모드별 점수 계산식과 재도전 감점, 골든벨 패널티를 정확한 수식으로 확인할 수 있습니다.",
    scoreGuideBaseHeading: "기본 점수표",
    scoreGuideTimedHeading: "시간 제한 라운드",
    scoreGuideGoldenBellHeading: "골든벨",
    scoreGuideSuddenDeathHeading: "서든데스",
    scoreGuidePenaltyHeading: "패널티",
    scoreGuideVariablesHeading: "변수 정의",
    lobbyChatTitle: "로비 채팅",
    lobbyChatBody: "대기 중인 동안 바로 이야기를 나눌 수 있습니다.",
    lobbyStartHint: "모두 준비되면 시작하세요. 설정은 언제든 다시 열 수 있습니다.",
    openSettings: "설정 열기",
    openGameSettings: "게임 설정",
    openMatchSettings: "매치 설정",
    matchSettingsLabel: "매치 설정",
    matchSettingsTitle: "인원 및 입장 정책",
    matchSettingsBody: "게임 규칙과 별개로, 이 방이 몇 명까지 받는지와 경기 도중 링크 입장을 어떻게 처리할지 정합니다.",
    maxPlayersField: "최대 플레이어 수",
    allowMidMatchJoinLabel: "게임 도중 링크 입장도 즉시 참여로 처리",
    allowMidMatchJoinHint:
      "켜면 라운드 진행 중 들어온 사람도 바로 플레이어로 합류하고, 점수는 현재 참가자 최저 점수로 시작합니다.",
    closePanel: "닫기",
    leaveRoom: "방 나가기",
    leavingRoom: "나가는 중..",
    transferHost: "방장 위임",
    kickPlayer: "추방",
    kickingPlayer: "추방 중...",
    renameNickname: "닉네임 변경",
    liveBoardLabel: "실시간 대결",
    liveBoardTitle: "진행 보드",
    liveBoardBody: "점수와 제출 상태를 한눈에 확인할 수 있습니다.",
    feedLabel: "채팅",
    feedTitle: "룸 채팅",
    feedLauncher: "채팅 /",
    feedHint: "Enter로 전송 · / 로 입력창 포커스",
    chatPlaceholder: "메시지를 입력하세요",
    sendChat: "보내기",
    sendingChat: "전송 중...",
    noChatYet: "아직 채팅이 없습니다.",
    scoreLabel: "점수",
    progressLabel: "진행",
    submittedLabel: "제출 완료",
    pendingLabel: "대기 중",
    resultsLabel: "최종 결과",
    resultsTitle: "최종 순위",
    resultsBody: "이번 게임의 최종 순위와 점수를 확인하세요.",
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
    answerPlaceholderBinary: "101011 / 2F / 57",
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
    spectatorJoinSuccess: "게임 진행 중이라 관전자로 입장했습니다.",
    spectatorReconnectSuccess: "이전 관전자 세션에 다시 연결했습니다.",
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
    createRoomButton: "Create room",
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
    binaryRatioField: "Conversion pair",
    binaryRatioHint: "Each round randomly picks one direction from the selected pair.",
    binaryPreviewToggle: "Live conversion preview",
    binaryPreviewHint: "Show the opposite-base conversion while typing.",
    binaryPreviewLabel: "Predicted conversion",
    factorResolutionField: "Round flow",
    factorResolutionAllPlay: "All-play mode",
    factorResolutionFirstCorrect: "First-correct mode",
    factorResolutionGoldenBell: "Golden bell mode",
    factorResolutionAllPlayBody: "Everyone keeps submitting answers until the round naturally ends.",
    factorResolutionFirstCorrectBody: "The first correct answer immediately pushes the room into reveal.",
    factorResolutionGoldenBellBody: "The first player to buzz gets the answer turn, and by default wrong answers can buzz again after the penalty.",
    chainTurnLabel: "Current turn",
    chainAliveLabel: "Alive",
    chainUsedLabel: "Used numbers",
    chainRequirementPrime: "Prime",
    chainRequirementComposite: "Composite",
    chainRequirementMixedLabel: "Prime / composite mixed",
    chainRequirementPrimeOnlyLabel: "Prime only",
    chainTurnGoalLastSurvivorLabel: "Until one survivor remains",
    chainTurnGoalOneEliminationLabel: "Until one player is eliminated",
    chainWaitingTitle: "Another player has the turn.",
    chainWaitingBody: "Wait for the active player while planning your own next number.",
    chainEliminatedTitle: "You were eliminated from this match.",
    chainEliminatedBody: "You can still watch chat and the leaderboard until the winner is decided.",
    chainCurrentLabel: "Current chain",
    chainInputPlaceholder: "23",
    turnCountField: "Turns played",
    factorSuddenDeathLabel: "Sudden death extension",
    factorSuddenDeathHint: "If nobody solves the timed all-play round, the room switches to first-solver sudden death.",
    factorPrimeAnswerField: "Prime target answer",
    factorPrimeAnswerPhrase: `Enter "${FACTOR_PRIME_SHOUT}"`,
    factorPrimeAnswerNumber: "Enter the number only",
    factorPrimeAnswerToggle: `Turn off "${FACTOR_PRIME_SHOUT}"`,
    factorPrimeAnswerHint: `By default prime prompts require "${FACTOR_PRIME_SHOUT}". Enable this to accept the number instead.`,
    factorOrderedLabel: "Match factor order",
    factorOrderedHint: "The same factors in a different order will no longer count as correct.",
    factorSingleAttemptLabel: "Limit answer attempts to one try",
    factorSingleAttemptHint:
      "When on, one wrong answer locks that player for the round. When off, each wrong answer deducts 10% of the current score and they can retry.",
    factorGoldenBellSingleAttemptLabel: "Lock golden bell after one miss",
    factorGoldenBellSingleAttemptHint: "When off, players can buzz again after the penalty. When on, one wrong answer locks that round.",
    roundsUnit: "rounds",
    secondsUnit: "seconds",
    untimedLabel: "untimed",
    goldenBellUntimedHint: "Golden bell keeps the main round clock running, pauses it during a claimed 10-second answer window, and then resumes it.",
    suddenDeathLive: "Sudden death",
    goldenBellLive: "10s answer turn",
    lobbyRosterLabel: "Roster",
    lobbyRosterTitle: "Players",
    lobbyRosterBody: "See who is in the room right from the center panel.",
    spectatorLabel: "Spectators",
    spectatorTitle: "Watchers",
    spectatorLiveTitle: "Spectating this round.",
    spectatorLiveBody: "Follow the board and answer reveal, then rejoin from the lobby.",
    spectatorSeatJoin: "Take a player seat",
    spectatorSeatJoined: "You joined the player seats.",
    spectatorSeatFull: "Seats full",
    spectatorsUnit: "spectators",
    lobbySettingsLabel: "Game settings",
    lobbySettingsTitle: "Tune the match rules",
    lobbySettingsBody: "Adjust the rules in a popup so the lobby center can stay focused on players.",
    lobbyRuleCardLabel: "Rule summary",
    lobbyRuleCardTitle: "Current rules",
    scoreGuideLabel: "Scoring",
    scoreGuideTitle: "Scoring formulas",
    scoreGuideOpen: "View scoring formulas",
    scoreGuideBody:
      "Review the exact formulas, retry penalties, golden bell penalties, and variable definitions for each mode.",
    scoreGuideBaseHeading: "Base point table",
    scoreGuideTimedHeading: "Timed rounds",
    scoreGuideGoldenBellHeading: "Golden bell",
    scoreGuideSuddenDeathHeading: "Sudden death",
    scoreGuidePenaltyHeading: "Penalty",
    scoreGuideVariablesHeading: "Variable glossary",
    lobbyChatTitle: "Lobby chat",
    lobbyChatBody: "Talk while the room is getting ready.",
    lobbyStartHint: "Start as soon as everyone is ready. You can reopen the settings at any time.",
    openSettings: "Open settings",
    openGameSettings: "Game settings",
    openMatchSettings: "Match settings",
    matchSettingsLabel: "Match settings",
    matchSettingsTitle: "Seats and join policy",
    matchSettingsBody:
      "These options are separate from the game rules and control room capacity plus how invite links behave once a match is already running.",
    maxPlayersField: "Player cap",
    allowMidMatchJoinLabel: "Let invite joins enter the current match immediately",
    allowMidMatchJoinHint:
      "When enabled, late joiners become players right away and start on the current lowest score in the room.",
    closePanel: "Close",
    leaveRoom: "Leave room",
    leavingRoom: "Leaving...",
    transferHost: "Transfer host",
    kickPlayer: "Kick",
    kickingPlayer: "Kicking...",
    renameNickname: "Rename nickname",
    liveBoardLabel: "Live race",
    liveBoardTitle: "Progress board",
    liveBoardBody: "See score and submission state at a glance.",
    feedLabel: "Chat",
    feedTitle: "Room chat",
    feedLauncher: "Chat /",
    feedHint: "Press Enter to send · / to focus chat",
    chatPlaceholder: "Type a message",
    sendChat: "Send",
    sendingChat: "Sending...",
    noChatYet: "No chat yet.",
    scoreLabel: "Score",
    progressLabel: "Progress",
    submittedLabel: "Submitted",
    pendingLabel: "Waiting",
    resultsLabel: "Match results",
    resultsTitle: "Final standings",
    resultsBody: "See the final order and score before returning to the lobby.",
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
    answerPlaceholderBinary: "101011 / 2F / 57",
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
    spectatorJoinSuccess: "The match is already running, so you joined as a spectator.",
    spectatorReconnectSuccess: "Reconnected to the previous spectator session.",
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
  if (mode === "binary") {
    return locale === "ko" ? "Base Conversion 모드" : "Base Conversion Mode";
  }

  if (mode === "chain") {
    return locale === "ko" ? "숫자 체인 모드" : "Number Chain Mode";
  }

  if (locale === "ko") {
    return "Prime Factor 모드";
  }

  return "Prime Factor Sprint";
}

export function getModeDescriptionByLocale(locale: Locale, mode: GameMode) {
  if (mode === "binary") {
    return locale === "ko"
      ? "2진수, 10진수, 16진수 사이를 가장 빠르게 변환하세요."
      : "Convert between base 2, 10, and 16 faster than everyone else.";
  }

  if (mode === "chain") {
    return locale === "ko"
      ? "이전 수의 마지막 자리에서 시작하는 수를 차례대로 이어 가며 살아남으세요."
      : "Take turns extending the chain from the previous last digit and stay alive.";
  }

  if (locale === "ko") {
    return "제시된 수를 가장 빠르게 소인수분해하세요.";
  }

  return "Break the target into prime factors faster than everyone else.";
}

export function getBinaryRatioSummary(locale: Locale, chance: number | BaseConversionPair) {
  if (typeof chance === "string") {
    if (chance === "10-16") {
      return "10 ↔ 16";
    }

    if (chance === "2-16") {
      return "2 ↔ 16";
    }

    return "2 ↔ 10";
  }

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
  if (round.mode === "chain") {
    const meta = round.challengeMeta as NumberChainChallengeMeta;
    const kindLabel = getChainKindLabel(locale, meta.requiredKind);
    return {
      prompt:
        locale === "ko"
          ? `${meta.currentNumber}에서 이어서, ${meta.requiredStartDigit}로 시작하는 ${kindLabel} 수를 제시하세요.`
          : `Continue from ${meta.currentNumber} with a ${kindLabel.toLowerCase()} number that starts with ${meta.requiredStartDigit}.`,
      helper:
        locale === "ko"
          ? "재사용 금지 · 1은 불가 · 0으로 끝나는 수는 불가"
          : "No reused numbers. 1 is invalid, and numbers ending in 0 are banned."
    };
  }

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
  if (typeof meta.sourceBase === "number" && typeof meta.targetBase === "number") {
    const sourceLabel = getBaseLabel(locale, meta.sourceBase);
    const targetLabel = getBaseLabel(locale, meta.targetBase);
    return {
      prompt:
        locale === "ko"
          ? `${sourceLabel} ${meta.sourceValue}를 ${targetLabel}로 바꾸세요.`
          : `Convert ${meta.sourceValue} from ${sourceLabel} to ${targetLabel}.`,
      helper: getBaseHelperByLocale(locale, meta.targetBase)
    };
  }

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
      "settings-updated": "변경된 룰이 적용되었습니다.",
      "settings-updated-reset-ready": "변경된 룰이 적용되었습니다.",
      "round-live": "라운드가 시작되었습니다. 빠르게 맞힐수록 점수를 더 받습니다.",
      "chain-turn-live": `${actor}님의 차례입니다. 현재 체인을 이어 주세요.`,
      "chain-turn-correct": `${actor}님이 체인을 성공적으로 이어 갔습니다.`,
      "chain-turn-eliminated": `${actor}님이 체인을 끊어 탈락했습니다.`,
      "chain-turn-timeout": `${actor}님이 제한 시간 안에 답하지 못해 탈락했습니다.`,
      "golden-bell-open": "골든벨 모드입니다. 메인 시간 안에 먼저 정답 외치기에 성공한 사람이 10초 답변권을 가집니다.",
      "golden-bell-claimed": `${actor}님이 정답 외치기에 성공했습니다.`,
      "golden-bell-wrong": `${actor}님이 골든벨 기회를 놓쳐 점수가 깎였습니다.`,
      "golden-bell-timeout": `${actor}님이 골든벨 제한 시간 안에 답하지 못했습니다.`,
      "sudden-death-open": "시간 안에 아무도 못 맞춰 서든데스가 시작되었습니다. 첫 정답자 1명만 점수를 얻습니다.",
      "first-correct": `${actor}님이 가장 먼저 정답을 제출했습니다.`,
      "player-correct": `${actor}님이 정답을 제출했습니다.`,
      "all-correct": "현재 접속 중인 모든 플레이어가 정답을 제출했습니다.",
      "all-resolved": "모든 답변권이 정리되어 정답을 공개합니다.",
      "time-up": "시간이 종료되었습니다. 정답을 확인하고 다음 라운드로 이동하세요.",
      "match-finished": "게임이 종료되었습니다. 최종 점수가 확정되었습니다.",
      "match-finished-tie": "동점으로 게임이 종료되었습니다.",
      "match-cap-reached": "매치가 1시간 상한에 도달해 현재 점수 기준으로 종료되었습니다.",
      "reset-lobby": "로비로 돌아왔습니다. 설정을 바꾸거나 다시 시작할 수 있습니다.",
      "host-transferred": `${actor}님이 새로운 방장이 되었습니다.`,
      "player-kicked": `${actor}님이 방에서 추방되었습니다.`,
      "player-left": `${actor}님이 방을 나갔습니다.`
    },
    en: {
      "lobby-ready": "Share the invite link and tune the room settings.",
      "settings-updated": "Updated rules applied.",
      "settings-updated-reset-ready": "Updated rules applied.",
      "round-live": "The round is live. Faster correct answers earn more points.",
      "chain-turn-live": `${actor} is on the clock. Continue the chain.`,
      "chain-turn-correct": `${actor} extended the chain successfully.`,
      "chain-turn-eliminated": `${actor} broke the chain and was eliminated.`,
      "chain-turn-timeout": `${actor} timed out and was eliminated from the chain.`,
      "golden-bell-open": "Golden bell mode is live. The main round timer pauses during each claimed 10-second answer turn.",
      "golden-bell-claimed": `${actor} claimed the answer turn.`,
      "golden-bell-wrong": `${actor} missed the golden bell answer and lost points.`,
      "golden-bell-timeout": `${actor} ran out of time on the golden bell turn.`,
      "sudden-death-open": "Nobody solved it in time. Sudden death is live for the first correct answer.",
      "first-correct": `${actor} found the first correct answer.`,
      "player-correct": `${actor} locked in a correct answer.`,
      "all-correct": "Everyone still connected solved the round.",
      "all-resolved": "Every answer turn is resolved. The answer is now revealed.",
      "time-up": "Time is up. Review the answer and move to the next round.",
      "match-finished": "The match is over. Final scores are locked in.",
      "match-finished-tie": "The match ended with a tie at the top.",
      "match-cap-reached": "The match hit the one-hour cap and ended on the current scores.",
      "reset-lobby": "Back in the lobby. Adjust the settings or start again.",
      "host-transferred": `${actor} is now the host.`,
      "player-kicked": `${actor} was removed from the room.`,
      "player-left": `${actor} left the room.`
    }
  } as const;

  return messages[locale][messageKey];
}

function getBaseLabel(locale: Locale, base: ConversionBase) {
  if (locale === "ko") {
    if (base === 16) {
      return "16진수";
    }

    return `${base}진수`;
  }

  if (base === 2) {
    return "binary";
  }

  if (base === 16) {
    return "hexadecimal";
  }

  return "decimal";
}

function getChainKindLabel(locale: Locale, kind: ChainNumberKind) {
  const copy = getCopy(locale);
  return kind === "prime" ? copy.chainRequirementPrime : copy.chainRequirementComposite;
}

function getBaseHelperByLocale(locale: Locale, base: ConversionBase) {
  if (locale === "ko") {
    if (base === 2) {
      return "0b 없이 입력하세요. 예: 101011";
    }

    if (base === 16) {
      return "0x 없이 16진수로 입력하세요. 예: 2F";
    }

    return "10진수 숫자만 입력하세요.";
  }

  if (base === 2) {
    return "Enter the binary digits without 0b. Example: 101011.";
  }

  if (base === 16) {
    return "Use hexadecimal digits without 0x. Example: 2F.";
  }

  return "Enter the base-10 number only.";
}
