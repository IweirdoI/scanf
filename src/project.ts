import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import ts from "typescript";
import { analyze, normalize } from "./analyzer";
import { readerView } from "./reader-model";
import type { CodeMap } from "./model";

export class ProjectReader {
  map?: CodeMap;
  sources: Record<string, string> = {};
  revision = "";
  selected?: string;
  private explanations = new Map<
    string,
    NonNullable<ReturnType<typeof readerView>["explanation"]>
  >();
  private queue: Promise<unknown> = Promise.resolve();
  /** 建立一个有范围限制的项目阅读会话。
   * @param root 允许读取的项目根目录；扫描会跳过符号链接，不跟随到根目录外。
   * @param maxFiles 最多纳入分析的源码文件数；超过限制会在窗口中提示。
   */
  constructor(
    readonly root: string,
    readonly maxFiles = 150,
  ) {
    this.root = normalize(root);
  }
  async refresh() {
    const pending = this.queue.then(() => this.scan());
    this.queue = pending.catch(() => {});
    return pending;
  }
  private async scan() {
    const actualRoot = await fs.realpath(this.root);
    const files: Record<string, string> = {},
      warnings: string[] = [];
    const ignored = new Set([
      "node_modules",
      ".git",
      "dist",
      "build",
      "coverage",
      ".next",
      "out",
      "output",
      "vendor",
    ]);
    let bytes = 0,
      capped = false;
    const walk = async (dir: string) => {
      for (const entry of (await fs.readdir(dir, { withFileTypes: true })).sort(
        (a, b) => a.name.localeCompare(b.name),
      )) {
        if (Object.keys(files).length >= this.maxFiles) {
          capped = true;
          return;
        }
        const file = path.join(dir, entry.name);
        // Never follow symlinks out of the authorized root.
        if (entry.isSymbolicLink()) continue;
        if (entry.isDirectory() && !ignored.has(entry.name)) {
          await walk(file);
          continue;
        }
        if (!entry.isFile() || !/\.[cm]?[jt]sx?$/i.test(entry.name)) continue;
        try {
          const real = await fs.realpath(file),
            relative = path.relative(actualRoot, real);
          if (relative.startsWith(".." + path.sep) || path.isAbsolute(relative))
            continue;
          const stat = await fs.stat(real);
          if (stat.size > 256 * 1024 || bytes + stat.size > 8 * 1024 * 1024) {
            warnings.push(`体积限制，跳过 ${path.relative(this.root, file)}`);
            continue;
          }
          const source = await fs.readFile(real, "utf8");
          files[normalize(file)] = source;
          bytes += Buffer.byteLength(source);
        } catch {
          warnings.push(`无法读取 ${path.relative(this.root, file)}`);
        }
      }
    };
    await walk(this.root);
    if (capped)
      warnings.push(`最多读取 ${this.maxFiles} 个文件；图可能不完整。`);
    let options: ts.CompilerOptions = {};
    const config =
      ts.findConfigFile(this.root, ts.sys.fileExists, "tsconfig.json") ??
      ts.findConfigFile(this.root, ts.sys.fileExists, "jsconfig.json");
    if (config) {
      const loaded = ts.readConfigFile(config, ts.sys.readFile);
      if (loaded.error) warnings.push("项目配置读取失败。");
      else {
        const parsed = ts.parseJsonConfigFileContent(
          loaded.config,
          { ...ts.sys, readDirectory: () => [] },
          path.dirname(config),
        );
        options = parsed.options;
        if (parsed.errors.some((e) => e.code !== 18003))
          warnings.push("项目配置存在诊断信息。");
      }
    }
    const hash = createHash("sha256");
    for (const [file, source] of Object.entries(files))
      hash.update(file).update("\0").update(source).update("\0");
    hash.update(JSON.stringify(options));
    const revision = hash.digest("hex").slice(0, 20);
    if (revision !== this.revision) {
      const map = analyze(files, this.root, options);
      map.warnings.unshift(...warnings);
      this.map = map;
      this.sources = files;
      this.revision = revision;
      this.explanations.clear();
      if (!map.nodes.some((n) => n.id === this.selected))
        this.selected = undefined;
    }
    return this.view();
  }
  /** 获取阅读快照，不改变当前选择。
   * @param id 要读取的符号 ID；省略时沿用当前选择。
   */
  view(id = this.selected) {
    if (!this.map) throw new Error("项目尚未索引。");
    if (id && !this.map.nodes.some((n) => n.id === id))
      throw new Error("符号已失效，请刷新项目树。");
    const view = readerView(this.map, this.sources, this.revision, id);
    view.explanation = this.explanations.get(view.selected?.id ?? "");
    return view;
  }
  /** 校验版本并切换当前阅读符号。
   * @param id 从项目树或符号查询得到的真实符号 ID。
   * @param revision 调用方上一次看到的源码版本；与当前版本不同时拒绝跳转，避免显示错位源码。
   */
  inspect(id: string, revision?: string) {
    if (revision && revision !== this.revision)
      throw new Error("源码版本已变化，请刷新后重新选择。");
    const view = this.view(id);
    this.selected = id;
    return view;
  }
  /** 把带证据的解读保存在当前进程，不改项目源码。
   * @param id 解读所属的函数 / 模块符号 ID。
   * @param revision 产生解读时读取的源码版本；源码更新后旧解读会失效。
   * @param text 对用途、主流程和异常路径的自然语言解释。
   * @param evidence 支持整体解释的源码行范围，必须位于所选符号内部。
   * @param parameters 逐参数解释及其行号证据；参数名必须真实存在。
   */
  explain(
    id: string,
    revision: string,
    text: string,
    evidence: Array<{ line: number; endLine: number }>,
    parameters?: NonNullable<
      ReturnType<typeof readerView>["explanation"]
    >["parameters"],
  ) {
    const view = this.inspect(id, revision),
      node = view.selected!;
    if (
      [...evidence, ...(parameters ?? []).flatMap((p) => p.evidence)].some(
        (e) =>
          e.line < node.line || e.endLine > node.endLine || e.endLine < e.line,
      )
    )
      throw new Error("解释引用必须落在所选源码范围内。");
    if (
      parameters?.some(
        (p) => !node.parameterDetails?.some((n) => n.name === p.name),
      )
    )
      throw new Error("参数解释必须对应当前函数真实存在的参数。");
    this.explanations.set(id, { text, evidence, parameters });
    return this.view(id);
  }
}
