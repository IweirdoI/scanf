# Scanf — a code reading workspace

Explore TypeScript / JavaScript through file and entry-point trees, full-source navigation, parameter evidence and optional AI hover explanations.

![Reader workspace](docs/images/workspace.png)

## Install

- **VS Code / Cursor:** [Download the VSIX](https://github.com/IweirdoI/scanf/releases/latest), select Extensions → … → Install from VSIX, then run **Scanf: 打开代码阅读地图** with a TS/JS workspace open. Not yet listed on extension marketplaces.
- **DeepSeek Harness:** Download the DSH `.tgz` from the same release, install via the local plugin entry, restart, and open Scanf in the right sidebar. Tested with Desktop 0.2.2-rc.5.
- **MCP agents:** Node.js 22+; prebuilt package, no compilation:

```sh
npm install -g https://github.com/IweirdoI/scanf/releases/download/v0.6.1/scanf-reader-0.6.1.tgz
scanf-reader setup --root "/absolute/path/to/project"
```

Copy the printed MCP configuration to your client. CLI: `scanf-reader --help`. Codex: `codex mcp add scanf -- scanf-reader mcp --root "/absolute/project/path"`.

## Features and limits

File / logical-entry trees; full read-only CodeMirror editor; definition jumps; back / forward; closable tabs; search; parameter types, comments and evidence. Optional OpenAI-compatible model settings and hover explanations in the VS Code / DSH reader. VS Code also supports native editor hover; DSH's separate native file preview is not extended.

Static analysis stays local. Enabling AI sends bounded source excerpts to your configured API provider. Keys use host credential storage. The MCP package uses the current agent for explanations and needs an MCP Apps host for graphical UI; plain tool results remain available otherwise. Codex native diff synchronization is not verified.

TS/JS only. Default indexing bounds: 150 files, 256 KiB per file, 8 MiB total. Static relationships are not runtime execution traces. Windows native host paths and local mock API wiring have been tested; mock results do not prove real-model quality.

[中文](README.md) · [Installation / troubleshooting](docs/INSTALL.md) · [Contributing](CONTRIBUTING.md) · [MIT](LICENSE)
