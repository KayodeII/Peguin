// Privacy Policy and Terms. Written from what the code actually does
// (cloud/migrations, cloud/src, desktop/src); update them together.
import type { ReactNode } from "react";
import { Link } from "../ui";

const UPDATED = "10 October 2026";

function LegalPage({ title, intro, children }: { title: string; intro: ReactNode; children: ReactNode }) {
  return (
    <article className="page legal">
      <h1>{title}</h1>
      <p className="legal-updated">Last updated {UPDATED}</p>
      <div className="legal-intro">{intro}</div>
      {children}
    </article>
  );
}

const Contact = () => <>use <strong>Message the team</strong> in the help chat (the penguin at the bottom of any page); a person reads every message and replies by email</>;

export function Privacy() {
  return (
    <LegalPage title="Privacy Policy" intro={<p>Peguin is built so that most of what it handles never leaves your Mac. This policy says what we collect, what stays on your computer, what is sent to other services and why, and the choices you have.</p>}>
      <h2>The short version</h2>
      <ul>
        <li>The Peguin app runs on your Mac. Your meetings are heard and transcribed there, your voice sample and meeting recaps are stored there, encrypted with your Mac's Keychain.</li>
        <li>To write your update and answer questions, short descriptions of your work (commit messages, pull request titles, statuses) and, for answers and recaps, the relevant part of the meeting transcript are sent to the AI you choose in the app (Claude, Codex or Grok), under your own account with that provider. Never your code, and never through our server.</li>
        <li>Our server keeps your account, your subscription status and little else.</li>
        <li>We don't sell your data or use it for advertising.</li>
      </ul>

      <h2>What our server stores</h2>
      <p>When you create an account and use peguin.co, we store:</p>
      <ul>
        <li><strong>Account:</strong> your email address, your name and Google account ID if you sign in with Google, and when your account and trial started.</li>
        <li><strong>Sign-in:</strong> sign-in links and sessions, stored only as one-way hashes, and for each Mac signed in to the app, its label, app version and when it was last used.</li>
        <li><strong>Subscription:</strong> your Paystack customer and subscription codes, plan status and renewal date. We never see or store your card details; Paystack handles payment.</li>
        <li><strong>Help messages:</strong> if you message the team from the help chat, your email address, your message, the chat before it and the page you were on.</li>
        <li><strong>Waitlist:</strong> if you join it, your email address, the plan you said you were interested in, and when you joined and were invited.</li>
        <li><strong>Calendar connections:</strong> when you connect Google Calendar, Outlook or Calendly, our server completes the sign-in with that service and hands the access to your Mac. For up to 5 minutes it holds that hand-off, encrypted with a key only your Mac receives, then deletes it. It doesn't keep your calendar access or your events.</li>
        <li><strong>Abuse protection:</strong> a one-way hash of your IP address with a daily count, for the help chat and the waitlist.</li>
      </ul>
      <p>Our server never sees your work or what's said in your meetings: the app sends those straight to your own AI provider.</p>

      <h2>What stays on your Mac</h2>
      <ul>
        <li>Your settings, prepared updates, and the meeting audio Peguin hears, which is transcribed on your Mac and not recorded.</li>
        <li>If you turn on <strong>Speak in your own voice</strong>: your voice sample, which you record yourself in the app, and the audio made from it. Both are encrypted and you can delete them in Settings.</li>
        <li>Meeting recaps and transcripts, encrypted, kept for the period you choose in Settings (30 days unless you change it), then deleted.</li>
        <li>Access to the calendars you connect (Google Calendar, Outlook, Calendly), calendar links, and, if you use them, your ElevenLabs and xAI API keys, all encrypted. Calendar events are read on your Mac to find standups and aren't sent to us.</li>
      </ul>
      <p>Peguin reads your work from git on your Mac, from GitHub through your own <code>gh</code> sign-in, and, if you allow it, the prompts you gave Claude Code. It reads titles and statuses, never code.</p>

      <h2>What is sent to other services, and why</h2>
      <ul>
        <li><strong>Your AI: Anthropic (Claude), OpenAI (Codex) or xAI (Grok)</strong>, whichever you choose in Settings, AI (Claude is the default). To write your update, the titles, statuses and times of your recent work. To answer a follow-up question in a meeting or suggest a copilot answer, the facts from your update, the question and the last few lines of the conversation. For a recap summary (you can turn this off), the meeting transcript. This goes from your Mac to that provider under your own account and your agreement with them: your Claude Code sign-in, your Codex (ChatGPT) sign-in, or your xAI API key. Only the one you chose receives anything.</li>
        <li><strong>xAI voice:</strong> only if you choose the Grok voice as Peguin's standard voice. Each line Peguin says is sent to xAI with your API key to be spoken. The default, the Mac voice, sends nothing.</li>
        <li><strong>Anthropic (help chat):</strong> questions you type into the help chat on peguin.co go to Claude through our server, and aren't stored unless you message the team.</li>
        <li><strong>Cloudflare:</strong> hosts peguin.co and our database.</li>
        <li><strong>Paystack:</strong> processes payments and manages your subscription.</li>
        <li><strong>Resend:</strong> sends sign-in and welcome emails.</li>
        <li><strong>Google:</strong> if you choose Continue with Google, to confirm your email address. If you connect Google Calendar, Peguin reads the events on your primary calendar, read-only, on your Mac, to find your standups and their meeting links. Fresh access is requested through our server, which doesn't keep it.</li>
        <li><strong>Microsoft:</strong> if you connect Outlook, the same for your Outlook or Microsoft 365 calendar, read-only.</li>
        <li><strong>Calendly:</strong> if you connect it, to read your scheduled meetings.</li>
        <li><strong>ElevenLabs:</strong> only if you choose ElevenLabs for <strong>Speak in your own voice</strong>. Your voice sample is sent to make a voice in your own ElevenLabs account, and each line Peguin speaks is sent to be read in that voice. This happens under your agreement with ElevenLabs, using your API key. Deleting your sample or disconnecting ElevenLabs in Settings deletes that voice from your ElevenLabs account. The default, <strong>On this Mac</strong>, sends nothing.</li>
        <li><strong>GitHub and Hugging Face:</strong> app downloads, and the speech and voice models the app downloads on first use, come from these. They see your IP address when you download.</li>
        <li><strong>The meetings you send Peguin to:</strong> Peguin joins as a guest named with "(AI)", and the meeting service (Google Meet, Zoom) handles its audio like any participant's.</li>
      </ul>

      <h2>Google user data</h2>
      <p>Peguin's use and transfer of information received from Google APIs to any other app adheres to the <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">Google API Services User Data Policy</a>, including the Limited Use requirements. Calendar data is used only to find your standups, is read on your Mac, isn't stored on our servers, isn't used for advertising or to train AI models, and isn't shared with anyone else.</p>

      <h2>Other people in your meetings</h2>
      <p>Peguin always introduces itself as your AI assistant, and its name ends in "(AI)". It transcribes what others say on your Mac so it knows when you're called on and can answer; the parts described above go to your AI. It does not identify who said what.</p>
      <p>With the <strong>private copilot</strong>, you're in your own meeting as yourself and Peguin doesn't join or speak. It transcribes what others say on your Mac, and when someone asks you something, the question, the recent conversation and your prepared facts go to your AI for a suggested answer that only you see. Questions about your own work are answered only from your prepared facts; general questions get a general answer, marked as such. Your own microphone isn't transcribed.</p>
      <p>You're responsible for using Peguin only in meetings where that's allowed, and for telling the people you meet with that you use it.</p>

      <h2>How long we keep things</h2>
      <ul>
        <li>Account and subscription data: while your account exists. Sign-in links expire after 15 minutes and sessions after 30 days.</li>
        <li>Waitlist entries: until you're invited and have created an account, or you ask us to remove you.</li>
        <li>Help messages: until they're resolved and no longer needed.</li>
        <li>Data on your Mac: until you delete it, or the period you set for recaps.</li>
      </ul>

      <h2>Your choices and rights</h2>
      <p>You can switch off any work source, your own voice and recap summaries in the app, disconnect any calendar, and delete your voice sample and recaps at any time. You can also remove Peguin's access from your Google, Microsoft or Calendly account settings. To get a copy of the data our server holds about you, correct it, or delete your account, <Contact />. Depending on where you live (for example under Nigeria's Data Protection Act or the GDPR), you may have further rights, including to object to processing and to complain to your data protection authority.</p>

      <h2>Security</h2>
      <p>Connections use HTTPS. Sign-in tokens are stored only as hashes, licences are signed, and data on your Mac is encrypted with the Keychain. No system is perfectly secure; if something goes wrong that affects you, we'll tell you.</p>

      <h2>Children</h2>
      <p>Peguin is for people at work, aged 18 or over.</p>

      <h2>Changes</h2>
      <p>If we change this policy in a way that matters, we'll say so on this page and by email before it applies.</p>

      <h2>Contact</h2>
      <p>For anything about your privacy, <Contact />.</p>
    </LegalPage>
  );
}

export function Terms() {
  return (
    <LegalPage title="Terms of Service" intro={<p>These terms are the agreement between you and Peguin for using peguin.co and the Peguin app. By creating an account or using the app, you agree to them. The <Link to="/privacy">Privacy Policy</Link> explains how we handle data.</p>}>
      <h2>What Peguin does</h2>
      <p>Peguin is a Mac app that attends your standup when you can't. It writes your update from your recent work, joins the meeting as your AI assistant, gives the update when you're called on, answers follow-up questions only from what it prepared, and otherwise says you'll follow up.</p>

      <h2>Your account</h2>
      <ul>
        <li>You must be 18 or over and give a real email address.</li>
        <li>Keep access to your email and devices secure; you're responsible for activity on your account.</li>
        <li>One person per account.</li>
      </ul>

      <h2>Using Peguin honestly</h2>
      <p>Peguin always tells the room it's an AI, and you agree not to hide that. In particular, you agree:</p>
      <ul>
        <li>Not to remove, obscure or work around the "(AI)" name or the spoken introduction.</li>
        <li>To use Peguin only in meetings where an AI assistant may attend and listen, following your organisation's policies and the law where you and the other participants are, including on recording and consent.</li>
        <li>To record only your own voice for <strong>Speak in your own voice</strong>, never anyone else's, on this Mac or through ElevenLabs.</li>
        <li>In interviews, exams and assessments, to follow that process's rules on AI help. Many don't allow it, and you're responsible for using the copilot only where it's permitted.</li>
        <li>Not to use Peguin to deceive, harass or impersonate anyone, or for anything unlawful.</li>
        <li>Not to resell Peguin, get around licence checks or usage limits, or overload our service.</li>
      </ul>

      <h2>What Peguin says for you</h2>
      <p>Peguin speaks on your behalf from your own work, and it can get things wrong: speech recognition mishears, and summaries can miss nuance. Review your update in the app when it matters, and follow up on anything it deferred. You're responsible for what's said in your name in your meetings.</p>

      <h2>Plans, trial, subscription and cancelling</h2>
      <ul>
        <li>Peguin has a Free plan and paid plans; what each includes is on the <Link to="/pricing">pricing page</Link>.</li>
        <li>New accounts get a free trial of a paid plan (shown on the pricing page) with no card needed. When it ends you move to the Free plan unless you choose a paid one.</li>
        <li>Paid plans are monthly subscriptions, charged in advance through Paystack at the price shown when you subscribe. They renew each month until you cancel.</li>
        <li>Cancel any time from your account (Manage billing). You keep access until the end of the period you've paid for.</li>
        <li>Payments aren't refunded for part of a month, except where the law requires it.</li>
        <li>If we change the price, we'll tell you by email at least 30 days before it applies to you.</li>
      </ul>

      <h2>Your content</h2>
      <p>Your work, meetings, voice and recaps are yours. You give us only the permission needed to run Peguin for you, as described in the Privacy Policy. We don't use your content to train AI models.</p>

      <h2>Our service</h2>
      <p>The app, website and everything we make for them belong to Peguin. While your account is in good standing, you may install and use the app on your own Macs. We keep improving Peguin, so features may change; we'll give notice before removing something you pay for.</p>
      <p>We may suspend or close an account that breaks these terms, after telling you why where we can. You can close your account any time.</p>

      <h2>Other services you connect</h2>
      <p>If you connect a calendar or choose ElevenLabs for your voice, your use of those services is also under their own terms, and anything they charge you (for example ElevenLabs usage on your API key) is between you and them.</p>

      <h2>No guarantees</h2>
      <p>Peguin depends on meeting services, speech recognition and AI models that we don't control, and it is provided as it is, without promises that it will always be available, join every meeting, or be error-free.</p>

      <h2>Limits on liability</h2>
      <p>As far as the law allows, we aren't liable for indirect or consequential losses, and our total liability to you is limited to what you paid us in the 12 months before the claim. Nothing here limits liability that can't be limited by law.</p>

      <h2>Changes to these terms</h2>
      <p>If we change these terms in a way that matters, we'll tell you by email before the change applies. Continuing to use Peguin after that means you accept the new terms.</p>

      <h2>Law</h2>
      <p>These terms are governed by the laws of the Federal Republic of Nigeria, and the courts of Lagos State have jurisdiction, unless the law where you live gives you the right to use your local courts.</p>

      <h2>Contact</h2>
      <p>Questions about these terms: <Contact />.</p>
    </LegalPage>
  );
}
