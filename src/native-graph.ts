import * as vscode from "vscode";
import type { CodeMap } from "./model";
import type { ReaderView } from "./reader-model";
import { graphHtml } from "./logic-graph";
export class NativeGraph
  implements vscode.WebviewViewProvider, vscode.Disposable
{
  title = "逻辑关系图";
  description?: string;
  private status = "";
  private view?: vscode.WebviewView;
  private panel?: vscode.WebviewPanel;
  private snapshot?: ReaderView;
  private map?: CodeMap;
  private choice = "";
  private depth = 2;
  private visibility = new vscode.EventEmitter<{ visible: boolean }>();
  readonly onDidChangeVisibility = this.visibility.event;
  constructor(
    private navigate: (target: any) => Promise<void>,
    private error: (error: unknown) => void,
  ) {}
  set message(value: string | undefined) {
    this.status = value ?? "";
    this.render();
  }
  resolveWebviewView(view: vscode.WebviewView) {
    this.view = view;
    this.bind(view.webview);
    view.onDidChangeVisibility(() =>
      this.visibility.fire({ visible: view.visible }),
    );
    view.onDidDispose(() => {
      this.view = undefined;
    });
    this.visibility.fire({ visible: true });
    this.render();
  }
  update(snapshot?: ReaderView, map?: CodeMap) {
    this.snapshot = snapshot;
    this.map = map;
    if (this.choice && !map?.nodes.some((node) => node.id === this.choice))
      this.choice = "";
    this.render();
  }
  private bind(webview: vscode.Webview) {
    webview.options = { enableScripts: true, localResourceRoots: [] };
    webview.onDidReceiveMessage(async (message) => {
      try {
        if (message?.type === "navigate") {
          await this.navigate(message);
          if (this.choice) {
            this.choice = message.id;
            this.render();
          }
        } else if (
          message?.type === "choice" &&
          typeof message.id === "string" &&
          (!message.id ||
            this.map?.nodes.some((node) => node.id === message.id))
        ) {
          this.choice = message.id;
          this.render();
        } else if (
          message?.type === "depth" &&
          [1, 2, 3].includes(message.depth)
        ) {
          this.depth = message.depth;
          this.render();
        } else if (message?.type === "expand") this.expand();
      } catch (error) {
        this.error(error);
      }
    });
  }
  expand() {
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        "scanf.graph",
        "Scanf · 逻辑关系图",
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
        { enableScripts: true, localResourceRoots: [] },
      );
      this.bind(this.panel.webview);
      this.panel.onDidDispose(() => {
        this.panel = undefined;
      });
    } else this.panel.reveal(vscode.ViewColumn.Beside, true);
    this.render();
  }
  private render() {
    const html = graphHtml(
      this.map,
      this.snapshot,
      this.choice,
      this.depth,
      this.status,
    );
    if (this.view) {
      this.view.title = this.title;
      this.view.description = this.description;
      this.view.webview.html = html;
    }
    if (this.panel) this.panel.webview.html = html;
  }
  dispose() {
    this.panel?.dispose();
    this.visibility.dispose();
  }
}
