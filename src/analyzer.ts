import ts from "typescript";
import path from "node:path";
import {
  CodeMap,
  CodeNode,
  EntryPoint,
  Location,
  Step,
  ParameterInfo,
  SourceUse,
} from "./model";

/** 统一源码路径的表示，便于索引、跨文件解析和位置比较。
 * @param file 待规范化的文件路径；相对路径按当前进程目录解析，输出使用正斜杠的绝对路径。
 */
export const normalize = (file: string) =>
  path.resolve(file).replace(/\\/g, "/");
type Fn =
  | ts.FunctionDeclaration
  | ts.FunctionExpression
  | ts.ArrowFunction
  | ts.MethodDeclaration
  | ts.ConstructorDeclaration
  | ts.GetAccessorDeclaration
  | ts.SetAccessorDeclaration;
const isFn = (n: ts.Node): n is Fn =>
  ts.isFunctionDeclaration(n) ||
  ts.isFunctionExpression(n) ||
  ts.isArrowFunction(n) ||
  ts.isMethodDeclaration(n) ||
  ts.isConstructorDeclaration(n) ||
  ts.isGetAccessorDeclaration(n) ||
  ts.isSetAccessorDeclaration(n);
const compact = (s: string) => s.replace(/\s+/g, " ").slice(0, 180);

/** 把一份工作区源码快照解析为符号、调用、入口与参数用法；不执行被读取的代码。
 * @param input 文件路径到源码文本的映射。仅这些内存文件参与解析，不会扫描依赖包源码。
 * @param root 项目根目录，用于解析相对路径、模块导入和生成文件展示名称。
 * @param options 从 tsconfig / jsconfig 得到的 TypeScript 编译选项，例如 paths 别名；仍强制只解析、不输出文件。
 */
export function analyze(
  input: Record<string, string>,
  root: string,
  options: ts.CompilerOptions = {},
): CodeMap {
  const files = new Map(
    Object.entries(input).map(([file, text]) => [normalize(file), text]),
  );
  root = normalize(root);
  const directories = new Set<string>();
  for (const file of files.keys()) {
    let dir = path.posix.dirname(file);
    while (!directories.has(dir)) {
      directories.add(dir);
      const parent = path.posix.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  const compilerOptions: ts.CompilerOptions = {
    ...options,
    target: ts.ScriptTarget.Latest,
    module: ts.ModuleKind.ESNext,
    moduleResolution:
      options.moduleResolution ?? ts.ModuleResolutionKind.Bundler,
    allowJs: true,
    noLib: true,
    noEmit: true,
  };
  const host: ts.CompilerHost = {
    getSourceFile: (file, languageVersion) => {
      const text = files.get(normalize(file));
      return text === undefined
        ? undefined
        : ts.createSourceFile(file, text, languageVersion, true);
    },
    getDefaultLibFileName: () => "",
    writeFile: () => {},
    getCurrentDirectory: () => root,
    getCanonicalFileName: (file) => normalize(file),
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => "\n",
    fileExists: (file) => files.has(normalize(file)),
    readFile: (file) => files.get(normalize(file)),
    directoryExists: (dir) => directories.has(normalize(dir)),
    getDirectories: () => [],
    realpath: (file) => normalize(file),
  };
  const program = ts.createProgram([...files.keys()], compilerOptions, host);
  const checker = program.getTypeChecker();
  const result: CodeMap = {
    root,
    nodes: [],
    edges: [],
    unresolved: [],
    warnings: [],
    generatedAt: new Date().toISOString(),
  };
  const functions = new Map<ts.Node, CodeNode>();
  const sources = program
    .getSourceFiles()
    .filter((sf) => files.has(normalize(sf.fileName)));
  const loc = (node: ts.Node, sf: ts.SourceFile): Location => ({
    file: normalize(sf.fileName),
    line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
    endLine: sf.getLineAndCharacterOfPosition(node.getEnd()).line + 1,
  });
  const nameOf = (fn: Fn, sf: ts.SourceFile): string => {
    let name = fn.name?.getText(sf);
    if (!name && ts.isVariableDeclaration(fn.parent))
      name = fn.parent.name.getText(sf);
    if (!name && ts.isPropertyAssignment(fn.parent))
      name = fn.parent.name.getText(sf);
    if (ts.isConstructorDeclaration(fn)) name = "constructor";
    if (!name) name = `匿名函数 @${loc(fn, sf).line}`;
    if (ts.isClassLike(fn.parent))
      name = `${fn.parent.name?.text ?? "匿名类"}.${name}`;
    return name;
  };
  const moduleId = (file: string) => `module:${normalize(file)}`;
  for (const sf of sources) {
    const file = normalize(sf.fileName);
    const diagnostics =
      (sf as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] })
        .parseDiagnostics ?? [];
    if (diagnostics.length)
      result.warnings.push(
        `${path.relative(root, file)} 存在 ${diagnostics.length} 处语法问题，结构可能不完整。`,
      );
    result.nodes.push({
      id: moduleId(file),
      name: path.relative(root, file).replace(/\\/g, "/"),
      kind: "module",
      file,
      line: 1,
      endLine: sf.getLineAndCharacterOfPosition(sf.end).line + 1,
      summary: "工作区源码模块；箭头表示显式导入或再导出依赖。",
    });
    const collect = (node: ts.Node) => {
      if (isFn(node) && node.body) {
        const position = loc(node, sf);
        const steps: Step[] = [];
        let branches = 0,
          count = 0;
        const step = (
          n: ts.Node,
          depth: number,
          kind: string,
          text: string,
        ) => {
          count++;
          if (steps.length < 80)
            steps.push({ ...loc(n, sf), depth, kind, text: compact(text) });
        };
        const read = (n: ts.Node, depth: number) => {
          if (n !== node && isFn(n)) return;
          if (ts.isIfStatement(n)) {
            branches++;
            step(n, depth, "条件", `如果 ${n.expression.getText(sf)}`);
            read(n.thenStatement, depth + 1);
            if (n.elseStatement) {
              step(n.elseStatement, depth, "否则", "否则");
              read(n.elseStatement, depth + 1);
            }
            return;
          }
          if (
            ts.isForStatement(n) ||
            ts.isForInStatement(n) ||
            ts.isForOfStatement(n) ||
            ts.isWhileStatement(n) ||
            ts.isDoStatement(n)
          ) {
            branches++;
            step(n, depth, "循环", compact(n.getText(sf).split("{")[0]));
            read(n.statement, depth + 1);
            return;
          }
          if (ts.isTryStatement(n)) {
            step(n, depth, "尝试", "执行 try 区域");
            read(n.tryBlock, depth + 1);
            if (n.catchClause) {
              step(
                n.catchClause,
                depth,
                "异常",
                `捕获异常 ${n.catchClause.variableDeclaration?.name.getText(sf) ?? ""}`,
              );
              read(n.catchClause.block, depth + 1);
            }
            if (n.finallyBlock) {
              step(n.finallyBlock, depth, "收尾", "执行 finally 区域");
              read(n.finallyBlock, depth + 1);
            }
            return;
          }
          if (ts.isSwitchStatement(n)) {
            step(n, depth, "分派", `根据 ${n.expression.getText(sf)} 分派`);
            for (const clause of n.caseBlock.clauses) {
              branches++;
              step(
                clause,
                depth + 1,
                "分支",
                ts.isCaseClause(clause)
                  ? `case ${clause.expression.getText(sf)}`
                  : "default",
              );
              clause.statements.forEach((s) => read(s, depth + 2));
            }
            return;
          }
          if (ts.isReturnStatement(n)) step(n, depth, "返回", n.getText(sf));
          else if (ts.isThrowStatement(n))
            step(n, depth, "抛错", n.getText(sf));
          else if (ts.isVariableStatement(n))
            step(n, depth, "变量", n.getText(sf));
          else if (ts.isExpressionStatement(n))
            step(n, depth, "执行", n.getText(sf));
          else if (ts.isBreakStatement(n) || ts.isContinueStatement(n))
            step(n, depth, "跳转", n.getText(sf));
          else if (ts.isConditionalExpression(n)) {
            branches++;
            step(n, depth, "条件表达式", n.getText(sf));
          } else if (
            ts.isBinaryExpression(n) &&
            [
              ts.SyntaxKind.AmpersandAmpersandToken,
              ts.SyntaxKind.BarBarToken,
              ts.SyntaxKind.QuestionQuestionToken,
            ].includes(n.operatorToken.kind)
          ) {
            branches++;
            step(n, depth, "短路表达式", n.getText(sf));
          }
          ts.forEachChild(n, (child) => read(child, depth));
        };
        read(node.body, 0);
        if (!ts.isBlock(node.body))
          step(node.body, 0, "隐式返回", node.body.getText(sf));
        const async = !!node.modifiers?.some(
          (m) => m.kind === ts.SyntaxKind.AsyncKeyword,
        );
        const parameters = node.parameters.map((p) => compact(p.getText(sf)));
        const parameterDetails: ParameterInfo[] = node.parameters.map(
          (parameter) => {
            const bindings: ts.Identifier[] = [];
            const bindingNames = (name: ts.BindingName) => {
              if (ts.isIdentifier(name)) bindings.push(name);
              else
                for (const element of name.elements)
                  if (ts.isBindingElement(element)) bindingNames(element.name);
            };
            bindingNames(parameter.name);
            const symbols = new Set(
              bindings
                .map((n) => checker.getSymbolAtLocation(n))
                .filter(Boolean),
            );
            const uses: SourceUse[] = [];
            let count = 0;
            const readUse = (identifier: ts.Node) => {
              if (
                ts.isIdentifier(identifier) &&
                symbols.has(checker.getSymbolAtLocation(identifier))
              ) {
                count++;
                if (uses.length < 24) {
                  let context: ts.Node = identifier,
                    role = "在函数体中读取";
                  for (
                    let parent: ts.Node | undefined = identifier.parent;
                    parent && parent !== node;
                    parent = parent.parent
                  ) {
                    if (
                      ts.isCallExpression(parent) ||
                      ts.isNewExpression(parent)
                    ) {
                      const index =
                        parent.arguments?.findIndex(
                          (a) =>
                            a.pos <= identifier.pos && a.end >= identifier.end,
                        ) ?? -1;
                      context = parent;
                      role =
                        index >= 0
                          ? `作为 ${compact(parent.expression.getText(sf))} 的第 ${index + 1} 个实参`
                          : `用于访问 / 调用 ${compact(parent.expression.getText(sf))}`;
                      break;
                    }
                    if (
                      ts.isIfStatement(parent) &&
                      identifier.end <= parent.expression.end
                    ) {
                      context = parent.expression;
                      role = "参与条件判断";
                      break;
                    }
                    if (
                      (ts.isForOfStatement(parent) ||
                        ts.isForInStatement(parent)) &&
                      parent.expression.pos <= identifier.pos &&
                      parent.expression.end >= identifier.end
                    ) {
                      context = parent.expression;
                      role = "作为被遍历的数据";
                      break;
                    }
                    if (ts.isReturnStatement(parent)) {
                      context = parent;
                      role = "参与返回结果";
                      break;
                    }
                    if (ts.isVariableDeclaration(parent)) {
                      context = parent;
                      role = `用于初始化 ${compact(parent.name.getText(sf))}`;
                      break;
                    }
                    if (
                      ts.isPropertyAccessExpression(parent) &&
                      parent.expression === identifier
                    ) {
                      context = parent;
                      role = `读取 / 使用其 ${parent.name.text} 成员`;
                    }
                    if (ts.isExpressionStatement(parent)) {
                      context = parent;
                      break;
                    }
                  }
                  uses.push({
                    ...loc(identifier, sf),
                    from: identifier.getStart(sf),
                    to: identifier.end,
                    text: compact(context.getText(sf)),
                    role,
                  });
                }
              }
              ts.forEachChild(identifier, readUse);
            };
            if (node.body) readUse(node.body);
            const comment = ts
              .getJSDocParameterTags(parameter)
              .map((tag) => ts.getTextOfJSDocComment(tag.comment) ?? "")
              .filter(Boolean)
              .join("\n");
            const facts = [...new Set(uses.map((u) => u.role))].slice(0, 3);
            return {
              ...loc(parameter, sf),
              name: parameter.name.getText(sf),
              declaration: compact(parameter.getText(sf)),
              type:
                parameter.type?.getText(sf) ??
                checker.typeToString(checker.getTypeAtLocation(parameter)),
              optional: !!parameter.questionToken || !!parameter.initializer,
              defaultValue: parameter.initializer?.getText(sf),
              from: parameter.name.getStart(sf),
              to: parameter.name.end,
              description:
                comment ||
                facts.join("；") ||
                "当前函数体未读取此参数；源码未提供用途注释。",
              descriptionSource: comment
                ? "comment"
                : facts.length
                  ? "usage"
                  : "unknown",
              uses,
              usesTruncated: count > uses.length,
            };
          },
        );
        const documentation = node.name
          ? ts.displayPartsToString(
              checker
                .getSymbolAtLocation(node.name)
                ?.getDocumentationComment(checker),
            )
          : "";
        const entry: CodeNode = {
          ...position,
          id: `function:${file}:${node.getStart(sf)}`,
          name: nameOf(node, sf),
          kind: "function",
          async,
          parameters,
          parameterDetails,
          documentation,
          branches,
          steps,
          stepsTruncated: count > steps.length,
          summary:
            documentation ||
            `${async ? "异步" : "同步"}函数，${parameters.length} 个参数，${branches} 处条件 / 循环 / 短路分支。`,
        };
        let parent: ts.Node | undefined = node.parent;
        while (parent) {
          if (functions.has(parent)) {
            entry.parentId = functions.get(parent)!.id;
            break;
          }
          parent = parent.parent;
        }
        functions.set(node, entry);
        result.nodes.push(entry);
      }
      ts.forEachChild(node, collect);
    };
    collect(sf);
  }
  const resolveExpression = (
    expression: ts.Expression,
  ): CodeNode | undefined => {
    if (functions.has(expression)) return functions.get(expression);
    let symbol = checker.getSymbolAtLocation(
      ts.isPropertyAccessExpression(expression) ? expression.name : expression,
    );
    if (symbol?.flags && symbol.flags & ts.SymbolFlags.Alias) {
      try {
        symbol = checker.getAliasedSymbol(symbol);
      } catch {
        return undefined;
      }
    }
    for (const declaration of symbol?.declarations ?? []) {
      if (functions.has(declaration)) return functions.get(declaration);
      if (
        ts.isVariableDeclaration(declaration) &&
        declaration.initializer &&
        functions.has(declaration.initializer)
      )
        return functions.get(declaration.initializer);
      if (
        ts.isPropertyAssignment(declaration) &&
        functions.has(declaration.initializer)
      )
        return functions.get(declaration.initializer);
    }
    return undefined;
  };
  const resolveFn = (
    call: ts.CallExpression | ts.NewExpression,
  ): CodeNode | undefined => {
    const signature = checker.getResolvedSignature(call);
    if (signature?.declaration && functions.has(signature.declaration))
      return functions.get(signature.declaration);
    return resolveExpression(call.expression);
  };
  const entries: EntryPoint[] = [];
  result.references = [];
  const addEntry = (entry: EntryPoint) => {
    if (
      !entries.some(
        (e) =>
          e.symbolId === entry.symbolId &&
          e.kind === entry.kind &&
          e.line === entry.line &&
          e.label === entry.label,
      )
    )
      entries.push(entry);
  };
  for (const sf of sources) {
    const startupCalls: Location[] = [];
    const visit = (node: ts.Node, owner: string) => {
      if (functions.has(node)) owner = functions.get(node)!.id;
      if (ts.isIdentifier(node)) {
        const target = resolveExpression(node);
        if (result.references!.length < 30000) {
          let symbol = checker.getSymbolAtLocation(node);
          if (symbol?.flags && symbol.flags & ts.SymbolFlags.Alias)
            symbol = checker.getAliasedSymbol(symbol);
          const declaration = symbol?.declarations?.find((d) =>
            files.has(normalize(d.getSourceFile().fileName)),
          );
          if (target || declaration) {
            const destination = target ?? {
              id: moduleId(declaration!.getSourceFile().fileName),
              line: loc(declaration!, declaration!.getSourceFile()).line,
            };
            result.references!.push({
              file: normalize(sf.fileName),
              from: node.getStart(sf),
              to: node.end,
              targetId: destination.id,
              line: destination.line,
              name: target?.name ?? node.text,
              type: compact(
                checker.typeToString(checker.getTypeAtLocation(node)),
              ),
              documentation: ts.displayPartsToString(
                symbol?.getDocumentationComment(checker),
              ),
            });
          }
        }
      }
      let specifier: ts.Expression | undefined;
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
        specifier = node.moduleSpecifier;
      if (
        ts.isImportEqualsDeclaration(node) &&
        ts.isExternalModuleReference(node.moduleReference)
      )
        specifier = node.moduleReference.expression;
      const isRequire =
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "require" &&
        !checker
          .getSymbolAtLocation(node.expression)
          ?.declarations?.some((d) =>
            files.has(normalize(d.getSourceFile().fileName)),
          );
      if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword || isRequire) &&
        node.arguments[0] &&
        ts.isStringLiteralLike(node.arguments[0])
      )
        specifier = node.arguments[0];
      if (specifier && ts.isStringLiteralLike(specifier)) {
        const resolved = ts.resolveModuleName(
          specifier.text,
          sf.fileName,
          compilerOptions,
          host,
        ).resolvedModule;
        const target = resolved && moduleId(resolved.resolvedFileName);
        if (target && result.nodes.some((n) => n.id === target))
          result.edges.push({
            ...loc(node, sf),
            source: moduleId(sf.fileName),
            target,
            kind: "import",
            label: specifier.text,
          });
        else
          result.unresolved.push({
            ...loc(node, sf),
            owner: moduleId(sf.fileName),
            label: specifier.text,
            kind: "import",
          });
      } else if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
        const target = resolveFn(node);
        const label = compact(node.expression.getText(sf));
        // Instance fields run during construction, not module loading. Their constructor
        // ownership is not modeled yet, so preserve them as uncertain source evidence.
        let deferredField = false;
        if (owner === moduleId(sf.fileName))
          for (
            let parent: ts.Node | undefined = node.parent;
            parent && !ts.isSourceFile(parent);
            parent = parent.parent
          ) {
            if (
              ts.isPropertyDeclaration(parent) &&
              !parent.modifiers?.some(
                (m) => m.kind === ts.SyntaxKind.StaticKeyword,
              )
            ) {
              deferredField = true;
              break;
            }
          }
        if (owner === moduleId(sf.fileName) && !deferredField)
          startupCalls.push(loc(node, sf));
        if (target && !deferredField)
          result.edges.push({
            ...loc(node, sf),
            source: owner,
            target: target.id,
            kind: "call",
            label,
          });
        else
          result.unresolved.push({
            ...loc(node, sf),
            owner,
            label: deferredField
              ? `实例字段初始化（随构造执行）：${label}`
              : label,
            kind: "call",
          });
        // A callback argument is evidence of registration, never a direct call edge.
        // Framework meaning is intentionally a candidate inferred from the registration shape.
        if (ts.isCallExpression(node)) {
          const method = ts.isPropertyAccessExpression(node.expression)
            ? node.expression.name.text
            : ts.isIdentifier(node.expression)
              ? node.expression.text
              : "";
          if (
            /^(get|post|put|patch|delete|use|on|once|addEventListener|registerTool|registerResource|command|test|it|describe|setTimeout|setInterval)$/.test(
              method,
            )
          ) {
            const name = node.arguments.find((a) => ts.isStringLiteralLike(a));
            for (const argument of node.arguments) {
              const callback = resolveExpression(argument);
              if (callback)
                addEntry({
                  ...loc(node, sf),
                  symbolId: callback.id,
                  kind: "callback",
                  label: `${label}${name ? " · " + compact(name.getText(sf)) : ""} → ${callback.name}`,
                  reason: `源码将此函数作为 ${label} 的参数传入；入口用途按注册形态推断。`,
                  candidate: true,
                });
            }
          }
        }
      }
      ts.forEachChild(node, (child) => visit(child, owner));
    };
    visit(sf, moduleId(sf.fileName));
    const id = moduleId(sf.fileName);
    const firstCall = startupCalls.sort((a, b) => a.line - b.line)[0];
    if (firstCall)
      addEntry({
        ...firstCall,
        symbolId: id,
        kind: "startup",
        label: `${path.relative(root, sf.fileName).replace(/\\/g, "/")} · 模块初始化`,
        reason:
          "文件顶层包含调用表达式；模块加载时可能执行，条件分支仍以源码为准。",
        candidate: false,
      });
    const moduleSymbol = checker.getSymbolAtLocation(sf);
    if (moduleSymbol)
      for (let symbol of checker.getExportsOfModule(moduleSymbol)) {
        const exportName = symbol.name;
        if (symbol.flags & ts.SymbolFlags.Alias)
          symbol = checker.getAliasedSymbol(symbol);
        for (const declaration of symbol.declarations ?? []) {
          const fn =
            functions.get(declaration) ??
            (ts.isVariableDeclaration(declaration) && declaration.initializer
              ? functions.get(declaration.initializer)
              : undefined);
          if (fn)
            addEntry({
              ...loc(declaration, declaration.getSourceFile()),
              symbolId: fn.id,
              kind: "export",
              label: `${exportName} · ${path.relative(root, sf.fileName).replace(/\\/g, "/")}`,
              reason: `此文件显式导出 ${exportName}，可从 API 边界开始阅读；导出不表示运行时一定调用。`,
              candidate: false,
            });
        }
      }
  }
  const incoming = new Set(
    result.edges.filter((e) => e.kind === "call").map((e) => e.target),
  );
  for (const fn of result.nodes.filter(
    (n) => n.kind === "function" && !n.parentId,
  )) {
    if (!incoming.has(fn.id) && !entries.some((e) => e.symbolId === fn.id))
      addEntry({
        ...fn,
        symbolId: fn.id,
        kind: "candidate",
        label: `${fn.name} · ${path.relative(root, fn.file).replace(/\\/g, "/")}`,
        reason:
          "当前扫描范围未发现直接调用方；可能由宿主、反射或未扫描代码调用，也可能未使用。",
        candidate: true,
      });
  }
  result.entries = entries;
  return result;
}
