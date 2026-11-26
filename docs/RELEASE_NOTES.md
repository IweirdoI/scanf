Scanf 0.8.0：VS Code 原生阅读。

- 源码、文件树、标签、搜索、分屏和定义跳转直接使用 VS Code。
- Scanf 提供原生逻辑树：项目入口、当前函数的调用 / 调用者；点击节点直接跳到源码。光标跟随与图钉固定均可用。
- 函数上方 CodeLens 和编辑器右键提供解读入口；侧栏只显示用途、参数证据与可选 AI 回答。
- 参数基础悬停无需 API Key。自选模型使用原生配置输入框与 SecretStorage，支持手动 / 自动悬停模式。
- 可用于其他项目及多工作区；保留混合语言分析，拒绝未保存源码对应的过期跳转。
- DSH / MCP 继续提供原有小窗口和完整阅读工作台。

VS Code 安装：下载 scanf-code-reader-0.8.0.vsix → Install from VSIX → Reload Window → 打开自己的项目 → 点击活动栏 Scanf，或运行 Scanf: 打开逻辑导航。

DSH：安装 dsh-scanf-reader-0.8.0.tgz 并重启。
MCP（Node.js 22+）：npm install -g https://github.com/IweirdoI/scanf/releases/download/v0.8.0/scanf-reader-0.8.0.tgz。

支持 TS / JS、Python、C / C++、Java、Rust、Go。默认共享 150 文件 / 单文件 256 KiB / 总计 8 MiB 预算。静态分析不执行项目；动态分派、构建条件与跨语言桥接保留未解析。模拟 API 验证只证明接线，不证明真实模型质量。Codex 原生 diff 同步尚未实现；未上架扩展市场。
