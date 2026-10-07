// Draws the menu bar template icon (black penguin silhouette on transparent,
// belly and eyes cut out) straight to PNG: resources/trayTemplate{,@2x}.png.
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const inEllipse = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
const inBeak = (x, y) => y >= 15.5 && y <= 18.1 && Math.abs(x - 16) <= 2.5 * (18.1 - y) / 2.6;
function ink(x, y) { // in the 32-unit logo space
  if (inBeak(x, y)) return true;
  if (!inEllipse(x, y, 16, 17, 10, 12)) return false;
  if (inEllipse(x, y, 16, 20, 6.5, 8)) return false;
  return !(inEllipse(x, y, 12.5, 12, 1.6, 1.6) || inEllipse(x, y, 19.5, 12, 1.6, 1.6));
}

function png(size) {
  const ss = 8, view = { x: 2, y: 3, w: 28, h: 28 }; // crop to the bird
  const rows = [];
  for (let py = 0; py < size; py++) {
    const row = [0]; // filter byte
    for (let px = 0; px < size; px++) {
      let hit = 0;
      for (let i = 0; i < ss; i++) for (let j = 0; j < ss; j++) {
        if (ink(view.x + ((px + (i + 0.5) / ss) / size) * view.w, view.y + ((py + (j + 0.5) / ss) / size) * view.h)) hit++;
      }
      row.push(0, 0, 0, Math.round((255 * hit) / (ss * ss)));
    }
    rows.push(...row);
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.from(rows))), chunk("IEND", Buffer.alloc(0))]);
}

const out = new URL("../resources/", import.meta.url);
writeFileSync(new URL("trayTemplate.png", out), png(18));
writeFileSync(new URL("trayTemplate@2x.png", out), png(36));
