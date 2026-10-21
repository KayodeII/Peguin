// Sources > On this Mac: the work log. Every few minutes, the app in front and
// its window title, kept encrypted on this Mac so the draft knows where the
// owner's time went. Off until the owner turns it on; viewable and deletable.
import { useEffect, useState } from "react";
import type { Settings } from "../main/settings";
import type { WorkLogStatus } from "../main/watch/index";
import { BrandIcon, message, Toggle } from "./ui";

const label = (st: WorkLogStatus["today"][number]) => `${st.app}${st.title ? `: ${st.title}` : ""}`;
const mins = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`);

export function WorkLogSource({ settings, save, report }: { settings: Settings; save: (s: Settings) => Promise<Settings>; report?: { ok: boolean; summary: string } }) {
  const w = settings.watch;
  const [status, setStatus] = useState<WorkLogStatus | null>(null);
  const [skip, setSkip] = useState(w.skipApps.join(", "));
  const [error, setError] = useState("");
  const refresh = () => void window.penguin.workLogStatus().then(setStatus).catch(() => {});
  useEffect(refresh, [w.enabled]);
  // Accessibility (for titles) is switched on in System Settings; check again while it's off.
  useEffect(() => {
    if (!w.enabled || status?.titles !== false) return;
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [w.enabled, status?.titles]);

  const set = (patch: Partial<Settings["watch"]>) => { setError(""); save({ ...settings, watch: { ...w, ...patch } }).then(refresh, (e) => setError(message(e))); };
  const saveSkip = () => {
    const list = [...new Set(skip.split(",").map((x) => x.trim()).filter(Boolean))].slice(0, 50);
    if (list.join(",") !== w.skipApps.join(",")) set({ skipApps: list });
  };

  return (
    <div className="row-card column">
      <div className="row-head">
        <BrandIcon id="mac" />
        <div className="row-main">
          <strong>On this Mac</strong>
          <p>Every few minutes, the app in front and its window title. No screenshots and nothing from inside windows. Encrypted on this Mac for {w.keepDays} days; your update gets a short list of where your time went.</p>
          {w.enabled && report && <p className={report.ok ? "ok" : "warn"}>{report.ok ? "✓ " : "! "}{report.summary}</p>}
        </div>
        <Toggle on={w.enabled} onChange={(v) => set({ enabled: v })} label="On this Mac" />
      </div>
      {w.enabled && status && !status.titles && (
        <div className="row-head">
          <div className="row-main"><strong><span className="perm-dot" />Window titles: not allowed yet</strong><p>Without Accessibility, Peguin only notes the app's name.</p></div>
          <button className="btn ghost" onClick={() => void window.penguin.pointerAccess().then(refresh)}>Allow</button>
        </div>
      )}
      {status?.error && w.enabled && <div className="notice error">{status.error}</div>}
      {w.enabled && (
        <>
          <div className="field-grid">
            <label>Look every
              <select value={w.everyMinutes} onChange={(e) => set({ everyMinutes: Number(e.target.value) })}>
                {[2, 5, 10, 15].map((n) => <option key={n} value={n}>{n} minutes</option>)}
              </select>
            </label>
            <label>Keep for
              <select value={w.keepDays} onChange={(e) => set({ keepDays: Number(e.target.value) })}>
                {[1, 3, 7, 14, 30].map((n) => <option key={n} value={n}>{n} {n === 1 ? "day" : "days"}</option>)}
              </select>
            </label>
          </div>
          <label>Never note<input value={skip} placeholder="1Password, Messages" onChange={(e) => setSkip(e.target.value)} onBlur={saveSkip} /></label>
          <p className="hint">App names, bundle ids or words in a title, separated by commas. Private browser windows are always left out.</p>
          <details className="say-list">
            <summary>Noted today{status?.today.length ? ` (${status.today.length})` : ""}</summary>
            {status?.today.length
              ? <dl>{status.today.map((st) => <div key={label(st)}><dt>{label(st)}</dt><dd>{mins(st.minutes)}</dd></div>)}</dl>
              : <p className="hint">Nothing yet. The first note comes within {w.everyMinutes} minutes.</p>}
          </details>
        </>
      )}
      {!!status?.glances && (
        <div className="voice-actions">
          <button className="btn link" onClick={() => void window.penguin.workLogClear().then(setStatus)}>Delete the log</button>
          <span className="hint">{status.glances} notes kept.</span>
        </div>
      )}
      {error && <div className="notice error">{error}</div>}
    </div>
  );
}
