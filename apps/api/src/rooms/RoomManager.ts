import type {
  ClientPause,
  ClientPlay,
  ClientSeek,
  ServerMessage,
} from "./types.js";

export interface MemberEntry {
  memberId: string;
  name: string;
  isHost: boolean;
  send: (msg: ServerMessage) => void;
}

export interface PlaybackState {
  playing: boolean;
  positionSec: number;
}

export interface RoomRuntime {
  hostUserId: string;
  members: Map<string, MemberEntry>;
  playback: PlaybackState;
}

type HostAction = ClientPlay | ClientPause | ClientSeek;

// In-memory store for all live rooms (one instance per process). Never touches
// real WebSocket objects — it accepts a `send` callback per member, so it is
// 100% unit-testable with fake functions. Single-instance only; horizontal
// scaling would need Redis pub/sub (design spec §7, out of scope).
export class RoomManager {
  private readonly rooms = new Map<string, RoomRuntime>();

  getRuntime(roomCode: string): RoomRuntime | undefined {
    return this.rooms.get(roomCode);
  }

  join(roomCode: string, hostUserId: string, entry: MemberEntry): void {
    let runtime = this.rooms.get(roomCode);
    if (!runtime) {
      runtime = { hostUserId, members: new Map(), playback: { playing: false, positionSec: 0 } };
      this.rooms.set(roomCode, runtime);
    }
    runtime.members.set(entry.memberId, entry);

    // Full sync to the joiner so they catch up immediately.
    entry.send({
      type: "sync",
      playing: runtime.playback.playing,
      positionSec: runtime.playback.positionSec,
      members: this.memberList(runtime),
    });
    // Broadcast updated member list to everyone.
    this.broadcastMembers(runtime);
  }

  leave(roomCode: string, memberId: string): void {
    const runtime = this.rooms.get(roomCode);
    if (!runtime) return;
    runtime.members.delete(memberId);
    if (runtime.members.size === 0) {
      this.rooms.delete(roomCode);
      return;
    }
    this.broadcastMembers(runtime);
  }

  // Host-authoritative. Non-host attempts get a `denied` frame echoing state.
  applyHostAction(roomCode: string, actorMemberId: string, action: HostAction): void {
    const runtime = this.rooms.get(roomCode);
    if (!runtime) return;
    const actor = runtime.members.get(actorMemberId);
    if (!actor) return;

    if (!actor.isHost) {
      actor.send({
        type: "denied",
        reason: "not-host",
        playing: runtime.playback.playing,
        positionSec: runtime.playback.positionSec,
      });
      return;
    }

    switch (action.type) {
      case "play":
        runtime.playback.playing = true;
        runtime.playback.positionSec = action.positionSec;
        break;
      case "pause":
        runtime.playback.playing = false;
        runtime.playback.positionSec = action.positionSec;
        break;
      case "seek":
        runtime.playback.positionSec = action.positionSec;
        break;
    }

    this.broadcast(runtime, {
      type: "state",
      playing: runtime.playback.playing,
      positionSec: runtime.playback.positionSec,
    });
  }

  chat(roomCode: string, memberId: string, text: string): void {
    const runtime = this.rooms.get(roomCode);
    if (!runtime) return;
    const sender = runtime.members.get(memberId);
    if (!sender) return;
    this.broadcast(runtime, {
      type: "chat",
      from: sender.name,
      text,
      at: new Date().toISOString(),
    });
  }

  private memberList(runtime: RoomRuntime): Array<{ id: string; name: string }> {
    return Array.from(runtime.members.values()).map((m) => ({ id: m.memberId, name: m.name }));
  }

  private broadcastMembers(runtime: RoomRuntime): void {
    this.broadcast(runtime, { type: "members", members: this.memberList(runtime) });
  }

  private broadcast(runtime: RoomRuntime, msg: ServerMessage): void {
    for (const member of runtime.members.values()) {
      try {
        member.send(msg);
      } catch {
        // A broken send (closed socket) must not abort the broadcast loop.
      }
    }
  }
}

// Singleton shared across the process. The WebSocket route adapter imports this.
export const roomManager = new RoomManager();
