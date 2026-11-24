import path from "node:path";
import fs from "node:fs";
import {
  Parser,
  Language,
  type Node as SyntaxNode,
} from "@vscode/tree-sitter-wasm";
import { languageFor, type LanguageId } from "./languages";
import type { CodeMap, CodeNode, ParameterInfo } from "./model";

// Bundled installations use sibling assets, source development uses pinned npm assets.
const bundled = path.join(__dirname, "parsers");
const assets = fs.existsSync(path.join(bundled, "tree-sitter.wasm"))
  ? bundled
  : path.resolve(__dirname, "../node_modules/@vscode/tree-sitter-wasm/wasm");
let initialization: Promise<void> | undefined;
const grammars = new Map<string, Promise<Language>>();
async function grammar(id: string) {
  await (initialization ??= Parser.init({
    locateFile: (name: string) => path.join(assets, name),
  }));
  if (!grammars.has(id)) {
    const file =
      id === "c" && assets !== bundled
        ? path.resolve(
            __dirname,
            "../node_modules/@repomix/tree-sitter-wasms/out/tree-sitter-c.wasm",
          )
        : path.join(assets, `tree-sitter-${id}.wasm`);
    grammars.set(id, Language.load(file));
  }
  return grammars.get(id)!;
}
type Fn = {
  ast: SyntaxNode;
  node: CodeNode;
  leaf: string;
  scope: string;
  container: string;
  bindings: Set<string>;
};
type FileInfo = {
  file: string;
  text: string;
  language: LanguageId;
  root: SyntaxNode;
  module: CodeNode;
  functions: Fn[];
  imports: Map<string, { file: string; name?: string }>;
  bindings: Set<string>;
};
const compact = (text: string) => text.replace(/\s+/g, " ").slice(0, 180);
const identifier = /^(identifier|field_identifier|type_identifier)$/;
const named = (node: SyntaxNode) =>
  node.namedChildren.filter((child): child is SyntaxNode => !!child);
function descendants(
  node: SyntaxNode,
  predicate: (node: SyntaxNode) => boolean,
  stop?: (node: SyntaxNode) => boolean,
): SyntaxNode[] {
  const found: SyntaxNode[] = [],
    queue = [...named(node)].reverse();
  while (queue.length) {
    const current = queue.pop()!;
    if (predicate(current)) found.push(current);
    if (!stop?.(current)) queue.push(...named(current).slice().reverse());
  }
  return found;
}
const field = (node: SyntaxNode, name: string) => node.childForFieldName(name);
// posix.resolve treats Windows drive letters as relative; join+normalize preserves snapshot paths.
const resolveLocal = (...parts: string[]) =>
  path.posix.normalize(path.posix.join(...parts));
const location = (file: string, node: SyntaxNode) => ({
  file,
  line: node.startPosition.row + 1,
  endLine: node.endPosition.row + 1,
});
function declarator(node: SyntaxNode): SyntaxNode {
  let current = node;
  for (let i = 0; i < 12; i++) {
    const child =
      field(current, "declarator") ??
      (current.type === "parenthesized_declarator"
        ? named(current)[0]
        : undefined);
    if (!child) break;
    current = child;
  }
  return current;
}
function nameOf(node: SyntaxNode) {
  return field(node, "name") ?? declarator(node);
}
const containers = new Set([
  "class_definition",
  "class_declaration",
  "struct_specifier",
  "class_specifier",
  "namespace_definition",
  "impl_item",
]);
function containerOf(ast: SyntaxNode) {
  const receiver = field(ast, "receiver");
  if (receiver) return receiver.text;
  const names: string[] = [];
  for (let parent = ast.parent; parent; parent = parent.parent) {
    if (containers.has(parent.type))
      names.unshift(
        (field(parent, "name") ?? field(parent, "type"))?.text ?? "<anonymous>",
      );
  }
  return names.join(".");
}
function bindingsIn(
  ast: SyntaxNode,
  isFunction: (node: SyntaxNode) => boolean,
) {
  const bindings = new Set<string>();
  for (const binding of descendants(
    ast,
    (node) =>
      /^(assignment|augmented_assignment|variable_declarator|let_declaration|short_var_declaration|for_statement|for_in_statement|var_spec|const_spec)$/.test(
        node.type,
      ),
    (node) => isFunction(node) || containers.has(node.type),
  )) {
    const value =
      field(binding, "left") ??
      field(binding, "name") ??
      field(binding, "pattern");
    if (value && identifier.test(value.type)) bindings.add(value.text);
    else if (
      value &&
      /^(expression_list|pattern_list|tuple_pattern|tuple|list_pattern)$/.test(
        value.type,
      )
    )
      for (const name of descendants(value, (node) =>
        identifier.test(node.type),
      ))
        bindings.add(name.text);
  }
  return bindings;
}
function parameters(
  file: string,
  ast: SyntaxNode,
  isFunction: (n: SyntaxNode) => boolean,
): ParameterInfo[] {
  const list =
    field(ast, "parameters") ??
    descendants(ast, (n) =>
      /^(parameter_list|parameters|formal_parameters)$/.test(n.type),
    )[0];
  if (!list) return [];
  const body = field(ast, "body"),
    result: ParameterInfo[] = [];
  for (const parameter of named(list)) {
    if (/comment/.test(parameter.type)) continue;
    const declaration = parameter.text;
    if (declaration === "void" || declaration === "...") continue;
    let names = parameter
      .childrenForFieldName("name")
      .filter((node): node is SyntaxNode => !!node);
    if (!names.length) {
      const explicit =
        field(parameter, "pattern") ?? field(parameter, "declarator");
      const name = explicit
        ? declarator(explicit)
        : identifier.test(parameter.type)
          ? parameter
          : named(parameter).find((n) => identifier.test(n.type));
      if (name && identifier.test(name.type)) names = [name];
    }
    for (const name of names) {
      const uses = body
        ? descendants(
            body,
            (n) =>
              n.type === "identifier" &&
              n.text === name.text &&
              field(n.parent!, "attribute")?.id !== n.id &&
              field(n.parent!, "field")?.id !== n.id,
            (n) =>
              isFunction(n) ||
              containers.has(n.type) ||
              /^(lambda|lambda_expression|closure_expression|func_literal)$/.test(
                n.type,
              ),
          ).slice(0, 51)
        : [];
      const value = field(parameter, "value"),
        type = field(parameter, "type");
      result.push({
        ...location(file, name),
        name: name.text,
        declaration,
        type: type?.text ?? "未声明类型",
        optional: !!value,
        ...(value ? { defaultValue: value.text } : {}),
        from: name.startIndex,
        to: name.endIndex,
        description: uses.length
          ? `在函数体内出现 ${uses.length > 50 ? "至少 50" : uses.length} 处；点击行号查看实际用法，业务含义需结合上下文。`
          : "源码未提供可确认的业务含义，可请 Agent 结合上下文解释。",
        descriptionSource: uses.length ? "usage" : "unknown",
        usesTruncated: uses.length > 50,
        uses: uses.slice(0, 50).map((use) => ({
          ...location(file, use),
          from: use.startIndex,
          to: use.endIndex,
          text: compact(use.parent?.text ?? use.text),
          role: "源码用法",
        })),
      });
    }
  }
  return result;
}
function documentation(ast: SyntaxNode, language: LanguageId) {
  const comments: string[] = [];
  let previous = ast.previousNamedSibling;
  while (
    previous &&
    /comment/.test(previous.type) &&
    ast.startPosition.row - previous.endPosition.row <= comments.length + 1 &&
    comments.length < 12
  ) {
    comments.unshift(previous.text);
    previous = previous.previousNamedSibling;
  }
  if (language === "python") {
    const first = field(ast, "body")?.namedChildren[0];
    if (
      first?.type === "expression_statement" &&
      named(first)[0]?.type === "string"
    )
      comments.push(first.text.replace(/^[uUrR]?["']{1,3}|["']{1,3}$/g, ""));
  }
  return (
    comments
      .join("\n")
      .replace(/^\s*(?:\/\/\/?|#|\/\*\*?|\*\/?)[ ]?/gm, "")
      .replace(/\*\/$/, "")
      .trim()
      .slice(0, 4000) || undefined
  );
}

/** Shared CST extraction; local / explicit-import resolution only, never guesses across languages. */
export async function analyzeSyntax(
  input: Record<string, string>,
  root: string,
): Promise<CodeMap> {
  const map: CodeMap = {
    root,
    generatedAt: new Date().toISOString(),
    nodes: [],
    edges: [],
    entries: [],
    references: [],
    unresolved: [],
    warnings: [],
  };
  const infos = new Map<string, FileInfo>(),
    trees: Array<NonNullable<ReturnType<Parser["parse"]>>> = [];
  try {
    for (const [file, text] of Object.entries(input)) {
      const spec = languageFor(file);
      if (!spec || !("functions" in spec)) continue;
      const language = await grammar(spec.id);
      const parser = new Parser();
      try {
        parser.setLanguage(language);
        const deadline = Date.now() + 500;
        const tree = parser.parse(text, undefined, {
          progressCallback: () => Date.now() > deadline,
        });
        if (!tree) {
          map.warnings.push(
            `${path.posix.relative(root, file)}：解析超出预算。`,
          );
          continue;
        }
        trees.push(tree);
        if (tree.rootNode.hasError)
          map.warnings.push(
            `${path.posix.relative(root, file)}：存在语法错误或不支持的语法；结构可能不完整。`,
          );
        const module: CodeNode = {
          id: `module:${file}`,
          name: path.posix.relative(root, file),
          kind: "module",
          ...location(file, tree.rootNode),
          line: 1,
          language: spec.id,
          summary: `${spec.label} 源码模块 · 语法结构分析；未执行项目代码。`,
        };
        map.nodes.push(module);
        const info: FileInfo = {
          file,
          text,
          root: tree.rootNode,
          module,
          language: spec.id,
          functions: [],
          imports: new Map(),
          bindings: new Set(),
        };
        infos.set(file, info);
        const isFunction = (n: SyntaxNode) =>
          (spec.functions as readonly string[]).includes(n.type) &&
          !!field(n, "body");
        const asts = descendants(tree.rootNode, isFunction);
        info.bindings = bindingsIn(tree.rootNode, isFunction);
        for (const ast of asts) {
          const name = nameOf(ast),
            leaf = name.text;
          if (!leaf || name.equals(ast)) continue;
          const parent = info.functions
            .filter(
              (fn) =>
                fn.ast.startIndex < ast.startIndex &&
                fn.ast.endIndex >= ast.endIndex,
            )
            .at(-1);
          const container = containerOf(ast),
            details = parameters(file, ast, isFunction);
          const doc = documentation(ast, spec.id);
          for (const parameter of details) {
            const escaped = parameter.name.replace(
              /[.*+?^${}()|[\]\\]/g,
              "\\$&",
            );
            const note = doc
              ?.match(
                new RegExp(
                  `(?:@param(?:\\[[^\\]]+\\])?\\s+${escaped}\\b\\s*(?:[-:]\\s*)?|:param\\s+${escaped}\\s*:\\s*)([^\\n]+)`,
                ),
              )?.[1]
              ?.trim();
            if (note) {
              parameter.description = note;
              parameter.descriptionSource = "comment";
            }
          }
          const steps = descendants(
            field(ast, "body")!,
            (n) =>
              /^(return_statement|return_expression|if_statement|if_expression|for_statement|for_expression|while_statement|while_expression|match_expression|switch_statement|throw_statement|raise_statement|try_statement)$/.test(
                n.type,
              ),
            (n) => isFunction(n) || containers.has(n.type),
          );
          const node: CodeNode = {
            id: `fn:${file}:${ast.startIndex}`,
            name: container ? `${container}.${leaf}` : leaf,
            kind: "function",
            ...location(file, ast),
            language: spec.id,
            parentId: parent?.node.id ?? module.id,
            parameters: details.map((p) => p.name),
            parameterDetails: details,
            documentation: doc,
            branches: steps.filter((n) =>
              /^(if|for|while|match|switch)/.test(n.type),
            ).length,
            steps: steps.slice(0, 80).map((step) => ({
              ...location(file, step),
              kind: step.type,
              text: compact(step.text),
              depth: 0,
            })),
            stepsTruncated: steps.length > 80,
            summary: `${spec.label} ${container ? "方法 / 函数" : "函数"}；${details.length} 个参数。调用关系按语法作用域解析，动态分派及外部目标可能未解析。`,
          };
          const bindings = bindingsIn(field(ast, "body")!, isFunction);
          details.forEach((parameter) => bindings.add(parameter.name));
          info.functions.push({
            ast,
            node,
            leaf,
            scope: parent?.node.id ?? container,
            container,
            bindings,
          });
          map.nodes.push(node);
          map.references!.push({
            file,
            from: name.startIndex,
            to: name.endIndex,
            targetId: node.id,
            name: node.name,
            line: node.line,
          });
          const isTopLevel = !parent && !container;
          const main =
            leaf === "main" &&
            !parent &&
            ((spec.id === "go" && /^\s*package\s+main\b/m.test(text)) ||
              spec.id === "c" ||
              spec.id === "cpp" ||
              spec.id === "rust" ||
              (spec.id === "java" &&
                /\bpublic\s+static\s+void\s+main\s*\(\s*(?:java\.lang\.)?String\s*(?:\[\s*\]\s*\w+|\.\.\.\s*\w+)/.test(
                  ast.text,
                )));
          if (main)
            map.entries!.push({
              ...location(file, ast),
              symbolId: node.id,
              kind: "startup",
              label: node.name,
              candidate: true,
              reason: `${spec.label} 约定入口声明；是否参与构建、是否被启动需由运行配置确认。`,
            });
          else if (isTopLevel || !parent)
            map.entries!.push({
              ...location(file, ast),
              symbolId: node.id,
              kind: "candidate",
              label: node.name,
              candidate: true,
              reason: "语法声明的阅读起点候选；不代表运行入口。",
            });
        }
        // Keep module initialization and script guards visible independently of function entries.
        if (
          spec.id === "python" &&
          named(tree.rootNode).some(
            (n) =>
              n.type === "if_statement" &&
              /^__name__\s*==\s*["']__main__["']$/.test(
                field(n, "condition")?.text ?? "",
              ),
          )
        )
          map.entries!.push({
            ...location(file, tree.rootNode),
            symbolId: module.id,
            kind: "startup",
            label: `${module.name} · __main__`,
            candidate: false,
            reason:
              "源码包含 if __name__ == '__main__' 守卫；调用边仍是静态关系。",
          });
      } catch (error) {
        throw new Error(`无法加载 ${spec.label} 解析器：${String(error)}`);
      } finally {
        parser.delete();
      }
    }
    const files = new Set(infos.keys());
    const findFile = (base: string, extensions: string[]) =>
      [base, ...extensions.map((ext) => `${base}.${ext}`)].find((file) =>
        files.has(file),
      );
    const importEdge = (
      info: FileInfo,
      target: string | undefined,
      ast: SyntaxNode,
      label: string,
    ) => {
      if (
        target &&
        (infos.get(target)?.language === info.language ||
          (["c", "cpp"].includes(info.language) &&
            ["c", "cpp"].includes(infos.get(target)!.language)))
      )
        map.edges.push({
          ...location(info.file, ast),
          source: info.module.id,
          target: infos.get(target)!.module.id,
          kind: "import",
          label,
        });
      else
        map.unresolved.push({
          ...location(info.file, ast),
          owner: info.module.id,
          kind: "import",
          label,
        });
    };
    for (const info of infos.values()) {
      const dir = path.posix.dirname(info.file);
      // Python local modules, including relative package imports and aliases.
      for (const ast of descendants(info.root, (n) =>
        /^(import_from_statement|import_statement|preproc_include|use_declaration|mod_item|import_spec|import_declaration)$/.test(
          n.type,
        ),
      )) {
        if (info.language === "python") {
          const module = field(ast, "module_name"),
            moduleName = module?.text ?? "";
          const resolvePython = (name: string) => {
            const dots = name.match(/^\.+/)?.[0].length ?? 0;
            const suffix = name.slice(dots).replace(/\./g, "/");
            const bases = dots
              ? [resolveLocal(dir, "../".repeat(Math.max(0, dots - 1)), suffix)]
              : [resolveLocal(dir, suffix), resolveLocal(root, suffix)];
            return bases
              .flatMap((base) => [
                base + ".py",
                base + ".pyi",
                base + "/__init__.py",
              ])
              .find((file) => files.has(file));
          };
          const names = ast
            .childrenForFieldName("name")
            .filter((node): node is SyntaxNode => !!node);
          for (const name of names) {
            const imported = field(name, "name")?.text ?? name.text;
            const alias = field(name, "alias")?.text ?? imported.split(".")[0];
            const target = resolvePython(module ? moduleName : imported);
            importEdge(
              info,
              target,
              ast,
              module ? `from ${moduleName} import ${imported}` : imported,
            );
            if (target && ast.parent?.id === info.root.id)
              info.imports.set(alias, {
                file: target,
                ...(module ? { name: imported } : {}),
              });
          }
        } else if (
          (info.language === "c" || info.language === "cpp") &&
          ast.type === "preproc_include"
        ) {
          const include = field(ast, "path")?.text ?? "";
          importEdge(
            info,
            include.startsWith('"')
              ? findFile(resolveLocal(dir, include.slice(1, -1)), [])
              : undefined,
            ast,
            include,
          );
        } else if (
          info.language === "rust" &&
          ast.type === "mod_item" &&
          !field(ast, "body")
        ) {
          const name = field(ast, "name")?.text ?? "";
          importEdge(
            info,
            findFile(resolveLocal(dir, name), ["rs"]) ??
              findFile(resolveLocal(dir, name, "mod.rs"), []),
            ast,
            name,
          );
        } else if (info.language === "rust" && ast.type === "use_declaration") {
          const argument = field(ast, "argument");
          const raw = argument?.text ?? "";
          const match = raw.match(
            /^(?:(crate|self|super)::)?([\w:]+?)(?:\s+as\s+(\w+))?$/,
          );
          let target: string | undefined;
          if (match) {
            const parts = match[2].split("::"),
              name = parts.pop()!;
            const base =
              match[1] === "crate"
                ? path.posix.dirname(
                    [...infos.keys()].find(
                      (f) =>
                        /\/(?:main|lib)\.rs$/.test(f) &&
                        f.startsWith(root + "/"),
                    ) ?? info.file,
                  )
                : match[1] === "super"
                  ? path.posix.dirname(dir)
                  : dir;
            const module = resolveLocal(base, ...parts);
            target =
              findFile(module, ["rs"]) ??
              findFile(path.posix.join(module, "mod.rs"), []);
            if (target && ast.parent?.id === info.root.id)
              info.imports.set(match[3] ?? name, { file: target, name });
          }
          importEdge(info, target, ast, raw);
        } else if (info.language === "go" && ast.type === "import_spec") {
          // Go module paths require go.mod / build constraints; do not guess from basename.
          importEdge(
            info,
            undefined,
            ast,
            field(ast, "path")?.text ?? ast.text,
          );
        } else if (
          info.language === "java" &&
          ast.type === "import_declaration"
        ) {
          const name =
            named(ast).find((n) => n.type !== "asterisk")?.text ?? "";
          const matches = [...infos.values()].filter(
            (other) =>
              other.language === "java" &&
              named(other.root).some(
                (n) =>
                  n.type === "package_declaration" &&
                  compact(n.text).replace(/^package\s+|\s*;$/g, "") ===
                    name.split(".").slice(0, -1).join("."),
              ) &&
              path.posix.basename(other.file, ".java") ===
                name.split(".").at(-1),
          );
          importEdge(
            info,
            matches.length === 1 ? matches[0].file : undefined,
            ast,
            name,
          );
        }
      }
    }
    const addCall = (
      info: FileInfo,
      call: SyntaxNode,
      token: SyntaxNode,
      owner: Fn | undefined,
      target: Fn | undefined,
    ) => {
      const source = owner?.node.id ?? info.module.id;
      if (target) {
        map.edges.push({
          ...location(info.file, call),
          source,
          target: target.node.id,
          kind: "call",
          label: compact(token.text),
        });
        map.references!.push({
          file: info.file,
          from: token.startIndex,
          to: token.endIndex,
          targetId: target.node.id,
          name: target.node.name,
          line: target.node.line,
          documentation: target.node.documentation,
        });
      } else
        map.unresolved.push({
          ...location(info.file, call),
          owner: source,
          label: compact(token.text),
          kind: "call",
        });
    };
    for (const info of infos.values()) {
      const spec = languageFor(info.file)!;
      if (!("calls" in spec)) continue;
      const calls = descendants(info.root, (n) =>
        (spec.calls as readonly string[]).includes(n.type),
      );
      for (const call of calls) {
        const token = field(call, "function") ?? field(call, "name");
        if (!token) continue;
        const owner = info.functions
          .filter(
            (fn) =>
              fn.ast.startIndex <= call.startIndex &&
              fn.ast.endIndex >= call.endIndex,
          )
          .at(-1);
        let hiddenScope = false;
        for (
          let ancestor = call.parent;
          ancestor && ancestor.id !== owner?.ast.id;
          ancestor = ancestor.parent
        ) {
          if (
            /^(lambda|lambda_expression|closure_expression|func_literal|class_definition|class_declaration)$/.test(
              ancestor.type,
            )
          ) {
            hiddenScope = true;
            break;
          }
        }
        if (hiddenScope) {
          addCall(info, call, token, owner, undefined);
          continue;
        }
        const name = token.text,
          object = field(call, "object");
        const simple = /^[\p{L}_][\p{L}\p{N}_]*$/u.test(name) && !object;
        let target: Fn | undefined;
        const unique = (fns: Fn[]) => (fns.length === 1 ? fns[0] : undefined);
        let blocked = false;
        if (simple) {
          let current = owner;
          while (current) {
            if (current.bindings.has(name)) {
              blocked = true;
              break;
            }
            const matches = info.functions.filter(
              (fn) => fn.leaf === name && fn.scope === current!.node.id,
            );
            if (matches.length) {
              target = unique(matches);
              blocked = true;
              break;
            }
            current = info.functions.find(
              (fn) => fn.node.id === current!.node.parentId,
            );
          }
          if (!blocked && info.bindings.has(name)) blocked = true;
          if (!blocked) {
            const matches = info.functions.filter(
              (fn) =>
                fn.leaf === name &&
                fn.scope ===
                  (info.language === "python" ? "" : (owner?.container ?? "")),
            );
            target = unique(matches);
            blocked = matches.length > 0;
          }
          if (!blocked && info.imports.has(name)) {
            const imported = info.imports.get(name)!;
            if (imported.name)
              target = unique(
                infos
                  .get(imported.file)!
                  .functions.filter(
                    (fn) => !fn.scope && fn.leaf === imported.name,
                  ),
              );
          }
          if (!blocked && !target && info.language === "go") {
            const packageName = (other: FileInfo) =>
              named(other.root).find((n) => n.type === "package_clause")?.text;
            target = unique(
              [...infos.values()]
                .filter(
                  (other) =>
                    other.language === "go" &&
                    path.posix.dirname(other.file) ===
                      path.posix.dirname(info.file) &&
                    packageName(other) === packageName(info),
                )
                .flatMap((other) =>
                  other.functions.filter(
                    (fn) =>
                      fn.leaf === name &&
                      !fn.scope &&
                      fn.ast.type === "function_declaration",
                  ),
                ),
            );
          }
        } else if (info.language === "python" && token.type === "attribute") {
          const receiver = field(token, "object")?.text,
            attribute = field(token, "attribute")?.text;
          const imported =
            receiver &&
            !owner?.bindings.has(receiver) &&
            !info.bindings.has(receiver)
              ? info.imports.get(receiver)
              : undefined;
          if (imported && !imported.name)
            target = unique(
              infos
                .get(imported.file)!
                .functions.filter((fn) => !fn.scope && fn.leaf === attribute),
            );
        }
        addCall(info, call, token, owner, target);
      }
    }
    const incoming = new Set(
      map.edges
        .filter((edge) => edge.kind === "call")
        .map((edge) => edge.target),
    );
    map.entries = map.entries!.filter(
      (entry) => entry.kind !== "candidate" || !incoming.has(entry.symbolId),
    );
    if (infos.size)
      map.warnings.push(
        "Tree-sitter 提供语法结构；未解析的动态调用、外部依赖、宏 / 构建条件和跨语言桥接保留为未解析，不按同名猜测连线。",
      );
    return map;
  } finally {
    for (const tree of trees) tree.delete();
  }
}
