// #cursor: Peguin's own cursor and voice control, in the sidebar where the owner
// can see them: the switch, how to talk to it, how the cursor looks, things to
// try. The rarer options stay in Settings > Voice control.
import type { Settings } from "../main/settings";
import { CursorArt } from "./cursorArt";
import { Icon } from "./ui";
import { ChannelHeader } from "./views";
import { CursorSettings, howToTalk, TryVoiceControl, VoiceControlSwitch } from "./voicecontrol";

export function CursorView({ settings, save, goSettings }: { settings: Settings; save: (s: Settings) => Promise<Settings>; goSettings: () => void }) {
  const p = settings.pointer;
  return (
    <>
      <ChannelHeader name="cursor" topic="Peguin's own cursor: say it, and it clicks">
        <button className="btn ghost" onClick={goSettings}><Icon name="settings" size={16} />More options</button>
      </ChannelHeader>
      <div className="scroll narrow">
        <VoiceControlSwitch settings={settings} save={save} hero={{
          art: (
            <svg width="34" height="34" viewBox="0 0 34 34" style={{ transform: `scale(${2.4 * p.cursor.size})` }}>
              <CursorArt shape={p.cursor.shape} color={p.cursor.color} gaze={{ x: -0.7, y: -0.7 }} />
            </svg>
          ),
          title: p.enabled ? "Peguin's cursor is on" : "Let Peguin drive your Mac",
          text: p.enabled
            ? `${howToTalk(p)} Peguin moves its own cursor to what you asked for; your mouse stays where you leave it.`
            : "Turn this on, then say what you want: Peguin's own cursor glides over to click, type, scroll or draw it, while your mouse stays yours. It only hears your own microphone, on this Mac, and lines that aren't for it are dropped.",
        }} />
        <h3 className="section-label">How it looks</h3>
        <CursorSettings settings={settings} save={save} />
        <h3 className="section-label">Try it</h3>
        <TryVoiceControl settings={settings} />
      </div>
    </>
  );
}
