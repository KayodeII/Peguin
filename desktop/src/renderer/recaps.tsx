// #recaps: what happened in each meeting Peguin attended, or the owner joined with
// the copilot. Follow-ups first (every question it deferred or the notes didn't
// cover, plus anything Claude found), then the summary, what Peguin said or
// suggested, and the transcript. Kept encrypted on this Mac.
import { useEffect, useState } from "react";
import type { MeetingRecord, Question } from "../main/meeting/record";
import { headline } from "../main/meeting/record";
import { COPILOT_LABELS } from "../../../src/core/brain/prompts";
import { BrandIcon, dayTime, Icon, message, time } from "./ui";

const KIND: Record<string, string> = { update: "Gave the update", answer: "Answered", defer: "Deferred to you", ack: "Acknowledged" };

/** A copilot suggestion's label as a tag, and the suggestion without it. */
function suggestion(q: Question): { tag: string; text: string } {
  if (!q.answer) return { tag: "No suggestion", text: "" };
  for (const [key, label] of Object.entries(COPILOT_LABELS)) {
    if (q.answer.startsWith(label)) {
      return { tag: { notes: "From your notes", general: "General knowledge", unknown: "Not in your notes" }[key as keyof typeof COPILOT_LABELS], text: q.answer.slice(label.length).trim() };
    }
  }
  return { tag: "Suggested", text: q.answer };
}

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
          {meetings.length === 0 && <p className="empty-note">After Peguin attends a meeting, or you join one with the copilot, its recap shows up here.</p>}
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
                <p>{[duration(open), open.kind === "copilot" ? "you joined, with the copilot" : `joined as ${open.joinedAs}`].filter(Boolean).join(" · ")}</p>
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

              {open.kind === "copilot" ? (
                <>
                  <h3 className="section-label">What Peguin suggested</h3>
                  {open.questions.length === 0 && <p className="muted-line">No questions came up.</p>}
                  {open.questions.map((q, i) => {
                    const s = suggestion(q);
                    return (
                      <div key={i} className="said-line">
                        <span className="tag">{s.tag}</span><time>{time(new Date(q.at).toISOString())}</time>
                        <p className="said-question">{q.text}</p>
                        {s.text && <p>{s.text}</p>}
                      </div>
                    );
                  })}
                </>
              ) : (
                <>
                  <h3 className="section-label">What Peguin said</h3>
                  {open.entries.filter((e) => e.who === "peguin").length === 0 && <p className="muted-line">It wasn't called on.</p>}
                  {open.entries.map((e, i) => e.who === "peguin" && (
                    <div key={i} className="said-line">
                      <span className="tag">{KIND[e.kind]}</span><time>{time(new Date(e.at).toISOString())}</time>
                      <p>{e.text}</p>
                    </div>
                  ))}
                </>
              )}

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
          ) : <div className="empty"><h2>No recaps yet</h2><p>Peguin writes one after each meeting it attends or you join with the copilot.</p></div>}
        </div>
      </div>
    </>
  );
}
