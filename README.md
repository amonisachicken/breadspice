# 面包板仿真 · BreadSpice

一个**虚拟面包板**：在面包板上拖拽元件搭建电路，后端用 **Rust + ngspice** 生成网表并执行真实仿真。
前端 **Vite + Vanilla TypeScript** 负责渲染与交互，通过 HTTP/WebSocket 对接后端仿真服务。

> 本项目使用了 [ngspice](https://github.com/ngspice/ngspice)（BSD-3-Clause）与
> [DIY Layout Creator](https://github.com/bancika/diy-layout-creator)（GPL-3.0）的开源成果，
> 相应声明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。许可证：GNU GPL v3.0（见 [LICENSE](LICENSE)）。

## 功能特性

- ✅ 面包板 SVG 渲染 + 布局生成器对齐真实孔位
- ✅ 元件库：电阻、电容、二极管 ×2、LED ×3、晶体管 ×4（NPN/PNP/JFET/MOS）、运放 OP07、OP207 双运放、
  电池、正弦波发生器、音频输入、电压表、电流表、示波器、直/弯导线、接地/GND
- ✅ 拖拽放置、任意旋转（蓝点 / `R` 键 90°）、引脚伸缩（绿点）、IC 刚性锁定、导线（直/弯 + 颜色）
- ✅ 双击属性：数值+单位、正弦参数、导线颜色、仪表读数、示波器、半导体/IC 介绍
- ✅ 保存布局（`.bread`）/ 撤销 / 重做 / 下载 / 导入 / 预览模式
- ✅ 网表生成 + 真实 ngspice 仿真（`op` / `dc` / `ac` / `tran`，默认 `tran`，tran 支持起始时间/持续时长，ac 默认 dec 100 点 20–20000Hz）
- ✅ 电压表/电流表实时读数；示波器波形（m/μ/n/p 词头刻度、ac 模式 dB 频响、tran+正弦源可做 FFT 频谱）
- ✅ 音频输入：上传音频（ffmpeg 转码为 44.1kHz / 16-bit / 单声道）或选择内嵌预设音符（C/A/G/E/D）
- ✅ 示波器可「▶ 播放」预览波形、「下载 WAV」导出 44.1kHz 16-bit 单声道音频
- ✅ 仿真中锁定编辑（类预览模式）；「⏹️ 停止」优雅取消（保留已算出的部分波形）
- ✅ 电路含音频输入时仅允许 `tran` 仿真（其余模式灰显）

## 目录结构

```
breadboard/
├── frontend/                        # 前端（Vite + Vanilla TypeScript）
│   └── src/
│       ├── assets/                  # 面包板与元件 SVG（DIYLC 资产）
│       ├── types/                   # domain.ts（领域模型）、protocol.ts（通信协议）
│       ├── components/              # catalog.ts（元件目录 + 程序化符号）
│       ├── backend/                 # Backend 接口 + HttpBackend / MockBackend / simResults / wav
│       ├── layout/                  # breadboardLayout.ts（SVG 对齐的布局生成）
│       ├── interaction/             # drag.ts（拖拽手势）、placement.ts（几何/吸附）
│       ├── render/                  # svgAsset / breadboard / parts / placedComponents
│       ├── store/                   # circuitStore（状态+撤销重做）、projectStore（保存/导入导出）
│       ├── main.ts                  # 入口（交互委托、对话框、工具栏）
│       └── style.css
└── backend/                         # Rust 后端
    ├── assets/
    │   ├── models.lib               # ngspice 器件模型库（.MODEL / .SUBCKT，已清理 LTspice 字段）
    │   └── presets/                 # 内嵌预设音符 PCM（C/A/G/E/D，44.1kHz 16-bit 单声道）
    └── src/
        ├── domain.rs                # 与 domain.ts 对应的 Rust 结构体
        ├── protocol.rs              # 与 protocol.ts 对应的通信协议类型
        ├── models.rs                # 模型库嵌入（include_str!）
        ├── audio.rs                 # 音频上传（ffmpeg 转码 + PCM→PWL + 内存注册表）
        ├── presets.rs               # 内嵌预设音符（include_bytes!，按需转 PWL 并缓存）
        ├── netlist.rs               # 网表生成（孔位→net→SPICE 节点 + 模型注入 + 接地）
        ├── ngspice.rs               # ngspice 驱动（CLI 子进程 + rawfile 解析 + 优雅取消）
        ├── server.rs                # HTTP/WebSocket 服务（axum）
        ├── lib.rs
        └── main.rs
```

## 运行

### 后端（需 Rust 工具链 + ngspice + ffmpeg）

```bash
cd backend
cargo build
cargo test       # 单元测试 + 真跑 ngspice 的集成测试（找不到 ngspice 时自动跳过）
cargo run        # 启动服务，监听 127.0.0.1:8787
```

- ngspice 驱动采用 **CLI 子进程**（`ngspice -b`）：`-r` 增量写出 ASCII rawfile，再解析成结构化结果。
- 音频转码需要 **ffmpeg**（上传音频 → 44.1kHz / 16-bit / 单声道 PCM → 内联 PWL 电压源）。

### 前端

```bash
cd frontend
npm install
npm run dev        # 开发服务器 http://localhost:5173，/api、/ws 已代理到 127.0.0.1:8787
npm run build      # 类型检查 + 产物构建
```

> 前端默认连真实 Rust 后端（`HttpBackend`）。离线调试可设 `VITE_USE_MOCK=1` 回退到 `MockBackend`。

## 使用

1. 启动后端和前端，打开 http://localhost:5173。
2. 从右侧元件库拖入元件到面包板；拖蓝点旋转、拖绿点伸缩引脚，`R` 键旋转。
3. 双击蓝点设置数值/单位/颜色/正弦参数；半导体/IC 双击查看介绍。
4. 放置「接地/GND」元件指定地参考（电池不再自动接地）。
5. 点「▶️ 仿真」运行（默认 tran，可用「仿真选项」切换 op/dc/ac/tran）。
6. 双击电压表/电流表看读数；双击示波器看波形（可「▶ 播放」/「下载 WAV」）。
7. 音频输入：双击上传音频，或点彩色音符按钮选预设，再搭电路仿真。

## 元件 → ngspice 模型映射

| 元件 | 后端 ngspice 模型 |
| --- | --- |
| 电阻 / 电容 | `R<name> n+ n- <值>` / `C<name> ...` |
| 二极管 / LED | `D<name> n+ n- <型号>`（LED：red/green/blue → `LedRed`/`LedGreen`/`LedBLUE`） |
| 三极管（BJT） | `Q<name> C B E <型号>`（NPN/PNP） |
| MOS / JFET | `M<name> D G S <型号>` / `J<name> D G S <型号>` |
| 运放 OP07 | `X<name> <IN+> <IN-> <V+> <V-> <OUT> OP07A` |
| OP207 双运放 | 两个 `X<name>A/B ... OP07A` 子电路，共用 `V+` / `V-` |
| 电池（DC 源） | `V<name> n+ n- <电压>` |
| 正弦波发生器 | `V<name> n+ n- SIN(dc ac freq 0 0 phase)` |
| 音频输入 | `V<name> n+ n- PWL(<44.1kHz PCM 逐点内联>)` |
| 电压表 | `R<name> n+ n- 10000Meg`（10GΩ 采样，读两端电压差） |
| 电流表 | `V<name> n+ n- 0`（0V 电压源电流探针，读 `i(v<name>)`） |
| 示波器 | 不产生器件，记录 `* probe X<name>: V(<node>)` |
| 接地 / GND | 不产生器件，其引脚所在 net 映射到节点 `0`（记录 `* gnd <name>`） |
| 导线 / 跳线 | `R<name> n+ n- 0.001`（近零电阻） |

生成的网表会注入 `models.lib` 中的 `.MODEL` / `.SUBCKT`，使网表自包含、可直接交给 ngspice。

## 后端接口

| 端点 | 说明 |
| --- | --- |
| `GET /` | 健康检查 |
| `POST /api` | JSON RPC：`ping` / `list_models` / `build_netlist` / `simulate` |
| `POST /api/upload` | 上传音频（原始字节 → ffmpeg 转码 → 返回 `{ id, duration }`） |
| `POST /api/stop` | 提前终止正在运行的仿真 |
| `GET /api/preset/:name` | 返回内嵌预设音符的 WAV（供网页播放） |
| `GET /ws` | 事件流（`simulation_started` / `simulation_done` / `backend_status` 等） |

前端通过稳定的 `Backend` 接口（`frontend/src/backend/Backend.ts`）对接，与后端 `protocol.rs` 契约一致。

## 关键设计

- **网表生成**：前端只发送 `Circuit`（元件 + 引脚所落孔位），后端负责「孔位 → net → SPICE 节点」映射、
  网表生成与模型注入，前端不关心 ngspice 细节。
- **接地**：只有 `gnd` 元件的引脚所在 net 映射到节点 `0`；电池正负极均不自动接地。
- **器件模型**：`models.lib` 集中管理 `.MODEL` / `.SUBCKT`（已移除 LTspice 专属字段如 `mfg=`、`type=`）。
- **ngspice 驱动**：CLI 子进程 + `-r` 增量写 rawfile；仿真结果含 `cancelled` 标记，支持优雅取消并保留部分波形。
- **音频**：上传或预设音频统一转成 44.1kHz 16-bit 单声道 PCM，运行时转成内联 PWL 电压源。
- **预设音符**：C/A/G/E/D 示例音频编译期内嵌为 PCM，运行时按需转 PWL 并缓存。

## 面包板 SVG 几何/电气约定

`breadboard.svg` 是一块竖版无焊面包板（约等于标准 MB-102 旋转 90°）：

- **电源轨**：左/右各两条纵向轨（红 `+`、蓝 `-`），每条轨纵向连通 → 4 条 net；
- **端子排**：被纵向凹槽分成左 5 列 / 右 5 列，每列 30 孔；
  - 每一「横排」在左组（或右组）内部横向连通 5 孔 → 30 行 × 2 组 = 60 条 net。

这些几何/连通约定编码在 `frontend/src/layout/breadboardLayout.ts`，网表生成时据此推导电气节点。
