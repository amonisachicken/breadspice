# Breadboard Simulator · BreadSpice

> [中文](README.md)

A **virtual breadboard**: drag components and wire them up in the browser like a real circuit, then the backend compiles the layout into a netlist with **Rust + ngspice** and runs a real simulation, streaming results back to the frontend.

| Layer | Stack |
| --- | --- |
| Frontend | Vite 5 + Vanilla TypeScript (SVG rendering, drag-and-drop interaction) |
| Backend | Rust (axum 0.7 / tokio / serde) + ngspice 39 (CLI subprocess) + rustfft 6 + ffmpeg |
| Transport | HTTP JSON-RPC + WebSocket event stream, with mirrored protocol types on both ends |

> This project builds on the open-source work of [ngspice](https://github.com/ngspice/ngspice) (BSD-3-Clause) and
> [DIY Layout Creator](https://github.com/bancika/diy-layout-creator) (GPL-3.0);
> see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). License: GNU GPL v3.0 (see [LICENSE](LICENSE)).

## Features

- ✅ Breadboard SVG rendering + layout generator, holes aligned with a real solderless breadboard
- ✅ Component library: resistor, capacitor, potentiometer, 2 diodes (1N4148 / 1N5817), 3 LEDs (red/green/blue),
  4 transistors (BC549C NPN / BC559C PNP / J201 JFET / 2N7000 NMOS),
  OP07 op-amp / OP207 dual op-amp, battery, sine generator, audio input, voltmeter, ammeter, oscilloscope, straight/curved wire, ground GND
- ✅ Drag to place, arbitrary rotation (blue dot / `R` for 90°), pin stretching (green dot), rigid IC lock, wires (straight/curved + color)
- ✅ Double-click properties: value + unit, sine parameters (frequency/AC/DC/phase), potentiometer (total resistance + ratio slider),
  wire color, meter readings, oscilloscope, semiconductor/IC pin description
- ✅ Save layout (`.bread`) / undo / redo / download / import / preview mode; simulation options persist with the layout (outside the undo/redo stack)
- ✅ Netlist generation + real ngspice simulation: `op` / `dc` / `ac` / `tran` (default `tran`, with configurable start time and duration)
- ✅ Live voltmeter / ammeter readings
- ✅ Oscilloscope: waveform (engineering prefixes), ac-mode dB response (logarithmic x-axis with **dec** ticks), one-click **FFT spectrum** for tran + sine source (log frequency axis, dB y-axis)
- ✅ Audio input: upload audio (ffmpeg transcodes to 44.1kHz / 16-bit / mono) or pick a built-in preset note (C / A / G / E / D)
- ✅ Oscilloscope "▶ Play" to preview and "Download WAV" to export 44.1kHz 16-bit mono audio
- ✅ Editing locked during simulation (preview-like mode); "⏹️ Stop" cancels gracefully (keeps the partial waveform already computed)
- ✅ Circuits with an audio input only allow `tran` (other analysis types are grayed out)
- ✅ Bilingual Chinese/English UI ("中/EN" plain-text toggle button at bottom-left)

## Getting Started

### Dependencies

- **Rust** toolchain (rustc / cargo)
- **ngspice** (`ngspice -b` executable)
- **ffmpeg** (for audio upload transcoding)
- **Node.js + npm** (frontend)

### Backend

```bash
cd backend
cargo build
cargo test       # unit tests + integration tests that really run ngspice (auto-skipped if ngspice is missing)
cargo run        # start the server on 127.0.0.1:8787 (override with BREADSPICE_BIND)
```

- The ngspice driver uses a **CLI subprocess** (`ngspice -b -r result.raw`): `-r` writes an incremental ASCII rawfile, which is then parsed into structured results.
- Audio transcoding requires **ffmpeg** (uploaded audio → 44.1kHz / 16-bit / mono PCM → inline PWL voltage source).

### Frontend

```bash
cd frontend
npm install
npm run dev        # dev server at http://localhost:5173; /api and /ws are proxied to 127.0.0.1:8787
npm run build      # type-check + production build
```

> The frontend talks to the real Rust backend by default (`HttpBackend`). For offline debugging, set `VITE_USE_MOCK=1` to fall back to the local `MockBackend` (placeholder implementation, no real simulation).

## Usage

1. Start the backend and frontend, then open http://localhost:5173.
2. Drag components from the right palette onto the breadboard; drag the blue dot to rotate, the green dot to stretch pins, or press `R` to rotate.
3. Double-click the blue dot to set value / unit / color / sine parameters; double-click semiconductors / ICs to view pin descriptions.
4. Place a "Ground GND" component to set the ground reference explicitly (batteries are no longer auto-grounded).
5. Click "▶️ Simulate" to run (defaults to `tran`; switch `op` / `dc` / `ac` / `tran` in "Simulation Options").
6. Double-click a voltmeter / ammeter to read values; double-click an oscilloscope to view waveforms ("▶ Play" / "Download WAV", and "FFT" for tran + sine source).
7. Audio input: double-click to upload audio, or click a colored note button to pick a preset, then wire it up and simulate.

## Directory Structure

```
breadboard/
├── frontend/                        # frontend (Vite + Vanilla TypeScript)
│   └── src/
│       ├── assets/                  # breadboard & component SVG (DIYLC assets)
│       ├── types/                   # domain.ts (domain model), protocol.ts (wire protocol)
│       ├── components/              # catalog.ts (component catalog + programmatic symbols)
│       ├── backend/                 # Backend interface + HttpBackend / MockBackend / simResults / wav
│       ├── layout/                  # breadboardLayout.ts (SVG-aligned layout generation)
│       ├── interaction/             # drag.ts (drag gestures), placement.ts (geometry/snapping)
│       ├── render/                  # svgAsset / breadboard / parts / placedComponents
│       ├── store/                   # circuitStore (state + undo/redo), projectStore (save/import/export)
│       ├── i18n.ts                  # Chinese/English dictionary & language switching
│       ├── main.ts                  # entry point (interaction dispatch, dialogs, toolbar)
│       └── style.css
└── backend/                         # Rust backend
    ├── assets/
    │   ├── models.lib               # ngspice device model library (.MODEL / .SUBCKT, LTspice fields stripped)
    │   └── presets/                 # embedded preset-note PCM (C/A/G/E/D, 44.1kHz 16-bit mono)
    └── src/
        ├── domain.rs                # Rust structs mirroring domain.ts
        ├── protocol.rs              # wire protocol types mirroring protocol.ts
        ├── models.rs                # model library embedding (include_str!)
        ├── audio.rs                 # audio upload (ffmpeg transcode + PCM→PWL + in-memory registry)
        ├── presets.rs               # embedded preset notes (include_bytes!, converted to PWL on demand and cached)
        ├── netlist.rs               # netlist generation (hole→net→SPICE node + model injection + grounding)
        ├── ngspice.rs               # ngspice driver (CLI subprocess + rawfile parsing + graceful cancel)
        ├── fft.rs                   # oscilloscope FFT (rustfft, DC removal + Hann window + dB spectrum)
        ├── server.rs                # HTTP/WebSocket server (axum)
        ├── lib.rs
        └── main.rs
```

## Simulation Analysis Types

| Type | Parameters | Description |
| --- | --- | --- |
| `op` | — | DC operating point; returns node voltages |
| `dc` | `source` `start` `stop` `step` | DC sweep (`.dc`) over a voltage source |
| `ac` | `type` (dec/oct/lin) `points` `start` `stop` | AC frequency response (`.ac`); defaults to `dec` 100 points 20–20000Hz |
| `tran` | `step` `start` `duration` | Transient analysis (`.tran`); defaults to step 1e-5, start 0.19s, duration 0.01s |

- **ac response**: the oscilloscope converts amplitude to dB (`20·log10(|v|/√2)`, 1V RMS = 0dB), and the x-axis is drawn on a **log (decade)** scale with powers-of-ten ticks.
- **FFT spectrum**: available only for `tran` with a sine generator present; the backend removes DC + applies a Hann window + FFT, with a logarithmic frequency axis (0–40kHz) and dB y-axis.
- Circuits containing an audio input can only run `tran`.

## Component → ngspice Model Mapping

| Component | Backend ngspice model |
| --- | --- |
| Resistor / Capacitor | `R<name> n+ n- <value>` / `C<name> ...` |
| Potentiometer | Two series resistors `R<name>A` (pins 1-2, R1) and `R<name>B` (pins 2-3, R2); `R1 = total × ratio`; a 0.001Ω floor is used at the end stops |
| Diode / LED | `D<name> n+ n- <model>` (LED: red/green/blue → `LedRed`/`LedGreen`/`LedBLUE`) |
| BJT | `Q<name> C B E <model>` (NPN/PNP) |
| MOS / JFET | `M<name> D G S <model>` / `J<name> D G S <model>` |
| Op-amp OP07 | `X<name> <IN+> <IN-> <V+> <V-> <OUT> OP07A` |
| OP207 dual op-amp | Two `X<name>A/B ... OP07A` subcircuits sharing `V+` / `V-` |
| Battery (DC source) | `V<name> n+ n- <voltage>` |
| Sine generator | `V<name> n+ n- DC <dc> AC <ac> SIN(<dc> <ac> <freq> 0 0 <phase>)` |
| Audio input | `V<name> n+ n- PWL(<44.1kHz PCM, inlined point-by-point>)` |
| Voltmeter | `R<name> n+ n- 10000Meg` (10GΩ sampler, reads the voltage across its terminals) |
| Ammeter | `V<name> n+ n- 0` (0V voltage-source current probe, reads `i(v<name>)`) |
| Oscilloscope | No device; records `* probe X<name>: V(<node>)` |
| Ground / GND | No device; the net its pin sits on maps to node `0` (records `* gnd <name>`) |
| Wire / jumper | `R<name> n+ n- 0.001` (near-zero resistance) |

The generated netlist injects the `.MODEL` / `.SUBCKT` definitions from `models.lib`, making it self-contained and directly runnable by ngspice.

## Backend API

| Endpoint | Description |
| --- | --- |
| `GET /` | Health check |
| `POST /api` | JSON RPC: `ping` / `list_models` / `build_netlist` / `simulate` |
| `POST /api/upload` | Upload audio (raw bytes → ffmpeg transcode → returns `{ id, duration }`) |
| `POST /api/stop` | Abort the running simulation |
| `POST /api/fft` | FFT of a tran waveform (`{ x, y }` → `{ x: frequency Hz[], y: dB[] }`) |
| `GET /api/preset/:name` | Returns the WAV of a built-in preset note (for in-page playback) |
| `GET /ws` | Event stream (`simulation_started` / `simulation_done` / `backend_status`, etc.) |

The frontend goes through the stable `Backend` interface (`frontend/src/backend/Backend.ts`), consistent with the backend `protocol.rs` contract.

## Key Design

- **Netlist generation**: the frontend sends only a `Circuit` (components + the holes their pins land on); the backend handles the "hole → net → SPICE node" mapping, netlist generation and model injection, so the frontend never touches ngspice details.
- **Grounding**: only the net connected to a `gnd` component maps to node `0`; batteries are never auto-grounded.
- **Device models**: `models.lib` centralizes `.MODEL` / `.SUBCKT` (LTspice-specific fields like `mfg=` and `type=` have been removed).
- **ngspice driver**: CLI subprocess + `-r` incremental rawfile; simulation results carry a `cancelled` flag to support graceful cancellation while keeping partial waveforms.
- **ac result parsing**: in `-r` mode the ac `frequency` independent variable carries an uninitialized imaginary part, so column 0 is read as its real part and the rest as magnitudes.
- **FFT**: rustfft forward transform with DC removal (mean subtraction) then a Hann window; amplitude `4·|X|/N`, dB is `20·log10(amplitude/√2)`, with max-pooling on the log frequency axis to avoid missing narrow peaks.
- **Audio**: uploaded or preset audio is normalized to 44.1kHz 16-bit mono PCM and turned into an inline PWL voltage source at runtime.
- **Preset notes**: the C/A/G/E/D example clips are embedded as PCM at compile time and converted to PWL on demand with caching.

## Breadboard SVG Geometry / Electrical Conventions

`breadboard.svg` is a vertical solderless breadboard (roughly a standard MB-102 rotated 90°):

- **Power rails**: two vertical rails on each side (red `+`, blue `-`), each connected vertically → 4 nets;
- **Terminal strips**: split by a vertical groove into 5 left / 5 right columns, 30 holes each;
  - each "row" connects 5 holes horizontally within the left (or right) group → 30 rows × 2 groups = 60 nets.

These geometry/connectivity conventions are encoded in `frontend/src/layout/breadboardLayout.ts`, from which electrical nodes are derived during netlist generation.

## License

GNU GPL v3.0 ([LICENSE](LICENSE)). Third-party notices: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
