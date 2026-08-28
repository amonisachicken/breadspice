# 虚拟面包板 · Virtual Breadboard

用 **Rust + ngspice** 做后端仿真、**JavaScript(TS)** 做前端交互的虚拟面包板：
在面包板上拖拽元件进行布局，每个元件对应一个 ngspice 模型，后端据此生成网表并仿真。

> 本项目使用了 [ngspice](https://github.com/ngspice/ngspice)（BSD-3-Clause）与
> [DIY Layout Creator](https://github.com/bancika/diy-layout-creator)（GPL-3.0）的开源成果，
> 相应声明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
>
> **许可证**：本项目采用 [GNU GPL v3.0](LICENSE)。

## 当前进度

- ✅ 前端工程（Vite + Vanilla TypeScript）
- ✅ 面包板 SVG 资产（`frontend/src/assets/breadboard.svg`）与元件库 SVG（`parts.svg`）已接入
- ✅ 面包板布局生成器对齐真实 SVG 孔位（`frontend/src/layout/breadboardLayout.ts`）
- ✅ 渲染器：内联 SVG + 叠加逻辑孔位命中层（`frontend/src/render/breadboard.ts`）
- ✅ 元件拖拽：符号拆分 + 引脚标注 + 拖拽吸附 + R 旋转 + 放置存储
  （`src/components/catalog.ts`、`src/interaction/drag.ts`、`src/store/circuitStore.ts`）
- ✅ 前后端共享契约（领域模型 + 后端接口 + 协议类型 + Mock 后端）
- ✅ Rust 后端骨架（domain / netlist / ngspice 占位）
- ⏳ 元件参数编辑 / 多引脚精确对齐细化
- ⏳ ngspice 接入与真实仿真（后续）

## 目录结构

```
breadboard/
├── frontend/               # 前端（Vite + TS）
│   └── src/
│       ├── assets/         # 面包板与元件 SVG（用户提供）
│       ├── types/          # domain.ts（领域模型）、protocol.ts（通信协议）
│       ├── backend/        # Backend 接口 + MockBackend + 解析器单例
│       ├── layout/         # breadboardLayout.ts（SVG 对齐的布局生成）
│       ├── render/         # svgAsset.ts / breadboard.ts / parts.ts
│       ├── main.ts         # 入口
│       └── style.css
└── backend/                # Rust 后端（骨架）
    └── src/
        ├── domain.rs       # 与前端 domain.ts 对应的 Rust 结构体
        ├── netlist.rs      # 网表生成（占位）
        ├── ngspice.rs      # ngspice 驱动接口（CLI / FFI 占位）
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
- 面包板 SVG 真实渲染；
- 右侧「元件库」列出元件符号，**拖拽到面包板即可放置**（拖拽中按 `R` 键 90° 旋转，引脚自动吸附最近孔位）；
- 点击已放置元件可选中（虚线高亮），按 `Delete` / `Backspace` 删除；
- 顶部「显示孔位」叠加显示逻辑孔位（蓝色圆点，验证与 SVG 对齐）；
- 顶部「生成网表」把当前放置的电路交给 `MockBackend`，打印元件目录与 SPICE 网表，验证接口链路；
- 顶部「清空电路」重置。

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
    `ComponentInstance`（元件实例）、`Circuit`（电路）。
- **通信协议**：`frontend/src/types/protocol.ts`
  - 请求/响应：`ping` / `list_models` / `build_netlist` / `simulate`；
  - 事件：仿真进度、实时波形、后端状态。

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
