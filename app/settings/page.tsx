"use client";

import { AppHeader } from "@/components/AppHeader";
import { useSettings, type Speed } from "@/lib/settings";
import { primeAudio, setSoundEnabled, sfx } from "@/lib/sound";
import type { Difficulty } from "@/lib/engine/types";
import type { Lang } from "@/lib/copy";

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3.5">
      <p className="text-sm font-semibold text-cream-100">{label}</p>
      {hint && <p className="mt-0.5 mb-2.5 text-xs text-cream-400">{hint}</p>}
      <div className={hint ? "" : "mt-2.5"}>{children}</div>
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ id: T; label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0,1fr))` }}>
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
          className={`btn !min-h-10 !px-1 !text-xs ${value === o.id ? "btn-primary" : "btn-secondary"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${on ? "bg-mint-400" : "bg-white/15"}`}
    >
      {/* `left-0` is load-bearing: without it the knob is positioned from its
          static position, which a button's default `text-align: center`
          shifts to the middle of the track — so the "on" state slid the
          knob straight out of the pill. */}
      <span
        className={`absolute left-0 top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          on ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

export default function SettingsPage() {
  const { settings, update } = useSettings();

  return (
    <main className="flex min-h-dvh flex-col">
      <AppHeader title="Settings" />

      <div className="mx-auto w-full max-w-md flex-1 space-y-2.5 px-4 pb-12 pt-4">
        <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] p-3.5">
          <div>
            <p className="text-sm font-semibold text-cream-100">🔊 Sound effects</p>
            <p className="mt-0.5 text-xs text-cream-400">Shuffles, deals and card taps.</p>
          </div>
          <Toggle
            label="Sound effects"
            on={settings.sound}
            onChange={(v) => {
              update({ sound: v });
              setSoundEnabled(v);
              if (v) {
                primeAudio();
                sfx.click();
              }
            }}
          />
        </div>

        <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] p-3.5">
          <div>
            <p className="text-sm font-semibold text-cream-100">✨ Animations</p>
            <p className="mt-0.5 text-xs text-cream-400">Turn off for an instant, no-frills table.</p>
          </div>
          <Toggle label="Animations" on={settings.animations} onChange={(v) => update({ animations: v })} />
        </div>

        <Row label="🗣️ Language" hint="Roman Urdu adds more desi flavour to the messages.">
          <Segmented<Lang>
            value={settings.lang}
            onChange={(lang) => update({ lang })}
            options={[
              { id: "en", label: "English" },
              { id: "ur", label: "Roman Urdu" },
            ]}
          />
        </Row>

        <Row label="⏱️ Game speed" hint="How long CPU turns and trick results linger.">
          <Segmented<Speed>
            value={settings.speed}
            onChange={(speed) => update({ speed })}
            options={[
              { id: "chill", label: "Chill" },
              { id: "normal", label: "Normal" },
              { id: "fast", label: "Fast" },
            ]}
          />
        </Row>

        <Row label="🤖 Default difficulty" hint="Used the next time you set up a game.">
          <Segmented<Difficulty>
            value={settings.difficulty}
            onChange={(difficulty) => update({ difficulty })}
            options={[
              { id: "easy", label: "Easy" },
              { id: "medium", label: "Medium" },
              { id: "hard", label: "Hard" },
            ]}
          />
        </Row>

        <p className="pt-4 text-center text-[0.7rem] text-cream-400/70">
          Settings are saved on this device.
        </p>
      </div>
    </main>
  );
}
