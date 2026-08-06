import { describe, expect, it } from "vitest";
import { RoomManager } from "../src/rooms/RoomManager.js";
import type { ServerMessage } from "../src/rooms/types.js";

function makeSend() {
  const calls: ServerMessage[] = [];
  const fn = (msg: ServerMessage) => {
    calls.push(msg);
  };
  return { fn, calls };
}

describe("RoomManager.join", () => {
  it("sends a sync to the joiner and broadcasts members to all", () => {
    const rm = new RoomManager();
    const { fn: send1, calls: c1 } = makeSend();
    const { fn: send2, calls: c2 } = makeSend();

    rm.join("room1", "host-uid", { memberId: "m1", name: "Alice", send: send1, isHost: true });
    rm.join("room1", "host-uid", { memberId: "m2", name: "Bob", send: send2, isHost: false });

    const m1Members = c1.filter((m) => m.type === "members");
    expect(m1Members.length).toBeGreaterThanOrEqual(1);
    const last = m1Members.at(-1) as Extract<ServerMessage, { type: "members" }>;
    expect(last.members.map((m) => m.id)).toContain("m2");
    expect(c2.some((m) => m.type === "sync")).toBe(true);
  });
});

describe("RoomManager.leave", () => {
  it("removes the member and broadcasts the updated list", () => {
    const rm = new RoomManager();
    const { fn: send1, calls: c1 } = makeSend();
    const { fn: send2 } = makeSend();
    rm.join("room1", "host-uid", { memberId: "m1", name: "Alice", send: send1, isHost: true });
    rm.join("room1", "host-uid", { memberId: "m2", name: "Bob", send: send2, isHost: false });
    c1.length = 0;

    rm.leave("room1", "m2");
    const membersMsg = c1.find((m) => m.type === "members") as
      | Extract<ServerMessage, { type: "members" }>
      | undefined;
    expect(membersMsg).toBeDefined();
    expect(membersMsg!.members.map((m) => m.id)).not.toContain("m2");
  });

  it("deletes the room when the last member leaves", () => {
    const rm = new RoomManager();
    const { fn } = makeSend();
    rm.join("room1", "host-uid", { memberId: "m1", name: "A", send: fn, isHost: true });
    rm.leave("room1", "m1");
    expect(rm.getRuntime("room1")).toBeUndefined();
  });

  it("does nothing if the room does not exist", () => {
    const rm = new RoomManager();
    expect(() => rm.leave("ghost", "m1")).not.toThrow();
  });
});

describe("RoomManager.applyHostAction — host authority", () => {
  it("host play broadcasts state to all members", () => {
    const rm = new RoomManager();
    const { fn: s1, calls: c1 } = makeSend();
    const { fn: s2, calls: c2 } = makeSend();
    rm.join("room1", "host-uid", { memberId: "host-uid", name: "Host", send: s1, isHost: true });
    rm.join("room1", "host-uid", { memberId: "viewer", name: "V", send: s2, isHost: false });
    c1.length = 0;
    c2.length = 0;

    rm.applyHostAction("room1", "host-uid", { type: "play", positionSec: 42 });

    const st = c1.find((m) => m.type === "state") as Extract<ServerMessage, { type: "state" }>;
    expect(st.playing).toBe(true);
    expect(st.positionSec).toBe(42);
    expect(c2.some((m) => m.type === "state")).toBe(true);
  });

  it("non-host play is denied; only the sender gets a denied frame", () => {
    const rm = new RoomManager();
    const { fn: sHost, calls: cHost } = makeSend();
    const { fn: sViewer, calls: cViewer } = makeSend();
    rm.join("room1", "host-uid", { memberId: "host-uid", name: "H", send: sHost, isHost: true });
    rm.join("room1", "host-uid", { memberId: "viewer", name: "V", send: sViewer, isHost: false });
    cHost.length = 0;
    cViewer.length = 0;

    rm.applyHostAction("room1", "viewer", { type: "play", positionSec: 10 });

    expect(cHost.filter((m) => m.type === "state")).toHaveLength(0);
    const denied = cViewer.find((m) => m.type === "denied") as
      | Extract<ServerMessage, { type: "denied" }>
      | undefined;
    expect(denied?.reason).toBe("not-host");
  });

  it("host pause sets playing=false; seek updates position only", () => {
    const rm = new RoomManager();
    const { fn } = makeSend();
    rm.join("room1", "host-uid", { memberId: "host-uid", name: "H", send: fn, isHost: true });
    rm.applyHostAction("room1", "host-uid", { type: "play", positionSec: 30 });
    rm.applyHostAction("room1", "host-uid", { type: "pause", positionSec: 30 });
    expect(rm.getRuntime("room1")?.playback.playing).toBe(false);
    rm.applyHostAction("room1", "host-uid", { type: "seek", positionSec: 120 });
    expect(rm.getRuntime("room1")?.playback.positionSec).toBe(120);
    expect(rm.getRuntime("room1")?.playback.playing).toBe(false);
  });
});

describe("RoomManager.chat", () => {
  it("broadcasts a chat frame to all members", () => {
    const rm = new RoomManager();
    const { fn: s1, calls: c1 } = makeSend();
    const { fn: s2, calls: c2 } = makeSend();
    rm.join("room1", "host-uid", { memberId: "m1", name: "Alice", send: s1, isHost: true });
    rm.join("room1", "host-uid", { memberId: "m2", name: "Bob", send: s2, isHost: false });
    c1.length = 0;
    c2.length = 0;

    rm.chat("room1", "m1", "Hello!");
    const chat1 = c1.find((m) => m.type === "chat") as Extract<ServerMessage, { type: "chat" }>;
    expect(chat1.from).toBe("Alice");
    expect(chat1.text).toBe("Hello!");
    expect(c2.some((m) => m.type === "chat")).toBe(true);
  });

  it("does nothing if the room does not exist", () => {
    const rm = new RoomManager();
    expect(() => rm.chat("ghost", "m1", "hi")).not.toThrow();
  });
});
