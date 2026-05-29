import * as vscode from "vscode";
import { randomBytes } from "node:crypto";
import { ServerManager } from "./server-manager";

/**
 * Webview HTML that embeds the running Python dashboard via an iframe.
 *
 * Two states:
 *   - When `url` is set we render the iframe at that URL.
 *   - When `url` is null we render a status / error pane (with the latest
 *     status text the host pushed via setStatus).
 *
 * We rely on VS Code's webview Content-Security-Policy. Allowing the
 * dashboard's localhost origin via `frame-src http://127.0.0.1:* http://localhost:*`
 * is enough; the dashboard ships its own CSP for what it loads inside.
 */
export function renderHtml(url: string | null, statusText: string, nonce: string): string {
  if (url) {
    return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; frame-src http://127.0.0.1:* http://localhost:*; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<title>Claude 使用量</title>
<style>
  html, body { margin: 0; padding: 0; height: 100%; background: #0f1117; }
  iframe { border: 0; width: 100%; height: 100vh; display: block; }
</style>
</head>
<body>
<iframe src="${escapeHtml(url)}" sandbox="allow-scripts allow-same-origin allow-forms"></iframe>
</body>
</html>`;
  }

  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<title>Claude 使用量</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #e2e8f0; background: #0f1117; padding: 24px; line-height: 1.5; }
  h2 { color: #d97757; font-weight: 600; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 16px; }
  pre { background: #1a1d27; border: 1px solid #2a2d3a; border-radius: 6px; padding: 12px; font-size: 12px; color: #8892a4; white-space: pre-wrap; word-break: break-word; max-width: 100%; }
  p { color: #8892a4; font-size: 13px; }
</style>
</head>
<body>
<h2>Claude Code 使用量</h2>
<p>${escapeHtml(statusText) || "儀表板伺服器尚未啟動。"}</p>
<p>請從命令面板執行 <code>Claude Usage: Open Dashboard</code> 來啟動。</p>
</body>
</html>`;
}

/**
 * Escape HTML for safe interpolation into the templates above.
 * Exported for testability.
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Generate a one-shot nonce for the CSP script-src directive.
 * 24 bytes of crypto-random output, base64url-encoded (URL-safe, no
 * padding, always 32 chars).
 */
export function makeNonce(): string {
  return randomBytes(24).toString("base64url");
}

export class DashboardSidebar implements vscode.WebviewViewProvider {
  public static readonly viewId = "claudeUsage.dashboard";

  private view: vscode.WebviewView | undefined;
  private currentUrl: string | null = null;
  private statusText = "";
  private readonly onShow: () => void;

  constructor(onShow: () => void = () => {}) {
    this.onShow = onShow;
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true };
    this.render();
    view.onDidDispose(() => {
      this.view = undefined;
    });
    // Kick the host to start the server now that the user has revealed the
    // panel. extension.ts wires this to openDashboard(); the in-flight
    // coalescing on that side means clicking the icon repeatedly is safe.
    this.onShow();
  }

  /** Called from extension.ts after the server is ready. */
  setUrl(url: string | null): void {
    this.currentUrl = url;
    this.render();
  }

  setStatus(text: string): void {
    this.statusText = text;
    this.render();
  }

  /** Force the iframe to reload (e.g. after a rescan). */
  refresh(): void {
    if (!this.view) return;
    // Re-render same URL — the iframe will reload because the HTML is regenerated.
    this.render();
  }

  private render(): void {
    if (!this.view) return;
    this.view.webview.html = renderHtml(this.currentUrl, this.statusText, makeNonce());
  }
}

// Note: in extension.ts we connect ServerManager to DashboardSidebar via:
//   server.start().then(() => sidebar.setUrl(`http://${host}:${port}/`))
// Importing ServerManager here only so the type stays in the module graph; not
// used at runtime. Stripped on build.
export type { ServerManager };
