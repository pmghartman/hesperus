import * as vscode from "vscode";
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { Graph, View } from "./graph";
import { layout } from "./layout";

function cli(args: string[]): Promise<string> {
  const bin = vscode.workspace.getConfiguration("hesperus").get<string>("cliPath") || "hesperus";
  return new Promise((resolve, reject) =>
    execFile(bin, args, { maxBuffer: 1 << 29 }, (err, out, errOut) => (err ? reject(new Error(errOut || String(err))) : resolve(out))));
}

// Same graph UI for the sidebar view and the editor panel.
function mount(webview: vscode.Webview): vscode.Disposable {
  const folder = vscode.workspace.workspaceFolders?.[0];
  const nonce = randomBytes(16).toString("hex");
  webview.html = html(nonce);
  if (!folder)
    return webview.onDidReceiveMessage((m) => m.type === "ready" && webview.postMessage({ type: "error", text: "Open a folder to see its graph." }));
  const repo = folder.uri.fsPath;
  const expanded = new Set<string>();
  let graph: Graph | undefined;
  const render = async () => {
    try {
      graph ??= JSON.parse(await cli(["graph", repo])) as Graph;
      const view: View = JSON.parse(await cli(["view", repo, ...[...expanded].sort().flatMap((e) => ["--expand", e])]));
      webview.postMessage({ type: "layout", layout: await layout(graph, view), expanded: [...expanded] });
    } catch (e) {
      webview.postMessage({ type: "error", text: String(e) });
    }
  };
  // Webview posts "ready" once its listener exists; messages sent earlier are dropped.
  return webview.onDidReceiveMessage(async (m) => {
    if (m.type === "ready") {
      await render();
    } else if (m.type === "toggle") {
      expanded.has(m.id) ? expanded.delete(m.id) : expanded.add(m.id);
      await render();
    } else if (m.type === "open") {
      const n = graph?.nodes.find((x) => x.id === m.id);
      if (!n?.path || !n.range) return;
      const uri = vscode.Uri.joinPath(folder.uri, n.path);
      const r = new vscode.Range(n.range.start_line, n.range.start_col, n.range.end_line, n.range.end_col);
      await vscode.window.showTextDocument(uri, { selection: r, viewColumn: vscode.ViewColumn.Beside });
    }
  });
}

class SidebarProvider implements vscode.WebviewViewProvider {
  constructor(private open: () => void) {}

  // Activity-bar views cannot run a command directly; opening the view opens the editor tab instead.
  resolveWebviewView(view: vscode.WebviewView) {
    view.webview.html = `<!doctype html><body style="padding:8px">The graph opens in an editor tab.</body>`;
    const go = () => {
      if (!view.visible) return;
      this.open();
      vscode.commands.executeCommand("workbench.action.closeSidebar");
    };
    view.onDidChangeVisibility(go);
    go();
  }
}

class GraphPanel {
  private panel?: vscode.WebviewPanel;
  private sub?: vscode.Disposable;

  constructor(private icon: vscode.Uri) {}

  show() {
    if (this.panel) return this.panel.reveal();
    const name = vscode.workspace.workspaceFolders?.[0]?.name;
    this.panel = vscode.window.createWebviewPanel("hesperus", name ? `Graph: ${name}` : "Hesperus", vscode.ViewColumn.Active, {
      enableScripts: true,
      retainContextWhenHidden: true,
    });
    this.panel.iconPath = this.icon;
    this.sub = mount(this.panel.webview);
    this.panel.onDidDispose(() => {
      this.sub?.dispose();
      this.panel = undefined;
    });
  }

  refresh() {
    if (!this.panel) return this.show();
    this.sub?.dispose();
    this.sub = mount(this.panel.webview);
  }
}

export function activate(ctx: vscode.ExtensionContext) {
  const graph = new GraphPanel(vscode.Uri.joinPath(ctx.extensionUri, "media", "graph.svg"));
  ctx.subscriptions.push(
    vscode.window.registerWebviewViewProvider("hesperus.graph", new SidebarProvider(() => graph.show())),
    vscode.commands.registerCommand("hesperus.refresh", () => graph.refresh()),
    vscode.commands.registerCommand("hesperus.openGraph", () => graph.show()),
  );
}

export function deactivate() {}

function html(nonce: string): string {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'">
<style>
body{margin:0;font:12px var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background)}
rect.box{fill:var(--vscode-editorWidget-background);stroke:var(--vscode-panel-border);cursor:pointer}
rect.box.container{fill:none}
text{fill:var(--vscode-foreground);pointer-events:none}
.w{stroke:var(--vscode-descriptionForeground);fill:none}
.w.may{stroke-dasharray:6 3}.w.unresolved{stroke:var(--vscode-errorForeground);stroke-dasharray:2 3}
.w.flow{stroke:var(--vscode-charts-blue)}
#err{padding:12px;color:var(--vscode-errorForeground);white-space:pre-wrap}
</style></head><body><div id="err"></div><svg id="g" xmlns="http://www.w3.org/2000/svg"></svg>
<script nonce="${nonce}">
const vs=acquireVsCodeApi(),svg=document.getElementById("g"),NS="http://www.w3.org/2000/svg";
const el=(t,a,p)=>{const e=document.createElementNS(NS,t);for(const k in a)e.setAttribute(k,a[k]);(p||svg).appendChild(e);return e};
addEventListener("message",({data:m})=>{
  if(m.type==="error"){document.getElementById("err").textContent=m.text;return}
  document.getElementById("err").textContent="";
  const L=m.layout;svg.replaceChildren();
  svg.setAttribute("width",L.width+40);svg.setAttribute("height",L.height+40);
  const g=el("g",{transform:"translate(20,20)"});
  for(const b of L.boxes){
    const t=b.node.kind, term=!!b.node.path&&!!b.node.range;
    const r=el("rect",{class:"box"+(b.container?" container":""),x:b.x,y:b.y,width:b.w,height:b.h,rx:4},g);
    r.addEventListener("click",()=>vs.postMessage({type:term?"open":"toggle",id:b.id}));
    r.addEventListener("dblclick",()=>vs.postMessage({type:"toggle",id:b.id}));
    el("text",{x:b.x+8,y:b.y+16},g).textContent=b.node.name+" ["+t+"]";
  }
  for(const w of L.wires){
    const r=w.rollup,cls=r.unresolved?"unresolved":r.may?"may":"";
    const [a,b]=w.points;
    const p=el("path",{class:"w "+r.kind+" "+cls,d:"M"+a.x+","+a.y+"L"+b.x+","+b.y,"stroke-width":Math.min(1+Math.log2(r.weight),5)},g);
    el("title",{},p).textContent=r.kind+" x"+r.weight+" (resolved "+r.resolved+", may "+r.may+", unresolved "+r.unresolved+")";
  }
});
vs.postMessage({type:"ready"});
</script></body></html>`;
}
