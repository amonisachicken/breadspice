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
  正弦波发生器、音频输入、电压表、电流表、示波器、直导线、弯导线、接地/GND（`frontend/src/components/catalog.ts`）
- ✅ 拖拽放置 + 自由旋转（蓝点）+ `R` 键 90° 旋转 + 引脚伸缩（绿点，吸附孔位）+ IC 刚性锁定 e/f 列
- ✅ 导线：直导线跳线；弯导线为二次贝塞尔曲线，拖动蓝点控制曲率，双击设置颜色
- ✅ 双击属性：电阻/电容/电池（数值+单位）、正弦源（频率/交直流电压/相位）、
  电压表/电流表（实时读数）、示波器（实时波形）、半导体/IC（介绍）
- ✅ 保存 / 撤销 / 重做 / 导入导出：`文件名.bread` 纯文本 + `文件名.breadcache` 缓存
  （Rust 后端未接入前用 localStorage 模拟落盘，并提供下载/上传）
- ✅ 预览模式：隐藏所有控制点、锁定编辑，仅保留视图缩放与网表生成
- ✅ 网表生成（Mock 参考实现，含仪表/正弦源 SPICE 映射）+ 收起面板
- ✅ 前后端共享契约（领域模型 / 后端接口 / 协议类型）+ Rust 后端（domain/protocol/netlist/模型库/ngspice 驱动 已实现并单测）
- ✅ 接地解析：`gnd` 元件引脚映射节点 0（电池不自动接地）
- ✅ HTTP/WebSocket 服务（axum，监听 127.0.0.1:8787）：`POST /api` RPC + `GET /ws` 事件流
- ✅ 前端接线（`HttpBackend` + 「▶️ 仿真」「仿真选项」+ 仪表/示波器读真实结果）
- ✅ 仿真中锁定编辑（类预览模式）+ 「⏹️ 停止」提前终止（后端 `/api/stop`，保留已算出的部分波形并标记 `cancelled`）

## 目录结构

```
breadboard/
├── frontend/                    # 前端（Vite + Vanilla TypeScript）
│   └── src/
│       ├── assets/              # 面包板与元件 SVG（DIYLC 资产）
│       ├── types/               # domain.ts（领域模型）、protocol.ts（通信协议）
│       ├── components/          # catalog.ts（元件目录 + 程序化符号）
│       ├── backend/             # Backend 接口 + MockBackend / HttpBackend / simResults + 解析器单例
│       ├── layout/              # breadboardLayout.ts（SVG 对齐的布局生成）
│       ├── interaction/         # drag.ts（拖拽手势）、placement.ts（几何/吸附）
│       ├── render/              # svgAsset.ts / breadboard.ts / parts.ts / placedComponents.ts
│       ├── store/               # circuitStore.ts（状态+撤销重做）、projectStore.ts（保存/导入导出）
│       ├── main.ts              # 入口（交互委托、对话框、工具栏）
│       └── style.css
└── backend/                     # Rust 后端
    ├── assets/
    │   └── models.lib           # ngspice 器件模型库（.MODEL / .SUBCKT）
    └── src/
        ├── domain.rs            # 与前端 domain.ts 对应的 Rust 结构体
        ├── protocol.rs          # 与前端 protocol.ts 对应的通信协议类型
        ├── models.rs            # 模型库嵌入（include_str!）
        ├── netlist.rs           # 网表生成（已实现，含模型库注入）
        ├── ngspice.rs           # ngspice 驱动（CLI 子进程 + rawfile 解析）
        ├── server.rs            # HTTP/WebSocket 服务（/api RPC + /ws 事件流）
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

前端默认连真实 Rust 后端（`HttpBackend`，`/api`、`/ws` 已由 vite 代理到
`127.0.0.1:8787`），因此**先启动后端**再打开页面：

```bash
cd backend && cargo run   # 监听 127.0.0.1:8787
```

> 若想离线调试（无后端），可设 `VITE_USE_MOCK=1` 回退到本地 `MockBackend`。

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

## 编译后端（本机需已安装 Rust 工具链 + ngspice + ffmpeg）

```bash
cd backend
cargo build
cargo test       # 单元测试 + 真跑 ngspice 的集成测试（找不到 ngspice 时自动跳过）
cargo run        # 启动 HTTP/WebSocket 服务，监听 127.0.0.1:8787
```

> ngspice 驱动目前采用 **CLI 子进程**（`ngspice -b`）：把网表写成临时文件，
> 强制输出 ASCII rawfile，再解析成结构化的 `SimulationResult`（op 字典 / dc/ac/tran 曲线）。
>
> 音频输入需要 `ffmpeg`：上传的 wave 文件经 ffmpeg 转码成 44.1kHz/16-bit/单声道 PCM，
> 再逐点内联成 PWL 电压源（`/api/upload`）。

### HTTP/WebSocket 服务

启动 `cargo run` 后：

- `GET /`：健康检查；
- `POST /api`：JSON RPC，请求体为 `BackendRequest`（`kind` 为 `ping` / `list_models` /
  `build_netlist` / `simulate`），返回 `BackendResponse`；
- `GET /ws`：事件流（`simulation_started` / `simulation_progress` /
  `simulation_trace` / `simulation_done` / `backend_status`）。

可用 `BREADSPICE_BIND` 环境变量覆盖监听地址（默认 `127.0.0.1:8787`）。

## 接口契约

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
| 电阻 / 电容 / 电感 | `R<name> n+ n- <值>` / `C<name> ...` / `L<name> ...` |
| 二极管 / LED | `D<name> n+ n- <型号>`（LED：red/green/blue → `LedRed`/`LedGreen`/`LedBLUE`） |
| 三极管 | `Q<name> C B E <型号>`（NPN/PNP） |
| MOS / JFET | `M<name> D G S <型号>` / `J<name> D G S <型号>` |
| 运放 OP07 | `X<name> <IN+> <IN-> <V+> <V-> <OUT> OP07A` |
| 电池（DC 源） | `V<name> n+ n- <电压>` |
| 接地 / GND | 不产生器件，其引脚所在 net 映射到节点 `0`（记录 `* gnd <name>`） |
| 正弦波发生器 | `V<name> n+ n- SIN(dc ac freq 0 0 phase)` |
| 音频输入 | `V<name> n+ n- PWL(<44.1kHz PCM 逐点内联>)`（wave 文件经 ffmpeg 转码） |
| 电压表 | `R<name> n+ n- 10000Meg`（10GΩ 采样，读节点电压） |
| 电流表 | `V<name> n+ n- 0`（0V 电压源电流探针，读 `i(v<name>)`） |
| 示波器 | 不产生器件，记录 `* probe X<name>: V(<node>)`，后端读 raw 波形 |
| 导线 / 跳线 | `R<name> n+ n- 0.001`（近零电阻） |

生成的网表会同时注入 `backend/assets/models.lib` 中的 `.MODEL` / `.SUBCKT`，
使网表自包含、可直接交给 ngspice 仿真。

**接地规则**：只有 `gnd` 元件的引脚所在 net 映射到节点 `0`；电池正负极均不自动接地。

**核心设计**：前端只发送 `Circuit`（元件 + 引脚所落孔位），不关心 ngspice 细节；
后端负责「孔位 → net → SPICE 节点」映射、网表生成与仿真执行。
前端已通过 `HttpBackend` 对接真实后端（`index.ts` 默认走 HTTP/WS，设
`VITE_USE_MOCK=1` 可回退到 `MockBackend`）。

传输层：前端 vite 已把 `/api`、`/ws` 代理到 `127.0.0.1:8787`，
Rust 后端在此端口启动 HTTP/WebSocket 服务即可对接。

## 面包板 SVG 几何/电气约定

`breadboard.svg` 是一块竖版无焊面包板（约等于标准 MB-102 旋转 90°）：

- **电源轨**：左/右各两条纵向轨（红 `+`、蓝 `-`），每条轨纵向连通 → 4 条 net；
- **端子排**：被纵向凹槽分成左 5 列 / 右 5 列，每列 30 孔；
  - 每一「横排」在左组（或右组）内部横向连通 5 孔 → 30 行 × 2 组 = 60 条 net。

这些几何/连通约定已编码在 `frontend/src/layout/breadboardLayout.ts`，
后续做网表时由后端据此推导电气节点。
