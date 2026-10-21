// Service worker: the toolbar button opens the copilot in Chrome's side panel,
// which Chrome leaves out when the owner shares a tab. Everything else runs in
// the panel (the copilot) and the offscreen page (the tab's audio).
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

// The panel asks for the audio page; only one can exist.
chrome.runtime.onMessage.addListener((m: { type?: string }, _sender, reply) => {
  if (m.type !== "offscreen:ensure") return;
  void (async () => {
    const has = await chrome.offscreen.hasDocument();
    if (!has) await chrome.offscreen.createDocument({ url: "offscreen.html", reasons: [chrome.offscreen.Reason.USER_MEDIA], justification: "Hear the meeting tab's audio to transcribe what others say." });
    reply({ ok: true });
  })().catch((e) => reply({ ok: false, error: String(e instanceof Error ? e.message : e) }));
  return true;
});
