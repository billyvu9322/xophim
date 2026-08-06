import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// Protocol types — mirror of apps/api/src/rooms/types.ts (duplicated for MVP).
interface MemberInfo {
  id: string;
  name: string;
}
interface PlaybackState {
  playing: boolean;
  positionSec: number;
}
interface ChatLine {
  from: string;
  text: string;
  at: string;
}

type ClientMessage =
  | { type: "join"; name: string }
  | { type: "play"; positionSec: number }
  | { type: "pause"; positionSec: number }
  | { type: "seek"; positionSec: number }
  | { type: "chat"; text: string };

type ServerMessage =
  | { type: "state"; playing: boolean; positionSec: number }
  | { type: "members"; members: MemberInfo[] }
  | { type: "chat"; from: string; text: string; at: string }
  | { type: "sync"; playing: boolean; positionSec: number; members: MemberInfo[] }
  | { type: "denied"; reason: string; playing: boolean; positionSec: number };

export interface WatchPartyState {
  members: MemberInfo[];
  chat: ChatLine[];
  playbackState: PlaybackState;
  connected: boolean;
  sendChat: (text: string) => void;
  hostControls: {
    play: (positionSec: number) => void;
    pause: (positionSec: number) => void;
    seek: (positionSec: number) => void;
  };
}

/**
 * Opens a WebSocket to /v1/rooms/:code/ws and manages the connection lifecycle.
 * Sends {type:"join",name} on open. Cleans up on unmount. ws://|wss:// derived
 * from the page protocol so it works in dev (http) and prod (https).
 */
export function useWatchParty(code: string, name: string, enabled = true): WatchPartyState {
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [playbackState, setPlaybackState] = useState<PlaybackState>({
    playing: false,
    positionSec: 0,
  });
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const send = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  useEffect(() => {
    if (!enabled || !code) return;

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const url = `${protocol}://${window.location.host}/v1/rooms/${code}/ws`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      ws.send(JSON.stringify({ type: "join", name } satisfies ClientMessage));
    };
    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
    };
    ws.onerror = () => setConnected(false);
    ws.onmessage = (event: MessageEvent<string>) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(event.data) as ServerMessage;
      } catch {
        return;
      }
      switch (msg.type) {
        case "sync":
          setPlaybackState({ playing: msg.playing, positionSec: msg.positionSec });
          setMembers(msg.members);
          break;
        case "state":
        case "denied":
          setPlaybackState({ playing: msg.playing, positionSec: msg.positionSec });
          break;
        case "members":
          setMembers(msg.members);
          break;
        case "chat":
          setChat((prev) => [...prev, { from: msg.from, text: msg.text, at: msg.at }]);
          break;
        default:
          break;
      }
    };

    return () => {
      ws.close();
    };
  }, [code, name, enabled]);

  const sendChat = useCallback(
    (text: string) => {
      const trimmed = text.slice(0, 500).trim();
      if (trimmed) send({ type: "chat", text: trimmed });
    },
    [send],
  );

  const hostControls = useMemo(
    () => ({
      play: (positionSec: number) => send({ type: "play", positionSec }),
      pause: (positionSec: number) => send({ type: "pause", positionSec }),
      seek: (positionSec: number) => send({ type: "seek", positionSec }),
    }),
    [send],
  );

  return { members, chat, playbackState, connected, sendChat, hostControls };
}
