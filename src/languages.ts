/** Shared by scanning, analysis and host integrations. Grammars are loaded only on demand. */
export const languages = [
  {
    id: "typescript",
    label: "TypeScript",
    extensions: ["ts", "tsx", "mts", "cts"],
    editorIds: ["typescript", "typescriptreact"],
  },
  {
    id: "javascript",
    label: "JavaScript",
    extensions: ["js", "jsx", "mjs", "cjs"],
    editorIds: ["javascript", "javascriptreact"],
  },
  {
    id: "python",
    label: "Python",
    extensions: ["py", "pyi"],
    editorIds: ["python"],
    functions: ["function_definition"],
    calls: ["call"],
  },
  {
    id: "c",
    label: "C",
    extensions: ["c", "h"],
    editorIds: ["c"],
    functions: ["function_definition"],
    calls: ["call_expression"],
  },
  {
    id: "cpp",
    label: "C++",
    extensions: ["cpp", "cc", "cxx", "hpp", "hh", "hxx"],
    editorIds: ["cpp"],
    functions: ["function_definition"],
    calls: ["call_expression"],
  },
  {
    id: "java",
    label: "Java",
    extensions: ["java"],
    editorIds: ["java"],
    functions: ["method_declaration", "constructor_declaration"],
    calls: ["method_invocation"],
  },
  {
    id: "rust",
    label: "Rust",
    extensions: ["rs"],
    editorIds: ["rust"],
    functions: ["function_item"],
    calls: ["call_expression"],
  },
  {
    id: "go",
    label: "Go",
    extensions: ["go"],
    editorIds: ["go"],
    functions: ["function_declaration", "method_declaration"],
    calls: ["call_expression"],
  },
] as const;
export type LanguageId = (typeof languages)[number]["id"];
export const languageFor = (file: string) => {
  const extension = file.split(".").at(-1)?.toLowerCase();
  return languages.find((language) =>
    (language.extensions as readonly string[]).includes(extension ?? ""),
  );
};
export const sourceGlob = `**/*.{${languages.flatMap((language) => [...language.extensions]).join(",")}}`;
export const editorLanguageIds = languages.flatMap((language) => [
  ...language.editorIds,
]);
export const isScript = (file: string) =>
  /^(typescript|javascript)$/.test(languageFor(file)?.id ?? "");
