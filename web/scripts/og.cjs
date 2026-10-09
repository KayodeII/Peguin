// Renders og/banner.html to public/og.jpg (1200x630), the link preview. JPEG keeps it
// small: WhatsApp drops previews over about 300 KB.
// Uses the desktop app's Electron: `npm run og` from web/.
const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1200, height: 630, show: false, useContentSize: true, webPreferences: { offscreen: true } });
  await win.loadFile(path.join(root, "og/banner.html"));
  await new Promise((r) => setTimeout(r, 600));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 1200, height: 630 });
  const jpg = img.resize({ width: 1200, height: 630, quality: "best" }).toJPEG(86);
  fs.writeFileSync(path.join(root, "public/og.jpg"), jpg);
  console.log(`wrote public/og.jpg (${Math.round(jpg.length / 1024)} KB)`);

  win.setContentSize(180, 180);
  await win.loadFile(path.join(root, "og/icon.html"));
  await new Promise((r) => setTimeout(r, 300));
  const icon = await win.webContents.capturePage({ x: 0, y: 0, width: 180, height: 180 });
  fs.writeFileSync(path.join(root, "public/apple-touch-icon.png"), icon.resize({ width: 180, height: 180, quality: "best" }).toPNG());
  console.log("wrote public/apple-touch-icon.png");
  app.quit();
});
