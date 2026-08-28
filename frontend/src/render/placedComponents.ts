// SPDX-License-Identifier: GPL-3.0-only

/**
 * 已放置元件渲染 —— 渲染刚性身体 + 橡皮筋引线 + 引脚/旋转手柄。
 * 交互由 main.ts 里的“事件委托”统一处理，这里只负责绘制与数据属性标注。
 */

import { SVG_NS } from "./svgAsset";
import { rotateOffset } from "../interaction/placement";
import type { BreadboardLayout, ComponentInstance } from "../types/domain";
import type { BuiltSymbol } from "../components/catalog";
import type { PlacedItem } from "../store/circuitStore";

const PLACED_LAYER_ID = "placed-components";

export interface PlacedRenderContext {
  svg: SVGSVGElement;
  layout: BreadboardLayout;
  symbols: Map<string, BuiltSymbol>;
  selectedId: string | null;
}

/** 计算某个引脚引线的默认端点（无 node 时的回退位置）。 */
function defaultEnd(
  ins: ComponentInstance,
  terminal: { x: number; y: number; dx: number; dy: number; length: number },
): { x: number; y: number } {
  const t = rotateOffset(terminal.x, terminal.y, ins.rotation);
  const lead = rotateOffset(terminal.dx * terminal.length, terminal.dy * terminal.length, ins.rotation);
  return { x: ins.x + t.x + lead.x, y: ins.y + t.y + lead.y };
}

export function renderPlacedComponents(
  ctx: PlacedRenderContext,
  items: PlacedItem[],
): void {
  let layer = ctx.svg.querySelector<SVGGElement>(`#${PLACED_LAYER_ID}`);
  if (!layer) {
    layer = document.createElementNS(SVG_NS, "g") as SVGGElement;
    layer.setAttribute("id", PLACED_LAYER_ID);
    ctx.svg.appendChild(layer);
  }
  layer.replaceChildren();

  const nodeById = new Map(ctx.layout.nodes.map((n) => [n.id, n]));

  for (const item of items) {
    const built = ctx.symbols.get(item.symbolId);
    if (!built) continue;
    const ins = item.instance;
    const selected = ins.id === ctx.selectedId;

    const body = document.createElementNS(SVG_NS, "g") as SVGGElement;
    body.setAttribute("transform", `translate(${ins.x} ${ins.y}) rotate(${ins.rotation})`);
    body.dataset.componentId = ins.id;
    body.style.cursor = "pointer";
    body.appendChild(built.template.cloneNode(true));

    // 引线 + 引脚手柄
    for (let i = 0; i < built.entry.terminals.length; i++) {
      const term = built.entry.terminals[i];
      const pin = ins.pins[i];
      const t = rotateOffset(term.x, term.y, ins.rotation);
      const from = { x: ins.x + t.x, y: ins.y + t.y };

      const toNode = pin?.node ? nodeById.get(pin.node) : undefined;
      const to = toNode ? { x: toNode.x, y: toNode.y } : defaultEnd(ins, term);

      const lead = document.createElementNS(SVG_NS, "line") as SVGLineElement;
      lead.setAttribute("x1", from.x.toFixed(2));
      lead.setAttribute("y1", from.y.toFixed(2));
      lead.setAttribute("x2", to.x.toFixed(2));
      lead.setAttribute("y2", to.y.toFixed(2));
      lead.setAttribute("stroke", "#9aa0a6");
      lead.setAttribute("stroke-width", "1.2");
      lead.setAttribute("pointer-events", "none");
      body.appendChild(lead);

      const handle = document.createElementNS(SVG_NS, "circle") as SVGCircleElement;
      handle.setAttribute("cx", to.x.toFixed(2));
      handle.setAttribute("cy", to.y.toFixed(2));
      handle.setAttribute("r", "2.6");
      handle.setAttribute("fill", pin?.node ? "rgba(34,197,94,0.9)" : "rgba(234,88,12,0.9)");
      handle.setAttribute("stroke", "#fff");
      handle.setAttribute("stroke-width", "0.6");
      handle.dataset.componentId = ins.id;
      handle.dataset.pinIndex = String(i);
      handle.style.cursor = "crosshair";
      body.appendChild(handle);
    }

    // 选中：高亮 + 旋转手柄
    if (selected) {
      const ring = document.createElementNS(SVG_NS, "circle") as SVGCircleElement;
      ring.setAttribute("r", "5");
      ring.setAttribute("fill", "none");
      ring.setAttribute("stroke", "#2563eb");
      ring.setAttribute("stroke-width", "1");
      ring.setAttribute("stroke-dasharray", "2 2");
      ring.setAttribute("pointer-events", "none");
      body.appendChild(ring);

      const rotHandle = document.createElementNS(SVG_NS, "circle") as SVGCircleElement;
      rotHandle.setAttribute("cx", ins.x.toFixed(2));
      rotHandle.setAttribute("cy", (ins.y - 24).toFixed(2));
      rotHandle.setAttribute("r", "4");
      rotHandle.setAttribute("fill", "#2563eb");
      rotHandle.setAttribute("stroke", "#fff");
      rotHandle.setAttribute("stroke-width", "0.8");
      rotHandle.dataset.componentId = ins.id;
      rotHandle.dataset.rotate = "1";
      rotHandle.style.cursor = "grab";
      body.appendChild(rotHandle);
    }

    // 引用名标注
    const label = document.createElementNS(SVG_NS, "text") as SVGTextElement;
    label.setAttribute("x", "0");
    label.setAttribute("y", "-6");
    label.setAttribute("font-size", "6");
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("fill", selected ? "#b91c1c" : "#4b5563");
    label.setAttribute("pointer-events", "none");
    label.textContent = ins.refdes;
    body.appendChild(label);

    layer.appendChild(body);
  }
}
