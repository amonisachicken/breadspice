// SPDX-License-Identifier: GPL-3.0-only

/**
 * 仿真结果 -> 前端仪表/示波器读数的映射工具。
 *
 * 后端网表把「孔位 -> net -> SPICE 节点」映射为 `n_<netid>`（与
 * `backend/src/netlist.rs` 的 `node_name` 一致）；ngspice 在 rawfile 里会把
 * 节点/器件名统一小写，因此这里查找 op/trace 键时也要小写。
 */

import type { Circuit, ComponentInstance, NetId, NodeId } from "../types/domain";
import type { SimulationResult, Trace } from "../types/protocol";

/** net id -> SPICE 节点名（`n_` 前缀 + 非法字符替换）。 */
export function spiceNodeName(netId: string): string {
  return "n_" + netId.replace(/[^A-Za-z0-9_]/g, "_");
}

/** node id -> net id 索引。 */
export function nodeToNetMap(circuit: Circuit): Map<NodeId, NetId> {
  const map = new Map<NodeId, NetId>();
  for (const net of circuit.breadboard.nets) {
    for (const id of net.nodeIds) map.set(id, net.id);
  }
  return map;
}

/** 引脚名 -> 该引脚所连 net id（未连接返回 undefined）。 */
export function pinNetId(
  circuit: Circuit,
  ins: ComponentInstance,
  pinName: string,
): NetId | undefined {
  const pin = ins.pins.find((p) => p.name === pinName);
  if (!pin?.node) return undefined;
  return nodeToNetMap(circuit).get(pin.node);
}

/** net id -> ngspice 电压键（如 `v(n_t1l)`，已小写）。 */
export function voltageKey(netId: string): string {
  return "v(" + spiceNodeName(netId).toLowerCase() + ")";
}

/** 仪表读数：电压表 -> 两端电压差；电流表 -> 流经自身的电流。 */
export function meterReading(
  circuit: Circuit,
  ins: ComponentInstance,
  result: SimulationResult,
): number | null {
  if (ins.kind === "voltmeter") {
    const plus = pinNetId(circuit, ins, "+");
    const minus = pinNetId(circuit, ins, "−");
    if (plus === undefined || minus === undefined) return null;
    const vp = result.op?.[voltageKey(plus)];
    const vm = result.op?.[voltageKey(minus)];
    if (vp === undefined || vm === undefined) return null;
    return vp - vm;
  }
  if (ins.kind === "ammeter") {
    // 电流表映射为小电阻采样：器件名 = "R" + refdes（如 RA1），ngspice 键 i(ra1)。
    const key = "i(r" + ins.refdes.toLowerCase() + ")";
    return result.op?.[key] ?? null;
  }
  return null;
}

/** 示波器探针波形：tran 结果里与探针（tip）net 对应的曲线。 */
export function scopeTrace(
  circuit: Circuit,
  ins: ComponentInstance,
  result: SimulationResult,
): Trace | null {
  const tip = pinNetId(circuit, ins, "tip");
  if (tip === undefined || !result.traces) return null;
  const key = voltageKey(tip);
  return result.traces.find((t) => t.name.toLowerCase() === key) ?? null;
}

/** 数字格式化（过大/过小用科学计数法，其余保留 4 位有效数字）。 */
export function formatNum(v: number): string {
  if (!Number.isFinite(v)) return String(v);
  if (Math.abs(v) < 1e-9) return "0";
  const a = Math.abs(v);
  if (a >= 1e6 || a < 1e-3) return v.toExponential(3);
  return String(Number(v.toPrecision(4)));
}
