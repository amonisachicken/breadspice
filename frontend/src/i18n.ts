// SPDX-License-Identifier: GPL-3.0-only

/**
 * 轻量国际化 —— 中/英 双语字典与语言切换。
 *
 * - 静态文案通过 HTML 上的 `data-i18n` / `data-i18n-title` / `data-i18n-aria-label`
 *   标记，调用 {@link applyI18n} 统一替换；
 * - 动态文案在代码里用 {@link t} 取当前语言字符串；
 * - 语言选择持久化到 localStorage，切换时通知订阅者重渲染。
 */

export type Language = "zh" | "en";

interface Entry {
  zh: string;
  en: string;
}

const DICT: Record<string, Entry> = {
  // —— 顶栏 ——
  "app.title": { zh: "面包板仿真", en: "Breadboard Simulator" },
  "topbar.generate": { zh: "生成网表", en: "Generate Netlist" },
  "topbar.simulate": { zh: "▶️ 仿真", en: "▶️ Simulate" },
  "topbar.stop": { zh: "⏹️ 停止", en: "⏹️ Stop" },
  "topbar.simOptions": { zh: "仿真选项", en: "Simulation Options" },
  "topbar.preview": { zh: "预览", en: "Preview" },
  "topbar.exitPreview": { zh: "退出预览", en: "Exit Preview" },
  "topbar.undo": { zh: "撤销", en: "Undo" },
  "topbar.redo": { zh: "重做", en: "Redo" },
  "topbar.save": { zh: "保存布局", en: "Save Layout" },
  "topbar.download": { zh: "下载", en: "Download" },
  "topbar.import": { zh: "导入", en: "Import" },
  "topbar.filenameTitle": { zh: "文件名（.bread）", en: "Filename (.bread)" },
  "topbar.zoom": { zh: "缩放", en: "Zoom" },
  "topbar.fit": { zh: "适应", en: "Fit" },
  "topbar.showHoles": { zh: "显示孔位", en: "Show Holes" },
  "topbar.clear": { zh: "清空电路", en: "Clear Circuit" },
  "canvas.ariaLabel": { zh: "面包板画布", en: "Breadboard canvas" },

  // —— 元件面板 ——
  "palette.title": { zh: "元件库", en: "Components" },
  "palette.hint": {
    zh: "拖入面包板；拖元件移动、拖蓝点旋转、拖绿点伸缩引脚，滚轮缩放，双击蓝点设置/查看属性",
    en: "Drag onto the breadboard; drag to move, blue dot to rotate, green dot to stretch pins, scroll to zoom, double-click blue dot to edit/view",
  },
  "palette.itemTitle": {
    zh: "拖拽到面包板放置（拖拽中按 R 旋转）；放置后双击可查看/设置属性",
    en: "Drag to place (press R while dragging to rotate); double-click placed component to view/edit",
  },

  // —— 网表面板 ——
  "netlist.title": { zh: "网表", en: "Netlist" },
  "netlist.collapse": { zh: "收起", en: "Collapse" },
  "netlist.expand": { zh: "展开", en: "Expand" },

  // —— 通用 ——
  "common.cancel": { zh: "取消", en: "Cancel" },
  "common.ok": { zh: "确定", en: "OK" },
  "common.close": { zh: "关闭", en: "Close" },

  // —— 对话框标题 ——
  "value.title": { zh: "设置数值", en: "Set Value" },
  "info.title": { zh: "元件信息", en: "Component Info" },
  "color.title": { zh: "导线颜色", en: "Wire Color" },
  "sine.title": { zh: "正弦波发生器", en: "Sine Generator" },
  "pot.title": { zh: "电位器", en: "Potentiometer" },
  "scope.title": { zh: "示波器", en: "Oscilloscope" },
  "sim.title": { zh: "仿真选项", en: "Simulation Options" },
  "audio.title": { zh: "音频输入", en: "Audio Input" },

  // —— 正弦对话框 ——
  "sine.freq": { zh: "频率 (Hz)", en: "Frequency (Hz)" },
  "sine.ac": { zh: "交流电压 (V)", en: "AC Voltage (V)" },
  "sine.dc": { zh: "直流电压 (V)", en: "DC Voltage (V)" },
  "sine.phase": { zh: "相位 (°)", en: "Phase (°)" },

  // —— 电位器对话框 ——
  "pot.total": { zh: "总阻值 (R1+R2)", en: "Total (R1+R2)" },
  "pot.percent": { zh: "百分比 (R1/(R1+R2))", en: "Ratio (R1/(R1+R2))" },

  // —— 仪表 ——
  "meter.voltmeter": { zh: "电压表", en: "Voltmeter" },
  "meter.ammeter": { zh: "电流表", en: "Ammeter" },
  "meter.notSimulated": { zh: "（未运行仿真，或仪表未连接）", en: "(not simulated, or meter disconnected)" },
  "meter.lastResult": { zh: "（最近一次仿真结果）", en: "(latest simulation result)" },

  // —— 示波器 ——
  "scope.waiting": { zh: "等待仿真", en: "Waiting for simulation" },
  "scope.freqResp": { zh: "频响 {name}", en: "Response {name}" },
  "scope.play": { zh: "▶ 播放", en: "▶ Play" },
  "scope.back": { zh: "返回", en: "Back" },
  "scope.downloadWav": { zh: "下载 WAV", en: "Download WAV" },
  "scope.fftNoData": { zh: "FFT（无有效数据）", en: "FFT (no valid data)" },

  // —— 仿真选项 ——
  "sim.analysis": { zh: "分析类型", en: "Analysis Type" },
  "sim.analysisOp": { zh: "工作点（op）", en: "Operating Point (op)" },
  "sim.analysisDc": { zh: "直流扫描（dc）", en: "DC Sweep (dc)" },
  "sim.analysisAc": { zh: "交流分析（ac）", en: "AC Analysis (ac)" },
  "sim.analysisTran": { zh: "瞬态分析（tran）", en: "Transient (tran)" },
  "sim.dcSource": { zh: "扫描源（器件名）", en: "Sweep Source (device)" },
  "sim.startV": { zh: "起始 (V)", en: "Start (V)" },
  "sim.stopV": { zh: "终止 (V)", en: "Stop (V)" },
  "sim.stepV": { zh: "步长 (V)", en: "Step (V)" },
  "sim.sweep": { zh: "扫描方式", en: "Sweep Type" },
  "sim.points": { zh: "点数", en: "Points" },
  "sim.startHz": { zh: "起始 (Hz)", en: "Start (Hz)" },
  "sim.stopHz": { zh: "终止 (Hz)", en: "Stop (Hz)" },
  "sim.stepS": { zh: "步长 (s)", en: "Step (s)" },
  "sim.startS": { zh: "起始 (s)", en: "Start (s)" },
  "sim.durationS": { zh: "持续 (s)", en: "Duration (s)" },

  // —— 音频对话框 ——
  "audio.presets": { zh: "预设音符", en: "Preset Notes" },
  "audio.gain": { zh: "输入增益", en: "Input Gain" },
  "audio.choose": { zh: "选择音频文件", en: "Choose Audio File" },
  "audio.notUploaded": {
    zh: "未上传音频（上传或选择预设音符后作为电压源输入）",
    en: "No audio uploaded (upload or pick a preset note to use as input)",
  },
  "audio.uploaded": { zh: "已上传（id: {id}，时长 {dur} s）", en: "Uploaded (id: {id}, duration {dur} s)" },
  "audio.uploading": { zh: "上传并转码中…", en: "Uploading & transcoding…" },
  "audio.uploadFailed": { zh: "上传失败，请重试", en: "Upload failed, please retry" },
  "audio.presetSelected": { zh: "已选预设音符 {name}（时长约 7 s）", en: "Preset note {name} selected (~7 s)" },

  // —— 状态栏 ——
  "status.backend": { zh: "后端: {kind} · 已放置 {n} 个元件 · 孔位 {holes} · 网 {nets}", en: "Backend: {kind} · {n} components · {holes} holes · {nets} nets" },

  // —— 状态消息 ——
  "status.playFailed": { zh: "播放失败", en: "Play failed" },
  "status.presetSelected": { zh: "已选预设音符 {name}", en: "Preset note {name} selected" },
  "status.audioUploaded": { zh: "音频已上传", en: "Audio uploaded" },
  "status.audioUploadFailed": { zh: "音频上传失败：{err}", en: "Audio upload failed: {err}" },
  "status.noFftWaveform": { zh: "暂无波形可做 FFT", en: "No waveform for FFT" },
  "status.computingFft": { zh: "正在计算 FFT…", en: "Computing FFT…" },
  "status.fftFailed": { zh: "FFT 失败：{err}", en: "FFT failed: {err}" },
  "status.pleaseUploadAudio": { zh: "请先上传音频或选择预设音符", en: "Upload audio or pick a preset note first" },
  "status.onlyTranPlay": { zh: "仅 tran 仿真结果可播放为音频", en: "Only tran results can be played as audio" },
  "status.noWaveformPlay": { zh: "暂无波形可播放，请先运行仿真", en: "No waveform to play; run a simulation first" },
  "status.onlyTranExport": { zh: "仅 tran 仿真结果可导出为 WAV", en: "Only tran results can be exported as WAV" },
  "status.exportedWav": { zh: "已导出 WAV", en: "WAV exported" },
  "status.noWaveformDownload": { zh: "暂无波形可下载，请先运行仿真", en: "No waveform to download; run a simulation first" },
  "status.saved": { zh: "已保存", en: "Saved" },
  "status.imported": { zh: "已导入 {name}", en: "Imported {name}" },
  "status.importFailed": { zh: "导入失败：{err}", en: "Import failed: {err}" },
  "status.filenameSet": { zh: "文件名已设为 {name}.bread", en: "Filename set to {name}.bread" },
  "status.circuitEmpty": { zh: "电路为空，请先拖入元件", en: "Circuit is empty; add components first" },
  "status.simulating": { zh: "仿真中（{kind}）…", en: "Simulating ({kind})…" },
  "status.simFailed": { zh: "仿真失败：{err}", en: "Simulation failed: {err}" },
  "status.simCancelled": { zh: "仿真已取消（保留部分结果）", en: "Simulation cancelled (partial results kept)" },
  "status.simDone": { zh: "仿真完成", en: "Simulation complete" },
  "status.simError": { zh: "仿真出错：{err}", en: "Simulation error: {err}" },
  "status.stopping": { zh: "正在停止仿真…", en: "Stopping simulation…" },
  "status.stopFailed": { zh: "停止失败：{err}", en: "Stop failed: {err}" },

  // —— 网表/结果日志 ——
  "log.backendKind": { zh: "后端种类: {kind}", en: "Backend kind: {kind}" },
  "log.models": { zh: "可用模型: {models}", en: "Available models: {models}" },
  "log.placed": { zh: "已放置: {list}", en: "Placed: {list}" },
  "log.netlistTitle": { zh: "—— 当前电路网表 ——", en: "—— Current netlist ——" },
  "log.netlistFailed": { zh: "生成网表失败：{err}", en: "Netlist generation failed: {err}" },
  "log.resultTitle": { zh: "—— 仿真结果（{kind}）——", en: "—— Simulation result ({kind}) ——" },
  "log.cancelled": { zh: "（仿真已取消，以下为部分结果）", en: "(simulation cancelled; partial results below)" },
  "log.error": { zh: "错误：{err}", en: "Error: {err}" },
  "log.opPoint": { zh: "工作点：", en: "Operating point:" },
  "log.traces": { zh: "曲线：", en: "Traces:" },
  "log.traceLine": { zh: "  {name}: {n} 点", en: "  {name}: {n} pts" },
  "log.backend": { zh: "（后端：{kind}）", en: "(backend: {kind})" },
  "log.unknownError": { zh: "未知错误", en: "unknown error" },

  // —— 后端错误 ——
  "backend.badResponse": { zh: "后端响应异常：{kind}", en: "Unexpected backend response: {kind}" },
  "backend.unreachable": {
    zh: "无法连接后端（{err}），请先在 backend 目录运行 cargo run",
    en: "Cannot reach backend ({err}); run `cargo run` in the backend directory first",
  },
  "backend.uploadFailed": { zh: "音频上传失败：{err}", en: "Audio upload failed: {err}" },
  "backend.fftFailed": { zh: "FFT 失败：{err}", en: "FFT failed: {err}" },
  "backend.requestFailed": { zh: "后端请求失败（HTTP {status}）", en: "Backend request failed (HTTP {status})" },
  "mock.noUpload": { zh: "Mock 后端不支持音频上传，请切换到真实后端", en: "Mock backend does not support audio upload; switch to the real backend" },
  "mock.noFft": { zh: "Mock 后端不支持 FFT，请切换到真实后端", en: "Mock backend does not support FFT; switch to the real backend" },
};

const LS_KEY = "breadspice:lang";

let current: Language = (() => {
  try {
    return localStorage.getItem(LS_KEY) === "en" ? "en" : "zh";
  } catch {
    return "zh";
  }
})();

const listeners = new Set<() => void>();

/** 当前界面语言。 */
export function getLanguage(): Language {
  return current;
}

/** 切换界面语言并通知订阅者。 */
export function setLanguage(lang: Language): void {
  if (lang === current) return;
  current = lang;
  try {
    localStorage.setItem(LS_KEY, lang);
  } catch {
    /* ignore */
  }
  listeners.forEach((fn) => fn());
}

/** 订阅语言变化，返回取消订阅函数。 */
export function onLanguageChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** 取当前语言的文案；`vars` 用于替换 `{key}` 占位符。 */
export function t(key: string, vars?: Record<string, string | number>): string {
  let s = DICT[key]?.[current] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.split(`{${k}}`).join(String(v));
    }
  }
  return s;
}

/** 把当前语言的文案应用到所有带 data-i18n 标记的 DOM 元素。 */
export function applyI18n(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n!);
  });
  root.querySelectorAll<HTMLElement>("[data-i18n-title]").forEach((el) => {
    el.title = t(el.dataset.i18nTitle!);
  });
  root.querySelectorAll<HTMLElement>("[data-i18n-aria-label]").forEach((el) => {
    el.setAttribute("aria-label", t(el.dataset.i18nAriaLabel!));
  });
}
