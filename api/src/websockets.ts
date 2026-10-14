import { URL } from "node:url";
import { WebSocketServer } from "ws";
import type { WebSocket } from "ws";
import type { Server } from "node:http";

export class MapSet<K, V> {
  private map: Map<K, Set<V>>;

  constructor() {
    this.map = new Map();
  }

  get(id: K): Set<V> {
    const set = this.map.get(id);
    if (set !== undefined) {
      return set;
    } else {
      const newSet = new Set<V>();
      this.map.set(id, newSet);
      return newSet;
    }
  }

  add(id: K, item: V) {
    this.get(id).add(item);
  }

  remove(id: K, item: V) {
    const set = this.get(id);
    set?.delete(item);
    if (set?.size === 0) {
      this.map.delete(id);
    }
  }
}

export class WrappedWebSocketServer {
  private eventsConnections: MapSet<string, WebSocket>;
  private channels: MapSet<string, WebSocket>;

  constructor(server: Server) {
    this.eventsConnections = new MapSet();
    this.channels = new MapSet();
    const wss = new WebSocketServer({ server });
    wss.on("error", (err) => console.error("WSS error:", err));
    wss.on("connection", (ws, req) => {
      if (req.url === undefined) {
        throw new Error("unreachable?");
      }
      ws.on("error", (err) => console.error("WS error:", err, "code", (err as any).code));
      const parsedUrl = wsUrlParse(req.url);
      switch (parsedUrl?.type) {
        case undefined: {
          ws.close(1002, "Unsupported path");
          return;
        }
        case "session events": {
          this.eventsConnections.add(parsedUrl.session, ws);
          ws.on("close", () => this.eventsConnections.remove(parsedUrl.session, ws));
          return;
        }
        case "channel": {
          this.channels.add(parsedUrl.channel, ws);
          ws.on("message", (msg) => {
            for (const channelConnection of this.channels.get(parsedUrl.channel) ?? []) {
              if (channelConnection !== ws) {
                channelConnection.send(msg);
              }
            }
          });
          ws.on("close", () => this.channels.remove(parsedUrl.channel, ws));
          return;
        }
      }
    });
  }

  notifyClientsForSession(id: string, event: Uint8Array<ArrayBuffer>) {
    const connections = this.eventsConnections.get(id) ?? [];
    for (const ws of connections) {
      ws.send(event, (err) => {
        if (err) {
          console.error("WebSocket error", id, err);
        }
      });
    }
  }
}

function wsUrlParse(
  urlSuffix: string,
): { type: "session events"; session: string } | { type: "channel"; channel: string } | undefined {
  const url = new URL(urlSuffix, "http://localhost");

  const sessionEventsMatch = url.pathname.match(/^\/session\/([^/]+)\/events/);
  if (sessionEventsMatch !== null) {
    const session = decodeURIComponent(sessionEventsMatch[1]!);
    return { type: "session events", session };
  }

  const channelMatch = url.pathname.match(/^\/channel\/([^/]+)/);
  if (channelMatch !== null) {
    const channel = decodeURIComponent(channelMatch[1]!);
    return { type: "channel", channel };
  }
  return undefined;
}
