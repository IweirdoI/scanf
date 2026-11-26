Scanf 0.9.0：原生文件夹浏览 + 分叉关系图。

- 文件夹管理直接使用 VS Code 原生资源管理器，保留正常展开、打开文件、右键与搜索。
- 同一个资源管理器下方显示 Scanf 逻辑关系图：节点分叉连线，绿色箭头表示调用，紫色虚线表示 AST 包含，金色反向箭头表示调用方。
- 支持入口选择、1–3 层展开、适宽 / 100%、滚动与源码旁的大图；点击节点直接跳转原生源码，不复制代码编辑器。
- 图标记递归、共享与截断，分析警告默认折叠，避免占满导航。
- 保留原生参数悬停、函数解读、CodeLens、固定 / 跟随、多工作区与混合语言分析。

VS Code：安装 scanf-code-reader-0.9.0.vsix，Reload Window 后打开自己的项目，进入资源管理器即可同时看到文件夹和 Scanf 逻辑关系图。
DSH：安装 dsh-scanf-reader-0.9.0.tgz 并重启；通用工作台沿用既有界面。
MCP（Node.js 22+）：npm install -g https://github.com/IweirdoI/scanf/releases/download/v0.9.0/scanf-reader-0.9.0.tgz。

静态结构与调用不是运行轨迹；动态派发和跨语言桥接保留未解析。基础阅读不需要 Key，可选 API 只发送有限源码。真实模型质量未经模拟 API 测试证明。未上架扩展市场。
