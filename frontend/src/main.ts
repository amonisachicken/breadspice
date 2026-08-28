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

import "./style.css";

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <header class="topbar">
    <h1>虚拟面包板 <span>Virtual Breadboard</span></h1>
    <div class="topbar__actions">
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
window.addEventListener("keydown", (e) => {
  if (previewMode) return; // 预览模式下禁用删除/旋转快捷键
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

/** 双击某元件：分流到颜色 / 数值单位 / 介绍对话框。 */
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
  const units = UNIT_SETS[ins.kind];
  if (units) {
    openValueDialog(id, ins.value, ins.unit, units);
  } else if (entry.info) {
    openInfoDialog(entry.label, entry.info);
  }
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

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeValueDialog();
    closeInfoDialog();
    closeColorDialog();
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

// —— 生成网表（把当前放置的电路交给 MockBackend，打通接口链路） ——
document.querySelector<HTMLButtonElement>("#test-backend")!.addEventListener("click", async () => {
  const circuit: Circuit = {
    breadboard: layout,
    components: getPlaced().map((p) => p.instance),
  };

  if (circuit.components.length === 0) {
    log.textContent = "（电路为空，请先拖入元件）";
    netlistPanel.hidden = false;
    netlistCollapsed = false;
    log.hidden = false;
    netlistCollapseBtn.textContent = "收起";
    return;
  }

  const models = await backend.listModels();
  const netlist = await backend.buildNetlist(circuit);
  log.textContent = [
    `后端种类: ${backend.kind}`,
    `可用模型: ${models.map((m) => m.label).join("、")}`,
    `已放置: ${circuit.components.map((c) => `${c.refdes}(${c.value})`).join("、")}`,
    ``,
    `—— 当前电路网表（Mock 参考实现）——`,
    netlist.text,
  ].join("\n");
  netlistPanel.hidden = false;
  netlistCollapsed = false;
  log.hidden = false;
  netlistCollapseBtn.textContent = "收起";
});
