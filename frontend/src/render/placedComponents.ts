// SPDX-License-Identifier: GPL-3.0-only

/**
 * 已放置元件渲染 —— 渲染刚性身体 + 橡皮筋引线 + 引脚/旋转手柄。
 *
 * 结构：每个元件是一个“无 transform 的包装 <g>”，内部再放
 * - 身体 <g transform="translate rotate">（只含身体符号，用局部坐标）
 * - 引线 / 引脚手柄 / 旋转手柄 / 标注（用**绝对坐标**，与身体平级）
 * 这样引线与手柄不会被子级 transform 二次变换。
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

function makeCircle(cx: number, cy: number, r: number, fill: string): SVGCircleElement {
  const c = document.createElementNS(SVG_NS, "circle") as SVGCircleElement;
  c.setAttribute("cx", cx.toFixed(2));
  c.setAttribute("cy", cy.toFixed(2));
  c.setAttribute("r", r.toFixed(2));
  c.setAttribute("fill", fill);
  return c;
}

/** 渲染导线：直导线为直线，弯导线为二次贝塞尔曲线 + 蓝点控制柄。 */
function renderWire(
  wrapper: SVGGElement,
  ins: ComponentInstance,
  selected: boolean,
  curve: boolean,
): void {
  const e0 = ins.pins[0];
  const e1 = ins.pins[1];
  if (!e0 || !e1) return;
  const color = ins.color ?? "#2563eb";

  if (curve) {
    const c = ins.control ?? { x: (e0.x + e1.x) / 2, y: (e0.y + e1.y) / 2 };

    // 控制点到两端点的辅助虚线（帮助理解曲率）
    for (const p of [e0, e1]) {
      const guide = document.createElementNS(SVG_NS, "line") as SVGLineElement;
      guide.setAttribute("x1", p.x.toFixed(2));
      guide.setAttribute("y1", p.y.toFixed(2));
      guide.setAttribute("x2", c.x.toFixed(2));
      guide.setAttribute("y2", c.y.toFixed(2));
      guide.setAttribute("stroke", "#cbd5e1");
      guide.setAttribute("stroke-width", "0.8");
      guide.setAttribute("stroke-dasharray", "2 2");
      guide.setAttribute("pointer-events", "none");
      wrapper.appendChild(guide);
    }

    const path = document.createElementNS(SVG_NS, "path") as SVGPathElement;
    path.setAttribute("d", `M ${e0.x.toFixed(2)} ${e0.y.toFixed(2)} Q ${c.x.toFixed(2)} ${c.y.toFixed(2)} ${e1.x.toFixed(2)} ${e1.y.toFixed(2)}`);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", color);
    path.setAttribute("stroke-width", "1.6");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("pointer-events", "stroke");
    path.style.cursor = "pointer";
    wrapper.appendChild(path);

    // 控制点手柄（蓝点）
    const ch = makeCircle(c.x, c.y, 3, "#2563eb");
    ch.setAttribute("stroke", "#fff");
    ch.setAttribute("stroke-width", "0.7");
    ch.dataset.componentId = ins.id;
    ch.dataset.wireControl = "1";
    ch.style.cursor = "crosshair";
    wrapper.appendChild(ch);
  } else {
    const line = document.createElementNS(SVG_NS, "line") as SVGLineElement;
    line.setAttribute("x1", e0.x.toFixed(2));
    line.setAttribute("y1", e0.y.toFixed(2));
    line.setAttribute("x2", e1.x.toFixed(2));
    line.setAttribute("y2", e1.y.toFixed(2));
    line.setAttribute("stroke", color);
    line.setAttribute("stroke-width", "1.6");
    line.setAttribute("stroke-linecap", "round");
    line.setAttribute("pointer-events", "stroke");
    line.style.cursor = "pointer";
    wrapper.appendChild(line);
  }

  // 端点手柄（绿）
  [e0, e1].forEach((p, i) => {
    const h = makeCircle(p.x, p.y, 2.6, "rgba(34,197,94,0.9)");
    h.setAttribute("stroke", "#fff");
    h.setAttribute("stroke-width", "0.6");
    h.dataset.componentId = ins.id;
    h.dataset.wireEndpoint = String(i);
    h.style.cursor = "crosshair";
    wrapper.appendChild(h);
  });

  const midX = (e0.x + e1.x) / 2;
  const midY = (e0.y + e1.y) / 2;

  if (selected) {
    const ring = makeCircle(midX, midY, 6, "none");
    ring.setAttribute("stroke", "#2563eb");
    ring.setAttribute("stroke-width", "1");
    ring.setAttribute("stroke-dasharray", "2 2");
    ring.setAttribute("pointer-events", "none");
    wrapper.appendChild(ring);
  }

  const label = document.createElementNS(SVG_NS, "text") as SVGTextElement;
  label.setAttribute("x", midX.toFixed(2));
  label.setAttribute("y", (midY - 8).toFixed(2));
  label.setAttribute("font-size", "6");
  label.setAttribute("text-anchor", "middle");
  label.setAttribute("fill", selected ? "#b91c1c" : "#4b5563");
  label.setAttribute("pointer-events", "none");
  label.textContent = ins.refdes;
  wrapper.appendChild(label);
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

    const wrapper = document.createElementNS(SVG_NS, "g") as SVGGElement;
    wrapper.dataset.componentId = ins.id;

    // 导线：走专用渲染（直导线=直线，弯导线=贝塞尔曲线）
    if (ins.kind === "wire") {
      renderWire(wrapper, ins, selected, Boolean(built.entry.curve));
      layer.appendChild(wrapper);
      continue;
    }

    // 身体（局部坐标，由 translate/rotate 定位）
    const body = document.createElementNS(SVG_NS, "g") as SVGGElement;
    body.setAttribute("transform", `translate(${ins.x} ${ins.y}) rotate(${ins.rotation})`);
    body.style.cursor = "grab";
    body.appendChild(built.template.cloneNode(true));
    wrapper.appendChild(body);

    // 电阻/电容/电池：在身体上显示「数值 + 单位」
    if (ins.kind === "resistor" || ins.kind === "capacitor" || ins.kind === "power") {
      const valueText = document.createElementNS(SVG_NS, "text") as SVGTextElement;
      valueText.setAttribute("x", "0");
      valueText.setAttribute("y", ins.kind === "power" ? "1" : "2");
      valueText.setAttribute("font-size", "4.6");
      valueText.setAttribute("text-anchor", "middle");
      valueText.setAttribute("fill", "#111827");
      valueText.setAttribute("pointer-events", "none");
      valueText.textContent = `${ins.value}${ins.unit ?? ""}`;
      body.appendChild(valueText);
    }

    // 引线 + 引脚手柄（绝对坐标，与身体平级）
    for (let i = 0; i < built.entry.terminals.length; i++) {
      const term = built.entry.terminals[i];
      const pin = ins.pins[i];
      if (term.length === 0) continue; // 刚性引脚元件（IC）不画引线/手柄

      const t = rotateOffset(term.x, term.y, ins.rotation);
      const from = { x: ins.x + t.x, y: ins.y + t.y };

      const toNode = pin?.node ? nodeById.get(pin.node) : undefined;
      const to = toNode
        ? { x: toNode.x, y: toNode.y }
        : {
            x: from.x + rotateOffset(term.dx * term.length, term.dy * term.length, ins.rotation).x,
            y: from.y + rotateOffset(term.dx * term.length, term.dy * term.length, ins.rotation).y,
          };

      const lead = document.createElementNS(SVG_NS, "line") as SVGLineElement;
      lead.setAttribute("x1", from.x.toFixed(2));
      lead.setAttribute("y1", from.y.toFixed(2));
      lead.setAttribute("x2", to.x.toFixed(2));
      lead.setAttribute("y2", to.y.toFixed(2));
      lead.setAttribute("stroke", "#9aa0a6");
      lead.setAttribute("stroke-width", "1.2");
      lead.setAttribute("pointer-events", "none");
      wrapper.appendChild(lead);

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
      wrapper.appendChild(handle);

      // 引脚名标注：沿引线方向外移（离开身体）+ 垂直方向错开（避开引线本身）
      const along = 5;
      const perp = 4;
      const isVertical = term.dx === 0;
      const px = isVertical ? perp : term.dx * along;
      const py = isVertical ? term.dy * along : -perp;
      const namePos = rotateOffset(term.x + px, term.y + py, ins.rotation);
      const pinLabel = document.createElementNS(SVG_NS, "text") as SVGTextElement;
      pinLabel.setAttribute("x", (ins.x + namePos.x).toFixed(2));
      pinLabel.setAttribute("y", (ins.y + namePos.y).toFixed(2));
      pinLabel.setAttribute("font-size", "4.2");
      pinLabel.setAttribute("text-anchor", "middle");
      pinLabel.setAttribute("fill", "#6b7280");
      pinLabel.setAttribute("pointer-events", "none");
      pinLabel.textContent = term.name;
      wrapper.appendChild(pinLabel);
    }

    // 选中：高亮圈 + 旋转手柄
    if (selected) {
      const ring = document.createElementNS(SVG_NS, "circle") as SVGCircleElement;
      ring.setAttribute("cx", ins.x.toFixed(2));
      ring.setAttribute("cy", ins.y.toFixed(2));
      ring.setAttribute("r", "5");
      ring.setAttribute("fill", "none");
      ring.setAttribute("stroke", "#2563eb");
      ring.setAttribute("stroke-width", "1");
      ring.setAttribute("stroke-dasharray", "2 2");
      ring.setAttribute("pointer-events", "none");
      wrapper.appendChild(ring);

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
      wrapper.appendChild(rotHandle);
    }

    // 引用名标注
    const label = document.createElementNS(SVG_NS, "text") as SVGTextElement;
    label.setAttribute("x", ins.x.toFixed(2));
    label.setAttribute("y", (ins.y - 8).toFixed(2));
    label.setAttribute("font-size", "6");
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("fill", selected ? "#b91c1c" : "#4b5563");
    label.setAttribute("pointer-events", "none");
    label.textContent = ins.refdes;
    wrapper.appendChild(label);

    layer.appendChild(wrapper);
  }
}
