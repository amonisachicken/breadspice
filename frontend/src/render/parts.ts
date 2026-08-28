/**
 * 元件面板 —— 从 parts.svg 构建元件符号，渲染成可拖拽的面板项。
 */

import partsSvgSource from "../assets/parts.svg?raw";
import { CATALOG, buildSymbols, type BuiltSymbol } from "../components/catalog";
import { startComponentDrag, type DragContext } from "../interaction/drag";
import { SVG_NS, parseSvg } from "./svgAsset";

/** 加载并构建所有元件符号（key = 目录 id）。 */
export function loadComponentSymbols(): Map<string, BuiltSymbol> {
  const partsSvg = parseSvg(partsSvgSource);
  return buildSymbols(partsSvg);
}

/** 测量一个（已归一化）符号的包围盒，用于面板缩放适配。 */
function measureBBox(el: SVGGraphicsElement): { x: number; y: number; width: number; height: number } {
  const host = document.createElementNS(SVG_NS, "svg");
  host.style.position = "absolute";
  host.style.visibility = "hidden";
  host.setAttribute("width", "0");
  host.setAttribute("height", "0");
  host.appendChild(el);
  document.body.appendChild(host);
  const bbox = el.getBBox();
  document.body.removeChild(host);
  return bbox;
}

/** 渲染元件面板到指定容器。 */
export function renderComponentPalette(
  container: HTMLElement,
  symbols: Map<string, BuiltSymbol>,
  dragCtx: DragContext,
): void {
  container.replaceChildren();

  for (const entry of CATALOG) {
    const built = symbols.get(entry.id);
    if (!built) continue;

    const item = document.createElement("div");
    item.className = "palette-item";
    item.title = "拖拽到面包板放置（拖拽中按 R 旋转）";

    const svg = document.createElementNS(SVG_NS, "svg") as SVGSVGElement;
    const bbox = measureBBox(built.template);
    const pad = 3;
    svg.setAttribute(
      "viewBox",
      `${bbox.x - pad} ${bbox.y - pad} ${bbox.width + pad * 2} ${bbox.height + pad * 2}`,
    );
    svg.appendChild(built.template.cloneNode(true));
    item.appendChild(svg);

    const label = document.createElement("span");
    label.textContent = entry.label;
    item.appendChild(label);

    item.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      startComponentDrag(dragCtx, entry, e.clientX, e.clientY);
    });

    container.appendChild(item);
  }
}
