import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { User } from "firebase/auth";
import {
  Copy,
  Loader2,
  LockKeyhole,
  LogOut,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import { rememberAdmin } from "@/hooks/use-is-admin";
import { checkIsAdmin } from "@/lib/cloud-episodes";
import {
  describeFirebaseError,
  firebaseConfigured,
  getAuthClient,
} from "@/lib/firebase";

const input =
  "h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none transition placeholder:text-muted-foreground/60 focus:border-primary";

type State =
  | { kind: "loading" }
  | { kind: "signed-out" }
  | { kind: "checking"; user: User }
  | { kind: "not-admin"; user: User }
  | { kind: "admin"; user: User }
  | { kind: "error"; message: string; user?: User };

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto mt-10 max-w-md rounded-2xl border border-border bg-surface/40 p-6">
      {children}
    </div>
  );
}

async function signOut() {
  const [{ signOut }, auth] = await Promise.all([
    import("firebase/auth"),
    getAuthClient(),
  ]);
  await signOut(auth);
}

/**
 * Renders `children` only for signed-in Firebase users that have a document in
 * `admins/{uid}`. The real protection is the Firestore rules; this only hides the UI.
 */
export function AdminGate({
  children,
}: {
  children: (user: User) => ReactNode;
}) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!firebaseConfigured) return;
    let stop: (() => void) | undefined;
    let cancelled = false;
    Promise.all([import("firebase/auth"), getAuthClient()])
      .then(([{ onAuthStateChanged }, auth]) => {
        if (cancelled) return;
        stop = onAuthStateChanged(auth, async (user) => {
          if (!user) {
            rememberAdmin(false);
            return setState({ kind: "signed-out" });
          }
          setState({ kind: "checking", user });
          try {
            const ok = await checkIsAdmin(user.uid);
            rememberAdmin(ok);
            setState({ kind: ok ? "admin" : "not-admin", user });
          } catch (error) {
            setState({
              kind: "error",
              message: describeFirebaseError(error),
              user,
            });
          }
        });
      })
      .catch((error) =>
        setState({ kind: "error", message: describeFirebaseError(error) }),
      );
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [attempt]);

  if (!firebaseConfigured) {
    return (
      <Card>
        <TriangleAlert className="size-8 text-gold" />
        <h1 className="mt-3 text-xl font-semibold">
          Firebase isn't connected yet
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Add the{" "}
          <code className="rounded bg-surface-2 px-1">VITE_FIREBASE_*</code>{" "}
          environment variables (see{" "}
          <code className="rounded bg-surface-2 px-1">FIREBASE_SETUP.md</code>)
          in Netlify, then redeploy once. After that, content updates never need
          a redeploy.
        </p>
      </Card>
    );
  }

  if (state.kind === "loading" || state.kind === "checking") {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        {state.kind === "loading" ? "Loading…" : "Checking admin access…"}
      </div>
    );
  }

  if (state.kind === "signed-out") return <SignInForm />;

  if (state.kind === "error") {
    return (
      <Card>
        <TriangleAlert className="size-8 text-destructive" />
        <h1 className="mt-3 text-xl font-semibold">
          Couldn't check admin access
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{state.message}</p>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={() => setAttempt((a) => a + 1)}
            className="h-10 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground"
          >
            Try again
          </button>
          {state.user && (
            <button
              type="button"
              onClick={() => signOut()}
              className="h-10 rounded-full border border-border px-5 text-sm"
            >
              Sign out
            </button>
          )}
        </div>
      </Card>
    );
  }

  if (state.kind === "not-admin") {
    return (
      <Card>
        <LockKeyhole className="size-8 text-gold" />
        <h1 className="mt-3 text-xl font-semibold">
          This account isn't an admin
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Signed in as {state.user.email}. To grant access, open Firebase
          console → Firestore → create a document in the{" "}
          <code className="rounded bg-surface-2 px-1">admins</code> collection
          whose <strong>Document ID</strong> is this user ID:
        </p>
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-surface px-3 py-2">
          <code className="min-w-0 flex-1 truncate text-xs">
            {state.user.uid}
          </code>
          <button
            type="button"
            aria-label="Copy user ID"
            onClick={() =>
              navigator.clipboard
                .writeText(state.user.uid)
                .then(() => toast.success("User ID copied."))
                .catch(() =>
                  toast.error(
                    "Couldn't copy. Select the ID and copy it by hand.",
                  ),
                )
            }
            className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:text-foreground"
          >
            <Copy className="size-4" />
          </button>
        </div>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={() => setAttempt((a) => a + 1)}
            className="h-10 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground"
          >
            I've added it — check again
          </button>
          <button
            type="button"
            onClick={() => signOut()}
            className="h-10 rounded-full border border-border px-5 text-sm"
          >
            Sign out
          </button>
        </div>
      </Card>
    );
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-end gap-3 text-xs text-muted-foreground">
        Signed in as {state.user.email}
        <button
          type="button"
          onClick={() =>
            signOut().catch((e) => toast.error(describeFirebaseError(e)))
          }
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3 transition hover:border-primary/60 hover:text-foreground"
        >
          <LogOut className="size-3.5" />
          Sign out
        </button>
      </div>
      {children(state.user)}
    </>
  );
}

function SignInForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const [{ signInWithEmailAndPassword }, auth] = await Promise.all([
        import("firebase/auth"),
        getAuthClient(),
      ]);
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      setError(describeFirebaseError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <LockKeyhole className="size-8 text-primary" />
      <h1 className="mt-3 text-xl font-semibold">Admin sign in</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Use the email and password of the admin user you created in Firebase
        Authentication.
      </p>
      <form onSubmit={submit} className="mt-5 space-y-3">
        <input
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          aria-label="Email"
          className={input}
        />
        <input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          aria-label="Password"
          className={input}
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-60"
        >
          {busy && <Loader2 className="size-4 animate-spin" />}
          Sign in
        </button>
      </form>
    </Card>
  );
}
