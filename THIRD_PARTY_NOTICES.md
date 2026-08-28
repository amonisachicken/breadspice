# 第三方开源软件声明 / Third-Party Notices

本项目 **breadspice**（虚拟面包板）会使用下列开源项目的成果。依据它们各自的开源许可证，在本项目中进行如下声明。各许可证的完整文本存放于 [`LICENSES/`](LICENSES/) 目录。

---

## 1. ngspice

- **项目**：ngspice — the open source Spice circuit simulator
- **仓库**：<https://github.com/ngspice/ngspice>
- **许可证（SPDX）**：`BSD-3-Clause`
  - 核心模拟电路仿真代码（源自 Spice3f5，加利福尼亚大学伯克利分校）采用 **New BSD（BSD-3-Clause）** 许可证；
  - 项目整体为“异构许可证”集合：另有 `LGPL`（numparam / adms / tclspice）、`Old BSD`（cider）、`Public Domain`（xspice）等组件。完整说明见 [`LICENSES/ngspice-COPYING.txt`](LICENSES/ngspice-COPYING.txt)。
- **版权**：
  - `Copyright (c) 1985-1991 The Regents of the University of California.`（Spice3f5）
  - ngspice 各贡献者（`Ngspice 26`，`Copyright (c) 2014` 及后续）
- **本项目用途**：后端以 ngspice 作为电路仿真引擎，用于执行网表仿真（op / dc / ac / tran）。

BSD-3-Clause 许可要点（详见 [`LICENSES/ngspice-COPYING.txt`](LICENSES/ngspice-COPYING.txt)）：

> Redistribution and use in source and binary forms, with or without
> modification, are permitted provided that the following conditions are met:
> 1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
> 2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
> 3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.
>
> THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES … ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES …

---

## 2. DIY Layout Creator (DIYLC)

- **项目**：DIY Layout Creator
- **仓库**：<https://github.com/bancika/diy-layout-creator>
- **许可证（SPDX）**：`GPL-3.0`
  - 完整许可证文本见 [`LICENSE`](LICENSE)。
- **版权**：`Copyright (C) Bane Stojković (bancika) and contributors`
- **本项目用途**：本项目直接使用了 DIYLC 的面包板与元件 SVG 资源（`frontend/src/assets/breadboard.svg`、`frontend/src/assets/parts.svg`），以及其面包板 / 元件布局相关的成果。

> 由于直接使用了 DIYLC（GPL-3.0）的资源，本项目整体采用 GPL-3.0 许可证（见下文）。

---

## 本项目自身许可证

本项目 **breadspice** 采用 **GNU General Public License v3.0（GPL-3.0）** 许可证，完整文本见 [`LICENSE`](LICENSE)。

Copyright (C) 2025 amonisachicken and contributors.
