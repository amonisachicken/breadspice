# 面包板仿真 · BreadSpice

一个**虚拟面包板**：在面包板上拖拽元件进行布局，每个元件对应一个 ngspice 模型。
前端使用 **JavaScript/TypeScript（Vite + Vanilla TS）** 实现交互与渲染，
后端计划使用 **Rust + ngspice** 生成网表并仿真（当前为骨架占位，前端以 Mock 后端打通数据流）。

> 本项目使用了 [ngspice](https://github.com/ngspice/ngspice)（BSD-3-Clause）与
> [DIY Layout Creator](https://github.com/bancika/diy-layout-creator)（GPL-3.0）的开源成果，
> 相应声明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
>
> **许可证**：本项目采用 [GNU GPL v3.0](LICENSE)。

## 当前进度

前端交互与编辑已基本完成，真实 ngspice 仿真尚未接入（预留接口与占位按钮）：

- ✅ 面包板 SVG 资产接入 + 布局生成器对齐真实孔位（`frontend/src/layout/breadboardLayout.ts`）
- ✅ 元件库：电阻、电容、二极管 ×2、LED ×3、三极管 ×4、运放 OP07、电池（DC 源）、
  正弦波发生器、电压表、电流表、示波器、直导线、弯导线（`frontend/src/components/catalog.ts`）
- ✅ 拖拽放置 + 自由旋转（蓝点）+ `R` 键 90° 旋转 + 引脚伸缩（绿点，吸附孔位）+ IC 刚性锁定 e/f 列
- ✅ 导线：直导线跳线；弯导线为二次贝塞尔曲线，拖动蓝点控制曲率，双击设置颜色
- ✅ 双击属性：电阻/电容/电池（数值+单位）、正弦源（频率/交直流电压/相位）、
  电压表/电流表（读数占位）、示波器（屏幕占位）、半导体/IC（介绍）
- ✅ 保存 / 撤销 / 重做 / 导入导出：`文件名.bread` 纯文本 + `文件名.breadcache` 缓存
  （Rust 后端未接入前用 localStorage 模拟落盘，并提供下载/上传）
- ✅ 预览模式：隐藏所有控制点、锁定编辑，仅保留视图缩放与网表生成
- ✅ 网表生成（Mock 参考实现，含仪表/正弦源 SPICE 映射）+ 收起面板
- ✅ 前后端共享契约（领域模型 / 后端接口 / 协议类型）+ Rust 后端骨架（domain/netlist/ngspice 占位）
- ⏳ 真实 ngspice 接入与仿真（「▶️ 仿真」「仿真选项」按钮为占位符）

## 目录结构

```
breadboard/
├── frontend/                    # 前端（Vite + Vanilla TypeScript）
│   └── src/
│       ├── assets/              # 面包板与元件 SVG（DIYLC 资产）
│       ├── types/               # domain.ts（领域模型）、protocol.ts（通信协议）
│       ├── components/          # catalog.ts（元件目录 + 程序化符号）
│       ├── backend/             # Backend 接口 + MockBackend + 解析器单例
│       ├── layout/              # breadboardLayout.ts（SVG 对齐的布局生成）
│       ├── interaction/         # drag.ts（拖拽手势）、placement.ts（几何/吸附）
│       ├── render/              # svgAsset.ts / breadboard.ts / parts.ts / placedComponents.ts
│       ├── store/               # circuitStore.ts（状态+撤销重做）、projectStore.ts（保存/导入导出）
│       ├── main.ts              # 入口（交互委托、对话框、工具栏）
│       └── style.css
└── backend/                     # Rust 后端（骨架，未在本环境编译）
    └── src/
        ├── domain.rs            # 与前端 domain.ts 对应的 Rust 结构体
        ├── netlist.rs           # 网表生成（占位）
        ├── ngspice.rs           # ngspice 驱动接口（CLI / FFI 占位）
        ├── lib.rs
        └── main.rs
```

## 运行前端

```bash
cd frontend
npm install
npm run dev        # 开发服务器，默认 http://localhost:5173
npm run build      # 类型检查 + 产物构建
npm run typecheck  # 仅类型检查
```

打开后可见：

- 面包板 SVG 真实渲染（已按内容裁剪、留出工作区），右侧「元件库」列出元件缩略图；
- **拖拽元件到面包板放置**（拖拽中按 `R` 键 90° 旋转，引脚自动吸附最近孔位）；
- 选中已放置元件后：
  - 拖 **蓝色圆点**（旋转手柄）任意角度旋转；
  - 拖 **绿色圆点**（引脚手柄）到任意孔位伸缩引线；
  - 按 `Delete` / `Backspace` 删除；按 `R` 旋转；
- **双击蓝点**打开属性：电阻/电容/电池设置数值单位，导线设置颜色，半导体/IC 查看介绍，
  正弦源设置参数，电压表/电流表查看读数，示波器打开屏幕；
- **直导线/弯导线**：放置后本体不可拖动，仅可拖两端点改接孔位；弯导线多一个蓝点控制曲率；
- 顶部工具栏：撤销/重做、保存、下载、导入（`.bread`）、预览、显示孔位、生成网表、清空电路，
  以及「▶️ 仿真」「仿真选项」占位按钮；
- **预览模式**：隐藏所有控制点、锁定编辑，仅可缩放/平移视图与生成网表。

## 保存 / 撤销 / 重做

- 每一步操作（含清空电路）都会记录到 `文件名.breadcache`（含撤销/重做栈）；
- 「保存」把当前状态合并进 `文件名.bread`、删除 `.breadcache`，并清空撤销/重做历史
  （此时撤销/重做按钮变灰，直到有新更改）；
- 「下载」导出 `文件名.bread`，「导入」从本地 `.bread` 文件恢复画板；
- Rust 后端接入前，`localStorage` 模拟后端文件落盘（刷新页面可恢复会话），
  文件序列化为纯文本 JSON。

## 编译后端（本机需已安装 Rust 工具链）

```bash
cd backend
cargo build
cargo run        # 目前仅打印骨架启动信息
```

> 注意：`cargo` / `rustc` / `ngspice` 在本开发环境未安装，后端骨架已写好但未在此环境编译验证。

## 接口契约（预留，后续接入 Rust/ngspice）

前端只依赖一个稳定的 `Backend` 接口（`frontend/src/backend/Backend.ts`）：

| 方法 | 说明 |
| --- | --- |
| `listModels()` | 获取元件模型目录（驱动元件面板） |
| `buildNetlist(circuit)` | 电路布局 → SPICE 网表 |
| `simulate(request)` | 执行一次仿真（op/dc/ac/tran） |
| `on(event, handler)` | 订阅进度/波形事件 |

数据契约：

- **领域模型**：`frontend/src/types/domain.ts` ↔ `backend/src/domain.rs`
  - `BreadboardNode`（插孔）、`Net`（电气网）、`BreadboardLayout`（布局）、
    `ComponentInstance`（元件实例，含 `pins`/`params`）、`Circuit`（电路）。
- **通信协议**：`frontend/src/types/protocol.ts`
  - 请求/响应：`ping` / `list_models` / `build_netlist` / `simulate`；
  - 事件：仿真进度、实时波形、后端状态。

### 仿真模型映射（Mock 参考实现）

| 元件 | 后端 ngspice 模型 |
| --- | --- |
| 电阻 / 电容 | `R<name> n+ n- <值>` / `C<name> ...` |
| 二极管 / LED | `D<name> ... <型号>` |
| 三极管 | `Q<name> ...`（NPN/PNP）/ `M<name>`（MOS） |
| 电池（DC 源） | `V<name> n+ n- <电压>` |
| 正弦波发生器 | `V<name> n+ n- SIN(dc ac freq 0 0 phase)` |
| 电压表 | `R<name> n+ n- 10000Meg`（10GΩ 采样，读节点电压） |
| 电流表 | `R<name> n+ n- 1m`（1mΩ 采样，读元件电流） |
| 示波器 | 不产生器件，记录 `* probe X<name>: V(<node>)`，后端读 raw 波形 |
| 导线 / 跳线 | `R<name> n+ n- 0.001`（近零电阻） |

**核心设计**：前端只发送 `Circuit`（元件 + 引脚所落孔位），不关心 ngspice 细节；
后端负责「孔位 → net → SPICE 节点」映射、网表生成与仿真执行。
接入真实后端时，只需在 `frontend/src/backend/index.ts` 里把 `MockBackend`
换成 `HttpBackend` / `WsBackend` 实现即可，其余代码无需改动。

传输层（预留）：前端 vite 已把 `/api`、`/ws` 代理到 `127.0.0.1:8787`，
后续 Rust 后端在此端口启动 HTTP/WebSocket 服务即可对接。

## 面包板 SVG 几何/电气约定

`breadboard.svg` 是一块竖版无焊面包板（约等于标准 MB-102 旋转 90°）：

- **电源轨**：左/右各两条纵向轨（红 `+`、蓝 `-`），每条轨纵向连通 → 4 条 net；
- **端子排**：被纵向凹槽分成左 5 列 / 右 5 列，每列 30 孔；
  - 每一「横排」在左组（或右组）内部横向连通 5 孔 → 30 行 × 2 组 = 60 条 net。

这些几何/连通约定已编码在 `frontend/src/layout/breadboardLayout.ts`，
后续做网表时由后端据此推导电气节点。
