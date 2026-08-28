// SPDX-License-Identifier: GPL-3.0-only

/**
 * 已放置元件渲染 —— 在面包板 SVG 上叠加放置的元件符号与引用名标注。
 */

import { SVG_NS } from "./svgAsset";
import type { BreadboardLayout } from "../types/domain";
import type { BuiltSymbol } from "../components/catalog";
import type { PlacedItem } from "../store/circuitStore";

const PLACED_LAYER_ID = "placed-components";

export interface PlacedRenderContext {
  svg: SVGSVGElement;
  layout: BreadboardLayout;
  symbols: Map<string, BuiltSymbol>;
  selectedId: string | null;
}

export function renderPlacedComponents(
  ctx: PlacedRenderContext,
  items: PlacedItem[],
  onSelect: (id: string | null) => void,
): void {
  let layer = ctx.svg.querySelector<SVGGElement>(`#${PLACED_LAYER_ID}`);
  if (!layer) {
    layer = document.createElementNS(SVG_NS, "g") as SVGGElement;
    layer.setAttribute("id", PLACED_LAYER_ID);
    ctx.svg.appendChild(layer);
  }
  layer.replaceChildren();

  for (const item of items) {
    const symbol = ctx.symbols.get(item.symbolId);
    const anchor = ctx.layout.nodes.find((n) => n.id === item.instance.anchorNode);
    if (!symbol || !anchor) continue;

    const selected = item.instance.id === ctx.selectedId;

    const g = document.createElementNS(SVG_NS, "g") as SVGGElement;
    g.setAttribute("transform", `translate(${anchor.x} ${anchor.y}) rotate(${item.instance.rotation})`);
    g.dataset.componentId = item.instance.id;
    g.style.cursor = "pointer";
    g.addEventListener("click", (e) => {
      e.stopPropagation();
      onSelect(item.instance.id);
    });

    // 选中高亮：锚点处画一圈虚线。
    if (selected) {
      const ring = document.createElementNS(SVG_NS, "circle") as SVGCircleElement;
      ring.setAttribute("r", "5");
      ring.setAttribute("fill", "none");
      ring.setAttribute("stroke", "#2563eb");
      ring.setAttribute("stroke-width", "1");
      ring.setAttribute("stroke-dasharray", "2 2");
      ring.setAttribute("pointer-events", "none");
      g.appendChild(ring);
    }

    g.appendChild(symbol.template.cloneNode(true));

    // 引用名标注（置于符号上方）。
    const label = document.createElementNS(SVG_NS, "text") as SVGTextElement;
    label.setAttribute("x", "0");
    label.setAttribute("y", "-4");
    label.setAttribute("font-size", "7");
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("fill", selected ? "#b91c1c" : "#4b5563");
    label.setAttribute("pointer-events", "none");
    label.textContent = item.instance.refdes;
    g.appendChild(label);

    layer.appendChild(g);
  }
}
