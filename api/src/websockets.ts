import { URL } from "node:url";
import { WebSocketServer } from "ws";
import type { WebSocket } from "ws";
import type { Server } from "node:http";

if (!Map.prototype.hasOwnProperty("getOrInsert")) {
  Object.defineProperty(Map.prototype, "getOrInsert", {
    value: function (key: string, default_: unknown) {
      const that: Map<unknown, unknown> = this;
      if (that.has(key)) {
        return that.get(key);
      } else {
        that.set(key, default_);
        return default_;
      }
    },
    writable: true,
    configurable: true,
    enumerable: false,
  });
}

export class WrappedWebSocketServer {
  private connections: Map<string, Set<WebSocket>>;
  constructor(server: Server) {
    const wss = new WebSocketServer({ server });
    this.connections = new Map();
    wss.on("connection", (ws, req) => {
      if (req.url === undefined) {
        throw new Error("unreachable?");
      }
      const url = new URL(req.url, "http://localhost");
      const urlMatch = url.pathname.match(/\/session\/([^\/]+)\/events/);
      if (urlMatch === null) {
        ws.close(1002, "Unsupported path");
        return;
      }
      const sessionId = decodeURIComponent(urlMatch[1]!);
      const sessionConnections = this.connections.getOrInsert(sessionId, new Set());
      sessionConnections.add(ws);
      ws.on("close", () => {
        const sessionConnections = this.connections.getOrInsert(sessionId, new Set());
        sessionConnections.delete(ws);
        if (sessionConnections.size === 0) {
          this.connections.delete(sessionId);
        }
      });
    });
  }

  notifyClientsForSession(id: string, event: Uint8Array<ArrayBuffer>) {
    const connections = this.connections.get(id) ?? [];
    for (const ws of connections) {
      ws.send(event, (err) => {
        if (err) {
          console.error("WebSocket error", id, err);
        }
      });
    }
  }
}
