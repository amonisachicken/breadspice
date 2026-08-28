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
  - 完整许可证文本见 [`LICENSES/GPL-3.0.txt`](LICENSES/GPL-3.0.txt)。
- **版权**：`Copyright (C) Bane Stojković (bancika) and contributors`
- **本项目用途**：参考其面包板 / 元件布局相关的成果（元件符号绘制、洞洞板/面包板布局理念等）。

> ⚠️ **GPL 提示**：GPL-3.0 是 copyleft 许可证。如果本项目直接引用、修改或以衍生作品形式分发 DIYLC 的代码或资源，那么本项目（作为整体）的分发也需遵循 GPL-3.0。当前本项目以“参考/借鉴其成果”为主，若后续直接纳入 DIYLC 的代码/资源，请相应调整本项目的整体许可证。

---

## 附：本项目自身许可证

本项目（breadspice）尚未指定整体开源许可证。鉴于使用了 GPL-3.0 的 DIYLC 成果，后续正式发布前建议明确本项目许可证（如采用 GPL-3.0，或确认未直接纳入 GPL 代码后采用 BSD/MIT 等兼容许可证）。
