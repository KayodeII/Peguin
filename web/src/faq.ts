// The FAQ on the site, also the knowledge the help chat answers from (cloud/src/support.ts).
// Keep it true: the chat repeats it to customers.

export const TRIAL_DAYS = 14; // matches TRIAL_DAYS in cloud/wrangler.jsonc

export type FaqItem = { q: string; a: string };

export const faq = (trialDays = TRIAL_DAYS): FaqItem[] => [
  { q: "Does Peguin pretend to be me?", a: "No. It joins as \"Your name (AI)\" and opens with \"I'm Peguin, your AI assistant\" every time. Your team always knows it's an assistant covering for you." },
  { q: "Which meeting apps does it work with?", a: "Google Meet and Zoom today. It joins as a guest from its own window, so you don't connect your meeting account. Microsoft Teams is next." },
  { q: "What does it read to write my update?", a: "Your git commits on your Mac, your GitHub pull requests and reviews, and, if you allow it, the prompts you gave Claude Code. Linear and Jira are coming. You can switch each source off." },
  { q: "Is my code sent anywhere?", a: "No. Peguin reads commit messages, PR titles and statuses, never code. Those short titles go to Claude to write the update; nothing is stored on our side." },
  { q: "What happens if someone asks a question it can't answer?", a: "It answers only from the facts it prepared. If the answer isn't there, it says it'll get you to follow up, and never makes something up." },
  { q: "Does my computer need to be on?", a: "Yes. Peguin runs on your Mac, which is usually already on when you're double-booked. It joins quietly in the background, muted with the camera off until it's called." },
  { q: "Is there a Windows version?", a: "Not yet. Peguin is macOS first; Windows is planned." },
  { q: "How does the free trial work?", a: `You get ${trialDays} days from sign-up, no card needed. Subscribe any time to keep going; cancel from your account whenever you like.` },
];
