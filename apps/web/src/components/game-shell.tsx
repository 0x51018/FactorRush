"use client";

/**
 * Next.js 클라이언트 셸.
 *
 * 구조:
 * - App Router는 URL만 분기하고
 * - 실제 실시간 게임 상태와 소켓 연결은 이 컴포넌트가 관리한다.
 *
 * 이번 개정에서는
 * - 한/영 UI 전환
 * - 진행 중 화면 정보 밀도 축소
 * - 서버에서 내려온 구조 데이터를 기반으로 한 문제 문구 현지화
 * 를 함께 반영했다.
 */
import {
  startTransition,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type FormEvent,
  type ReactNode,
  type RefObject,
  type SetStateAction
} from "react";
import { useRouter } from "next/navigation";
import { BlockMath } from "react-katex";
import { io, type Socket } from "socket.io-client";
import {
  DEFAULT_LOBBY_SETTINGS,
  DEFAULT_MATCH_SETTINGS,
  GOLDEN_BELL_PENALTY_POINTS,
  MAX_PLAYERS_PER_ROOM,
  PLAYER_NAME_MAX_LENGTH,
  SCORE_BASE_POINTS_BY_RANK,
  SCORE_FALLBACK_POINTS,
  SCORE_SPEED_BONUS_PER_SECOND,
  clampMatchSettings,
  clampSettings,
  createInvitePath,
  getBinaryPreviewValue,
  type MatchSettings,
  sanitizePlayerName,
  sanitizeRoomId,
  sortPlayersByScore,
  type BinaryChallengeMeta,
  type FactorResolutionMode,
  type GameMode,
  type JoinRoomResult,
  type LobbySettings,
  type PlayerRoundStatus,
  type PrimeFactorChallengeMeta,
  type RoomRole,
  type RoomSnapshot,
  type SocketAck,
  type SubmitAnswerResult
} from "@factorrush/shared";
import {
  getBinaryRatioSummary,
  getChallengeCopy,
  getCopy,
  getDefaultLocale,
  getFactorResolutionSummary,
  getModeDescriptionByLocale,
  getModeLabelByLocale,
  getRoomMessageByLocale,
  type Locale
} from "../lib/game-copy";
import styles from "./game-shell.module.css";

type BusyState =
  | "create"
  | "join"
  | "leave"
  | "kick"
  | "settings"
  | "start"
  | "claim"
  | "submit"
  | "advance"
  | "reset"
  | null;

type DensityMode = "normal" | "compact" | "tight";
type RailMode = "inline" | "peek";
type LobbyRulesMode = "inline" | "modal";
type RoundRosterMode = "full" | "compact";
type RailPanelId = "invite" | "rules" | "chat" | "players";
type ScrollMode = "fit" | "scroll";

type ResponsiveRoomLayoutState = {
  density: DensityMode;
  railMode: RailMode;
  lobbyRulesMode: LobbyRulesMode;
  roundRosterMode: RoundRosterMode;
  isMobileViewport: boolean;
};

const DEFAULT_RESPONSIVE_ROOM_LAYOUT_STATE: ResponsiveRoomLayoutState = {
  density: "normal",
  railMode: "inline",
  lobbyRulesMode: "inline",
  roundRosterMode: "full",
  isMobileViewport: false
};

type ThemeMode = "light" | "dark";
const DISPLAY_NAME_KEY = "factorrush:last-name";
const ROOM_SESSION_PREFIX = "factorrush:room:";
const LOCALE_STORAGE_KEY = "factorrush:locale";
const THEME_STORAGE_KEY = "factorrush:theme";
let sharedSocket: Socket | null = null;
let latestSharedRoomState: RoomSnapshot | null = null;
const FLOATING_PRIME_DECORATIONS = createFloatingPrimeDecorations();

interface GameShellProps {
  initialRoomId?: string;
}

export function GameShell({ initialRoomId }: GameShellProps) {
  const router = useRouter();
  const pageRef = useRef<HTMLElement | null>(null);
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [memberRole, setMemberRole] = useState<RoomRole | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [roomCode, setRoomCode] = useState(initialRoomId ?? "");
  const [createMode, setCreateMode] = useState<GameMode>("factor");
  const [settingsDraft, setSettingsDraft] = useState<LobbySettings>(DEFAULT_LOBBY_SETTINGS);
  const [matchSettingsDraft, setMatchSettingsDraft] = useState<MatchSettings>(DEFAULT_MATCH_SETTINGS);
  const [answerDraft, setAnswerDraft] = useState("");
  const [feedback, setFeedback] = useState("");
  const [busyState, setBusyState] = useState<BusyState>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [now, setNow] = useState(0);
  const [locale, setLocale] = useState<Locale>("ko");
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [pageScrollMode, setPageScrollMode] = useState<ScrollMode>("fit");
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const attemptedReconnectRef = useRef<string | null>(null);
  const lastInviteFallbackRef = useRef<string>("");
  const pendingSettingsRef = useRef<LobbySettings | null>(null);
  const settingsDraftRef = useRef<LobbySettings>(DEFAULT_LOBBY_SETTINGS);
  const pendingMatchSettingsRef = useRef<MatchSettings | null>(null);
  const matchSettingsDraftRef = useRef<MatchSettings>(DEFAULT_MATCH_SETTINGS);
  const lastRoomToastRef = useRef<string>("");
  const lastLobbyReadyCountRef = useRef<number | null>(null);
  const createNameInputRef = useRef<HTMLInputElement | null>(null);
  const joinNameInputRef = useRef<HTMLInputElement | null>(null);
  const joinRoomCodeInputRef = useRef<HTMLInputElement | null>(null);
  const answerInputRef = useRef<HTMLInputElement | null>(null);
  const displayNameComposingRef = useRef(false);

  const activeRoomId = room?.roomId ?? initialRoomId ?? null;
  const copy = getCopy(locale);
  const showAmbientInfo = !room || room.phase === "lobby" || room.phase === "finished";

  async function emitWithAck<TResponse>(eventName: string, payload: unknown): Promise<TResponse> {
    const socket = socketRef.current;
    if (!socket) {
      throw new Error("실시간 연결이 아직 준비되지 않았습니다.");
    }

    if (!socket.connected) {
      socket.connect();
    }

    return await new Promise<TResponse>((resolve, reject) => {
      socket.emit(eventName, payload, (response: SocketAck<TResponse>) => {
        if (response.ok) {
          resolve(response.data);
          return;
        }

        reject(new Error(response.error));
      });
    });
  }

  useEffect(() => {
    const socket = getSharedSocket();
    const connectListener = () => {
      setIsConnected(true);
    };
    const disconnectListener = () => {
      setIsConnected(false);
    };
    const roomStateListener = (nextRoom: RoomSnapshot) => {
      startTransition(() => {
        setRoom(nextRoom);
      });
    };
    const kickedListener = ({ roomId }: { roomId: string }) => {
      clearRoomSession(roomId);
      resetLocalRoomState(roomId);
      setBusyState(null);
      setFeedback(
        locale === "ko" ? "방장에 의해 방에서 추방되었습니다." : "The host removed you from the room."
      );
    };

    socketRef.current = socket;
    socket.on("connect", connectListener);
    socket.on("disconnect", disconnectListener);
    socket.on("room:state", roomStateListener);
    socket.on("room:kicked", kickedListener);
    if (latestSharedRoomState && (!initialRoomId || latestSharedRoomState.roomId === initialRoomId)) {
      setRoom(latestSharedRoomState);
    }
    socket.connect();

    return () => {
      socket.off("connect", connectListener);
      socket.off("disconnect", disconnectListener);
      socket.off("room:state", roomStateListener);
      socket.off("room:kicked", kickedListener);
      socketRef.current = null;
    };
  }, [initialRoomId, locale]);

  useEffect(() => {
    setRoomCode(initialRoomId ?? "");
    attemptedReconnectRef.current = null;
  }, [initialRoomId]);

  useEffect(() => {
    if (playerId) {
      return;
    }

    const sessionRoomId = room?.roomId ?? initialRoomId;
    if (!sessionRoomId) {
      return;
    }

    const savedSession = readRoomSession(sessionRoomId);
    if (savedSession) {
      setPlayerId(savedSession.playerId);
      setMemberRole(savedSession.role ?? null);
    }
  }, [initialRoomId, playerId, room?.roomId]);

  useEffect(() => {
    if (!room || room.phase !== "lobby") {
      pendingSettingsRef.current = null;
      pendingMatchSettingsRef.current = null;
      return;
    }

    if (pendingSettingsRef.current) {
      if (areSettingsEqual(room.settings, pendingSettingsRef.current)) {
        pendingSettingsRef.current = null;
        settingsDraftRef.current = room.settings;
        setSettingsDraft(room.settings);
      }
      return;
    }

    settingsDraftRef.current = room.settings;
    setSettingsDraft(room.settings);
  }, [room]);

  useEffect(() => {
    settingsDraftRef.current = settingsDraft;
  }, [settingsDraft]);

  useEffect(() => {
    if (!room || room.phase !== "lobby") {
      pendingMatchSettingsRef.current = null;
      return;
    }

    if (pendingMatchSettingsRef.current) {
      if (areMatchSettingsEqual(room.matchSettings, pendingMatchSettingsRef.current)) {
        pendingMatchSettingsRef.current = null;
        matchSettingsDraftRef.current = room.matchSettings;
        setMatchSettingsDraft(room.matchSettings);
      }
      return;
    }

    matchSettingsDraftRef.current = room.matchSettings;
    setMatchSettingsDraft(room.matchSettings);
  }, [room]);

  useEffect(() => {
    matchSettingsDraftRef.current = matchSettingsDraft;
  }, [matchSettingsDraft]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const savedLocale = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    const nextLocale = savedLocale === "en" || savedLocale === "ko" ? savedLocale : getDefaultLocale();
    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    const nextTheme = savedTheme === "dark" ? "dark" : "light";
    const savedDisplayName = window.localStorage.getItem(DISPLAY_NAME_KEY) ?? "";

    setDisplayName(sanitizePlayerName(savedDisplayName));
    setLocale(nextLocale);
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    setPreferencesLoaded(true);
  }, []);

  useEffect(() => {
    setNow(Date.now());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !preferencesLoaded) {
      return;
    }

    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  }, [locale, preferencesLoaded]);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.dataset.theme = theme;
    }

    if (typeof window === "undefined" || !preferencesLoaded) {
      return;
    }

    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [preferencesLoaded, theme]);

  useEffect(() => {
    if (!room || !playerId || typeof window === "undefined") {
      return;
    }

    const currentMember =
      room.players.find((candidate) => candidate.id === playerId) ??
      room.spectators.find((candidate) => candidate.id === playerId);
    if (!currentMember) {
      return;
    }

    if (displayName !== currentMember.name) {
      setDisplayName(currentMember.name);
    }

    const resolvedRole: RoomRole = room.players.some((candidate) => candidate.id === playerId)
      ? "player"
      : "spectator";
    setMemberRole(resolvedRole);
    window.localStorage.setItem(DISPLAY_NAME_KEY, currentMember.name);
    writeRoomSession(room.roomId, playerId, currentMember.name, resolvedRole);
  }, [displayName, playerId, room]);

  useEffect(() => {
    if (
      !room ||
      !(
        (room.round && (room.phase === "round-active" || room.phase === "round-ended")) ||
        (room.phase === "finished" && room.autoResetAt)
      )
    ) {
      return;
    }

    setNow(Date.now());
    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 200);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [room?.autoResetAt, room?.phase, room?.round?.endsAt, room?.round?.transitionEndsAt]);

  useEffect(() => {
    setAnswerDraft("");
  }, [room?.round?.roundNumber, room?.phase]);

  useEffect(() => {
    if (!feedback) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setFeedback("");
    }, 3200);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [feedback]);

  useEffect(() => {
    if (!room) {
      lastLobbyReadyCountRef.current = null;
      return;
    }

    const currentReadyCount =
      room.phase === "lobby"
        ? room.players.filter(
            (candidate) => candidate.connected && !candidate.isHost && candidate.isReady
          ).length
        : null;
    const previousReadyCount = lastLobbyReadyCountRef.current;
    lastLobbyReadyCountRef.current = currentReadyCount;

    if (
      room.messageKey !== "settings-updated" &&
      room.messageKey !== "settings-updated-reset-ready" &&
      room.messageKey !== "player-kicked" &&
      room.messageKey !== "player-left" &&
      room.messageKey !== "host-transferred"
    ) {
      return;
    }

    if (
      room.phase !== "lobby" &&
      room.messageKey !== "player-kicked" &&
      room.messageKey !== "player-left" &&
      room.messageKey !== "host-transferred"
    ) {
      return;
    }

    const isLocalHost =
      room.messageKey === "settings-updated" || room.messageKey === "settings-updated-reset-ready"
        ? room.players.some((candidate) => candidate.id === playerId && candidate.isHost)
        : true;
    if (!isLocalHost) {
      return;
    }

    const resolvedMessageKey =
      room.messageKey === "settings-updated" &&
      previousReadyCount != null &&
      previousReadyCount > 0 &&
      currentReadyCount === 0
        ? "settings-updated-reset-ready"
        : room.messageKey;
    const toastKey = `${room.roomId}:${resolvedMessageKey}:${room.message}`;
    if (lastRoomToastRef.current === toastKey) {
      return;
    }

    lastRoomToastRef.current = toastKey;
    setFeedback(getRoomMessageByLocale(locale, resolvedMessageKey, room.messagePlayerName));
  }, [locale, playerId, room]);

  useEffect(() => {
    if (!initialRoomId || room || !isConnected) {
      return;
    }

    if (attemptedReconnectRef.current === initialRoomId) {
      return;
    }

    const savedSession = readRoomSession(initialRoomId);
    if (!savedSession) {
      return;
    }

    attemptedReconnectRef.current = initialRoomId;
    setDisplayName(sanitizePlayerName(savedSession.name));
    setBusyState("join");

    void emitWithAck<JoinRoomResult>("room:join", {
      roomId: initialRoomId,
      playerName: savedSession.name,
      reconnectMemberId: savedSession.playerId
    })
      .then((result) => {
        setPlayerId(result.playerId);
        setMemberRole(result.role);
        writeRoomSession(result.roomId, result.playerId, savedSession.name, result.role);
        setFeedback(result.role === "spectator" ? copy.spectatorReconnectSuccess : copy.reconnectSuccess);
      })
      .catch(() => {
        clearRoomSession(initialRoomId);
        setFeedback(copy.reconnectExpired);
      })
      .finally(() => {
        setBusyState(null);
      });
  }, [copy.reconnectExpired, copy.reconnectSuccess, initialRoomId, isConnected, room]);

  const sortedPlayers = room ? sortPlayersByScore(room.players) : [];
  const currentPlayer = room?.players.find((candidate) => candidate.id === playerId) ?? null;
  const currentSpectator = room?.spectators.find((candidate) => candidate.id === playerId) ?? null;
  const myRoundStatus =
    room?.round?.playerStatuses.find((candidate) => candidate.playerId === playerId) ?? null;
  const isSpectator = currentSpectator != null || memberRole === "spectator";
  const isHost = currentPlayer?.isHost ?? false;
  const browserOrigin =
    typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1:3000";
  const inviteUrl = activeRoomId
    ? new URL(createInvitePath(activeRoomId), browserOrigin).toString()
    : "";
  const roundHasTimer = room?.round?.hasRoundTimer ?? false;
  const roundDuration = room?.round && roundHasTimer ? room.settings.roundTimeSec * 1000 : 0;
  const roundRemainingMs =
    room?.round && roundHasTimer
      ? room.round.isMainTimerPaused
        ? room.round.mainTimerRemainingMs ?? 0
        : Math.max(0, room.round.endsAt - now)
      : 0;
  const roundRemainingSeconds = Math.ceil(roundRemainingMs / 1000);
  const progressRatio =
    room?.round && roundDuration > 0 ? Math.max(0, Math.min(1, roundRemainingMs / roundDuration)) : 0;

  useEffect(() => {
    if (room?.phase !== "round-active" || myRoundStatus?.hasSubmitted || isSpectator) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      answerInputRef.current?.focus();
      answerInputRef.current?.select();
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [isSpectator, myRoundStatus?.hasSubmitted, room?.phase, room?.round?.roundNumber]);

  useEffect(() => {
    const handleGlobalEnterFocus = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
        return;
      }

      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLButtonElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }

      const nextTarget =
        room?.phase === "round-active" && !myRoundStatus?.hasSubmitted && !isSpectator
          ? answerInputRef.current
          : initialRoomId || roomCode
            ? !displayName.trim()
              ? joinNameInputRef.current
              : joinRoomCodeInputRef.current
            : createNameInputRef.current;

      if (!nextTarget) {
        return;
      }

      event.preventDefault();
      nextTarget.focus();
      nextTarget.select();
    };

    window.addEventListener("keydown", handleGlobalEnterFocus);
    return () => {
      window.removeEventListener("keydown", handleGlobalEnterFocus);
    };
  }, [displayName, initialRoomId, isSpectator, myRoundStatus?.hasSubmitted, room?.phase, roomCode]);

  const navigateToRoom = (roomId: string) => {
    router.push(createInvitePath(roomId));
  };

  const resetLocalRoomState = (nextRoomCode = "") => {
    latestSharedRoomState = null;
    setRoom(null);
    setPlayerId(null);
    setMemberRole(null);
    setAnswerDraft("");
    setRoomCode(nextRoomCode);
  };

  const commitDisplayName = (value: string) => {
    setDisplayName(sanitizePlayerName(value));
  };

  const handleDisplayNameChange = (value: string) => {
    if (displayNameComposingRef.current) {
      setDisplayName(value);
      return;
    }

    commitDisplayName(value);
  };

  const handleDisplayNameCompositionStart = () => {
    displayNameComposingRef.current = true;
  };

  const handleDisplayNameCompositionEnd = (value: string) => {
    displayNameComposingRef.current = false;
    commitDisplayName(value);
  };

  const handleCreateRoom = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const playerName = sanitizePlayerName(displayName).trim();
    if (playerName !== displayName) {
      setDisplayName(playerName);
    }
    if (!playerName) {
      setFeedback(copy.enterNicknameFirst);
      return;
    }

    setBusyState("create");

    try {
      const result = await emitWithAck<JoinRoomResult>("room:create", {
        playerName,
        settings: { mode: createMode }
      });
      window.localStorage.setItem(DISPLAY_NAME_KEY, playerName);
      writeRoomSession(result.roomId, result.playerId, playerName, result.role);
      setPlayerId(result.playerId);
      setMemberRole(result.role);
      setRoomCode(result.roomId);
      navigateToRoom(result.roomId);
    } catch (error) {
      setFeedback(getErrorMessage(error, locale));
    } finally {
      setBusyState(null);
    }
  };

  const handleJoinRoom = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const playerName = sanitizePlayerName(displayName).trim();
    if (playerName !== displayName) {
      setDisplayName(playerName);
    }
    const normalizedRoomId = sanitizeRoomId(roomCode);

    if (!playerName) {
      setFeedback(copy.enterNicknameFirst);
      return;
    }

    if (!normalizedRoomId) {
      setFeedback(copy.enterValidRoomCode);
      return;
    }

    setBusyState("join");

    try {
      const savedSession = readRoomSession(normalizedRoomId);
      const result = await emitWithAck<JoinRoomResult>("room:join", {
        roomId: normalizedRoomId,
        playerName,
        reconnectMemberId: savedSession?.playerId
      });
      window.localStorage.setItem(DISPLAY_NAME_KEY, playerName);
      writeRoomSession(result.roomId, result.playerId, playerName, result.role);
      setPlayerId(result.playerId);
      setMemberRole(result.role);
      setFeedback(result.role === "spectator" ? copy.spectatorJoinSuccess : "");
      navigateToRoom(result.roomId);
    } catch (error) {
      setFeedback(getErrorMessage(error, locale));
    } finally {
      setBusyState(null);
    }
  };

  const handleSettingsDraftChange = (updater: SetStateAction<LobbySettings>) => {
    const currentDraft = settingsDraftRef.current;
    const nextDraft = clampSettings(
      typeof updater === "function" ? updater(currentDraft) : updater
    );
    if (areSettingsEqual(currentDraft, nextDraft)) {
      return;
    }

    settingsDraftRef.current = nextDraft;
    setSettingsDraft(nextDraft);
    pendingSettingsRef.current = nextDraft;

    if (
      room?.phase === "lobby" &&
      room.players.some((candidate) => candidate.id === playerId && candidate.isHost)
    ) {
      void emitWithAck<null>("room:update-settings", {
        roomId: room.roomId,
        settings: nextDraft
      }).catch((error) => {
        pendingSettingsRef.current = null;
        setFeedback(getErrorMessage(error, locale));
      });
    }
  };

  const handleMatchSettingsDraftChange = (updater: SetStateAction<MatchSettings>) => {
    const currentDraft = matchSettingsDraftRef.current;
    const nextDraft = clampMatchSettings(
      typeof updater === "function" ? updater(currentDraft) : updater
    );
    if (areMatchSettingsEqual(currentDraft, nextDraft)) {
      return;
    }

    matchSettingsDraftRef.current = nextDraft;
    setMatchSettingsDraft(nextDraft);
    pendingMatchSettingsRef.current = nextDraft;

    if (
      room?.phase === "lobby" &&
      room.players.some((candidate) => candidate.id === playerId && candidate.isHost)
    ) {
      void emitWithAck<null>("room:update-match-settings", {
        roomId: room.roomId,
        matchSettings: nextDraft
      }).catch((error) => {
        pendingMatchSettingsRef.current = null;
        setFeedback(getErrorMessage(error, locale));
      });
    }
  };

  const handleStartGame = async () => {
    if (!room) {
      return;
    }

    setBusyState("start");

    try {
      await emitWithAck<null>("game:start", { roomId: room.roomId });
      setFeedback(copy.firstRoundStarted);
    } catch (error) {
      setFeedback(getErrorMessage(error, locale));
    } finally {
      setBusyState(null);
    }
  };

  const handleAdvanceRound = async () => {
    if (!room) {
      return;
    }

    setBusyState("advance");

    try {
      await emitWithAck<null>("round:next", { roomId: room.roomId });
      setFeedback(copy.movedToNextRound);
    } catch (error) {
      setFeedback(getErrorMessage(error, locale));
    } finally {
      setBusyState(null);
    }
  };

  const handleResetRoom = async () => {
    if (!room) {
      return;
    }

    setBusyState("reset");

    try {
      await emitWithAck<null>("room:reset", { roomId: room.roomId });
      setFeedback(copy.resetToLobbyDone);
    } catch (error) {
      setFeedback(getErrorMessage(error, locale));
    } finally {
      setBusyState(null);
    }
  };

  const handleLeaveRoom = async () => {
    if (!room) {
      return;
    }

    setBusyState("leave");

    try {
      await emitWithAck<null>("room:leave", { roomId: room.roomId });
      clearRoomSession(room.roomId);
      resetLocalRoomState();
      router.push("/");
    } catch (error) {
      setFeedback(getErrorMessage(error, locale));
    } finally {
      setBusyState(null);
    }
  };

  const handleSubmitAnswer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!room || !answerDraft.trim()) {
      return;
    }

    const submittedAnswer = answerDraft;
    setAnswerDraft("");
    setBusyState("submit");

    try {
      const result = await emitWithAck<SubmitAnswerResult>("round:submit-answer", {
        roomId: room.roomId,
        answer: submittedAnswer
      });

      if (result.isCorrect) {
        setFeedback(copy.answerAccepted);
      } else if ((result.scoreDelta ?? 0) < 0) {
        setFeedback(
          locale === "ko"
            ? `오답입니다. 점수 ${Math.abs(result.scoreDelta ?? 0)}점이 차감되었습니다.`
            : `Wrong answer. ${Math.abs(result.scoreDelta ?? 0)} points were deducted.`
        );
      } else if (result.normalizedAnswer) {
        setFeedback(copy.answerWrong);
      } else {
        setFeedback(copy.answerParseFailed);
      }
    } catch (error) {
      setFeedback(getErrorMessage(error, locale));
    } finally {
      setBusyState(null);
    }
  };

  const handleClaimAnswerTurn = async () => {
    if (!room) {
      return;
    }

    setBusyState("claim");

    try {
      await emitWithAck<null>("round:claim-answer", {
        roomId: room.roomId
      });
      setFeedback(
        locale === "ko" ? "답변권을 확보했습니다." : "You claimed the answer turn."
      );
    } catch (error) {
      setFeedback(getErrorMessage(error, locale));
    } finally {
      setBusyState(null);
    }
  };

  const handleCopyInvite = async () => {
    if (!inviteUrl) {
      return;
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(inviteUrl);
      } else {
        copyTextFallback(inviteUrl);
      }
      lastInviteFallbackRef.current = inviteUrl;
      setFeedback(copy.inviteCopied);
    } catch {
      try {
        copyTextFallback(inviteUrl);
        lastInviteFallbackRef.current = inviteUrl;
        setFeedback(copy.inviteCopied);
      } catch {
        setFeedback(lastInviteFallbackRef.current || inviteUrl);
      }
    }
  };

  const handleRenameRoom = async (roomName: string) => {
    if (!room) {
      return;
    }

    try {
      await emitWithAck<null>("room:rename", {
        roomId: room.roomId,
        roomName
      });
    } catch (error) {
      setFeedback(getErrorMessage(error, locale));
    }
  };

  const handleRenamePlayer = async (playerName: string) => {
    if (!room) {
      return;
    }

    try {
      await emitWithAck<null>("room:rename-player", {
        roomId: room.roomId,
        playerName
      });
    } catch (error) {
      setFeedback(getErrorMessage(error, locale));
    }
  };

  const handleBecomePlayer = async () => {
    if (!room) {
      return;
    }

    try {
      const result = await emitWithAck<JoinRoomResult>("room:become-player", {
        roomId: room.roomId
      });
      setPlayerId(result.playerId);
      setMemberRole(result.role);
      writeRoomSession(result.roomId, result.playerId, displayName || currentSpectator?.name || "", result.role);
      setFeedback(copy.spectatorSeatJoined);
    } catch (error) {
      setFeedback(getErrorMessage(error, locale));
    }
  };

  const handleSetReady = async (isReady: boolean) => {
    if (!room) {
      return;
    }

    try {
      await emitWithAck<null>("room:set-ready", {
        roomId: room.roomId,
        isReady
      });
    } catch (error) {
      setFeedback(getErrorMessage(error, locale));
    }
  };

  const handleTransferHost = async (nextHostId: string) => {
    if (!room) {
      return;
    }

    try {
      await emitWithAck<null>("room:transfer-host", {
        roomId: room.roomId,
        playerId: nextHostId
      });
    } catch (error) {
      setFeedback(getErrorMessage(error, locale));
    }
  };

  const handleKickPlayer = async (targetPlayerId: string) => {
    if (!room) {
      return;
    }

    setBusyState("kick");

    try {
      await emitWithAck<null>("room:kick-player", {
        roomId: room.roomId,
        playerId: targetPlayerId
      });
    } catch (error) {
      setFeedback(getErrorMessage(error, locale));
    } finally {
      setBusyState(null);
    }
  };

  const handleSendChat = async (text: string) => {
    if (!room) {
      return false;
    }

    try {
      await emitWithAck<null>("room:send-chat", {
        roomId: room.roomId,
        text
      });
      return true;
    } catch (error) {
      setFeedback(getErrorMessage(error, locale));
      return false;
    }
  };

  useEffect(() => {
    const syncPageScrollMode = () => {
      if (typeof window === "undefined") {
        return;
      }

      const viewportWidth = Math.round(window.visualViewport?.width ?? window.innerWidth);
      const viewportHeight = Math.round(window.visualViewport?.height ?? window.innerHeight);
      const viewportScale = window.visualViewport?.scale ?? 1;
      const horizontalOverflow =
        (pageRef.current?.scrollWidth ?? 0) - (pageRef.current?.clientWidth ?? viewportWidth) > 8;
      const verticalOverflow =
        (pageRef.current?.scrollHeight ?? 0) - (pageRef.current?.clientHeight ?? viewportHeight) > 8;

      setPageScrollMode(
        getPageScrollMode(
          room?.phase ?? "landing",
          viewportWidth,
          viewportHeight,
          viewportScale,
          horizontalOverflow,
          verticalOverflow
        )
      );
    };

    const frameId = window.requestAnimationFrame(syncPageScrollMode);
    window.addEventListener("resize", syncPageScrollMode);
    window.visualViewport?.addEventListener("resize", syncPageScrollMode);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", syncPageScrollMode);
      window.visualViewport?.removeEventListener("resize", syncPageScrollMode);
    };
  }, [room?.phase]);

  return (
    <div className={styles.shell} data-scroll-mode={pageScrollMode}>
      <div className={styles.noise} />
      <div className={styles.primeFloatField} aria-hidden="true">
        {FLOATING_PRIME_DECORATIONS.map((prime) => (
          <span
            key={`${prime.text}-${prime.top}-${prime.left}`}
            className={styles.primeFloat}
            style={
              {
                "--prime-top": prime.top,
                "--prime-left": prime.left,
                "--prime-duration": prime.duration,
                "--prime-delay": prime.delay,
                "--prime-size": prime.size
              } as CSSProperties
            }
          >
            {prime.text}
          </span>
        ))}
      </div>
      <div className={styles.signalTop} />
      <div className={styles.signalBottom} />

      <main
        className={styles.page}
        data-screen={room ? "room" : "landing"}
        data-scroll-mode={pageScrollMode}
        ref={pageRef}
      >
        <header className={styles.masthead}>
          <div className={styles.brandBlock}>
            <p className={styles.kicker}>{copy.mastheadKicker}</p>
            <div className={styles.brandRow}>
              <div className={styles.wordmarkRow}>
                <h1 className={styles.wordmark}>FactorRush</h1>
                <span
                  className={styles.connectionBadge}
                  data-live={isConnected}
                  data-testid="connection-badge"
                >
                  {isConnected ? copy.connectionLive : copy.connectionReconnecting}
                </span>
              </div>

              <div className={`${styles.switchRow} ${styles.mastheadSwitchRow}`}>
                <div className={styles.languageSwitch} aria-label={copy.languageLabel}>
                  <button
                    className={styles.languageButton}
                    data-active={locale === "ko"}
                    onClick={() => setLocale("ko")}
                    type="button"
                  >
                    KO
                  </button>
                  <button
                    className={styles.languageButton}
                    data-active={locale === "en"}
                    onClick={() => setLocale("en")}
                    type="button"
                  >
                    EN
                  </button>
                </div>

                <div className={styles.languageSwitch} aria-label={copy.themeLabel}>
                  <button
                    className={styles.languageButton}
                    aria-label={copy.themeLight}
                    data-active={theme === "light"}
                    data-icon="true"
                    onClick={() => setTheme("light")}
                    title={copy.themeLight}
                    type="button"
                  >
                    <ThemeModeIcon mode="light" />
                  </button>
                  <button
                    className={styles.languageButton}
                    aria-label={copy.themeDark}
                    data-active={theme === "dark"}
                    data-icon="true"
                    onClick={() => setTheme("dark")}
                    title={copy.themeDark}
                    type="button"
                  >
                    <ThemeModeIcon mode="dark" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {showAmbientInfo ? (
            <div className={styles.headerTools}>
              <div className={styles.connectionInfo}>
                <span>{copy.stackSummary}</span>
              </div>
            </div>
          ) : null}
        </header>

        {room ? (
          <RoomExperience
            room={room}
            locale={locale}
            pageScrollMode={pageScrollMode}
            playerId={playerId}
            memberRole={memberRole}
            isHost={isHost}
            myRoundStatus={myRoundStatus}
            inviteUrl={inviteUrl}
            sortedPlayers={sortedPlayers}
            settingsDraft={settingsDraft}
            matchSettingsDraft={matchSettingsDraft}
            busyState={busyState}
            answerDraft={answerDraft}
            now={now}
            roundRemainingSeconds={roundRemainingSeconds}
            progressRatio={progressRatio}
            showAmbientInfo={showAmbientInfo}
            answerInputRef={answerInputRef}
            onCopyInvite={handleCopyInvite}
            onSettingsDraftChange={handleSettingsDraftChange}
            onMatchSettingsDraftChange={handleMatchSettingsDraftChange}
            onRenameRoom={handleRenameRoom}
            onRenamePlayer={handleRenamePlayer}
            onBecomePlayer={handleBecomePlayer}
            onSetReady={handleSetReady}
            onTransferHost={handleTransferHost}
            onKickPlayer={handleKickPlayer}
            onStartGame={handleStartGame}
            onAdvanceRound={handleAdvanceRound}
            onResetRoom={handleResetRoom}
            onLeaveRoom={handleLeaveRoom}
            onClaimAnswerTurn={handleClaimAnswerTurn}
            onSendChat={handleSendChat}
            onAnswerDraftChange={setAnswerDraft}
            onSubmitAnswer={handleSubmitAnswer}
          />
        ) : (
          <LandingExperience
            locale={locale}
            roomCode={roomCode}
            setRoomCode={setRoomCode}
            displayName={displayName}
            onDisplayNameBlur={commitDisplayName}
            onDisplayNameChange={handleDisplayNameChange}
            onDisplayNameCompositionEnd={handleDisplayNameCompositionEnd}
            onDisplayNameCompositionStart={handleDisplayNameCompositionStart}
            createNameInputRef={createNameInputRef}
            joinNameInputRef={joinNameInputRef}
            joinRoomCodeInputRef={joinRoomCodeInputRef}
            createMode={createMode}
            setCreateMode={setCreateMode}
            busyState={busyState}
            onBackToHome={() => router.push("/")}
            onCreateRoom={handleCreateRoom}
            onJoinRoom={handleJoinRoom}
            hintedRoomId={initialRoomId}
          />
        )}

        {feedback ? <div className={styles.toast}>{feedback}</div> : null}
      </main>
    </div>
  );
}

interface LandingExperienceProps {
  locale: Locale;
  roomCode: string;
  setRoomCode: (value: string) => void;
  displayName: string;
  onDisplayNameBlur: (value: string) => void;
  onDisplayNameChange: (value: string) => void;
  onDisplayNameCompositionEnd: (value: string) => void;
  onDisplayNameCompositionStart: () => void;
  createNameInputRef: RefObject<HTMLInputElement | null>;
  joinNameInputRef: RefObject<HTMLInputElement | null>;
  joinRoomCodeInputRef: RefObject<HTMLInputElement | null>;
  createMode: GameMode;
  setCreateMode: (value: GameMode) => void;
  busyState: BusyState;
  onBackToHome: () => void;
  onCreateRoom: (event: FormEvent<HTMLFormElement>) => void;
  onJoinRoom: (event: FormEvent<HTMLFormElement>) => void;
  hintedRoomId?: string | undefined;
}

function LandingExperience({
  locale,
  roomCode,
  setRoomCode,
  displayName,
  onDisplayNameBlur,
  onDisplayNameChange,
  onDisplayNameCompositionEnd,
  onDisplayNameCompositionStart,
  createNameInputRef,
  joinNameInputRef,
  joinRoomCodeInputRef,
  createMode,
  setCreateMode,
  busyState,
  onBackToHome,
  onCreateRoom,
  onJoinRoom,
  hintedRoomId
}: LandingExperienceProps) {
  const copy = getCopy(locale);
  const landingText =
    locale === "ko"
      ? {
          heroKicker: "링크를 공유하여 친구와 게임을 시작하세요.",
          heroDescription: "방을 생성하고 초대 링크를 보내면 함께 플레이할 수 있습니다.",
          hostSignal: "새로운 방",
          createRoomTitle: "새로운 방 생성하기",
          joinFeed: "기존 방",
          joinRoomTitle: "기존 방 참가하기",
          liveBoardLabel: "점수 현황",
          liveBoardTitle: "리더 보드",
          inviteTileBody: "링크를 공유하여 최대 12명의 친구와 플레이할 수 있습니다.",
          liveBoardTileBody: "점수를 통해 친구와 암산 실력을 겨뤄보세요.",
          storyOne: "socket 기반으로 멀리 있는 친구와도 게임이 가능합니다.",
          storyTwo: "점수를 통해 친구와 암산 실력을 겨뤄보세요.",
          storyThree: "추후 여러 게임들이 추가될 예정입니다!"
        }
      : {
          heroKicker: "Share the link and start playing with friends.",
          heroDescription: "Create a room and send the invite link to play together.",
          hostSignal: "New room",
          createRoomTitle: "Create a new room",
          joinFeed: "Existing room",
          joinRoomTitle: "Join an existing room",
          liveBoardLabel: "Live standings",
          liveBoardTitle: "Leaderboard",
          inviteTileBody: "Share the link and play with up to 12 friends.",
          liveBoardTileBody: "Compare your mental-math speed through the scores.",
          storyOne: "Socket-based play makes it easy to game with friends from anywhere.",
          storyTwo: "Compare your mental-math speed through the scores.",
          storyThree: "More game types are planned for future updates!"
        };
  const heroTiles = [
    {
      label: locale === "ko" ? "모드 A" : "mode a",
      title: getModeLabelByLocale(locale, "factor"),
      body: getModeDescriptionByLocale(locale, "factor")
    },
    {
      label: locale === "ko" ? "모드 B" : "mode b",
      title: getModeLabelByLocale(locale, "binary"),
      body: getModeDescriptionByLocale(locale, "binary")
    },
    {
      label: copy.inviteLineLabel,
      title: copy.shareUrlLabel,
      body: landingText.inviteTileBody
    },
    {
      label: landingText.liveBoardLabel,
      title: landingText.liveBoardTitle,
      body: landingText.liveBoardTileBody
    }
  ];

  return (
    <section className={styles.poster}>
      <div className={styles.heroField} data-testid="landing-hero">
        <div className={styles.heroCopy}>
          <p className={styles.kicker}>{landingText.heroKicker}</p>
          <h2 className={styles.heroTitle}>
            {copy.heroTitleTop}
            <br />
            {copy.heroTitleBottom}
          </h2>
          <p className={styles.heroDescription}>{landingText.heroDescription}</p>
        </div>

        <div className={styles.heroModuleGrid}>
          {heroTiles.map((tile) => (
            <article className={styles.heroModule} key={`${tile.label}-${tile.title}`}>
              <span>{tile.label}</span>
              <strong>{tile.title}</strong>
              <p>{tile.body}</p>
            </article>
          ))}
        </div>

        <div className={styles.numberWall} aria-hidden="true">
          <span>924 = 2² × 3 × 7 × 11</span>
          <span className={styles.numberEquation}>
            <span className={styles.numberEquationMain}>111001</span>
            <span className={styles.numberEquationBase}>(2)</span>
            {" = "}
            <span className={styles.numberEquationMain}>57</span>
            <span className={styles.numberEquationBase}>(10)</span>
          </span>
          <span className={styles.numberEquation}>
            <span className={styles.numberEquationMain}>101101</span>
            <span className={styles.numberEquationBase}>(2)</span>
            {" = "}
            <span className={styles.numberEquationMain}>45</span>
            <span className={styles.numberEquationBase}>(10)</span>
          </span>
          <span>1452 = 2² × 3 × 11²</span>
        </div>
      </div>

      <div className={styles.controlBand}>
        <form className={styles.signalForm} onSubmit={onCreateRoom}>
          <div className={styles.formHeading}>
            <span>{landingText.hostSignal}</span>
            <strong>{landingText.createRoomTitle}</strong>
          </div>

          <label className={styles.field}>
            <span>{copy.nicknameLabel}</span>
            <input
              ref={createNameInputRef}
              data-testid="create-name-input"
              maxLength={PLAYER_NAME_MAX_LENGTH * 2}
              type="text"
              value={displayName}
              onBlur={(event) => onDisplayNameBlur(event.target.value)}
              onChange={(event) => onDisplayNameChange(event.target.value)}
              onCompositionEnd={(event) => onDisplayNameCompositionEnd(event.currentTarget.value)}
              onCompositionStart={onDisplayNameCompositionStart}
              placeholder="PrimePilot"
            />
          </label>

          <div className={styles.field}>
            <span>{copy.startModeLabel}</span>
            <div className={styles.modeChoiceRow} data-columns="2">
              {(["factor", "binary"] as const).map((modeValue) => (
                <button
                  className={styles.modeChoiceButton}
                  data-active={createMode === modeValue}
                  data-testid={`create-mode-${modeValue}`}
                  key={modeValue}
                  onClick={() => setCreateMode(modeValue)}
                  type="button"
                >
                  {getModeLabelByLocale(locale, modeValue)}
                </button>
              ))}
            </div>
            <small className={styles.fieldNote}>
              {getModeDescriptionByLocale(locale, createMode)}
            </small>
          </div>

          <button
            className={styles.primaryAction}
            data-testid="create-room-button"
            disabled={busyState === "create"}
            type="submit"
          >
            {busyState === "create" ? copy.creatingRoomButton : copy.createRoomButton}
          </button>
        </form>

        {!hintedRoomId ? (
          <form className={styles.signalForm} onSubmit={onJoinRoom}>
            <div className={styles.formHeading}>
              <span>{landingText.joinFeed}</span>
              <strong>{landingText.joinRoomTitle}</strong>
            </div>

            <label className={styles.field}>
              <span>{copy.nicknameLabel}</span>
              <input
                ref={joinNameInputRef}
                data-testid="join-name-input"
                maxLength={PLAYER_NAME_MAX_LENGTH * 2}
                type="text"
                value={displayName}
                onBlur={(event) => onDisplayNameBlur(event.target.value)}
                onChange={(event) => onDisplayNameChange(event.target.value)}
                onCompositionEnd={(event) => onDisplayNameCompositionEnd(event.currentTarget.value)}
                onCompositionStart={onDisplayNameCompositionStart}
                placeholder="BinaryRacer"
              />
            </label>

            <label className={styles.field}>
              <span>{copy.roomCodeLabel}</span>
              <input
                ref={joinRoomCodeInputRef}
                data-testid="join-room-code-input"
                type="text"
                value={roomCode}
                onChange={(event) => setRoomCode(sanitizeRoomId(event.target.value))}
                placeholder="AB12CD"
              />
            </label>

            <button
              className={styles.secondaryAction}
              data-testid="join-room-button"
              disabled={busyState === "join"}
              type="submit"
            >
              {busyState === "join" ? copy.joiningRoomButton : copy.joinRoomButton}
            </button>
          </form>
        ) : null}
      </div>

      <div className={styles.storyStrip}>
        <article>
          <span>01</span>
          <p>{landingText.storyOne}</p>
        </article>
        <article>
          <span>02</span>
          <p>{landingText.storyTwo}</p>
        </article>
        <article>
          <span>03</span>
          <p>{landingText.storyThree}</p>
        </article>
      </div>

      {hintedRoomId ? (
        <div className={styles.joinOverlay}>
          <div className={styles.joinOverlayScrim} />
          <form className={styles.joinOverlayCard} onSubmit={onJoinRoom}>
            <span className={styles.challengeLabel}>
              {locale === "ko" ? "초대 링크 입장" : "Invite Link"}
            </span>
            <strong>{locale === "ko" ? "닉네임만 입력하고 입장" : "Enter with your nickname"}</strong>
            <p className={styles.railBody}>
              {locale === "ko"
                ? `${hintedRoomId} 방에 연결합니다.`
                : `You are joining room ${hintedRoomId}.`}
            </p>

            <label className={styles.field}>
              <span>{copy.nicknameLabel}</span>
              <input
                ref={joinNameInputRef}
                data-testid="invite-name-input"
                maxLength={PLAYER_NAME_MAX_LENGTH * 2}
                type="text"
                value={displayName}
                onBlur={(event) => onDisplayNameBlur(event.target.value)}
                onChange={(event) => onDisplayNameChange(event.target.value)}
                onCompositionEnd={(event) => onDisplayNameCompositionEnd(event.currentTarget.value)}
                onCompositionStart={onDisplayNameCompositionStart}
                placeholder="PrimePilot"
              />
            </label>

            <div className={styles.joinOverlayActions}>
              <button
                className={styles.primaryAction}
                data-testid="invite-join-button"
                disabled={busyState === "join"}
                type="submit"
              >
                {busyState === "join" ? copy.joiningRoomButton : copy.joinViaLinkButton}
              </button>
              <button
                className={styles.secondaryAction}
                data-testid="invite-back-home-button"
                onClick={onBackToHome}
                type="button"
              >
                {locale === "ko" ? "메인으로 돌아가기" : "Back to Home"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}

interface RoomExperienceProps {
  room: RoomSnapshot;
  locale: Locale;
  pageScrollMode: ScrollMode;
  playerId: string | null;
  memberRole: RoomRole | null;
  isHost: boolean;
  myRoundStatus: PlayerRoundStatus | null;
  inviteUrl: string;
  sortedPlayers: RoomSnapshot["players"];
  settingsDraft: LobbySettings;
  matchSettingsDraft: MatchSettings;
  busyState: BusyState;
  answerDraft: string;
  now: number;
  roundRemainingSeconds: number;
  progressRatio: number;
  showAmbientInfo: boolean;
  answerInputRef: RefObject<HTMLInputElement | null>;
  onCopyInvite: () => void;
  onSettingsDraftChange: Dispatch<SetStateAction<LobbySettings>>;
  onMatchSettingsDraftChange: Dispatch<SetStateAction<MatchSettings>>;
  onRenameRoom: (roomName: string) => void;
  onRenamePlayer: (playerName: string) => void;
  onBecomePlayer: () => void;
  onSetReady: (isReady: boolean) => void;
  onTransferHost: (playerId: string) => void;
  onKickPlayer: (playerId: string) => void;
  onStartGame: () => void;
  onAdvanceRound: () => void;
  onResetRoom: () => void;
  onLeaveRoom: () => void;
  onClaimAnswerTurn: () => void;
  onSendChat: (text: string) => Promise<boolean>;
  onAnswerDraftChange: (value: string) => void;
  onSubmitAnswer: (event: FormEvent<HTMLFormElement>) => void;
}

function RoomExperience({
  room,
  locale,
  pageScrollMode,
  playerId,
  memberRole,
  isHost,
  myRoundStatus,
  inviteUrl,
  sortedPlayers,
  settingsDraft,
  matchSettingsDraft,
  busyState,
  answerDraft,
  now,
  roundRemainingSeconds,
  progressRatio,
  showAmbientInfo,
  answerInputRef,
  onCopyInvite,
  onSettingsDraftChange,
  onMatchSettingsDraftChange,
  onRenameRoom,
  onRenamePlayer,
  onBecomePlayer,
  onSetReady,
  onTransferHost,
  onKickPlayer,
  onStartGame,
  onAdvanceRound,
  onResetRoom,
  onLeaveRoom,
  onClaimAnswerTurn,
  onSendChat,
  onAnswerDraftChange,
  onSubmitAnswer
}: RoomExperienceProps) {
  const copy = getCopy(locale);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isMatchSettingsOpen, setIsMatchSettingsOpen] = useState(false);
  const [isRulesOpen, setIsRulesOpen] = useState(false);
  const [isScoreGuideOpen, setIsScoreGuideOpen] = useState(false);
  const [scoreGuidePage, setScoreGuidePage] = useState<0 | 1>(0);
  const [chatDraft, setChatDraft] = useState("");
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [isRenamingRoom, setIsRenamingRoom] = useState(false);
  const [isRenamingPlayer, setIsRenamingPlayer] = useState(false);
  const [responsiveLayout, setResponsiveLayout] = useState<ResponsiveRoomLayoutState>(
    DEFAULT_RESPONSIVE_ROOM_LAYOUT_STATE
  );
  const [activeRailPanel, setActiveRailPanel] = useState<RailPanelId | null>(null);
  const [renderedRailPanel, setRenderedRailPanel] = useState<RailPanelId | null>(null);
  const [isRailDrawerVisible, setIsRailDrawerVisible] = useState(false);
  const [roomLayoutViewportTop, setRoomLayoutViewportTop] = useState(0);
  const [roomNameDraft, setRoomNameDraft] = useState(room.roomName);
  const [playerNameDraft, setPlayerNameDraft] = useState(
    room.players.find((candidate) => candidate.id === playerId)?.name ??
      room.spectators.find((candidate) => candidate.id === playerId)?.name ??
      ""
  );
  const roomNameInputRef = useRef<HTMLInputElement | null>(null);
  const chatInputRef = useRef<HTMLInputElement | null>(null);
  const lobbyChatInputRef = useRef<HTMLInputElement | null>(null);
  const chatListRef = useRef<HTMLDivElement | null>(null);
  const lobbyChatListRef = useRef<HTMLDivElement | null>(null);
  const playerNameInputRef = useRef<HTMLInputElement | null>(null);
  const roomLayoutRef = useRef<HTMLElement | null>(null);
  const playerNameComposingRef = useRef(false);
  const commitPlayerNameDraft = (value: string) => {
    setPlayerNameDraft(sanitizePlayerName(value));
  };

  const handlePlayerNameDraftChange = (value: string) => {
    if (playerNameComposingRef.current) {
      setPlayerNameDraft(value);
      return;
    }

    commitPlayerNameDraft(value);
  };
  const handlePlayerNameCompositionStart = () => {
    playerNameComposingRef.current = true;
  };
  const handlePlayerNameCompositionEnd = (value: string) => {
    playerNameComposingRef.current = false;
    commitPlayerNameDraft(value);
  };
  const roundCopy = room.round ? getChallengeCopy(locale, room.round) : null;
  const statusMessage = getRoomMessageByLocale(locale, room.messageKey, room.messagePlayerName);
  const currentPlayer = room.players.find((candidate) => candidate.id === playerId) ?? null;
  const currentSpectator = room.spectators.find((candidate) => candidate.id === playerId) ?? null;
  const currentMember = currentPlayer ?? currentSpectator;
  const isSpectator = currentPlayer == null && (currentSpectator != null || memberRole === "spectator");
  const submittedCount =
    room.round?.playerStatuses.filter((candidate) => candidate.hasSubmitted).length ?? 0;
  const winnerNames = room.finalWinnerIds
    .map((winnerId) => room.players.find((candidate) => candidate.id === winnerId)?.name)
    .filter((candidate): candidate is string => Boolean(candidate))
    .join(locale === "ko" ? ", " : " / ");
  const podiumPlayers = sortedPlayers.slice(0, 3);
  const binaryRatioSummary =
    room.settings.mode === "binary"
      ? getBinaryRatioSummary(locale, room.settings.baseConversionPair)
      : null;
  const connectedPlayers = room.players.filter((candidate) => candidate.connected);
  const connectedGuests = connectedPlayers.filter((candidate) => !candidate.isHost);
  const connectedSpectators = room.spectators.filter((candidate) => candidate.connected);
  const spectatorCount = room.spectators.length;
  const canSeatMorePlayers = room.players.length < room.matchSettings.maxPlayers;
  const isCrowdedLobbyRoster = room.phase === "lobby" && room.players.length >= 5;
  const { density, railMode, lobbyRulesMode, roundRosterMode, isMobileViewport } = responsiveLayout;
  const liveBoardLabel = locale === "ko" ? "점수 현황" : "Live standings";
  const liveBoardTitle = locale === "ko" ? "리더 보드" : "Leaderboard";
  const lobbyRosterLabel = locale === "ko" ? "로비 공간" : "Lobby space";
  const lobbyRosterTitle = locale === "ko" ? "메인 로비 공간" : "Main Lobby Space";
  const visibleLobbySlotCount =
    room.phase === "lobby" && isMobileViewport
      ? Math.min(
          room.matchSettings.maxPlayers,
          Math.max(4, room.players.length + (canSeatMorePlayers ? 1 : 0))
        )
      : room.matchSettings.maxPlayers;
  const rosterSlots = Array.from(
    { length: visibleLobbySlotCount },
    (_, index) => room.players[index] ?? null
  );
  const readyCount = connectedGuests.filter((candidate) => candidate.isReady).length;
  const allReady = connectedGuests.length === 0 || readyCount === connectedGuests.length;
  const roundTransitionSeconds =
    room.round?.transitionEndsAt != null
      ? Math.max(0, Math.ceil((room.round.transitionEndsAt - now) / 1000))
      : 0;
  const matchElapsedMs =
    room.phase === "finished"
      ? room.totalMatchDurationMs
      : room.matchStartedAt
        ? Math.max(0, now - room.matchStartedAt)
        : 0;
  const rulesSummary = getRuleSummary(locale, room.settings);
  const overlayActive = room.phase === "round-ended" || room.phase === "finished";
  const answerLabelHint =
    room.settings.mode === "factor"
      ? getFactorAnswerInlineHint(locale, room.round, room.settings)
      : null;
  const binaryPreviewText =
    room.phase === "round-active" &&
    room.round?.mode === "binary" &&
    room.settings.binaryLivePreview &&
    !isSpectator &&
    !myRoundStatus?.hasSubmitted
      ? getBinaryPreviewText(locale, room.round.challengeMeta as BinaryChallengeMeta, answerDraft)
      : null;
  const showChallengeHelper = room.settings.mode === "binary";
  const resultsAutoResetSeconds =
    room.autoResetAt != null ? Math.max(0, Math.ceil((room.autoResetAt - now) / 1000)) : 0;
  const factorResolutionSummary =
    room.settings.mode === "factor"
      ? getFactorResolutionSummary(locale, room.settings.factorResolutionMode)
      : null;
  const roundTimeSummary = getRoundTimeSummary(locale, room.settings);
  const settingsTimeSummary = getRoundTimeSummary(locale, settingsDraft);
  const isGoldenBellSettings =
    settingsDraft.mode === "factor" && settingsDraft.factorResolutionMode === "golden-bell";
  const isGoldenBellSingleAttempt =
    room.settings.mode === "factor" &&
    room.settings.factorResolutionMode === "golden-bell" &&
    room.settings.factorGoldenBellSingleAttempt;
  const visibleChatFeed = room.chatFeed;
  const recentChatByPlayer = getRecentChatByPlayer(room.chatFeed, now);
  const isGoldenBellRound =
    room.phase === "round-active" &&
    room.round?.mode === "factor" &&
    room.settings.factorResolutionMode === "golden-bell";
  const roundModeBadge = room.round?.isSuddenDeath
    ? copy.suddenDeathLive
    : isGoldenBellRound
      ? copy.goldenBellLive
      : null;
  const answeringPlayer =
    room.round?.answeringPlayerId != null
      ? room.players.find((candidate) => candidate.id === room.round?.answeringPlayerId) ?? null
      : null;
  const isMyAnswerTurn = answeringPlayer?.id === playerId;
  const isGoldenBellReclaimBlocked =
    isGoldenBellRound &&
    connectedPlayers.length > 1 &&
    room.round?.lastAnsweringPlayerId === playerId &&
    !isMyAnswerTurn;
  const goldenBellCountdownSeconds =
    room.round?.answerWindowEndsAt != null
      ? Math.max(0, Math.ceil((room.round.answerWindowEndsAt - now) / 1000))
      : 0;
  const canClaimGoldenBell =
    isGoldenBellRound &&
    !myRoundStatus?.hasSubmitted &&
    !myRoundStatus?.isLockedOut &&
    !answeringPlayer &&
    !isGoldenBellReclaimBlocked;
  const roundDeltaRows =
    room.phase === "round-ended" && room.round
      ? room.round.playerStatuses
          .map((status) => {
            const candidate = room.players.find((player) => player.id === status.playerId);
            if (!candidate) {
              return null;
            }

            return {
              playerId: candidate.id,
              name: candidate.name,
              totalScore: candidate.score,
              delta: status.scoreDelta ?? status.pointsAwarded ?? 0,
              statusLabel: getRevealStatusLabel(locale, status),
              isCorrect: status.hasSubmitted
            };
          })
          .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
          .sort((left, right) => {
            if (right.delta !== left.delta) {
              return right.delta - left.delta;
            }

            if (right.totalScore !== left.totalScore) {
              return right.totalScore - left.totalScore;
            }

            return left.name.localeCompare(right.name);
          })
      : [];
  const correctPlayers = roundDeltaRows.filter((entry) => entry.isCorrect);
  const revealSummary = getRevealSummary(locale, room, correctPlayers);
  const revealDeltaRange = getRevealDeltaRange(locale, roundDeltaRows);
  const currentPlayerRank =
    currentPlayer != null ? sortedPlayers.findIndex((candidate) => candidate.id === currentPlayer.id) + 1 : null;
  const leadingPlayer = sortedPlayers[0] ?? null;
  const leadingPlayerStatus =
    leadingPlayer != null
      ? room.round?.playerStatuses.find((entry) => entry.playerId === leadingPlayer.id) ?? null
      : null;
  const isBlockingPanelOpen =
    isSettingsOpen || isMatchSettingsOpen || isRulesOpen || isScoreGuideOpen || overlayActive;
  const effectiveRailMode: RailMode =
    pageScrollMode === "scroll" ? "inline" : railMode;
  const showInlineRail = room.phase === "finished" || effectiveRailMode === "inline";
  const peekRailAvailable =
    room.phase !== "finished" && effectiveRailMode === "peek" && !isBlockingPanelOpen;
  const showPeekRail = peekRailAvailable && activeRailPanel == null;
  const showCompactLiveRoster =
    room.phase === "round-active" &&
    effectiveRailMode === "inline" &&
    roundRosterMode === "compact";
  const canUseRailDrawer =
    peekRailAvailable || (room.phase === "round-active" && roundRosterMode === "compact");
  const isScrollRoom = pageScrollMode === "scroll";
  const roomLayoutStyle = {
    "--peek-rail-dock-top": `${roomLayoutViewportTop}px`,
    "--room-ui-scale": density === "tight" ? "0.86" : density === "compact" ? "0.92" : "1",
    "--room-type-scale": density === "tight" ? "0.96" : density === "compact" ? "0.995" : "1",
    "--layout-gap": isScrollRoom
      ? density === "tight"
        ? "0.58rem"
        : density === "compact"
          ? "0.68rem"
          : "0.84rem"
      : density === "tight"
        ? "0.72rem"
        : density === "compact"
          ? "0.82rem"
          : "1rem",
    "--room-rail-width": density === "tight" ? "252px" : density === "compact" ? "286px" : room.phase === "finished" ? "312px" : "332px",
    "--control-band-padding": density === "tight" ? "0.78rem" : density === "compact" ? "0.88rem" : "1rem",
    "--broadcast-padding": density === "tight" ? "0.58rem 0.72rem" : density === "compact" ? "0.62rem 0.78rem" : "0.66rem 0.84rem",
    "--stage-surface-padding": density === "tight" ? "0.72rem 0.8rem" : density === "compact" ? "0.82rem 0.9rem" : "0.9rem 1rem",
    "--stage-surface-active-padding": density === "tight" ? "0.48rem" : density === "compact" ? "0.52rem" : "0.55rem",
    "--panel-padding": density === "tight" ? "0.72rem" : density === "compact" ? "0.8rem" : "0.92rem",
    "--roster-padding": isCrowdedLobbyRoster
      ? density === "tight"
        ? "0.58rem"
        : density === "compact"
          ? "0.72rem"
          : "0.92rem"
      : density === "tight"
        ? "0.68rem"
        : density === "compact"
          ? "0.82rem"
          : "1rem",
    "--roster-gap": isCrowdedLobbyRoster
      ? density === "tight"
        ? "0.48rem"
        : density === "compact"
          ? "0.62rem"
          : "0.82rem"
      : density === "tight"
        ? "0.62rem"
        : density === "compact"
          ? "0.76rem"
          : "0.92rem",
    "--roster-card-min":
      room.phase === "lobby" && isScrollRoom
        ? density === "tight"
          ? "9.25rem"
          : density === "compact"
            ? "10.75rem"
            : "12.6rem"
        : density === "tight"
          ? "10.4rem"
          : density === "compact"
            ? "12.1rem"
            : "14.75rem",
    "--roster-row-min": isCrowdedLobbyRoster
      ? room.phase === "lobby" && isScrollRoom
        ? density === "tight"
          ? "7.25rem"
          : density === "compact"
            ? "8rem"
            : "8.8rem"
        : density === "tight"
          ? "7.95rem"
          : density === "compact"
            ? "8.7rem"
            : "9.5rem"
      : density === "tight"
        ? room.phase === "lobby" && isScrollRoom
          ? "7.7rem"
          : "8.6rem"
        : density === "compact"
          ? room.phase === "lobby" && isScrollRoom
            ? "8.6rem"
            : "9.25rem"
          : "10rem",
    "--player-pod-padding": isCrowdedLobbyRoster
      ? room.phase === "lobby" && isScrollRoom
        ? density === "tight"
          ? "0.54rem"
          : density === "compact"
            ? "0.66rem"
            : "0.82rem"
        : density === "tight"
          ? "0.62rem"
          : density === "compact"
            ? "0.74rem"
            : "0.92rem"
      : density === "tight"
        ? room.phase === "lobby" && isScrollRoom
          ? "0.62rem"
          : "0.72rem"
        : density === "compact"
          ? room.phase === "lobby" && isScrollRoom
            ? "0.74rem"
            : "0.82rem"
          : "0.92rem"
  } as CSSProperties;

  useEffect(() => {
    if (room.phase !== "lobby") {
      setIsSettingsOpen(false);
      setIsMatchSettingsOpen(false);
      setIsScoreGuideOpen(false);
      setIsRenamingRoom(false);
      setIsRenamingPlayer(false);
    }
  }, [room.phase]);

  useEffect(() => {
    if (overlayActive) {
      setIsScoreGuideOpen(false);
    }
  }, [overlayActive]);

  useEffect(() => {
    if (isScoreGuideOpen) {
      setScoreGuidePage(0);
    }
  }, [isScoreGuideOpen]);

  useEffect(() => {
    setChatDraft("");
  }, [room.roomId]);

  useEffect(() => {
    setRoomNameDraft(room.roomName);
  }, [room.roomName]);

  useEffect(() => {
    setPlayerNameDraft(currentMember?.name ?? "");
  }, [currentMember?.name]);

  useEffect(() => {
    const syncResponsiveLayout = () => {
      if (typeof window === "undefined") {
        return;
      }

      const viewportWidth = Math.round(window.visualViewport?.width ?? window.innerWidth);
      const viewportHeight = Math.round(window.visualViewport?.height ?? window.innerHeight);
      const viewportScale = window.visualViewport?.scale ?? 1;

      setResponsiveLayout(
        getResponsiveRoomLayoutState({
          phase: room.phase,
          playerCount: sortedPlayers.length,
          viewportWidth,
          viewportHeight,
          viewportScale
        })
      );
    };

    syncResponsiveLayout();
    window.addEventListener("resize", syncResponsiveLayout);
    window.visualViewport?.addEventListener("resize", syncResponsiveLayout);

    return () => {
      window.removeEventListener("resize", syncResponsiveLayout);
      window.visualViewport?.removeEventListener("resize", syncResponsiveLayout);
    };
  }, [room.phase, sortedPlayers.length]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const updateRoomLayoutViewportTop = () => {
      const nextTop = Math.max(0, roomLayoutRef.current?.getBoundingClientRect().top ?? 0);
      setRoomLayoutViewportTop((previous) =>
        Math.abs(previous - nextTop) < 0.5 ? previous : nextTop
      );
    };

    const frameId = window.requestAnimationFrame(updateRoomLayoutViewportTop);
    window.addEventListener("resize", updateRoomLayoutViewportTop);
    window.visualViewport?.addEventListener("resize", updateRoomLayoutViewportTop);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", updateRoomLayoutViewportTop);
      window.visualViewport?.removeEventListener("resize", updateRoomLayoutViewportTop);
    };
  }, [density, effectiveRailMode, locale, lobbyRulesMode, room.phase, roundRosterMode]);

  useEffect(() => {
    if (!activeRailPanel) {
      return;
    }

    const availablePanelIds =
      room.phase === "lobby"
        ? new Set<RailPanelId>(["invite", "rules", "chat"])
        : room.phase === "finished"
          ? new Set<RailPanelId>()
          : new Set<RailPanelId>(["players", "chat"]);
    const canKeepPlayersDrawer =
      room.phase === "round-active" && roundRosterMode === "compact" && activeRailPanel === "players";

    if (
      !availablePanelIds.has(activeRailPanel) ||
      (effectiveRailMode === "inline" && !canKeepPlayersDrawer)
    ) {
      setActiveRailPanel(null);
    }
  }, [activeRailPanel, effectiveRailMode, room.phase, roundRosterMode]);

  useEffect(() => {
    if (isSettingsOpen || isMatchSettingsOpen || isRulesOpen || isScoreGuideOpen) {
      setActiveRailPanel(null);
    }
  }, [isMatchSettingsOpen, isRulesOpen, isScoreGuideOpen, isSettingsOpen]);

  useEffect(() => {
    let frameOneId = 0;
    let frameTwoId = 0;
    let timeoutId = 0;

    if (!canUseRailDrawer) {
      setIsRailDrawerVisible(false);
      setRenderedRailPanel(null);
      return;
    }

    if (activeRailPanel) {
      if (renderedRailPanel !== activeRailPanel) {
        setRenderedRailPanel(activeRailPanel);
      }

      if (renderedRailPanel === activeRailPanel && isRailDrawerVisible) {
        return;
      }

      setIsRailDrawerVisible(false);
      frameOneId = window.requestAnimationFrame(() => {
        frameTwoId = window.requestAnimationFrame(() => {
          setIsRailDrawerVisible(true);
        });
      });

      return () => {
        window.cancelAnimationFrame(frameOneId);
        window.cancelAnimationFrame(frameTwoId);
      };
    }

    if (renderedRailPanel) {
      setIsRailDrawerVisible(false);
      timeoutId = window.setTimeout(() => {
        setRenderedRailPanel(null);
      }, 420);
    }

    return () => {
      window.cancelAnimationFrame(frameOneId);
      window.cancelAnimationFrame(frameTwoId);
      window.clearTimeout(timeoutId);
    };
  }, [activeRailPanel, canUseRailDrawer, isRailDrawerVisible, renderedRailPanel]);

  useEffect(() => {
    if (!isRenamingRoom) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      roomNameInputRef.current?.focus();
      roomNameInputRef.current?.select();
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [isRenamingRoom]);

  useEffect(() => {
    if (!isRenamingPlayer) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      playerNameInputRef.current?.focus();
      playerNameInputRef.current?.select();
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [isRenamingPlayer]);

  useEffect(() => {
    if (room.phase === "lobby" || !chatListRef.current) {
      return;
    }

    chatListRef.current.scrollTop = chatListRef.current.scrollHeight;
  }, [room.chatFeed, room.phase]);

  useEffect(() => {
    if (room.phase !== "lobby" || !lobbyChatListRef.current) {
      return;
    }

    lobbyChatListRef.current.scrollTop = lobbyChatListRef.current.scrollHeight;
  }, [room.chatFeed, room.phase]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (activeRailPanel) {
          setActiveRailPanel(null);
          return;
        }

        setIsSettingsOpen(false);
        setIsRulesOpen(false);
        setIsScoreGuideOpen(false);
        setIsRenamingRoom(false);
        return;
      }

      if (event.key !== "/") {
        return;
      }

      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }

      event.preventDefault();
      if (room.phase === "lobby") {
        lobbyChatInputRef.current?.focus();
        return;
      }

      chatInputRef.current?.focus();
    };

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [activeRailPanel, room.phase]);

  const handleChatSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextMessage = chatDraft.trim();
    if (!nextMessage) {
      return;
    }

    setIsSendingChat(true);
    const didSend = await onSendChat(nextMessage);
    if (didSend) {
      setChatDraft("");
    }
    setIsSendingChat(false);
  };

  const handleRoomNameCommit = () => {
    setIsRenamingRoom(false);
    if (!roomNameDraft.trim()) {
      setRoomNameDraft(room.roomName);
      return;
    }

    if (roomNameDraft.trim() !== room.roomName) {
      onRenameRoom(roomNameDraft);
    }
  };

  const handlePlayerNameCommit = () => {
    setIsRenamingPlayer(false);
    const nextPlayerName = sanitizePlayerName(playerNameDraft).trim();
    if (nextPlayerName !== playerNameDraft) {
      setPlayerNameDraft(nextPlayerName);
    }

    if (!nextPlayerName) {
      setPlayerNameDraft(currentMember?.name ?? "");
      return;
    }

    if (nextPlayerName !== (currentMember?.name ?? "")) {
      onRenamePlayer(nextPlayerName);
    }
  };

  const rulesShortcutLabel = locale === "ko" ? "규칙 보기" : "Open rules";
  const playersShortcutLabel = locale === "ko" ? "참가자 보기" : "Open players";
  const closeRailDrawer = () => {
    setActiveRailPanel(null);
  };
  const toggleRailPanel = (panelId: RailPanelId) => {
    setActiveRailPanel((current) => (current === panelId ? null : panelId));
  };
  const renderRailPanelHeader = ({
    label,
    title,
    inDrawer = false,
    actions
  }: {
    label: string;
    title: string;
    inDrawer?: boolean;
    actions?: ReactNode;
  }) => {
    const hasHeaderActions = actions != null || inDrawer;
    const headerActions = hasHeaderActions ? (
      <div className={styles.drawerPanelActions}>
        {actions}
        {inDrawer ? (
          <button
            className={`${styles.secondaryAction} ${styles.modalCloseButton} ${styles.drawerPanelCloseButton}`}
            onClick={closeRailDrawer}
            type="button"
          >
            {copy.closePanel}
          </button>
        ) : null}
      </div>
    ) : null;

    if (!headerActions) {
      return (
        <div className={styles.railHeading}>
          <span>{label}</span>
          <strong>{title}</strong>
        </div>
      );
    }

    return (
      <div className={inDrawer ? styles.drawerPanelHeader : styles.railHeaderRow}>
        <div className={styles.railHeading}>
          <span>{label}</span>
          <strong>{title}</strong>
        </div>
        {headerActions}
      </div>
    );
  };
  const openRulesModal = () => {
    closeRailDrawer();
    setIsRulesOpen(true);
  };
  const openScoreGuideModal = () => {
    closeRailDrawer();
    setIsScoreGuideOpen(true);
  };
  const inviteInDrawer = renderedRailPanel === "invite";
  const rulesInDrawer = renderedRailPanel === "rules";
  const chatInDrawer = renderedRailPanel === "chat";
  const playersInDrawer = renderedRailPanel === "players";
  const activeDrawerAnchorTop =
    renderedRailPanel != null ? getRailPanelAnchorTop(renderedRailPanel, room.phase) : "1rem";
  const showExpandedRulesPanel = lobbyRulesMode === "inline" || rulesInDrawer;

  const lobbyInvitePanel = (
    <section className={styles.railBlock}>
      {renderRailPanelHeader({
        label: copy.inviteLineLabel,
        title: copy.shareUrlLabel,
        inDrawer: inviteInDrawer
      })}
      <div className={styles.inviteCodeRow}>
        <code className={styles.inviteCode} data-testid="invite-url">
          {inviteUrl}
        </code>
        <button
          aria-label={copy.copyLink}
          className={styles.iconAction}
          data-testid="copy-invite-button"
          onClick={onCopyInvite}
          title={copy.copyLink}
          type="button"
        >
          <CopyLinkIcon />
        </button>
      </div>
    </section>
  );

  const lobbyRulesPanel = (
    <section className={styles.railBlock}>
      {renderRailPanelHeader({
        label: copy.lobbyRuleCardLabel,
        title: copy.lobbyRuleCardTitle,
        inDrawer: rulesInDrawer
      })}
      {showExpandedRulesPanel ? (
        <>
          <RuleSummaryList locale={locale} summary={rulesSummary} />
          <div className={styles.railActionRow}>
            <button
              className={`${styles.secondaryAction} ${styles.railHeaderAction}`}
              data-testid="score-guide-button"
              onClick={openScoreGuideModal}
              type="button"
            >
              {copy.scoreGuideOpen}
            </button>
          </div>
        </>
      ) : (
        <div className={styles.compactRulesPrompt}>
          <p className={styles.railBody}>
            {locale === "ko"
              ? "아래 버튼을 눌러 규칙 및 점수 공식을 확인하세요."
              : "Use the buttons below to review the rules and scoring formulas."}
          </p>
          <div className={styles.railActionRow}>
            <button
              className={styles.secondaryAction}
              onClick={openRulesModal}
              type="button"
            >
              {rulesShortcutLabel}
            </button>
            <button
              className={styles.secondaryAction}
              data-testid="score-guide-button"
              onClick={openScoreGuideModal}
              type="button"
            >
              {copy.scoreGuideOpen}
            </button>
          </div>
        </div>
      )}
    </section>
  );

  const lobbyChatPanel = (
    <section className={`${styles.railBlock} ${styles.lobbyChatBlock}`}>
      {renderRailPanelHeader({
        label: copy.feedLabel,
        title: copy.lobbyChatTitle,
        inDrawer: chatInDrawer
      })}
      <div className={styles.chatScrollWell} ref={lobbyChatListRef}>
        <div
          className={`${styles.chatList} ${styles.lobbyChatList}`}
          data-testid="lobby-chat-list"
        >
          {visibleChatFeed.length === 0 ? (
            <p className={styles.railBody}>{copy.noChatYet}</p>
          ) : (
            visibleChatFeed.map((entry) =>
              entry.kind === "system" ? (
                <div className={styles.systemChatLine} data-kind={entry.systemKey} key={entry.id}>
                  <span>{getSystemChatMessage(entry, locale)}</span>
                </div>
              ) : (
                <div className={styles.lobbyChatLine} key={entry.id}>
                  <strong>{entry.playerName}</strong>
                  <span>{entry.text}</span>
                </div>
              )
            )
          )}
        </div>
      </div>
      <form className={styles.chatComposer} onSubmit={handleChatSubmit}>
        <input
          ref={lobbyChatInputRef}
          data-testid="chat-input"
          maxLength={180}
          onChange={(event) => setChatDraft(event.target.value)}
          placeholder={copy.chatPlaceholder}
          type="text"
          value={chatDraft}
        />
        <button
          className={styles.primaryAction}
          data-testid="chat-send-button"
          disabled={!chatDraft.trim() || isSendingChat}
          type="submit"
        >
          {isSendingChat ? copy.sendingChat : copy.sendChat}
        </button>
      </form>
    </section>
  );

  const livePlayersPanel = (
    <section className={`${styles.railBlock} ${styles.liveRailBlock}`}>
      {renderRailPanelHeader({
        label: liveBoardLabel,
        title: liveBoardTitle,
        inDrawer: playersInDrawer
      })}

      <div className={styles.liveRailContent}>
        <div className={styles.leaderboardSection}>
          <div className={styles.leaderboard} data-testid="leaderboard">
            {sortedPlayers.map((candidate, index) => {
              const status = room.round?.playerStatuses.find((entry) => entry.playerId === candidate.id);
              const state = getLeaderboardState(status);

              return (
                <div
                  className={styles.leaderRow}
                  data-me={candidate.id === playerId}
                  data-state={state}
                  key={candidate.id}
                >
                  <div className={styles.leaderRowMain}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <div>
                      <h5>{candidate.name}</h5>
                      <p>
                        {locale === "ko" ? "시도" : "tries"} {status?.attemptCount ?? 0} ·{" "}
                        {getRoundBoardStatus(locale, status)}
                      </p>
                    </div>
                  </div>
                  <div className={styles.leaderRowScore}>
                    <strong>{candidate.score}</strong>
                  </div>

                  {room.phase === "round-active" &&
                  status?.lastSubmissionKind &&
                  !status.hasSubmitted &&
                  status.lastSubmissionText ? (
                    <div className={styles.leaderBubble} data-kind={status.lastSubmissionKind}>
                      {status.lastSubmissionText}
                    </div>
                  ) : room.phase === "round-active" && recentChatByPlayer.get(candidate.id) ? (
                    <div className={styles.leaderBubble} data-kind="chat">
                      {recentChatByPlayer.get(candidate.id)?.text}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

        </div>
      </div>

      <div className={styles.railFoot}>
        {spectatorCount > 0 ? (
          <div className={styles.liveSpectatorBadge} data-testid="live-spectator-count-card">
            <EyeIcon />
            <strong>
              {locale === "ko"
                ? `관전자 ${spectatorCount}명`
                : `${spectatorCount} spectator${spectatorCount === 1 ? "" : "s"}`}
            </strong>
          </div>
        ) : null}
        <p className={styles.compactHint}>
          {locale === "ko"
            ? `${submittedCount}/${room.players.length}명이 정답을 맞혔습니다.`
            : `${submittedCount}/${room.players.length} players are correct.`}
        </p>
      </div>
    </section>
  );

  const livePlayersCompactPanel = (
    <section className={`${styles.railBlock} ${styles.compactRosterPanel}`}>
      <div className={styles.railHeaderRow}>
        <div className={styles.railHeading}>
          <span>{liveBoardLabel}</span>
          <strong>{liveBoardTitle}</strong>
        </div>
        <button
          className={`${styles.secondaryAction} ${styles.railHeaderAction}`}
          onClick={() => setActiveRailPanel("players")}
          type="button"
        >
          {playersShortcutLabel}
        </button>
      </div>

      <div className={styles.compactRosterSummary}>
        <article className={styles.compactRosterLeaderCard}>
          <span className={styles.compactRosterLeaderRank}>
            {leadingPlayer ? "#1" : locale === "ko" ? "대기" : "Idle"}
          </span>
          <div className={styles.compactRosterLeaderCopy}>
            <small>{locale === "ko" ? "현재 선두" : "Current leader"}</small>
            <strong>{leadingPlayer?.name ?? (locale === "ko" ? "아직 없음" : "No leader yet")}</strong>
          </div>
          <div className={styles.compactRosterLeaderScore}>
            <small>{locale === "ko" ? "점수" : "Score"}</small>
            <strong>{leadingPlayer ? leadingPlayer.score : "-"}</strong>
          </div>
        </article>

        <div className={styles.compactRosterStatGrid}>
          <div className={styles.compactRosterStat}>
            <span>{locale === "ko" ? "내 순위" : "My rank"}</span>
            <strong>
              {currentPlayerRank != null ? `#${currentPlayerRank}` : locale === "ko" ? "관전 중" : "Watching"}
            </strong>
          </div>
          <div className={styles.compactRosterStat}>
            <span>{locale === "ko" ? "정답자" : "Correct"}</span>
            <strong>
              {submittedCount}/{room.players.length}
            </strong>
          </div>
          {spectatorCount > 0 ? (
            <div className={`${styles.compactRosterStat} ${styles.compactRosterStatWide}`}>
              <span>{locale === "ko" ? "관전자" : "Spectators"}</span>
              <strong>
                {locale === "ko" ? `${spectatorCount}명 함께 관전 중` : `${spectatorCount} watching`}
              </strong>
            </div>
          ) : null}
        </div>
      </div>

      {leadingPlayer && leadingPlayerStatus ? (
        <p className={styles.compactHint}>
          {locale === "ko"
            ? `${leadingPlayer.name}님이 시도 ${leadingPlayerStatus.attemptCount ?? 0}회로 선두입니다. 현재 상태: ${getRoundBoardStatus(locale, leadingPlayerStatus)}`
            : `${leadingPlayer.name} leads with ${leadingPlayerStatus.attemptCount ?? 0} tries. Current state: ${getRoundBoardStatus(locale, leadingPlayerStatus)}`}
        </p>
      ) : null}
    </section>
  );

  const liveChatPanel = (
    <section
      className={`${styles.railBlock} ${styles.lobbyChatBlock} ${styles.liveChatBlock}`}
      data-testid="chat-panel"
    >
      {renderRailPanelHeader({
        label: copy.feedLabel,
        title: copy.feedTitle,
        inDrawer: chatInDrawer
      })}
      <div className={styles.chatScrollWell} ref={chatListRef}>
        <div className={`${styles.chatList} ${styles.liveChatList}`} data-testid="chat-list">
          {visibleChatFeed.length === 0 ? (
            <p className={styles.railBody}>{copy.noChatYet}</p>
          ) : (
            visibleChatFeed.map((entry) =>
              entry.kind === "system" ? (
                <div className={styles.systemChatLine} data-kind={entry.systemKey} key={entry.id}>
                  <span>{getSystemChatMessage(entry, locale)}</span>
                </div>
              ) : (
                <div className={styles.chatLine} key={entry.id}>
                  <strong>{entry.playerName}</strong>
                  <span>{entry.text}</span>
                </div>
              )
            )
          )}
        </div>
      </div>

      <form className={styles.chatComposer} onSubmit={handleChatSubmit}>
        <input
          ref={chatInputRef}
          data-testid="chat-input"
          maxLength={180}
          onChange={(event) => setChatDraft(event.target.value)}
          placeholder={copy.chatPlaceholder}
          type="text"
          value={chatDraft}
        />
        <button
          className={styles.primaryAction}
          data-testid="chat-send-button"
          disabled={!chatDraft.trim() || isSendingChat}
          type="submit"
        >
          {isSendingChat ? copy.sendingChat : copy.sendChat}
        </button>
      </form>
      <p className={styles.compactHint}>{copy.feedHint}</p>
    </section>
  );

  const railPanels: Array<{ id: RailPanelId; tabLabel: string; content: ReactNode }> =
    room.phase === "lobby"
        ? [
            {
              id: "invite",
            tabLabel: locale === "ko" ? "초대 링크 보기" : "Invite",
              content: lobbyInvitePanel
            },
            {
              id: "rules",
            tabLabel: locale === "ko" ? "현재 룰 보기" : "Rules",
              content: lobbyRulesPanel
            },
            {
              id: "chat",
            tabLabel: locale === "ko" ? "채팅창 보기" : "Chat",
              content: lobbyChatPanel
            }
          ]
      : room.phase === "finished"
        ? []
          : [
              {
                id: "players",
              tabLabel: locale === "ko" ? "참가자 보기" : "Players",
                content: livePlayersPanel
              },
              {
                id: "chat",
              tabLabel: locale === "ko" ? "채팅창 보기" : "Chat",
                content: liveChatPanel
              }
            ];

  const renderedRailDescriptor = railPanels.find((panel) => panel.id === renderedRailPanel) ?? null;
  const showRailDrawer = renderedRailDescriptor != null && canUseRailDrawer;

  return (
    <section
      className={styles.roomLayout}
      data-density={density}
      data-lobby-rules-mode={room.phase === "lobby" ? lobbyRulesMode : undefined}
      data-overlay-active={overlayActive}
      data-phase={room.phase}
      data-crowded-lobby={isCrowdedLobbyRoster ? "true" : undefined}
      data-rail-mode={effectiveRailMode}
      data-scroll-mode={pageScrollMode}
      data-round-roster-mode={room.phase === "round-active" ? roundRosterMode : undefined}
      ref={roomLayoutRef}
      style={roomLayoutStyle}
    >
      <div className={styles.stageColumn}>
        <section className={styles.broadcastLine}>
          <div>
            <p className={styles.kicker}>{copy.roomBroadcast}</p>
            {isHost && room.phase === "lobby" && isRenamingRoom ? (
              <form
                className={styles.roomNameForm}
                onSubmit={(event) => {
                  event.preventDefault();
                  handleRoomNameCommit();
                }}
              >
                <input
                  ref={roomNameInputRef}
                  className={styles.roomNameInput}
                  data-testid="room-name-input"
                  onBlur={handleRoomNameCommit}
                  onChange={(event) => setRoomNameDraft(event.target.value)}
                  value={roomNameDraft}
                />
              </form>
            ) : (
              <button
                className={styles.roomNameButton}
                data-testid="room-name-button"
                onClick={() => {
                  if (isHost && room.phase === "lobby") {
                    setIsRenamingRoom(true);
                  }
                }}
                type="button"
              >
                {room.roomName}
              </button>
            )}
          </div>
          <div className={styles.broadcastMeta}>
            {isHost && room.phase !== "lobby" && room.phase !== "finished" ? (
              <button
                className={styles.broadcastMetaButton}
                data-testid="live-reset-button"
                disabled={busyState === "reset"}
                onClick={onResetRoom}
                type="button"
              >
                {busyState === "reset" ? copy.resettingLobby : copy.resetLobby}
              </button>
            ) : null}
            <span className={styles.phaseBadge} data-phase={room.phase}>
              {getPhaseBadgeLabel(locale, room.phase)}
            </span>
            <span data-testid="room-id-chip">{room.roomId}</span>
            <span>{getModeLabelByLocale(locale, room.settings.mode)}</span>
            <span>
              {(room.round?.roundNumber ?? room.completedRounds)}/{room.settings.roundCount}
            </span>
            <span data-testid="match-clock-chip">{formatClock(matchElapsedMs, locale)}</span>
            {room.averageRoundDurationMs > 0 ? (
              <span>{`${locale === "ko" ? "평균" : "avg"} ${formatClock(room.averageRoundDurationMs, locale)}`}</span>
            ) : null}
          </div>
        </section>

        <section className={styles.stageSurface} data-phase={room.phase}>
          {room.phase === "lobby" ? (
            <div className={styles.lobbyDeck}>
              <div className={styles.lobbyLead}>
                <div className={styles.lobbyLeadRow}>
                  <div>
                    <span className={styles.challengeLabel}>{lobbyRosterLabel}</span>
                    <h4>{lobbyRosterTitle}</h4>
                  </div>

                  <div className={styles.actionRow}>
                    {!isHost && !isSpectator ? (
                      <button
                        className={currentPlayer?.isReady ? styles.primaryAction : styles.secondaryAction}
                        data-testid="ready-button"
                        onClick={() => onSetReady(!(currentPlayer?.isReady ?? false))}
                        type="button"
                      >
                        {getReadyButtonLabel(locale, currentPlayer?.isReady ?? false)}
                      </button>
                    ) : null}
                    {isHost ? (
                      <>
                        <button
                          className={styles.secondaryAction}
                          data-testid="settings-button"
                          onClick={() => setIsSettingsOpen(true)}
                          type="button"
                        >
                          {copy.openGameSettings}
                        </button>
                        <button
                          className={styles.secondaryAction}
                          data-testid="match-settings-button"
                          onClick={() => setIsMatchSettingsOpen(true)}
                          type="button"
                        >
                          {copy.openMatchSettings}
                        </button>
                        <button
                          className={styles.primaryAction}
                          data-testid="start-button"
                          disabled={busyState === "start"}
                          onClick={onStartGame}
                          type="button"
                        >
                          {busyState === "start" ? copy.startingMatch : copy.startMatch}
                        </button>
                      </>
                    ) : null}
                    {isSpectator ? (
                      <button
                        className={styles.secondaryAction}
                        data-testid="become-player-button"
                        disabled={!canSeatMorePlayers}
                        onClick={onBecomePlayer}
                        type="button"
                      >
                        {!canSeatMorePlayers
                          ? copy.spectatorSeatFull
                          : copy.spectatorSeatJoin}
                      </button>
                    ) : null}
                    <button
                      className={styles.secondaryAction}
                      data-testid="leave-room-button"
                      disabled={busyState === "leave"}
                      onClick={onLeaveRoom}
                      type="button"
                    >
                      {busyState === "leave" ? copy.leavingRoom : copy.leaveRoom}
                    </button>
                  </div>
                </div>

                <div className={styles.broadcastMeta}>
                  <span>
                    {connectedGuests.length > 0
                      ? `${readyCount}/${connectedGuests.length} ${locale === "ko" ? "준비" : "ready"}`
                      : copy.noGuestsLabel}
                  </span>
                  <span>
                    {room.players.length}
                    /{room.matchSettings.maxPlayers}
                    {locale === "ko" ? copy.playersUnit : ` ${copy.playersUnit}`}
                  </span>
                  {connectedSpectators.length > 0 ? (
                    <span>
                      {locale === "ko"
                        ? `${copy.spectatorsUnit} ${connectedSpectators.length}${copy.playersUnit}`
                        : `${connectedSpectators.length} ${copy.spectatorsUnit}`}
                    </span>
                  ) : null}
                  <span>{getModeLabelByLocale(locale, room.settings.mode)}</span>
                  <span>
                    {room.settings.roundCount} {copy.roundsUnit}
                  </span>
                  <span>
                    {roundTimeSummary}
                  </span>
                  {binaryRatioSummary ? <span>{binaryRatioSummary}</span> : null}
                  {factorResolutionSummary ? <span>{factorResolutionSummary}</span> : null}
                  {room.settings.mode === "factor" && room.settings.factorOrderedAnswer ? (
                    <span>{locale === "ko" ? "하드 순서" : "ordered hard"}</span>
                  ) : null}
                  {room.settings.mode === "factor" &&
                  room.settings.factorResolutionMode !== "golden-bell" &&
                  room.settings.factorSingleAttempt ? (
                    <span>{locale === "ko" ? "1회 기회" : "single try"}</span>
                  ) : null}
                  {room.settings.mode === "factor" &&
                  room.settings.factorResolutionMode === "all-play" &&
                  room.settings.factorSuddenDeath ? (
                    <span>{locale === "ko" ? "서든데스" : "sudden death"}</span>
                  ) : null}
                  {room.settings.mode === "factor" ? (
                    <span>
                      {room.settings.factorPrimeAnswerMode === "number"
                        ? locale === "ko"
                          ? "소수는 수 하나"
                          : "prime = number"
                        : locale === "ko"
                          ? '"야호 소수다"'
                          : 'prime = "야호 소수다"'}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className={styles.rosterArena}>
                {rosterSlots.map((candidate, index) =>
                  candidate ? (
                    <article
                      className={styles.playerPod}
                      data-host={candidate.isHost}
                      data-me={candidate.id === playerId}
                      data-offline={!candidate.connected}
                      data-testid="player-pod"
                      key={candidate.id}
                    >
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      {candidate.id === playerId && isRenamingPlayer ? (
                        <form
                          className={styles.playerNameForm}
                          onSubmit={(event) => {
                            event.preventDefault();
                            handlePlayerNameCommit();
                          }}
                        >
                          <input
                            ref={playerNameInputRef}
                            className={styles.playerNameInput}
                            data-testid="player-name-input"
                            maxLength={PLAYER_NAME_MAX_LENGTH * 2}
                            onBlur={handlePlayerNameCommit}
                            onChange={(event) => handlePlayerNameDraftChange(event.target.value)}
                            onCompositionEnd={(event) => handlePlayerNameCompositionEnd(event.currentTarget.value)}
                            onCompositionStart={handlePlayerNameCompositionStart}
                            value={playerNameDraft}
                          />
                        </form>
                      ) : candidate.id === playerId ? (
                        <button
                          className={styles.playerNameButton}
                          data-testid="player-name-button"
                          onClick={() => setIsRenamingPlayer(true)}
                          type="button"
                        >
                          {candidate.name}
                        </button>
                      ) : (
                        <strong>{candidate.name}</strong>
                      )}
                      <div className={styles.playerPodMetaSpacer} aria-hidden="true" />
                      <div className={styles.podScore}>
                        {candidate.isHost ? (
                          <small className={styles.hostBadge}>{copy.hostSuffix}</small>
                        ) : (
                          <small>{candidate.isReady ? getReadyBadge(locale) : getNotReadyBadge(locale)}</small>
                        )}
                        {!candidate.connected ? <small>{copy.offlineSuffix}</small> : null}
                      </div>
                      {isHost && candidate.id !== playerId && candidate.connected ? (
                        <div className={styles.playerPodActions}>
                          <button
                            className={styles.miniAction}
                            disabled={busyState === "kick"}
                            onClick={() => onTransferHost(candidate.id)}
                            type="button"
                          >
                            {copy.transferHost}
                          </button>
                          <button
                            aria-label={
                              locale === "ko" ? `${candidate.name} 추방` : `Kick ${candidate.name}`
                            }
                            className={styles.miniAction}
                            data-testid="kick-player-button"
                            data-tone="danger"
                            disabled={busyState === "kick"}
                            onClick={() => onKickPlayer(candidate.id)}
                            type="button"
                          >
                            {busyState === "kick" ? copy.kickingPlayer : copy.kickPlayer}
                          </button>
                        </div>
                      ) : null}
                    </article>
                  ) : (
                    <article className={`${styles.playerPod} ${styles.playerPodGhost}`} key={`ghost-${index}`}>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <div className={styles.playerPodGhostBody} aria-hidden="true" />
                    </article>
                  )
                )}
              </div>

              {spectatorCount > 0 ? (
                <div className={styles.spectatorStrip}>
                  <div className={styles.railHeading}>
                    <span>{copy.spectatorLabel}</span>
                    <strong>{copy.spectatorTitle}</strong>
                  </div>
                  <div className={styles.spectatorSummary} data-testid="spectator-count-card">
                    <strong>
                      {locale === "ko"
                        ? `현재 관전자 ${spectatorCount}명`
                        : `${spectatorCount} spectator${spectatorCount === 1 ? "" : "s"}`}
                    </strong>
                    <p>
                      {isSpectator
                        ? copy.spectatorLiveBody
                        : locale === "ko"
                          ? "관전자는 라운드 종료 후 로비로 함께 돌아옵니다."
                          : "Spectators return to the lobby together after the round ends."}
                    </p>
                  </div>
                </div>
              ) : null}

              <div className={styles.lobbyFoot}>
                <p className={styles.compactHint}>
                  {isSpectator
                    ? locale === "ko"
                      ? "지금은 관전 중입니다. 로비에서 좌석이 비면 플레이어로 참가할 수 있습니다."
                      : "You are spectating right now. Take a player seat from the lobby when one is open."
                    : allReady
                    ? locale === "ko"
                      ? "모두 준비됐습니다. 방장이 시작할 수 있습니다."
                      : "Everyone is ready. The host can start now."
                    : locale === "ko"
                      ? "각자 준비 버튼을 눌러야 게임을 시작할 수 있습니다."
                      : "Everyone has to click ready before the match can start."}
                </p>
                {!isHost ? (
                  <div className={styles.waitingPanel}>
                    <strong>{copy.waitingHostTitle}</strong>
                    <p>{copy.waitingHostBody}</p>
                  </div>
                ) : null}
              </div>
            </div>
          ) : room.phase === "finished" ? (
            <div className={styles.resultsDeck}>
              <div className={styles.resultsLead}>
                <span className={styles.challengeLabel}>{copy.resultsLabel}</span>
                <h4>{copy.resultsTitle}</h4>
                <p>{copy.resultsBody}</p>
              </div>
              <div className={styles.waitingPanel}>
                <strong>{locale === "ko" ? "결산 화면이 중앙에 표시됩니다." : "The final overlay is shown in the center."}</strong>
                <p>{copy.resultsResetHint}</p>
              </div>
            </div>
              ) : (
            <div className={styles.roundGrid}>
              <div className={styles.challengePanel}>
                <div className={styles.challengePanelHeader}>
                  <div className={styles.challengeCopyBlock}>
                    <span className={styles.challengeLabel}>{copy.challengeLabel}</span>
                    <h4>{roundCopy?.prompt}</h4>
                  </div>
                  {room.phase === "round-active" && room.round?.hasRoundTimer ? (
                    <div className={`${styles.timerCluster} ${styles.challengeTimerCluster}`}>
                      <span>
                        {roundRemainingSeconds}
                        {locale === "ko" ? copy.secondsUnit : "s"}
                      </span>
                      <div className={styles.timerTrack}>
                        <div
                          className={styles.timerPulse}
                          style={{ transform: `scaleX(${progressRatio})` }}
                        />
                      </div>
                    </div>
                  ) : room.phase === "round-active" && roundModeBadge ? (
                    <div className={`${styles.timerCluster} ${styles.challengeTimerCluster}`}>
                      <span>{roundModeBadge}</span>
                      <div className={styles.timerTrack}>
                        <div className={styles.timerPulse} style={{ transform: "scaleX(1)" }} />
                      </div>
                    </div>
                  ) : null}
                </div>
                {showChallengeHelper ? <p>{roundCopy?.helper}</p> : null}
              </div>

              {room.phase === "round-active" ? (
                isSpectator ? (
                  <div
                    className={`${styles.waitingPanel} ${styles.spectatorPanelCompact}`}
                    data-testid="spectator-panel"
                  >
                    <span className={styles.challengeLabel}>{copy.spectatorLabel}</span>
                    <strong>{copy.spectatorLiveTitle}</strong>
                    <p>{copy.spectatorLiveBody}</p>
                  </div>
                ) : myRoundStatus?.hasSubmitted ? (
                  <div className={styles.revealPanel} data-state="success" data-testid="success-panel">
                    <span className={styles.challengeLabel}>
                      {locale === "ko" ? "정답 입력 완료" : "Answer locked"}
                    </span>
                    <strong>{locale === "ko" ? "정답을 맞췄습니다!" : "Correct answer locked in!"}</strong>
                    <p>
                      {locale === "ko"
                        ? "오른쪽 리더보드에서 다른 플레이어 진행과 순위를 확인해 보세요."
                        : "Watch the rest of the room from the leaderboard."}
                    </p>
                  </div>
                ) : myRoundStatus?.isLockedOut ? (
                  <div className={styles.revealPanel} data-state="locked" data-testid="locked-panel">
                    <span className={styles.challengeLabel}>
                      {locale === "ko" ? "입력 종료" : "Input locked"}
                    </span>
                    <strong>
                      {room.settings.factorResolutionMode === "golden-bell"
                        ? locale === "ko"
                          ? isGoldenBellSingleAttempt
                            ? "골든벨 기회를 사용해 더 이상 답변할 수 없습니다."
                            : "현재 답변권은 비어 있지만 잠시 뒤 다시 외칠 수 있습니다."
                          : isGoldenBellSingleAttempt
                            ? "You already spent your golden bell chance."
                            : "Your answer turn ended. You can buzz again."
                        : locale === "ko"
                          ? "이번 라운드의 기회를 모두 사용했습니다."
                          : "You are out of attempts for this round."}
                    </strong>
                    <p>
                      {room.settings.factorResolutionMode === "golden-bell"
                        ? locale === "ko"
                          ? isGoldenBellSingleAttempt
                            ? "다른 플레이어의 결과를 기다려 주세요."
                            : "다음 기회를 위해 입력을 다시 준비할 수 있습니다."
                          : isGoldenBellSingleAttempt
                            ? "Wait for the rest of the room to finish."
                            : "Prepare the next input while waiting for the turn to reopen."
                        : locale === "ko"
                          ? "정답 공개까지 잠시 기다려 주세요."
                          : "Wait for the answer reveal."}
                    </p>
                  </div>
                ) : (
                  <form
                    className={styles.answerPanel}
                    data-testid={isGoldenBellRound ? "golden-bell-answer-panel" : undefined}
                    onSubmit={onSubmitAnswer}
                  >
                    <label className={styles.field}>
                      <span className={styles.fieldLabelLine}>
                        {copy.answerInputLabel}
                        {answerLabelHint ? (
                          <em className={styles.inlineFieldHint}>{answerLabelHint}</em>
                        ) : null}
                      </span>
                      <input
                        ref={answerInputRef}
                        data-testid="answer-input"
                        onChange={(event) => onAnswerDraftChange(event.target.value)}
                        onPaste={(event) => event.preventDefault()}
                        placeholder={
                          room.settings.mode === "factor"
                            ? copy.answerPlaceholderFactor
                            : getBaseConversionPlaceholder(room.round?.challengeMeta as BinaryChallengeMeta | undefined)
                        }
                        type="text"
                        value={answerDraft}
                      />
                    </label>
                    {binaryPreviewText ? (
                      <small className={styles.answerPreview} data-testid="binary-preview">
                        {copy.binaryPreviewLabel}: {binaryPreviewText}
                      </small>
                    ) : null}
                    {isGoldenBellRound ? (
                      <small>
                        {isMyAnswerTurn
                          ? `${copy.goldenBellAnswering} ${
                              goldenBellCountdownSeconds > 0
                                ? locale === "ko"
                                  ? `${goldenBellCountdownSeconds}${copy.secondsUnit} 안에 답하세요.`
                                  : `Answer within ${goldenBellCountdownSeconds}s.`
                                : ""
                            }`
                          : answeringPlayer
                            ? locale === "ko"
                              ? `${answeringPlayer.name}님이 답변 중입니다. ${goldenBellCountdownSeconds > 0 ? `${goldenBellCountdownSeconds}${copy.secondsUnit} 남음` : ""}`
                              : `${answeringPlayer.name} is answering now. ${goldenBellCountdownSeconds > 0 ? `${goldenBellCountdownSeconds}s left` : ""}`
                            : isGoldenBellReclaimBlocked
                              ? locale === "ko"
                                ? "방금 외친 플레이어는 다른 플레이어 1명이 먼저 외친 뒤에 다시 외칠 수 있습니다."
                                : "The last caller must wait until another player claims first."
                              : copy.enterFocusHint}
                      </small>
                    ) : (
                      <small>{copy.enterFocusHint}</small>
                    )}
                    <div className={styles.actionRow}>
                      <button
                        className={styles.secondaryAction}
                        data-testid="answer-rules-button"
                        onClick={openRulesModal}
                        type="button"
                      >
                        {locale === "ko" ? "룰" : "Rules"}
                      </button>
                      {isGoldenBellRound ? (
                        <button
                          className={styles.secondaryAction}
                          data-testid="claim-answer-button"
                          disabled={busyState === "claim" || !canClaimGoldenBell}
                          onClick={onClaimAnswerTurn}
                          type="button"
                        >
                          {busyState === "claim" ? copy.claimingAnswerTurn : copy.claimAnswerTurn}
                        </button>
                      ) : null}
                      <button
                        className={styles.primaryAction}
                        data-testid="submit-answer-button"
                        disabled={
                          !answerDraft.trim() ||
                          busyState === "submit" ||
                          (isGoldenBellRound && !isMyAnswerTurn)
                        }
                        type="submit"
                      >
                        {busyState === "submit" ? copy.checkingAnswer : copy.submitAnswer}
                      </button>
                    </div>
                  </form>
                )
              ) : (
                <div className={styles.waitingPanel}>
                  <strong>{locale === "ko" ? "정답 공개 화면이 중앙에 표시됩니다." : "The answer reveal is shown in the center."}</strong>
                  <p>{statusMessage}</p>
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {showInlineRail ? (
        <aside
          className={`${styles.sideRail} ${
            room.phase === "lobby"
              ? styles.sideRailLobby
              : room.phase === "finished"
                ? styles.sideRailResults
                : styles.sideRailLive
          } ${showCompactLiveRoster ? styles.sideRailLiveCompact : ""}`}
        >
          {room.phase === "lobby" ? (
            <>
              {lobbyInvitePanel}
              {lobbyRulesPanel}
              {lobbyChatPanel}
            </>
          ) : room.phase === "finished" ? (
          <>
            <section className={styles.railBlock}>
              <div className={styles.railHeading}>
                <span>{copy.resultsWinnerLabel}</span>
                <strong>{copy.leaderboardTitle}</strong>
              </div>
              <div className={styles.podiumDeck}>
                {podiumPlayers.map((candidate, index) => (
                  <article
                    className={styles.podiumCard}
                    data-rank={index + 1}
                    key={candidate.id}
                  >
                    <span>{getPodiumLabel(copy, index)}</span>
                    <strong>{candidate.name}</strong>
                    <p>{candidate.score}</p>
                  </article>
                ))}
              </div>
            </section>

            <section className={styles.railBlock}>
              <div className={styles.railHeading}>
                <span>{copy.resultsStandingsLabel}</span>
                <strong>{copy.resultsTitle}</strong>
              </div>
              <p className={styles.railBody}>{copy.resultsResetHint}</p>
            </section>
          </>
          ) : (
            <>
              {showCompactLiveRoster ? livePlayersCompactPanel : livePlayersPanel}
              {liveChatPanel}
            </>
          )}
        </aside>
      ) : null}

      {showPeekRail ? (
        <div className={styles.railPeekDock}>
          {railPanels.map((panel) => (
            <button
              aria-expanded={activeRailPanel === panel.id}
              className={styles.railPeekButton}
              data-active={activeRailPanel === panel.id}
              key={panel.id}
              onClick={() => toggleRailPanel(panel.id)}
              style={{ "--rail-tab-top": getRailPanelAnchorTop(panel.id, room.phase) } as CSSProperties}
              type="button"
            >
              <span className={styles.railPeekLabel}>{panel.tabLabel}</span>
            </button>
          ))}
        </div>
      ) : null}

      {showRailDrawer && renderedRailDescriptor ? (
        <div
          className={styles.railDrawerOverlay}
          data-open={isRailDrawerVisible}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeRailDrawer();
            }
          }}
          style={{ "--drawer-anchor-top": activeDrawerAnchorTop } as CSSProperties}
        >
          <aside
            className={styles.railDrawer}
            data-panel-id={renderedRailDescriptor.id}
            onClick={(event) => event.stopPropagation()}
          >
            {renderedRailDescriptor.content}
          </aside>
        </div>
      ) : null}

      {room.phase === "round-ended" && room.round ? (
        <div className={styles.screenOverlay} data-phase="reveal">
          <div className={styles.screenOverlayScrim} />
          <section className={`${styles.screenCard} ${styles.screenCardNarrow}`} data-testid="round-reveal-panel">
            <div className={styles.screenHero}>
              <span className={styles.challengeLabel}>{copy.answerRevealLabel}</span>
              <h3>{roundCopy?.prompt}</h3>
              <p>
                {locale === "ko"
                  ? `${roundTransitionSeconds}${copy.secondsUnit} 뒤 자동으로 ${
                      room.completedRounds >= room.settings.roundCount ? "결과 화면" : "다음 라운드"
                    }로 넘어갑니다.`
                  : `Automatically moving in ${roundTransitionSeconds}s.`}
              </p>
            </div>

            <div className={styles.screenAnswerBlock}>
              <span>{locale === "ko" ? "정답" : "Answer"}</span>
              <strong>{room.round.revealedAnswer ?? "-"}</strong>
            </div>

            <div className={`${styles.overlayStatRow} ${styles.overlayStatRowCompact}`}>
              <div className={`${styles.statusNode} ${styles.statusNodeInline}`}>
                <span>{locale === "ko" ? "라운드" : "round"}</span>
                <strong>
                  {room.round.roundNumber}/{room.settings.roundCount}
                </strong>
              </div>
              <div className={`${styles.statusNode} ${styles.statusNodeInline}`}>
                <span>{revealSummary.label}</span>
                <strong>{revealSummary.value}</strong>
              </div>
              <div className={`${styles.statusNode} ${styles.statusNodeInline}`}>
                <span>{locale === "ko" ? "점수 변동" : "score swing"}</span>
                <strong>{revealDeltaRange}</strong>
              </div>
            </div>

            <div className={styles.revealDeltaBoard} data-testid="round-delta-board">
              <div className={styles.revealDeltaHeader}>
                <span>{locale === "ko" ? "이번 라운드 점수 변화" : "Round score changes"}</span>
                <strong>
                  {locale === "ko" ? "변동 폭 기준 정렬" : "Sorted by score swing"}
                </strong>
              </div>

              <div className={styles.revealDeltaList}>
                {roundDeltaRows.map((entry) => (
                  <article
                    className={styles.revealDeltaRow}
                    data-tone={getScoreDeltaTone(entry.delta)}
                    key={entry.playerId}
                  >
                    <div className={styles.revealDeltaPlayer}>
                      <strong>{entry.name}</strong>
                      <p>{entry.statusLabel}</p>
                    </div>

                    <div className={styles.revealDeltaTotal}>
                      <span>{locale === "ko" ? "누적" : "total"}</span>
                      <strong>{entry.totalScore}</strong>
                    </div>

                    <div className={styles.revealDeltaValue} data-tone={getScoreDeltaTone(entry.delta)}>
                      {formatSignedScore(entry.delta)}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {room.phase === "finished" ? (
        <div className={styles.screenOverlay} data-phase="results">
          <div className={styles.screenOverlayScrim} />
          <section className={`${styles.screenCard} ${styles.screenCardWide}`}>
            <div className={styles.screenHero}>
              <span className={styles.challengeLabel}>{copy.resultsLabel}</span>
              <h3>{copy.resultsTitle}</h3>
              <p>{copy.resultsBody}</p>
            </div>

            <div className={styles.overlayStatRow}>
              <div className={styles.statusNode}>
                <span>{copy.resultsWinnerLabel}</span>
                <strong>{winnerNames || sortedPlayers[0]?.name || "-"}</strong>
              </div>
              <div className={styles.statusNode}>
                <span>{copy.roundCountField}</span>
                <strong>
                  {room.settings.roundCount} {copy.roundsUnit}
                </strong>
              </div>
              <div className={styles.statusNode}>
                <span>{locale === "ko" ? "총 시간" : "total time"}</span>
                <strong data-testid="results-total-time">
                  {formatClock(room.totalMatchDurationMs, locale)}
                </strong>
              </div>
            </div>

              <div className={styles.overlayResultsLayout}>
              <div className={styles.podiumDeck}>
                {podiumPlayers.map((candidate, index) => (
                  <article className={styles.podiumCard} data-rank={index + 1} key={candidate.id}>
                    <span>{getPodiumLabel(copy, index)}</span>
                    <strong>{candidate.name}</strong>
                    <p>{candidate.score}</p>
                  </article>
                ))}
              </div>

              <div className={styles.resultsTable} data-testid="results-table">
                <div className={styles.resultsRow} data-header="true">
                  <span>{copy.resultsTableRank}</span>
                  <span>{copy.resultsTablePlayer}</span>
                  <span>{copy.resultsTableCorrect}</span>
                  <span>{copy.resultsTableScore}</span>
                </div>

                {sortedPlayers.map((candidate, index) => {
                  const isWinner = room.finalWinnerIds.includes(candidate.id);

                  return (
                    <div
                      className={styles.resultsRow}
                      data-me={candidate.id === playerId}
                      data-winner={isWinner}
                      key={candidate.id}
                    >
                      <span>#{index + 1}</span>
                      <strong>{candidate.name}</strong>
                      <span>{candidate.correctAnswers}</span>
                      <strong>{candidate.score}</strong>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className={styles.overlayFooter}>
              <p className={styles.compactHint}>
                {locale === "ko"
                  ? `${resultsAutoResetSeconds}${copy.secondsUnit} 뒤 자동으로 로비로 이동합니다.`
                  : `Returning to the lobby automatically in ${resultsAutoResetSeconds}s.`}
              </p>
              <div className={styles.actionRow}>
                <button
                  className={styles.primaryAction}
                  disabled={busyState === "reset"}
                  onClick={onResetRoom}
                  type="button"
                >
                  {busyState === "reset" ? copy.resettingLobby : copy.resultsReturnNow}
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {isHost && room.phase === "lobby" && isSettingsOpen ? (
        <div
          className={styles.modalBackdrop}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setIsSettingsOpen(false);
            }
          }}
        >
          <section className={styles.settingsModal} data-testid="settings-modal">
            <div className={styles.modalHeader}>
              <div className={styles.modalTitleBlock}>
                <span className={styles.challengeLabel}>{copy.lobbySettingsLabel}</span>
                <strong>{copy.lobbySettingsTitle}</strong>
              </div>
              <button
                className={`${styles.secondaryAction} ${styles.modalCloseButton}`}
                onClick={() => setIsSettingsOpen(false)}
                type="button"
              >
                {copy.closePanel}
              </button>
            </div>

            <div className={styles.settingsColumn}>
              <div className={`${styles.field} ${styles.settingsFullWidth}`}>
                <span>{copy.gameModeField}</span>
                <div className={styles.modeChoiceRow} data-columns="2">
                  {(["factor", "binary"] as const).map((modeValue) => (
                    <button
                      className={styles.modeChoiceButton}
                      data-active={settingsDraft.mode === modeValue}
                      data-testid={`settings-mode-${modeValue}`}
                      key={modeValue}
                      onClick={() =>
                        onSettingsDraftChange((current) => ({
                          ...current,
                          mode: modeValue as GameMode
                        }))
                      }
                      type="button"
                    >
                      {getModeLabelByLocale(locale, modeValue)}
                    </button>
                  ))}
                </div>
                <small className={styles.fieldNote}>
                  {getModeDescriptionByLocale(locale, settingsDraft.mode)}
                </small>
              </div>

              <div className={styles.settingsSplitGrid}>
                <div className={`${styles.field} ${styles.rangeField}`}>
                  <div className={styles.fieldHead}>
                    <span>{copy.roundCountField}</span>
                    <strong className={styles.rangeValue}>
                      {settingsDraft.roundCount} {copy.roundsUnit}
                    </strong>
                  </div>
                  <input
                    className={styles.rangeInput}
                    data-testid="round-count-range"
                    type="range"
                    min="3"
                    max="50"
                    step="1"
                    value={settingsDraft.roundCount}
                    onChange={(event) =>
                      onSettingsDraftChange((current) => ({
                        ...current,
                        roundCount: Number(event.target.value)
                      }))
                    }
                  />
                </div>

                <div className={`${styles.field} ${styles.rangeField}`}>
                  <div className={styles.fieldHead}>
                    <span>{copy.timeLimitField}</span>
                    <strong className={styles.rangeValue}>{settingsTimeSummary}</strong>
                  </div>
                  <input
                    className={styles.rangeInput}
                    data-testid="time-limit-range"
                    type="range"
                    min="15"
                    max="90"
                    step="5"
                    value={settingsDraft.roundTimeSec}
                    onChange={(event) =>
                      onSettingsDraftChange((current) => ({
                        ...current,
                        roundTimeSec: Number(event.target.value)
                      }))
                    }
                  />
                  {isGoldenBellSettings ? (
                    <small className={styles.fieldNote}>{copy.goldenBellUntimedHint}</small>
                  ) : null}
                </div>
              </div>

              {settingsDraft.mode === "binary" ? (
                <div className={styles.settingsStack}>
                  <div className={styles.field}>
                    <div className={styles.fieldHead}>
                      <span>{copy.binaryRatioField}</span>
                      <strong className={styles.rangeValue}>
                        {getBinaryRatioSummary(locale, settingsDraft.baseConversionPair)}
                      </strong>
                    </div>
                    <div className={styles.modeChoiceRow}>
                      {(["2-10", "10-16", "2-16"] as const).map((pairValue) => (
                        <button
                          className={styles.modeChoiceButton}
                          data-active={settingsDraft.baseConversionPair === pairValue}
                          data-testid={`base-pair-${pairValue}`}
                          key={pairValue}
                          onClick={() =>
                            onSettingsDraftChange((current) => ({
                              ...current,
                              baseConversionPair: pairValue
                            }))
                          }
                          type="button"
                        >
                          {getBinaryRatioSummary(locale, pairValue)}
                        </button>
                      ))}
                    </div>
                    <small className={styles.fieldNote}>{copy.binaryRatioHint}</small>
                  </div>

                  <label
                    className={styles.toggleCard}
                    data-active={settingsDraft.binaryLivePreview}
                    data-testid="binary-preview-card"
                  >
                    <input
                      data-testid="binary-preview-toggle"
                      checked={settingsDraft.binaryLivePreview}
                      onChange={(event) =>
                        onSettingsDraftChange((current) => ({
                          ...current,
                          binaryLivePreview: event.target.checked
                        }))
                      }
                      type="checkbox"
                    />
                    <span>
                      <strong>{copy.binaryPreviewToggle}</strong>
                      <small>{copy.binaryPreviewHint}</small>
                    </span>
                  </label>
                </div>
              ) : (
                <>
                  <div className={`${styles.field} ${styles.settingsFullWidth}`}>
                    <span>{copy.factorResolutionField}</span>
                    <div className={styles.modeChoiceRow}>
                      {(
                        [
                          ["all-play", copy.factorResolutionAllPlay],
                          ["first-correct", copy.factorResolutionFirstCorrect],
                          ["golden-bell", copy.factorResolutionGoldenBell]
                        ] as const
                      ).map(([modeValue, label]) => (
                        <button
                          className={styles.modeChoiceButton}
                          data-active={settingsDraft.factorResolutionMode === modeValue}
                          data-testid={`factor-resolution-${modeValue}`}
                          key={modeValue}
                          onClick={() =>
                            onSettingsDraftChange((current) => ({
                              ...current,
                              factorResolutionMode: modeValue as FactorResolutionMode
                            }))
                          }
                          type="button"
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <small className={styles.fieldNote}>
                      {getFactorResolutionDescription(locale, settingsDraft.factorResolutionMode)}
                    </small>
                  </div>

                  <div className={styles.settingsOptionGrid}>
                    <label
                      className={styles.toggleCard}
                      data-active={settingsDraft.factorPrimeAnswerMode === "number"}
                      data-testid="factor-prime-answer-card"
                    >
                      <input
                        data-testid="factor-prime-answer-toggle"
                        checked={settingsDraft.factorPrimeAnswerMode === "number"}
                        onChange={(event) =>
                          onSettingsDraftChange((current) => ({
                            ...current,
                            factorPrimeAnswerMode: event.target.checked ? "number" : "phrase"
                          }))
                        }
                        type="checkbox"
                      />
                      <span>
                        <strong>{copy.factorPrimeAnswerToggle}</strong>
                        <small>{copy.factorPrimeAnswerHint}</small>
                      </span>
                    </label>

                    <label
                      className={styles.toggleCard}
                      data-active={settingsDraft.factorOrderedAnswer}
                      data-testid="factor-ordered-card"
                    >
                      <input
                        data-testid="factor-ordered-toggle"
                        checked={settingsDraft.factorOrderedAnswer}
                        onChange={(event) =>
                          onSettingsDraftChange((current) => ({
                            ...current,
                            factorOrderedAnswer: event.target.checked
                          }))
                        }
                        type="checkbox"
                      />
                      <span>
                        <strong>{copy.factorOrderedLabel}</strong>
                        <small>{copy.factorOrderedHint}</small>
                      </span>
                    </label>

                    {settingsDraft.factorResolutionMode !== "golden-bell" ? (
                      <label
                        className={styles.toggleCard}
                        data-active={settingsDraft.factorSingleAttempt}
                        data-testid="factor-single-attempt-card"
                      >
                        <input
                          data-testid="factor-single-attempt-toggle"
                          checked={settingsDraft.factorSingleAttempt}
                          onChange={(event) =>
                            onSettingsDraftChange((current) => ({
                              ...current,
                              factorSingleAttempt: event.target.checked
                            }))
                          }
                          type="checkbox"
                        />
                        <span>
                          <strong>{copy.factorSingleAttemptLabel}</strong>
                          <small>{copy.factorSingleAttemptHint}</small>
                        </span>
                      </label>
                    ) : null}

                    {settingsDraft.factorResolutionMode === "golden-bell" ? (
                      <label
                        className={styles.toggleCard}
                        data-active={settingsDraft.factorGoldenBellSingleAttempt}
                        data-testid="factor-golden-bell-single-attempt-card"
                      >
                        <input
                          data-testid="factor-golden-bell-single-attempt-toggle"
                          checked={settingsDraft.factorGoldenBellSingleAttempt}
                          onChange={(event) =>
                            onSettingsDraftChange((current) => ({
                              ...current,
                              factorGoldenBellSingleAttempt: event.target.checked
                            }))
                          }
                          type="checkbox"
                        />
                        <span>
                          <strong>{copy.factorGoldenBellSingleAttemptLabel}</strong>
                          <small>{copy.factorGoldenBellSingleAttemptHint}</small>
                        </span>
                      </label>
                    ) : null}

                    {settingsDraft.factorResolutionMode === "all-play" ? (
                      <label
                        className={styles.toggleCard}
                        data-active={settingsDraft.factorSuddenDeath}
                        data-testid="factor-sudden-death-card"
                      >
                        <input
                          data-testid="factor-sudden-death-toggle"
                          checked={settingsDraft.factorSuddenDeath}
                          onChange={(event) =>
                            onSettingsDraftChange((current) => ({
                              ...current,
                              factorSuddenDeath: event.target.checked
                            }))
                          }
                          type="checkbox"
                        />
                        <span>
                          <strong>{copy.factorSuddenDeathLabel}</strong>
                          <small>{copy.factorSuddenDeathHint}</small>
                        </span>
                      </label>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          </section>
        </div>
      ) : null}

      {isHost && room.phase === "lobby" && isMatchSettingsOpen ? (
        <div
          className={styles.modalBackdrop}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setIsMatchSettingsOpen(false);
            }
          }}
        >
          <section className={styles.settingsModal} data-testid="match-settings-modal">
            <div className={styles.modalHeader}>
              <div className={styles.modalTitleBlock}>
                <span className={styles.challengeLabel}>{copy.matchSettingsLabel}</span>
                <strong>{copy.matchSettingsTitle}</strong>
              </div>
              <button
                className={`${styles.secondaryAction} ${styles.modalCloseButton}`}
                onClick={() => setIsMatchSettingsOpen(false)}
                type="button"
              >
                {copy.closePanel}
              </button>
            </div>

            <div className={styles.settingsColumn}>
              <p className={styles.railBody}>{copy.matchSettingsBody}</p>

              <div className={styles.settingsSplitGrid}>
                <div className={`${styles.field} ${styles.rangeField}`}>
                  <div className={styles.fieldHead}>
                    <span>{copy.maxPlayersField}</span>
                    <strong className={styles.rangeValue}>
                      {matchSettingsDraft.maxPlayers}
                      {locale === "ko" ? copy.playersUnit : ` ${copy.playersUnit}`}
                    </strong>
                  </div>
                  <input
                    className={styles.rangeInput}
                    data-testid="match-max-players-range"
                    type="range"
                    min={Math.max(2, room.players.length)}
                    max={MAX_PLAYERS_PER_ROOM}
                    step="1"
                    value={matchSettingsDraft.maxPlayers}
                    onChange={(event) =>
                      onMatchSettingsDraftChange((current) => ({
                        ...current,
                        maxPlayers: Number(event.target.value)
                      }))
                    }
                  />
                </div>

                <label
                  className={styles.toggleCard}
                  data-active={matchSettingsDraft.allowMidMatchJoin}
                  data-testid="allow-mid-match-join-card"
                >
                  <input
                    data-testid="allow-mid-match-join-toggle"
                    checked={matchSettingsDraft.allowMidMatchJoin}
                    onChange={(event) =>
                      onMatchSettingsDraftChange((current) => ({
                        ...current,
                        allowMidMatchJoin: event.target.checked
                      }))
                    }
                    type="checkbox"
                  />
                  <span>
                    <strong>{copy.allowMidMatchJoinLabel}</strong>
                    <small>{copy.allowMidMatchJoinHint}</small>
                  </span>
                </label>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {isRulesOpen ? (
        <div
          className={styles.modalBackdrop}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setIsRulesOpen(false);
            }
          }}
        >
          <section className={styles.settingsModal} data-testid="rules-modal">
            <div className={styles.modalHeader}>
              <div className={styles.modalTitleBlock}>
                <span className={styles.challengeLabel}>{locale === "ko" ? "게임 룰" : "Rules"}</span>
                <strong>{locale === "ko" ? "이번 방 설명서" : "Room rulebook"}</strong>
              </div>
              <button
                className={`${styles.secondaryAction} ${styles.modalCloseButton}`}
                onClick={() => setIsRulesOpen(false)}
                type="button"
              >
                {copy.closePanel}
              </button>
            </div>
            <RuleSummaryList locale={locale} summary={rulesSummary} />
            <div className={styles.railActionRow}>
              <button
                className={styles.secondaryAction}
                data-testid="score-guide-button"
                onClick={() => {
                  setIsRulesOpen(false);
                  setIsScoreGuideOpen(true);
                }}
                type="button"
              >
                {copy.scoreGuideOpen}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {isScoreGuideOpen ? (
        <div
          className={styles.modalBackdrop}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setIsScoreGuideOpen(false);
            }
          }}
        >
          <section className={`${styles.settingsModal} ${styles.scoreGuideModal}`} data-testid="score-guide-modal">
            <div className={styles.modalHeader}>
              <div className={styles.modalTitleBlock}>
                <span className={styles.challengeLabel}>{copy.scoreGuideLabel}</span>
                <strong>{copy.scoreGuideTitle}</strong>
              </div>
              <button
                className={`${styles.secondaryAction} ${styles.modalCloseButton}`}
                onClick={() => setIsScoreGuideOpen(false)}
                type="button"
              >
                {copy.closePanel}
              </button>
            </div>

            <p className={styles.railBody}>{copy.scoreGuideBody}</p>

            <div className={`${styles.modeChoiceRow} ${styles.scoreGuideTabRow}`} data-columns="2">
              <button
                className={styles.modeChoiceButton}
                data-active={scoreGuidePage === 0}
                onClick={() => setScoreGuidePage(0)}
                type="button"
              >
                {locale === "ko" ? "공식" : "Formulas"}
              </button>
              <button
                className={styles.modeChoiceButton}
                data-active={scoreGuidePage === 1}
                onClick={() => setScoreGuidePage(1)}
                type="button"
              >
                {locale === "ko" ? "변수 · 패널티" : "Variables · Penalties"}
              </button>
            </div>

            {scoreGuidePage === 0 ? (
              <div className={styles.scoreGuidePage}>
                <article className={styles.scoreGuideCard}>
                  <span className={styles.challengeLabel}>{copy.scoreGuideBaseHeading}</span>
                  <BlockMath math={getBaseScoreFormulaLatex()} />
                </article>

                <article className={styles.scoreGuideCard}>
                  <span className={styles.challengeLabel}>{copy.scoreGuideTimedHeading}</span>
                  <BlockMath math={`\\operatorname{score}=\\operatorname{base}(r)+\\operatorname{round}\\left(\\frac{\\operatorname{remainingMs}}{1000}\\right)\\times ${SCORE_SPEED_BONUS_PER_SECOND}`} />
                </article>

                <article className={styles.scoreGuideCard}>
                  <span className={styles.challengeLabel}>{copy.scoreGuideGoldenBellHeading}</span>
                  <BlockMath math={`\\operatorname{score}=\\operatorname{base}(r)+\\operatorname{round}\\left(\\frac{\\operatorname{answerWindowMs}}{1000}\\right)\\times ${SCORE_SPEED_BONUS_PER_SECOND}`} />
                </article>
              </div>
            ) : (
              <div className={styles.scoreGuidePage}>
                <article className={styles.scoreGuideCard}>
                  <span className={styles.challengeLabel}>{copy.scoreGuideSuddenDeathHeading}</span>
                  <BlockMath math={"\\operatorname{score}=\\operatorname{base}(r)"} />
                </article>

                <article className={styles.scoreGuideCard}>
                  <span className={styles.challengeLabel}>{copy.scoreGuidePenaltyHeading}</span>
                  <BlockMath math={`\\operatorname{penalty}=-${GOLDEN_BELL_PENALTY_POINTS}`} />
                </article>

                <article className={styles.scoreGuideCard}>
                  <span className={styles.challengeLabel}>{copy.scoreGuideVariablesHeading}</span>
                  <div className={styles.scoreGuideVariables}>
                    <BlockMath math={"\\operatorname{remainingMs}=\\operatorname{endsAt}-\\operatorname{submittedAt}"} />
                    <BlockMath math={"\\operatorname{answerWindowMs}=\\operatorname{answerWindowEndsAt}-\\operatorname{submittedAt}"} />
                    <BlockMath math={"\\operatorname{matchCap}=3600000\\,\\mathrm{ms}"} />
                  </div>
                </article>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </section>
  );
}

function getPodiumLabel(copy: ReturnType<typeof getCopy>, index: number) {
  if (index === 0) {
    return copy.championLabel;
  }

  if (index === 1) {
    return copy.runnerUpLabel;
  }

  return copy.thirdPlaceLabel;
}

function areSettingsEqual(left: LobbySettings, right: LobbySettings) {
  return (
    left.mode === right.mode &&
    left.roundCount === right.roundCount &&
    left.roundTimeSec === right.roundTimeSec &&
    left.baseConversionPair === right.baseConversionPair &&
    left.binaryLivePreview === right.binaryLivePreview &&
    left.factorResolutionMode === right.factorResolutionMode &&
    left.factorPrimeAnswerMode === right.factorPrimeAnswerMode &&
    left.factorOrderedAnswer === right.factorOrderedAnswer &&
    left.factorSingleAttempt === right.factorSingleAttempt &&
    left.factorGoldenBellSingleAttempt === right.factorGoldenBellSingleAttempt &&
    left.factorSuddenDeath === right.factorSuddenDeath
  );
}

function areMatchSettingsEqual(left: MatchSettings, right: MatchSettings) {
  return (
    left.maxPlayers === right.maxPlayers &&
    left.allowMidMatchJoin === right.allowMidMatchJoin
  );
}

function getReadyButtonLabel(locale: Locale, isReady: boolean) {
  if (locale === "ko") {
    return isReady ? "준비 해제" : "준비 완료";
  }

  return isReady ? "Unready" : "Ready";
}

function getPhaseBadgeLabel(locale: Locale, phase: RoomSnapshot["phase"]) {
  if (locale === "ko") {
    if (phase === "lobby") {
      return "로비";
    }

    if (phase === "round-active") {
      return "진행 중";
    }

    if (phase === "round-ended") {
      return "정답 공개";
    }

    return "결과";
  }

  if (phase === "lobby") {
    return "Lobby";
  }

  if (phase === "round-active") {
    return "Live";
  }

  if (phase === "round-ended") {
    return "Reveal";
  }

  return "Results";
}

function getReadyBadge(locale: Locale) {
  return locale === "ko" ? "준비 완료" : "ready";
}

function getNotReadyBadge(locale: Locale) {
  return locale === "ko" ? "미준비" : "not ready";
}

function getResponsiveRoomLayoutState({
  phase,
  playerCount,
  viewportWidth,
  viewportHeight,
  viewportScale
}: {
  phase: RoomSnapshot["phase"];
  playerCount: number;
  viewportWidth: number;
  viewportHeight: number;
  viewportScale: number;
}): ResponsiveRoomLayoutState {
  const isMobileViewport = viewportWidth < 760;
  const density: DensityMode =
    isMobileViewport || viewportWidth < 860 || viewportHeight < 620 || viewportScale > 1.42
      ? "tight"
      : viewportWidth < 1040 || viewportHeight < 720 || viewportScale > 1.22
        ? "compact"
        : "normal";
  const railMode: RailMode =
    isMobileViewport
      ? "inline"
      : phase !== "finished" &&
          (viewportWidth < 940 ||
            (phase === "round-active" && viewportHeight < 660) ||
            (viewportScale > 1.24 && viewportWidth < 1260))
      ? "peek"
      : "inline";
  const lobbyRulesMode: LobbyRulesMode =
    phase === "lobby" &&
    (
      isMobileViewport ||
      viewportHeight < 780 ||
      density === "tight" ||
      (viewportWidth < 1220 && viewportHeight < 860) ||
      viewportScale > 1.12
    )
      ? "modal"
      : "inline";
  const shouldCompactRoundRoster =
    phase === "round-active" &&
    ((playerCount <= 2 &&
      (viewportHeight < 700 || viewportWidth < 980 || viewportScale > 1.24)) ||
      (playerCount >= 3 &&
        playerCount <= 4 &&
        (viewportHeight < 750 ||
          viewportWidth < 1080 ||
          (density === "tight" && viewportHeight < 820) ||
          viewportScale > 1.14)) ||
      (playerCount >= 5 &&
        playerCount <= 6 &&
        (viewportHeight < 710 ||
          viewportWidth < 980 ||
          (density === "tight" && viewportHeight < 780) ||
          viewportScale > 1.18)) ||
      (playerCount >= 7 &&
        (viewportHeight < 860 ||
          density === "tight" ||
          viewportWidth < 1420 ||
          viewportHeight < 920 ||
          viewportScale > 1.02)));
  const roundRosterMode: RoundRosterMode =
    shouldCompactRoundRoster ? "compact" : "full";

  return {
    density,
    railMode,
    lobbyRulesMode,
    roundRosterMode,
    isMobileViewport
  };
}

function getPageScrollMode(
  phase: RoomSnapshot["phase"] | "landing",
  viewportWidth: number,
  viewportHeight: number,
  viewportScale: number,
  horizontalOverflow: boolean,
  verticalOverflow: boolean
): ScrollMode {
  if (viewportWidth < 760) {
    return "scroll";
  }

  if (phase === "round-active" || phase === "round-ended") {
    if (
      horizontalOverflow ||
      verticalOverflow ||
      viewportScale > 1.42 ||
      viewportWidth < 920 ||
      viewportHeight < 610 ||
      (viewportWidth < 1100 && viewportHeight < 690) ||
      (viewportScale > 1.24 && viewportWidth < 1240)
    ) {
      return "scroll";
    }

    return "fit";
  }

  if (
    horizontalOverflow ||
    verticalOverflow ||
    viewportScale > 1.4 ||
    viewportWidth < 980 ||
    (viewportWidth < 1120 && viewportScale > 1.18) ||
    viewportHeight < 620 ||
    (viewportHeight < 720 && viewportWidth < 1000)
  ) {
    return "scroll";
  }

  return "fit";
}

function getRailPanelAnchorTop(panelId: RailPanelId, phase: RoomSnapshot["phase"]) {
  if (phase === "lobby") {
    if (panelId === "invite") {
      return "1.4rem";
    }

    if (panelId === "rules") {
      return "8.2rem";
    }

    return "15.1rem";
  }

  if (phase === "round-active") {
    return panelId === "players" ? "6.8rem" : "15rem";
  }

  return "1.4rem";
}

type RuleSummary = {
  primaryLines: string[];
  additionalLines: string[];
};

function RuleSummaryList({ locale, summary }: { locale: Locale; summary: RuleSummary }) {
  return (
    <div className={styles.ruleSummary}>
      <ul className={styles.noteList}>
        {summary.primaryLines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {summary.additionalLines.length > 0 ? (
        <div className={styles.ruleSummarySection}>
          <span className={styles.ruleSummaryHeading}>
            {locale === "ko" ? "추가 규칙" : "Additional rules"}
          </span>
          <ul className={`${styles.noteList} ${styles.noteSubList}`}>
            {summary.additionalLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function getRuleSummary(locale: Locale, settings: LobbySettings): RuleSummary {
  if (locale === "ko") {
    if (settings.mode === "factor") {
      return {
        primaryLines: [
          `${getModeLabelByLocale(locale, settings.mode)} (${getFactorResolutionSummary(locale, settings.factorResolutionMode)})`,
          `플레이 시간: ${settings.roundCount}라운드 · ${getRoundTimeSummary(locale, settings)}`,
          settings.factorPrimeAnswerMode === "number"
            ? "답변 입력 규칙: 소인수는 공백으로 구분해서 입력 · 소수일 경우 숫자 하나 입력"
            : '답변 입력 규칙: 소인수는 공백으로 구분해서 입력 · 소수일 경우 "야호 소수다" 입력'
        ],
        additionalLines: [
          settings.factorOrderedAnswer ? "소인수 순서까지 맞춰야 정답" : "소인수 순서는 자유",
          settings.factorResolutionMode !== "golden-bell" && settings.factorSingleAttempt
            ? "정답 시도 기회는 1회만 허용"
            : settings.factorResolutionMode !== "golden-bell"
              ? "오답 후 재입력 가능"
              : "",
          settings.factorResolutionMode === "all-play" && settings.factorSuddenDeath
            ? "시간 안에 아무도 못 맞추면 서든데스로 전환"
            : "",
          settings.factorResolutionMode === "golden-bell"
            ? settings.factorGoldenBellSingleAttempt
              ? `골든벨 실패 패널티: ${formatSignedScore(-GOLDEN_BELL_PENALTY_POINTS)}점 · 오답 후 잠김`
              : `골든벨 실패 패널티: ${formatSignedScore(-GOLDEN_BELL_PENALTY_POINTS)}점 · 오답 후 재도전 가능`
            : settings.factorResolutionMode === "first-correct"
              ? "첫 정답이 나오면 즉시 공개 단계로 이동"
              : ""
        ].filter(Boolean)
      };
    }

    return {
      primaryLines: [
        `${getModeLabelByLocale(locale, settings.mode)}`,
        `플레이 시간: ${settings.roundCount}라운드 · ${getRoundTimeSummary(locale, settings)}`,
        "답변 입력 규칙: 문제에 표시된 목표 진법으로 입력"
      ],
      additionalLines: [
        `변환 쌍: ${getBinaryRatioSummary(locale, settings.baseConversionPair)}`,
        `실시간 변환 프리뷰: ${settings.binaryLivePreview ? "켜짐" : "꺼짐"}`
      ]
    };
  }

  if (settings.mode === "factor") {
    return {
      primaryLines: [
        `${getModeLabelByLocale(locale, settings.mode)} (${getFactorResolutionSummary(locale, settings.factorResolutionMode)})`,
        `Play time: ${settings.roundCount} rounds · ${getRoundTimeSummary(locale, settings)}`,
        settings.factorPrimeAnswerMode === "number"
          ? "Answer rules: separate prime factors with spaces · prime targets use the number only"
          : 'Answer rules: separate prime factors with spaces · prime targets use "야호 소수다"'
      ],
      additionalLines: [
        settings.factorOrderedAnswer
          ? "Factor order must match exactly"
          : "Factor order does not matter",
        settings.factorResolutionMode !== "golden-bell" && settings.factorSingleAttempt
          ? "Only one answer attempt is allowed"
          : settings.factorResolutionMode !== "golden-bell"
            ? "Wrong answers can be retried"
            : "",
        settings.factorResolutionMode === "all-play" && settings.factorSuddenDeath
          ? "If nobody solves in time, the room flips into sudden death"
          : "",
        settings.factorResolutionMode === "golden-bell"
          ? settings.factorGoldenBellSingleAttempt
            ? `Golden bell fail penalty: ${formatSignedScore(-GOLDEN_BELL_PENALTY_POINTS)} · locks after one miss`
            : `Golden bell fail penalty: ${formatSignedScore(-GOLDEN_BELL_PENALTY_POINTS)} · retries allowed`
          : settings.factorResolutionMode === "first-correct"
            ? "The first correct answer immediately triggers reveal"
            : ""
      ].filter(Boolean)
    };
  }

  return {
    primaryLines: [
      `${getModeLabelByLocale(locale, settings.mode)}`,
      `Play time: ${settings.roundCount} rounds · ${getRoundTimeSummary(locale, settings)}`,
      "Answer rules: enter the value in the target base shown by the prompt"
    ],
    additionalLines: [
      `Conversion pair: ${getBinaryRatioSummary(locale, settings.baseConversionPair)}`,
      `Live conversion preview: ${settings.binaryLivePreview ? "on" : "off"}`
    ]
  };
}

function getRoundTimeSummary(locale: Locale, settings: LobbySettings) {
  return locale === "ko"
    ? `${settings.roundTimeSec}${getCopy(locale).secondsUnit} 제한`
    : `${settings.roundTimeSec}s`;
}

function getFactorResolutionDescription(locale: Locale, mode: FactorResolutionMode) {
  const copy = getCopy(locale);
  if (mode === "first-correct") {
    return copy.factorResolutionFirstCorrectBody;
  }

  if (mode === "golden-bell") {
    return copy.factorResolutionGoldenBellBody;
  }

  return copy.factorResolutionAllPlayBody;
}

function getRevealSummary(
  locale: Locale,
  room: RoomSnapshot,
  correctPlayers: Array<{ name: string }>
) {
  const resolutionMode =
    room.settings.mode === "factor" ? room.settings.factorResolutionMode : "all-play";

  if (room.settings.mode === "factor" && resolutionMode !== "all-play") {
    return {
      label: locale === "ko" ? "정답자" : "solver",
      value:
        correctPlayers.length > 0
          ? correctPlayers.map((entry) => entry.name).join(locale === "ko" ? ", " : " / ")
          : locale === "ko"
            ? "없음"
            : "none"
    };
  }

  return {
    label: locale === "ko" ? "정답 맞춘 사람" : "solved",
    value:
      locale === "ko"
        ? `${correctPlayers.length}명`
        : `${correctPlayers.length} players`
  };
}

function getRevealDeltaRange(
  locale: Locale,
  rows: Array<{ delta: number }>
) {
  if (rows.length === 0) {
    return "0";
  }

  const deltas = rows.map((entry) => entry.delta);
  const maxDelta = Math.max(...deltas);
  const minDelta = Math.min(...deltas);

  if (maxDelta === minDelta) {
    return formatSignedScore(maxDelta);
  }

  return locale === "ko"
    ? `${formatSignedScore(maxDelta)} ~ ${formatSignedScore(minDelta)}`
    : `${formatSignedScore(maxDelta)} to ${formatSignedScore(minDelta)}`;
}

function getRevealStatusLabel(locale: Locale, status: PlayerRoundStatus) {
  if (status.hasSubmitted) {
    return locale === "ko" ? "정답 제출 성공" : "Correct answer";
  }

  if ((status.scoreDelta ?? 0) < 0) {
    return locale === "ko" ? "패널티 적용" : "Penalty applied";
  }

  if (status.isLockedOut) {
    return locale === "ko" ? "기회 소진" : "Locked out";
  }

  if (status.lastSubmissionKind === "wrong") {
    return locale === "ko" ? "오답 제출" : "Wrong answer";
  }

  return locale === "ko" ? "점수 변화 없음" : "No score change";
}

function getScoreDeltaTone(delta: number) {
  if (delta > 0) {
    return "positive";
  }

  if (delta < 0) {
    return "negative";
  }

  return "neutral";
}

function formatSignedScore(delta: number) {
  if (delta > 0) {
    return `+${delta}`;
  }

  return String(delta);
}

function getFactorAnswerInlineHint(
  locale: Locale,
  round: RoomSnapshot["round"] | null,
  settings: LobbySettings
) {
  const copy = getCopy(locale);
  const factorMeta = round?.mode === "factor" ? (round.challengeMeta as PrimeFactorChallengeMeta) : null;
  const primeAnswerMode = factorMeta?.primeAnswerMode ?? settings.factorPrimeAnswerMode;

  return primeAnswerMode === "number"
    ? copy.answerHintFactorPrimeNumber
    : copy.answerHintFactorPrimePhrase;
}

function getBinaryPreviewText(
  locale: Locale,
  meta: BinaryChallengeMeta,
  answerDraft: string
) {
  const previewValue = getBinaryPreviewValue(meta, answerDraft);
  if (!previewValue) {
    return "";
  }

  if (typeof meta.sourceBase === "number") {
    return `${getBaseDisplayLabel(locale, meta.sourceBase)} ${previewValue}`;
  }

  return meta.direction === "decimal-to-binary"
    ? locale === "ko"
      ? `10진수 ${previewValue}`
      : `decimal ${previewValue}`
    : locale === "ko"
      ? `2진수 ${previewValue}`
      : `binary ${previewValue}`;
}

function getBaseDisplayLabel(locale: Locale, base: 2 | 10 | 16) {
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
    return "hex";
  }

  return "decimal";
}

function getBaseConversionPlaceholder(meta?: BinaryChallengeMeta) {
  if (meta?.targetBase === 16) {
    return "2F";
  }

  if (meta?.targetBase === 10) {
    return "57";
  }

  if (meta?.targetBase === 2) {
    return "101011";
  }

  return "101011 / 2F / 57";
}

function getRoundBoardStatus(locale: Locale, status?: PlayerRoundStatus | null) {
  if (!status) {
    return locale === "ko" ? "대기" : "waiting";
  }

  if (status.hasSubmitted) {
    return locale === "ko" ? "정답 맞춤" : "correct";
  }

  if (status.isAnswering) {
    return locale === "ko" ? "답변권 보유" : "answering";
  }

  if (status.isLockedOut) {
    return locale === "ko" ? "기회 소진" : "locked";
  }

  if (status.lastSubmissionKind === "wrong") {
    return locale === "ko" ? "오답 제출" : "wrong";
  }

  return locale === "ko" ? "대기" : "waiting";
}

function getLeaderboardState(status?: PlayerRoundStatus | null) {
  if (!status) {
    return "waiting";
  }

  if (status.hasSubmitted) {
    return "correct";
  }

  if (status.isAnswering) {
    return "answering";
  }

  if (status.isLockedOut) {
    return "locked";
  }

  if (status.lastSubmissionKind === "wrong") {
    return "wrong";
  }

  return "waiting";
}

function createFloatingPrimeDecorations() {
  const primePool = createPrimePool(997);
  let seed = 51018;
  const columns = 8;
  const rows = 12;

  return Array.from({ length: columns * rows }, (_, index) => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const prime = primePool[seed % primePool.length] ?? 2;
    const row = Math.floor(index / columns);
    const column = index % columns;
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const topJitter = ((seed % 1000) / 1000 - 0.5) * 3.4;
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const leftJitter = ((seed % 1000) / 1000 - 0.5) * 4.1;
    const top = 6 + row * 7.6 + topJitter;
    const left = 5 + column * 11.6 + leftJitter;
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const duration = 16 + (seed % 15);
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const delay = -(seed % 18);

    return {
      text: String(prime),
      top: `${top.toFixed(2)}%`,
      left: `${left.toFixed(2)}%`,
      duration: `${duration}s`,
      delay: `${delay}s`,
      size: `${0.62 + ((index % 5) * 0.08)}rem`
    };
  });
}

function createPrimePool(limit: number) {
  const primes: number[] = [];

  for (let candidate = 2; candidate <= limit; candidate += 1) {
    let isPrime = true;
    for (let divisor = 2; divisor * divisor <= candidate; divisor += 1) {
      if (candidate % divisor === 0) {
        isPrime = false;
        break;
      }
    }

    if (isPrime) {
      primes.push(candidate);
    }
  }

  return primes;
}

function ThemeModeIcon({ mode }: { mode: "light" | "dark" }) {
  if (mode === "light") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <circle cx="12" cy="12" fill="currentColor" r="4.5" />
        <path
          d="M12 1.75v3M12 19.25v3M4.75 4.75l2.12 2.12M17.13 17.13l2.12 2.12M1.75 12h3M19.25 12h3M4.75 19.25l2.12-2.12M17.13 6.87l2.12-2.12"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.7"
        />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M14.35 2.2c-3.92.98-6.6 4.78-6.18 8.85.45 4.43 4.41 7.67 8.84 7.22 2.2-.22 4.18-1.31 5.57-2.96-.67 3.59-3.8 6.38-7.67 6.76-5.23.52-9.9-3.28-10.43-8.51C3.95 8.68 7.76 4 12.99 3.48c.46-.05.91-.07 1.36-.05Z"
        fill="currentColor"
      />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M2.5 12s3.6-5.5 9.5-5.5 9.5 5.5 9.5 5.5-3.6 5.5-9.5 5.5S2.5 12 2.5 12Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
      <circle cx="12" cy="12" fill="currentColor" r="2.4" />
    </svg>
  );
}

function CopyLinkIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <rect
        fill="none"
        height="10"
        rx="1.6"
        stroke="currentColor"
        strokeWidth="1.8"
        width="10"
        x="9"
        y="7"
      />
      <path
        d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function getBaseScoreFormulaLatex() {
  const cases = SCORE_BASE_POINTS_BY_RANK.map(
    (points, index) => `${points},&r=${index + 1}`
  ).join("\\\\");
  const fallbackRank = SCORE_BASE_POINTS_BY_RANK.length + 1;

  return `\\operatorname{base}(r)=\\begin{cases}${cases}\\\\${SCORE_FALLBACK_POINTS},&r\\ge ${fallbackRank}\\end{cases}`;
}

function getRecentChatByPlayer(chatFeed: RoomSnapshot["chatFeed"], now: number) {
  const bubbles = new Map<string, RoomSnapshot["chatFeed"][number]>();
  const cutoff = now - 4500;

  for (let index = chatFeed.length - 1; index >= 0; index -= 1) {
    const entry = chatFeed[index];
    if (!entry || entry.kind !== "player" || !entry.playerId) {
      continue;
    }

    if (entry.createdAt < cutoff) {
      break;
    }

    if (!bubbles.has(entry.playerId)) {
      bubbles.set(entry.playerId, entry);
    }
  }

  return bubbles;
}

function getSystemChatMessage(entry: RoomSnapshot["chatFeed"][number], locale: Locale) {
  if (entry.systemKey === "match-started") {
    return locale === "ko" ? "<게임이 시작되었습니다>" : "<Match started>";
  }

  if (entry.systemKey === "round-started") {
    return locale === "ko" ? "<새 라운드가 시작되었습니다>" : "<New round started>";
  }

  if (entry.systemKey === "player-joined") {
    return locale === "ko"
      ? `${entry.playerName ?? "플레이어"}님이 참가했습니다.`
      : `${entry.playerName ?? "A player"} joined the room.`;
  }

  if (entry.systemKey === "player-correct") {
    return locale === "ko"
      ? `${entry.playerName ?? "플레이어"}님이 정답을 맞췄습니다.`
      : `${entry.playerName ?? "A player"} answered correctly.`;
  }

  if (entry.systemKey === "player-wrong") {
    return locale === "ko"
      ? `${entry.playerName ?? "플레이어"}님이 오답을 제시했습니다.\n[입력 값 : ${entry.answerText ?? "-"}]`
      : `${entry.playerName ?? "A player"} submitted a wrong answer.\n[Input: ${entry.answerText ?? "-"}]`;
  }

  if (entry.systemKey === "spectator-joined") {
    return locale === "ko"
      ? `${entry.playerName ?? "관전자"}님이 관전자로 들어왔습니다.`
      : `${entry.playerName ?? "A spectator"} joined as a spectator.`;
  }

  if (entry.systemKey === "player-kicked") {
    return locale === "ko"
      ? `${entry.playerName ?? "플레이어"}님이 방에서 추방되었습니다.`
      : `${entry.playerName ?? "A player"} was removed from the room.`;
  }

  if (entry.systemKey === "player-left") {
    return locale === "ko"
      ? `${entry.playerName ?? "플레이어"}님이 방을 나갔습니다.`
      : `${entry.playerName ?? "A player"} left the room.`;
  }

  if (entry.systemKey === "spectator-left") {
    return locale === "ko"
      ? `${entry.playerName ?? "관전자"}님이 관전을 종료했습니다.`
      : `${entry.playerName ?? "A spectator"} stopped spectating.`;
  }

  if (entry.systemKey === "host-transferred") {
    return locale === "ko"
      ? `${entry.playerName ?? "플레이어"}님이 새 방장이 되었습니다.`
      : `${entry.playerName ?? "A player"} is now the host.`;
  }

  return entry.text;
}

function formatClock(totalMs: number, locale: Locale) {
  const totalSeconds = Math.max(0, Math.floor(totalMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const clock = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  if (locale === "ko") {
    return clock;
  }

  return clock;
}

function copyTextFallback(value: string) {
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

function getServerUrl() {
  if (process.env.NEXT_PUBLIC_SERVER_URL) {
    return process.env.NEXT_PUBLIC_SERVER_URL;
  }

  if (typeof window === "undefined") {
    return "http://127.0.0.1:3001";
  }

  return `${window.location.protocol}//${window.location.hostname}:3001`;
}

function getSharedSocket() {
  if (!sharedSocket) {
    sharedSocket = io(getServerUrl(), {
      autoConnect: false
    });
    sharedSocket.on("room:state", (nextRoom: RoomSnapshot) => {
      latestSharedRoomState = nextRoom;
    });
    sharedSocket.on("disconnect", () => {
      latestSharedRoomState = null;
    });
  }

  return sharedSocket;
}

function writeRoomSession(roomId: string, playerId: string, name: string, role?: RoomRole) {
  window.localStorage.setItem(
    `${ROOM_SESSION_PREFIX}${roomId}`,
    JSON.stringify({ playerId, name, role })
  );
}

function readRoomSession(roomId: string): { playerId: string; name: string; role?: RoomRole } | null {
  const rawValue = window.localStorage.getItem(`${ROOM_SESSION_PREFIX}${roomId}`);
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as { playerId?: string; name?: string; role?: RoomRole };
    if (parsed.playerId && parsed.name) {
      return parsed.role
        ? { playerId: parsed.playerId, name: parsed.name, role: parsed.role }
        : { playerId: parsed.playerId, name: parsed.name };
    }
  } catch {
    return null;
  }

  return null;
}

function clearRoomSession(roomId: string) {
  window.localStorage.removeItem(`${ROOM_SESSION_PREFIX}${roomId}`);
}

function getErrorMessage(error: unknown, locale: Locale) {
  const fallback =
    locale === "ko" ? "알 수 없는 오류가 발생했습니다." : "An unknown error occurred.";

  if (!(error instanceof Error)) {
    return fallback;
  }

  const localizedMessages: Record<string, { ko: string; en: string }> = {
    "This browser is already seated in a room. Refresh to switch rooms.": {
      ko: "이 브라우저는 이미 다른 방에 참가 중입니다. 새로고침 후 다시 시도해 주세요.",
      en: "This browser is already seated in a room. Refresh to switch rooms."
    },
    "Add a nickname before creating a room.": {
      ko: "방을 만들기 전에 닉네임을 입력해 주세요.",
      en: "Add a nickname before creating a room."
    },
    "That room does not exist anymore.": {
      ko: "이 방은 더 이상 존재하지 않습니다.",
      en: "That room does not exist anymore."
    },
    "That room is already full.": {
      ko: "이 방은 이미 가득 찼습니다.",
      en: "That room is already full."
    },
    "Add a nickname before joining the room.": {
      ko: "방에 참가하기 전에 닉네임을 입력해 주세요.",
      en: "Add a nickname before joining the room."
    },
    "Only the host can change the room settings.": {
      ko: "방 설정은 방장만 변경할 수 있습니다.",
      en: "Only the host can change the room settings."
    },
    "Settings are locked once the match begins.": {
      ko: "게임이 시작되면 설정을 바꿀 수 없습니다.",
      en: "Settings are locked once the match begins."
    },
    "Only the host can launch the match.": {
      ko: "게임 시작은 방장만 할 수 있습니다.",
      en: "Only the host can launch the match."
    },
    "Everyone needs to click ready before the host can start.": {
      ko: "모든 플레이어가 준비 완료해야 방장이 게임을 시작할 수 있습니다.",
      en: "Everyone needs to click ready before the host can start."
    },
    "This round is already running.": {
      ko: "현재 라운드가 이미 진행 중입니다.",
      en: "This round is already running."
    },
    "At least one connected player is required to start.": {
      ko: "게임을 시작하려면 최소 1명의 접속 중인 플레이어가 필요합니다.",
      en: "At least one connected player is required to start."
    },
    "Only the host can move the room forward.": {
      ko: "다음 라운드 진행은 방장만 할 수 있습니다.",
      en: "Only the host can move the room forward."
    },
    "The next round becomes available after the current round ends.": {
      ko: "현재 라운드가 끝난 뒤에만 다음 라운드로 넘어갈 수 있습니다.",
      en: "The next round becomes available after the current round ends."
    },
    "Only the host can reset the room.": {
      ko: "방 초기화는 방장만 할 수 있습니다.",
      en: "Only the host can reset the room."
    },
    "Spectators cannot use that action.": {
      ko: "관전자는 이 동작을 사용할 수 없습니다.",
      en: "Spectators cannot use that action."
    },
    "Only the host can rename the room.": {
      ko: "방 이름 변경은 방장만 할 수 있습니다.",
      en: "Only the host can rename the room."
    },
    "Only the host can remove players from the room.": {
      ko: "플레이어 추방은 방장만 할 수 있습니다.",
      en: "Only the host can remove players from the room."
    },
    "You can rename the room in the lobby only.": {
      ko: "방 이름은 로비에서만 변경할 수 있습니다.",
      en: "You can rename the room in the lobby only."
    },
    "Player removal is only available in the lobby.": {
      ko: "플레이어 추방은 로비에서만 가능합니다.",
      en: "Player removal is only available in the lobby."
    },
    "Ready state is only available in the lobby.": {
      ko: "준비 상태는 로비에서만 바꿀 수 있습니다.",
      en: "Ready state is only available in the lobby."
    },
    "You can only take a player seat from the lobby.": {
      ko: "플레이어 좌석 참가는 로비에서만 가능합니다.",
      en: "You can only take a player seat from the lobby."
    },
    "All player seats are already taken.": {
      ko: "플레이어 좌석이 이미 모두 찼습니다.",
      en: "All player seats are already taken."
    },
    "There is no active round right now.": {
      ko: "지금은 진행 중인 라운드가 없습니다.",
      en: "There is no active round right now."
    },
    "This round does not use golden bell claiming.": {
      ko: "이 라운드는 골든벨 방식이 아닙니다.",
      en: "This round does not use golden bell claiming."
    },
    "You already solved this round.": {
      ko: "이 라운드는 이미 정답 처리되었습니다.",
      en: "You already solved this round."
    },
    "You already missed your golden bell chance this round.": {
      ko: "이번 라운드에서는 이미 골든벨 기회를 사용했습니다.",
      en: "You already missed your golden bell chance this round."
    },
    "Another player is already answering right now.": {
      ko: "이미 다른 플레이어가 답변 중입니다.",
      en: "Another player is already answering right now."
    },
    "The round is already ending.": {
      ko: "라운드가 곧 종료되어 더 이상 답변권을 받을 수 없습니다.",
      en: "The round is already ending."
    },
    "Press the golden bell button before submitting an answer.": {
      ko: "먼저 정답 외치기 버튼으로 답변권을 얻어야 합니다.",
      en: "Press the golden bell button before submitting an answer."
    },
    "You are not connected to that room.": {
      ko: "해당 방에 연결되어 있지 않습니다.",
      en: "You are not connected to that room."
    },
    "That room has already been closed.": {
      ko: "해당 방은 이미 종료되었습니다.",
      en: "That room has already been closed."
    },
    "Your seat in this room is no longer available.": {
      ko: "이 방에서 기존 자리를 더 이상 사용할 수 없습니다.",
      en: "Your seat in this room is no longer available."
    },
    "Choose another connected player to remove from the room.": {
      ko: "다른 접속 중인 플레이어를 선택해 추방해 주세요.",
      en: "Choose another connected player to remove from the room."
    },
    "실시간 연결이 아직 준비되지 않았습니다.": {
      ko: "실시간 연결이 아직 준비되지 않았습니다.",
      en: "Realtime connection is not ready yet."
    }
  };

  const localized = localizedMessages[error.message];
  if (localized) {
    return localized[locale];
  }

  return error.message;
}
