// Transactional email through Resend: one table-based layout (inline styles,
// so it holds up in Gmail and Outlook) and the few messages we send.
import { HttpError, type Env } from "./env.js";

type Mail = { to: string; subject: string; html: string; text: string; replyTo?: string };

/** False when no email provider is configured (local dev); throws if Resend refuses. */
export async function sendEmail(env: Env, mail: Mail): Promise<boolean> {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: mail.to, subject: mail.subject, html: mail.html, text: mail.text, reply_to: mail.replyTo }),
  });
  if (!res.ok) throw new HttpError(502, "Couldn't send the email. Try again in a minute.");
  return true;
}

export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const C = { page: "#f7f6f3", card: "#ffffff", line: "#ebeae6", ink: "#37352f", strong: "#191919", muted: "#787774", accent: "#c8432f", soft: "#fff3ee" };
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Helvetica, Arial, sans-serif";

type Layout = {
  origin: string;
  preheader: string;
  heading: string;
  /** Trusted HTML: build it from escaped values only. */
  body: string;
  cta?: { label: string; url: string };
  /** Small print under the card. */
  footnote: string;
  art?: boolean;
};

const p = (html: string) => `<p style="margin:0 0 16px;font:400 16px/1.6 ${FONT};color:${C.ink}">${html}</p>`;

function layout(l: Layout): string {
  const button = l.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px"><tr><td style="border-radius:10px;background:${C.accent}">
        <a href="${escapeHtml(l.cta.url)}" style="display:inline-block;padding:14px 26px;font:600 16px/1 ${FONT};color:#ffffff;text-decoration:none;border-radius:10px">${escapeHtml(l.cta.label)}</a>
      </td></tr></table>`
    : "";
  const art = l.art
    ? `<tr><td align="center" style="padding:36px 40px 0;background:${C.soft};border-radius:16px 16px 0 0">
        <img src="${l.origin}/email/penguin-flag.png" width="132" height="132" alt="" style="display:block;border:0;width:132px;height:132px">
      </td></tr>`
    : "";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${escapeHtml(l.heading)}</title></head>
<body style="margin:0;padding:0;background:${C.page}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(l.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page}"><tr><td align="center" style="padding:32px 16px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
    <tr><td style="padding:0 4px 20px">
      <a href="${l.origin}" style="text-decoration:none"><img src="${l.origin}/email/logo.png" width="28" height="28" alt="" style="vertical-align:middle;border:0">
      <span style="vertical-align:middle;margin-left:8px;font:700 18px/1 ${FONT};color:${C.strong};letter-spacing:-0.02em">Peguin</span></a>
    </td></tr>
    <tr><td style="background:${C.card};border:1px solid ${C.line};border-radius:16px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${art}
        <tr><td style="padding:36px 40px 20px">
          <h1 style="margin:0 0 16px;font:700 26px/1.25 ${FONT};color:${C.strong};letter-spacing:-0.02em">${escapeHtml(l.heading)}</h1>
          ${l.body}
          ${button}
        </td></tr>
      </table>
    </td></tr>
    <tr><td style="padding:20px 4px 0;font:400 13px/1.6 ${FONT};color:${C.muted}">
      ${l.footnote}<br>Peguin, made in Lagos. <a href="${l.origin}" style="color:${C.muted}">peguin.co</a>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

export function signInEmail(origin: string, link: string, minutes: number): Omit<Mail, "to"> {
  return {
    subject: "Your Peguin sign-in link",
    html: layout({
      origin,
      preheader: `This link signs you in to Peguin. It works once, for ${minutes} minutes.`,
      heading: "Sign in to Peguin",
      body: p("Tap the button to sign in. New here? This also creates your account."),
      cta: { label: "Sign in to Peguin", url: link },
      footnote: `The link works once and expires in ${minutes} minutes. If the button doesn't work, paste this into your browser:<br>
        <a href="${escapeHtml(link)}" style="color:${C.muted};word-break:break-all">${escapeHtml(link)}</a><br><br>
        Didn't ask for this? You can ignore it; nobody can sign in without the link.`,
    }),
    text: `Sign in to Peguin:\n\n${link}\n\nThe link works once and expires in ${minutes} minutes. If you didn't ask for it, ignore this email.`,
  };
}

export function welcomeEmail(origin: string, trialDays: number, trialPlan: string): Omit<Mail, "to"> {
  const steps = [
    ["Install the Mac app", "Sign in from Settings in the app."],
    ["Set your standup", "Pick the days, the time and the meeting link."],
    ["Get on with your day", "Peguin prepares 15 minutes before and joins muted. It speaks when someone says your name."],
  ];
  const list = steps.map(([t, d]) => `<tr>
      <td valign="top" style="padding:0 12px 14px 0;width:22px"><div style="width:10px;height:10px;margin-top:7px;border-radius:5px;background:${C.accent}"></div></td>
      <td style="padding:0 0 14px;font:400 15px/1.55 ${FONT};color:${C.ink}"><strong style="color:${C.strong}">${t}.</strong> ${d}</td>
    </tr>`).join("");
  return {
    subject: "Welcome to Peguin",
    html: layout({
      origin,
      art: true,
      preheader: `You have ${trialDays} days of ${trialPlan}, free. No card needed.`,
      heading: "Welcome to Peguin",
      body: p(`You have ${trialDays} days of ${trialPlan} free, and there's no card on file. After that you keep the Free plan unless you choose another. Here's how to get your first standup covered:`)
        + `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 12px">${list}</table>`
        + p("Peguin always tells the room it's an AI, and it only answers from what you actually shipped."),
      cta: { label: "Open your account", url: `${origin}/account` },
      footnote: "Questions? Click the penguin at the bottom of peguin.co and ask.",
    }),
    text: `Welcome to Peguin.\n\nYou have ${trialDays} days of ${trialPlan} free, no card needed.\n\n${steps.map(([t, d], i) => `${i + 1}. ${t}. ${d}`).join("\n")}\n\nYour account: ${origin}/account`,
  };
}

export function waitlistEmail(origin: string): Omit<Mail, "to"> {
  return {
    subject: "You're on the Peguin waitlist",
    html: layout({
      origin,
      art: true,
      preheader: "We'll email you when your invite is ready.",
      heading: "You're on the list",
      body: p("Thanks for your interest in Peguin. We're letting people in a few at a time, so it runs well for everyone.")
        + p("We'll email you at this address when your invite is ready. You don't need to do anything until then."),
      footnote: "Didn't sign up? Ignore this email and you won't hear from us again.",
    }),
    text: "You're on the Peguin waitlist.\n\nWe're letting people in a few at a time. We'll email you here when your invite is ready.\n\nDidn't sign up? Ignore this email.",
  };
}

export function inviteEmail(origin: string, trialDays: number, trialPlan: string): Omit<Mail, "to"> {
  const url = `${origin}/signin?next=/account`;
  return {
    subject: "Your Peguin invite is ready",
    html: layout({
      origin,
      art: true,
      preheader: `Sign in with this email address to start. ${trialDays} days of ${trialPlan}, free.`,
      heading: "You're in",
      body: p("Your spot on the waitlist came up. Sign in with this email address, with Google or an email link, and your account is ready.")
        + p(`You get ${trialDays} days of ${trialPlan} free, no card needed.`),
      cta: { label: "Sign in to Peguin", url },
      footnote: "The invite is for this email address only.",
    }),
    text: `Your Peguin invite is ready.\n\nSign in with this email address: ${url}\n\nYou get ${trialDays} days of ${trialPlan} free, no card needed.`,
  };
}

export function supportInboxEmail(origin: string, m: { from: string; message: string; transcript: string; page: string; userId: string | null }): Omit<Mail, "to"> {
  const pre = (s: string) => `<div style="margin:0 0 16px;padding:14px 16px;border-radius:10px;background:${C.page};font:400 14px/1.6 ${FONT};color:${C.ink};white-space:pre-wrap">${escapeHtml(s)}</div>`;
  return {
    subject: `Help request from ${m.from}`,
    replyTo: m.from,
    html: layout({
      origin,
      preheader: m.message.slice(0, 120),
      heading: "New help request",
      body: p(`<strong>${escapeHtml(m.from)}</strong>${m.userId ? " (signed in)" : ""} wrote from <span style="color:${C.muted}">${escapeHtml(m.page)}</span>:`)
        + pre(m.message)
        + (m.transcript ? p("Chat before this:") + pre(m.transcript) : ""),
      footnote: "Reply to this email to answer them directly.",
    }),
    text: `From: ${m.from}\nPage: ${m.page}\n\n${m.message}\n\n${m.transcript ? `Chat:\n${m.transcript}` : ""}`,
  };
}
