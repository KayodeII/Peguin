import { PHOTOS, type Photo } from "../photos";
import { Img, useScrollProgress } from "../ui";

const clamp = (x: number) => Math.min(1, Math.max(0, x));

/**
 * A big photo that starts as an inset card and opens to the full width of the
 * screen as you scroll, while lines of text arrive over it.
 */
export function ExpandingPhoto({ photo, lines }: { photo: Photo; lines: string[] }) {
  const [ref, p] = useScrollProgress<HTMLDivElement>();
  const open = clamp(p / 0.45);                       // first half: the card opens up
  const inset = (1 - open) * 9;                       // vw of margin on each side
  const radius = (1 - open) * 32;
  return (
    <div className="expand" ref={ref}>
      <div className="expand-sticky">
        <div className="expand-frame" style={{ clipPath: `inset(${inset * 0.7}vh ${inset}vw round ${radius}px)` }}>
          <div className="expand-img" style={{ transform: `scale(${1.18 - open * 0.18})` }}><Img photo={photo} /></div>
          <div className="expand-scrim" style={{ opacity: 0.25 + open * 0.35 }} />
          <div className="expand-lines">
            {lines.map((l, i) => {
              const t = clamp((p - 0.35 - i * 0.16) / 0.14);
              return <p key={i} style={{ opacity: t, transform: `translateY(${(1 - t) * 30}px)` }}>{l}</p>;
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

const PEOPLE = [
  { photo: PHOTOS.engineers, who: "Engineers", title: "Deep in a bug when standup starts", body: "Keep going. Your team hears what you did yesterday, from your commits and pull requests.", color: "#e7f0ff" },
  { photo: PHOTOS.managers, who: "Engineering managers", title: "Your 1:1 runs into the team standup", body: "Stay with your report. Peguin covers your update and answers what it can.", color: "#fff3d6" },
  { photo: PHOTOS.founders, who: "Founders", title: "A customer call at 9:30", body: "Take the call. The team still hears what shipped, from the work itself.", color: "#e6f5ec" },
  { photo: PHOTOS.remote, who: "Remote teams", title: "Standup lands at an awkward hour", body: "If your Mac is on, Peguin can attend. Your update arrives whatever the hour where you are.", color: "#fde8e2" },
];

/** Pinned section: big photo cards slide sideways as you scroll down. */
export function PeopleRail() {
  const [ref, p] = useScrollProgress<HTMLDivElement>();
  return (
    <div className="rail" ref={ref} style={{ height: `${PEOPLE.length * 80 + 60}vh` }}>
      <div className="rail-sticky">
        <div className="rail-head">
          <h2 className="left">Who it's for</h2>
          <p className="section-lead left">Anyone whose calendar has two things at 9:30.</p>
        </div>
        <div className="rail-track" style={{ transform: `translate3d(calc(${-p} * (100% - 100vw + 48px)), 0, 0)` }}>
          {PEOPLE.map((x) => (
            <article key={x.who} className="person" style={{ background: x.color }}>
              <Img photo={x.photo} className="person-photo" />
              <div className="person-copy">
                <span className="person-who">{x.who}</span>
                <h3>{x.title}</h3>
                <p>{x.body}</p>
              </div>
            </article>
          ))}
        </div>
        <div className="rail-progress"><i style={{ transform: `scaleX(${p})` }} /></div>
      </div>
    </div>
  );
}
