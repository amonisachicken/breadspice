// SPDX-License-Identifier: GPL-3.0-only

/**
 * 应用入口 —— 虚拟面包板前端。
 * 面包板绘制 + 元件拖拽放置（橡皮筋引脚 / 自由旋转）+ 画布缩放 + 接口预留。
 */

import { getBackend } from "./backend";
import { renderBreadboard } from "./render/breadboard";
import { loadComponentSymbols, renderComponentPalette } from "./render/parts";
import { renderPlacedComponents } from "./render/placedComponents";
import {
  canRedo,
  canUndo,
  clearPlaced,
  commitUpdate,
  getPlaced,
  getPlacedItem,
  onHistoryChange,
  redo,
  removePlaced,
  subscribe,
  undo,
} from "./store/circuitStore";
import {
  downloadBread,
  getFilename,
  importBreadFile,
  initProject,
  saveProject,
  setFilename,
} from "./store/projectStore";
import {
  startBodyDrag,
  startPinDrag,
  startRotateDrag,
  startWireControlDrag,
  startWireEndpointDrag,
  type DragContext,
} from "./interaction/drag";
import { reSnapPins, rotateWire } from "./interaction/placement";
import type { Circuit } from "./types/domain";
import { formatNum, meterReading, scopeTrace } from "./backend/simResults";
import type { AnalysisKind, SimulationResult, Trace } from "./types/protocol";

import "./style.css";

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <header class="topbar">
    <h1>面包板仿真 <span>BreadSpice</span></h1>
    <div class="topbar__actions">
      <button id="simulate" type="button">▶️ 仿真</button>
      <button id="sim-options" type="button">仿真选项</button>
      <span class="topbar__sep"></span>
      <button id="preview" type="button" class="toggle">预览</button>
      <span class="topbar__sep"></span>
      <button id="undo" type="button" disabled>撤销</button>
      <button id="redo" type="button" disabled>重做</button>
      <button id="save" type="button">保存</button>
      <button id="download" type="button">下载</button>
      <button id="import" type="button">导入</button>
      <input id="filename" type="text" value="circuit" title="文件名（.bread）" />
      <span class="topbar__sep"></span>
      <label class="zoom">缩放
        <input id="zoom-slider" type="range" min="0.2" max="8" step="0.05" value="1" />
        <span id="zoom-label">100%</span>
      </label>
      <button id="zoom-fit" type="button">适应</button>
      <button id="toggle-holes" type="button">显示孔位</button>
      <button id="test-backend" type="button">生成网表</button>
      <button id="clear" type="button">清空电路</button>
      <input id="import-file" type="file" accept=".bread" hidden />
    </div>
  </header>
  <main class="layout">
    <section class="canvas" id="canvas" aria-label="面包板画布"></section>
    <aside class="palette">
      <h2>元件库</h2>
      <p class="palette__hint">拖入面包板；拖元件移动、拖蓝点旋转、拖绿点伸缩引脚，滚轮缩放，双击蓝点设置/查看属性</p>
      <div class="palette__list" id="palette-list"></div>
    </aside>
  </main>
  <footer class="statusbar" id="statusbar"></footer>
  <section class="netlist" id="netlist-panel" hidden>
    <header class="netlist__header">
      <span class="netlist__title">网表</span>
      <button id="netlist-collapse" type="button">收起</button>
    </header>
    <pre class="log" id="log"></pre>
  </section>
  <div class="modal" id="value-dialog" hidden>
    <div class="modal__box">
      <h3 id="value-dialog-title">设置数值</h3>
      <div class="modal__row">
        <input id="value-input" type="text" autocomplete="off" />
        <select id="unit-select"></select>
      </div>
      <div class="modal__actions">
        <button id="value-cancel" type="button">取消</button>
        <button id="value-ok" type="button">确定</button>
      </div>
    </div>
  </div>
  <div class="modal" id="info-dialog" hidden>
    <div class="modal__box">
      <h3 id="info-dialog-title">元件信息</h3>
      <pre class="modal__info" id="info-body"></pre>
      <div class="modal__actions">
        <button id="info-close" type="button">关闭</button>
      </div>
    </div>
  </div>
  <div class="modal" id="color-dialog" hidden>
    <div class="modal__box">
      <h3>导线颜色</h3>
      <div class="color-swatches" id="color-swatches"></div>
      <input type="color" id="color-input" value="#2563eb" />
      <div class="modal__actions">
        <button id="color-cancel" type="button">取消</button>
        <button id="color-ok" type="button">确定</button>
      </div>
    </div>
  </div>
  <div class="modal" id="sine-dialog" hidden>
    <div class="modal__box">
      <h3>正弦波发生器</h3>
      <div class="modal__field"><label>频率 (Hz)</label><input id="sine-freq" type="text" autocomplete="off" /></div>
      <div class="modal__field"><label>交流电压 (V)</label><input id="sine-ac" type="text" autocomplete="off" /></div>
      <div class="modal__field"><label>直流电压 (V)</label><input id="sine-dc" type="text" autocomplete="off" /></div>
      <div class="modal__field"><label>相位 (°)</label><input id="sine-phase" type="text" autocomplete="off" /></div>
      <div class="modal__actions">
        <button id="sine-cancel" type="button">取消</button>
        <button id="sine-ok" type="button">确定</button>
      </div>
    </div>
  </div>
  <div class="modal" id="meter-dialog" hidden>
    <div class="modal__box">
      <h3 id="meter-title">电压表</h3>
      <div class="meter-readout" id="meter-value">0.000 V</div>
      <p class="meter-hint" id="meter-hint">（未运行仿真）</p>
      <div class="modal__actions">
        <button id="meter-close" type="button">关闭</button>
      </div>
    </div>
  </div>
  <div class="modal" id="scope-dialog" hidden>
    <div class="modal__box modal__box--wide">
      <h3>示波器</h3>
      <div class="scope-screen">
        <svg id="scope-svg" viewBox="0 0 300 180" preserveAspectRatio="none">
          <rect width="300" height="180" fill="#0f172a" />
          <g stroke="#1e293b" stroke-width="0.5">
            <line x1="37.5" y1="0" x2="37.5" y2="180" />
            <line x1="75" y1="0" x2="75" y2="180" />
            <line x1="112.5" y1="0" x2="112.5" y2="180" />
            <line x1="187.5" y1="0" x2="187.5" y2="180" />
            <line x1="225" y1="0" x2="225" y2="180" />
            <line x1="262.5" y1="0" x2="262.5" y2="180" />
            <line x1="0" y1="22.5" x2="300" y2="22.5" />
            <line x1="0" y1="45" x2="300" y2="45" />
            <line x1="0" y1="67.5" x2="300" y2="67.5" />
            <line x1="0" y1="112.5" x2="300" y2="112.5" />
            <line x1="0" y1="135" x2="300" y2="135" />
            <line x1="0" y1="157.5" x2="300" y2="157.5" />
          </g>
          <line x1="150" y1="0" x2="150" y2="180" stroke="#334155" stroke-width="0.8" />
          <line x1="0" y1="90" x2="300" y2="90" stroke="#334155" stroke-width="0.8" />
          <polyline id="scope-trace" fill="none" stroke="#22c55e" stroke-width="1.5" points="" />
        </svg>
        <span class="scope-hint" id="scope-hint">等待仿真</span>
      </div>
      <div class="modal__actions">
        <button id="scope-close" type="button">关闭</button>
      </div>
    </div>
  </div>
  <div class="modal" id="sim-options-dialog" hidden>
    <div class="modal__box">
      <h3>仿真选项</h3>
      <div class="modal__field">
        <label>分析类型</label>
        <select id="sim-analysis">
          <option value="op">工作点（op）</option>
          <option value="dc">直流扫描（dc）</option>
          <option value="ac">交流分析（ac）</option>
          <option value="tran">瞬态分析（tran）</option>
        </select>
      </div>
      <div id="sim-dc-fields" hidden>
        <div class="modal__field"><label>扫描源（器件名）</label><input id="sim-dc-source" type="text" autocomplete="off" /></div>
        <div class="modal__field"><label>起始 (V)</label><input id="sim-dc-start" type="number" step="any" value="0" /></div>
        <div class="modal__field"><label>终止 (V)</label><input id="sim-dc-stop" type="number" step="any" value="9" /></div>
        <div class="modal__field"><label>步长 (V)</label><input id="sim-dc-step" type="number" step="any" value="1" /></div>
      </div>
      <div id="sim-ac-fields" hidden>
        <div class="modal__field"><label>扫描方式</label>
          <select id="sim-ac-type">
            <option value="dec">dec</option>
            <option value="oct">oct</option>
            <option value="lin">lin</option>
          </select>
        </div>
        <div class="modal__field"><label>点数</label><input id="sim-ac-points" type="number" value="10" /></div>
        <div class="modal__field"><label>起始 (Hz)</label><input id="sim-ac-start" type="number" step="any" value="10" /></div>
        <div class="modal__field"><label>终止 (Hz)</label><input id="sim-ac-stop" type="number" step="any" value="1000000" /></div>
      </div>
      <div id="sim-tran-fields" hidden>
        <div class="modal__field"><label>步长 (s)</label><input id="sim-tran-step" type="number" step="any" value="0.00001" /></div>
        <div class="modal__field"><label>终止 (s)</label><input id="sim-tran-stop" type="number" step="any" value="0.001" /></div>
      </div>
      <div class="modal__actions">
        <button id="sim-options-cancel" type="button">取消</button>
        <button id="sim-options-ok" type="button">确定</button>
      </div>
    </div>
  </div>
`;

const canvas = document.querySelector<HTMLElement>("#canvas")!;
const paletteList = document.querySelector<HTMLElement>("#palette-list")!;
const palette = document.querySelector<HTMLElement>(".palette")!;
const statusbar = document.querySelector<HTMLElement>("#statusbar")!;
const log = document.querySelector<HTMLPreElement>("#log")!;
const zoomSlider = document.querySelector<HTMLInputElement>("#zoom-slider")!;
const zoomLabel = document.querySelector<HTMLElement>("#zoom-label")!;

const undoBtn = document.querySelector<HTMLButtonElement>("#undo")!;
const redoBtn = document.querySelector<HTMLButtonElement>("#redo")!;
const saveBtn = document.querySelector<HTMLButtonElement>("#save")!;
const downloadBtn = document.querySelector<HTMLButtonElement>("#download")!;
const importBtn = document.querySelector<HTMLButtonElement>("#import")!;
const importFileInput = document.querySelector<HTMLInputElement>("#import-file")!;
const filenameInput = document.querySelector<HTMLInputElement>("#filename")!;
const netlistPanel = document.querySelector<HTMLElement>("#netlist-panel")!;
const netlistCollapseBtn = document.querySelector<HTMLButtonElement>("#netlist-collapse")!;
const previewBtn = document.querySelector<HTMLButtonElement>("#preview")!;
const clearBtn = document.querySelector<HTMLButtonElement>("#clear")!;

// —— 渲染面包板 ——
const board = renderBreadboard(canvas);
const { layout, svg, baseWidth, baseHeight } = board;

// —— 元件符号 + 面板 ——
const symbols = loadComponentSymbols();
const dragCtx: DragContext = { svg, layout, symbols };
renderComponentPalette(paletteList, symbols, dragCtx);

// —— 放置状态与选中 ——
let selectedId: string | null = null;
let previewMode = false;
// 双击检测（基于时间+屏幕位置，避免 DOM 重渲染导致原生 dblclick 失效）
let lastClick: { id: string; time: number; x: number; y: number } | null = null;

function render(): void {
  renderPlacedComponents({ svg, layout, symbols, selectedId, preview: previewMode }, getPlaced());
}

function updateHistoryButtons(): void {
  undoBtn.disabled = previewMode || !canUndo();
  redoBtn.disabled = previewMode || !canRedo();
}

/** 预览模式：禁用编辑类控件，仅保留视图缩放与网表生成。 */
function updatePreviewUI(): void {
  previewBtn.classList.toggle("active", previewMode);
  previewBtn.textContent = previewMode ? "退出预览" : "预览";
  clearBtn.disabled = previewMode;
  importBtn.disabled = previewMode;
  filenameInput.disabled = previewMode;
  canvas.classList.toggle("preview", previewMode);
  palette.classList.toggle("preview", previewMode);
  updateHistoryButtons();
}

// 后端单例（updateStatus 在 initProject 触发的首次 emit 中就会用到，需先初始化）
const backend = getBackend();

// —— 仿真状态 ——
let analysisKind: AnalysisKind = "op";
let simParams: Record<string, unknown> = {};
let lastSimResult: SimulationResult | null = null;
let lastSimCircuit: Circuit | null = null;

subscribe(() => {
  updateStatus();
  render();
});
onHistoryChange(updateHistoryButtons);
render();

// —— 恢复上次会话（.breadcache 优先，否则 .bread）——
initProject();
filenameInput.value = getFilename();
updatePreviewUI();

// —— 已放置元件交互 + 画布平移（事件委托，统一挂在 canvas 上）——
canvas.addEventListener("pointerdown", (e) => {
  const el = e.target as Element;

  // 预览模式：不选中、不拖放，仅允许平移视图
  if (previewMode) {
    startCanvasPan(e);
    return;
  }

  // 先做双击检测：同一元件、时间与位置足够接近即视为双击
  const compEl = el.closest?.("[data-component-id]");
  if (compEl) {
    const id = compEl.getAttribute("data-component-id")!;
    const now = Date.now();
    if (
      lastClick &&
      lastClick.id === id &&
      now - lastClick.time < 500 &&
      Math.hypot(e.clientX - lastClick.x, e.clientY - lastClick.y) < 10
    ) {
      lastClick = null;
      openComponentDialog(id);
      e.preventDefault();
      return;
    }
    lastClick = { id, time: now, x: e.clientX, y: e.clientY };
  } else {
    lastClick = null;
  }

  const rot = el.closest?.('[data-rotate="1"]');
  if (rot) {
    const id = rot.getAttribute("data-component-id")!;
    e.preventDefault();
    startRotateDrag(dragCtx, id, e.clientX, e.clientY);
    return;
  }

  const control = el.closest?.("[data-wire-control]");
  if (control) {
    const id = control.getAttribute("data-component-id")!;
    e.preventDefault();
    startWireControlDrag(dragCtx, id, e.clientX, e.clientY);
    return;
  }

  const wireEnd = el.closest?.("[data-wire-endpoint]");
  if (wireEnd) {
    const id = wireEnd.getAttribute("data-component-id")!;
    const idx = Number(wireEnd.getAttribute("data-wire-endpoint"));
    e.preventDefault();
    startWireEndpointDrag(dragCtx, id, idx, e.clientX, e.clientY);
    return;
  }

  const pin = el.closest?.("[data-pin-index]");
  if (pin) {
    const id = pin.getAttribute("data-component-id")!;
    const idx = Number(pin.getAttribute("data-pin-index"));
    e.preventDefault();
    startPinDrag(dragCtx, id, idx, e.clientX, e.clientY);
    return;
  }

  const body = el.closest?.("[data-component-id]");
  if (body) {
    const id = body.getAttribute("data-component-id")!;
    // 导线本体不可拖动，仅点击选中
    if (getPlacedItem(id)?.instance.kind === "wire") {
      e.preventDefault();
      selectedId = id;
      render();
      return;
    }
    e.preventDefault();
    startBodyDrag(dragCtx, id, e.clientX, e.clientY, (moved) => {
      if (!moved) {
        selectedId = id;
        render();
      }
    });
    return;
  }

  // 空白区域：拖拽平移画布，点击取消选中
  startCanvasPan(e);
});

function startCanvasPan(e: PointerEvent): void {
  const startX = e.clientX;
  const startY = e.clientY;
  const sl = canvas.scrollLeft;
  const st = canvas.scrollTop;
  let moved = false;

  const onMove = (ev: PointerEvent): void => {
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    if (Math.hypot(dx, dy) > 2) moved = true;
    canvas.scrollLeft = sl - dx;
    canvas.scrollTop = st - dy;
  };
  const onUp = (): void => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    if (!moved && selectedId) {
      selectedId = null;
      render();
    }
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
}

// —— 画布缩放 ——
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 8;
let zoom = 1;

function applyZoom(): void {
  svg.style.width = `${baseWidth * zoom}px`;
  svg.style.height = `${baseHeight * zoom}px`;
  zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
  zoomSlider.value = String(zoom);
}

function fitZoom(): void {
  const cw = Math.max(60, canvas.clientWidth - 32);
  const ch = Math.max(60, canvas.clientHeight - 32);
  zoom = Math.min(cw / baseWidth, ch / baseHeight);
  zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
  applyZoom();
}

fitZoom();

canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * factor));
    applyZoom();
  },
  { passive: false },
);

zoomSlider.addEventListener("input", () => {
  zoom = Number(zoomSlider.value);
  applyZoom();
});

document.querySelector<HTMLButtonElement>("#zoom-fit")!.addEventListener("click", fitZoom);

// Delete / Backspace 删除选中元件；R 旋转选中元件并重置引脚连接。
// 有对话框打开、或焦点在输入控件上时，不响应这些快捷键（避免在输入框按退格误删元件）。
function isModalOpen(): boolean {
  return document.querySelector(".modal:not([hidden])") !== null;
}

function isTypingTarget(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || el.isContentEditable;
}

window.addEventListener("keydown", (e) => {
  if (previewMode) return; // 预览模式下禁用删除/旋转快捷键
  if (isModalOpen() || isTypingTarget(e)) return;
  if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
    removePlaced(selectedId);
    selectedId = null;
    render();
    return;
  }
  if ((e.key === "r" || e.key === "R") && selectedId) {
    const item = getPlacedItem(selectedId);
    const entry = item ? symbols.get(item.symbolId)?.entry : undefined;
    if (item && entry && !entry.rigid) {
      commitUpdate(selectedId, (ins) => {
        if (ins.kind === "wire") {
          rotateWire(ins, layout);
        } else {
          ins.rotation = (ins.rotation + 90) % 360;
          reSnapPins(entry, ins, layout);
        }
      });
    }
  }
});

// —— 状态栏 ——
function updateStatus(): void {
  statusbar.textContent =
    `后端: ${backend.kind} · 已放置 ${getPlaced().length} 个元件 · ` +
    `孔位 ${layout.nodes.length} · 网 ${layout.nets.length}`;
}
updateStatus();

// —— 双击元件：设置数值+单位（电阻/电容/电池）、设置颜色（导线），或查看介绍（半导体/IC）——
const UNIT_SETS: Record<string, string[]> = {
  resistor: ["Ω", "kΩ", "MΩ"],
  capacitor: ["pF", "nF", "µF", "mF", "F"],
  power: ["V", "mV"],
};

const WIRE_COLOR_PRESETS = [
  "#dc2626", "#111827", "#2563eb", "#16a34a", "#eab308",
  "#f97316", "#a855f7", "#ffffff", "#9ca3af", "#78350f",
];

const valueDialog = document.querySelector<HTMLDivElement>("#value-dialog")!;
const valueInput = document.querySelector<HTMLInputElement>("#value-input")!;
const unitSelect = document.querySelector<HTMLSelectElement>("#unit-select")!;
let dialogTargetId: string | null = null;

const infoDialog = document.querySelector<HTMLDivElement>("#info-dialog")!;
const infoTitle = document.querySelector<HTMLElement>("#info-dialog-title")!;
const infoBody = document.querySelector<HTMLElement>("#info-body")!;

const colorDialog = document.querySelector<HTMLDivElement>("#color-dialog")!;
const colorInput = document.querySelector<HTMLInputElement>("#color-input")!;
const colorSwatches = document.querySelector<HTMLElement>("#color-swatches")!;
let colorTargetId: string | null = null;

const sineDialog = document.querySelector<HTMLDivElement>("#sine-dialog")!;
const sineFreq = document.querySelector<HTMLInputElement>("#sine-freq")!;
const sineAc = document.querySelector<HTMLInputElement>("#sine-ac")!;
const sineDc = document.querySelector<HTMLInputElement>("#sine-dc")!;
const sinePhase = document.querySelector<HTMLInputElement>("#sine-phase")!;
let sineTargetId: string | null = null;

const meterDialog = document.querySelector<HTMLDivElement>("#meter-dialog")!;
const meterTitle = document.querySelector<HTMLElement>("#meter-title")!;
const meterValue = document.querySelector<HTMLElement>("#meter-value")!;
const meterHint = document.querySelector<HTMLElement>("#meter-hint")!;

const scopeDialog = document.querySelector<HTMLDivElement>("#scope-dialog")!;
const scopeTraceEl = document.querySelector<SVGPolylineElement>("#scope-trace")!;
const scopeHint = document.querySelector<HTMLElement>("#scope-hint")!;

const simOptionsDialog = document.querySelector<HTMLDivElement>("#sim-options-dialog")!;
const simAnalysis = document.querySelector<HTMLSelectElement>("#sim-analysis")!;
const simDcFields = document.querySelector<HTMLElement>("#sim-dc-fields")!;
const simDcSource = document.querySelector<HTMLInputElement>("#sim-dc-source")!;
const simDcStart = document.querySelector<HTMLInputElement>("#sim-dc-start")!;
const simDcStop = document.querySelector<HTMLInputElement>("#sim-dc-stop")!;
const simDcStep = document.querySelector<HTMLInputElement>("#sim-dc-step")!;
const simAcFields = document.querySelector<HTMLElement>("#sim-ac-fields")!;
const simAcType = document.querySelector<HTMLSelectElement>("#sim-ac-type")!;
const simAcPoints = document.querySelector<HTMLInputElement>("#sim-ac-points")!;
const simAcStart = document.querySelector<HTMLInputElement>("#sim-ac-start")!;
const simAcStop = document.querySelector<HTMLInputElement>("#sim-ac-stop")!;
const simTranFields = document.querySelector<HTMLElement>("#sim-tran-fields")!;
const simTranStep = document.querySelector<HTMLInputElement>("#sim-tran-step")!;
const simTranStop = document.querySelector<HTMLInputElement>("#sim-tran-stop")!;

function openValueDialog(id: string, value: string, unit: string | undefined, units: string[]): void {
  dialogTargetId = id;
  valueInput.value = value;
  unitSelect.replaceChildren(
    ...units.map((u) => {
      const o = document.createElement("option");
      o.value = u;
      o.textContent = u;
      return o;
    }),
  );
  unitSelect.value = unit && units.includes(unit) ? unit : units[0];
  valueDialog.hidden = false;
  valueInput.focus();
  valueInput.select();
}

function closeValueDialog(): void {
  valueDialog.hidden = true;
  dialogTargetId = null;
}

function openInfoDialog(title: string, text: string): void {
  infoTitle.textContent = title;
  infoBody.textContent = text;
  infoDialog.hidden = false;
}

function closeInfoDialog(): void {
  infoDialog.hidden = true;
}

function openColorDialog(id: string, color: string | undefined): void {
  colorTargetId = id;
  colorInput.value = color ?? "#2563eb";
  renderColorSwatches(colorInput.value);
  colorDialog.hidden = false;
}

function closeColorDialog(): void {
  colorDialog.hidden = true;
  colorTargetId = null;
}

function renderColorSwatches(current: string): void {
  colorSwatches.replaceChildren();
  for (const c of WIRE_COLOR_PRESETS) {
    const s = document.createElement("button");
    s.type = "button";
    s.className = "color-swatch";
    s.style.background = c;
    if (c.toLowerCase() === current.toLowerCase()) s.classList.add("active");
    s.addEventListener("click", () => {
      colorInput.value = c;
      renderColorSwatches(c);
    });
    colorSwatches.appendChild(s);
  }
}

/** 双击某元件：分流到颜色 / 数值单位 / 正弦参数 / 仪表 / 示波器 / 介绍对话框。 */
function openComponentDialog(id: string): void {
  const item = getPlacedItem(id);
  if (!item) return;
  const entry = symbols.get(item.symbolId)?.entry;
  if (!entry) return;
  const ins = item.instance;
  if (ins.kind === "wire") {
    openColorDialog(id, ins.color);
    return;
  }
  if (ins.kind === "vsine") {
    openSineDialog(id, ins.params ?? {});
    return;
  }
  if (ins.kind === "voltmeter") {
    openMeterDialog(id, "电压表", "V");
    return;
  }
  if (ins.kind === "ammeter") {
    openMeterDialog(id, "电流表", "A");
    return;
  }
  if (ins.kind === "oscilloscope") {
    openScopeDialog(id);
    return;
  }
  const units = UNIT_SETS[ins.kind];
  if (units) {
    openValueDialog(id, ins.value, ins.unit, units);
  } else if (entry.info) {
    openInfoDialog(entry.label, entry.info);
  }
}

// —— 正弦波发生器参数对话框 ——
function openSineDialog(id: string, params: Record<string, string>): void {
  sineTargetId = id;
  sineFreq.value = params.freq ?? "1k";
  sineAc.value = params.ac ?? "1";
  sineDc.value = params.dc ?? "0";
  sinePhase.value = params.phase ?? "0";
  sineDialog.hidden = false;
  sineFreq.focus();
  sineFreq.select();
}

function closeSineDialog(): void {
  sineDialog.hidden = true;
  sineTargetId = null;
}

// —— 电压表 / 电流表读数对话框 ——
function openMeterDialog(id: string, title: string, unit: "V" | "A"): void {
  meterTitle.textContent = title;
  const reading = computeMeterReading(id);
  if (reading === null) {
    meterValue.textContent = unit === "V" ? "0.000 V" : "0.000 A";
    meterHint.textContent = "（未运行仿真，或仪表未连接）";
  } else {
    meterValue.textContent = `${reading} ${unit}`;
    meterHint.textContent = "（最近一次 op 仿真结果）";
  }
  meterDialog.hidden = false;
}

function computeMeterReading(id: string): string | null {
  if (!lastSimResult?.ok || !lastSimCircuit) return null;
  const ins = getPlacedItem(id)?.instance;
  if (!ins) return null;
  const v = meterReading(lastSimCircuit, ins, lastSimResult);
  return v === null ? null : formatNum(v);
}

function closeMeterDialog(): void {
  meterDialog.hidden = true;
}

// —— 示波器屏幕对话框 ——
function openScopeDialog(id: string): void {
  scopeDialog.hidden = false;
  const ins = getPlacedItem(id)?.instance;
  const trace =
    ins && lastSimCircuit && lastSimResult ? scopeTrace(lastSimCircuit, ins, lastSimResult) : null;
  if (trace) {
    drawScopeTrace(trace);
  } else {
    scopeTraceEl.setAttribute("points", "");
    scopeHint.textContent = "等待仿真";
  }
}

function drawScopeTrace(trace: Trace): void {
  scopeTraceEl.setAttribute("points", tracePoints(trace, 300, 180));
  scopeHint.textContent = trace.name;
}

function tracePoints(trace: Trace, w: number, h: number): string {
  const xs = trace.x;
  const ys = trace.y;
  if (xs.length === 0 || ys.length === 0) return "";
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < xs.length; i++) {
    if (xs[i] < minX) minX = xs[i];
    if (xs[i] > maxX) maxX = xs[i];
    if (ys[i] < minY) minY = ys[i];
    if (ys[i] > maxY) maxY = ys[i];
  }
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const margin = 8;
  const pts: string[] = [];
  for (let i = 0; i < xs.length; i++) {
    const nx = margin + ((xs[i] - minX) / spanX) * (w - 2 * margin);
    const ny = h - margin - ((ys[i] - minY) / spanY) * (h - 2 * margin);
    pts.push(`${nx.toFixed(2)},${ny.toFixed(2)}`);
  }
  return pts.join(" ");
}

function closeScopeDialog(): void {
  scopeDialog.hidden = true;
}

document.querySelector<HTMLButtonElement>("#value-ok")!.addEventListener("click", () => {
  if (!dialogTargetId) return;
  const v = valueInput.value.trim();
  commitUpdate(dialogTargetId, (ins) => {
    ins.value = v || "1";
    ins.unit = unitSelect.value;
  });
  closeValueDialog();
});

document.querySelector<HTMLButtonElement>("#value-cancel")!.addEventListener("click", closeValueDialog);

valueInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.querySelector<HTMLButtonElement>("#value-ok")!.click();
  if (e.key === "Escape") closeValueDialog();
});

valueDialog.addEventListener("click", (e) => {
  if (e.target === valueDialog) closeValueDialog();
});

document.querySelector<HTMLButtonElement>("#info-close")!.addEventListener("click", closeInfoDialog);

infoDialog.addEventListener("click", (e) => {
  if (e.target === infoDialog) closeInfoDialog();
});

document.querySelector<HTMLButtonElement>("#color-ok")!.addEventListener("click", () => {
  if (!colorTargetId) return;
  commitUpdate(colorTargetId, (ins) => {
    ins.color = colorInput.value;
  });
  closeColorDialog();
});

document.querySelector<HTMLButtonElement>("#color-cancel")!.addEventListener("click", closeColorDialog);

colorInput.addEventListener("input", () => renderColorSwatches(colorInput.value));

colorDialog.addEventListener("click", (e) => {
  if (e.target === colorDialog) closeColorDialog();
});

// —— 正弦波发生器对话框事件 ——
document.querySelector<HTMLButtonElement>("#sine-ok")!.addEventListener("click", () => {
  if (!sineTargetId) return;
  commitUpdate(sineTargetId, (ins) => {
    ins.params = {
      freq: sineFreq.value.trim() || "1k",
      ac: sineAc.value.trim() || "1",
      dc: sineDc.value.trim() || "0",
      phase: sinePhase.value.trim() || "0",
    };
  });
  closeSineDialog();
});

document.querySelector<HTMLButtonElement>("#sine-cancel")!.addEventListener("click", closeSineDialog);

for (const input of [sineFreq, sineAc, sineDc, sinePhase]) {
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.querySelector<HTMLButtonElement>("#sine-ok")!.click();
    if (e.key === "Escape") closeSineDialog();
  });
}

sineDialog.addEventListener("click", (e) => {
  if (e.target === sineDialog) closeSineDialog();
});

// —— 电压表 / 电流表 / 示波器对话框事件 ——
document.querySelector<HTMLButtonElement>("#meter-close")!.addEventListener("click", closeMeterDialog);
meterDialog.addEventListener("click", (e) => {
  if (e.target === meterDialog) closeMeterDialog();
});

document.querySelector<HTMLButtonElement>("#scope-close")!.addEventListener("click", closeScopeDialog);
scopeDialog.addEventListener("click", (e) => {
  if (e.target === scopeDialog) closeScopeDialog();
});

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeValueDialog();
    closeInfoDialog();
    closeColorDialog();
    closeSineDialog();
    closeMeterDialog();
    closeScopeDialog();
    closeSimOptions();
  }
});

// —— 预览 / 撤销 / 重做 / 保存 / 下载 / 导入 ——
previewBtn.addEventListener("click", () => {
  previewMode = !previewMode;
  if (previewMode) selectedId = null;
  updatePreviewUI();
  render();
});

undoBtn.addEventListener("click", () => {
  selectedId = null;
  undo();
});

redoBtn.addEventListener("click", () => {
  selectedId = null;
  redo();
});

saveBtn.addEventListener("click", () => {
  saveProject();
  updateHistoryButtons();
  setStatusMessage("已保存");
});

downloadBtn.addEventListener("click", () => {
  downloadBread();
});

importBtn.addEventListener("click", () => importFileInput.click());

importFileInput.addEventListener("change", async () => {
  const file = importFileInput.files?.[0];
  importFileInput.value = "";
  if (!file) return;
  try {
    await importBreadFile(file);
    selectedId = null;
    filenameInput.value = getFilename();
    render();
    setStatusMessage(`已导入 ${file.name}`);
  } catch (err) {
    setStatusMessage(`导入失败：${err instanceof Error ? err.message : String(err)}`);
  }
});

filenameInput.addEventListener("change", () => {
  setFilename(filenameInput.value);
  setStatusMessage(`文件名已设为 ${getFilename()}.bread`);
});

let statusMessageTimer: number | undefined;
function setStatusMessage(msg: string): void {
  statusbar.textContent = msg;
  window.clearTimeout(statusMessageTimer);
  statusMessageTimer = window.setTimeout(updateStatus, 2500);
}

// —— 网表面板收起/展开 ——
let netlistCollapsed = false;
netlistCollapseBtn.addEventListener("click", () => {
  netlistCollapsed = !netlistCollapsed;
  log.hidden = netlistCollapsed;
  netlistCollapseBtn.textContent = netlistCollapsed ? "展开" : "收起";
});

// —— 显示/隐藏逻辑孔位 ——
let holesVisible = false;
document.querySelector<HTMLButtonElement>("#toggle-holes")!.addEventListener("click", () => {
  holesVisible = !holesVisible;
  board.setHolesVisible(holesVisible);
});

// —— 清空电路 ——
document.querySelector<HTMLButtonElement>("#clear")!.addEventListener("click", () => {
  clearPlaced();
  selectedId = null;
  render();
  log.textContent = "";
  netlistPanel.hidden = true;
});

// —— 生成网表（调用后端 build_netlist） ——
document.querySelector<HTMLButtonElement>("#test-backend")!.addEventListener("click", async () => {
  const circuit = currentCircuit();

  if (circuit.components.length === 0) {
    log.textContent = "（电路为空，请先拖入元件）";
    netlistPanel.hidden = false;
    netlistCollapsed = false;
    log.hidden = false;
    netlistCollapseBtn.textContent = "收起";
    return;
  }

  try {
    const models = await backend.listModels();
    const netlist = await backend.buildNetlist(circuit);
    log.textContent = [
      `后端种类: ${backend.kind}`,
      `可用模型: ${models.map((m) => m.label).join("、")}`,
      `已放置: ${circuit.components.map((c) => `${c.refdes}(${c.value})`).join("、")}`,
      ``,
      `—— 当前电路网表 ——`,
      netlist.text,
    ].join("\n");
  } catch (err) {
    log.textContent = `生成网表失败：${err instanceof Error ? err.message : String(err)}`;
  }
  netlistPanel.hidden = false;
  netlistCollapsed = false;
  log.hidden = false;
  netlistCollapseBtn.textContent = "收起";
});

// —— 仿真 ——
function currentCircuit(): Circuit {
  return { breadboard: layout, components: getPlaced().map((p) => p.instance) };
}

async function runSimulation(): Promise<void> {
  const circuit = currentCircuit();
  if (circuit.components.length === 0) {
    setStatusMessage("电路为空，请先拖入元件");
    return;
  }
  setStatusMessage(`仿真中（${analysisKind}）…`);
  try {
    const result = await backend.simulate({ circuit, analysis: analysisKind, params: simParams });
    lastSimResult = result;
    lastSimCircuit = circuit;
    if (!result.ok) {
      setStatusMessage(`仿真失败：${result.error ?? "未知错误"}`);
      showSimResult(result);
      return;
    }
    setStatusMessage("仿真完成");
    showSimResult(result);
  } catch (err) {
    setStatusMessage(`仿真出错：${err instanceof Error ? err.message : String(err)}`);
  }
}

function showSimResult(result: SimulationResult): void {
  const lines: string[] = [`—— 仿真结果（${analysisKind}）——`];
  if (!result.ok) {
    lines.push("错误：" + (result.error ?? "未知错误"));
  }
  if (result.op) {
    lines.push("工作点：");
    for (const [name, v] of Object.entries(result.op)) {
      lines.push(`  ${name} = ${formatNum(v)}`);
    }
  }
  if (result.traces) {
    lines.push("曲线：");
    for (const t of result.traces) {
      lines.push(`  ${t.name}: ${t.y.length} 点`);
    }
  }
  lines.push("", `（后端：${backend.kind}）`);
  log.textContent = lines.join("\n");
  netlistPanel.hidden = false;
  netlistCollapsed = false;
  log.hidden = false;
  netlistCollapseBtn.textContent = "收起";
}

document.querySelector<HTMLButtonElement>("#simulate")!.addEventListener("click", () => {
  void runSimulation();
});

// —— 仿真选项对话框 ——
function syncSimOptionFields(): void {
  const a = simAnalysis.value;
  simDcFields.hidden = a !== "dc";
  simAcFields.hidden = a !== "ac";
  simTranFields.hidden = a !== "tran";
}

function openSimOptions(): void {
  simAnalysis.value = analysisKind;
  // 直流扫描源默认填第一个电压源器件名（如 VB1）
  const firstSource = getPlaced().find(
    (p) => p.instance.kind === "power" || p.instance.kind === "vsine",
  );
  if (firstSource && !simDcSource.value) {
    simDcSource.value = "V" + firstSource.instance.refdes;
  }
  syncSimOptionFields();
  simOptionsDialog.hidden = false;
}

function closeSimOptions(): void {
  simOptionsDialog.hidden = true;
}

function applySimOptions(): void {
  analysisKind = simAnalysis.value as AnalysisKind;
  if (analysisKind === "dc") {
    simParams = {
      source: simDcSource.value.trim() || "VB1",
      start: Number(simDcStart.value) || 0,
      stop: Number(simDcStop.value) || 9,
      step: Number(simDcStep.value) || 1,
    };
  } else if (analysisKind === "ac") {
    simParams = {
      type: simAcType.value,
      points: Number(simAcPoints.value) || 10,
      start: Number(simAcStart.value) || 10,
      stop: Number(simAcStop.value) || 1e6,
    };
  } else if (analysisKind === "tran") {
    simParams = {
      step: Number(simTranStep.value) || 1e-5,
      stop: Number(simTranStop.value) || 1e-3,
    };
  } else {
    simParams = {};
  }
  closeSimOptions();
}

document.querySelector<HTMLButtonElement>("#sim-options")!.addEventListener("click", openSimOptions);
document.querySelector<HTMLButtonElement>("#sim-options-ok")!.addEventListener("click", applySimOptions);
document.querySelector<HTMLButtonElement>("#sim-options-cancel")!.addEventListener("click", closeSimOptions);
simAnalysis.addEventListener("change", syncSimOptionFields);
simOptionsDialog.addEventListener("click", (e) => {
  if (e.target === simOptionsDialog) closeSimOptions();
});
