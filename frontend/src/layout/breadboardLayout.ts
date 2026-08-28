// SPDX-License-Identifier: GPL-3.0-only

/**
 * 面包板布局生成器 —— 与真实 SVG 资产（assets/breadboard.svg）对齐。
 *
 * 该 SVG 是一块“竖版”无焊面包板（可理解为标准 MB-102 旋转 90°）：
 * - 左右两侧各有一条纵向电源轨（红 +、蓝 -），每条轨内部纵向连通；
 * - 中间是端子排，被一条纵向凹槽分成左 5 列 / 右 5 列；
 * - 端子排的每一“横排”在左组（或右组）内部横向连通 5 个孔。
 *
 * 因此电气模型为：
 * - 电源轨：4 条 net（左+ / 左- / 右+ / 右-）；
 * - 端子排：30 行 × 2 组 = 60 条 net，每条 5 孔。
 *
 * 坐标说明：节点坐标统一输出到 SVG viewBox 坐标系（已应用 SVG 内部的
 * scale(0.48)），这样渲染层可以直接在同一 viewBox 里叠加命中区。
 */

import type {
  BreadboardLayout,
  BreadboardNode,
  Net,
  NetId,
  NodeId,
} from "../types/domain";

/** 面包板 SVG 资产与 viewBox 元数据。 */
export const BREADBOARD_ASSET = {
  url: "breadboard.svg",
  viewBox: { x: 0, y: 0, width: 1096, height: 793.33331 },
  /** SVG 内部对几何元素施加的统一缩放。 */
  scale: 0.48,
} as const;

/** 几何常量（SVG 元素自身的“局部”坐标，即未乘以 scale 的值）。 */
const LOCAL = {
  terminal: {
    /** 左组 5 列孔位 x 坐标。 */
    leftColumnX: [815, 835, 855, 875, 895],
    /** 右组 5 列孔位 x 坐标。 */
    rightColumnX: [955, 975, 995, 1015, 1035],
    /** 左组列字母（对应标准板 A–E 行，旋转后变成列）。 */
    leftLetters: ["a", "b", "c", "d", "e"],
    /** 右组列字母（对应标准板 F–J 行）。 */
    rightLetters: ["f", "g", "h", "i", "j"],
    originY: 478.5,
    rowPitch: 20,
    rows: 30,
  },
  rail: {
    leftPlusX: 735,
    leftMinusX: 755,
    rightPlusX: 1095,
    rightMinusX: 1115,
    /**
     * 电源轨的 25 个孔位 y 坐标（局部坐标）。与 SVG 逐孔对齐：
     * 每 5 孔一组、跳过 1 行（对应标准板电源轨与端子排列不完全对齐）。
     */
    rowYs: [
      498.5, 518.5, 538.5, 558.5, 578.5,
      618.5, 638.5, 658.5, 678.5, 698.5,
      738.5, 758.5, 778.5, 798.5, 818.5,
      858.5, 878.5, 898.5, 918.5, 938.5,
      978.5, 998.5, 1018.5, 1038.5, 1058.5,
    ],
  },
  /** 孔位外接矩形（局部坐标）：宽 11、高 7.5，用于求孔心。 */
  hole: { w: 11, h: 7.5 },
} as const;

/** 局部坐标 -> viewBox 坐标。 */
const s = BREADBOARD_ASSET.scale;
const toView = (lx: number, ly: number) => ({ x: (lx + LOCAL.hole.w / 2) * s, y: (ly + LOCAL.hole.h / 2) * s });

/**
 * 生成与真实面包板 SVG 对齐的布局。
 */
export function createBreadboardLayout(): BreadboardLayout {
  const nodes: BreadboardNode[] = [];
  const nets: Net[] = [];
  const netIndex = new Map<NetId, Net>();

  const addNode = (
    id: NodeId,
    netId: NetId,
    row: string,
    column: number,
    lx: number,
    ly: number,
  ): void => {
    const { x, y } = toView(lx, ly);
    nodes.push({ id, netId, row, column, x, y });
    let net = netIndex.get(netId);
    if (!net) {
      net = { id: netId, nodeIds: [] };
      netIndex.set(netId, net);
      nets.push(net);
    }
    net.nodeIds.push(id);
  };

  // —— 端子排 ——
  const t = LOCAL.terminal;
  for (let r = 1; r <= t.rows; r++) {
    const ly = t.originY + (r - 1) * t.rowPitch;

    // 左组（5 列，横向连通成一条 net）
    const leftNet: NetId = `t${r}L`;
    t.leftColumnX.forEach((lx, i) => {
      addNode(`t${r}${t.leftLetters[i]}`, leftNet, t.leftLetters[i], r, lx, ly);
    });

    // 右组（5 列，横向连通成一条 net）
    const rightNet: NetId = `t${r}R`;
    t.rightColumnX.forEach((lx, i) => {
      addNode(`t${r}${t.rightLetters[i]}`, rightNet, t.rightLetters[i], r, lx, ly);
    });
  }

  // —— 电源轨（纵向，每列一条 net；孔位按 SVG 逐孔对齐）——
  const rail = LOCAL.rail;
  const railDefs = [
    { net: "rail_Lp", row: "+", x: rail.leftPlusX },
    { net: "rail_Lm", row: "-", x: rail.leftMinusX },
    { net: "rail_Rp", row: "+", x: rail.rightPlusX },
    { net: "rail_Rm", row: "-", x: rail.rightMinusX },
  ] as const;
  for (const def of railDefs) {
    rail.rowYs.forEach((ly, i) => {
      addNode(`${def.net}_${i + 1}`, def.net, def.row, i + 1, def.x, ly);
    });
  }

  return {
    id: "mb102-rotated",
    name: "面包板（SVG 资产）",
    nodes,
    nets,
  };
}
