/**
 * 서버 앱 진입점.
 *
 * 역할:
 * - Express HTTP 서버와 Socket.IO 서버를 함께 띄운다.
 * - 클라이언트가 보내는 소켓 이벤트를 RoomStore 메서드에 연결한다.
 *
 * 현재는 Next.js 프론트엔드와 별도 프로세스로 동작한다.
 * 즉, 이 서버는 정적 웹 페이지를 서빙하지 않고
 * 실시간 게임 상태와 소켓 통신만 담당한다.
 */
import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import type {
  ClaimAnswerRequest,
  CreateRoomRequest,
  JoinRoomRequest,
  RenameRoomRequest,
  RoomActionRequest,
  SetReadyRequest,
  SocketAck,
  SubmitAnswerRequest,
  SubmitAnswerResult,
  TransferHostRequest,
  UpdateSettingsRequest
} from "@factorrush/shared";
import { RoomStore } from "./roomStore.js";

const port = Number(process.env.PORT ?? 3001);
const allowedOrigins = readAllowedOrigins();
const corsOrigin = allowedOrigins.length > 0 ? allowedOrigins : true;
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: corsOrigin,
    credentials: true
  }
});
const roomStore = new RoomStore(io);

app.use(
  cors({
    origin: corsOrigin,
    credentials: true
  })
);
app.use(express.json());

app.get("/health", (_request, response) => {
  response.json({ ok: true });
});

io.on("connection", (socket) => {
  // 각 이벤트의 실제 비즈니스 로직은 RoomStore가 담당한다.
  socket.on("room:create", (payload: CreateRoomRequest, callback: (result: SocketAck<unknown>) => void) => {
    callback(roomStore.createRoom(socket, payload));
  });

  socket.on("room:join", (payload: JoinRoomRequest, callback: (result: SocketAck<unknown>) => void) => {
    callback(roomStore.joinRoom(socket, payload));
  });

  socket.on(
    "room:update-settings",
    (payload: UpdateSettingsRequest, callback: (result: SocketAck<unknown>) => void) => {
      callback(roomStore.updateSettings(socket, payload));
    }
  );

  socket.on(
    "room:rename",
    (payload: RenameRoomRequest, callback: (result: SocketAck<unknown>) => void) => {
      callback(roomStore.renameRoom(socket, payload));
    }
  );

  socket.on(
    "room:set-ready",
    (payload: SetReadyRequest, callback: (result: SocketAck<unknown>) => void) => {
      callback(roomStore.setReady(socket, payload));
    }
  );

  socket.on(
    "room:transfer-host",
    (payload: TransferHostRequest, callback: (result: SocketAck<unknown>) => void) => {
      callback(roomStore.transferHost(socket, payload));
    }
  );

  socket.on(
    "game:start",
    (payload: RoomActionRequest, callback: (result: SocketAck<unknown>) => void) => {
      callback(roomStore.startGame(socket, payload));
    }
  );

  socket.on(
    "round:claim-answer",
    (payload: ClaimAnswerRequest, callback: (result: SocketAck<unknown>) => void) => {
      callback(roomStore.claimAnswer(socket, payload));
    }
  );

  socket.on(
    "round:submit-answer",
    (
      payload: SubmitAnswerRequest,
      callback: (result: SocketAck<SubmitAnswerResult>) => void
    ) => {
      callback(roomStore.submitAnswer(socket, payload));
    }
  );

  socket.on(
    "round:next",
    (payload: RoomActionRequest, callback: (result: SocketAck<unknown>) => void) => {
      callback(roomStore.advanceRound(socket, payload));
    }
  );

  socket.on(
    "room:reset",
    (payload: RoomActionRequest, callback: (result: SocketAck<unknown>) => void) => {
      callback(roomStore.resetToLobby(socket, payload));
    }
  );

  socket.on("disconnect", () => {
    roomStore.disconnect(socket.id);
  });
});

httpServer.listen(port, () => {
  if (allowedOrigins.length === 0 && process.env.NODE_ENV === "production") {
    console.warn("ALLOWED_ORIGINS is not set. Production CORS is fully open.");
  }
  console.log(`FactorRush server listening on http://localhost:${port}`);
});

function readAllowedOrigins() {
  if (!process.env.ALLOWED_ORIGINS) {
    return [];
  }

  return process.env.ALLOWED_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}
