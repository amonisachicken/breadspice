// SPDX-License-Identifier: GPL-3.0-only

/**
 * 后端解析器 —— 决定当前使用哪个 Backend 实现。
 *
 * 默认连真实 Rust/ngspice 后端（`HttpBackend`）；设 `VITE_USE_MOCK=1`
 * 可回退到本地 `MockBackend`（无后端时的离线调试）。
 */

import type { Backend } from "./Backend";
import { HttpBackend } from "./HttpBackend";
import { MockBackend } from "./MockBackend";

let backend: Backend | null = null;

/** 获取全局后端单例。 */
export function getBackend(): Backend {
  if (!backend) {
    backend = import.meta.env.VITE_USE_MOCK === "1" ? new MockBackend() : new HttpBackend();
  }
  return backend;
}

/** 测试/重启用：替换后端实现并重置单例。 */
export function setBackend(next: Backend): void {
  backend = next;
}

export type { Backend };
