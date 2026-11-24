Scanf 0.6.1 首次开源发布：用项目树、调用入口和完整源码对照阅读 TypeScript / JavaScript。

安装包（无需编译）：
- VS Code / Cursor：下载 scanf-code-reader-0.6.1.vsix，通过 Install from VSIX 安装。
- DSH Desktop 0.2.2-rc.5：下载 dsh-scanf-reader-0.6.1.tgz，使用本地插件安装，重启后打开右侧 Scanf 标签。
- MCP（Node.js 22+）：npm install -g https://github.com/IweirdoI/scanf/releases/download/v0.6.1/scanf-reader-0.6.1.tgz，然后 scanf-reader setup --root "/your/project"。

支持自选模型 API、参数解释与悬停、完整文件、定义跳转、搜索和可关闭标签。基础分析无需 API Key。

安装与排错：https://github.com/IweirdoI/scanf/blob/master/docs/INSTALL.md

范围：TS / JS；本机 Windows 原生宿主已验证；其他平台依赖 CI 与后续用户反馈。模型调用使用本机模拟接口完成接线验收，真实服务商需用户自行配置。Codex 原生 diff 自动同步、DSH 独立文件预览悬停尚未实现。未上架 npm registry / Marketplace / Open VSX。

SHA256SUMS.txt 可校验每个安装包。源码采用 MIT，随安装包保留第三方许可证。
