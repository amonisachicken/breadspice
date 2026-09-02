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
import { t } from "../i18n";
import type {
  BackendEvent,
  ComponentModel,
  Netlist,
  NetlistDevice,
  SimulationRequest,
  SimulationResult,
} from "../types/protocol";
import type { Circuit, ComponentInstance, ComponentKind, NetId } from "../types/domain";

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
  jfet: "J",
  opamp: "X",
  opamp2: "X",
  potentiometer: "R", // 电位器 → 两个串联电阻
  jumper: "R", // 跳线以近零电阻 R 近似
  wire: "R",
  power: "V",
  gnd: "0", // 接地标记不产生器件（占位）
  vsine: "V", // 正弦波发生器 → 正弦电压源
  audio: "V", // 音频输入 → 内联 PWL 电压源（Mock 无真实数据）
  voltmeter: "R", // 电压表 → 大电阻采样
  ammeter: "V", // 电流表 → 0V 电压源电流探针
  oscilloscope: "X", // 示波器 → 探针（读取 raw 波形）
  generic: "X",
};

/** 把「数值 + 单位」折叠成 SPICE 后缀表示（µ→u, kΩ→k, MΩ→Meg, Ω→""）。 */
function spiceValue(value: string, unit?: string): string {
  if (!unit) return value;
  const suffix: Record<string, string> = {
    "Ω": "", "kΩ": "k", "MΩ": "Meg", "GΩ": "G",
    "pF": "p", "nF": "n", "µF": "u", "uF": "u", "mF": "m", "F": "",
    "µH": "u", "uH": "u", "mH": "m", "H": "",
    "V": "", "mV": "m",
  };
  return value + (suffix[unit] ?? unit);
}

/** 元件 -> ngspice 模型/子电路名（LED 颜色、运放 OP07 需映射到模型名）。 */
function spiceModelName(comp: ComponentInstance): string {
  if (comp.kind === "led") {
    return { red: "LedRed", green: "LedGreen", blue: "LedBLUE" }[comp.value] ?? comp.value;
  }
  if (comp.kind === "opamp") {
    return comp.value === "OP07" ? "OP07A" : comp.value;
  }
  return comp.value;
}

/** 解析「数值 + 单位」为欧姆（电位器总阻值用）。 */
function parseOhms(value: string, unit?: string): number {
  const v = Number(value) || 0;
  if (unit === "kΩ") return v * 1e3;
  if (unit === "MΩ") return v * 1e6;
  if (unit === "GΩ") return v * 1e9;
  if (unit === "mΩ") return v * 1e-3;
  return v;
}

/** 把欧姆值格式化为整洁的 SPICE 数值字符串（如 5000 -> "5k"）。 */
function formatOhms(ohms: number): string {
  if (ohms === 0) return "0";
  let scale = 1;
  let suffix = "";
  if (Math.abs(ohms) >= 1e9) { scale = 1e9; suffix = "G"; }
  else if (Math.abs(ohms) >= 1e6) { scale = 1e6; suffix = "Meg"; }
  else if (Math.abs(ohms) >= 1e3) { scale = 1e3; suffix = "k"; }
  else if (Math.abs(ohms) < 1e-3) { scale = 1e-3; suffix = "m"; }
  return String(Number((ohms / scale).toFixed(4))) + suffix;
}

/**
 * 参考网表生成器（仅供 Mock 演示；生产环境由 Rust 后端实现）。
 * 根据每个元件的引脚落在哪个 net 上，展开为 SPICE 器件行。
 */
function buildReferenceNetlist(circuit: Circuit): Netlist {
  const devices: NetlistDevice[] = [];
  const lines: string[] = ["* Virtual breadboard netlist (mock reference)", ""];

  // 建立 node id -> net id 索引
  const nodeToNet = new Map<string, NetId>();
  for (const net of circuit.breadboard.nets) {
    for (const nodeId of net.nodeIds) nodeToNet.set(nodeId, net.id);
  }

  // 地网 -> ngspice 节点 0（只有显式 GND 元件定义地）
  const groundNets = new Set<string>();
  for (const comp of circuit.components) {
    if (comp.kind === "gnd") {
      const pin = comp.pins[0];
      const netId = pin?.node ? nodeToNet.get(pin.node) : undefined;
      if (netId) groundNets.add(netId);
    }
  }

  // net id -> 节点名缓存（地网映射为 0）
  const nodeCache = new Map<NetId, string>();
  const resolveNode = (netId: NetId): string => {
    if (groundNets.has(netId)) return "0";
    let n = nodeCache.get(netId);
    if (!n) {
      n = nodeName(netId);
      nodeCache.set(netId, n);
    }
    return n;
  };

  for (const comp of circuit.components) {
    if (comp.kind === "gnd") {
      // 接地标记：不产生器件，仅记录其把所在 net 接到节点 0。
      lines.push(`* gnd ${comp.refdes}: node 0`);
      continue;
    }
    const prefix = SPICE_PREFIX[comp.kind] ?? "X";
    const nodes = comp.pins.map((pin) => {
      const netId = pin.node ? nodeToNet.get(pin.node) : undefined;
      return netId ? resolveNode(netId) : "0"; // 未连接默认接地（占位）
    });

    // 按引脚名解析节点（用于运放这类需要特定端口顺序的器件）。
    const nodeOfPin = (pinName: string): string => {
      const pin = comp.pins.find((p) => p.name === pinName);
      const netId = pin?.node ? nodeToNet.get(pin.node) : undefined;
      return netId ? resolveNode(netId) : "0";
    };

    let line: string;
    if (comp.kind === "power") {
      // 理想直流源：V<name> <+> <-> <value>
      line = `${prefix}${comp.refdes} ${nodes[0] ?? "0"} ${nodes[1] ?? "0"} ${spiceValue(comp.value, comp.unit)}`;
    } else if (comp.kind === "vsine") {
      // 正弦电压源：V<name> <+> <-> SIN(dc ac freq 0 0 phase)
      const p = comp.params ?? {};
      const dc = p.dc ?? "0";
      const ac = p.ac ?? "0.2";
      const freq = p.freq ?? "1k";
      const phase = p.phase ?? "0";
      line = `${prefix}${comp.refdes} ${nodes[0] ?? "0"} ${nodes[1] ?? "0"} DC ${dc} AC ${ac} SIN(${dc} ${ac} ${freq} 0 0 ${phase})`;
    } else if (comp.kind === "voltmeter") {
      // 电压表：10000MΩ 采样电阻，后端读两端节点电压差
      line = `${prefix}${comp.refdes} ${nodes[0] ?? "0"} ${nodes[1] ?? "0"} 10000Meg`;
    } else if (comp.kind === "audio") {
      // 音频输入：Mock 无真实 PWL 数据，仅占位
      line = `* audio ${comp.refdes}: PWL（Mock 无真实音频数据）`;
    } else if (comp.kind === "ammeter") {
      // 电流表：0V 电压源作为电流探针，后端读 i(v<refdes>)
      line = `${prefix}${comp.refdes} ${nodes[0] ?? "0"} ${nodes[1] ?? "0"} 0`;
    } else if (comp.kind === "oscilloscope") {
      // 示波器：不产生器件，仅记录探针节点，后端读 raw 波形
      line = `* probe ${comp.refdes}: V(${nodes[0] ?? "0"})`;
    } else if (comp.kind === "jumper" || comp.kind === "wire") {
      // 导线/跳线：近零电阻
      line = `${prefix}${comp.refdes} ${nodes[0] ?? "0"} ${nodes[1] ?? "0"} 0.001`;
    } else if (comp.kind === "opamp") {
      // 运放：X<name> <IN+> <IN-> <V+> <V-> <OUT> <subckt>（按引脚名映射 5 端口）
      line = `X${comp.refdes} ${nodeOfPin("IN+")} ${nodeOfPin("IN-")} ${nodeOfPin("V+")} ${nodeOfPin("V-")} ${nodeOfPin("OUT")} ${spiceModelName(comp)}`;
    } else if (comp.kind === "opamp2") {
      // 双运放：两个 OP07A 子电路，共用 V+/V-
      const vp = nodeOfPin("V+");
      const vm = nodeOfPin("V-");
      line = `X${comp.refdes}A ${nodeOfPin("INA+")} ${nodeOfPin("INA-")} ${vp} ${vm} ${nodeOfPin("OUTA")} OP07A\n` +
        `X${comp.refdes}B ${nodeOfPin("INB+")} ${nodeOfPin("INB-")} ${vp} ${vm} ${nodeOfPin("OUTB")} OP07A`;
    } else if (comp.kind === "potentiometer") {
      // 电位器：两个串联电阻 R<refdes>A（1-2，R1）、R<refdes>B（2-3，R2）
      // ngspice 不允许 0Ω：两端到底时用 0.001Ω 兜底
      const percent = Math.min(1, Math.max(0, Number(comp.params?.percent ?? "0.5") || 0));
      const total = parseOhms(comp.value, comp.unit);
      const r1 = formatOhms(Math.max(total * percent, 1e-3));
      const r2 = formatOhms(Math.max(total * (1 - percent), 1e-3));
      line = `R${comp.refdes}A ${nodeOfPin("1")} ${nodeOfPin("2")} ${r1}\n` +
        `R${comp.refdes}B ${nodeOfPin("2")} ${nodeOfPin("3")} ${r2}`;
    } else if (comp.kind === "diode" || comp.kind === "led") {
      // 二极管/LED：D<name> <阳极> <阴极> <模型名>
      line = `${prefix}${comp.refdes} ${nodes[0] ?? "0"} ${nodes[1] ?? "0"} ${spiceModelName(comp)}`;
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
  { kind: "potentiometer", label: "电位器", pins: pins(3) },
  { kind: "power", label: "电源/地", pins: pins(2) },
  { kind: "vsine", label: "正弦波发生器", pins: pins(2) },
  { kind: "voltmeter", label: "电压表", pins: pins(2) },
  { kind: "ammeter", label: "电流表", pins: pins(2) },
  { kind: "oscilloscope", label: "示波器", pins: pins(2) },
  { kind: "jumper", label: "跳线", pins: pins(2) },
  { kind: "wire", label: "导线", pins: pins(2) },
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

  async uploadAudio(): Promise<{ id: string; duration: number }> {
    throw new Error(t("mock.noUpload"));
  }

  async stopSimulation(): Promise<void> {
    // Mock 后端无真实仿真，无需处理
  }

  async fft(): Promise<{ x: number[]; y: number[] }> {
    throw new Error(t("mock.noFft"));
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
