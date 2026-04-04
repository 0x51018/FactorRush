/**
 * RoomStore는 서버 메모리에 존재하는 "게임 세션 저장소"이자
 * 현재 프로토타입의 핵심 도메인 서비스다.
 *
 * 책임:
 * - 방 생성 / 참가 / 재접속 처리
 * - 호스트 권한과 로비 설정 관리
 * - 라운드 시작 / 종료 / 다음 라운드 진행
 * - 서버 기준 정답 검증과 점수 계산
 * - 현재 방 상태를 RoomSnapshot으로 가공해 전체 클라이언트에 브로드캐스트
 *
 * 의도:
 * - index.ts는 소켓 이벤트 라우팅만 담당하고
 * - shared 패키지는 타입/문제 생성/정답 판정을 제공하며
 * - 이 파일은 "서버 측 상태 머신" 역할을 담당한다.
 */
import type { Server, Socket } from "socket.io";
import {
  MAX_PLAYERS_PER_ROOM,
  ROOM_IDLE_GRACE_MS,
  calculatePoints,
  clampSettings,
  type ClaimAnswerRequest,
  createId,
  createInvitePath,
  createRoomCode,
  evaluateSubmission,
  GOLDEN_BELL_PENALTY_POINTS,
  GOLDEN_BELL_WINDOW_MS,
  MATCH_MAX_DURATION_MS,
  generateChallenge,
  sanitizeChatMessage,
  sanitizePlayerName,
  sanitizeRoomId,
  sortPlayersByScore,
  type ChatMessage,
  type Challenge,
  type CreateRoomRequest,
  type JoinRoomRequest,
  type JoinRoomResult,
  type LobbySettings,
  type PlayerSummary,
  type RoomRole,
  type RenamePlayerRequest,
  type RoomActionRequest,
  type RoomMessageKey,
  type RoomPhase,
  type RoomSnapshot,
  type SendChatRequest,
  type SetReadyRequest,
  type SocketAck,
  type SubmitAnswerRequest,
  type SubmitAnswerResult,
  type SubmissionKind,
  type TransferHostRequest,
  type UpdateSettingsRequest
} from "@factorrush/shared";

interface PlayerRecord extends PlayerSummary {
  socketId?: string;
  recentChatTimestamps: number[];
  disconnectTimer: NodeJS.Timeout | null;
}

interface SpectatorRecord {
  id: string;
  name: string;
  connected: boolean;
  socketId?: string;
  recentChatTimestamps: number[];
  disconnectTimer: NodeJS.Timeout | null;
}

interface AttemptRecord {
  playerId: string;
  answer: string;
  normalizedAnswer: string;
  submittedAt: number;
  kind: Exclude<SubmissionKind, "correct">;
  scoreDelta: number;
}

interface SubmissionRecord {
  playerId: string;
  answer: string;
  normalizedAnswer: string;
  submittedAt: number;
  pointsAwarded: number;
  rank: number;
}

interface InternalRound {
  roundNumber: number;
  challenge: Challenge;
  startedAt: number;
  endsAt: number;
  hasRoundTimer: boolean;
  isSuddenDeath: boolean;
  answeringPlayerId: string | null;
  answerWindowEndsAt?: number;
  transitionEndsAt?: number;
  submissions: SubmissionRecord[];
  attempts: AttemptRecord[];
  timer: NodeJS.Timeout | null;
  answerWindowTimer: NodeJS.Timeout | null;
}

interface RoomRecord {
  roomId: string;
  roomName: string;
  invitePath: string;
  phase: RoomPhase;
  settings: LobbySettings;
  players: PlayerRecord[];
  spectators: SpectatorRecord[];
  round: InternalRound | null;
  completedRounds: number;
  matchStartedAt?: number;
  matchEndsAt?: number;
  autoResetAt?: number;
  completedRoundDurationsMs: number[];
  chatFeed: ChatMessage[];
  cleanupTimer: NodeJS.Timeout | null;
  transitionTimer: NodeJS.Timeout | null;
  matchCapTimer: NodeJS.Timeout | null;
  finalWinnerIds: string[];
  message: string;
  messageKey: RoomMessageKey;
  messagePlayerName?: string | undefined;
}

const ROUND_REVEAL_MS = 5500;
const FINAL_RESULTS_DELAY_MS = 1800;
const RESULTS_AUTO_RESET_MS = 15000;
const RECONNECT_GRACE_MS = 12_000;
const CHAT_RATE_LIMIT_WINDOW_MS = 10_000;
const CHAT_RATE_LIMIT_MAX_MESSAGES = 5;
export class RoomStore {
  // rooms: 실제 방 상태 저장소
  private readonly rooms = new Map<string, RoomRecord>();
  // socketToSeat: 소켓이 어느 방의 어느 멤버(플레이어/관전자)인지 역추적하기 위한 인덱스
  private readonly socketToSeat = new Map<string, { roomId: string; memberId: string; role: RoomRole }>();

  constructor(private readonly io: Server) {}

  shutdown() {
    for (const room of this.rooms.values()) {
      this.clearRoundTimer(room);
      this.clearTransitionTimer(room);
      this.clearAnswerWindowTimer(room);
      this.clearCleanupTimer(room);
      this.clearMatchCapTimer(room);
      for (const player of room.players) {
        this.clearMemberDisconnectTimer(player);
      }
      for (const spectator of room.spectators) {
        this.clearMemberDisconnectTimer(spectator);
      }
    }

    this.rooms.clear();
    this.socketToSeat.clear();
  }

  createRoom(socket: Socket, request: CreateRoomRequest): SocketAck<JoinRoomResult> {
    if (this.socketToSeat.has(socket.id)) {
      return { ok: false, error: "This browser is already seated in a room. Refresh to switch rooms." };
    }

    const playerName = sanitizePlayerName(request.playerName);
    if (!playerName) {
      return { ok: false, error: "Add a nickname before creating a room." };
    }

    const roomId = this.createUniqueRoomId();
    const playerId = createId("player");
    const room: RoomRecord = {
      roomId,
      roomName: `${playerName}님의 방`,
      invitePath: createInvitePath(roomId),
      phase: "lobby",
      settings: clampSettings(request.settings),
      players: [
        {
          id: playerId,
          name: playerName,
          score: 0,
          isHost: true,
          connected: true,
          correctAnswers: 0,
          isReady: false,
          socketId: socket.id,
          recentChatTimestamps: [],
          disconnectTimer: null
        }
      ],
      spectators: [],
      round: null,
      completedRounds: 0,
      matchStartedAt: undefined,
      matchEndsAt: undefined,
      autoResetAt: undefined,
      completedRoundDurationsMs: [],
      chatFeed: [],
      cleanupTimer: null,
      transitionTimer: null,
      matchCapTimer: null,
      finalWinnerIds: [],
      message: "Share the invite link and tune the room settings before you start.",
      messageKey: "lobby-ready"
    };

    this.rooms.set(roomId, room);
    this.socketToSeat.set(socket.id, { roomId, memberId: playerId, role: "player" });
    socket.join(roomId);
    this.emitRoom(room);

    return {
      ok: true,
      data: {
        roomId,
        playerId,
        role: "player"
      }
    };
  }

  joinRoom(socket: Socket, request: JoinRoomRequest): SocketAck<JoinRoomResult> {
    if (this.socketToSeat.has(socket.id)) {
      return { ok: false, error: "This browser is already seated in a room. Refresh to switch rooms." };
    }

    const roomId = sanitizeRoomId(request.roomId);
    const room = this.rooms.get(roomId);

    if (!room) {
      return { ok: false, error: "That room does not exist anymore." };
    }

    this.clearCleanupTimer(room);

    // 로컬 스토리지에 남아 있는 멤버 ID가 있으면 "재접속"을 우선 시도한다.
    const reconnectMemberId = request.reconnectMemberId?.trim() || request.reconnectPlayerId?.trim();
    if (reconnectMemberId) {
      const reconnectingPlayer = room.players.find((player) => player.id === reconnectMemberId);
      if (reconnectingPlayer && !reconnectingPlayer.connected) {
        if (reconnectingPlayer.socketId) {
          this.socketToSeat.delete(reconnectingPlayer.socketId);
        }

        reconnectingPlayer.socketId = socket.id;
        reconnectingPlayer.connected = true;
        this.clearMemberDisconnectTimer(reconnectingPlayer);

        const nextName = sanitizePlayerName(request.playerName);
        if (nextName) {
          reconnectingPlayer.name = this.createUniqueMemberName(room, nextName, reconnectMemberId);
        }

        this.socketToSeat.set(socket.id, { roomId, memberId: reconnectMemberId, role: "player" });
        socket.join(roomId);
        this.emitRoom(room);

        return {
          ok: true,
          data: {
            roomId,
            playerId: reconnectMemberId,
            role: "player"
          }
        };
      }

      const reconnectingSpectator = room.spectators.find(
        (spectator) => spectator.id === reconnectMemberId
      );
      if (reconnectingSpectator && !reconnectingSpectator.connected) {
        if (reconnectingSpectator.socketId) {
          this.socketToSeat.delete(reconnectingSpectator.socketId);
        }

        reconnectingSpectator.socketId = socket.id;
        reconnectingSpectator.connected = true;
        this.clearMemberDisconnectTimer(reconnectingSpectator);

        const nextName = sanitizePlayerName(request.playerName);
        if (nextName) {
          reconnectingSpectator.name = this.createUniqueMemberName(room, nextName, reconnectMemberId);
        }

        this.socketToSeat.set(socket.id, { roomId, memberId: reconnectMemberId, role: "spectator" });
        socket.join(roomId);
        this.emitRoom(room);

        return {
          ok: true,
          data: {
            roomId,
            playerId: reconnectMemberId,
            role: "spectator"
          }
        };
      }
    }

    const sanitizedName = sanitizePlayerName(request.playerName);
    if (!sanitizedName) {
      return { ok: false, error: "Add a nickname before joining the room." };
    }

    if (room.phase !== "lobby") {
      const spectatorId = createId("spectator");
      const spectatorName = this.createUniqueMemberName(room, sanitizedName);
      room.spectators.push({
        id: spectatorId,
        name: spectatorName,
        connected: true,
        socketId: socket.id,
        recentChatTimestamps: [],
        disconnectTimer: null
      });

      this.socketToSeat.set(socket.id, { roomId, memberId: spectatorId, role: "spectator" });
      socket.join(roomId);
      this.emitRoom(room);

      return {
        ok: true,
        data: {
          roomId,
          playerId: spectatorId,
          role: "spectator"
        }
      };
    }

    if (room.players.length >= MAX_PLAYERS_PER_ROOM) {
      return { ok: false, error: "That room is already full." };
    }

    const playerId = createId("player");
    const playerName = this.createUniqueMemberName(room, sanitizedName);
    room.players.push({
      id: playerId,
      name: playerName,
      score: 0,
      isHost: room.players.length === 0,
      connected: true,
      correctAnswers: 0,
      isReady: false,
      socketId: socket.id,
      recentChatTimestamps: [],
      disconnectTimer: null
    });

    this.socketToSeat.set(socket.id, { roomId, memberId: playerId, role: "player" });
    socket.join(roomId);
    this.emitRoom(room);

    return {
      ok: true,
      data: {
        roomId,
        playerId,
        role: "player"
      }
    };
  }

  updateSettings(socket: Socket, request: UpdateSettingsRequest): SocketAck<null> {
    const membership = this.getPlayerMembership(socket.id, request.roomId);
    if (!membership.ok) {
      return membership;
    }

    const { room, player } = membership.data;
    if (!player.isHost) {
      return { ok: false, error: "Only the host can change the room settings." };
    }

    if (room.phase !== "lobby") {
      return { ok: false, error: "Settings are locked once the match begins." };
    }

    const nextSettings = clampSettings(request.settings);
    const settingsChanged = !areLobbySettingsEqual(room.settings, nextSettings);
    const hadReadyPlayers = room.players.some(
      (candidate) => candidate.connected && !candidate.isHost && candidate.isReady
    );

    room.settings = nextSettings;
    if (settingsChanged && hadReadyPlayers) {
      for (const candidate of room.players) {
        if (!candidate.isHost) {
          candidate.isReady = false;
        }
      }
      room.message = "Rules changed. Ready states were cleared.";
      room.messageKey = "settings-updated-reset-ready";
    } else {
      room.message = "Rules updated.";
      room.messageKey = "settings-updated";
    }
    room.messagePlayerName = undefined;
    this.emitRoom(room);

    return { ok: true, data: null };
  }

  renameRoom(socket: Socket, request: { roomId: string; roomName: string }): SocketAck<null> {
    const membership = this.getPlayerMembership(socket.id, request.roomId);
    if (!membership.ok) {
      return membership;
    }

    const { room, player } = membership.data;
    if (!player.isHost) {
      return { ok: false, error: "Only the host can rename the room." };
    }

    if (room.phase !== "lobby") {
      return { ok: false, error: "You can rename the room in the lobby only." };
    }

    const nextRoomName = request.roomName.replace(/\s+/g, " ").trim().slice(0, 32);
    room.roomName = nextRoomName || `${room.players.find((candidate) => candidate.isHost)?.name ?? "Host"}님의 방`;
    this.emitRoom(room);

    return { ok: true, data: null };
  }

  renamePlayer(socket: Socket, request: RenamePlayerRequest): SocketAck<null> {
    const membership = this.getSeatMembership(socket.id, request.roomId);
    if (!membership.ok) {
      return membership;
    }

    const { room } = membership.data;
    if (room.phase !== "lobby") {
      return { ok: false, error: "You can rename your nickname in the lobby only." };
    }

    const nextRequestedName = sanitizePlayerName(request.playerName);
    if (!nextRequestedName) {
      return { ok: false, error: "Add a nickname before saving." };
    }

    const member = membership.data.role === "player" ? membership.data.player : membership.data.spectator;
    const previousName = member.name;
    const nextName = this.createUniqueMemberName(room, nextRequestedName, member.id);
    member.name = nextName;

    const previousDefaultRoomName = `${previousName}님의 방`;
    if (membership.data.role === "player" && membership.data.player.isHost && room.roomName === previousDefaultRoomName) {
      room.roomName = `${nextName}님의 방`;
    }

    this.emitRoom(room);
    return { ok: true, data: null };
  }

  becomePlayer(socket: Socket, request: RoomActionRequest): SocketAck<JoinRoomResult> {
    const membership = this.getSeatMembership(socket.id, request.roomId);
    if (!membership.ok) {
      return membership;
    }

    if (membership.data.role === "player") {
      return {
        ok: true,
        data: {
          roomId: membership.data.room.roomId,
          playerId: membership.data.player.id,
          role: "player"
        }
      };
    }

    const { room, spectator } = membership.data;
    if (room.phase !== "lobby") {
      return { ok: false, error: "You can only take a player seat from the lobby." };
    }

    if (room.players.length >= MAX_PLAYERS_PER_ROOM) {
      return { ok: false, error: "All player seats are already taken." };
    }

    room.spectators = room.spectators.filter((candidate) => candidate.id !== spectator.id);
    const playerId = createId("player");
    room.players.push({
      id: playerId,
      name: this.createUniqueMemberName(room, spectator.name),
      score: 0,
      isHost: room.players.length === 0,
      connected: true,
      correctAnswers: 0,
      isReady: false,
      socketId: socket.id,
      recentChatTimestamps: spectator.recentChatTimestamps,
      disconnectTimer: null
    });

    this.socketToSeat.set(socket.id, { roomId: room.roomId, memberId: playerId, role: "player" });
    this.emitRoom(room);

    return {
      ok: true,
      data: {
        roomId: room.roomId,
        playerId,
        role: "player"
      }
    };
  }

  setReady(socket: Socket, request: SetReadyRequest): SocketAck<null> {
    const membership = this.getPlayerMembership(socket.id, request.roomId);
    if (!membership.ok) {
      return membership;
    }

    const { room, player } = membership.data;
    if (room.phase !== "lobby") {
      return { ok: false, error: "Ready state is only available in the lobby." };
    }

    if (player.isHost) {
      player.isReady = false;
      this.emitRoom(room);
      return { ok: true, data: null };
    }

    player.isReady = request.isReady;
    room.message = this.haveAllRequiredPlayersReady(room)
      ? "Everyone is ready. The host can start the match."
      : `${player.name} updated their ready state.`;
    room.messageKey = "lobby-ready";
    room.messagePlayerName = player.name;
    this.emitRoom(room);

    return { ok: true, data: null };
  }

  startGame(socket: Socket, request: RoomActionRequest): SocketAck<null> {
    const membership = this.getPlayerMembership(socket.id, request.roomId);
    if (!membership.ok) {
      return membership;
    }

    const { room, player } = membership.data;
    if (!player.isHost) {
      return { ok: false, error: "Only the host can launch the match." };
    }

    if (room.phase === "round-active") {
      return { ok: false, error: "This round is already running." };
    }

    const connectedPlayers = room.players.filter((candidate) => candidate.connected);
    if (connectedPlayers.length === 0) {
      return { ok: false, error: "At least one connected player is required to start." };
    }

    if (!this.haveAllRequiredPlayersReady(room)) {
      return { ok: false, error: "Everyone needs to click ready before the host can start." };
    }

    // 새 게임 시작 시 점수와 라운드 진행 상태를 초기화한다.
    this.resetRoomScores(room);
    room.completedRounds = 0;
    room.finalWinnerIds = [];
    room.completedRoundDurationsMs = [];
    room.matchStartedAt = Date.now();
    room.matchEndsAt = room.matchStartedAt + MATCH_MAX_DURATION_MS;
    room.messagePlayerName = undefined;
    this.scheduleMatchCapTimer(room);
    this.startRound(room);

    return { ok: true, data: null };
  }

  advanceRound(socket: Socket, request: RoomActionRequest): SocketAck<null> {
    const membership = this.getPlayerMembership(socket.id, request.roomId);
    if (!membership.ok) {
      return membership;
    }

    const { room, player } = membership.data;
    if (!player.isHost) {
      return { ok: false, error: "Only the host can move the room forward." };
    }

    if (room.phase !== "round-ended") {
      return { ok: false, error: "The next round becomes available after the current round ends." };
    }

    this.startRound(room);
    return { ok: true, data: null };
  }

  transferHost(socket: Socket, request: TransferHostRequest): SocketAck<null> {
    const membership = this.getPlayerMembership(socket.id, request.roomId);
    if (!membership.ok) {
      return membership;
    }

    const { room, player } = membership.data;
    if (!player.isHost) {
      return { ok: false, error: "Only the current host can transfer host rights." };
    }

    if (room.phase !== "lobby") {
      return { ok: false, error: "Host transfer is only available in the lobby." };
    }

    const nextHost = room.players.find(
      (candidate) => candidate.id === request.playerId && candidate.connected
    );
    if (!nextHost || nextHost.id === player.id) {
      return { ok: false, error: "Choose another connected player to transfer host rights." };
    }

    for (const candidate of room.players) {
      candidate.isHost = candidate.id === nextHost.id;
      candidate.isReady = false;
    }

    room.message = `${nextHost.name} is now the host.`;
    room.messageKey = "host-transferred";
    room.messagePlayerName = nextHost.name;
    this.emitRoom(room);

    return { ok: true, data: null };
  }

  resetToLobby(socket: Socket, request: RoomActionRequest): SocketAck<null> {
    const membership = this.getSeatMembership(socket.id, request.roomId);
    if (!membership.ok) {
      return membership;
    }

    const { room } = membership.data;
    const isHostPlayer = membership.data.role === "player" && membership.data.player.isHost;
    if (!isHostPlayer && room.phase !== "finished") {
      return { ok: false, error: "Only the host can reset the room." };
    }

    this.resetRoomToLobby(room);

    return { ok: true, data: null };
  }

  sendChat(socket: Socket, request: SendChatRequest): SocketAck<null> {
    const membership = this.getSeatMembership(socket.id, request.roomId);
    if (!membership.ok) {
      return membership;
    }

    const { room } = membership.data;
    const member = membership.data.role === "player" ? membership.data.player : membership.data.spectator;
    const text = sanitizeChatMessage(request.text);
    if (!text) {
      return { ok: false, error: "Enter a message before sending chat." };
    }

    const now = Date.now();
    member.recentChatTimestamps = member.recentChatTimestamps.filter(
      (timestamp) => now - timestamp < CHAT_RATE_LIMIT_WINDOW_MS
    );

    if (member.recentChatTimestamps.length >= CHAT_RATE_LIMIT_MAX_MESSAGES) {
      return { ok: false, error: "You are sending messages too quickly. Wait a moment." };
    }

    member.recentChatTimestamps.push(now);
    this.addChatMessage(room, {
      id: createId("chat"),
      kind: "player",
      playerId: member.id,
      playerName: member.name,
      text,
      createdAt: now
    });
    this.emitRoom(room);

    return { ok: true, data: null };
  }

  claimAnswer(socket: Socket, request: ClaimAnswerRequest): SocketAck<null> {
    const membership = this.getPlayerMembership(socket.id, request.roomId);
    if (!membership.ok) {
      return membership;
    }

    const { room, player } = membership.data;
    if (room.phase !== "round-active" || !room.round) {
      return { ok: false, error: "There is no active round right now." };
    }

    if (room.settings.mode !== "factor" || room.settings.factorResolutionMode !== "golden-bell") {
      return { ok: false, error: "This round does not use golden bell claiming." };
    }

    if (room.round.submissions.some((submission) => submission.playerId === player.id)) {
      return { ok: false, error: "You already solved this round." };
    }

    if (this.getWrongAttemptCount(room, player.id) > 0) {
      return { ok: false, error: "You already missed your golden bell chance this round." };
    }

    if (room.round.answeringPlayerId) {
      if (room.round.answeringPlayerId === player.id) {
        return { ok: true, data: null };
      }

      return { ok: false, error: "Another player is already answering right now." };
    }

    const remainingMs = this.getRemainingMatchMs(room);
    if (remainingMs <= 0) {
      return { ok: false, error: "The round is already ending." };
    }

    const windowMs = Math.min(GOLDEN_BELL_WINDOW_MS, remainingMs);
    room.round.answeringPlayerId = player.id;
    room.round.answerWindowEndsAt = Date.now() + windowMs;
    this.clearAnswerWindowTimer(room);
    room.round.answerWindowTimer = setTimeout(() => {
      this.expireGoldenBellClaim(room.roomId, player.id);
    }, windowMs);
    room.message = `${player.name} called for the answer chance.`;
    room.messageKey = "golden-bell-claimed";
    room.messagePlayerName = player.name;
    this.emitRoom(room);

    return { ok: true, data: null };
  }

  submitAnswer(socket: Socket, request: SubmitAnswerRequest): SocketAck<SubmitAnswerResult> {
    const membership = this.getPlayerMembership(socket.id, request.roomId);
    if (!membership.ok) {
      return membership;
    }

    const { room, player } = membership.data;
    if (room.phase !== "round-active" || !room.round) {
      return { ok: false, error: "There is no active round right now." };
    }

    const existingSubmission = room.round.submissions.find((submission) => submission.playerId === player.id);
    if (existingSubmission) {
      return {
        ok: true,
        data: {
          isCorrect: true,
          normalizedAnswer: existingSubmission.normalizedAnswer
        }
      };
    }

    const wrongAttemptCount = this.getWrongAttemptCount(room, player.id);
    const isGoldenBellMode =
      room.settings.mode === "factor" && room.settings.factorResolutionMode === "golden-bell";
    const isLockedOut = isGoldenBellMode
      ? wrongAttemptCount > 0
      : room.settings.factorSingleAttempt && room.settings.mode === "factor" && wrongAttemptCount > 0;

    if (isLockedOut) {
      return {
        ok: true,
        data: {
          isCorrect: false,
          normalizedAnswer: "",
          attemptCount: wrongAttemptCount,
          isLockedOut: true
        }
      };
    }

    if (isGoldenBellMode && room.round.answeringPlayerId !== player.id) {
      return { ok: false, error: "Press the golden bell button before submitting an answer." };
    }

    // 정답 여부는 반드시 서버 기준으로 판정해서 점수와 순위를 신뢰 가능하게 유지한다.
    const evaluation = evaluateSubmission(room.round.challenge, request.answer);
    if (!evaluation.isCorrect && evaluation.reason === "chat" && !isGoldenBellMode) {
      return {
        ok: true,
        data: {
          isCorrect: false,
          normalizedAnswer: "",
          attemptCount: wrongAttemptCount,
          wasChatLike: true
        }
      };
    }

    if (!evaluation.isCorrect) {
      if (isGoldenBellMode) {
        return {
          ok: true,
          data: this.resolveGoldenBellFailure(room, player, {
            answer: request.answer.trim(),
            normalizedAnswer: evaluation.normalizedAnswer,
            reason: "wrong"
          })
        };
      }

      const submittedAt = Date.now();
      room.round.attempts.push({
        playerId: player.id,
        answer: request.answer.trim(),
        normalizedAnswer: evaluation.normalizedAnswer,
        submittedAt,
        kind: "wrong",
        scoreDelta: 0
      });
      this.addSystemChatMessage(room, {
        systemKey: "player-wrong",
        playerName: player.name,
        answerText: request.answer.trim()
      });
      this.emitRoom(room);

      return {
        ok: true,
        data: {
          isCorrect: false,
          normalizedAnswer: evaluation.normalizedAnswer,
          attemptCount: wrongAttemptCount + 1,
          isLockedOut:
            room.settings.factorSingleAttempt && room.settings.mode === "factor"
        }
      };
    }

    if (isGoldenBellMode) {
      this.clearAnswerWindowTimer(room);
      room.round.answeringPlayerId = null;
      room.round.answerWindowEndsAt = undefined;
    }

    const submittedAt = Date.now();
    const rank = room.round.submissions.length + 1;
    const scoringEndsAt = isGoldenBellMode
      ? room.round.answerWindowEndsAt ?? submittedAt
      : room.round.hasRoundTimer
        ? room.round.endsAt
        : submittedAt;
    const pointsAwarded = calculatePoints(rank, scoringEndsAt, submittedAt);
    room.round.submissions.push({
      playerId: player.id,
      answer: request.answer.trim(),
      normalizedAnswer: evaluation.normalizedAnswer,
      submittedAt,
      pointsAwarded,
      rank
    });

    player.score += pointsAwarded;
    player.correctAnswers += 1;
    this.addSystemChatMessage(room, {
      systemKey: "player-correct",
      playerName: player.name
    });

    if (rank === 1) {
      room.message = `${player.name} landed the first correct answer.`;
      room.messageKey = "first-correct";
    } else {
      room.message = `${player.name} locked in a correct answer.`;
      room.messageKey = "player-correct";
    }
    room.messagePlayerName = player.name;

    if (
      room.settings.mode === "factor" &&
      (room.settings.factorResolutionMode === "first-correct" ||
        isGoldenBellMode ||
        room.round.isSuddenDeath) &&
      rank === 1
    ) {
      this.endRound(room.roomId, "first-correct");
    } else if (this.haveAllConnectedPlayersAnswered(room)) {
      this.endRound(room.roomId, "all-correct");
    } else {
      this.emitRoom(room);
    }

    return {
      ok: true,
      data: {
        isCorrect: true,
        normalizedAnswer: evaluation.normalizedAnswer
      }
    };
  }

  disconnect(socketId: string) {
    const seat = this.socketToSeat.get(socketId);
    if (!seat) {
      return;
    }

    this.socketToSeat.delete(socketId);

    const room = this.rooms.get(seat.roomId);
    if (!room) {
      return;
    }

    if (seat.role === "spectator") {
      const spectator = room.spectators.find((candidate) => candidate.id === seat.memberId);
      if (!spectator) {
        return;
      }
      spectator.connected = false;
      this.scheduleMemberRemoval(room, spectator, "spectator");
      this.emitRoom(room);
      return;
    }

    const player = room.players.find((candidate) => candidate.id === seat.memberId);
    if (!player) {
      return;
    }
    player.connected = false;
    this.scheduleMemberRemoval(room, player, "player");
    this.emitRoom(room);
  }

  private getSeatMembership(
    socketId: string,
    roomId: string
  ): SocketAck<
    | { room: RoomRecord; role: "player"; player: PlayerRecord }
    | { room: RoomRecord; role: "spectator"; spectator: SpectatorRecord }
  > {
    const seat = this.socketToSeat.get(socketId);
    if (!seat || seat.roomId !== sanitizeRoomId(roomId)) {
      return { ok: false, error: "You are not connected to that room." };
    }

    const room = this.rooms.get(seat.roomId);
    if (!room) {
      return { ok: false, error: "That room has already been closed." };
    }

    if (seat.role === "spectator") {
      const spectator = room.spectators.find((candidate) => candidate.id === seat.memberId);
      if (!spectator) {
        return { ok: false, error: "Your seat in this room is no longer available." };
      }

      return { ok: true, data: { room, role: "spectator", spectator } };
    }

    const player = room.players.find((candidate) => candidate.id === seat.memberId);
    if (!player) {
      return { ok: false, error: "Your seat in this room is no longer available." };
    }

    return { ok: true, data: { room, role: "player", player } };
  }

  private getPlayerMembership(socketId: string, roomId: string): SocketAck<{ room: RoomRecord; player: PlayerRecord }> {
    const membership = this.getSeatMembership(socketId, roomId);
    if (!membership.ok) {
      return membership;
    }

    if (membership.data.role !== "player") {
      return { ok: false, error: "Spectators cannot use that action." };
    }

    return { ok: true, data: { room: membership.data.room, player: membership.data.player } };
  }

  private createUniqueRoomId() {
    let roomId = createRoomCode();
    while (this.rooms.has(roomId)) {
      roomId = createRoomCode();
    }
    return roomId;
  }

  private createUniqueMemberName(room: RoomRecord, requestedName: string, excludedMemberId?: string) {
    const takenNames = new Set(
      [...room.players, ...room.spectators]
        .filter((member) => member.id !== excludedMemberId)
        .map((member) => member.name.toLowerCase())
    );

    if (!takenNames.has(requestedName.toLowerCase())) {
      return requestedName;
    }

    let suffix = 2;
    while (suffix < 99) {
      const candidate = `${requestedName.slice(0, 14)} ${suffix}`.trim();
      if (!takenNames.has(candidate.toLowerCase())) {
        return candidate;
      }
      suffix += 1;
    }

    return `${requestedName.slice(0, 12)} guest`;
  }

  private startRound(room: RoomRecord) {
    this.clearCleanupTimer(room);
    this.clearRoundTimer(room);
    this.clearTransitionTimer(room);

    const now = Date.now();
    const roundNumber = room.completedRounds + 1;
    const challenge = generateChallenge(room.settings);
    const hasRoundTimer =
      !(room.settings.mode === "factor" && room.settings.factorResolutionMode === "golden-bell");
    room.phase = "round-active";
    room.autoResetAt = undefined;
    room.round = {
      roundNumber,
      challenge,
      startedAt: now,
      endsAt: hasRoundTimer ? now + room.settings.roundTimeSec * 1000 : 0,
      hasRoundTimer,
      isSuddenDeath: false,
      answeringPlayerId: null,
      submissions: [],
      attempts: [],
      timer: null,
      answerWindowTimer: null
    };
    room.message =
      room.settings.mode === "factor" && room.settings.factorResolutionMode === "golden-bell"
        ? `Round ${roundNumber} is live. Buzz first to earn a 10-second answer window.`
        : `Round ${roundNumber} is live. Fast correct answers get the biggest score boost.`;
    room.messageKey =
      room.settings.mode === "factor" && room.settings.factorResolutionMode === "golden-bell"
        ? "golden-bell-open"
        : "round-live";
    room.messagePlayerName = undefined;
    this.addSystemChatMessage(room, {
      systemKey: "match-started"
    });

    if (hasRoundTimer) {
      // 라운드 종료는 타이머 만료 또는 전원 정답 제출 두 경로로 일어난다.
      room.round.timer = setTimeout(() => {
        this.endRound(room.roomId, "timer");
      }, room.settings.roundTimeSec * 1000);
    }

    this.emitRoom(room);
  }

  private endRound(roomId: string, reason: "timer" | "all-correct" | "first-correct" | "all-resolved") {
    const room = this.rooms.get(roomId);
    if (!room || room.phase !== "round-active" || !room.round) {
      return;
    }

    if (
      reason === "timer" &&
      room.settings.mode === "factor" &&
      room.settings.factorResolutionMode === "all-play" &&
      room.settings.factorSuddenDeath &&
      room.round.submissions.length === 0 &&
      !room.round.isSuddenDeath
    ) {
      this.enterSuddenDeath(room);
      return;
    }

    this.clearRoundTimer(room);
    this.clearTransitionTimer(room);
    this.clearAnswerWindowTimer(room);
    room.completedRounds = room.round.roundNumber;
    room.completedRoundDurationsMs.push(Math.max(0, Date.now() - room.round.startedAt));
    room.phase = "round-ended";
    room.round.answeringPlayerId = null;
    room.round.answerWindowEndsAt = undefined;
    const delayMs =
      room.completedRounds >= room.settings.roundCount ? FINAL_RESULTS_DELAY_MS : ROUND_REVEAL_MS;
    room.round.transitionEndsAt = Date.now() + delayMs;

    if (reason === "first-correct") {
      room.message = "The first correct answer ended the round early.";
      room.messageKey = "first-correct";
      room.messagePlayerName = undefined;
    } else if (reason === "all-correct") {
      room.message = "Everyone still connected solved it. The next round will begin shortly.";
      room.messageKey = "all-correct";
      room.messagePlayerName = undefined;
    } else if (reason === "all-resolved") {
      room.message = "All answer chances are resolved. The answer is now on screen.";
      room.messageKey = "all-resolved";
      room.messagePlayerName = undefined;
    } else {
      room.message = "Time is up. The correct answer is now on screen.";
      room.messageKey = "time-up";
      room.messagePlayerName = undefined;
    }

    this.emitRoom(room);

    room.transitionTimer = setTimeout(() => {
      this.completeRoundTransition(room.roomId);
    }, delayMs);
  }

  private completeRoundTransition(roomId: string) {
    const room = this.rooms.get(roomId);
    if (!room || room.phase !== "round-ended" || !room.round) {
      return;
    }

    this.clearTransitionTimer(room);

    if (room.completedRounds >= room.settings.roundCount) {
      this.finalizeMatch(room);
      return;
    }

    this.startRound(room);
  }

  private enterSuddenDeath(room: RoomRecord) {
    if (!room.round) {
      return;
    }

    this.clearRoundTimer(room);
    this.clearAnswerWindowTimer(room);
    room.round.hasRoundTimer = false;
    room.round.isSuddenDeath = true;
    room.round.endsAt = 0;
    room.message = "No one solved it in time. Sudden death is now live.";
    room.messageKey = "sudden-death-open";
    room.messagePlayerName = undefined;
    this.emitRoom(room);
  }

  private finalizeMatch(room: RoomRecord, options?: { capped?: boolean }) {
    this.clearRoundTimer(room);
    this.clearTransitionTimer(room);
    this.clearAnswerWindowTimer(room);
    this.clearMatchCapTimer(room);
    room.phase = "finished";
    room.finalWinnerIds = this.computeWinnerIds(room);
    room.autoResetAt = Date.now() + RESULTS_AUTO_RESET_MS;
    room.message = options?.capped
      ? "The match hit the one-hour cap and was closed on the current scores."
      : room.finalWinnerIds.length > 1
        ? "The match is over with a tie at the top."
        : "The match is over. Final scores are locked in.";
    room.messageKey = options?.capped
      ? "match-cap-reached"
      : room.finalWinnerIds.length > 1
        ? "match-finished-tie"
        : "match-finished";
    room.messagePlayerName = undefined;
    this.emitRoom(room);
    room.transitionTimer = setTimeout(() => {
      this.resetRoomToLobby(room);
    }, RESULTS_AUTO_RESET_MS);
  }

  private forceFinishMatch(roomId: string) {
    const room = this.rooms.get(roomId);
    if (!room || room.phase === "lobby" || room.phase === "finished") {
      return;
    }

    if (room.phase === "round-active" && room.round) {
      room.completedRoundDurationsMs.push(Math.max(0, Date.now() - room.round.startedAt));
      room.round.answeringPlayerId = null;
      room.round.answerWindowEndsAt = undefined;
      room.round.transitionEndsAt = undefined;
    }

    this.finalizeMatch(room, { capped: true });
  }

  private computeWinnerIds(room: RoomRecord) {
    const sortedPlayers = sortPlayersByScore(room.players);
    const topScore = sortedPlayers[0]?.score ?? 0;
    return sortedPlayers
      .filter((player) => player.score === topScore)
      .map((player) => player.id);
  }

  private haveAllConnectedPlayersAnswered(room: RoomRecord) {
    if (room.phase !== "round-active" || !room.round) {
      return false;
    }

    const connectedPlayers = room.players.filter((player) => player.connected);
    if (connectedPlayers.length === 0) {
      return false;
    }

    return connectedPlayers.every((player) =>
      room.round?.submissions.some((submission) => submission.playerId === player.id)
    );
  }

  private getWrongAttemptCount(room: RoomRecord, playerId: string) {
    return room.round?.attempts.filter(
      (attempt) => attempt.playerId === playerId && attempt.kind === "wrong"
    ).length ?? 0;
  }

  private expireGoldenBellClaim(roomId: string, playerId: string) {
    const room = this.rooms.get(roomId);
    if (!room || room.phase !== "round-active" || !room.round) {
      return;
    }

    if (room.round.answeringPlayerId !== playerId) {
      return;
    }

    const player = room.players.find((candidate) => candidate.id === playerId);
    if (!player) {
      return;
    }

    this.resolveGoldenBellFailure(room, player, {
      answer: "",
      normalizedAnswer: "",
      reason: "timeout"
    });
  }

  private resolveGoldenBellFailure(
    room: RoomRecord,
    player: PlayerRecord,
    input: { answer: string; normalizedAnswer: string; reason: "wrong" | "timeout" }
  ): SubmitAnswerResult {
    if (!room.round) {
      return {
        isCorrect: false,
        normalizedAnswer: "",
        attemptCount: 0,
        isLockedOut: true
      };
    }

    this.clearAnswerWindowTimer(room);
    room.round.answeringPlayerId = null;
    room.round.answerWindowEndsAt = undefined;

    const submittedAt = Date.now();
    room.round.attempts.push({
      playerId: player.id,
      answer: input.answer,
      normalizedAnswer: input.normalizedAnswer,
      submittedAt,
      kind: "wrong",
      scoreDelta: -GOLDEN_BELL_PENALTY_POINTS
    });
    player.score -= GOLDEN_BELL_PENALTY_POINTS;

    if (input.reason === "timeout") {
      room.message = `${player.name} missed the golden bell answer window.`;
      room.messageKey = "golden-bell-timeout";
    } else {
      room.message = `${player.name} missed the golden bell answer and lost points.`;
      room.messageKey = "golden-bell-wrong";
      this.addSystemChatMessage(room, {
        systemKey: "player-wrong",
        playerName: player.name,
        answerText: input.answer
      });
    }

    room.messagePlayerName = player.name;

    if (this.haveAllGoldenBellPlayersResolved(room)) {
      this.endRound(room.roomId, "all-resolved");
    } else {
      this.emitRoom(room);
    }

    return {
      isCorrect: false,
      normalizedAnswer: input.normalizedAnswer,
      attemptCount: this.getWrongAttemptCount(room, player.id),
      isLockedOut: true,
      scoreDelta: -GOLDEN_BELL_PENALTY_POINTS
    };
  }

  private haveAllGoldenBellPlayersResolved(room: RoomRecord) {
    if (
      room.phase !== "round-active" ||
      !room.round ||
      room.settings.mode !== "factor" ||
      room.settings.factorResolutionMode !== "golden-bell"
    ) {
      return false;
    }

    const connectedPlayers = room.players.filter((player) => player.connected);
    if (connectedPlayers.length === 0) {
      return false;
    }

    return connectedPlayers.every(
      (player) =>
        room.round?.submissions.some((submission) => submission.playerId === player.id) ||
        this.getWrongAttemptCount(room, player.id) > 0
    );
  }

  private getRemainingMatchMs(room: RoomRecord) {
    return room.matchEndsAt ? Math.max(0, room.matchEndsAt - Date.now()) : MATCH_MAX_DURATION_MS;
  }

  private isPlayerLockedOutForRound(room: RoomRecord, playerId: string) {
    const wrongAttempts = this.getWrongAttemptCount(room, playerId);

    if (room.settings.mode !== "factor") {
      return false;
    }

    if (room.settings.factorResolutionMode === "golden-bell") {
      return wrongAttempts > 0;
    }

    return room.settings.factorSingleAttempt && wrongAttempts > 0;
  }

  private scheduleMemberRemoval(
    room: RoomRecord,
    member: PlayerRecord | SpectatorRecord,
    role: RoomRole
  ) {
    this.clearMemberDisconnectTimer(member);
    member.disconnectTimer = setTimeout(() => {
      const latestRoom = this.rooms.get(room.roomId);
      if (!latestRoom) {
        return;
      }

      if (role === "spectator") {
        this.finalizeSpectatorRemoval(latestRoom, member.id);
      } else {
        this.finalizePlayerRemoval(latestRoom, member.id);
      }
    }, RECONNECT_GRACE_MS).unref();
  }

  private clearMemberDisconnectTimer(member: PlayerRecord | SpectatorRecord) {
    if (!member.disconnectTimer) {
      return;
    }

    clearTimeout(member.disconnectTimer);
    member.disconnectTimer = null;
  }

  private finalizeSpectatorRemoval(room: RoomRecord, spectatorId: string) {
    const spectator = room.spectators.find((candidate) => candidate.id === spectatorId);
    if (!spectator || spectator.connected) {
      return;
    }

    this.clearMemberDisconnectTimer(spectator);
    room.spectators = room.spectators.filter((candidate) => candidate.id !== spectator.id);

    if (room.players.length === 0 && room.spectators.length === 0) {
      this.scheduleCleanup(room);
      return;
    }

    this.emitRoom(room);
  }

  private finalizePlayerRemoval(room: RoomRecord, playerId: string) {
    const player = room.players.find((candidate) => candidate.id === playerId);
    if (!player || player.connected) {
      return;
    }

    this.clearMemberDisconnectTimer(player);

    const removedName = player.name;
    const removedWasHost = player.isHost;
    const removedWasAnswering = room.round?.answeringPlayerId === player.id;
    room.players = room.players.filter((candidate) => candidate.id !== player.id);

    if (room.players.length === 0) {
      if (room.spectators.length > 0) {
        this.resetRoomToLobby(room);
        this.promoteFirstConnectedSpectatorToHost(room);
        if (room.players.length > 0) {
          room.message = `${room.players[0]?.name ?? "A spectator"} took the host seat after everyone left.`;
          room.messageKey = "host-transferred";
          room.messagePlayerName = room.players[0]?.name;
          this.emitRoom(room);
          return;
        }
      }

      this.scheduleCleanup(room);
      return;
    }

    if (removedWasHost) {
      this.promoteNextHost(room);
    }

    room.message = `${removedName} left the room.`;
    room.messageKey = "player-left";
    room.messagePlayerName = removedName;

    if (removedWasAnswering && room.round) {
      this.clearAnswerWindowTimer(room);
      room.round.answeringPlayerId = null;
      room.round.answerWindowEndsAt = undefined;
    }

    if (this.haveAllGoldenBellPlayersResolved(room)) {
      this.endRound(room.roomId, "all-resolved");
      return;
    }

    if (this.haveAllConnectedPlayersAnswered(room)) {
      this.endRound(room.roomId, "all-correct");
      return;
    }

    if (!room.players.some((candidate) => candidate.connected) && !room.spectators.some((candidate) => candidate.connected)) {
      this.scheduleCleanup(room);
    }

    this.emitRoom(room);
  }

  private promoteNextHost(room: RoomRecord) {
    const nextHost = room.players.find((candidate) => candidate.connected) ?? room.players[0];
    for (const player of room.players) {
      player.isHost = player.id === nextHost?.id;
      if (player.isHost) {
        player.isReady = false;
      }
    }
    return nextHost;
  }

  private promoteFirstConnectedSpectatorToHost(room: RoomRecord) {
    const spectatorIndex = room.spectators.findIndex((candidate) => candidate.connected);
    if (spectatorIndex < 0) {
      return null;
    }

    const [promoted] = room.spectators.splice(spectatorIndex, 1);
    if (!promoted) {
      return null;
    }

    const playerId = createId("player");
    room.players.push({
      id: playerId,
      name: this.createUniqueMemberName(room, promoted.name),
      score: 0,
      isHost: true,
      connected: true,
      correctAnswers: 0,
      isReady: false,
      socketId: promoted.socketId,
      recentChatTimestamps: promoted.recentChatTimestamps,
      disconnectTimer: null
    });

    if (promoted.socketId) {
      this.socketToSeat.set(promoted.socketId, { roomId: room.roomId, memberId: playerId, role: "player" });
    }

    return room.players.at(-1) ?? null;
  }

  private resetRoomScores(room: RoomRecord) {
    for (const player of room.players) {
      player.score = 0;
      player.correctAnswers = 0;
      player.isReady = false;
    }
  }

  private emitRoom(room: RoomRecord) {
    this.io.to(room.roomId).emit("room:state", this.toSnapshot(room));
  }

  private addChatMessage(room: RoomRecord, entry: ChatMessage) {
    room.chatFeed = [...room.chatFeed, entry];
  }

  private addSystemChatMessage(
    room: RoomRecord,
    input: Pick<ChatMessage, "systemKey" | "playerName" | "answerText">
  ) {
    this.addChatMessage(room, {
      id: createId("system-chat"),
      kind: "system",
      text: "",
      systemKey: input.systemKey,
      playerName: input.playerName,
      answerText: input.answerText,
      createdAt: Date.now()
    });
  }

  private toSnapshot(room: RoomRecord): RoomSnapshot {
    // 내부 상태(RoomRecord)를 클라이언트 전송용 스냅샷으로 변환한다.
    // round-active 중에는 다른 사람의 정답 전문을 숨기고 제출 여부만 노출한다.
    return {
      roomId: room.roomId,
      roomName: room.roomName,
      invitePath: room.invitePath,
      phase: room.phase,
      settings: room.settings,
      players: room.players.map((player) => ({
        id: player.id,
        name: player.name,
        score: player.score,
        isHost: player.isHost,
        connected: player.connected,
        correctAnswers: player.correctAnswers,
        isReady: player.isReady
      })),
      spectators: room.spectators.map((spectator) => ({
        id: spectator.id,
        name: spectator.name,
        connected: spectator.connected
      })),
      round: room.round
        ? {
            roundNumber: room.round.roundNumber,
            mode: room.settings.mode,
            prompt: room.round.challenge.prompt,
            helperText: room.round.challenge.helperText,
            challengeMeta: room.round.challenge.meta,
            startedAt: room.round.startedAt,
            endsAt: room.round.endsAt,
            hasRoundTimer: room.round.hasRoundTimer,
            isSuddenDeath: room.round.isSuddenDeath,
            answeringPlayerId:
              room.phase === "round-active" ? room.round.answeringPlayerId ?? undefined : undefined,
            answerWindowEndsAt:
              room.phase === "round-active" ? room.round.answerWindowEndsAt : undefined,
            transitionEndsAt: room.phase === "round-ended" ? room.round.transitionEndsAt : undefined,
            revealedAnswer:
              room.phase === "round-active" ? undefined : room.round.challenge.prettyAnswer,
            playerStatuses: room.players.map((player) => {
              const submission = room.round?.submissions.find(
                (candidate) => candidate.playerId === player.id
              );
              const attempts =
                room.round?.attempts.filter(
                  (candidate) => candidate.playerId === player.id && candidate.kind === "wrong"
                ) ?? [];
              const latestAttempt =
                room.round?.attempts
                  .filter((candidate) => candidate.playerId === player.id)
                  .sort((left, right) => right.submittedAt - left.submittedAt)[0] ?? null;

              if (!submission) {
                return {
                  playerId: player.id,
                  hasSubmitted: false,
                  attemptCount: attempts.length,
                  scoreDelta: latestAttempt?.scoreDelta ?? 0,
                  lastSubmissionKind: latestAttempt?.kind,
                  lastSubmissionText: latestAttempt?.answer,
                  lastSubmittedAt: latestAttempt?.submittedAt,
                  isLockedOut: this.isPlayerLockedOutForRound(room, player.id),
                  isAnswering: room.round?.answeringPlayerId === player.id
                };
              }

              if (room.phase === "round-active") {
                return {
                  playerId: player.id,
                  hasSubmitted: true,
                  attemptCount: attempts.length,
                  scoreDelta: submission.pointsAwarded,
                  lastSubmissionKind: "correct",
                  lastSubmittedAt: submission.submittedAt,
                  isAnswering: room.round?.answeringPlayerId === player.id
                };
              }

              return {
                playerId: player.id,
                hasSubmitted: true,
                isCorrect: true,
                answer: submission.answer,
                submittedAt: submission.submittedAt,
                pointsAwarded: submission.pointsAwarded,
                scoreDelta: submission.pointsAwarded,
                rank: submission.rank,
                attemptCount: attempts.length,
                lastSubmissionKind: "correct",
                lastSubmissionText: submission.answer,
                lastSubmittedAt: submission.submittedAt,
                isAnswering: room.round?.answeringPlayerId === player.id
              };
            })
          }
        : null,
      completedRounds: room.completedRounds,
      finalWinnerIds: room.finalWinnerIds,
      chatFeed: room.chatFeed,
      matchStartedAt: room.matchStartedAt,
      matchEndsAt: room.matchEndsAt,
      totalMatchDurationMs: room.completedRoundDurationsMs.reduce((total, value) => total + value, 0),
      averageRoundDurationMs:
        room.completedRoundDurationsMs.length === 0
          ? 0
          : Math.round(
              room.completedRoundDurationsMs.reduce((total, value) => total + value, 0) /
                room.completedRoundDurationsMs.length
            ),
      autoResetAt: room.autoResetAt,
      message: room.message,
      messageKey: room.messageKey,
      messagePlayerName: room.messagePlayerName
    };
  }

  private clearRoundTimer(room: RoomRecord) {
    if (!room.round?.timer) {
      return;
    }

    clearTimeout(room.round.timer);
    room.round.timer = null;
  }

  private clearAnswerWindowTimer(room: RoomRecord) {
    if (!room.round?.answerWindowTimer) {
      return;
    }

    clearTimeout(room.round.answerWindowTimer);
    room.round.answerWindowTimer = null;
  }

  private clearTransitionTimer(room: RoomRecord) {
    if (!room.transitionTimer) {
      return;
    }

    clearTimeout(room.transitionTimer);
    room.transitionTimer = null;
  }

  private scheduleMatchCapTimer(room: RoomRecord) {
    this.clearMatchCapTimer(room);

    if (!room.matchEndsAt) {
      return;
    }

    const remainingMs = Math.max(0, room.matchEndsAt - Date.now());
    room.matchCapTimer = setTimeout(() => {
      this.forceFinishMatch(room.roomId);
    }, remainingMs);
  }

  private clearMatchCapTimer(room: RoomRecord) {
    if (!room.matchCapTimer) {
      return;
    }

    clearTimeout(room.matchCapTimer);
    room.matchCapTimer = null;
  }

  private scheduleCleanup(room: RoomRecord) {
    if (room.cleanupTimer) {
      return;
    }

    // DB가 없기 때문에, 모든 플레이어가 나간 방은 일정 시간 후 메모리에서 제거한다.
    room.cleanupTimer = setTimeout(() => {
      const latestRoom = this.rooms.get(room.roomId);
      if (!latestRoom) {
        return;
      }

      if (
        latestRoom.players.some((player) => player.connected) ||
        latestRoom.spectators.some((spectator) => spectator.connected)
      ) {
        latestRoom.cleanupTimer = null;
        return;
      }

      this.clearRoundTimer(latestRoom);
      this.clearTransitionTimer(latestRoom);
      this.clearAnswerWindowTimer(latestRoom);
      this.clearMatchCapTimer(latestRoom);
      this.rooms.delete(latestRoom.roomId);
    }, ROOM_IDLE_GRACE_MS);
  }

  private clearCleanupTimer(room: RoomRecord) {
    if (!room.cleanupTimer) {
      return;
    }

    clearTimeout(room.cleanupTimer);
    room.cleanupTimer = null;
  }

  private haveAllRequiredPlayersReady(room: RoomRecord) {
    const requiredPlayers = room.players.filter(
      (candidate) => candidate.connected && !candidate.isHost
    );
    if (requiredPlayers.length === 0) {
      return true;
    }

    return requiredPlayers.every((candidate) => candidate.isReady);
  }

  private resetRoomToLobby(room: RoomRecord) {
    this.clearRoundTimer(room);
    this.clearTransitionTimer(room);
    this.clearAnswerWindowTimer(room);
    room.phase = "lobby";
    room.round = null;
    room.completedRounds = 0;
    room.finalWinnerIds = [];
    room.matchStartedAt = undefined;
    room.matchEndsAt = undefined;
    room.autoResetAt = undefined;
    room.completedRoundDurationsMs = [];
    this.clearMatchCapTimer(room);
    this.resetRoomScores(room);
    room.message = "Back in the lobby. Tweak the settings or start another match.";
    room.messageKey = "reset-lobby";
    room.messagePlayerName = undefined;
    this.emitRoom(room);
  }
}

function areLobbySettingsEqual(left: LobbySettings, right: LobbySettings) {
  return (
    left.mode === right.mode &&
    left.roundCount === right.roundCount &&
    left.roundTimeSec === right.roundTimeSec &&
    left.binaryDecimalToBinaryChance === right.binaryDecimalToBinaryChance &&
    left.binaryLivePreview === right.binaryLivePreview &&
    left.factorResolutionMode === right.factorResolutionMode &&
    left.factorPrimeAnswerMode === right.factorPrimeAnswerMode &&
    left.factorOrderedAnswer === right.factorOrderedAnswer &&
    left.factorSingleAttempt === right.factorSingleAttempt &&
    left.factorSuddenDeath === right.factorSuddenDeath
  );
}
