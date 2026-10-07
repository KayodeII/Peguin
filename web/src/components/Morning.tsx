import { Brand, Icon, Logo, useScrollProgress } from "../ui";

const STEPS = [
  { time: "09:15", title: "Peguin reads your morning", body: "Fifteen minutes before standup it goes through your commits, pull requests and Claude Code sessions, and writes the update." },
  { time: "09:29", title: "It joins, quietly", body: "As \"Ada (AI)\", from a hidden window on your Mac. Muted, camera off. You don't see it, and it doesn't interrupt anyone." },
  { time: "09:31", title: "Someone says your name", body: "It unmutes, says who it is, gives the update in about 40 seconds, and mutes again." },
  { time: "09:33", title: "A question comes in", body: "If the answer is in what it prepared, it answers. If not, it says you'll follow up. You get on with your other meeting." },
];

/** A pinned app window that changes as you scroll through one morning. */
export function Morning() {
  const [ref, p] = useScrollProgress<HTMLDivElement>();
  const step = Math.min(STEPS.length - 1, Math.floor(p * STEPS.length));
  return (
    <div className="morning" ref={ref}>
      <div className="morning-sticky">
        <div className="morning-copy">
          <h2 className="left">One morning with Peguin</h2>
          <ol className="morning-steps">
            {STEPS.map((s, i) => (
              <li key={s.time} className={i === step ? "on" : i < step ? "done" : ""}>
                <span className="m-time">{s.time}</span>
                <div><h3>{s.title}</h3><p>{s.body}</p></div>
              </li>
            ))}
          </ol>
        </div>

        <div className="window" aria-hidden>
          <div className="window-bar"><i /><i /><i /><span>Peguin</span><span className="window-clock">{STEPS[step]!.time}</span></div>
          <div className="window-body">
            <div className={`scene ${step === 0 ? "on" : ""}`}>
              <div className="scene-title"><Logo size={18} />Preparing today's update</div>
              {[["git", "7 commits across 2 repos"], ["github", "2 pull requests, 1 review"], ["claude_code", "3 Claude Code sessions"]].map(([id, t], i) => (
                <div key={id} className="read-row" style={{ animationDelay: `${i * 0.2}s` }}><Brand id={id!} size={20} /><span>{t}</span><Icon name="check" size={16} /></div>
              ))}
              <div className="scene-bar"><i /></div>
            </div>

            <div className={`scene ${step === 1 ? "on" : ""}`}>
              <div className="scene-title"><Brand id="google_meet" size={18} />Daily standup</div>
              <div className="mini-tiles">
                <span className="t-face" style={{ background: "#cb912f" }}>S</span>
                <span className="t-face" style={{ background: "#448361" }}>D</span>
                <span className="t-face ai"><Logo size={26} /></span>
              </div>
              <div className="pill-row"><span className="pill muted"><Icon name="micOff" size={13} />Muted</span><span className="pill muted">Camera off</span><span className="pill muted">Window hidden</span></div>
            </div>

            <div className={`scene ${step === 2 ? "on" : ""}`}>
              <div className="said"><strong>Sarah</strong>Thanks David. Ada, you're up.</div>
              <div className="speaking-card">
                <Logo size={30} />
                <div>
                  <strong>Ada (AI)</strong>
                  <span className="big-wave">{Array.from({ length: 32 }, (_, i) => <i key={i} style={{ animationDelay: `${(i * 53) % 700}ms` }} />)}</span>
                </div>
                <span className="pill live"><Icon name="mic" size={13} />0:38</span>
              </div>
            </div>

            <div className={`scene ${step === 3 ? "on" : ""}`}>
              <div className="said"><strong>David</strong>Is the auth migration landing this week?</div>
              <div className="said ai"><strong>Ada (AI)</strong>It's in progress, but there's no date in Ada's work yet. I'll get Ada to follow up.</div>
              <div className="pill-row"><span className="pill ok"><Icon name="check" size={13} />Answered from facts</span><span className="pill muted"><Icon name="micOff" size={13} />Muted again</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
