// pointer-helper: Peguin's hands on the Mac, for voice control. Reads one JSON
// command per line on stdin and answers each with one JSON line on stdout
// ({"id": n, "ok": true, ...} or {"id": n, "ok": false, "error": "..."}).
// Coordinates are global points with the origin at the main display's top left
// (the same space as Electron's screen module).
//   status                       -> {"trusted": bool}  (Accessibility permission)
//   request                      -> asks macOS for Accessibility, then {"trusted": bool}
//   cursor                       -> {"x", "y"}
//   move  {x, y, ms}             -> glides the mouse there
//   click {x?, y?, button, count, ms}
//   scroll {dx, dy}              -> lines
//   type  {text}
//   key   {combo}                -> "cmd+shift+t", "return"
//   targets                      -> {"app", "elements": [{label, role, x, y, w, h}]} in the front app
//   browser                      -> brings the default browser forward, {"name"}
//   front                        -> {"app", "bundle", "title", "idle"}: the app in front, its window title, seconds since the last input
import AppKit
import ApplicationServices
import Foundation

func emit(_ value: [String: Any]) {
  let data = try! JSONSerialization.data(withJSONObject: value, options: [])
  FileHandle.standardOutput.write(data)
  FileHandle.standardOutput.write("\n".data(using: .utf8)!)
}

func cursor() -> CGPoint { CGEvent(source: nil)?.location ?? .zero }

func post(_ e: CGEvent?) { e?.post(tap: .cghidEventTap) }

/** Moves the real pointer in small steps (eased), so the owner sees it travel. */
func glide(to p: CGPoint, ms: Double) {
  let from = cursor()
  let steps = max(1, Int(ms / 8))
  for i in 1...steps {
    let t = Double(i) / Double(steps)
    let e = t < 0.5 ? 2 * t * t : 1 - pow(-2 * t + 2, 2) / 2
    let q = CGPoint(x: from.x + (p.x - from.x) * e, y: from.y + (p.y - from.y) * e)
    post(CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: q, mouseButton: .left))
    usleep(8000)
  }
}

func click(at p: CGPoint, right: Bool, count: Int) {
  let (down, up): (CGEventType, CGEventType) = right ? (.rightMouseDown, .rightMouseUp) : (.leftMouseDown, .leftMouseUp)
  let button: CGMouseButton = right ? .right : .left
  for n in 1...max(1, count) {
    let d = CGEvent(mouseEventSource: nil, mouseType: down, mouseCursorPosition: p, mouseButton: button)
    let u = CGEvent(mouseEventSource: nil, mouseType: up, mouseCursorPosition: p, mouseButton: button)
    d?.setIntegerValueField(.mouseEventClickState, value: Int64(n))
    u?.setIntegerValueField(.mouseEventClickState, value: Int64(n))
    post(d); usleep(30000); post(u); usleep(60000)
  }
}

let KEYCODES: [String: CGKeyCode] = [
  "a": 0, "s": 1, "d": 2, "f": 3, "h": 4, "g": 5, "z": 6, "x": 7, "c": 8, "v": 9, "b": 11, "q": 12, "w": 13, "e": 14, "r": 15,
  "y": 16, "t": 17, "1": 18, "2": 19, "3": 20, "4": 21, "6": 22, "5": 23, "=": 24, "9": 25, "7": 26, "-": 27, "8": 28, "0": 29,
  "]": 30, "o": 31, "u": 32, "[": 33, "i": 34, "p": 35, "l": 37, "j": 38, "'": 39, "k": 40, ";": 41, "\\": 42, ",": 43, "/": 44,
  "n": 45, "m": 46, ".": 47, "`": 50,
  "return": 36, "tab": 48, "space": 49, "delete": 51, "escape": 53, "left": 123, "right": 124, "down": 125, "up": 126,
  "pageup": 116, "pagedown": 121, "home": 115, "end": 119, "forwarddelete": 117,
]

func key(_ combo: String) throws {
  var flags: CGEventFlags = []
  var code: CGKeyCode? = nil
  for part in combo.lowercased().split(separator: "+").map(String.init) {
    switch part {
    case "cmd", "command": flags.insert(.maskCommand)
    case "shift": flags.insert(.maskShift)
    case "ctrl", "control": flags.insert(.maskControl)
    case "alt", "option": flags.insert(.maskAlternate)
    default: code = KEYCODES[part]
    }
  }
  // "cmd+=" splits into "cmd" and ""; the key is the last character then.
  if code == nil, combo.hasSuffix("+") || combo.hasSuffix("=") || combo.hasSuffix("-") { code = KEYCODES[String(combo.last!)] }
  guard let k = code else { throw NSError(domain: "pointer", code: 1, userInfo: [NSLocalizedDescriptionKey: "Unknown key in \(combo)"]) }
  let d = CGEvent(keyboardEventSource: nil, virtualKey: k, keyDown: true)
  let u = CGEvent(keyboardEventSource: nil, virtualKey: k, keyDown: false)
  d?.flags = flags; u?.flags = flags
  post(d); usleep(20000); post(u)
}

func type(_ text: String) {
  let units = Array(text.utf16)
  var i = 0
  while i < units.count {
    let chunk = Array(units[i..<min(i + 16, units.count)])
    let d = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: true)
    let u = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: false)
    d?.keyboardSetUnicodeString(stringLength: chunk.count, unicodeString: chunk)
    u?.keyboardSetUnicodeString(stringLength: chunk.count, unicodeString: chunk)
    post(d); post(u); usleep(12000)
    i += 16
  }
}

// MARK: Accessibility tree

func attr(_ el: AXUIElement, _ name: String) -> AnyObject? {
  var v: AnyObject?
  return AXUIElementCopyAttributeValue(el, name as CFString, &v) == .success ? v : nil
}

func frame(_ el: AXUIElement) -> CGRect? {
  guard let p = attr(el, kAXPositionAttribute), let s = attr(el, kAXSizeAttribute) else { return nil }
  var point = CGPoint.zero, size = CGSize.zero
  guard AXValueGetValue(p as! AXValue, .cgPoint, &point), AXValueGetValue(s as! AXValue, .cgSize, &size) else { return nil }
  return CGRect(origin: point, size: size)
}

func text(_ v: AnyObject?) -> String {
  guard let s = v as? String else { return "" }
  return s.trimmingCharacters(in: .whitespacesAndNewlines)
}

let CLICKABLE: Set<String> = ["AXButton", "AXLink", "AXMenuItem", "AXMenuBarItem", "AXTab", "AXRadioButton", "AXCheckBox", "AXPopUpButton",
  "AXTextField", "AXTextArea", "AXComboBox", "AXSearchField", "AXDisclosureTriangle", "AXCell", "AXRow", "AXMenuButton", "AXSwitch", "AXToggle", "AXImage"]

func label(_ el: AXUIElement, role: String) -> String {
  for name in [kAXTitleAttribute, kAXDescriptionAttribute] { let t = text(attr(el, name)); if !t.isEmpty { return t } }
  if let titled = attr(el, kAXTitleUIElementAttribute) { let t = text(attr(titled as! AXUIElement, kAXValueAttribute)); if !t.isEmpty { return t } }
  if ["AXTextField", "AXTextArea", "AXSearchField", "AXComboBox"].contains(role) {
    let p = text(attr(el, kAXPlaceholderValueAttribute)); if !p.isEmpty { return p }
  }
  if role == "AXLink" || role == "AXButton" || role == "AXCell" || role == "AXRow" {
    // Web links and table rows keep their words in a child text.
    if let kids = attr(el, kAXChildrenAttribute) as? [AXUIElement] {
      let words = kids.prefix(6).map { k -> String in
        let r = text(attr(k, kAXRoleAttribute))
        return r == "AXStaticText" ? text(attr(k, kAXValueAttribute)) : text(attr(k, kAXTitleAttribute))
      }.filter { !$0.isEmpty }
      if !words.isEmpty { return words.joined(separator: " ") }
    }
  }
  let help = text(attr(el, kAXHelpAttribute))
  return help.isEmpty ? (role == "AXStaticText" ? "" : text(attr(el, kAXValueAttribute))) : help
}

func onScreen(_ r: CGRect) -> Bool {
  NSScreen.screens.contains { s in
    // NSScreen frames are bottom-left based; flip to the top-left space of AX.
    let main = NSScreen.screens.first!.frame.height
    let f = CGRect(x: s.frame.minX, y: main - s.frame.maxY, width: s.frame.width, height: s.frame.height)
    return f.intersects(r)
  }
}

func targets() -> [String: Any] {
  guard let front = NSWorkspace.shared.frontmostApplication else { return ["app": "", "elements": []] }
  let app = AXUIElementCreateApplication(front.processIdentifier)
  // Chrome and Electron apps only build their web accessibility tree when asked.
  AXUIElementSetAttributeValue(app, "AXManualAccessibility" as CFString, kCFBooleanTrue)
  AXUIElementSetMessagingTimeout(app, 0.5)
  var roots: [AXUIElement] = []
  if let w = attr(app, kAXFocusedWindowAttribute) { roots.append(w as! AXUIElement) }
  if let bar = attr(app, kAXMenuBarAttribute) { roots.append(bar as! AXUIElement) }
  var out: [[String: Any]] = []
  var queue: [(AXUIElement, Int)] = roots.map { ($0, 0) }
  var seen = 0
  let started = Date()
  while !queue.isEmpty, seen < 6000, out.count < 400, Date().timeIntervalSince(started) < 1.5 {
    let (el, depth) = queue.removeFirst()
    seen += 1
    let role = text(attr(el, kAXRoleAttribute))
    // Menus that aren't open have no place on screen; skip below the bar's own items.
    if role == "AXMenu" { continue }
    if CLICKABLE.contains(role), let f = frame(el), f.width >= 4, f.height >= 4, onScreen(f) {
      let l = label(el, role: role)
      if !l.isEmpty || role != "AXImage" {
        out.append(["label": String(l.prefix(120)), "role": role, "x": f.minX, "y": f.minY, "w": f.width, "h": f.height])
      }
    }
    if depth < 60, role != "AXMenuBarItem", let kids = attr(el, kAXChildrenAttribute) as? [AXUIElement] {
      for k in kids { queue.append((k, depth + 1)) }
    }
  }
  return ["app": front.localizedName ?? "", "elements": out]
}

func browser() -> [String: Any] {
  guard let url = NSWorkspace.shared.urlForApplication(toOpen: URL(string: "https://example.com")!) else { return ["name": ""] }
  let done = DispatchSemaphore(value: 0)
  let config = NSWorkspace.OpenConfiguration()
  config.activates = true
  NSWorkspace.shared.openApplication(at: url, configuration: config) { _, _ in done.signal() }
  _ = done.wait(timeout: .now() + 5)
  return ["name": FileManager.default.displayName(atPath: url.path).replacingOccurrences(of: ".app", with: "")]
}

/** For the work log: names only, never window contents. The title needs Accessibility; without it it's "". */
func front() -> [String: Any] {
  let idle = CGEventSource.secondsSinceLastEventType(.combinedSessionState, eventType: CGEventType(rawValue: ~0)!)
  guard let app = NSWorkspace.shared.frontmostApplication else { return ["app": "", "bundle": "", "title": "", "idle": idle] }
  var title = ""
  if AXIsProcessTrusted() {
    let el = AXUIElementCreateApplication(app.processIdentifier)
    AXUIElementSetMessagingTimeout(el, 0.5)
    if let w = attr(el, kAXFocusedWindowAttribute) { title = text(attr(w as! AXUIElement, kAXTitleAttribute)) }
  }
  return ["app": app.localizedName ?? "", "bundle": app.bundleIdentifier ?? "", "title": String(title.prefix(200)), "idle": idle]
}

func num(_ v: Any?) -> Double? { (v as? NSNumber)?.doubleValue }

func handle(_ m: [String: Any]) throws -> [String: Any] {
  switch m["cmd"] as? String ?? "" {
  case "status": return ["trusted": AXIsProcessTrusted()]
  case "request":
    let opts = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
    return ["trusted": AXIsProcessTrustedWithOptions(opts)]
  case "cursor": let p = cursor(); return ["x": p.x, "y": p.y]
  case "move":
    glide(to: CGPoint(x: num(m["x"]) ?? 0, y: num(m["y"]) ?? 0), ms: num(m["ms"]) ?? 250)
    return [:]
  case "click":
    var p = cursor()
    if let x = num(m["x"]), let y = num(m["y"]) { p = CGPoint(x: x, y: y); glide(to: p, ms: num(m["ms"]) ?? 250) }
    click(at: p, right: (m["button"] as? String) == "right", count: Int(num(m["count"]) ?? 1))
    return [:]
  case "scroll":
    let e = CGEvent(scrollWheelEvent2Source: nil, units: .line, wheelCount: 2, wheel1: Int32(num(m["dy"]) ?? 0), wheel2: Int32(num(m["dx"]) ?? 0), wheel3: 0)
    post(e)
    return [:]
  case "type": type(m["text"] as? String ?? ""); return [:]
  case "key": try key(m["combo"] as? String ?? ""); return [:]
  case "targets": return targets()
  case "browser": return browser()
  case "front": return front()
  default: throw NSError(domain: "pointer", code: 2, userInfo: [NSLocalizedDescriptionKey: "Unknown command"])
  }
}

while let line = readLine() {
  guard let data = line.data(using: .utf8), let m = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { continue }
  let id = m["id"] ?? NSNull()
  do {
    var r = try handle(m)
    r["id"] = id; r["ok"] = true
    emit(r)
  } catch {
    emit(["id": id, "ok": false, "error": error.localizedDescription])
  }
}
