Scanf 0.7.0：一份项目快照阅读 TS / JS、Python、C / C++、Java、Rust、Go 混合项目。

- 多语言共享文件树、逻辑入口树、完整源码编辑器、搜索与定义跳转。
- 新语言共享 Tree-sitter 提取器与按需加载的离线 WASM；保留 TS / JS 编译器语义解析，无需各语言工具链。
- 参数类型、默认值、注释与用法证据；VS Code 菜单、原生悬停与 DSH 阅读面板覆盖新增语言。
- 测试覆盖作用域、Python 导入别名、Go 同包跨文件、简单 Rust use 和 C include；动态分派、构建条件与跨语言桥接保留未解析。
- Windows / Linux CI 与手动 Release 工作流已启用。

安装包（无需编译）：

- VS Code / Cursor：下载 `scanf-code-reader-0.7.0.vsix`，通过 Install from VSIX 安装。
- DSH Desktop 0.2.2-rc.5：下载 `dsh-scanf-reader-0.7.0.tgz`，使用本地插件安装，重启后打开右侧 Scanf 标签。
- MCP（Node.js 22+）：`npm install -g https://github.com/IweirdoI/scanf/releases/download/v0.7.0/scanf-reader-0.7.0.tgz`，然后 `scanf-reader setup --root "/your/project"`。

安装与排错：https://github.com/IweirdoI/scanf/blob/master/docs/INSTALL.md

默认所有语言共享 150 文件 / 单文件 256 KiB / 总计 8 MiB 预算。混合语言索引不等于跨语言调用链已解析。源码分析不执行项目；可选模型调用需自己配置 API，模拟接口测试不代表真实模型质量。Codex 原生 diff 自动同步、DSH 独立文件预览悬停尚未实现。未上架 npm registry / Marketplace / Open VSX。

SHA256SUMS.txt 可校验每个安装包。源码采用 MIT，随安装包保留第三方许可证。
