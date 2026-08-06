// ─── Client → Server ─────────────────────────────────────────────────────────

/** Sent once after the socket opens, before any other message. */
export interface ClientJoin {
  type: "join";
  name: string; // display name (max 64 chars)
}
/** Host-only: start/resume. Non-host sends are ignored (denied echo). */
export interface ClientPlay {
  type: "play";
  positionSec: number;
}
export interface ClientPause {
  type: "pause";
  positionSec: number;
}
export interface ClientSeek {
  type: "seek";
  positionSec: number;
}
/** Any member: chat message (max 500 chars). */
export interface ClientChat {
  type: "chat";
  text: string;
}

export type ClientMessage = ClientJoin | ClientPlay | ClientPause | ClientSeek | ClientChat;

// ─── Server → Client ─────────────────────────────────────────────────────────

export interface ServerState {
  type: "state";
  playing: boolean;
  positionSec: number;
}
export interface ServerMembers {
  type: "members";
  members: Array<{ id: string; name: string }>;
}
export interface ServerChat {
  type: "chat";
  from: string;
  text: string;
  at: string; // ISO-8601
}
/** Sent only to the joining member so they sync instantly. */
export interface ServerSync {
  type: "sync";
  playing: boolean;
  positionSec: number;
  members: Array<{ id: string; name: string }>;
}
/** Sent to a non-host who attempted a host-only action; echoes authoritative state. */
export interface ServerDenied {
  type: "denied";
  reason: "not-host";
  playing: boolean;
  positionSec: number;
}

export type ServerMessage =
  | ServerState
  | ServerMembers
  | ServerChat
  | ServerSync
  | ServerDenied;
