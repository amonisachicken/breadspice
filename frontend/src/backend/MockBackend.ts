// SPDX-License-Identifier: GPL-3.0-only

/**
 * Mock 后端 —— 本地占位实现，用于在没有 Rust 后端时打通完整数据流。
 *
 * 它：
 * 1. 返回一份元件模型目录；
 * 2. 用“参考实现”把 {@link Circuit} 编译成 SPICE 网表（与 Rust 后端逻辑对齐，
 *    便于两端契约对拍；生产环境以 Rust 后端为准）；
 * 3. 返回确定性的伪仿真结果，供前端调试波形/工作点渲染。
 *
 * 接入真实 ngspice 后端后，这个文件可以整体替换为 `HttpBackend`。
 */

import type { Backend, BackendEventName } from "./Backend";
import type {
  BackendEvent,
  ComponentModel,
  Netlist,
  NetlistDevice,
  SimulationRequest,
  SimulationResult,
} from "../types/protocol";
import type { Circuit, ComponentKind, NetId } from "../types/domain";

/** 元件引脚 -> ngspice 节点名。 */
function nodeName(netId: NetId): string {
  // 把电气网 id 转成 SPICE 节点标识符；SPICE 节点名不能以数字开头。
  return "n_" + netId.replace(/[^A-Za-z0-9_]/g, "_");
}

/** 元件种类 -> ngspice 器件首字母。 */
const SPICE_PREFIX: Record<ComponentKind, string> = {
  resistor: "R",
  capacitor: "C",
  inductor: "L",
  diode: "D",
  led: "D",
  npn: "Q",
  pnp: "Q",
  nmos: "M",
  pmos: "M",
  opamp: "X",
  jumper: "R", // 跳线以近零电阻 R 近似
  wire: "R",
  power: "V",
  generic: "X",
};

/** 把「数值 + 单位」折叠成 SPICE 后缀表示（µ→u, kΩ→k, MΩ→Meg, Ω→""）。 */
function spiceValue(value: string, unit?: string): string {
  if (!unit) return value;
  const suffix: Record<string, string> = {
    "Ω": "", "kΩ": "k", "MΩ": "Meg", "GΩ": "G",
    "pF": "p", "nF": "n", "µF": "u", "uF": "u", "mF": "m", "F": "",
    "µH": "u", "uH": "u", "mH": "m", "H": "",
  };
  return value + (suffix[unit] ?? unit);
}

/**
 * 参考网表生成器（仅供 Mock 演示；生产环境由 Rust 后端实现）。
 * 根据每个元件的引脚落在哪个 net 上，展开为 SPICE 器件行。
 */
function buildReferenceNetlist(circuit: Circuit): Netlist {
  const devices: NetlistDevice[] = [];
  const lines: string[] = ["* Virtual breadboard netlist (mock reference)", ""];

  // net id -> 节点名缓存
  const nodeCache = new Map<NetId, string>();
  const resolveNode = (netId: NetId): string => {
    let n = nodeCache.get(netId);
    if (!n) {
      n = nodeName(netId);
      nodeCache.set(netId, n);
    }
    return n;
  };

  // 建立 node id -> net id 索引
  const nodeToNet = new Map<string, NetId>();
  for (const net of circuit.breadboard.nets) {
    for (const nodeId of net.nodeIds) nodeToNet.set(nodeId, net.id);
  }

  for (const comp of circuit.components) {
    const prefix = SPICE_PREFIX[comp.kind] ?? "X";
    const nodes = comp.pins.map((pin) => {
      const netId = pin.node ? nodeToNet.get(pin.node) : undefined;
      return netId ? resolveNode(netId) : "0"; // 未连接默认接地（占位）
    });

    let line: string;
    if (comp.kind === "power") {
      // 理想直流源：V<name> <+> <-> <value>
      line = `${prefix}${comp.refdes} ${nodes[0] ?? "0"} ${nodes[1] ?? "0"} ${comp.value}`;
    } else if (comp.kind === "jumper" || comp.kind === "wire") {
      // 导线/跳线：近零电阻
      line = `${prefix}${comp.refdes} ${nodes[0] ?? "0"} ${nodes[1] ?? "0"} 0.001`;
    } else if (nodes.length === 2) {
      line = `${prefix}${comp.refdes} ${nodes[0]} ${nodes[1]} ${spiceValue(comp.value, comp.unit)}`;
    } else {
      // 三端及以上的器件，先退化为“器件名 + 全部节点 + 参数”。
      line = `${prefix}${comp.refdes} ${nodes.join(" ")} ${comp.value}`;
    }

    lines.push(line);
    devices.push({ type: prefix, name: comp.refdes, componentId: comp.id, line });
  }

  lines.push(".end", "");
  return { text: lines.join("\n"), devices };
}

/** 返回一份静态模型目录。后续由 Rust 后端维护，或从 JSON 资产加载。 */
const STATIC_MODELS: ComponentModel[] = [
  { kind: "resistor", label: "电阻", pins: pins(2) },
  { kind: "capacitor", label: "电容", pins: pins(2) },
  { kind: "inductor", label: "电感", pins: pins(2) },
  { kind: "led", label: "LED", pins: pins(2) },
  { kind: "diode", label: "二极管", pins: pins(2) },
  { kind: "npn", label: "NPN 三极管", pins: pins(3) },
  { kind: "power", label: "电源/地", pins: pins(2) },
  { kind: "jumper", label: "跳线", pins: pins(2) },
];

function pins(count: number): { name: string; x: number; y: number }[] {
  return Array.from({ length: count }, (_, i) => ({
    name: String(i + 1),
    x: 0,
    y: i * 20,
  }));
}

/** 生成确定性的伪仿真数据（便于调试结果渲染）。 */
function fakeSimulation(req: SimulationRequest): SimulationResult {
  const n = 64;
  const x = Array.from({ length: n }, (_, i) => i / (n - 1));
  if (req.analysis === "op") {
    return {
      ok: true,
      op: { "V(out)": 5.0, "V(in)": 5.0, "I(R1)": 0.001 },
    };
  }
  const traces = [
    {
      name: "V(out)",
      x,
      y: x.map((t) => 5 * Math.sin(2 * Math.PI * 2 * t) * Math.exp(-t)),
    },
    {
      name: "I(R1)",
      x,
      y: x.map((t) => 0.001 * Math.cos(2 * Math.PI * 2 * t)),
    },
  ];
  return { ok: true, traces };
}

export class MockBackend implements Backend {
  readonly kind = "mock" as const;

  private handlers = new Map<BackendEventName, Set<(e: BackendEvent) => void>>();

  async listModels(): Promise<ComponentModel[]> {
    return STATIC_MODELS.map((m) => ({ ...m, pins: m.pins.map((p) => ({ ...p })) }));
  }

  async buildNetlist(circuit: Circuit): Promise<Netlist> {
    return buildReferenceNetlist(circuit);
  }

  async simulate(request: SimulationRequest): Promise<SimulationResult> {
    this.emit({ kind: "simulation_started", requestId: "mock-1" });
    await new Promise((r) => setTimeout(r, 120));
    this.emit({ kind: "simulation_done", requestId: "mock-1" });
    return fakeSimulation(request);
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
    return () => set?.delete(fn);
  }

  private emit(event: BackendEvent): void {
    this.handlers.get(event.kind)?.forEach((h) => h(event));
  }
}

/** 供类型断言用：确认实现符合接口。 */
const _typeCheck: Backend = new MockBackend();
void _typeCheck;
