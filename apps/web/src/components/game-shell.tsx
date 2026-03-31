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
  type Dispatch,
  type FormEvent,
  type RefObject,
  type SetStateAction
} from "react";
import { useRouter } from "next/navigation";
import { io, type Socket } from "socket.io-client";
import {
  DEFAULT_LOBBY_SETTINGS,
  clampSettings,
  createInvitePath,
  sanitizeRoomId,
  sortPlayersByScore,
  type FactorResolutionMode,
  type GameMode,
  type JoinRoomResult,
  type LobbySettings,
  type PlayerRoundStatus,
  type PrimeFactorChallengeMeta,
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
  getModeLabelByLocale,
  getRoomMessageByLocale,
  type Locale
} from "../lib/game-copy";
import styles from "./game-shell.module.css";

type BusyState =
  | "create"
  | "join"
  | "settings"
  | "start"
  | "claim"
  | "submit"
  | "advance"
  | "reset"
  | null;

type ThemeMode = "light" | "dark";

const DISPLAY_NAME_KEY = "factorrush:last-name";
const ROOM_SESSION_PREFIX = "factorrush:room:";
const LOCALE_STORAGE_KEY = "factorrush:locale";
const THEME_STORAGE_KEY = "factorrush:theme";
let sharedSocket: Socket | null = null;
let latestSharedRoomState: RoomSnapshot | null = null;

interface GameShellProps {
  initialRoomId?: string;
}

export function GameShell({ initialRoomId }: GameShellProps) {
  const router = useRouter();
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState(
    () =>
      typeof window !== "undefined"
        ? window.localStorage.getItem(DISPLAY_NAME_KEY) ?? ""
        : ""
  );
  const [roomCode, setRoomCode] = useState(initialRoomId ?? "");
  const [createMode, setCreateMode] = useState<GameMode>("factor");
  const [settingsDraft, setSettingsDraft] = useState<LobbySettings>(DEFAULT_LOBBY_SETTINGS);
  const [answerDraft, setAnswerDraft] = useState("");
  const [feedback, setFeedback] = useState("");
  const [busyState, setBusyState] = useState<BusyState>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [locale, setLocale] = useState<Locale>(() => {
    if (typeof window === "undefined") {
      return "ko";
    }

    const savedLocale = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    return savedLocale === "en" || savedLocale === "ko" ? savedLocale : getDefaultLocale();
  });
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") {
      return "light";
    }

    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    return savedTheme === "dark" ? "dark" : "light";
  });
  const socketRef = useRef<Socket | null>(null);
  const attemptedReconnectRef = useRef<string | null>(null);
  const lastInviteFallbackRef = useRef<string>("");
  const pendingSettingsRef = useRef<LobbySettings | null>(null);
  const settingsDraftRef = useRef<LobbySettings>(DEFAULT_LOBBY_SETTINGS);
  const lastRoomToastRef = useRef<string>("");
  const lastLobbyReadyCountRef = useRef<number | null>(null);
  const createNameInputRef = useRef<HTMLInputElement | null>(null);
  const joinNameInputRef = useRef<HTMLInputElement | null>(null);
  const joinRoomCodeInputRef = useRef<HTMLInputElement | null>(null);
  const answerInputRef = useRef<HTMLInputElement | null>(null);

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
    const roomStateListener = (nextRoom: RoomSnapshot) => {
      startTransition(() => {
        setRoom(nextRoom);
      });
    };

    socketRef.current = socket;
    socket.on("connect", () => {
      setIsConnected(true);
    });
    socket.on("disconnect", () => {
      setIsConnected(false);
    });
    socket.on("room:state", roomStateListener);
    if (latestSharedRoomState && (!initialRoomId || latestSharedRoomState.roomId === initialRoomId)) {
      setRoom(latestSharedRoomState);
    }
    socket.connect();

    return () => {
      socket.off("room:state", roomStateListener);
      socketRef.current = null;
    };
  }, [initialRoomId]);

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
    }
  }, [initialRoomId, playerId, room?.roomId]);

  useEffect(() => {
    if (!room || room.phase !== "lobby") {
      pendingSettingsRef.current = null;
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
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  }, [locale]);

  useEffect(() => {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    document.documentElement.dataset.theme = theme;
  }, [theme]);

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
      room.messageKey !== "player-left" &&
      room.messageKey !== "host-transferred"
    ) {
      return;
    }

    if (
      room.phase !== "lobby" &&
      room.messageKey !== "player-left" &&
      room.messageKey !== "host-transferred"
    ) {
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
  }, [locale, room]);

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
    setDisplayName(savedSession.name);
    setBusyState("join");

    void emitWithAck<JoinRoomResult>("room:join", {
      roomId: initialRoomId,
      playerName: savedSession.name,
      reconnectPlayerId: savedSession.playerId
    })
      .then((result) => {
        setPlayerId(result.playerId);
        writeRoomSession(result.roomId, result.playerId, savedSession.name);
        setFeedback(copy.reconnectSuccess);
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
  const myRoundStatus =
    room?.round?.playerStatuses.find((candidate) => candidate.playerId === playerId) ?? null;
  const isHost = currentPlayer?.isHost ?? false;
  const browserOrigin =
    typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1:3000";
  const inviteUrl = activeRoomId
    ? new URL(createInvitePath(activeRoomId), browserOrigin).toString()
    : "";
  const roundDuration = room?.round ? room.round.endsAt - room.round.startedAt : 0;
  const roundRemainingMs = room?.round ? Math.max(0, room.round.endsAt - now) : 0;
  const roundRemainingSeconds = Math.ceil(roundRemainingMs / 1000);
  const progressRatio =
    room?.round && roundDuration > 0 ? Math.max(0, Math.min(1, roundRemainingMs / roundDuration)) : 0;

  useEffect(() => {
    if (room?.phase !== "round-active" || myRoundStatus?.hasSubmitted) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      answerInputRef.current?.focus();
      answerInputRef.current?.select();
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [myRoundStatus?.hasSubmitted, room?.phase, room?.round?.roundNumber]);

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
        room?.phase === "round-active" && !myRoundStatus?.hasSubmitted
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
  }, [displayName, initialRoomId, myRoundStatus?.hasSubmitted, room?.phase, roomCode]);

  const navigateToRoom = (roomId: string) => {
    router.push(createInvitePath(roomId));
  };

  const handleCreateRoom = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const playerName = displayName.trim();
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
      writeRoomSession(result.roomId, result.playerId, playerName);
      setPlayerId(result.playerId);
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
    const playerName = displayName.trim();
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
        reconnectPlayerId: savedSession?.playerId
      });
      window.localStorage.setItem(DISPLAY_NAME_KEY, playerName);
      writeRoomSession(result.roomId, result.playerId, playerName);
      setPlayerId(result.playerId);
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

  const handleSubmitAnswer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!room || !answerDraft.trim()) {
      return;
    }

    setBusyState("submit");

    try {
      const result = await emitWithAck<SubmitAnswerResult>("round:submit-answer", {
        roomId: room.roomId,
        answer: answerDraft
      });
      setAnswerDraft("");

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

  return (
    <div className={styles.shell}>
      <div className={styles.noise} />
      <div className={styles.signalTop} />
      <div className={styles.signalBottom} />

      <main className={styles.page}>
        <header className={styles.masthead}>
          <div>
            <p className={styles.kicker}>{copy.mastheadKicker}</p>
            <div className={styles.wordmarkRow}>
              <h1 className={styles.wordmark}>FactorRush</h1>
              <span className={styles.connectionBadge} data-live={isConnected}>
                {isConnected ? copy.connectionLive : copy.connectionReconnecting}
              </span>
            </div>
          </div>

          <div className={styles.headerTools}>
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
                data-active={theme === "light"}
                onClick={() => setTheme("light")}
                type="button"
              >
                {copy.themeLight}
              </button>
              <button
                className={styles.languageButton}
                data-active={theme === "dark"}
                onClick={() => setTheme("dark")}
                type="button"
              >
                {copy.themeDark}
              </button>
            </div>

            {showAmbientInfo ? (
              <div className={styles.connectionInfo}>
                <span>{copy.stackSummary}</span>
              </div>
            ) : null}
          </div>
        </header>

        {room ? (
          <RoomExperience
            room={room}
            locale={locale}
            playerId={playerId}
            isHost={isHost}
            myRoundStatus={myRoundStatus}
            inviteUrl={inviteUrl}
            sortedPlayers={sortedPlayers}
            settingsDraft={settingsDraft}
            busyState={busyState}
            answerDraft={answerDraft}
            now={now}
            roundRemainingSeconds={roundRemainingSeconds}
            progressRatio={progressRatio}
            showAmbientInfo={showAmbientInfo}
            answerInputRef={answerInputRef}
            onCopyInvite={handleCopyInvite}
            onSettingsDraftChange={handleSettingsDraftChange}
            onRenameRoom={handleRenameRoom}
            onSetReady={handleSetReady}
            onTransferHost={handleTransferHost}
            onStartGame={handleStartGame}
            onAdvanceRound={handleAdvanceRound}
            onResetRoom={handleResetRoom}
            onClaimAnswerTurn={handleClaimAnswerTurn}
            onAnswerDraftChange={setAnswerDraft}
            onSubmitAnswer={handleSubmitAnswer}
          />
        ) : (
          <LandingExperience
            locale={locale}
            roomCode={roomCode}
            setRoomCode={setRoomCode}
            displayName={displayName}
            setDisplayName={setDisplayName}
            createNameInputRef={createNameInputRef}
            joinNameInputRef={joinNameInputRef}
            joinRoomCodeInputRef={joinRoomCodeInputRef}
            createMode={createMode}
            setCreateMode={setCreateMode}
            busyState={busyState}
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
  setDisplayName: (value: string) => void;
  createNameInputRef: RefObject<HTMLInputElement | null>;
  joinNameInputRef: RefObject<HTMLInputElement | null>;
  joinRoomCodeInputRef: RefObject<HTMLInputElement | null>;
  createMode: GameMode;
  setCreateMode: (value: GameMode) => void;
  busyState: BusyState;
  onCreateRoom: (event: FormEvent<HTMLFormElement>) => void;
  onJoinRoom: (event: FormEvent<HTMLFormElement>) => void;
  hintedRoomId?: string | undefined;
}

function LandingExperience({
  locale,
  roomCode,
  setRoomCode,
  displayName,
  setDisplayName,
  createNameInputRef,
  joinNameInputRef,
  joinRoomCodeInputRef,
  createMode,
  setCreateMode,
  busyState,
  onCreateRoom,
  onJoinRoom,
  hintedRoomId
}: LandingExperienceProps) {
  const copy = getCopy(locale);

  return (
    <section className={styles.poster}>
      <div className={styles.heroField} data-testid="landing-hero">
        <div className={styles.heroCopy}>
          <p className={styles.kicker}>{copy.heroKicker}</p>
          <h2 className={styles.heroTitle}>
            {copy.heroTitleTop}
            <br />
            {copy.heroTitleBottom}
          </h2>
          <p className={styles.heroDescription}>{copy.heroDescription}</p>
        </div>

        <div className={styles.numberWall} aria-hidden="true">
          <span>924 = 2² × 3 × 7 × 11</span>
          <span>111001 = 57</span>
          <span>101101 = 45</span>
          <span>1452 = 2² × 3 × 11²</span>
        </div>
      </div>

      <div className={styles.controlBand}>
        <form className={styles.signalForm} onSubmit={onCreateRoom}>
          <div className={styles.formHeading}>
            <span>{copy.hostSignal}</span>
            <strong>{copy.createRoomTitle}</strong>
          </div>

          <label className={styles.field}>
            <span>{copy.nicknameLabel}</span>
            <input
              ref={createNameInputRef}
              data-testid="create-name-input"
              type="text"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="PrimePilot"
            />
          </label>

          <label className={styles.field}>
            <span>{copy.startModeLabel}</span>
            <select
              data-testid="create-mode-select"
              value={createMode}
              onChange={(event) => setCreateMode(event.target.value as GameMode)}
            >
              <option value="factor">{getModeLabelByLocale(locale, "factor")}</option>
              <option value="binary">{getModeLabelByLocale(locale, "binary")}</option>
            </select>
          </label>

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
              <span>{copy.joinFeed}</span>
              <strong>{copy.joinRoomTitle}</strong>
            </div>

            <label className={styles.field}>
              <span>{copy.nicknameLabel}</span>
              <input
                ref={joinNameInputRef}
                data-testid="join-name-input"
                type="text"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
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
          <p>{copy.storyOne}</p>
        </article>
        <article>
          <span>02</span>
          <p>{copy.storyTwo}</p>
        </article>
        <article>
          <span>03</span>
          <p>{copy.storyThree}</p>
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
                type="text"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="PrimePilot"
              />
            </label>

            <button
              className={styles.primaryAction}
              data-testid="invite-join-button"
              disabled={busyState === "join"}
              type="submit"
            >
              {busyState === "join" ? copy.joiningRoomButton : copy.joinViaLinkButton}
            </button>
          </form>
        </div>
      ) : null}
    </section>
  );
}

interface RoomExperienceProps {
  room: RoomSnapshot;
  locale: Locale;
  playerId: string | null;
  isHost: boolean;
  myRoundStatus: PlayerRoundStatus | null;
  inviteUrl: string;
  sortedPlayers: RoomSnapshot["players"];
  settingsDraft: LobbySettings;
  busyState: BusyState;
  answerDraft: string;
  now: number;
  roundRemainingSeconds: number;
  progressRatio: number;
  showAmbientInfo: boolean;
  answerInputRef: RefObject<HTMLInputElement | null>;
  onCopyInvite: () => void;
  onSettingsDraftChange: Dispatch<SetStateAction<LobbySettings>>;
  onRenameRoom: (roomName: string) => void;
  onSetReady: (isReady: boolean) => void;
  onTransferHost: (playerId: string) => void;
  onStartGame: () => void;
  onAdvanceRound: () => void;
  onResetRoom: () => void;
  onClaimAnswerTurn: () => void;
  onAnswerDraftChange: (value: string) => void;
  onSubmitAnswer: (event: FormEvent<HTMLFormElement>) => void;
}

function RoomExperience({
  room,
  locale,
  playerId,
  isHost,
  myRoundStatus,
  inviteUrl,
  sortedPlayers,
  settingsDraft,
  busyState,
  answerDraft,
  now,
  roundRemainingSeconds,
  progressRatio,
  showAmbientInfo,
  answerInputRef,
  onCopyInvite,
  onSettingsDraftChange,
  onRenameRoom,
  onSetReady,
  onTransferHost,
  onStartGame,
  onAdvanceRound,
  onResetRoom,
  onClaimAnswerTurn,
  onAnswerDraftChange,
  onSubmitAnswer
}: RoomExperienceProps) {
  const copy = getCopy(locale);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isRulesOpen, setIsRulesOpen] = useState(false);
  const [isFeedOpen, setIsFeedOpen] = useState(false);
  const [isRenamingRoom, setIsRenamingRoom] = useState(false);
  const [roomNameDraft, setRoomNameDraft] = useState(room.roomName);
  const roomNameInputRef = useRef<HTMLInputElement | null>(null);
  const roundCopy = room.round ? getChallengeCopy(locale, room.round) : null;
  const statusMessage = getRoomMessageByLocale(locale, room.messageKey, room.messagePlayerName);
  const currentPlayer = room.players.find((candidate) => candidate.id === playerId) ?? null;
  const submittedCount =
    room.round?.playerStatuses.filter((candidate) => candidate.hasSubmitted).length ?? 0;
  const winnerNames = room.finalWinnerIds
    .map((winnerId) => room.players.find((candidate) => candidate.id === winnerId)?.name)
    .filter((candidate): candidate is string => Boolean(candidate))
    .join(locale === "ko" ? ", " : " / ");
  const podiumPlayers = sortedPlayers.slice(0, 3);
  const binaryRatioSummary =
    room.settings.mode === "binary"
      ? getBinaryRatioSummary(locale, room.settings.binaryDecimalToBinaryChance)
      : null;
  const connectedPlayers = room.players.filter((candidate) => candidate.connected);
  const connectedGuests = connectedPlayers.filter((candidate) => !candidate.isHost);
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
  const rulesSummary = getRuleLines(locale, room.settings);
  const overlayActive = room.phase === "round-ended" || room.phase === "finished";
  const answerLabelHint =
    room.settings.mode === "factor"
      ? getFactorAnswerInlineHint(locale, room.round, room.settings)
      : null;
  const showChallengeHelper = room.settings.mode === "binary";
  const resultsAutoResetSeconds =
    room.autoResetAt != null ? Math.max(0, Math.ceil((room.autoResetAt - now) / 1000)) : 0;
  const factorResolutionSummary =
    room.settings.mode === "factor"
      ? getFactorResolutionSummary(locale, room.settings.factorResolutionMode)
      : null;
  const isGoldenBellRound =
    room.phase === "round-active" &&
    room.round?.mode === "factor" &&
    room.settings.factorResolutionMode === "golden-bell";
  const answeringPlayer =
    room.round?.answeringPlayerId != null
      ? room.players.find((candidate) => candidate.id === room.round?.answeringPlayerId) ?? null
      : null;
  const isMyAnswerTurn = answeringPlayer?.id === playerId;
  const goldenBellCountdownSeconds =
    room.round?.answerWindowEndsAt != null
      ? Math.max(0, Math.ceil((room.round.answerWindowEndsAt - now) / 1000))
      : 0;

  useEffect(() => {
    if (room.phase !== "lobby") {
      setIsSettingsOpen(false);
      setIsRenamingRoom(false);
    }
  }, [room.phase]);

  useEffect(() => {
    setRoomNameDraft(room.roomName);
  }, [room.roomName]);

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
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsSettingsOpen(false);
        setIsRulesOpen(false);
        setIsFeedOpen(false);
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
      setIsFeedOpen((current) => !current);
    };

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, []);

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

  return (
    <section
      className={`${styles.roomLayout} ${!showAmbientInfo ? styles.roomLayoutCompact : ""}`}
      data-overlay-active={overlayActive}
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

        <section className={styles.stageSurface}>
          {room.round && room.phase === "round-active" ? (
            <div className={styles.stageHeader}>
              <div className={styles.timerCluster}>
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
            </div>
          ) : null}

          {room.phase === "lobby" ? (
            <div className={styles.lobbyDeck}>
              <div className={styles.lobbyLead}>
                <div className={styles.lobbyLeadRow}>
                  <div>
                    <span className={styles.challengeLabel}>{copy.lobbyRosterLabel}</span>
                    <h4>{copy.lobbyRosterTitle}</h4>
                    <p>{copy.lobbyRosterBody}</p>
                  </div>

                  <div className={styles.actionRow}>
                    {!isHost ? (
                      <button
                        className={currentPlayer?.isReady ? styles.primaryAction : styles.secondaryAction}
                        data-testid="ready-button"
                        onClick={() => onSetReady(!(currentPlayer?.isReady ?? false))}
                        type="button"
                      >
                        {getReadyButtonLabel(locale, currentPlayer?.isReady ?? false)}
                      </button>
                    ) : null}
                    <button
                      className={styles.secondaryAction}
                      data-testid="rules-button"
                      onClick={() => setIsRulesOpen(true)}
                      type="button"
                    >
                      {locale === "ko" ? "룰 보기" : "Rules"}
                    </button>
                    {isHost ? (
                      <>
                        <button
                          className={styles.secondaryAction}
                          data-testid="settings-button"
                          onClick={() => setIsSettingsOpen(true)}
                          type="button"
                        >
                          {copy.openSettings}
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
                    {locale === "ko" ? copy.playersUnit : ` ${copy.playersUnit}`}
                  </span>
                  <span>{getModeLabelByLocale(locale, room.settings.mode)}</span>
                  <span>
                    {room.settings.roundCount} {copy.roundsUnit}
                  </span>
                  <span>
                    {room.settings.roundTimeSec}
                    {locale === "ko" ? copy.secondsUnit : "s"}
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
                {room.players.map((candidate, index) => (
                  <article
                    className={styles.playerPod}
                    data-host={candidate.isHost}
                    data-me={candidate.id === playerId}
                    data-offline={!candidate.connected}
                    key={candidate.id}
                  >
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <strong>{candidate.name}</strong>
                    <p>
                      {formatPlayerMeta(
                        locale,
                        candidate.correctAnswers,
                        candidate.isHost,
                        !candidate.connected
                      )}
                    </p>
                    <div className={styles.podScore}>
                      <small className={candidate.isHost ? styles.hostBadge : undefined}>
                        {candidate.isHost
                          ? copy.hostSuffix
                          : candidate.isReady
                            ? getReadyBadge(locale)
                            : getNotReadyBadge(locale)}
                      </small>
                      <strong>{candidate.score}</strong>
                    </div>
                    {isHost && candidate.id !== playerId && candidate.connected ? (
                      <button
                        className={styles.miniAction}
                        onClick={() => onTransferHost(candidate.id)}
                        type="button"
                      >
                        {copy.transferHost}
                      </button>
                    ) : null}
                  </article>
                ))}
              </div>

              <div className={styles.lobbyFoot}>
                <p className={styles.compactHint}>
                  {allReady
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
                <span className={styles.challengeLabel}>{copy.challengeLabel}</span>
                <h4>{roundCopy?.prompt}</h4>
                {showChallengeHelper ? <p>{roundCopy?.helper}</p> : null}
              </div>

              {room.phase === "round-active" ? (
                myRoundStatus?.hasSubmitted ? (
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
                          ? "골든벨 기회를 사용해 더 이상 답변할 수 없습니다."
                          : "You already spent your golden bell chance."
                        : locale === "ko"
                          ? "이번 라운드의 기회를 모두 사용했습니다."
                          : "You are out of attempts for this round."}
                    </strong>
                    <p>
                      {room.settings.factorResolutionMode === "golden-bell"
                        ? locale === "ko"
                          ? "다른 플레이어의 결과를 기다려 주세요."
                          : "Wait for the rest of the room to finish."
                        : locale === "ko"
                          ? "정답 공개까지 잠시 기다려 주세요."
                          : "Wait for the answer reveal."}
                    </p>
                  </div>
                ) : isGoldenBellRound && answeringPlayer && !isMyAnswerTurn ? (
                  <div className={styles.waitingPanel} data-testid="golden-bell-waiting-panel">
                    <span className={styles.challengeLabel}>{copy.goldenBellWindowLabel}</span>
                    <strong>
                      {locale === "ko"
                        ? `${answeringPlayer.name}님이 답변 중입니다.`
                        : `${answeringPlayer.name} is answering now.`}
                    </strong>
                    <p>
                      {copy.goldenBellWaiting}{" "}
                      {goldenBellCountdownSeconds > 0
                        ? locale === "ko"
                          ? `${goldenBellCountdownSeconds}${copy.secondsUnit} 남음`
                          : `${goldenBellCountdownSeconds}s left`
                        : null}
                    </p>
                  </div>
                ) : isGoldenBellRound && !answeringPlayer ? (
                  <div className={styles.answerPanel} data-testid="golden-bell-claim-panel">
                    <span className={styles.challengeLabel}>{copy.goldenBellWindowLabel}</span>
                    <strong>
                      {locale === "ko"
                        ? "먼저 정답 외치기 버튼을 눌러 답변권을 가져가세요."
                        : "Buzz first to claim the answer turn."}
                    </strong>
                    <p>
                      {locale === "ko"
                        ? "답변권을 얻은 플레이어만 잠시 동안 정답을 입력할 수 있습니다."
                        : "Only the player who buzzes first gets a short answer window."}
                    </p>
                    <div className={styles.actionRow}>
                      <button
                        className={styles.secondaryAction}
                        data-testid="answer-rules-button"
                        onClick={() => setIsRulesOpen(true)}
                        type="button"
                      >
                        {locale === "ko" ? "룰" : "Rules"}
                      </button>
                      <button
                        className={styles.primaryAction}
                        data-testid="claim-answer-button"
                        disabled={busyState === "claim"}
                        onClick={onClaimAnswerTurn}
                        type="button"
                      >
                        {busyState === "claim" ? copy.claimingAnswerTurn : copy.claimAnswerTurn}
                      </button>
                    </div>
                  </div>
                ) : (
                  <form className={styles.answerPanel} onSubmit={onSubmitAnswer}>
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
                        placeholder={
                          room.settings.mode === "factor"
                            ? copy.answerPlaceholderFactor
                            : copy.answerPlaceholderBinary
                        }
                        type="text"
                        value={answerDraft}
                      />
                    </label>
                    {isGoldenBellRound && isMyAnswerTurn ? (
                      <small>
                        {copy.goldenBellAnswering}{" "}
                        {goldenBellCountdownSeconds > 0
                          ? locale === "ko"
                            ? `${goldenBellCountdownSeconds}${copy.secondsUnit} 안에 답하세요.`
                            : `Answer within ${goldenBellCountdownSeconds}s.`
                          : null}
                      </small>
                    ) : (
                      <small>{copy.enterFocusHint}</small>
                    )}
                    <div className={styles.actionRow}>
                      <button
                        className={styles.secondaryAction}
                        data-testid="answer-rules-button"
                        onClick={() => setIsRulesOpen(true)}
                        type="button"
                      >
                        {locale === "ko" ? "룰" : "Rules"}
                      </button>
                      <button
                        className={styles.primaryAction}
                        data-testid="submit-answer-button"
                        disabled={!answerDraft.trim() || busyState === "submit"}
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

      <aside
        className={`${styles.sideRail} ${
          room.phase === "lobby"
            ? styles.sideRailLobby
            : room.phase === "finished"
              ? styles.sideRailResults
              : styles.sideRailLive
        }`}
      >
        {room.phase === "lobby" ? (
          <>
            <section className={styles.railBlock}>
              <div className={styles.railHeading}>
                <span>{copy.inviteLineLabel}</span>
                <strong>{copy.shareUrlLabel}</strong>
              </div>
              <code className={styles.inviteCode} data-testid="invite-url">
                {inviteUrl}
              </code>
              <div className={styles.actionRow}>
                <button
                  className={styles.secondaryAction}
                  data-testid="copy-invite-button"
                  onClick={onCopyInvite}
                  type="button"
                >
                  {copy.copyLink}
                </button>
                <button
                  className={styles.secondaryAction}
                  data-testid="rail-rules-button"
                  onClick={() => setIsRulesOpen(true)}
                  type="button"
                >
                  {locale === "ko" ? "룰 보기" : "Rules"}
                </button>
              </div>
            </section>

            <section className={styles.railBlock}>
              <div className={styles.railHeading}>
                <span>{copy.lobbyRuleCardLabel}</span>
                <strong>{copy.lobbyRuleCardTitle}</strong>
              </div>
              <ul className={styles.noteList}>
                {rulesSummary.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </section>
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
          <section className={styles.railBlock}>
            <div className={styles.railHeading}>
              <span>{copy.liveBoardLabel}</span>
              <strong>{copy.liveBoardTitle}</strong>
            </div>
            <p className={styles.railBody}>{copy.liveBoardBody}</p>

            <div className={styles.leaderboard}>
              {sortedPlayers.map((candidate, index) => {
                const status = room.round?.playerStatuses.find(
                  (entry) => entry.playerId === candidate.id
                );
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
                    ) : null}
                  </div>
                );
              })}
            </div>

            <div className={styles.railFoot}>
              <button
                className={styles.secondaryAction}
                data-testid="activity-toggle-button"
                onClick={() => setIsFeedOpen((current) => !current)}
                type="button"
              >
                {locale === "ko" ? "활동 기록 /" : "Activity /"}
              </button>
              <p className={styles.compactHint}>
                {locale === "ko"
                  ? `${submittedCount}/${room.players.length}명이 정답을 맞혔습니다.`
                  : `${submittedCount}/${room.players.length} players are correct.`}
              </p>
            </div>
          </section>
        )}
      </aside>

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

            <div className={styles.overlayStatRow}>
              <div className={styles.statusNode}>
                <span>{locale === "ko" ? "라운드" : "round"}</span>
                <strong>
                  {room.round.roundNumber}/{room.settings.roundCount}
                </strong>
              </div>
              <div className={styles.statusNode}>
                <span>{locale === "ko" ? "현재 1위" : "leader"}</span>
                <strong>{sortedPlayers[0]?.name ?? "-"}</strong>
              </div>
              <div className={styles.statusNode}>
                <span>{locale === "ko" ? "점수" : "score"}</span>
                <strong>{sortedPlayers[0]?.score ?? 0}</strong>
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
                <strong data-testid="results-total-time">{formatClock(matchElapsedMs, locale)}</strong>
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
              <button
                className={styles.primaryAction}
                disabled={busyState === "reset"}
                onClick={onResetRoom}
                type="button"
              >
                {busyState === "reset" ? copy.resettingLobby : copy.resultsReturnNow}
              </button>
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
                className={styles.secondaryAction}
                onClick={() => setIsSettingsOpen(false)}
                type="button"
              >
                {copy.closePanel}
              </button>
            </div>

            <p className={styles.railBody}>
              {locale === "ko"
                ? "설정은 바꾸는 즉시 반영됩니다."
                : "Changes are applied immediately."}
            </p>

            <div className={styles.settingsColumn}>
              <label className={styles.field}>
                <span>{copy.gameModeField}</span>
                <select
                  data-testid="settings-mode-select"
                  value={settingsDraft.mode}
                  onChange={(event) =>
                    onSettingsDraftChange((current) => ({
                      ...current,
                      mode: event.target.value as GameMode
                    }))
                  }
                >
                  <option value="factor">{getModeLabelByLocale(locale, "factor")}</option>
                  <option value="binary">{getModeLabelByLocale(locale, "binary")}</option>
                </select>
              </label>

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
                  <strong className={styles.rangeValue}>
                    {settingsDraft.roundTimeSec} {copy.secondsUnit}
                  </strong>
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
              </div>

              {settingsDraft.mode === "binary" ? (
                <div className={`${styles.field} ${styles.rangeField}`}>
                  <div className={styles.fieldHead}>
                    <span>{copy.binaryRatioField}</span>
                    <strong className={styles.rangeValue}>
                      {getBinaryRatioSummary(locale, settingsDraft.binaryDecimalToBinaryChance)}
                    </strong>
                  </div>
                  <input
                    className={styles.rangeInput}
                    data-testid="binary-ratio-range"
                    type="range"
                    min="0"
                    max="100"
                    step="10"
                    value={settingsDraft.binaryDecimalToBinaryChance}
                    onChange={(event) =>
                      onSettingsDraftChange((current) => ({
                        ...current,
                        binaryDecimalToBinaryChance: Number(event.target.value)
                      }))
                    }
                  />
                  <small className={styles.fieldNote}>{copy.binaryRatioHint}</small>
                </div>
              ) : (
                <>
                  <label className={styles.field}>
                    <span>{copy.factorResolutionField}</span>
                    <select
                      data-testid="factor-resolution-select"
                      value={settingsDraft.factorResolutionMode}
                      onChange={(event) =>
                        onSettingsDraftChange((current) => ({
                          ...current,
                          factorResolutionMode: event.target.value as FactorResolutionMode
                        }))
                      }
                    >
                      <option value="all-play">{copy.factorResolutionAllPlay}</option>
                      <option value="first-correct">{copy.factorResolutionFirstCorrect}</option>
                      <option value="golden-bell">{copy.factorResolutionGoldenBell}</option>
                    </select>
                    <small className={styles.fieldNote}>{copy.factorResolutionHint}</small>
                  </label>

                  <label className={styles.field}>
                    <span>{copy.factorPrimeAnswerField}</span>
                    <select
                      data-testid="factor-prime-answer-select"
                      value={settingsDraft.factorPrimeAnswerMode}
                      onChange={(event) =>
                        onSettingsDraftChange((current) => ({
                          ...current,
                          factorPrimeAnswerMode: event.target.value === "number" ? "number" : "phrase"
                        }))
                      }
                    >
                      <option value="phrase">{copy.factorPrimeAnswerPhrase}</option>
                      <option value="number">{copy.factorPrimeAnswerNumber}</option>
                    </select>
                    <small className={styles.fieldNote}>{copy.factorPrimeAnswerHint}</small>
                  </label>

                  <label className={styles.toggleField}>
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
                      {locale === "ko" ? "하드 모드: 소수 순서를 그대로 맞추기" : "Hard mode: keep factor order"}
                    </span>
                  </label>

                  {settingsDraft.factorResolutionMode !== "golden-bell" ? (
                    <label className={styles.toggleField}>
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
                        {locale === "ko" ? "한 번 틀리면 입력 종료" : "Lock input after one wrong answer"}
                      </span>
                    </label>
                  ) : null}
                </>
              )}
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
              <div>
                <span className={styles.challengeLabel}>{locale === "ko" ? "게임 룰" : "Rules"}</span>
                <strong>{locale === "ko" ? "이번 방 설명서" : "Room rulebook"}</strong>
              </div>
              <button
                className={styles.secondaryAction}
                onClick={() => setIsRulesOpen(false)}
                type="button"
              >
                {copy.closePanel}
              </button>
            </div>
            <ul className={styles.noteList}>
              {rulesSummary.map((line) => (
                <li key={line}>{line}</li>
              ))}
              <li>
                {locale === "ko"
                  ? "포맷이 맞지 않는 입력은 활동 기록으로 남고, '/' 키로 다시 볼 수 있습니다."
                  : "Malformed inputs are logged in the activity drawer. Press '/' to reopen it."}
              </li>
            </ul>
          </section>
        </div>
      ) : null}

      {isFeedOpen ? (
        <div className={styles.activityPanel} data-testid="activity-panel">
          <div className={styles.modalHeader}>
            <div>
              <span className={styles.challengeLabel}>{locale === "ko" ? "활동 기록" : "Activity"}</span>
              <strong>{locale === "ko" ? "최근 입력" : "Recent entries"}</strong>
            </div>
            <button
              className={styles.secondaryAction}
              onClick={() => setIsFeedOpen(false)}
              type="button"
            >
              {copy.closePanel}
            </button>
          </div>
          <div className={styles.activityList}>
            {room.activityFeed.length === 0 ? (
              <p className={styles.railBody}>
                {locale === "ko" ? "아직 기록이 없습니다." : "No activity yet."}
              </p>
            ) : (
              room.activityFeed
                .slice()
                .reverse()
                .map((entry) => (
                  <div className={styles.activityItem} data-kind={entry.kind} key={entry.id}>
                    <strong>{entry.playerName ?? (locale === "ko" ? "시스템" : "System")}</strong>
                    <p>{entry.text}</p>
                  </div>
                ))
            )}
          </div>
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
    left.binaryDecimalToBinaryChance === right.binaryDecimalToBinaryChance &&
    left.factorResolutionMode === right.factorResolutionMode &&
    left.factorPrimeAnswerMode === right.factorPrimeAnswerMode &&
    left.factorOrderedAnswer === right.factorOrderedAnswer &&
    left.factorSingleAttempt === right.factorSingleAttempt
  );
}

function formatPlayerMeta(
  locale: Locale,
  correctAnswers: number,
  isHost: boolean,
  isOffline: boolean
) {
  const copy = getCopy(locale);
  const parts = [`${correctAnswers} ${copy.correctCountSuffix}`];

  if (isOffline) {
    parts.push(copy.offlineSuffix);
  }

  return parts.join(" · ");
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

function getRuleLines(locale: Locale, settings: LobbySettings) {
  const lines =
    locale === "ko"
      ? [
          `${getModeLabelByLocale(locale, settings.mode)}`,
          `${settings.roundCount}라운드 · ${settings.roundTimeSec}초 제한`,
          settings.mode === "binary"
            ? getBinaryRatioSummary(locale, settings.binaryDecimalToBinaryChance)
            : "소인수는 공백으로 구분해서 입력",
          settings.mode === "factor"
            ? getFactorResolutionSummary(locale, settings.factorResolutionMode)
            : "",
          settings.mode === "factor"
            ? settings.factorPrimeAnswerMode === "number"
              ? "소수 문제가 나오면 그 수 하나만 입력"
              : '소수 문제가 나오면 "야호 소수다" 입력'
            : "",
          settings.mode === "factor" && settings.factorOrderedAnswer
            ? "하드 모드: 소수 순서를 그대로 유지해야 정답"
            : "기본 모드: 소수 순서는 자유",
          settings.mode === "factor" &&
          settings.factorResolutionMode !== "golden-bell" &&
          settings.factorSingleAttempt
            ? "오답 1회 후 입력 종료"
            : settings.mode === "factor" && settings.factorResolutionMode !== "golden-bell"
              ? "오답 후 재입력 가능"
              : "",
          settings.mode === "factor" && settings.factorResolutionMode === "golden-bell"
            ? "골든벨 실패 시 점수 차감 후 다시 답변권을 얻을 수 없음"
            : settings.mode === "factor" && settings.factorResolutionMode === "first-correct"
              ? "첫 정답이 나오면 즉시 공개 단계로 이동"
              : "시간 종료 또는 전원 정답 시 공개 단계로 이동"
        ]
      : [
          `${getModeLabelByLocale(locale, settings.mode)}`,
          `${settings.roundCount} rounds · ${settings.roundTimeSec}s`,
          settings.mode === "binary"
            ? getBinaryRatioSummary(locale, settings.binaryDecimalToBinaryChance)
            : "Separate prime factors with spaces",
          settings.mode === "factor"
            ? getFactorResolutionSummary(locale, settings.factorResolutionMode)
            : "",
          settings.mode === "factor"
            ? settings.factorPrimeAnswerMode === "number"
              ? "Prime targets: enter the number only"
              : 'Prime targets: enter "야호 소수다"'
            : "",
          settings.mode === "factor" && settings.factorOrderedAnswer
            ? "Hard mode: factor order must match"
            : "Default mode: factor order does not matter",
          settings.mode === "factor" &&
          settings.factorResolutionMode !== "golden-bell" &&
          settings.factorSingleAttempt
            ? "One wrong answer locks the round input"
            : settings.mode === "factor" && settings.factorResolutionMode !== "golden-bell"
              ? "Wrong answers can be retried"
              : "",
          settings.mode === "factor" && settings.factorResolutionMode === "golden-bell"
            ? "A failed golden bell answer deducts points and ends that player's chance"
            : settings.mode === "factor" && settings.factorResolutionMode === "first-correct"
              ? "The first correct answer immediately triggers reveal"
              : "Reveal happens on timeout or when everyone is correct"
        ];

  return lines.filter(Boolean);
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

  if (status.lastSubmissionKind === "chat") {
    return locale === "ko" ? "채팅형 입력" : "chat-like";
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

  if (status.lastSubmissionKind === "chat") {
    return "chat";
  }

  return "waiting";
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

function writeRoomSession(roomId: string, playerId: string, name: string) {
  window.localStorage.setItem(
    `${ROOM_SESSION_PREFIX}${roomId}`,
    JSON.stringify({ playerId, name })
  );
}

function readRoomSession(roomId: string): { playerId: string; name: string } | null {
  const rawValue = window.localStorage.getItem(`${ROOM_SESSION_PREFIX}${roomId}`);
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as { playerId?: string; name?: string };
    if (parsed.playerId && parsed.name) {
      return { playerId: parsed.playerId, name: parsed.name };
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
    "Only the host can rename the room.": {
      ko: "방 이름 변경은 방장만 할 수 있습니다.",
      en: "Only the host can rename the room."
    },
    "You can rename the room in the lobby only.": {
      ko: "방 이름은 로비에서만 변경할 수 있습니다.",
      en: "You can rename the room in the lobby only."
    },
    "Ready state is only available in the lobby.": {
      ko: "준비 상태는 로비에서만 바꿀 수 있습니다.",
      en: "Ready state is only available in the lobby."
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
