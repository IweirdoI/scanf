# 发布流程

1. 同步根 package.json、DSH package.json、Codex plugin.json、package-lock 根版本和 MCP / UI 版本；更新 CHANGELOG、README 安装链接与 RELEASE_NOTES。
2. `npm ci` → `npm run check` → `npm run build` → `npm test` → `npm run test:ui`。
3. `npm run package` 构建 VSIX；`npm run release:packages` 生成 DSH / MCP tgz 与 SHA256SUMS。
4. `node scripts/verify-release.mjs` 从预构建包检验 CLI / MCP。不把本机绝对路径写入分发包。
5. 当前手工发布：`gh release create v<版本> output/release/* --target master --title "Scanf <版本>" --notes-file docs/RELEASE_NOTES.md`。发布前完成上面的检查。

自动化已配置在 `.github/workflows/ci.yml` 与 `release.yml`。推送 master 或 PR 会运行 Windows / Linux CI；发布在 Actions → Release → Run workflow 手动触发。发布工作流重新运行检查、打包并验证 CLI / 混合语言解析器，再为 package.json 版本创建 Release；已存在的 tag / Release 不覆盖，需要先递增版本。CI 只授予 contents:read，Release 授予 contents:write。

解析器 WASM 必须同时存在于 VSIX 的 dist/parsers、DSH 的 lib/parsers、MCP / Agent 包的 dist/parsers。构建只复制当前支持的六种语法及运行时；不要依赖开发机 node_modules 或在线下载解析器。新增语言先修改 src/languages.ts、共享提取 / 解析策略，再加混合项目和包隔离测试；许可文件随安装包分发。

Release 含 3 个安装包和校验文件。GitHub 自动生成的 Source code 归档供开发者使用，普通用户不需要下载源码。

Marketplace / Open VSX / npm registry 尚未发布；需要维护者准备对应 publisher / token 后再单独接入。当前 GitHub 的预构建 tgz 可直接 npm install，不能写成 `npm install scanf-reader`（同名注册表包可能属于其他人）。
