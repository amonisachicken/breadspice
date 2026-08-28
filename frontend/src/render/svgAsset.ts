// SPDX-License-Identifier: GPL-3.0-only

/**
 * SVG 资产加载器。
 *
 * 资产放在 src/assets/ 下，通过 Vite 的 `?raw` 以字符串形式导入，
 * 再解析成可插入 DOM 的 SVG 元素。这样既保留了原始 SVG（含 viewBox、
 * 内部 transform 与样式），又允许在同一个 SVG 内追加覆盖层（孔位、元件）。
 */

/** 解析 SVG 字符串为 DOM 元素。 */
export function parseSvg(source: string): SVGSVGElement {
  const doc = new DOMParser().parseFromString(source, "image/svg+xml");
  const svg = doc.documentElement as unknown as SVGSVGElement;
  if (svg.tagName.toLowerCase() !== "svg") {
    throw new Error("SVG 解析失败：根元素不是 <svg>");
  }
  return svg;
}

/** 读取 SVG 的 viewBox。 */
export function readViewBox(svg: SVGSVGElement): { x: number; y: number; width: number; height: number } {
  const vb = svg.viewBox?.baseVal;
  if (vb && vb.width > 0 && vb.height > 0) {
    return { x: vb.x, y: vb.y, width: vb.width, height: vb.height };
  }
  // 回退：用元素自身宽高
  return { x: 0, y: 0, width: svg.width?.baseVal?.value ?? 0, height: svg.height?.baseVal?.value ?? 0 };
}

/** 把浏览器客户区坐标（clientX/Y）换算到某个 SVG 的 viewBox 坐标系。 */
export function clientToViewBox(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  return pt.matrixTransform(ctm.inverse());
}

const SVG_NS = "http://www.w3.org/2000/svg";

/** 在 SVG 内创建（或复用）一个用于覆盖内容的 <g> 层。 */
export function ensureOverlayLayer(svg: SVGSVGElement, layerId: string): SVGGElement {
  let layer = svg.querySelector<SVGGElement>(`#${layerId}`);
  if (!layer) {
    layer = document.createElementNS(SVG_NS, "g") as SVGGElement;
    layer.setAttribute("id", layerId);
    svg.appendChild(layer);
  }
  return layer;
}

export { SVG_NS };
