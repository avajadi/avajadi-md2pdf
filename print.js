#!/usr/bin/env node
// HTML -> PDF via Chromium DevTools Protocol.
//
// CDP is required instead of `chromium --print-to-pdf` for one reason: the footer.
// Chromium doesn't support @page margin boxes, so counter(page) doesn't exist in CSS.
// Page.printToPDF's footerTemplate is the only way to get real page numbers.
//
// The footer renders in its own document whose resources the print job doesn't wait
// for. That's why the fonts come via fonts.conf (fontconfig) instead of @font-face,
// while the logo has to be a data URI since file:// isn't readable there.
//
// Run with:  node --experimental-websocket print.js <file.html> <file.pdf>

const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const HERE = __dirname;
const MM = 1 / 25.4; // millimeters -> inches, the unit CDP wants margins in

const MARGINS = { top: 22, bottom: 20, left: 20, right: 20 };
const FOOTER_TEXT = "Avajadi Systems";
// Set by build.sh from the document's `version:` and `revision:` front matter; an empty
// value leaves that box out. Named _DOC_VERSION to match rise-md2pdf, where
// RISE_MD2PDF_VERSION is taken by the wrapper.
const DOC_VERSION = (process.env.AVAJADI_MD2PDF_DOC_VERSION || "").trim();
const REVISION = (process.env.AVAJADI_MD2PDF_REVISION || "").trim();

// Not every machine has the "chromium" binary - many only have google-chrome, or
// the -stable/-browser variant. Try the common names in turn instead of
// hardcoding a single one.
const CHROME_CANDIDATES = ["chromium", "chromium-browser", "google-chrome", "google-chrome-stable"];

function resolveChromeBinary() {
  for (const bin of CHROME_CANDIDATES) {
    if (!spawnSync(bin, ["--version"], { stdio: "ignore" }).error) return bin;
  }
  throw new Error(
    `Could not find a Chromium/Chrome binary (tried: ${CHROME_CANDIDATES.join(", ")}). ` +
    "Install chromium or google-chrome and make sure it's on PATH."
  );
}

// The panda head only, not the full logo: the logo's own lettering would be about
// 1 mm tall at footer size, so the name is set as text instead. See make-logo.py.
function logoDataUri() {
  const buf = fs.readFileSync(path.join(HERE, "assets", "avajadi-mark.png"));
  return `data:image/png;base64,${buf.toString("base64")}`;
}


// Makes fonts/ visible as a system font just for the Chromium process we start,
// without installing anything in the user's home directory. The config is written
// at run time because <dir> must be an absolute path - prefix="default" gives a
// relative path that fc-match follows but Chromium doesn't.
function writeFontsConf(dir) {
  const target = path.join(dir, "fonts.conf");
  fs.writeFileSync(target, `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">
<fontconfig>
  <include ignore_missing="yes">/etc/fonts/fonts.conf</include>
  <dir>${path.join(HERE, "fonts")}</dir>
</fontconfig>
`);
  return target;
}

// Footer anatomy: page number in JetBrains Mono, the name in letterspaced Space
// Grotesk capitals echoing the logo's lettering, then the document version and revision
// (in that order, JetBrains Mono like the page number) when the front matter gives them,
// and the panda at the far right.
// Colors are literal here, not tokens: the footer is its own document and can't
// see avajadi-tokens.css. Charcoal #2D2D2D, bamboo #3E7B27.
function footerTemplate() {
  const esc = (t) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const version = DOC_VERSION ? `<span class="rev">Version ${esc(DOC_VERSION)}</span>` : "";
  const revision = REVISION ? `<span class="rev">Revision ${esc(REVISION)}</span>` : "";
  return `
    <style>
      #ava-footer {
        box-sizing: border-box;
        width: 100%;
        padding: 0 ${MARGINS.right}mm 0 ${MARGINS.left}mm;
        font-size: 7pt;
        color: #2D2D2D;
        display: flex;
        align-items: center;
        gap: 6mm;
      }
      #ava-footer .num {
        flex: 0 0 auto;
        font-family: "JetBrains Mono", monospace;
        font-weight: 700;
        color: #3E7B27;
      }
      #ava-footer .org {
        flex: 0 0 auto;
        white-space: nowrap;
        font-family: "Space Grotesk", sans-serif;
        font-weight: 700;
        letter-spacing: 0.25em;
        text-transform: uppercase;
      }
      #ava-footer .rev {
        flex: 0 0 auto;
        white-space: nowrap;
        font-family: "JetBrains Mono", monospace;
      }
      #ava-footer .spacer { flex: 1 1 auto; }
      #ava-footer img { height: 8mm; display: block; }
    </style>
    <div id="ava-footer">
      <span class="num"><span class="pageNumber"></span>/<span class="totalPages"></span></span>
      <span class="org">${FOOTER_TEXT}</span>
      ${version}
      ${revision}
      <span class="spacer"></span>
      <img src="${logoDataUri()}" alt="Avajadi Systems">
    </div>`;
}

function post(port, endpoint) {
  return fetch(`http://127.0.0.1:${port}${endpoint}`).then((r) => r.json());
}

async function waitForPort(port, tries = 120) {
  for (let i = 0; i < tries; i++) {
    try {
      return await post(port, "/json/version");
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error("Chromium didn't respond on the debugging port");
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
}

async function main() {
  const [htmlPath, pdfPath] = process.argv.slice(2);
  if (!htmlPath || !pdfPath) {
    console.error("usage: print.js <file.html> <file.pdf>");
    process.exit(2);
  }

  const port = 9500 + Math.floor(process.pid % 400);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "avajadi-pdf-"));
  const fontsConf = writeFontsConf(profile);
  const chrome = spawn(resolveChromeBinary(), [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "--no-sandbox",
    "--disable-gpu",
    "--no-first-run",
    "--hide-scrollbars",
    "--allow-file-access-from-files",
  ], {
    stdio: "ignore",
    env: { ...process.env, FONTCONFIG_FILE: fontsConf },
  });

  let ws;
  try {
    const version = await waitForPort(port);
    ws = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.addEventListener("open", res, { once: true });
      ws.addEventListener("error", rej, { once: true });
    });

    const cdp = new Cdp(ws);
    const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });

    // Flat session: methods are addressed with sessionId in the envelope.
    const sessionSend = (method, params = {}) => {
      const id = ++cdp.id;
      cdp.ws.send(JSON.stringify({ id, method, params, sessionId }));
      return new Promise((resolve, reject) => cdp.pending.set(id, { resolve, reject }));
    };

    await sessionSend("Page.enable");
    const loaded = new Promise((resolve) => {
      const onMsg = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.method === "Page.loadEventFired" && msg.sessionId === sessionId) {
          ws.removeEventListener("message", onMsg);
          resolve();
        }
      };
      ws.addEventListener("message", onMsg);
    });

    await sessionSend("Page.navigate", { url: `file://${path.resolve(htmlPath)}` });
    await loaded;

    // The embedded fonts are large; wait for them before page breaks are computed.
    await sessionSend("Runtime.evaluate", {
      expression: "document.fonts.ready.then(() => true)",
      awaitPromise: true,
    });

    const { data } = await sessionSend("Page.printToPDF", {
      printBackground: true,
      paperWidth: 210 * MM,
      paperHeight: 297 * MM,
      marginTop: MARGINS.top * MM,
      marginBottom: MARGINS.bottom * MM,
      marginLeft: MARGINS.left * MM,
      marginRight: MARGINS.right * MM,
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: footerTemplate(),
      preferCSSPageSize: false,
    });

    fs.writeFileSync(pdfPath, Buffer.from(data, "base64"));
    await cdp.send("Target.closeTarget", { targetId });
  } finally {
    if (ws) ws.close();
    // Wait for Chromium to actually exit before removing the profile, otherwise
    // it's still writing to the directory and rmSync fails with ENOTEMPTY.
    const exited = new Promise((resolve) => chrome.once("exit", resolve));
    chrome.kill();
    await Promise.race([exited, new Promise((r) => setTimeout(r, 5000))]);
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
