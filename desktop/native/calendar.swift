// calendar-helper: reads the Mac's calendars (every account added in System
// Settings > Internet Accounts) through EventKit, for the Peguin app.
//   calendar-helper status            -> {"status": "..."}
//   calendar-helper request           -> asks for access, then {"status": "..."}
//   calendar-helper events FROM TO    -> [{...}] for events overlapping [FROM, TO] (ms since epoch)
import EventKit
import Foundation

let store = EKEventStore()

func status() -> String {
  switch EKEventStore.authorizationStatus(for: .event) {
  case .notDetermined: return "notDetermined"
  case .restricted: return "restricted"
  case .denied: return "denied"
  case .writeOnly: return "writeOnly"
  case .fullAccess: return "authorized"
  @unknown default: return "authorized" // .authorized on macOS 13 and earlier
  }
}

func emit(_ value: Any) {
  let data = try! JSONSerialization.data(withJSONObject: value, options: [])
  FileHandle.standardOutput.write(data)
  FileHandle.standardOutput.write("\n".data(using: .utf8)!)
}

func request() {
  let done = DispatchSemaphore(value: 0)
  if #available(macOS 14.0, *) {
    store.requestFullAccessToEvents { _, _ in done.signal() }
  } else {
    store.requestAccess(to: .event) { _, _ in done.signal() }
  }
  _ = done.wait(timeout: .now() + 120)
}

let args = CommandLine.arguments
switch args.count > 1 ? args[1] : "" {
case "status":
  emit(["status": status()])
case "request":
  if status() == "notDetermined" { request() }
  emit(["status": status()])
case "events":
  guard args.count == 4, let from = Double(args[2]), let to = Double(args[3]) else { emit(["error": "usage: events FROM TO"]); exit(2) }
  guard status() == "authorized" else { emit(["error": "no-access", "status": status()]); exit(3) }
  let start = Date(timeIntervalSince1970: from / 1000), end = Date(timeIntervalSince1970: to / 1000)
  let events = store.events(matching: store.predicateForEvents(withStart: start, end: end, calendars: nil))
  emit(events.filter { !$0.isAllDay && $0.status != .canceled }.map { e -> [String: Any] in [
    "id": "\(e.calendarItemExternalIdentifier ?? e.eventIdentifier ?? UUID().uuidString)@\(Int(e.startDate.timeIntervalSince1970 * 1000))",
    "title": e.title ?? "",
    "start": Int(e.startDate.timeIntervalSince1970 * 1000),
    "end": Int(e.endDate.timeIntervalSince1970 * 1000),
    "url": e.url?.absoluteString ?? "",
    "location": e.location ?? "",
    "notes": e.notes ?? "",
    "calendar": e.calendar?.title ?? "",
  ] })
default:
  emit(["error": "usage: status | request | events FROM TO"]); exit(2)
}
