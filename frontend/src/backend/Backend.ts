// SPDX-License-Identifier: GPL-3.0-only

/**
 * 后端抽象接口 —— 前端唯一依赖的“仿真后端”契约。
 *
 * 现在只有 {@link MockBackend}（本地占位实现，用来打通数据流），
 * 之后接入 Rust/ngspice 后端时，只需新增一个实现此接口的
 * `HttpBackend` / `WsBackend`，前端其余代码无需改动。
 */

import type {
  BackendEvent,
  ComponentModel,
  Netlist,
  SimulationRequest,
  SimulationResult,
} from "../types/protocol";
import type { Circuit } from "../types/domain";

export type BackendEventName = BackendEvent["kind"];

/**
 * 前端与“仿真后端”之间的稳定接口。
 *
 * 设计原则：
 * - 后端对前端是“无状态 RPC + 事件流”的形态；
 * - 前端只发送 {@link Circuit}（电路描述），不关心 ngspice 细节；
 * - 网表生成、模型目录、仿真执行全部由后端负责。
 */
export interface Backend {
  /** 后端标识，用于诊断与日志。 */
  readonly kind: "mock" | "ngspice";

  /** 获取可用的元件模型目录（驱动前端元件面板）。 */
  listModels(): Promise<ComponentModel[]>;

  /** 把一个电路布局编译成 ngspice 网表。 */
  buildNetlist(circuit: Circuit): Promise<Netlist>;

  /** 执行一次仿真。 */
  simulate(request: SimulationRequest): Promise<SimulationResult>;

  /**
   * 订阅后端主动推送的事件（进度、实时波形、状态变化）。
   * @returns 取消订阅函数。
   */
  on<K extends BackendEventName>(
    event: K,
    handler: (payload: Extract<BackendEvent, { kind: K }>) => void,
  ): () => void;
}
