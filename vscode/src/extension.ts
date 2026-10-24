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

export function activate(ctx: vscode.ExtensionContext) {
  ctx.subscriptions.push(
    vscode.commands.registerCommand("hesperus.openGraph", async () => {
      const folder = vscode.workspace.workspaceFolders?.[0];
      if (!folder) return vscode.window.showErrorMessage("Open a folder first.");
      const repo = folder.uri.fsPath;
      const panel = vscode.window.createWebviewPanel("hesperus", "Hesperus", vscode.ViewColumn.Beside, { enableScripts: true });
      const nonce = randomBytes(16).toString("hex");
      panel.webview.html = html(nonce);
      const expanded = new Set<string>();
      let graph: Graph;
      const render = async () => {
        const view: View = JSON.parse(await cli(["view", repo, ...[...expanded].sort().flatMap((e) => ["--expand", e])]));
        panel.webview.postMessage({ type: "layout", layout: await layout(graph, view), expanded: [...expanded] });
      };
      try {
        graph = JSON.parse(await cli(["graph", repo]));
        await render();
      } catch (e) {
        panel.webview.postMessage({ type: "error", text: String(e) });
        return;
      }
      panel.webview.onDidReceiveMessage(async (m) => {
        if (m.type === "toggle") {
          expanded.has(m.id) ? expanded.delete(m.id) : expanded.add(m.id);
          await render();
        } else if (m.type === "open") {
          const n = graph.nodes.find((x) => x.id === m.id);
          if (!n?.path || !n.range) return;
          const uri = vscode.Uri.joinPath(folder.uri, n.path);
          const r = new vscode.Range(n.range.start_line, n.range.start_col, n.range.end_line, n.range.end_col);
          await vscode.window.showTextDocument(uri, { selection: r, viewColumn: vscode.ViewColumn.One });
        }
      });
    }),
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
</script></body></html>`;
}
