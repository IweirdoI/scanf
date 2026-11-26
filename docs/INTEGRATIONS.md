# 三条接入链路（0.7）

## 共用模型

`src/project-analyzer.ts` 统一编排多语言快照：TS / JS 使用 `src/analyzer.ts` 的 TypeScript Compiler API；Python、C / C++、Java、Rust、Go 使用 `src/syntax-analyzer.ts` 的共享 Tree-sitter 提取器。`src/languages.ts` 维护扩展名、宿主语言 ID 和语法节点配置；`src/reader-model.ts` 投影双树，`media/reader.js` 渲染共用界面。详见 [语言支持与精度边界](LANGUAGES.md)。

0.5 共用界面加入明暗主题、统一图标、参数证据卡片和快速导航。`Ctrl / Cmd + K` / `P` 搜索文件和符号，`Ctrl / Cmd + G` 跳行；工作台在宽窗口可拖动导航分栏。新交互通过真实本机服务的浏览器测试；DSH 已移除地址输入页；后台自动启动并连接阅读服务，允许按会话记住自选项目。

## 两种阅读方式

小窗口显示树与代码预览，可逐次扩展前后 40 行。大工作台以完整文件为中心：CodeMirror 6 提供语法高亮、折叠、全文查找和行号；导航历史、文件标签、F12 / Ctrl+单击跳转由源码快照中的符号目标驱动。当前文件来自分析范围内的完整文本，不受旧版 160 行片段限制；原 `source` 字段仍是提供给轻量工具的有限片段，完整文本位于 `file.text`。

参数解释优先使用 JSDoc，其次整理实际使用方式，并展示类型、默认值和可点击证据。Agent 可在 `scanf_publish_explanation` 中提交 `parameters: [{ name, text, evidence }]`。服务验证参数名真实存在、证据位于函数范围、版本未过期。规则用法不代表业务用途；未知含义明确标注。定义跳转覆盖扫描到的函数、局部声明、类型和导入别名；动态 / 外部未解析目标没有伪造链接。

VS Code 的 CodeMirror 动态样式使用 webview nonce，保留严格 CSP。编辑器只读，不提供保存 / 重构。宿主没有扩大窗口能力时，仍可在现有面板使用完整文件布局；需要更宽的区域才能同时放下树、源码、解释三列。

- 项目树：目录 → 文件 → 函数 → 内部函数。嵌套采用 AST 父节点身份，不按同名或行号猜测。
- 逻辑入口树：模块初始化、回调注册候选、导出 API、无直接调用方候选。每类最多 40 个入口，入口调用投影最多 3 层 / 60 节点，合计最多 1600 节点；截断明确标记。入口名称 / 原因可筛选；切换源码不会重设入口路径。其他语言按 main 声明、Python __main__ 守卫和无调用方候选提供阅读起点；main 声明不代表构建系统一定启动它。
- 调用 / 依赖树：从选定节点展开。共同依赖标“共享引用”，递归标“递归”；默认最多 4 层、120 节点。树不是运行时执行顺序。
- 每份工作区快照带源码哈希。过期选择 / 解释会被拒绝；源码变化清除旧解释。
- 三种宿主共用模型与解析器；各进程目前独立索引，尚未跨宿主自动同步同一选区。

## 通用 MCP / Codex 面板

本地 Codex 开发安装（先构建，再绑定明确项目，避免未设置环境变量）：

```powershell
npm run build
node scripts/package-plugin.mjs --root D:/projects/scanf
codex plugin marketplace add D:/projects/scanf
codex plugin add scanf-reader@scanf-local
```

本仓库 `.agents/plugins/marketplace.json` 指向生成的插件目录。上面的 `--root` 会为本机包生成绝对 Node / 服务 / 项目路径，换项目需重生成并刷新安装。安装后重启宿主并在新会话使用；当前会话未必热加载新工具。不要把 `open_in_codex` 返回 queued 当成原生窗口验收。

2026-11-23 在此机已验证：插件安装且启用，Codex CLI 0.164.0 与桌面 bundled app-server 0.169.1 均发现 5 个 MCP 工具，并读取 MCP Apps HTML。可用 `node scripts/verify-codex.mjs <codex.exe 或 codex.js 的绝对路径>` 重跑，只做发现与资源读取，不创建会话 / 调用模型。结果在 `output/codex-connection-check.json`；`nativeWindowVerified` 仍为 false。

本地预览的连接令牌保存在当前标签页、同源的 sessionStorage 中，地址清理后刷新仍能重连；无令牌、401 或超时有可见错误，不会掉进等待 MCP 宿主的空白连接状态。

先运行 `npm ci`、`npm run build`。生成绑定到明确项目的通用 stdio MCP 配置：

```sh
node scripts/connection.mjs D:/projects/scanf/examples
```

脚本只输出配置，不修改用户文件。将输出的 command / args 填入客户端的 MCP 设置，再开新会话。Codex TOML 示例：

```toml
[mcp_servers.scanf]
command = "node"
args = ["D:/projects/scanf/dist/mcp.js", "--root", "D:/projects/scanf/examples"]
```

服务器必须显式提供 `--root` 或 `SCANF_PROJECT_ROOT`，不猜测宿主的当前工作目录。

工具包括：`scanf_project`（项目树）、`scanf_find_symbol`（最多 30 个候选）、`scanf_inspect`（局部源码、步骤和调用树）、`scanf_publish_explanation`（Agent 发布带有效行号证据的简要解释）、`scanf_open_reader`（打开面板）。解释只写入进程内存，不改源码，因此发布解释工具标为阅读状态写入。

示例提示词：“用 Scanf 读取 checkout 的源码和调用树，解释主流程及异常分支，把解释附行号发布到阅读面板，然后打开面板。”规则摘要与 Agent 解释分开展示。

工具声明标准 `_meta.ui.resourceUri` 和 OpenAI `thread` entrypoint，入口接受空参数。界面通过 MCP Apps SDK 请求工具和发送追问；UI HTML 自包含。纯文本客户端仍可调用工具。Agent 发布解释后，已打开面板可能需要手动刷新，不能保证宿主会把后续调用推到同一面板。

`.codex-plugin/plugin.json` 与 `.mcp.json` 是本地插件包模板。模板使用 `${PLUGIN_ROOT}` 和 `SCANF_PROJECT_ROOT`；跨客户端优先用上面的脚本生成绝对路径，避免变量展开差异。

**已验证**：本机 Codex 插件安装启用，真实 Codex app-server 发现工具 / 读取 UI，SDK stdio 客户端读取符号和调用树、过期版本、解释引用校验。**未验证**：Codex 原生 thread 窗口、消息回传、原生 diff 的文件 / 选区事件。没有给原生 diff 注入按钮。

## VS Code 深入阅读

VS Code 使用独立适配：在原生 Explorer 下注册关系图和函数说明两个视图，原有项目文件夹与文件浏览完整保留。`src/logic-graph.ts` 从共享 CodeMap 投影有分叉连线的有界树图，`src/native-graph.ts` 管理侧栏及按需大图；`src/native-details.ts` 提供文字与证据链接。`src/extension.ts` 负责原生源码定位、CodeLens、HoverProvider 和凭据。不载入通用工作台的 CodeMirror、文件树或自制标签。调用、包含、调用方使用不同线型和箭头；所属关系来自 AST parentId，而非调用边。最多 60 个展开节点，调用方另限 6 个；递归、共享与截断有标记。入口选择、1–3 层、适宽及 100% 支持窄侧栏阅读，按需大图只展示关系。多工作区随当前源码文件切换。

函数上方的 CodeLens 与右键命令触发当前函数解读，结果仅显示在侧栏；模型设置使用原生输入框 / 选项列表，Key 存在 SecretStorage。无需 Key 的基础参数悬停与可选自动 AI 悬停分开。VS Code 尚未接入 Agent 专有聊天 API。它会索引未保存文档；MCP / DSH 本机服务目前只读磁盘，不能把两者视为同一版本。

**验证方式**：`npm run test:native` 使用独立的 VS Code 1.90.0 宿主，检查原生源码跳转、CodeLens、跟随 / 固定、基础与模拟 API 悬停、混合语言和多工作区；测试必须生成当次报告，不能把旧报告当作新结果。浏览器测试继续覆盖 DSH / MCP 通用界面。原生侧栏已在本机 VS Code 窗口确认显示，并实际点击调用节点跳转、使用 Alt+← 返回。AI 链路的模拟 API 结果只证明接线。

## DSH 原生适配

见 [DSH 说明](../adapters/dsh/README.md)。已提供 host / client bundle、profile patch 和原生标签页注册，后台按当前会话 cwd 自动建立本机阅读服务并连接，访问令牌在插件内部传递。DSH 追问当前也是草稿，未接入 composer。

**已在 DSH Desktop 0.2.2-rc.5 实机验证**：本地包安装、组件运行、原生 guide 入口、停靠阅读标签、原生浮动大工作台、本机连接、文件结构 / 逻辑入口、完整源码与参数对照，以及在 DSH 自带预览中打开 `src/mcp.ts`。已按安装包修正实际契约：guide 为数组，客户端须注册 ModuleLoader factory，profile bundle 插入 Host 行，原生预览采用带 sessionId 的文件地址。**已追加实机验收**：默认按当前会话目录自动连接；手动切换到 Scanf 项目后，重启 DSH 自动恢复源码与项目树。**未验收**：消息回传。远程 DSH 跨设备连接尚未支持。

## 范围

默认最多 150 个源码文件、每个 256 KiB、总计 8 MiB。目录和依赖图是结构投影；不等于完整数据流 / 控制流图。动态派发、反射、DI 和回调执行顺序需要额外证据。当前没有读取 Git 历史版本，也没有 staged / unstaged / base diff 分析。

## 参考

- [AST Explorer](https://github.com/fkling/astexplorer)：借鉴源码和树节点互相定位，不复制源码。
- [Tree-sitter](https://tree-sitter.github.io/tree-sitter/)：多语言具体语法树，0.7 起用于共享语法提取；TS / JS 仍保留 TypeScript 语义分析。
- [MCP Apps](https://modelcontextprotocol.io/extensions/apps/overview)、[OpenAI 扩展规范](https://github.com/openai/mcp-extensions/blob/main/docs/spec.md#thread-entrypoint)、[DSH 原生侧栏](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/sidebar-right)。

## 自选模型验收（0.6）

共享阅读器模型设置支持 OpenAI 兼容 chat/completions。VS Code 原生扩展宿主测试已经覆盖 SecretStorage 保存配置、测试连接、通过 vscode.executeHoverProvider 获取 AI 悬停，以及整段解释。DSH 经由带本机令牌的阅读服务调用，Key 存在 DSH credentials 的独立 SCANF_READER_MODEL 条目中。浏览器端真实 HTTP 服务测试覆盖保存、Key 不回显和鼠标悬停。

以上使用本机模拟 API 验证接线，没有使用用户真实 Key；不能据此声称真实模型质量或服务商可用性已验证。DSH 自带独立代码预览不在本次悬停接入范围；支持其 Scanf 阅读面板。

原生 DSH Desktop 0.2.2-rc.5 追加验收：模型设置保存与 Key 不回显、测试连接成功、当前函数“模型解读”显示返回文本、在 Scanf 源码参数处悬停显示 AI 解读浮层。均使用本机模拟 API；验收后已通过界面的“清除配置”移除模拟地址、模型名和 Key。
