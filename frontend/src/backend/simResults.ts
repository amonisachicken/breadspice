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

/** 从仿真结果取一个标量读数：op 字典优先，否则从曲线取最后一个点（瞬态末值/直流值）。 */
function scalarFrom(result: SimulationResult, key: string): number | null {
  if (result.op) {
    const v = result.op[key];
    if (v !== undefined) return v;
  }
  if (result.traces) {
    const t = result.traces.find((tr) => tr.name.toLowerCase() === key.toLowerCase());
    if (t && t.y.length > 0) return t.y[t.y.length - 1];
  }
  return null;
}

/** 电路里的接地网集合（每个 gnd 元件引脚所在的 net）。 */
export function groundNetIds(circuit: Circuit): Set<NetId> {
  const map = nodeToNetMap(circuit);
  const grounds = new Set<NetId>();
  for (const comp of circuit.components) {
    if (comp.kind === "gnd") {
      const pin = comp.pins[0];
      if (pin?.node) {
        const net = map.get(pin.node);
        if (net) grounds.add(net);
      }
    }
  }
  return grounds;
}

/** 某 net 的电压：接地网为 0，否则从 op/traces 查节点电压。 */
function nodeVoltage(
  result: SimulationResult,
  netId: NetId,
  grounds: Set<NetId>,
): number | null {
  if (grounds.has(netId)) return 0;
  return scalarFrom(result, voltageKey(netId));
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
    const grounds = groundNetIds(circuit);
    const vp = nodeVoltage(result, plus, grounds);
    const vm = nodeVoltage(result, minus, grounds);
    if (vp === null || vm === null) return null;
    return vp - vm;
  }
  if (ins.kind === "ammeter") {
    // 电流表是 0V 电压源电流探针：器件名 = "V" + refdes（如 VA1），ngspice 键 i(va1)。
    const key = "i(v" + ins.refdes.toLowerCase() + ")";
    return scalarFrom(result, key);
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
