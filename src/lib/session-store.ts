import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";
import { db, auth, firebaseReady } from "./firebase";
import { defaultSessionData, defaultSessionMeta } from "../data/mock";
import type { AppRole } from "./auth";
import type {
  AppNotification,
  ClassroomSessionData,
  PulsePoint,
  Question,
  SessionArchive,
  SessionMeta,
  SilentRequest,
  SlowDownSignal,
  StudentSignal,
} from "../types";

const defaultSessionId = import.meta.env.VITE_FIREBASE_SESSION_ID || "demo-session";
const slowDownThreshold = Number(import.meta.env.VITE_SLOWDOWN_THRESHOLD || 3);
const enableAnonymousAuth = import.meta.env.VITE_ENABLE_FIREBASE_ANON_AUTH === "true";
const limits = {
  sessionCode: 24,
  sessionTitle: 120,
  courseLabel: 80,
  comprehension: 240,
  moderationLabel: 40,
  moderationDetail: 160,
  questionTopic: 80,
  questionText: 500,
  displayName: 80,
  requestNote: 240,
  notificationTitle: 120,
  notificationBody: 320,
  actionLabel: 40,
  actionUrl: 320,
};

const signalOrder = new Map([
  ["following clearly", 0],
  ["need one more example", 1],
  ["lost at current step", 2],
]);

const requestOrder = new Map([
  ["bathroom", 0],
  ["urgent question", 1],
  ["hand raise", 2],
]);

function sortByTime<T extends { createdAt?: { seconds?: number }; time?: string; date?: string }>(items: T[]) {
  return [...items].sort((left, right) => {
    const leftStamp = left.createdAt?.seconds ?? 0;
    const rightStamp = right.createdAt?.seconds ?? 0;
    if (leftStamp !== rightStamp) {
      return rightStamp - leftStamp;
    }
    return `${right.date ?? ""}${right.time ?? ""}`.localeCompare(`${left.date ?? ""}${left.time ?? ""}`);
  });
}

function sanitizeInlineText(value: string | undefined, max: number) {
  return (value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}

function sanitizeMultilineText(value: string | undefined, max: number) {
  return (value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

function sanitizeHttpUrl(value: string | undefined) {
  const candidate = (value ?? "").trim();
  if (!candidate) {
    return "";
  }

  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "";
    }
    return url.toString().slice(0, limits.actionUrl);
  } catch {
    return "";
  }
}

function sanitizeSessionMeta(input?: Partial<SessionMeta>) {
  return {
    title: sanitizeInlineText(input?.title, limits.sessionTitle) || defaultSessionMeta.title,
    courseLabel: sanitizeInlineText(input?.courseLabel, limits.courseLabel) || defaultSessionMeta.courseLabel,
    sessionCode: sanitizeInlineText(input?.sessionCode, limits.sessionCode).toUpperCase() || defaultSessionMeta.sessionCode,
    joinUrl: sanitizeHttpUrl(input?.joinUrl) || defaultSessionMeta.joinUrl,
    currentComprehension:
      sanitizeMultilineText(input?.currentComprehension, limits.comprehension) || defaultSessionMeta.currentComprehension,
    moderationLabel:
      sanitizeInlineText(input?.moderationLabel, limits.moderationLabel) || defaultSessionMeta.moderationLabel,
    moderationDetail:
      sanitizeInlineText(input?.moderationDetail, limits.moderationDetail) || defaultSessionMeta.moderationDetail,
    updatedLabel: sanitizeInlineText(input?.updatedLabel, 60) || defaultSessionMeta.updatedLabel,
  } satisfies SessionMeta;
}

function parseMeta(raw?: Partial<SessionMeta>): SessionMeta {
  return sanitizeSessionMeta(raw);
}

export function buildSessionMetaPreview(raw?: Partial<SessionMeta>): SessionMeta {
  return parseMeta(raw);
}

export function buildEmptySessionData(raw?: Partial<SessionMeta>): ClassroomSessionData {
  return {
    meta: parseMeta(raw),
    pulseHistory: [],
    slowdownSignals: [],
    questions: [],
    requests: [],
    archives: [],
    studentSignals: [],
    notifications: [],
    source: "firebase",
  };
}

function computeUnderstanding(studentSignals: StudentSignal[], pulseHistory: PulsePoint[]) {
  if (studentSignals.length > 0) {
    const total = studentSignals.reduce((sum, signal) => sum + signal.count, 0);
    if (total > 0) {
      const weighted =
        studentSignals.reduce((sum, signal) => {
          const key = signal.label.toLowerCase();
          const weight =
            key === "following clearly" ? 1 : key === "need one more example" ? 0.55 : 0.15;
          return sum + signal.count * weight;
        }, 0) / total;
      return Math.round(weighted * 100);
    }
  }

  return pulseHistory[pulseHistory.length - 1]?.understanding ?? 72;
}

function computeMood(studentSignals: StudentSignal[], pulseHistory: PulsePoint[]) {
  const understanding = computeUnderstanding(studentSignals, pulseHistory);
  if (understanding >= 78) {
    return { label: "Calm", detail: "Comfortably following the explanation" };
  }
  if (understanding >= 60) {
    return { label: "Steady", detail: "Focused, mildly stretched" };
  }
  return { label: "Confused", detail: "Needs a reset before moving on" };
}

function collectionQuery(path: string, count = 12) {
  return query(collection(db!, path), orderBy("createdAt", "desc"), limit(count));
}

export function buildSessionIdFromCode(sessionCode: string) {
  return sessionCode.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

export function normalizeSessionCode(sessionCode: string) {
  return sanitizeInlineText(sessionCode, limits.sessionCode).toUpperCase();
}

export function useClassroomSession(
  activeSessionId = defaultSessionId,
  role?: AppRole,
  pendingMeta?: Partial<SessionMeta> | null,
) {
  const [data, setData] = useState<ClassroomSessionData>(defaultSessionData);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [liveConnected, setLiveConnected] = useState(false);

  useEffect(() => {
    if (!activeSessionId) {
      setData(defaultSessionData);
      setLiveConnected(false);
      setLiveError(null);
      return;
    }

    if (!firebaseReady || !db) {
      return;
    }

    setData(buildEmptySessionData(pendingMeta ?? { sessionCode: activeSessionId.toUpperCase() }));
    setLiveConnected(false);
    setLiveError(null);

    if (enableAnonymousAuth && auth && !auth.currentUser) {
      void signInAnonymously(auth).catch((error) => {
        console.warn("Anonymous auth failed.", error);
      });
    }

    const unsubscribers: Array<() => void> = [];

    const setPartial = (partial: Partial<ClassroomSessionData>) => {
      setData((current) => ({
        ...current,
        ...partial,
        meta: partial.meta ? parseMeta(partial.meta) : current.meta,
        source: "firebase",
      }));
    };

    try {
      if (role !== "teacher") {
        setPartial({
          pulseHistory: [],
          slowdownSignals: [],
          questions: [],
          requests: [],
          archives: [],
          studentSignals: [],
        });
      }

      unsubscribers.push(
        onSnapshot(
          doc(db, "sessions", activeSessionId),
          (snapshot) => {
            if (!snapshot.exists()) {
              return;
            }
            setLiveConnected(true);
            setLiveError(null);
            setPartial({ meta: parseMeta(snapshot.data() as Partial<SessionMeta>) });
          },
          (error) => setLiveError(error.message),
        ),
      );

      if (role === "teacher") {
        unsubscribers.push(
          onSnapshot(query(collection(db, "sessions", activeSessionId, "pulseHistory"), limit(12)), (snapshot) => {
            const items = snapshot.docs
              .map((item) => item.data() as PulsePoint & { order?: number })
              .sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
            if (items.length > 0) {
              setLiveConnected(true);
              setPartial({ pulseHistory: items });
            }
          }),
        );

        unsubscribers.push(
          onSnapshot(query(collection(db, "sessions", activeSessionId, "slowdownSignals"), limit(6)), (snapshot) => {
            const rawItems = snapshot.docs.map((item) => item.data()) as Array<
              SlowDownSignal & { createdAt?: { seconds?: number } }
            >;
            const items = sortByTime(rawItems).map(({ minute, count, thresholdHit }) => ({
              minute,
              count,
              thresholdHit,
            }));
            if (items.length > 0) {
              setLiveConnected(true);
              setPartial({ slowdownSignals: items.slice(0, 6) });
            }
          }),
        );

        unsubscribers.push(
          onSnapshot(collectionQuery(`sessions/${activeSessionId}/questions`), (snapshot) => {
            const items = snapshot.docs.map((item) => ({
              id: item.id,
              ...item.data(),
            })) as Array<Question & { createdAt?: { seconds?: number } }>;
            setLiveConnected(true);
            setPartial({ questions: sortByTime(items) });
          }),
        );

        unsubscribers.push(
          onSnapshot(collectionQuery(`sessions/${activeSessionId}/requests`), (snapshot) => {
            const items = snapshot.docs.map((item) => ({
              id: item.id,
              ...item.data(),
            })) as Array<SilentRequest & { createdAt?: { seconds?: number } }>;
            setLiveConnected(true);
            setPartial({ requests: sortByTime(items) });
          }),
        );

        unsubscribers.push(
          onSnapshot(collectionQuery(`sessions/${activeSessionId}/archives`), (snapshot) => {
            const items = snapshot.docs.map((item) => ({
              id: item.id,
              ...item.data(),
            })) as Array<SessionArchive & { createdAt?: { seconds?: number } }>;
            setLiveConnected(true);
            setPartial({ archives: sortByTime(items) });
          }),
        );

        unsubscribers.push(
          onSnapshot(collection(db, "sessions", activeSessionId, "studentSignals"), (snapshot) => {
            const items = snapshot.docs
              .map((item) => item.data() as StudentSignal & { order?: number })
              .sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
              .map(({ label, count }) => ({ label, count }));
            setLiveConnected(true);
            setPartial({ studentSignals: items });
          }),
        );
      }

      unsubscribers.push(
        onSnapshot(collectionQuery(`sessions/${activeSessionId}/notifications`), (snapshot) => {
          const items = snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          })) as Array<AppNotification & { createdAt?: { seconds?: number } }>;

          setLiveConnected(true);
          setPartial({
            notifications: sortByTime(items).map((item) => ({
              id: item.id,
              title: item.title,
              body: item.body,
              audience: item.audience,
              kind: item.kind,
              recipientUserId: item.recipientUserId,
              actionLabel: item.actionLabel,
              actionUrl: item.actionUrl,
              createdAtLabel:
                item.createdAt?.seconds != null
                  ? new Date(item.createdAt.seconds * 1000).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : item.createdAtLabel,
            })),
          });
        }),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not connect to Firestore.";
      setLiveError(message);
    }

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [activeSessionId, pendingMeta, role]);

  const mood = computeMood(data.studentSignals, data.pulseHistory);
  const understanding = computeUnderstanding(data.studentSignals, data.pulseHistory);

  return {
    sessionId: activeSessionId,
    data,
    liveError,
    liveConnected,
    understanding,
    mood,
  };
}

export async function submitStudentSignal(label: string, activeSessionId = defaultSessionId) {
  if (!db || !firebaseReady || !activeSessionId) {
    return false;
  }

  const signalRef = doc(db, "sessions", activeSessionId, "studentSignals", label.toLowerCase().replace(/\s+/g, "-"));
  await setDoc(
    signalRef,
    {
      label,
      count: increment(1),
      order: signalOrder.get(label.toLowerCase()) ?? 99,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  return true;
}

export async function submitSlowDownSignal(activeSessionId = defaultSessionId) {
  if (!db || !firebaseReady || !activeSessionId) {
    return false;
  }

  const now = new Date();
  const id = `${now.getFullYear()}${now.getMonth() + 1}${now.getDate()}-${now.getHours()}${now.getMinutes()}`;
  const minute = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  const signalRef = doc(db, "sessions", activeSessionId, "slowdownSignals", id);

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(signalRef);
    const count = (snapshot.data()?.count ?? 0) + 1;
    transaction.set(
      signalRef,
      {
        minute,
        count,
        thresholdHit: count >= slowDownThreshold,
        createdAt: serverTimestamp(),
      },
      { merge: true },
    );
  });

  return true;
}

export async function submitQuestion(
  input: { author?: string; authorId?: string; text: string; topic: string },
  activeSessionId = defaultSessionId,
) {
  if (!db || !firebaseReady || !activeSessionId) {
    return false;
  }

  const text = sanitizeMultilineText(input.text, limits.questionText);
  if (!text) {
    return false;
  }

  await addDoc(collection(db, "sessions", activeSessionId, "questions"), {
    author: sanitizeInlineText(input.author, limits.displayName) || "Anonymous",
    authorId: sanitizeInlineText(input.authorId, 128) || null,
    text,
    topic: sanitizeInlineText(input.topic, limits.questionTopic) || "General",
    votes: 0,
    verified: false,
    status: "open",
    createdAt: serverTimestamp(),
  });
  return true;
}

export async function submitSilentRequest(
  input: { type: SilentRequest["type"]; note: string; student?: string },
  activeSessionId = defaultSessionId,
) {
  if (!db || !firebaseReady || !activeSessionId) {
    return false;
  }

  const now = new Date();
  await addDoc(collection(db, "sessions", activeSessionId, "requests"), {
    student: sanitizeInlineText(input.student, limits.displayName) || "Anonymous",
    type: input.type,
    note: sanitizeMultilineText(input.note, limits.requestNote) || "No note provided",
    time: now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }),
    status: "pending",
    order: requestOrder.get(input.type) ?? 99,
    createdAt: serverTimestamp(),
  });
  return true;
}

export async function updateQuestionStatus(
  questionId: string,
  status: Question["status"],
  activeSessionId = defaultSessionId,
) {
  if (!db || !firebaseReady || !activeSessionId) {
    return false;
  }

  await updateDoc(doc(db, "sessions", activeSessionId, "questions", questionId), {
    status,
    updatedAt: serverTimestamp(),
  });
  return true;
}

export async function updateRequestStatus(
  requestId: string,
  status: SilentRequest["status"],
  activeSessionId = defaultSessionId,
) {
  if (!db || !firebaseReady || !activeSessionId) {
    return false;
  }

  await updateDoc(doc(db, "sessions", activeSessionId, "requests", requestId), {
    status,
    updatedAt: serverTimestamp(),
  });
  return true;
}

export async function updateSessionMeta(input: Partial<SessionMeta>, activeSessionId = defaultSessionId) {
  if (!db || !firebaseReady || !activeSessionId) {
    return false;
  }

  const sanitized = sanitizeSessionMeta(input);

  await setDoc(
    doc(db, "sessions", activeSessionId),
    {
      ...sanitized,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  return true;
}

export async function postNotification(
  input: Omit<AppNotification, "id" | "createdAtLabel">,
  activeSessionId = defaultSessionId,
) {
  if (!db || !firebaseReady || !activeSessionId) {
    return false;
  }

  const title = sanitizeInlineText(input.title, limits.notificationTitle);
  const body = sanitizeMultilineText(input.body, limits.notificationBody);
  if (!title || !body) {
    return false;
  }

  const actionUrl = sanitizeHttpUrl(input.actionUrl);
  const actionLabel = actionUrl ? sanitizeInlineText(input.actionLabel, limits.actionLabel) : "";

  await addDoc(collection(db, "sessions", activeSessionId, "notifications"), {
    title,
    body,
    audience: input.audience,
    kind: input.kind,
    recipientUserId: sanitizeInlineText(input.recipientUserId, 128) || null,
    actionLabel: actionLabel || null,
    actionUrl: actionUrl || null,
    createdAt: serverTimestamp(),
  });
  return true;
}

export async function ensureSeedSession(activeSessionId = defaultSessionId, meta?: Partial<SessionMeta>) {
  if (!db || !firebaseReady || !activeSessionId) {
    return false;
  }

  const ref = doc(db, "sessions", activeSessionId);
  const sanitizedMeta = sanitizeSessionMeta(meta);
  await setDoc(ref, {
    ...defaultSessionMeta,
    ...sanitizedMeta,
    updatedAt: serverTimestamp(),
  }, { merge: true });

  return true;
}

export async function getSessionMeta(activeSessionId: string) {
  if (!db || !firebaseReady || !activeSessionId) {
    return null;
  }

  const snapshot = await getDoc(doc(db, "sessions", activeSessionId));
  if (!snapshot.exists()) {
    return null;
  }

  return parseMeta(snapshot.data() as Partial<SessionMeta>);
}
