// One meeting at a time per kind (pure apart from what it's given): clicking
// Send or Join as me again, or the schedule firing, while that meeting is
// opening or already open does nothing new. A different link waits for the
// one opening, then goes ahead (opening a meeting replaces the old one).

export function onePerMeeting(open: (url: string) => Promise<void>, current: () => string | undefined): (url: string) => Promise<void> {
  let pending: { url: string; done: Promise<void> } | null = null;
  return (url) => {
    if (pending?.url === url) return pending.done;
    if (!pending && current() === url) return Promise.resolve();
    const before = pending?.done.catch(() => {}) ?? Promise.resolve();
    const mine: { url: string; done: Promise<void> } = { url, done: before.then(() => open(url)) };
    mine.done = mine.done.finally(() => { if (pending === mine) pending = null; });
    pending = mine;
    return mine.done;
  };
}
