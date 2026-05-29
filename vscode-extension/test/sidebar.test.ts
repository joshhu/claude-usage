import { describe, it, expect, vi } from "vitest";
import { renderHtml, escapeHtml, makeNonce, DashboardSidebar } from "../src/sidebar";

// Minimal vscode mock so we can instantiate DashboardSidebar in node-only tests.
vi.mock("vscode", () => ({}), { virtual: true });

function makeFakeView() {
  let html = "";
  const disposeListeners: Array<() => void> = [];
  return {
    webview: {
      get html() { return html; },
      set html(v: string) { html = v; },
      options: undefined as unknown,
    },
    onDidDispose(listener: () => void) {
      disposeListeners.push(listener);
      return { dispose: () => {} };
    },
    _triggerDispose() { disposeListeners.forEach((l) => l()); },
    _html: () => html,
  };
}

describe("escapeHtml", () => {
  it("escapes the five HTML-significant characters", () => {
    expect(escapeHtml(`<script>alert("x&y'z")</script>`))
      .toBe("&lt;script&gt;alert(&quot;x&amp;y&#39;z&quot;)&lt;/script&gt;");
  });

  it("passes through safe text unchanged", () => {
    expect(escapeHtml("Claude Usage Dashboard")).toBe("Claude Usage Dashboard");
  });

  it("handles empty input", () => {
    expect(escapeHtml("")).toBe("");
  });
});

describe("makeNonce", () => {
  it("is base64url (alphanumeric plus - and _, no padding)", () => {
    expect(makeNonce()).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("is exactly 32 chars (24 random bytes → 32 base64url chars)", () => {
    expect(makeNonce()).toHaveLength(32);
  });

  it("yields different values on consecutive calls", () => {
    expect(makeNonce()).not.toBe(makeNonce());
  });
});

describe("renderHtml with iframe URL", () => {
  const NONCE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ012345";

  it("embeds the iframe pointing at the given URL", () => {
    const html = renderHtml("http://127.0.0.1:54321/", "", NONCE);
    expect(html).toContain('src="http://127.0.0.1:54321/"');
    expect(html).toContain("<iframe");
  });

  it("escapes URL into the iframe src so attribute syntax can't break", () => {
    const html = renderHtml(`http://127.0.0.1:9000/?q="><script>x</script>`, "", NONCE);
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&quot;");
    expect(html).toContain("&lt;script&gt;");
  });

  it("includes a CSP frame-src that allows localhost", () => {
    const html = renderHtml("http://127.0.0.1:9000/", "", NONCE);
    expect(html).toContain("frame-src http://127.0.0.1:* http://localhost:*");
  });

  it("includes the script-src nonce", () => {
    const html = renderHtml("http://127.0.0.1:9000/", "", NONCE);
    expect(html).toContain(`script-src 'nonce-${NONCE}'`);
  });

  it("sandbox attribute restricts iframe to the minimum needed", () => {
    const html = renderHtml("http://127.0.0.1:9000/", "", NONCE);
    expect(html).toContain("sandbox=\"allow-scripts allow-same-origin allow-forms\"");
    // Specifically NOT allow-popups (the dashboard doesn't open new windows).
    expect(html).not.toContain("allow-popups");
  });

  it("frame-src does NOT include third-party CDN (iframe has its own CSP)", () => {
    const html = renderHtml("http://127.0.0.1:9000/", "", NONCE);
    expect(html).not.toContain("cdn.jsdelivr.net");
  });
});

describe("renderHtml with null URL (status pane)", () => {
  const NONCE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ012345";

  it("renders the placeholder when no URL is set", () => {
    const html = renderHtml(null, "", NONCE);
    expect(html).toContain("Claude Code 使用量");
    expect(html).toContain("尚未啟動");
    expect(html).not.toContain("<iframe");
  });

  it("renders a custom status message when provided", () => {
    const html = renderHtml(null, "Server failed to bind to port 8080", NONCE);
    expect(html).toContain("Server failed to bind to port 8080");
  });

  it("escapes status text", () => {
    const html = renderHtml(null, "<img onerror=x>", NONCE);
    expect(html).not.toContain("<img onerror=x>");
    expect(html).toContain("&lt;img onerror=x&gt;");
  });

  it("does NOT include the frame-src CSP (no iframe to allow)", () => {
    const html = renderHtml(null, "", NONCE);
    expect(html).not.toContain("frame-src");
  });
});

describe("DashboardSidebar onShow auto-start", () => {
  it("invokes the onShow callback when resolveWebviewView is called", () => {
    const onShow = vi.fn();
    const sidebar = new DashboardSidebar(onShow);
    const fakeView = makeFakeView() as any;
    sidebar.resolveWebviewView(fakeView);
    expect(onShow).toHaveBeenCalledTimes(1);
  });

  it("doesn't throw without a callback (default no-op)", () => {
    const sidebar = new DashboardSidebar();
    const fakeView = makeFakeView() as any;
    expect(() => sidebar.resolveWebviewView(fakeView)).not.toThrow();
  });

  it("renders HTML into the webview on resolve", () => {
    const sidebar = new DashboardSidebar();
    const fakeView = makeFakeView() as any;
    sidebar.resolveWebviewView(fakeView);
    expect(fakeView._html()).toContain("<html");
  });

  it("re-fires onShow on every resolveWebviewView (e.g. user collapses+reopens)", () => {
    const onShow = vi.fn();
    const sidebar = new DashboardSidebar(onShow);
    const fakeView1 = makeFakeView() as any;
    sidebar.resolveWebviewView(fakeView1);
    fakeView1._triggerDispose();
    const fakeView2 = makeFakeView() as any;
    sidebar.resolveWebviewView(fakeView2);
    expect(onShow).toHaveBeenCalledTimes(2);
  });
});
