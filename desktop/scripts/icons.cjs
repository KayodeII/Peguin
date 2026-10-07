// Renders the Peguin icons from SVG with Electron (offscreen, transparent):
// build/icon.png (1024, app icon). The menu bar icon is drawn by scripts/tray.mjs.
// Run: npx electron scripts/icons.cjs   then   bash scripts/icns.sh
const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

const bird = (body, belly, beak, eye) => `
  <ellipse cx="16" cy="17" rx="10" ry="12" fill="${body}"/>
  <ellipse cx="16" cy="20" rx="6.5" ry="8" fill="${belly}"/>
  <circle cx="12.5" cy="12" r="1.6" fill="${eye}"/><circle cx="19.5" cy="12" r="1.6" fill="${eye}"/>
  <circle cx="12.9" cy="12.2" r="0.75" fill="${body}"/><circle cx="19.1" cy="12.2" r="0.75" fill="${body}"/>
  <path d="M13.5 15.5h5l-2.5 2.6z" fill="${beak}"/>`;

// macOS icon grid: 824px rounded square centred in 1024.
const appIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b97ec"/><stop offset="1" stop-color="#1d6fc2"/></linearGradient></defs>
  <rect x="100" y="100" width="824" height="824" rx="185" fill="url(#g)"/>
  <g transform="translate(192 172) scale(20)">${bird("#0b1118", "#f4f1ea", "#f2a93b", "#fff")}</g>
</svg>`;

async function render(svg, size, out) {
  const win = new BrowserWindow({ width: size, height: size, show: false, transparent: true, frame: false, webPreferences: { offscreen: true } });
  const tmp = path.join(require("os").tmpdir(), `peguin-icon-${size}.html`);
  fs.writeFileSync(tmp, `<html><body style="margin:0;background:transparent">${svg}</body></html>`);
  await win.loadFile(tmp);
  await new Promise((r) => setTimeout(r, 300));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: size, height: size });
  fs.writeFileSync(out, img.resize({ width: size, height: size }).toPNG());
  win.destroy();
}

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const root = path.resolve(__dirname, "..");
  await render(appIcon, 1024, path.join(root, "build/icon.png"));
  app.exit(0);
});
