import { firebaseConfigured, getDb } from "@/lib/firebase";
import { applyAppearanceDefaults, type DetailsBg, type PlayerBg } from "@/hooks/use-appearance";
import { applyThemeId, isThemeId, type ThemeId } from "@/hooks/use-theme";

/**
 * The site's default look, set by the admin (Firebase: siteConfig/appearance).
 * One small document: theme colour, "full black", behind the player, behind the details page,
 * and `version` (the time of the last save).
 */
export type SiteAppearance = {
  theme: ThemeId;
  blackEverywhere: boolean;
  playerBg: PlayerBg;
  detailsBg: DetailsBg;
  version: number;
};

/** The built-in default (what "Back to built-in default" saves). */
export const BUILT_IN_APPEARANCE: Omit<SiteAppearance, "version"> = {
  theme: "mono",
  blackEverywhere: true,
  playerBg: "black",
  detailsBg: "banner",
};

const CACHE_KEY = "tyshi-site-appearance-v1"; // last admin value, kept on this device
const APPLIED_KEY = "tyshi-site-appearance-applied"; // the version already applied here

/** Turns anything read from Firebase or the device into a safe value (or null). */
function clean(raw: unknown): SiteAppearance | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const version = Number(r.version);
  if (!Number.isFinite(version) || version <= 0) return null;
  return {
    theme: isThemeId(r.theme) ? r.theme : BUILT_IN_APPEARANCE.theme,
    blackEverywhere: r.blackEverywhere !== false,
    playerBg: r.playerBg === "banner" || r.playerBg === "mix" || r.playerBg === "poster" ? r.playerBg : "black",
    detailsBg: r.detailsBg === "poster" || r.detailsBg === "black" ? r.detailsBg : "banner",
    version,
  };
}

/** Admin: read the saved default. */
export async function readSiteAppearance(): Promise<SiteAppearance | null> {
  if (!firebaseConfigured) return null;
  const [{ doc, getDoc }, db] = await Promise.all([import("firebase/firestore"), getDb()]);
  const snapshot = await getDoc(doc(db, "siteConfig", "appearance"));
  return clean(snapshot.data());
}

/** Admin: save the default. The version is the save time, so visitors know it changed. */
export async function saveSiteAppearance(value: Omit<SiteAppearance, "version">): Promise<SiteAppearance> {
  if (!firebaseConfigured) throw new Error("Firebase isn't configured for this site yet.");
  const [{ doc, setDoc }, db] = await Promise.all([import("firebase/firestore"), getDb()]);
  const saved: SiteAppearance = { ...value, version: Date.now() };
  await setDoc(doc(db, "siteConfig", "appearance"), saved);
  return saved;
}

/** Put an admin value on this device (theme + background choices) and remember its version. */
function applyHere(value: SiteAppearance) {
  applyThemeId(value.theme);
  applyAppearanceDefaults({
    blackEverywhere: value.blackEverywhere,
    playerBg: value.playerBg,
    detailsBg: value.detailsBg,
  });
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(value));
    window.localStorage.setItem(APPLIED_KEY, String(value.version));
  } catch {
    /* a blocked store only means it is applied again next visit */
  }
}

/**
 * Once per visit: read the one small document. If its version is newer than the one already
 * applied on this device, apply it once. After that the visitor's own Settings choices stay
 * until the admin saves again.
 */
export async function syncSiteAppearance() {
  try {
    const remote = await readSiteAppearance();
    if (!remote) return;
    let applied = 0;
    try {
      applied = Number(window.localStorage.getItem(APPLIED_KEY)) || 0;
    } catch {
      /* treat as never applied */
    }
    if (remote.version > applied) applyHere(remote);
  } catch {
    /* offline or blocked: the visitor keeps what is on the device */
  }
}

/** Admin pressed Save: apply it on this device straight away too. */
export function applySiteAppearanceNow(value: SiteAppearance) {
  applyHere(value);
}
