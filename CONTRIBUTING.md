# 贡献指南

欢迎提交安装体验、代码阅读、语言支持方面的 Issue / PR。先用最小源码片段描述问题；不要上传私人仓库或 API Key。

开发环境 Node.js 22+：`npm ci` → `npm run build` → `npm run check` → `npm test`。UI 测试默认 Edge；CI 设置 CI=true 并使用 Chromium：`npx playwright install chromium` 后 `npm run test:ui`。

源码：`src/analyzer.ts` 语义索引；`src/reader-model.ts` 导航树；`media/reader.js` / `editor.js` 共用阅读界面；`src/extension.ts` VS Code；`adapters/dsh` DSH；`src/model-service.ts` 自选模型；`scripts` 构建与分发。

规则：静态事实与模型推断分开，未知关系明确标记；不得执行被阅读源码；Key 不写项目或日志；外部解释必须核对源码版本。每个 PR 说明问题、行为变化、实际测试环境。UI 修改附截图，安装改变须更新 README / INSTALL。

不要求贡献者持有真实付费模型 Key。`test/mock-model.ts` 是明确标注的本机接线测试，不能用于宣称解释质量。
