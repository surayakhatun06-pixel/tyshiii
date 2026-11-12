import { useSyncExternalStore } from "react";

import { checkIsAdmin } from "@/lib/cloud-episodes";
import { firebaseConfigured, getAuthClient } from "@/lib/firebase";

/**
 * Is the person looking at the site the signed-in admin?
 *
 * Nothing admin shows for visitors. Someone who opens /admin and signs in is remembered as an admin in this
 * browser, and from then on the admin buttons appear on every series page. Visitors never load the sign-in
 * code at all (it is only checked when this browser has signed in as admin before), so the public site stays fast.
 * The real protection is still the Firestore rules; this only decides what is drawn.
 */
const HINT_KEY = "tyshi-admin-hint";
let admin = false;
let started = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function set(next: boolean) {
  if (next === admin) return;
  admin = next;
  emit();
}

/** Called by the /admin sign-in screen. */
export function rememberAdmin(isAdmin: boolean) {
  try {
    if (isAdmin) window.localStorage.setItem(HINT_KEY, "1");
    else window.localStorage.removeItem(HINT_KEY);
  } catch {
    /* not remembered */
  }
  set(isAdmin);
}

function start() {
  if (started || typeof window === "undefined" || !firebaseConfigured) return;
  let hinted = false;
  try {
    hinted = window.localStorage.getItem(HINT_KEY) === "1";
  } catch {
    /* ignore */
  }
  if (!hinted) return;
  started = true;
  Promise.all([import("firebase/auth"), getAuthClient()])
    .then(([{ onAuthStateChanged }, auth]) => {
      onAuthStateChanged(auth, async (user) => {
        if (!user) return rememberAdmin(false);
        try {
          rememberAdmin(await checkIsAdmin(user.uid));
        } catch {
          /* offline: keep what we know */
        }
      });
    })
    .catch(() => undefined);
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  start();
  return () => void listeners.delete(cb);
}

export function useIsAdmin(): boolean {
  return useSyncExternalStore(subscribe, () => admin, () => false);
}
