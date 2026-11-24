import type ts from "typescript";
import { analyze, normalize } from "./analyzer";
import { analyzeSyntax } from "./syntax-analyzer";
import { isScript, languageFor } from "./languages";
import type { CodeMap } from "./model";

/** One snapshot / graph for every language. Preserve TS semantic resolution. */
export async function analyzeProject(
  files: Record<string, string>,
  root: string,
  options: ts.CompilerOptions = {},
): Promise<CodeMap> {
  const entries = Object.entries(files).map(
    ([file, text]) => [normalize(file), text] as const,
  );
  const scripts = Object.fromEntries(
    entries.filter(([file]) => isScript(file)),
  );
  const syntax = Object.fromEntries(
    entries.filter(([file]) => languageFor(file) && !isScript(file)),
  );
  const map = analyze(scripts, root, options);
  const extra = await analyzeSyntax(syntax, normalize(root));
  map.nodes.push(...extra.nodes);
  map.edges.push(...extra.edges);
  map.unresolved.push(...extra.unresolved);
  map.warnings.push(...extra.warnings);
  (map.entries ??= []).push(...(extra.entries ?? []));
  (map.references ??= []).push(...(extra.references ?? []));
  for (const node of map.nodes) node.language = languageFor(node.file)?.id;
  map.languages = [
    ...new Set(
      map.nodes
        .map((node) => node.language)
        .filter((id): id is NonNullable<typeof id> => !!id),
    ),
  ];
  return map;
}
