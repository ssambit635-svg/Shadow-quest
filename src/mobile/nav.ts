/**
 * nav.ts — the phone face's own sub-navigation.
 *
 * The app shell keeps its five top-level hash routes untouched. The phone
 * face needs more destinations than the desktop has (Progress, Rewards,
 * Profile, Squad), so it hangs them *under* `#/app/…`. The shell's
 * `readHash()` only matches exact strings, so every one of those still reads
 * as the `app` route — meaning the desktop is unaffected if someone opens
 * `#/app/progress` on a laptop: it simply shows the dashboard.
 *
 * `#/app/tasks` etc. are therefore owned by the phone face, and the phone
 * face listens to `hashchange` itself rather than asking the shell.
 */

export type MobileTab =
  | "home"
  | "tasks"
  | "progress"
  | "rewards"
  | "profile"
  | "squad"
  | "stats";

export const MOBILE_TABS: {
  id: MobileTab;
  label: string;
  ja: string;
  href: string;
}[] = [
  { id: "home", label: "Home", ja: "今", href: "#/app" },
  { id: "tasks", label: "Tasks", ja: "課", href: "#/app/tasks" },
  { id: "progress", label: "Progress", ja: "成", href: "#/app/progress" },
  { id: "rewards", label: "Rewards", ja: "褒", href: "#/app/rewards" },
  { id: "profile", label: "Profile", ja: "我", href: "#/app/profile" },
  { id: "stats", label: "Stats", ja: "統", href: "#/app/stats" },
];

/**
 * The five docked destinations, spelled out rather than derived from
 * MOBILE_TABS: Squad and Stats are destinations but not dock tabs (they are
 * reached from Home and Profile), and the dock's icon set is keyed on
 * exactly this list.
 */
export type DockTab = "home" | "tasks" | "progress" | "rewards" | "profile";

const DOCK_IDS: DockTab[] = ["home", "tasks", "progress", "rewards", "profile"];

export const DOCK_TABS: { id: DockTab; label: string; ja: string; href: string }[] =
  MOBILE_TABS.filter((t): t is (typeof MOBILE_TABS)[number] & { id: DockTab } =>
    DOCK_IDS.includes(t.id as DockTab),
  ) as { id: DockTab; label: string; ja: string; href: string }[];

const ROUTE_OF: Record<string, MobileTab> = {
  "": "home",
  app: "home",
  "app/today": "home",
  "app/tasks": "tasks",
  "app/progress": "progress",
  "app/rewards": "rewards",
  "app/profile": "profile",
  "app/squad": "squad",
  "app/stats": "stats",
};

/** Anything unrecognised under #/app reads as Home — never a blank screen. */
export function tabFromHash(hash: string = window.location.hash): MobileTab {
  const h = hash.replace(/^#\/?/, "").replace(/\/+$/, "");
  return ROUTE_OF[h] ?? "home";
}

export function hrefForTab(tab: MobileTab): string {
  return MOBILE_TABS.find((t) => t.id === tab)?.href ?? "#/app";
}

/**
 * Navigate. Setting the hash is enough when it differs: the shell's own
 * `hashchange` listener reads the same value back as `app` and stays put,
 * while our listener picks up the new tab. Assigning an identical hash fires
 * no event at all, so that case has to be pushed by hand.
 */
export function goToTab(tab: MobileTab): void {
  const href = hrefForTab(tab);
  if (window.location.hash === href) {
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } else {
    window.location.hash = href;
  }
}
