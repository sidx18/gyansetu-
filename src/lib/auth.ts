import { useEffect, useState } from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db, firebaseReady } from "./firebase";

export type AppRole = "teacher" | "student";

export type UserProfile = {
  uid: string;
  role: AppRole;
  name: string;
  email: string;
};

const profileCachePrefix = "gyansetu-profile:";
const pendingRoleKey = "gyansetu-pending-role";
const profileCacheMaxAgeMs = 1000 * 60 * 60 * 12;

type CachedProfile = UserProfile & { cachedAt: number };

function getPrimaryStorage() {
  try {
    return window.sessionStorage;
  } catch {
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  }
}

function removeStoredItem(key: string) {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Ignore storage failures on restricted devices.
  }

  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage failures on restricted devices.
  }
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 80);
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function isLikelyEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function buildFallbackProfile(user: User, role: AppRole = "student"): UserProfile {
  return {
    uid: user.uid,
    role,
    name: user.displayName || user.email?.split("@")[0] || "User",
    email: user.email || "",
  };
}

export function getCachedProfile(uid: string) {
  try {
    const raw = getPrimaryStorage()?.getItem(`${profileCachePrefix}${uid}`);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as CachedProfile;
    if (!parsed.cachedAt || Date.now() - parsed.cachedAt > profileCacheMaxAgeMs) {
      removeStoredItem(`${profileCachePrefix}${uid}`);
      return null;
    }

    return {
      uid: parsed.uid,
      role: parsed.role,
      name: parsed.name,
      email: parsed.email,
    } satisfies UserProfile;
  } catch {
    return null;
  }
}

export function cacheProfile(profile: UserProfile) {
  try {
    getPrimaryStorage()?.setItem(
      `${profileCachePrefix}${profile.uid}`,
      JSON.stringify({
        ...profile,
        cachedAt: Date.now(),
      } satisfies CachedProfile),
    );
  } catch {
    // Ignore storage failures on restricted devices.
  }
}

export function setPendingAuthRole(role: AppRole | null) {
  try {
    if (!role) {
      removeStoredItem(pendingRoleKey);
      return;
    }

    getPrimaryStorage()?.setItem(pendingRoleKey, role);
  } catch {
    // Ignore storage failures on restricted devices.
  }
}

function getPendingAuthRole(): AppRole | null {
  try {
    const role = getPrimaryStorage()?.getItem(pendingRoleKey);
    return role === "teacher" || role === "student" ? role : null;
  } catch {
    return null;
  }
}

type AuthSnapshot = {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
};

export function useAuthState(): AuthSnapshot {
  const [state, setState] = useState<AuthSnapshot>({
    user: null,
    profile: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!firebaseReady || !auth || !db) {
      setState({
        user: null,
        profile: null,
        loading: false,
        error: "Firebase auth is not configured.",
      });
      return;
    }

    const firestore = db;
    return onAuthStateChanged(auth, async (nextUser) => {
      if (!nextUser) {
        setPendingAuthRole(null);
        setState({ user: null, profile: null, loading: false, error: null });
        return;
      }

      const hintedRole = getPendingAuthRole();
      const cachedProfile = getCachedProfile(nextUser.uid);
      if (cachedProfile) {
        setState({ user: nextUser, profile: cachedProfile, loading: false, error: null });
      } else {
        // Avoid showing the wrong workspace while the canonical Firestore profile is still loading.
        setState({ user: nextUser, profile: null, loading: true, error: null });
      }

      try {
        const snapshot = await getDoc(doc(firestore, "users", nextUser.uid));
        const profile = snapshot.exists()
          ? ({ uid: nextUser.uid, ...snapshot.data() } as UserProfile)
          : buildFallbackProfile(nextUser, hintedRole ?? "student");

        if (!snapshot.exists()) {
          void setDoc(
            doc(firestore, "users", nextUser.uid),
            {
              role: profile.role,
              name: profile.name,
              email: profile.email,
              updatedAt: serverTimestamp(),
            },
            { merge: true },
          );
        }

        cacheProfile(profile);
        setPendingAuthRole(null);
        setState({ user: nextUser, profile, loading: false, error: null });
      } catch (error) {
        const profile = buildFallbackProfile(nextUser, hintedRole ?? "student");
        const message = error instanceof Error ? error.message : "Could not load user profile.";
        console.warn("Falling back to basic user profile after profile load failed.", error);
        cacheProfile(profile);
        setPendingAuthRole(null);
        setState({ user: nextUser, profile, loading: false, error: message });
      }
    });
  }, []);

  return state;
}

export async function registerWithEmail(input: {
  name: string;
  email: string;
  password: string;
  role: AppRole;
}) {
  if (!firebaseReady || !auth || !db) {
    return { ok: false, error: "Firebase auth is not configured." };
  }

  try {
    const safeName = normalizeName(input.name);
    const safeEmail = normalizeEmail(input.email);
    if (!safeName) {
      return { ok: false, error: "Enter a valid name." };
    }
    if (!isLikelyEmail(safeEmail)) {
      return { ok: false, error: "Enter a valid email address." };
    }
    if (input.password.length < 6) {
      return { ok: false, error: "Password must be at least 6 characters." };
    }

    setPendingAuthRole(input.role);
    const firestore = db;
    const credential = await createUserWithEmailAndPassword(auth, safeEmail, input.password);
    await updateProfile(credential.user, { displayName: safeName });
    await setDoc(doc(firestore, "users", credential.user.uid), {
      role: input.role,
      name: safeName,
      email: safeEmail,
      createdAt: serverTimestamp(),
    });
    cacheProfile({
      uid: credential.user.uid,
      role: input.role,
      name: safeName,
      email: safeEmail,
    });
    return { ok: true };
  } catch (error) {
    setPendingAuthRole(null);
    return { ok: false, error: error instanceof Error ? error.message : "Could not create account." };
  }
}

export async function loginWithEmail(input: { email: string; password: string }) {
  if (!firebaseReady || !auth) {
    return { ok: false, error: "Firebase auth is not configured." };
  }

  try {
    const safeEmail = normalizeEmail(input.email);
    if (!isLikelyEmail(safeEmail)) {
      return { ok: false, error: "Enter a valid email address." };
    }
    if (!input.password) {
      return { ok: false, error: "Enter your password." };
    }

    await signInWithEmailAndPassword(auth, safeEmail, input.password);
    return { ok: true };
  } catch (error) {
    setPendingAuthRole(null);
    return { ok: false, error: error instanceof Error ? error.message : "Could not sign in." };
  }
}

export async function logoutUser() {
  if (!firebaseReady || !auth) {
    return;
  }

  await signOut(auth);
}
