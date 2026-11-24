# 安装与常见问题

## VS Code / Cursor

从 [Releases](https://github.com/IweirdoI/scanf/releases/latest) 下载 `.vsix`，通过扩展面板的 **Install from VSIX** 安装。打开项目后执行 `Scanf: 打开代码阅读地图`。

更新时安装新版本 VSIX；已打开的旧窗口可能需要 Reload Window。卸载使用编辑器扩展页的 Uninstall。

## DSH

已验证 DSH Desktop 0.2.2-rc.5。下载 `dsh-scanf-reader-0.7.1.tgz`，在插件页选择本地包安装，或运行 `dsh plugin --profile desktop add ./dsh-scanf-reader-0.7.1.tgz`。重启后右侧栏新标签页选择 Scanf。

如果插件安装成功但没有入口：检查 desktop profile 的 `package.json` 中 `dsh.profile.bundles` 是否包含 `dsh-scanf-reader`；只追加此项，保留原有 bundles。然后重启。使用 CLI 的 `dsh plugin --help` 查看所安装版本的命令。新版本接口可能有差异，请在 Issue 中提供版本号和错误。

无需手工启动后台服务或填写连接令牌。默认会话目录为空时，通过“切换项目”填写源码目录。后台与客户端需在同一台电脑；远程工作区不支持。

## MCP

Node.js 22+，一次安装：

```sh
npm install -g https://github.com/IweirdoI/scanf/releases/download/v0.7.1/scanf-reader-0.7.1.tgz
scanf-reader --version
scanf-reader setup --root "/absolute/project/path"
```

Windows 路径示例：`scanf-reader setup --root "D:/projects/my-app"`。该命令只打印配置，不修改客户端设置；输出使用当前机器的 Node 与服务绝对路径，适合 GUI 客户端 PATH 不完整的情况。

把输出的 JSON 添加到 Cursor 等客户端的 MCP 设置。Codex TOML 使用同一输出里的 `command`、`args` 填入 `[mcp_servers.scanf]`。也可运行：

```sh
codex mcp add scanf -- scanf-reader mcp --root "/absolute/project/path"
```

无全局安装体验：`npx -y --package=https://github.com/IweirdoI/scanf/releases/download/v0.7.1/scanf-reader-0.7.1.tgz scanf-reader --help`。

`scanf-reader mcp` 的 stdout 专用于 MCP，不要把普通终端输出写入该通道。项目根目录必须显式传入。MCP 工具为 `scanf_project`、`scanf_find_symbol`、`scanf_inspect`、`scanf_publish_explanation`、`scanf_open_reader`。

如果没有小窗口，先确认宿主是否支持 MCP Apps；文本工具仍可调用。ChatGPT 云端连接器不等同于本地 stdio 客户端，本包没有提供远程公网 MCP 部署。

更新：重新运行安装命令，重启客户端 MCP 连接。卸载：`npm uninstall -g scanf-reader`，并删除客户端里对应的 Scanf MCP 配置。

## 模型设置

VS Code / DSH Scanf 面板右上角星光图标。接口须支持 OpenAI 兼容 `chat/completions`；可填基础 URL 或完整 endpoint。Key 仅提交给宿主凭据服务与用户指定的 API；设置不回显已保存的 Key。

更换地址时重新填写 Key，留空不把旧服务商的 Key 带到新地址。本机模型允许 localhost HTTP；其他地址要求 HTTPS。连接测试先保存配置，再发送短测试消息。清除配置同时移除 Key。关闭自动悬停仍可手动请求单行解释。

## 校验下载

Release 提供 `SHA256SUMS.txt`。Windows 使用 `Get-FileHash <文件> -Algorithm SHA256`；macOS 使用 `shasum -a 256 <文件>`；Linux 使用 `sha256sum -c SHA256SUMS.txt`。

## 排错

- 没有源码：确认目录包含 TS / JS、Python、C / C++、Java、Rust 或 Go，且不在依赖或构建目录；检查面板的扫描警告。语言自动按扩展名识别，同一目录可混合多种语言。
- 无法解析调用：可能是外部依赖、动态派发或缺少类型信息，工具会保留未解析关系。
- 401 / 403：检查自己的 API Key、额度与服务商权限。
- 地址 / 模型不匹配：基础 URL 与模型 ID 以服务商文档为准，不是网页聊天地址。
- 源码版本已变化：刷新后重新选择函数；旧解释不会强行附到新版本。
- 预览地址失效：命令行 preview 每次启动生成新令牌，重新打开终端输出的完整本机地址。VS Code / DSH 用户不需要处理这个地址。
