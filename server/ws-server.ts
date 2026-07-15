import { WebSocket, WebSocketServer } from "ws";
import { Client as PgClient } from "pg";

import { prisma } from "@/lib/prisma";
import { verifyAccessToken } from "@/lib/auth/tokens";
import { findParticipant } from "@/lib/conversations";

const NEW_MESSAGE_CHANNEL = "new_message";
const CONVERSATION_READ_CHANNEL = "conversation_read";

interface ClientState {
  userId: string;
  rooms: Set<string>;
}

interface IncomingFrame {
  type?: string;
  conversationId?: string;
}

/**
 * Розв'язка з Next.js API через Postgres LISTEN/NOTIFY (ARCHITECTURE.md
 * Tech Stack): API-роут не знає про цей процес, шле pg_notify всередині
 * транзакції запису повідомлення — Postgres доставляє нотифікацію лише
 * після коміту.
 */
export async function createWsServer(port: number) {
  const wss = new WebSocketServer({ port });
  await new Promise<void>((resolve, reject) => {
    wss.once("listening", () => resolve());
    wss.once("error", reject);
  });

  const rooms = new Map<string, Set<WebSocket>>();
  const clientState = new WeakMap<WebSocket, ClientState>();

  const pgClient = new PgClient({ connectionString: process.env.DATABASE_URL });
  await pgClient.connect();
  await pgClient.query(`LISTEN ${NEW_MESSAGE_CHANNEL}`);
  await pgClient.query(`LISTEN ${CONVERSATION_READ_CHANNEL}`);

  function broadcast(
    conversationId: string,
    frame: string,
    except?: WebSocket,
  ) {
    const room = rooms.get(conversationId);
    if (!room) return;
    for (const socket of room) {
      if (socket !== except && socket.readyState === WebSocket.OPEN) {
        socket.send(frame);
      }
    }
  }

  pgClient.on("notification", async (notification) => {
    if (!notification.payload) return;

    if (notification.channel === NEW_MESSAGE_CHANNEL) {
      let parsed: { conversationId?: string; messageId?: string };
      try {
        parsed = JSON.parse(notification.payload);
      } catch {
        return;
      }
      if (!parsed.conversationId || !parsed.messageId) return;

      const room = rooms.get(parsed.conversationId);
      if (!room || room.size === 0) return;

      const message = await prisma.message.findUnique({
        where: { id: parsed.messageId },
      });
      if (!message || message.deletedAt) return;

      broadcast(
        parsed.conversationId,
        JSON.stringify({
          type: "message",
          message: {
            id: message.id,
            conversationId: message.conversationId,
            senderId: message.senderId,
            content: message.content,
            sentAt: message.sentAt,
          },
        }),
      );
      return;
    }

    if (notification.channel === CONVERSATION_READ_CHANNEL) {
      let parsed: {
        conversationId?: string;
        userId?: string;
        lastReadAt?: string;
      };
      try {
        parsed = JSON.parse(notification.payload);
      } catch {
        return;
      }
      if (!parsed.conversationId || !parsed.userId || !parsed.lastReadAt) {
        return;
      }

      broadcast(
        parsed.conversationId,
        JSON.stringify({
          type: "read",
          conversationId: parsed.conversationId,
          userId: parsed.userId,
          lastReadAt: parsed.lastReadAt,
        }),
      );
    }
  });

  function leaveAllRooms(socket: WebSocket) {
    const state = clientState.get(socket);
    if (!state) return;
    for (const conversationId of state.rooms) {
      rooms.get(conversationId)?.delete(socket);
    }
    clientState.delete(socket);
  }

  wss.on("connection", async (socket, request) => {
    const url = new URL(request.url ?? "", "http://localhost");
    const token = url.searchParams.get("token");

    if (!token) {
      socket.close(4001, "unauthorized");
      return;
    }

    let userId: string;
    try {
      userId = (await verifyAccessToken(token)).sub;
    } catch {
      socket.close(4001, "unauthorized");
      return;
    }

    clientState.set(socket, { userId, rooms: new Set() });

    socket.on("message", async (raw) => {
      let frame: IncomingFrame;
      try {
        frame = JSON.parse(raw.toString());
      } catch {
        socket.send(JSON.stringify({ type: "error", code: "invalid_message" }));
        return;
      }

      const state = clientState.get(socket);
      if (!state || typeof frame.conversationId !== "string") {
        return;
      }

      if (frame.type === "join") {
        const participant = await findParticipant(
          frame.conversationId,
          state.userId,
        );
        if (!participant) {
          socket.send(JSON.stringify({ type: "error", code: "not_found" }));
          return;
        }
        state.rooms.add(frame.conversationId);
        if (!rooms.has(frame.conversationId)) {
          rooms.set(frame.conversationId, new Set());
        }
        rooms.get(frame.conversationId)!.add(socket);
        socket.send(
          JSON.stringify({
            type: "joined",
            conversationId: frame.conversationId,
          }),
        );
        return;
      }

      if (frame.type === "leave") {
        state.rooms.delete(frame.conversationId);
        rooms.get(frame.conversationId)?.delete(socket);
        return;
      }

      if (frame.type === "typing") {
        // Ефемерний стан — не пишемо в БД (DATABASE.md), лише ретрансляція
        // іншим сокетам у кімнаті. Довіряємо join-перевірці учасника вище.
        if (!state.rooms.has(frame.conversationId)) return;
        broadcast(
          frame.conversationId,
          JSON.stringify({
            type: "typing",
            conversationId: frame.conversationId,
            userId: state.userId,
          }),
          socket,
        );
      }
    });

    socket.on("close", () => leaveAllRooms(socket));
  });

  const address = wss.address();
  const boundPort =
    address === null || typeof address === "string" ? port : address.port;

  return {
    wss,
    port: boundPort,
    close: async () => {
      await pgClient.end();
      await new Promise<void>((resolve, reject) =>
        wss.close((err) => (err ? reject(err) : resolve())),
      );
    },
  };
}
