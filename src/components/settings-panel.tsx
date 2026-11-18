import { useEffect, useState } from "react";
import { Check, ChevronDown, Settings } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import {
  MAX_PLAYER_BLUR,
  PLAYER_DEFAULTS,
  SITE_DEFAULTS,
  useAppearance,
  type DetailsBg,
  type PlayerBg,
  type PhoneStyle,
  type PlayerCorners,
  type PlayerLayout,
  type PlayerSide,
} from "@/hooks/use-appearance";
import { THEMES, useTheme } from "@/hooks/use-theme";
import { usePrefs } from "@/hooks/use-prefs";
import { clearProgress, setHistoryPaused, useHistoryPaused } from "@/hooks/use-progress";
import { toast } from "sonner";
import { useBrightBehind } from "@/hooks/use-tone-behind";
import { freshSupported, useShield, type Shield } from "@/hooks/use-shield";
import { cn } from "@/lib/utils";

/**
 * The Settings gear (sidebar on desktop, bottom bar on phones). It opens a panel; the
 * theme section uses compact accent dots. The choice is saved in the browser.
 */
type Tab = "look" | "player" | "phone" | "titles" | "privacy" | "protect" | "backup";
const TABS: { id: Tab; label: string }[] = [
  { id: "look", label: "Appearance" },
  { id: "player", label: "Player" },
  { id: "phone", label: "Phone" },
  { id: "titles", label: "Titles & dates" },
  { id: "privacy", label: "Privacy" },
  { id: "protect", label: "Ad shield" },
  { id: "backup", label: "Backup & reset" },
];

/** The device settings that Export / Import carry (stored only on this device). */
const BACKUP_KEYS = ["tyshi-appearance-v4", "tyshi-theme-v1", "tyshi-prefs-v1", "tyshi-shield-v1"];

export function SettingsPanel({
  side = "right",
}: {
  side?: "right" | "top" | "bottom";
}) {
  const { theme, setTheme } = useTheme();
  const {
    playerBg,
    playerBlur,
    detailsBg,
    blackEverywhere,
    playerLayout,
    playerSide,
    playerCorners,
    playerGlow,
    phoneStyle,
    phoneSticky,
    phoneScaled,
    fillFrame,
    cornerStyle,
    textSize,
    reduceMotion,
    highContrast,
    titleLang,
    dateFormat,
    autoPlay,
    update,
  } = useAppearance();
  const historyPaused = useHistoryPaused();
  const [triggerRef, brightBehind] = useBrightBehind<HTMLButtonElement>();
  const { adShield, freshPlayer, altHost, update: updateShield } = useShield();
  const { prefs, set: setPrefs } = usePrefs();
  const [supported, setSupported] = useState<boolean | null>(null);
  useEffect(() => setSupported(freshSupported()), []);
  /** A protection change reaches the player when it loads, so on a watch page the page starts over (a fresh window). */
  const applyShield = (patch: Partial<Shield>) => {
    updateShield(patch);
    if (window.location.pathname.includes("/watch"))
      window.setTimeout(() => window.location.reload(), 150);
  };
  const playerChanged =
    playerLayout !== PLAYER_DEFAULTS.playerLayout ||
    playerSide !== PLAYER_DEFAULTS.playerSide ||
    playerCorners !== PLAYER_DEFAULTS.playerCorners ||
    playerGlow !== PLAYER_DEFAULTS.playerGlow ||
    phoneStyle !== PLAYER_DEFAULTS.phoneStyle ||
    phoneSticky !== PLAYER_DEFAULTS.phoneSticky ||
    phoneScaled !== PLAYER_DEFAULTS.phoneScaled ||
    fillFrame !== PLAYER_DEFAULTS.fillFrame;
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("look");
  const [backgroundsOpen, setBackgroundsOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          aria-label="Settings"
          title="Settings"
          className={cn(
            "grid size-9 place-items-center rounded-xl border border-transparent text-white/90 transition-all duration-300 md:size-10",
            brightBehind || open ? "glass-btn" : "hover:bg-white/10",
            open && "bg-black/80",
          )}
        >
          <Settings className="size-5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side={side}
        align={side === "right" || side === "bottom" ? "end" : "center"}
        sideOffset={12}
        className="scroll-slim max-h-[82vh] w-[23rem] max-w-[calc(100vw-1rem)] overflow-y-auto p-3"
      >
        <div className="mb-3 flex items-center gap-2 px-1 text-sm font-semibold">
          <Settings className="size-4" />
          Settings
        </div>
        <div role="tablist" aria-label="Settings section" className="flex flex-wrap gap-1.5">
          {TABS.filter((t) => t.id !== "phone" || true).map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "h-9 rounded-lg px-3 text-xs font-semibold transition",
                tab === t.id ? "bg-primary text-primary-foreground" : "bg-surface-2/70 text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "look" && (
          <div className="mt-3 space-y-2">
            <Section title="Theme">
              <div
                className="grid grid-cols-5 gap-1"
                role="radiogroup"
                aria-label="Accent theme"
              >
                {THEMES.map((t) => {
                  const selected = t.id === theme;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={t.label}
                      onClick={() => setTheme(t.id)}
                      className="group grid min-h-10 min-w-0 place-items-center rounded-xl transition hover:bg-surface-2/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "grid size-6 place-items-center rounded-full shadow-sm transition",
                          selected
                            ? "ring-2 ring-foreground ring-offset-2 ring-offset-popover"
                            : "ring-1 ring-border group-hover:scale-105",
                        )}
                        style={{ backgroundColor: t.color }}
                      >
                        {selected ? (
                          <Check
                            className={cn(
                              "size-4",
                              t.id === "mono"
                                ? "text-black"
                                : "text-white drop-shadow",
                            )}
                          />
                        ) : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Section>

            <section className="rounded-xl border border-border/70 bg-surface/45 p-3">
              <button
                type="button"
                aria-expanded={backgroundsOpen}
                aria-controls="appearance-background-settings"
                onClick={() => setBackgroundsOpen((value) => !value)}
                className="flex w-full items-center justify-between rounded-lg px-1 py-0.5 text-left text-xs font-bold uppercase tracking-widest text-muted-foreground transition hover:text-foreground"
              >
                Backgrounds
                <ChevronDown
                  className={cn(
                    "size-4 transition-transform",
                    backgroundsOpen && "rotate-180",
                  )}
                />
              </button>
              {backgroundsOpen && (
                <div
                  id="appearance-background-settings"
                  className="mt-2.5 space-y-2.5"
                >
                  <ToggleRow
                    label="Full black everywhere"
                    hint="No banner or poster behind any page, including the player."
                    checked={blackEverywhere}
                    onChange={(v) => update({ blackEverywhere: v })}
                  />
                  <div
                    className={cn(
                      "space-y-2.5",
                      blackEverywhere && "pointer-events-none opacity-40",
                    )}
                    aria-disabled={blackEverywhere}
                  >
                    <div>
                      <p className="px-1 pb-1.5 text-[11px] text-muted-foreground">
                        Behind the player
                      </p>
                      <Segmented
                        label="Player background"
                        value={playerBg}
                        onChange={(v) => update({ playerBg: v })}
                        options={[
                          { value: "black" as PlayerBg, label: "Black" },
                          { value: "banner" as PlayerBg, label: "Banner" },
                          { value: "poster" as PlayerBg, label: "Poster" },
                          { value: "mix" as PlayerBg, label: "Blurred" },
                        ]}
                      />
                    </div>
                    {playerBg !== "black" && (
                      <div className="rounded-xl bg-surface-2/50 px-3 py-3">
                        <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                          <span>Blur amount</span>
                          <span className="tabular-nums text-foreground">
                            {playerBlur}px
                          </span>
                        </div>
                        <Slider
                          aria-label="Blur amount"
                          min={0}
                          max={MAX_PLAYER_BLUR}
                          step={1}
                          value={[playerBlur]}
                          onValueChange={([v]) => update({ playerBlur: v })}
                        />
                      </div>
                    )}
                    <div>
                      <p className="px-1 pb-1.5 text-[11px] text-muted-foreground">
                        Behind the details page
                      </p>
                      <Segmented
                        label="Details page background"
                        value={detailsBg}
                        onChange={(v) => update({ detailsBg: v })}
                        options={[
                          { value: "banner" as DetailsBg, label: "Banner" },
                          { value: "poster" as DetailsBg, label: "Poster" },
                          { value: "black" as DetailsBg, label: "Black" },
                        ]}
                      />
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}

        {tab === "look" && (
          <div className="mt-2 space-y-2">
            <Section title="Whole site">
              <div>
                <p className="px-1 pb-1.5 text-[11px] text-muted-foreground">Corner style</p>
                <Segmented
                  label="Corner style"
                  value={cornerStyle}
                  onChange={(v) => update({ cornerStyle: v })}
                  options={[
                    { value: "sharp" as const, label: "Sharper" },
                    { value: "normal" as const, label: "Normal" },
                    { value: "round" as const, label: "Rounder" },
                  ]}
                />
              </div>
              <div>
                <p className="px-1 pb-1.5 text-[11px] text-muted-foreground">Text size</p>
                <Segmented
                  label="Text size"
                  value={textSize}
                  onChange={(v) => update({ textSize: v })}
                  options={[
                    { value: "small" as const, label: "Small" },
                    { value: "normal" as const, label: "Normal" },
                    { value: "large" as const, label: "Large" },
                  ]}
                />
              </div>
              <ToggleRow label="Reduce motion" hint="No hover lifts, slides or fades." checked={reduceMotion} onChange={(v) => update({ reduceMotion: v })} />
              <ToggleRow label="High contrast" hint="Stronger borders and brighter small text." checked={highContrast} onChange={(v) => update({ highContrast: v })} />
            </Section>
          </div>
        )}

        {tab === "player" && (
          <div className="mt-3 space-y-2 rounded-xl border border-border/70 bg-surface/45 p-2">
            <div className="flex items-center justify-between px-1">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Watch page
              </p>
              <button
                type="button"
                onClick={() => update({ ...PLAYER_DEFAULTS })}
                disabled={!playerChanged}
                className="text-[11px] font-semibold text-muted-foreground underline-offset-2 transition hover:text-foreground hover:underline disabled:opacity-40 disabled:no-underline"
              >
                Reset
              </button>
            </div>
            <ToggleRow
              label="Auto-next"
              hint="When an episode ends, the next one starts by itself. It works with players that tell us when the video ends."
              checked={prefs.autoNext}
              onChange={(v) => setPrefs({ autoNext: v })}
            />
            <ToggleRow
              label="Auto-play"
              hint="An episode starts playing as soon as it opens."
              checked={autoPlay}
              onChange={(v) => update({ autoPlay: v })}
            />
            <div>
              <p className="px-1 pb-1.5 text-[11px] text-muted-foreground">Default audio</p>
              <Segmented
                label="Default audio"
                value={prefs.lang}
                onChange={(v) => setPrefs({ lang: v })}
                options={[
                  { value: "sub" as const, label: "Sub" },
                  { value: "dub" as const, label: "Dub" },
                ]}
              />
            </div>
            <ToggleRow
              label="Fill the frame"
              hint="Crops the thin black edge some players draw around the picture."
              checked={fillFrame}
              onChange={(v) => update({ fillFrame: v })}
            />
            <div>
              <p className="px-1 pb-1.5 text-[11px] text-muted-foreground">
                Layout
              </p>
              <Segmented
                label="Player layout"
                value={playerLayout}
                onChange={(v) => update({ playerLayout: v })}
                options={[
                  { value: "side" as PlayerLayout, label: "Episodes beside" },
                  { value: "theater" as PlayerLayout, label: "Theater" },
                ]}
              />
            </div>
            {playerLayout === "side" && (
              <div>
                <p className="px-1 pb-1.5 text-[11px] text-muted-foreground">
                  Episode list on the
                </p>
                <Segmented
                  label="Episode list side"
                  value={playerSide}
                  onChange={(v) => update({ playerSide: v })}
                  options={[
                    { value: "right" as PlayerSide, label: "Right" },
                    { value: "left" as PlayerSide, label: "Left" },
                  ]}
                />
              </div>
            )}
            <div>
              <p className="px-1 pb-1.5 text-[11px] text-muted-foreground">
                Corners
              </p>
              <Segmented
                label="Player corners"
                value={playerCorners}
                onChange={(v) => update({ playerCorners: v })}
                options={[
                  { value: "rounded" as PlayerCorners, label: "Rounded" },
                  { value: "square" as PlayerCorners, label: "Square" },
                ]}
              />
            </div>
            <ToggleRow
              label="Soft glow around the player"
              hint=""
              checked={playerGlow}
              onChange={(v) => update({ playerGlow: v })}
            />

          </div>
        )}

        {tab === "phone" && (
          <div className="mt-3 space-y-2">
            <p className="px-1 text-[11px] text-muted-foreground">These options only change how the player looks on a phone.</p>
            <div className="space-y-2 border-t border-border/60 pt-2.5">
              
              <div>
                <p className="px-1 pb-1.5 text-[11px] text-muted-foreground">
                  Player style
                </p>
                <Segmented
                  label="Phone player style"
                  value={phoneStyle}
                  onChange={(v) => update({ phoneStyle: v })}
                  options={[
                    {
                      value: "full" as PhoneStyle,
                      label: "Full width (default)",
                    },
                    { value: "card" as PhoneStyle, label: "Rounded card" },
                  ]}
                />
              </div>
              <ToggleRow
                label="Keep the player on top"
                hint="The video stays at the top of the screen while you scroll the episodes."
                checked={phoneSticky}
                onChange={(v) => update({ phoneSticky: v })}
              />
              <ToggleRow
                label="Scaled to fit"
                hint="Some players have cramped buttons on a small screen. This shows them at a normal width, scaled down."
                checked={phoneScaled}
                onChange={(v) => update({ phoneScaled: v })}
              />
            </div>
          </div>
        )}

        {tab === "titles" && (
          <div className="mt-3 space-y-3">
            <Section title="Title language">
              <Segmented
                label="Title language"
                value={titleLang}
                onChange={(v) => update({ titleLang: v })}
                options={[
                  { value: "english" as const, label: "English" },
                  { value: "romaji" as const, label: "Romaji" },
                  { value: "native" as const, label: "Native" },
                ]}
              />
              <p className="px-1 text-[11px] text-muted-foreground">Used on cards, the details page, the watch page and search. Reload a page to see it everywhere.</p>
            </Section>
            <Section title="Date format">
              <Segmented
                label="Date format"
                value={dateFormat}
                onChange={(v) => update({ dateFormat: v })}
                options={[
                  { value: "short" as const, label: "Apr 07, 2013" },
                  { value: "day" as const, label: "07 Apr 2013" },
                  { value: "iso" as const, label: "2013-04-07" },
                ]}
              />
            </Section>
          </div>
        )}

        {tab === "privacy" && (
          <div className="mt-3 space-y-3">
            <Section title="Watch history">
              <ToggleRow
                label="Save my watch history"
                hint="Off: nothing new is added to Continue watching. What is saved stays."
                checked={!historyPaused}
                onChange={(v) => setHistoryPaused(!v)}
              />
              <button
                type="button"
                onClick={() => {
                  if (window.confirm("Clear everything in Continue watching on this device?")) {
                    clearProgress();
                    toast.success("Watch history cleared.");
                  }
                }}
                className="h-10 w-full rounded-lg border border-border text-sm font-semibold hover:bg-surface-2"
              >
                Clear watch history
              </button>
            </Section>
          </div>
        )}

        {tab === "backup" && (
          <div className="mt-3 space-y-3">
            <Section title="Settings backup">
              <p className="px-1 text-[11px] text-muted-foreground">Move your choices to another device: export a small file, import it there.</p>
              <button
                type="button"
                onClick={() => {
                  const data: Record<string, string> = {};
                  for (const k of BACKUP_KEYS) {
                    const v = window.localStorage.getItem(k);
                    if (v !== null) data[k] = v;
                  }
                  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "tyshi-settings.json";
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="h-10 w-full rounded-lg border border-border text-sm font-semibold hover:bg-surface-2"
              >
                Export my settings
              </button>
              <label className="grid h-10 w-full cursor-pointer place-items-center rounded-lg border border-border text-sm font-semibold hover:bg-surface-2">
                Import settings
                <input
                  type="file"
                  accept="application/json"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    void file.text().then((text) => {
                      try {
                        const data = JSON.parse(text) as Record<string, unknown>;
                        let count = 0;
                        for (const k of BACKUP_KEYS) {
                          if (typeof data[k] === "string") {
                            window.localStorage.setItem(k, data[k] as string);
                            count += 1;
                          }
                        }
                        if (!count) throw new Error("empty");
                        toast.success("Settings imported. Reloading…");
                        window.setTimeout(() => window.location.reload(), 600);
                      } catch {
                        toast.error("That file isn't a settings backup.");
                      }
                    });
                  }}
                />
              </label>
            </Section>
            <Section title="Reset">
              <button
                type="button"
                onClick={() => {
                  if (window.confirm("Put every setting back to its default?")) {
                    update({ ...PLAYER_DEFAULTS, ...SITE_DEFAULTS, playerBg: "black", detailsBg: "banner", blackEverywhere: true, playerBlur: 30 });
                    setPrefs({ autoNext: true, lang: "sub" });
                    toast.success("All settings reset.");
                  }
                }}
                className="h-10 w-full rounded-lg border border-border text-sm font-semibold text-destructive hover:bg-surface-2"
              >
                Reset all settings
              </button>
            </Section>
          </div>
        )}

        {tab === "protect" && (
          <div className="mt-3 space-y-3">
            <Section title="Playback protection">
              <ToggleRow
                label="Ad shield"
                hint="Stops invisible ad layers from opening a new tab. Turn it off if a player cannot run."
                checked={adShield}
                onChange={(v) => applyShield({ adShield: v })}
              />
              <ToggleRow
                label="Fresh player every time"
                hint="Reloads a clean player when you switch Sub, Dub or server. Supported in Chrome and Brave."
                checked={freshPlayer}
                onChange={(v) => applyShield({ freshPlayer: v })}
              />
              <ToggleRow
                label="Use the other aniembed address"
                hint="Switches between aniembed.ac and aniembed.se if Sub or Dub is stuck."
                checked={altHost}
                onChange={(v) => applyShield({ altHost: v })}
              />
            </Section>
            <p className="px-1 text-[11px] leading-snug text-muted-foreground">
              {supported === null
                ? ""
                : supported
                  ? "This browser can start the player clean. "
                  : "This browser can't start the player clean, so Fresh player does nothing here. "}
              Changing one of these restarts the watch page. Banner ads drawn
              inside a player can't be removed from outside it.
            </p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border/70 bg-surface/45 p-2.5">
      <h3 className="mb-2.5 text-xs font-bold uppercase tracking-widest text-muted-foreground">
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left transition hover:bg-surface-2/60"
    >
      <span>
        <span className="block text-sm font-semibold">{label}</span>
        {hint && (
          <span className="block text-[11px] leading-snug text-muted-foreground">
            {hint}
          </span>
        )}
      </span>
      <span
        aria-hidden
        className={cn(
          "relative h-6 w-10 shrink-0 rounded-full transition",
          checked ? "bg-primary" : "bg-surface-2",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-5 rounded-full bg-white transition-all",
            checked ? "left-[18px]" : "left-0.5",
          )}
        />
      </span>
    </button>
  );
}

function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      style={{
        gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
      }}
      className="grid gap-1 rounded-xl border border-border bg-surface/60 p-1"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-9 rounded-lg px-1 text-xs font-semibold transition",
            o.value === value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
