# Scanf · 代码阅读空间

**从项目结构出发，沿着函数调用读懂代码。** 多语言代码阅读插件，支持 VS Code / Cursor、DeepSeek Harness 和通用 MCP Agent。

[![Release](https://img.shields.io/github/v/release/IweirdoI/scanf)](https://github.com/IweirdoI/scanf/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

[下载安装](#installation) · [使用指南](docs/INSTALL.md) · [报告问题](https://github.com/IweirdoI/scanf/issues/new/choose) · [English](README.en.md)

![Scanf 完整源码、双树与参数对照](docs/images/workspace.png)

- **VS Code 原生阅读**：源码、文件树、标签、搜索与跳转沿用编辑器；Scanf 只补充逻辑导航和函数解释。
- **分叉关系图**：用节点与连线阅读调用和包含关系，箭头区分调用方向，虚线区分所属关系；点击节点直接定位原生源码。
- **DSH / MCP 阅读窗口**：小窗口看树和片段，大工作台对照完整源码与参数。
- **可选 AI 解读**：填写自己的 OpenAI 兼容 API，悬停查看解释，或解读整个函数。
- **源码证据**：参数类型、注释、实际使用位置；动态关系和未知用途明确标注。
- **混合语言项目**：TS / JS、Python、C / C++、Java、Rust、Go 共用文件树、入口树和源码导航；解析器随包安装，不需要各语言工具链。[支持范围](docs/LANGUAGES.md)

<a id="installation"></a>
## 安装：不需要编译源码

### VS Code / Cursor

1. [下载最新 VSIX](https://github.com/IweirdoI/scanf/releases/latest/download/scanf-code-reader-0.9.0.vsix)。
2. 编辑器扩展页 → `…` → **Install from VSIX / 从 VSIX 安装**，选择下载文件。
3. 打开自己的项目（可以包含多种语言），命令面板运行 **Scanf: 打开逻辑导航**，或在原生资源管理器下方打开 **Scanf · 逻辑关系图**。

也可以在下载目录执行：

```sh
code --install-extension scanf-code-reader-0.9.0.vsix
```

扩展已打包依赖，无需单独安装 Node.js。当前通过 GitHub Releases 分发，**尚未上架 VS Code Marketplace / Open VSX**。

### DeepSeek Harness

在 DSH 插件页选择本地安装，选取 [DSH 插件包](https://github.com/IweirdoI/scanf/releases/latest/download/dsh-scanf-reader-0.9.0.tgz)。或下载后执行：

```sh
dsh plugin --profile desktop add ./dsh-scanf-reader-0.9.0.tgz
```

重新启动 DSH，在项目会话右侧栏的新标签页中选择 **Scanf 代码阅读**。它自动读取当前会话目录；需要换目录时点“切换项目”。已实测 DSH Desktop **0.2.2-rc.5**，其他版本尚待验证。详见 [安装排错](docs/INSTALL.md#dsh)。

### 通用 MCP：Codex / Cursor / 其他 Agent

需要 **Node.js 22+**，不需要下载源码或运行 build：

```sh
npm install -g https://github.com/IweirdoI/scanf/releases/download/v0.9.0/scanf-reader-0.9.0.tgz
scanf-reader setup --root "/absolute/path/to/your-project"
```

将输出的 `mcpServers` 配置粘贴到客户端的 MCP 设置中。Codex CLI 可直接添加：

```sh
codex mcp add scanf -- scanf-reader mcp --root "/absolute/path/to/your-project"
```

先说：“用 Scanf 打开项目结构，找出入口，解释这个函数。”支持 MCP Apps 的宿主可显示阅读窗口；其他宿主仍能读取结构化工具结果。**Codex 原生 diff 自动联动尚未验收**。MCP 版目前由当前 Agent 提供解释；自填 API 和自动悬停在 VS Code / DSH 插件提供。

命令行预览：`scanf-reader preview --root "/your/project"`；帮助：`scanf-reader --help`。[完整配置说明](docs/INSTALL.md#mcp)

## 开始阅读

### VS Code / Cursor

源码始终在原生编辑器中。在资源管理器下方打开 Scanf 逻辑关系图后，图跟随光标所在函数；点击调用 / 调用者节点直接跳到源码。图钉按钮固定当前阅读位置，再次点击恢复跟随。多工作区会根据当前文件切换项目根目录。

原生资源管理器上方仍显示正常项目文件夹和文件，支持点击、展开、右键、新建、重命名与拖动。下方 **Scanf · 逻辑关系图** 显示分叉图：绿色箭头表示调用，紫色虚线表示包含，金色反向箭头表示调用方。可选择入口与层数、滚动 / 适宽，或点击 **大图** 在原生源码旁展开；大图只展示关系，不复制编辑器。

函数上方的 **Scanf: 解读函数** 或编辑器右键 **解释当前函数** 将解读显示在侧栏。参数说明和证据行号也在侧栏，点击回到原生编辑器；悬停参数可查看源码说明，无需 Key。模型 API 通过命令 **Scanf: 配置模型 API** 的原生输入框设置，Key 使用密码输入与凭据存储。**Scanf: 扩展设置** 可调整索引上限和函数解读按钮显示。

### DSH / MCP 通用工作台

打开文件或函数 → 按需切到“逻辑入口” → 点调用节点或 `F12 / Ctrl+单击` 跳到定义 → 用 `Alt+←` 返回。

`Ctrl / Cmd+K` 搜索文件与符号，`Ctrl / Cmd+G` 跳到行。标签右侧 **×** 或鼠标中键关闭文件。明暗主题可切换，大窗导航栏可拖动调宽。

DSH 工作台右上角 **星光按钮** 打开模型设置：填写 API 地址、模型名、Key → **测试连接**。勾选自动悬停后，在源码词语上停留即可显示解释。也可关掉自动调用，改为点击浮层中的解释按钮。

![模型设置](docs/images/model-settings.png)

## 数据与边界

- 默认静态分析在本机执行，不执行被分析项目、不修改源码。基础阅读无需 API Key。
- 用户启用模型解释时，会向所配置服务商发送附近源码 / 当前函数的有限片段，可能产生调用费用。Key 由 VS Code SecretStorage 或 DSH credentials 保存，不写进项目或浏览器 localStorage。
- 支持 TS / JS、Python、C / C++、Java、Rust、Go 混合项目；默认最多 150 文件、每文件 256 KiB、总计 8 MiB，所有语言共享预算。大型仓库建议打开功能目录。
- 调用关系是静态分析结果，不是运行轨迹；反射、DI、多态或动态调用可能无法解析。
- VS Code 原生编辑器与 Scanf 阅读器支持悬停；DSH 支持 **Scanf 阅读面板**，不向 DSH 独立文件预览注入悬停。
- TS / JS 保留编译器语义分析；其他语言共享 Tree-sitter 语法分析。动态分派、构建条件、宏与跨语言 RPC / FFI 不推断为真实调用；混合项目索引不等于跨语言调用链已经解析。
- 核心测试覆盖混合项目、作用域、导入及离线安装包；界面测试覆盖完整源码、双树与跳转。AI 链路使用本机模拟 API 验证；不代表第三方模型质量或可用性已经验证。

## 开发与贡献

```sh
git clone https://github.com/IweirdoI/scanf.git
cd scanf
npm ci
npm run check
npm run build
npm test
npx playwright install chromium
npm run test:ui
```

Node.js 22+。UI 测试本地默认 Edge，CI 使用 Chromium。`.github/workflows` 提供 Windows / Linux CI 和手动触发的 Release，发布流程生成三个预构建安装包与校验文件。[贡献指南](CONTRIBUTING.md) · [发布流程](docs/RELEASING.md) · [更新记录](CHANGELOG.md) · [接入细节](docs/INTEGRATIONS.md)

## 致谢与许可

参考 [CodeTour](https://github.com/microsoft/codetour) 的源码导览、[Continue](https://github.com/continuedev/continue) 的侧栏体验与安装组织、[GitNexus](https://github.com/abhigyanpatwari/GitNexus) 的结构探索、[AST Explorer](https://github.com/fkling/astexplorer) 的源码 / 树联动。Scanf 为独立实现，未 fork 上述项目。

基于 TypeScript Compiler API、Tree-sitter、CodeMirror 6、MCP Apps、Lucide 等构建。[MIT](LICENSE)；第三方许可见 [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt)。
