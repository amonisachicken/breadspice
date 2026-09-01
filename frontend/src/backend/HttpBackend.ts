// SPDX-License-Identifier: GPL-3.0-only

/**
 * HTTP/WebSocket 后端实现 —— 对接 Rust + ngspice 服务。
 *
 * - RPC 走 `POST /api`（`BackendRequest` -> `BackendResponse`）；
 * - 事件流走 `GET /ws`（`BackendEvent` 推送）。
 *
 * 前端 vite 已把 `/api`、`/ws` 代理到 127.0.0.1:8787，因此这里用相对路径，
 * 开发（走代理）与生产（后端直供静态页）两种部署都能工作。
 */

import type { Backend, BackendEventName } from "./Backend";
import type {
  BackendEvent,
  BackendRequest,
  BackendResponse,
  ComponentModel,
  Netlist,
  SimulationRequest,
  SimulationResult,
} from "../types/protocol";
import type { Circuit } from "../types/domain";

export class HttpBackend implements Backend {
  readonly kind = "ngspice" as const;

  private readonly apiUrl: string;
  private readonly wsUrl: string;
  private ws: WebSocket | null = null;
  private handlers = new Map<BackendEventName, Set<(e: BackendEvent) => void>>();

  constructor(opts?: { apiUrl?: string; wsUrl?: string }) {
    this.apiUrl = opts?.apiUrl ?? "/api";
    this.wsUrl =
      opts?.wsUrl ??
      `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
  }

  async listModels(): Promise<ComponentModel[]> {
    const resp = await this.rpc({ kind: "list_models" });
    if (resp.kind !== "models") throw new Error(`后端响应异常：${resp.kind}`);
    return resp.models;
  }

  async buildNetlist(circuit: Circuit): Promise<Netlist> {
    const resp = await this.rpc({ kind: "build_netlist", circuit });
    if (resp.kind !== "netlist") throw new Error(`后端响应异常：${resp.kind}`);
    return resp.netlist;
  }

  async simulate(request: SimulationRequest): Promise<SimulationResult> {
    const resp = await this.rpc({ kind: "simulate", request });
    if (resp.kind === "simulation") return resp.result;
    if (resp.kind === "error") throw new Error(`${resp.code}: ${resp.message}`);
    throw new Error(`后端响应异常：${resp.kind}`);
  }

  async uploadAudio(file: Blob): Promise<{ id: string; duration: number }> {
    let resp: Response;
    try {
      resp = await fetch(`${this.apiUrl}/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: file,
      });
    } catch (err) {
      throw new Error(
        `无法连接后端（${err instanceof Error ? err.message : String(err)}），请先在 backend 目录运行 cargo run`,
      );
    }
    if (!resp.ok) {
      const data = (await resp.json().catch(() => null)) as { error?: string } | null;
      throw new Error(`音频上传失败：${data?.error ?? `HTTP ${resp.status}`}`);
    }
    return (await resp.json()) as { id: string; duration: number };
  }

  async stopSimulation(): Promise<void> {
    await fetch(`${this.apiUrl}/stop`, { method: "POST" }).catch(() => undefined);
  }

  async fft(x: number[], y: number[]): Promise<{ x: number[]; y: number[] }> {
    let resp: Response;
    try {
      resp = await fetch(`${this.apiUrl}/fft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ x, y }),
      });
    } catch (err) {
      throw new Error(
        `无法连接后端（${err instanceof Error ? err.message : String(err)}），请先在 backend 目录运行 cargo run`,
      );
    }
    if (!resp.ok) {
      const data = (await resp.json().catch(() => null)) as { error?: string } | null;
      throw new Error(`FFT 失败：${data?.error ?? `HTTP ${resp.status}`}`);
    }
    return (await resp.json()) as { x: number[]; y: number[] };
  }

  on<K extends BackendEventName>(
    event: K,
    handler: (payload: Extract<BackendEvent, { kind: K }>) => void,
  ): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    const fn = handler as (e: BackendEvent) => void;
    set.add(fn);
    this.ensureConnected();
    return () => {
      set?.delete(fn);
    };
  }

  private async rpc(req: BackendRequest): Promise<BackendResponse> {
    let resp: Response;
    try {
      resp = await fetch(this.apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
    } catch (err) {
      throw new Error(
        `无法连接后端（${err instanceof Error ? err.message : String(err)}），请先在 backend 目录运行 cargo run`,
      );
    }
    if (!resp.ok) throw new Error(`后端请求失败（HTTP ${resp.status}）`);
    return (await resp.json()) as BackendResponse;
  }

  private ensureConnected(): void {
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
    this.connect();
  }

  private connect(): void {
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.wsUrl);
    } catch {
      return;
    }
    this.ws = ws;
    ws.onmessage = (ev) => {
      try {
        const event = JSON.parse(ev.data as string) as BackendEvent;
        this.handlers.get(event.kind)?.forEach((h) => h(event));
      } catch {
        /* 忽略无法解析的消息 */
      }
    };
    ws.onclose = () => {
      if (this.ws === ws) this.ws = null;
      // 仍有订阅者时简单重连
      if (this.hasHandlers()) {
        window.setTimeout(() => this.ensureConnected(), 1500);
      }
    };
  }

  private hasHandlers(): boolean {
    for (const set of this.handlers.values()) {
      if (set.size > 0) return true;
    }
    return false;
  }
}
