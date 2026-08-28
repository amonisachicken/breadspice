// SPDX-License-Identifier: GPL-3.0-only

/**
 * 后端解析器 —— 决定当前使用哪个 Backend 实现。
 *
 * 现在固定返回 {@link MockBackend}。接入 Rust/ngspice 后端后，只需
 * 在这里按环境变量/配置切换到 `HttpBackend` 或 `WsBackend`，其余代码
 * 通过 `backend` 单例使用，无需改动。
 */

import type { Backend } from "./Backend";
import { MockBackend } from "./MockBackend";

let backend: Backend | null = null;

/** 获取全局后端单例。 */
export function getBackend(): Backend {
  if (!backend) {
    // TODO(backend): 接入真实 ngspice 后端时在此切换实现，例如：
    //   backend = import.meta.env.DEV ? new MockBackend() : new HttpBackend();
    backend = new MockBackend();
  }
  return backend;
}

/** 测试/重启用：替换后端实现并重置单例。 */
export function setBackend(next: Backend): void {
  backend = next;
}

export type { Backend };
