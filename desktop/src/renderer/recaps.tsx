// #recaps: what happened in each meeting Peguin attended. Follow-ups first
// (every question it deferred, plus anything Claude found), then the summary,
// what Peguin said, and the transcript. Kept encrypted on this Mac.
import { useEffect, useState } from "react";
import type { MeetingRecord } from "../main/meeting/record";
import { headline } from "../main/meeting/record";
import { BrandIcon, dayTime, Icon, message, time } from "./ui";

const KIND: Record<string, string> = { update: "Gave the update", answer: "Answered", defer: "Deferred to you", ack: "Acknowledged" };

const duration = (r: MeetingRecord) => {
  const mins = r.endedAt && r.joinedAt ? Math.max(1, Math.round((r.endedAt - r.joinedAt) / 60000)) : 0;
  return mins ? `${mins} min` : "";
};

export function RecapsView({ meetings, reload, keepDays }: { meetings: MeetingRecord[]; reload: () => void; keepDays: number }) {
  const [openId, setOpenId] = useState<string | null>(meetings[0]?.id ?? null);
  const [error, setError] = useState("");
  useEffect(() => { if (!meetings.some((m) => m.id === openId)) setOpenId(meetings[0]?.id ?? null); }, [meetings, openId]);
  const open = meetings.find((m) => m.id === openId) ?? null;

  const act = (fn: () => Promise<unknown>) => { setError(""); fn().then(reload).catch((e) => setError(message(e))); };

  return (
    <>
      <header className="channel-head">
        <Icon name="hash" size={22} /><h1>recaps</h1>
        <span className="divider" /><p>Kept for {keepDays} days, encrypted on this Mac</p>
      </header>
      <div className="recaps">
        <nav className="recap-list" aria-label="Meetings">
          {meetings.length === 0 && <p className="empty-note">After Peguin attends a meeting, its recap shows up here.</p>}
          {meetings.map((m) => {
            const openCount = m.recap?.followUps.filter((f) => !f.done).length ?? 0;
            return (
              <button key={m.id} className={`recap-item ${m.id === openId ? "active" : ""}`} onClick={() => setOpenId(m.id)}>
                <BrandIcon id={m.platform} size={22} />
                <span className="recap-item-main">
                  <strong>{dayTime(new Date(m.startedAt).toISOString())}</strong>
                  <span>{headline(m)}</span>
                </span>
                {openCount > 0 && <span className="count">{openCount}</span>}
              </button>
            );
          })}
        </nav>

        <div className="scroll recap-detail">
          {open ? (
            <>
              <div className="recap-head">
                <h2>{dayTime(new Date(open.startedAt).toISOString())}</h2>
                <p>{[duration(open), `joined as ${open.joinedAs}`].filter(Boolean).join(" · ")}</p>
              </div>

              <h3 className="section-label">To follow up</h3>
              {open.recap?.followUps.length ? (
                <ul className="followups">
                  {open.recap.followUps.map((f, i) => (
                    <li key={i}>
                      <label className={f.done ? "done" : ""}>
                        <input type="checkbox" checked={f.done} onChange={(e) => act(() => window.penguin.setFollowUp(open.id, i, e.target.checked))} />
                        <span>{f.text}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              ) : <p className="muted-line">Nothing to follow up.</p>}

              {open.recap?.summary && (
                <>
                  <h3 className="section-label">Summary</h3>
                  <p className="recap-summary">{open.recap.summary}</p>
                </>
              )}

              <h3 className="section-label">What Peguin said</h3>
              {open.entries.filter((e) => e.who === "peguin").length === 0 && <p className="muted-line">It wasn't called on.</p>}
              {open.entries.map((e, i) => e.who === "peguin" && (
                <div key={i} className="said-line">
                  <span className="tag">{KIND[e.kind]}</span><time>{time(new Date(e.at).toISOString())}</time>
                  <p>{e.text}</p>
                </div>
              ))}

              <details className="transcript">
                <summary>Full transcript</summary>
                {open.entries.map((e, i) => (
                  <p key={i} className={`t-${e.who}`}>
                    <time>{time(new Date(e.at).toISOString())}</time>
                    <strong>{e.who === "them" ? "Someone" : e.who === "peguin" ? "Peguin" : ""}</strong>
                    {e.text}
                  </p>
                ))}
              </details>

              {error && <div className="notice error">{error}</div>}
              <div className="recap-actions">
                <button className="btn link" onClick={() => act(() => window.penguin.deleteMeeting(open.id))}>Delete this recap</button>
              </div>
            </>
          ) : <div className="empty"><h2>No recaps yet</h2><p>Peguin writes one after each meeting it attends.</p></div>}
        </div>
      </div>
    </>
  );
}
