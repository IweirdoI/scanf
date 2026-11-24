export interface Location {
  file: string;
  line: number;
  endLine: number;
}
export interface Step extends Location {
  kind: string;
  text: string;
  depth: number;
}
export interface SourceUse extends Location {
  from: number;
  to: number;
  text: string;
  role: string;
}
export interface ParameterInfo extends Location {
  name: string;
  declaration: string;
  type: string;
  optional: boolean;
  defaultValue?: string;
  from: number;
  to: number;
  description: string;
  descriptionSource: "comment" | "usage" | "unknown";
  uses: SourceUse[];
  usesTruncated: boolean;
}
export interface CodeReference {
  file: string;
  from: number;
  to: number;
  targetId: string;
  line?: number;
  name?: string;
  type?: string;
  documentation?: string;
}
export interface CodeNode extends Location {
  language?: import("./languages").LanguageId;
  id: string;
  name: string;
  kind: "module" | "function";
  async?: boolean;
  parentId?: string;
  parameters?: string[];
  parameterDetails?: ParameterInfo[];
  documentation?: string;
  branches?: number;
  steps?: Step[];
  stepsTruncated?: boolean;
  summary: string;
}
export interface Edge extends Location {
  source: string;
  target: string;
  kind: "import" | "call";
  label: string;
}
export interface Unresolved extends Location {
  owner: string;
  label: string;
  kind: "import" | "call";
}
export interface EntryPoint extends Location {
  symbolId: string;
  kind: "startup" | "callback" | "export" | "candidate";
  label: string;
  reason: string;
  candidate: boolean;
}
export interface CodeMap {
  languages?: import("./languages").LanguageId[];
  nodes: CodeNode[];
  edges: Edge[];
  unresolved: Unresolved[];
  warnings: string[];
  entries?: EntryPoint[];
  references?: CodeReference[];
  root: string;
  generatedAt: string;
}
