// The editor's graph tab as an MCP App: a host that renders `ui://` resources (Claude's chat) draws the
// same media/graph.js the VS Code webview runs, with a shim in place of the webview's API. The page's asks
// (open, close, zoom, go to source) become calls of the server's tools, whose results it draws.
import * as fs from "node:fs";
import * as path from "node:path";

export const MAP_URI = "ui://hesperus/map";
export const MAP_MIME = "text/html;profile=mcp-app";
/** The MCP Apps client, loaded by the page from a CDN; the resource's CSP names its origin. */
const APP_SDK = "https://unpkg.com/@modelcontextprotocol/ext-apps@1.7.5/dist/src/app-with-deps.js";
export const MAP_CSP = { resourceDomains: ["https://unpkg.com"] };

/** media/ beside the bundle (dist/media) or beside the compiled sources (vscode/out → vscode/media). */
function media(name: string): string {
  for (const d of [path.join(__dirname, "media"), path.join(__dirname, "..", "media")]) {
    const p = path.join(d, name);
    if (fs.existsSync(p)) return fs.readFileSync(p, "utf8");
  }
  throw new Error(`media/${name} not found beside ${__dirname}`);
}

// The webview's theme variables, given values for a page outside the editor.
const THEME = `:root { color-scheme: light dark;
  --vscode-editor-background: #ffffff; --vscode-editor-foreground: #1f2328; --vscode-foreground: #1f2328; --vscode-descriptionForeground: #656d76;
  --vscode-font-family: system-ui, sans-serif; --vscode-editor-font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  --vscode-charts-blue: #1a73e8; --vscode-charts-yellow: #b58900; --vscode-charts-red: #d1242f; --vscode-charts-green: #1a7f37; --vscode-charts-orange: #bc4c00; --vscode-charts-purple: #8250df;
  --vscode-errorForeground: #d1242f; --vscode-editorError-foreground: #d1242f; --vscode-editorWarning-foreground: #9a6700; --vscode-editorInfo-foreground: #0969da;
  --vscode-editorWidget-background: #f6f8fa; --vscode-editorWidget-border: #d0d7de; --vscode-widget-shadow: rgba(0,0,0,.16); --vscode-focusBorder: #0969da;
  --vscode-editorHoverWidget-background: #ffffff; --vscode-editorHoverWidget-foreground: #1f2328; --vscode-editorHoverWidget-border: #d0d7de;
  --vscode-toolbar-hoverBackground: rgba(0,0,0,.06); --vscode-panel-border: #d0d7de; --vscode-icon-foreground: #424a53;
  --vscode-symbolIcon-variableForeground: #0969da; --vscode-symbolIcon-functionForeground: #8250df; --vscode-symbolIcon-enumeratorMemberForeground: #1a7f37; }
@media (prefers-color-scheme: dark) { :root {
  --vscode-editor-background: #1e1e1e; --vscode-editor-foreground: #d4d4d4; --vscode-foreground: #cccccc; --vscode-descriptionForeground: #9d9d9d;
  --vscode-charts-blue: #3794ff; --vscode-charts-yellow: #cca700; --vscode-charts-red: #f14c4c; --vscode-charts-green: #89d185; --vscode-charts-orange: #d18616; --vscode-charts-purple: #b180d7;
  --vscode-errorForeground: #f48771; --vscode-editorError-foreground: #f14c4c; --vscode-editorWarning-foreground: #cca700; --vscode-editorInfo-foreground: #3794ff;
  --vscode-editorWidget-background: #252526; --vscode-editorWidget-border: #454545; --vscode-widget-shadow: rgba(0,0,0,.36); --vscode-focusBorder: #007fd4;
  --vscode-editorHoverWidget-background: #252526; --vscode-editorHoverWidget-foreground: #cccccc; --vscode-editorHoverWidget-border: #454545;
  --vscode-toolbar-hoverBackground: rgba(90,93,94,.31); --vscode-panel-border: #2b2b2b; --vscode-icon-foreground: #c5c5c5;
  --vscode-symbolIcon-variableForeground: #75beff; --vscode-symbolIcon-functionForeground: #b180d7; --vscode-symbolIcon-enumeratorMemberForeground: #75beff; } }
html, body { height: 560px !important; }`;

// Must match GRAPH_BODY in extension.ts: the elements graph.js looks up.
const BODY = `<svg id="view" xmlns="http://www.w3.org/2000/svg"><g id="scene"></g><g id="labels"></g></svg>
<div id="tools"><button id="auto" title="Semantic Zoom: zooming in opens boxes" aria-pressed="true"><svg viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5l3 3M5 7h4M7 5v4"/></svg></button><span class="sep"></span><button id="out" title="Zoom Out"><svg viewBox="0 0 16 16"><path d="M3.5 8h9"/></svg></button><span id="zoom">100%</span><button id="in" title="Zoom In"><svg viewBox="0 0 16 16"><path d="M3.5 8h9M8 3.5v9"/></svg></button><button id="fit" title="Fit to Window"><svg viewBox="0 0 16 16"><path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"/></svg></button></div>
<div id="msg">Loading…</div><div id="tip" hidden></div>`;

// Stands in for acquireVsCodeApi before graph.js runs; its posts queue until the App client connects.
const SHIM = `window.__hq = []; let __hs = {};
window.acquireVsCodeApi = () => ({ getState: () => __hs, setState: (s) => { __hs = s; }, postMessage: (m) => (window.__hsend ? window.__hsend(m) : window.__hq.push(m)) });`;

// Draws each tool result the host hands over, and turns the page's asks into tool calls.
const BRIDGE = `import { App } from "${APP_SDK}";
const app = new App({ name: "Hesperus map", version: "1" });
const deliver = (data) => window.dispatchEvent(new MessageEvent("message", { data }));
const show = (r, extra = {}) => {
  const sc = r && r.structuredContent;
  if (sc && sc.layout) deliver({ type: "layout", layout: sc.layout, hidden: [], ...extra });
  else deliver({ type: "status", status: { state: "error", detail: (r && r.content && r.content[0] && r.content[0].text) || "No map in that result." } });
};
const call = (args) => app.callServerTool({ name: "hesperus_map", arguments: args });
window.__hsend = async (m) => {
  try {
    if (m.type === "toggle") show(await call({ toggle: m.id }), { anchor: m.id });
    else if (m.type === "zoom") show(await call({ open: m.open || [], close: m.close || [] }), { anchor: m.anchor, seq: m.seq });
    else if (m.type === "open") await app.callServerTool({ name: "hesperus_open", arguments: { id: m.id } });
  } catch (e) { deliver({ type: "status", status: { state: "error", detail: String(e && e.message || e) } }); }
};
app.ontoolresult = (r) => show(r);
await app.connect();
for (const m of window.__hq.splice(0)) window.__hsend(m);`;

const safe = (s: string) => s.replace(/<\/script/gi, "<\\/script");

/** The page the host renders for `hesperus_map`. */
export function mapHtml(): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="color-scheme" content="light dark"><title>Hesperus map</title>
<style>${THEME}
${media("graph.css")}</style></head><body>${BODY}
<script>${SHIM}</script>
<script>${safe(media("graph.js"))}</script>
<script type="module">${BRIDGE}</script></body></html>`;
}
