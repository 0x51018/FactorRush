import { io } from "socket.io-client";

const SERVER_URL = process.env.SMOKE_SERVER_URL ?? "http://127.0.0.1:3001";
const TIMEOUT_MS = 35000;
const PRIME_SHOUT = "야호 소수다";

async function main() {
  const results = [];

  results.push(await runScenario("factor"));
  results.push(await runScenario("binary"));
  results.push(await runGoldenBellScenario());
  results.push(await runSuddenDeathScenario());
  results.push(await runSpectatorScenario());
  results.push(await runPresenceScenario());

  console.log(
    JSON.stringify(
      {
        ok: true,
        results
      },
      null,
      2
    )
  );
}

async function runPresenceScenario() {
  const host = io(SERVER_URL, { autoConnect: false, transports: ["websocket"] });
  const guest = io(SERVER_URL, { autoConnect: false, transports: ["websocket"] });

  const hostObserver = createRoomObserver(host);

  try {
    await Promise.all([connect(host), connect(guest)]);

    const created = await emitAck(host, "room:create", {
      playerName: "presence-Host",
      settings: {
        mode: "factor",
        roundCount: 3,
        roundTimeSec: 20,
        binaryDecimalToBinaryChance: 50
      }
    });

    await hostObserver.waitFor((state) => state.roomId === created.roomId && state.players.length === 1);

    const joined = await emitAck(guest, "room:join", {
      roomId: created.roomId,
      playerName: "presence-Guest"
    });

    await hostObserver.waitFor((state) => state.roomId === created.roomId && state.players.length === 2);

    await emitAck(host, "room:transfer-host", {
      roomId: created.roomId,
      playerId: joined.playerId
    });

    const transferredState = await hostObserver.waitFor(
      (state) =>
        state.players.length === 2 &&
        state.players.some((player) => player.name === "presence-Guest" && player.isHost) &&
        state.players.some((player) => player.name === "presence-Host" && !player.isHost)
    );

    guest.disconnect();

    const promotedState = await hostObserver.waitFor(
      (state) =>
        state.players.length === 1 &&
        state.players[0]?.name === "presence-Host" &&
        state.players[0]?.isHost === true &&
        state.messageKey === "player-left"
    );

    return {
      mode: "presence",
      roomId: created.roomId,
      transferredHost: transferredState.players.find((player) => player.isHost)?.name,
      remainingHost: promotedState.players[0]?.name,
      messageKey: promotedState.messageKey
    };
  } finally {
    host.disconnect();
    guest.disconnect();
  }
}

async function runSpectatorScenario() {
  const host = io(SERVER_URL, { autoConnect: false, transports: ["websocket"] });
  const guest = io(SERVER_URL, { autoConnect: false, transports: ["websocket"] });
  const spectator = io(SERVER_URL, { autoConnect: false, transports: ["websocket"] });

  const hostObserver = createRoomObserver(host);
  const guestObserver = createRoomObserver(guest);
  const spectatorObserver = createRoomObserver(spectator);

  try {
    await Promise.all([connect(host), connect(guest), connect(spectator)]);

    const created = await emitAck(host, "room:create", {
      playerName: "spec-Host",
      settings: {
        mode: "factor",
        roundCount: 3,
        roundTimeSec: 20,
        binaryDecimalToBinaryChance: 50
      }
    });

    await hostObserver.waitFor((state) => state.roomId === created.roomId && state.players.length === 1);

    await emitAck(guest, "room:join", {
      roomId: created.roomId,
      playerName: "spec-Guest"
    });

    await guestObserver.waitFor((state) => state.roomId === created.roomId && state.players.length === 2);

    await emitAck(guest, "room:set-ready", {
      roomId: created.roomId,
      isReady: true
    });

    await emitAck(host, "game:start", { roomId: created.roomId });
    await hostObserver.waitFor((state) => state.phase === "round-active" && Boolean(state.round));

    const joined = await emitAck(spectator, "room:join", {
      roomId: created.roomId,
      playerName: "spec-Watcher"
    });

    if (joined.role !== "spectator") {
      throw new Error("진행 중 참가자는 관전자로 입장해야 합니다.");
    }

    const spectatingState = await hostObserver.waitFor(
      (state) =>
        state.phase === "round-active" &&
        state.spectators.some((entry) => entry.name === "spec-Watcher")
    );

    await emitAck(host, "room:reset", { roomId: created.roomId });
    await spectatorObserver.waitFor((state) => state.phase === "lobby");

    const seated = await emitAck(spectator, "room:become-player", {
      roomId: created.roomId
    });

    if (seated.role !== "player") {
      throw new Error("관전자는 로비에서 플레이어 좌석으로 합류해야 합니다.");
    }

    const seatedState = await hostObserver.waitFor(
      (state) =>
        state.phase === "lobby" &&
        state.players.some((entry) => entry.name === "spec-Watcher") &&
        state.spectators.every((entry) => entry.name !== "spec-Watcher")
    );

    return {
      mode: "spectator",
      roomId: created.roomId,
      joinRole: joined.role,
      spectatorCountWhileLive: spectatingState.spectators.length,
      playersAfterSeat: seatedState.players.length
    };
  } finally {
    host.disconnect();
    guest.disconnect();
    spectator.disconnect();
  }
}

async function runScenario(mode) {
  const host = io(SERVER_URL, { autoConnect: false, transports: ["websocket"] });
  const guest = io(SERVER_URL, { autoConnect: false, transports: ["websocket"] });

  const hostObserver = createRoomObserver(host);
  const guestObserver = createRoomObserver(guest);

  try {
    await Promise.all([connect(host), connect(guest)]);

    const created = await emitAck(host, "room:create", {
      playerName: `${mode}-Host`,
      settings: {
        mode: "factor",
        roundCount: 3,
        roundTimeSec: 20,
        binaryDecimalToBinaryChance: 50
      }
    });

    await hostObserver.waitFor((state) => state.roomId === created.roomId && state.players.length === 1);

    await emitAck(guest, "room:join", {
      roomId: created.roomId,
      playerName: `${mode}-Guest`
    });

    await guestObserver.waitFor((state) => state.roomId === created.roomId && state.players.length === 2);
    await emitAck(guest, "room:send-chat", {
      roomId: created.roomId,
      text: `${mode}-hello`
    });
    await hostObserver.waitFor(
      (state) =>
        state.chatFeed.some(
          (entry) => entry.playerName === `${mode}-Guest` && entry.text === `${mode}-hello`
        )
    );

    if (mode === "binary") {
      await emitAck(host, "room:update-settings", {
        roomId: created.roomId,
        settings: {
          mode: "binary",
          roundCount: 3,
          roundTimeSec: 20,
          binaryDecimalToBinaryChance: 100
        }
      });

      await hostObserver.waitFor(
        (state) => state.roomId === created.roomId && state.settings.mode === "binary"
      );
    }

    await emitAck(guest, "room:set-ready", {
      roomId: created.roomId,
      isReady: true
    });

    await emitAck(host, "game:start", { roomId: created.roomId });

    const activeState = await hostObserver.waitFor(
      (state) => state.phase === "round-active" && Boolean(state.round)
    );

    if (activeState.round?.mode !== mode) {
      throw new Error(
        `예상 모드(${mode})와 실제 라운드 모드(${activeState.round?.mode ?? "unknown"})가 다릅니다.`
      );
    }

    const prompt = activeState.round?.prompt;
    if (!prompt) {
      throw new Error("활성 라운드 문제를 받지 못했습니다.");
    }

    const answer = deriveAnswer(prompt);
    await emitAck(host, "round:submit-answer", {
      roomId: created.roomId,
      answer
    });
    await emitAck(guest, "round:submit-answer", {
      roomId: created.roomId,
      answer
    });

    const endedState = await hostObserver.waitFor((state) => state.phase === "round-ended");
    if (!endedState.round?.revealedAnswer) {
      throw new Error("라운드 종료 후 정답 공개 상태를 확인하지 못했습니다.");
    }

    return {
      mode,
      roomId: created.roomId,
      prompt,
      revealedAnswer: endedState.round.revealedAnswer
    };
  } finally {
    host.disconnect();
    guest.disconnect();
  }
}

async function runGoldenBellScenario() {
  const host = io(SERVER_URL, { autoConnect: false, transports: ["websocket"] });
  const guest = io(SERVER_URL, { autoConnect: false, transports: ["websocket"] });

  const hostObserver = createRoomObserver(host);
  const guestObserver = createRoomObserver(guest);

  try {
    await Promise.all([connect(host), connect(guest)]);

    const created = await emitAck(host, "room:create", {
      playerName: "golden-Host",
      settings: {
        mode: "factor",
        roundCount: 3,
        roundTimeSec: 20,
        factorResolutionMode: "golden-bell"
      }
    });

    await hostObserver.waitFor((state) => state.roomId === created.roomId && state.players.length === 1);

    await emitAck(guest, "room:join", {
      roomId: created.roomId,
      playerName: "golden-Guest"
    });

    await guestObserver.waitFor((state) => state.roomId === created.roomId && state.players.length === 2);

    await emitAck(guest, "room:set-ready", {
      roomId: created.roomId,
      isReady: true
    });

    await emitAck(host, "game:start", { roomId: created.roomId });

    const activeState = await hostObserver.waitFor(
      (state) => state.phase === "round-active" && state.settings.factorResolutionMode === "golden-bell"
    );
    if (activeState.round?.hasRoundTimer !== false) {
      throw new Error("골든벨 라운드는 전체 타이머 없이 시작되어야 합니다.");
    }

    await emitAck(host, "round:claim-answer", { roomId: created.roomId });
    await hostObserver.waitFor(
      (state) => state.round?.answeringPlayerId && state.round.answeringPlayerId === state.players[0]?.id
    );

    await emitAck(host, "round:submit-answer", {
      roomId: created.roomId,
      answer: "4 4"
    });

    const lockedState = await hostObserver.waitFor((state) => {
      const hostPlayer = state.players.find((player) => player.name === "golden-Host");
      const hostStatus = state.round?.playerStatuses.find((entry) => entry.playerId === hostPlayer?.id);
      return state.phase === "round-active" && hostStatus?.isLockedOut === true;
    });

    await emitAck(guest, "round:claim-answer", { roomId: created.roomId });
    const guestTurnState = await guestObserver.waitFor((state) => {
      const guestPlayer = state.players.find((player) => player.name === "golden-Guest");
      return state.round?.answeringPlayerId === guestPlayer?.id;
    });

    const prompt = guestTurnState.round?.prompt;
    if (!prompt) {
      throw new Error("골든벨 문제를 받지 못했습니다.");
    }

    await emitAck(guest, "round:submit-answer", {
      roomId: created.roomId,
      answer: deriveAnswer(prompt)
    });

    const endedState = await hostObserver.waitFor((state) => state.phase === "round-ended");

    return {
      mode: "golden-bell",
      roomId: created.roomId,
      prompt: activeState.round?.prompt,
      hasRoundTimer: activeState.round?.hasRoundTimer,
      hostScoreAfterPenalty: lockedState.players.find((player) => player.name === "golden-Host")?.score,
      revealedAnswer: endedState.round?.revealedAnswer
    };
  } finally {
    host.disconnect();
    guest.disconnect();
  }
}

async function runSuddenDeathScenario() {
  const host = io(SERVER_URL, { autoConnect: false, transports: ["websocket"] });
  const guest = io(SERVER_URL, { autoConnect: false, transports: ["websocket"] });

  const hostObserver = createRoomObserver(host);
  const guestObserver = createRoomObserver(guest);

  try {
    await Promise.all([connect(host), connect(guest)]);

    const created = await emitAck(host, "room:create", {
      playerName: "sudden-Host",
      settings: {
        mode: "factor",
        roundCount: 3,
        roundTimeSec: 15,
        factorResolutionMode: "all-play",
        factorSuddenDeath: true
      }
    });

    await hostObserver.waitFor((state) => state.roomId === created.roomId && state.players.length === 1);

    await emitAck(guest, "room:join", {
      roomId: created.roomId,
      playerName: "sudden-Guest"
    });

    await guestObserver.waitFor((state) => state.roomId === created.roomId && state.players.length === 2);

    await emitAck(guest, "room:set-ready", {
      roomId: created.roomId,
      isReady: true
    });

    await emitAck(host, "game:start", { roomId: created.roomId });

    const suddenState = await hostObserver.waitFor(
      (state) =>
        state.phase === "round-active" &&
        state.round?.isSuddenDeath === true &&
        state.messageKey === "sudden-death-open"
    );

    const prompt = suddenState.round?.prompt;
    if (!prompt) {
      throw new Error("서든데스 문제를 받지 못했습니다.");
    }

    await emitAck(host, "round:submit-answer", {
      roomId: created.roomId,
      answer: deriveAnswer(prompt)
    });

    const endedState = await hostObserver.waitFor((state) => state.phase === "round-ended");

    return {
      mode: "sudden-death",
      roomId: created.roomId,
      prompt,
      messageKey: suddenState.messageKey,
      revealedAnswer: endedState.round?.revealedAnswer
    };
  } finally {
    host.disconnect();
    guest.disconnect();
  }
}

function createRoomObserver(socket) {
  let latest = null;
  const waiters = [];

  socket.on("room:state", (state) => {
    latest = state;

    for (let index = waiters.length - 1; index >= 0; index -= 1) {
      const waiter = waiters[index];
      if (waiter.predicate(state)) {
        waiters.splice(index, 1);
        clearTimeout(waiter.timeoutId);
        waiter.resolve(state);
      }
    }
  });

  return {
    get latest() {
      return latest;
    },
    waitFor(predicate) {
      if (latest && predicate(latest)) {
        return Promise.resolve(latest);
      }

      return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          const waiterIndex = waiters.findIndex((waiter) => waiter.timeoutId === timeoutId);
          if (waiterIndex >= 0) {
            waiters.splice(waiterIndex, 1);
          }
          reject(new Error("room:state 대기 시간이 초과되었습니다."));
        }, TIMEOUT_MS);

        waiters.push({ predicate, resolve, timeoutId });
      });
    }
  };
}

function connect(socket) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error("소켓 연결 시간이 초과되었습니다."));
    }, TIMEOUT_MS);

    socket.once("connect", () => {
      clearTimeout(timeoutId);
      resolve();
    });
    socket.once("connect_error", (error) => {
      clearTimeout(timeoutId);
      reject(error);
    });

    socket.connect();
  });
}

function emitAck(socket, eventName, payload) {
  return new Promise((resolve, reject) => {
    socket.emit(eventName, payload, (result) => {
      if (result?.ok) {
        resolve(result.data);
        return;
      }

      reject(new Error(result?.error ?? `${eventName} ack 실패`));
    });
  });
}

function deriveAnswer(prompt) {
  const factorMatch = prompt.match(/^Factorize (\d+) into prime factors\.$/);
  if (factorMatch?.[1]) {
    return factorize(Number(factorMatch[1]));
  }

  const decimalToBinaryMatch = prompt.match(/^Convert (\d+) to binary\.$/);
  if (decimalToBinaryMatch?.[1]) {
    return Number(decimalToBinaryMatch[1]).toString(2);
  }

  const binaryToDecimalMatch = prompt.match(/^Convert ([01]+) to decimal\.$/);
  if (binaryToDecimalMatch?.[1]) {
    return parseInt(binaryToDecimalMatch[1], 2).toString(10);
  }

  throw new Error(`알 수 없는 문제 형식입니다: ${prompt}`);
}

function factorize(value) {
  const factors = [];
  let remainder = value;
  let divisor = 2;

  while (remainder > 1) {
    while (remainder % divisor === 0) {
      factors.push(divisor);
      remainder /= divisor;
    }
    divisor += 1;
  }

  if (factors.length === 1 && factors[0] === value) {
    return PRIME_SHOUT;
  }

  return factors.join(" ");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
