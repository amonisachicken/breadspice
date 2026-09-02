// SPDX-License-Identifier: GPL-3.0-only

/**
 * 项目持久化 —— 把当前画板保存为 `文件名.bread`（纯文本 JSON），
 * 并把撤销/重做历史写入 `文件名.breadcache`。
 *
 * 说明：Rust 后端尚未接入，这里用 `localStorage` 模拟“后端文件”的落盘，
 * 使保存结果在刷新页面后仍可恢复；同时提供 .bread 的下载/导入。
 * 将来接入 Rust 后端时，只需把 `saveProject` / `initProject` 替换为
 * HTTP 调用，其余接口保持不变。
 */

import {
  clearHistory,
  getHistoryState,
  getPlaced,
  onHistoryChange,
  replaceAll,
  restoreHistoryState,
  type PlacedItem,
} from "./circuitStore";
import type { AnalysisKind } from "../types/protocol";

const DEFAULT_FILENAME = "circuit";
const FILENAME_META_KEY = "breadspice:last-filename";

let filename = DEFAULT_FILENAME;
let saving = false;

const breadKey = (): string => `${filename}.bread`;
const cacheKey = (): string => `${filename}.breadcache`;

/** 仿真选项（作为布局的一部分持久化，但不进撤销/重做栈）。 */
export interface SimOptions {
  analysis: AnalysisKind;
  params: Record<string, unknown>;
  custom: boolean;
}

function defaultSimOptions(): SimOptions {
  return { analysis: "tran", params: { step: 1e-5, start: 0.19, duration: 0.01 }, custom: false };
}

function cloneSimOptions(o: SimOptions): SimOptions {
  return { analysis: o.analysis, params: { ...o.params }, custom: o.custom };
}

let simOptions: SimOptions = defaultSimOptions();

/** 读取当前仿真选项（前端在启动/导入后据此恢复）。 */
export function getSimOptions(): SimOptions {
  return cloneSimOptions(simOptions);
}

/** 更新当前仿真选项（前端在用户修改/切换信号源后同步）。 */
export function setSimOptions(opts: SimOptions): void {
  simOptions = cloneSimOptions(opts);
}

interface BreadFile {
  format: "breadspice-bread";
  version: 1;
  items: PlacedItem[];
  sim?: SimOptions;
}

interface BreadCacheFile {
  format: "breadspice-breadcache";
  version: 1;
  current: PlacedItem[];
  undo: PlacedItem[][];
  redo: PlacedItem[][];
  sim?: SimOptions;
}

/**
 * 写 .bread 前清洗音频输入：只保留预设音符占位符（preset:C/A/G/E/D），
 * 上传音频的注册表 id 置空（.bread 不含具体音频内容）。
 */
function sanitizeBreadItems(items: PlacedItem[]): PlacedItem[] {
  return items.map((it) => {
    const clone = JSON.parse(JSON.stringify(it)) as PlacedItem;
    const ins = clone.instance;
    if (ins.kind === "audio") {
      const audio = ins.params?.audio;
      if (audio && !audio.startsWith("preset:")) {
        ins.params = { ...(ins.params ?? {}), audio: "" };
      }
    }
    return clone;
  });
}

function serializeBread(): string {
  const data: BreadFile = {
    format: "breadspice-bread",
    version: 1,
    items: sanitizeBreadItems(getPlaced()),
    sim: getSimOptions(),
  };
  return JSON.stringify(data, null, 2);
}

function serializeCache(): string {
  const h = getHistoryState();
  const data: BreadCacheFile = {
    format: "breadspice-breadcache",
    version: 1,
    ...h,
    sim: getSimOptions(),
  };
  return JSON.stringify(data, null, 2);
}

function persistCache(): void {
  if (saving) return;
  try {
    localStorage.setItem(cacheKey(), serializeCache());
  } catch {
    /* localStorage 不可用时静默失败 */
  }
}

/** 页面加载时恢复：优先读取 .breadcache（含撤销/重做），否则读取 .bread。 */
export function initProject(): void {
  filename = localStorage.getItem(FILENAME_META_KEY) || DEFAULT_FILENAME;

  onHistoryChange(persistCache);

  const cacheRaw = localStorage.getItem(cacheKey());
  if (cacheRaw) {
    try {
      const data = JSON.parse(cacheRaw) as BreadCacheFile;
      if (data?.format === "breadspice-breadcache" && Array.isArray(data.current)) {
        setSimOptions(data.sim ?? defaultSimOptions());
        restoreHistoryState({
          current: data.current,
          undo: data.undo ?? [],
          redo: data.redo ?? [],
        });
        return;
      }
    } catch {
      /* 损坏的缓存忽略，回退到 bread */
    }
  }

  const breadRaw = localStorage.getItem(breadKey());
  if (breadRaw) {
    try {
      const data = JSON.parse(breadRaw) as BreadFile;
      if (data?.format === "breadspice-bread" && Array.isArray(data.items)) {
        setSimOptions(data.sim ?? defaultSimOptions());
        replaceAll(data.items);
      }
    } catch {
      /* 损坏的 bread 忽略 */
    }
  }
}

/** 保存：把当前状态合并进 .bread，删除 .breadcache，并清空撤销/重做历史。 */
export function saveProject(): void {
  saving = true;
  try {
    localStorage.setItem(breadKey(), serializeBread());
    clearHistory();
    localStorage.removeItem(cacheKey());
  } finally {
    saving = false;
  }
}

/** 把当前画板下载为 `文件名.bread` 纯文本文件。 */
export function downloadBread(): void {
  const blob = new Blob([serializeBread()], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.bread`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** 从本地 .bread 文件导入，替换当前画板并清空历史。 */
export async function importBreadFile(file: File): Promise<void> {
  const text = await file.text();
  const data = JSON.parse(text) as BreadFile;
  if (!data || !Array.isArray(data.items)) {
    throw new Error("无效的 .bread 文件：缺少 items");
  }
  // 先改文件名，再替换，确保随后的缓存写入新文件名的 key。
  const base = file.name.replace(/\.bread$/i, "") || DEFAULT_FILENAME;
  setFilename(base);
  setSimOptions(data.sim ?? defaultSimOptions());
  replaceAll(data.items);
}

export function getFilename(): string {
  return filename;
}

export function setFilename(name: string): void {
  const n = (name ?? "").trim() || DEFAULT_FILENAME;
  filename = n;
  try {
    localStorage.setItem(FILENAME_META_KEY, n);
  } catch {
    /* ignore */
  }
}
