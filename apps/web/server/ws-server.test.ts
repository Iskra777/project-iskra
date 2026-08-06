import "dotenv/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signAccessToken } from "@/lib/auth/tokens";
import { POST } from "@/app/api/conversations/[id]/messages/route";
import { PATCH as markRead } from "@/app/api/conversations/[id]/read/route";
import { createWsServer } from "./ws-server";

const PREFIX = "ws_server_test_";

function sendMessage(conversationId: string, content: string, token: string) {
  return POST(
    new Request(
      `http://localhost/api/conversations/${conversationId}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ content }),
      },
    ),
    { params: Promise.resolve({ id: conversationId }) },
  );
}

function markConversationRead(conversationId: string, token: string) {
  return markRead(
    new Request(`http://localhost/api/conversations/${conversationId}/read`, {
      method: "PATCH",
      headers: { authorization: `Bearer ${token}` },
    }),
    { params: Promise.resolve({ id: conversationId }) },
  );
}

function waitForFrame(
  socket: WebSocket,
  predicate: (frame: Record<string, unknown>) => boolean,
  timeoutMs = 5000,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off("message", onMessage);
      reject(new Error("Не дочекались очікуваного фрейму від WS-сервера"));
    }, timeoutMs);

    function onMessage(raw: WebSocket.RawData) {
      const frame = JSON.parse(raw.toString());
      if (predicate(frame)) {
        clearTimeout(timer);
        socket.off("message", onMessage);
        resolve(frame);
      }
    }

    socket.on("message", onMessage);
  });
}

function waitForOpen(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once("open", () => resolve());
    socket.once("error", reject);
  });
}

function waitForClose(socket: WebSocket): Promise<number> {
  return new Promise((resolve) => {
    socket.once("close", (code) => resolve(code));
  });
}

let aliceId: string;
let bobId: string;
let carolId: string;
let conversationId: string;
let wsServer: Awaited<ReturnType<typeof createWsServer>>;
let wsUrl: string;

beforeEach(async () => {
  process.env.JWT_SECRET = "test-access-secret";
  const passwordHash = await hashPassword("correct horse battery staple");

  const [alice, bob, carol] = await Promise.all([
    prisma.user.create({
      data: {
        email: `${PREFIX}alice@example.com`,
        username: `${PREFIX}alice`,
        passwordHash,
      },
    }),
    prisma.user.create({
      data: {
        email: `${PREFIX}bob@example.com`,
        username: `${PREFIX}bob`,
        passwordHash,
      },
    }),
    prisma.user.create({
      data: {
        email: `${PREFIX}carol@example.com`,
        username: `${PREFIX}carol`,
        passwordHash,
      },
    }),
  ]);
  aliceId = alice.id;
  bobId = bob.id;
  carolId = carol.id;

  const conversation = await prisma.conversation.create({
    data: {
      type: "direct",
      participants: { create: [{ userId: aliceId }, { userId: bobId }] },
    },
  });
  conversationId = conversation.id;

  wsServer = await createWsServer(0);
  wsUrl = `ws://127.0.0.1:${wsServer.port}`;
});

afterEach(async () => {
  await wsServer.close();
  await prisma.message.deleteMany({ where: { conversationId } });
  await prisma.conversationParticipant.deleteMany({
    where: { conversationId },
  });
  await prisma.conversation.deleteMany({ where: { id: conversationId } });
  await prisma.user.deleteMany({
    where: { id: { in: [aliceId, bobId, carolId] } },
  });
});

describe("WS-сервер доставки повідомлень", () => {
  it("надсилає нове повідомлення учаснику, який приєднався до розмови", async () => {
    const bobToken = await signAccessToken(bobId);
    const bobSocket = new WebSocket(`${wsUrl}/?token=${bobToken}`);
    await waitForOpen(bobSocket);

    bobSocket.send(JSON.stringify({ type: "join", conversationId }));
    await waitForFrame(bobSocket, (frame) => frame.type === "joined");

    const aliceToken = await signAccessToken(aliceId);
    const response = await sendMessage(
      conversationId,
      "Привіт, Боб!",
      aliceToken,
    );
    expect(response.status).toBe(201);

    const frame = await waitForFrame(
      bobSocket,
      (frame) => frame.type === "message",
    );
    const message = frame.message as Record<string, unknown>;
    expect(message.content).toBe("Привіт, Боб!");
    expect(message.senderId).toBe(aliceId);
    expect(message.conversationId).toBe(conversationId);

    bobSocket.close();
  });

  it("повертає not_found при спробі приєднатись до чужої розмови", async () => {
    const carolToken = await signAccessToken(carolId);
    const carolSocket = new WebSocket(`${wsUrl}/?token=${carolToken}`);
    await waitForOpen(carolSocket);

    carolSocket.send(JSON.stringify({ type: "join", conversationId }));
    const frame = await waitForFrame(
      carolSocket,
      (frame) => frame.type === "error",
    );
    expect(frame.code).toBe("not_found");

    carolSocket.close();
  });

  it("закриває з'єднання без токена", async () => {
    const socket = new WebSocket(wsUrl);
    const code = await waitForClose(socket);
    expect(code).toBe(4001);
  });

  it("ретранслює 'typing' іншим учасникам кімнати, але не відправнику", async () => {
    const aliceToken = await signAccessToken(aliceId);
    const bobToken = await signAccessToken(bobId);
    const aliceSocket = new WebSocket(`${wsUrl}/?token=${aliceToken}`);
    const bobSocket = new WebSocket(`${wsUrl}/?token=${bobToken}`);
    await Promise.all([waitForOpen(aliceSocket), waitForOpen(bobSocket)]);

    aliceSocket.send(JSON.stringify({ type: "join", conversationId }));
    bobSocket.send(JSON.stringify({ type: "join", conversationId }));
    await Promise.all([
      waitForFrame(aliceSocket, (frame) => frame.type === "joined"),
      waitForFrame(bobSocket, (frame) => frame.type === "joined"),
    ]);

    let bobReceivedTyping = false;
    bobSocket.on("message", (raw) => {
      const frame = JSON.parse(raw.toString());
      if (frame.type === "typing") bobReceivedTyping = true;
    });

    bobSocket.send(JSON.stringify({ type: "typing", conversationId }));
    const frame = await waitForFrame(
      aliceSocket,
      (frame) => frame.type === "typing",
    );
    expect(frame.userId).toBe(bobId);
    expect(frame.conversationId).toBe(conversationId);

    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(bobReceivedTyping).toBe(false);

    aliceSocket.close();
    bobSocket.close();
  });

  it("транслює позначення 'прочитано' іншим учасникам кімнати", async () => {
    const aliceToken = await signAccessToken(aliceId);
    const bobToken = await signAccessToken(bobId);
    const aliceSocket = new WebSocket(`${wsUrl}/?token=${aliceToken}`);
    await waitForOpen(aliceSocket);
    aliceSocket.send(JSON.stringify({ type: "join", conversationId }));
    await waitForFrame(aliceSocket, (frame) => frame.type === "joined");

    const readResponse = await markConversationRead(conversationId, bobToken);
    expect(readResponse.status).toBe(200);

    const frame = await waitForFrame(
      aliceSocket,
      (frame) => frame.type === "read",
    );
    expect(frame.conversationId).toBe(conversationId);
    expect(frame.userId).toBe(bobId);
    expect(typeof frame.lastReadAt).toBe("string");

    aliceSocket.close();
  });
});
