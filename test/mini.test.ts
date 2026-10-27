import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ BrowserWindow: class {}, screen: {} }));
vi.mock("../desktop/node_modules/electron/index.js", () => ({ BrowserWindow: class {}, screen: {} }));
const { miniBounds } = await import("../desktop/src/main/mini.js");

const laptop = { bounds: { x: 0, y: 0, width: 1512, height: 982 }, workArea: { x: 0, y: 38, width: 1512, height: 944 } };
const notch = { bar: 38, notchW: 185 };

describe("Mini Peguin placement", () => {
  it("hugs the notch, centred, and opens wider and downwards", () => {
    expect(miniBounds("island", false, laptop, notch)).toEqual({ x: Math.round(1512 / 2 - (185 + 92) / 2), y: 0, width: 185 + 92, height: 38 });
    const open = miniBounds("island", true, laptop, notch);
    expect(open.x + open.width / 2).toBe(756);
    expect(open.width).toBeGreaterThan(185 + 92);
    expect(open.height).toBeGreaterThan(38);
    expect(miniBounds("island", true, laptop, notch, undefined, 170).height).toBe(170);
    expect(open.y).toBe(0);
  });
  it("puts the window top right at first, then where the owner left it", () => {
    const first = miniBounds("window", false, laptop, notch);
    expect(first.x + first.width).toBe(1512 - 16);
    expect(first.y).toBe(38 + 12);
    expect(miniBounds("window", false, laptop, notch, { x: 200, y: 400 })).toMatchObject({ x: 200, y: 400 });
  });
  it("brings the window back on screen when its old place is gone (a display was unplugged)", () => {
    expect(miniBounds("window", false, laptop, notch, { x: 4000, y: 400 })).toMatchObject({ x: 1512 - 340 - 16 });
  });
});
