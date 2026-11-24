# 发布流程

1. 同步根 package.json、DSH package.json、Codex plugin.json、package-lock 根版本和 MCP / UI 版本；更新 CHANGELOG、README 安装链接与 RELEASE_NOTES。
2. `npm ci` → `npm run check` → `npm run build` → `npm test` → `npm run test:ui`。
3. `npm run package` 构建 VSIX；`npm run release:packages` 生成 DSH / MCP tgz 与 SHA256SUMS。
4. `node scripts/verify-release.mjs` 从预构建包检验 CLI / MCP。不把本机绝对路径写入分发包。
5. 当前手工发布：`gh release create v<版本> output/release/* --target master --title "Scanf <版本>" --notes-file docs/RELEASE_NOTES.md`。发布前完成上面的检查。

自动化模板在 `docs/automation/ci.yml` 与 `release.yml`。当前发布账号没有 workflow 授权，因此未启用 Actions。维护者授权后，把这两个文件放入 `.github/workflows` 并提交，即可使用 CI 和 Release → Run workflow。工作流检查通过后为 package.json 版本创建 Release；已存在的 tag / Release 不覆盖，需要先递增版本。

Release 含 3 个安装包和校验文件。GitHub 自动生成的 Source code 归档供开发者使用，普通用户不需要下载源码。

Marketplace / Open VSX / npm registry 尚未发布；需要维护者准备对应 publisher / token 后再单独接入。当前 GitHub 的预构建 tgz 可直接 npm install，不能写成 `npm install scanf-reader`（同名注册表包可能属于其他人）。
