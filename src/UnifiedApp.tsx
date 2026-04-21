import { lazy, startTransition, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { Capacitor } from "@capacitor/core";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  DoorOpen,
  LogOut,
  MessageSquareText,
  Plus,
  QrCode,
  Send,
  Sparkles,
} from "lucide-react";
import { auth, firebaseReady } from "./lib/firebase";
import {
  buildFallbackProfile,
  getCachedProfile,
  loginWithEmail,
  logoutUser,
  registerWithEmail,
  setPendingAuthRole,
  useAuthState,
  type AppRole,
  type UserProfile,
} from "./lib/auth";
import { deliverNotification, requestNotificationAccess } from "./lib/notifications";
import {
  buildSessionMetaPreview,
  buildSessionIdFromCode,
  ensureSeedSession,
  getSessionMeta,
  normalizeSessionCode,
  postNotification,
  submitQuestion,
  submitSilentRequest,
  submitSlowDownSignal,
  submitStudentSignal,
  updateQuestionStatus,
  updateRequestStatus,
  updateSessionMeta,
  useClassroomSession,
} from "./lib/session-store";
import { defaultReport } from "./data/mock";
import type { ClassroomPulseReport, ClassroomSessionData, Question, SessionMeta, SilentRequest } from "./types";

const TeacherDashboard = lazy(() => import("./components/TeacherDashboard"));

type AuthMode = "login" | "signup";
type ChatMessage = { id: string; speaker: "user" | "assistant"; text: string };

function UnifiedApp() {
  const isNativePlatform = Capacitor.isNativePlatform();
  const { user, profile, loading, error } = useAuthState();
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authRole, setAuthRole] = useState<AppRole>("student");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authStatus, setAuthStatus] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [optimisticProfile, setOptimisticProfile] = useState<UserProfile | null>(null);
  const [activeSessionId, setActiveSessionId] = useState("");
  const [pendingSessionMeta, setPendingSessionMeta] = useState<SessionMeta | null>(null);
  const [questionFilter, setQuestionFilter] = useState<"all" | Question["status"]>("all");
  const [report, setReport] = useState<ClassroomPulseReport>(defaultReport);
  const [isGenerating, setIsGenerating] = useState(false);
  const [teacherAnalyticsOpen, setTeacherAnalyticsOpen] = useState(!isNativePlatform);
  const initialNotificationIds = useRef<string[]>([]);
  const notificationPermissionRequested = useRef(false);
  const resolvedUser = user ?? auth?.currentUser ?? null;
  const resolvedProfile = profile ?? optimisticProfile;
  const { data, liveConnected, liveError, understanding, mood, sessionId } = useClassroomSession(activeSessionId, resolvedProfile?.role, pendingSessionMeta);
  const activeSlowDown = data.slowdownSignals.find((item) => item.thresholdHit);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionCode = params.get("session");
    if (sessionCode) {
      const normalizedCode = normalizeSessionCode(sessionCode);
      setPendingSessionMeta(buildSessionMetaPreview({ sessionCode: normalizedCode, joinUrl: buildJoinUrl(normalizedCode) }));
      setActiveSessionId(buildSessionIdFromCode(normalizedCode));
    }
  }, []);

  useEffect(() => {
    if (!resolvedProfile) {
      return;
    }

    setAuthRole(resolvedProfile.role);
    setName(resolvedProfile.name);
    setEmail(resolvedProfile.email);
  }, [resolvedProfile]);

  useEffect(() => {
    if (profile) {
      setOptimisticProfile(null);
      return;
    }

    if (!resolvedUser) {
      setOptimisticProfile(null);
    }
  }, [profile, resolvedUser]);

  useEffect(() => {
    if (!activeSessionId || !resolvedProfile) {
      initialNotificationIds.current = [];
      notificationPermissionRequested.current = false;
      return;
    }

    if (notificationPermissionRequested.current) {
      return;
    }

    notificationPermissionRequested.current = true;
    void requestNotificationAccess();
  }, [activeSessionId, resolvedProfile]);

  useEffect(() => {
    if (!resolvedProfile || !activeSessionId) {
      return;
    }

    const visible = data.notifications.filter(
      (item) =>
        item.recipientUserId === resolvedProfile.uid ||
        (!item.recipientUserId && (item.audience === "all" || item.audience === resolvedProfile.role)),
    );
    const currentIds = visible.map((item) => item.id);

    if (initialNotificationIds.current.length === 0) {
      initialNotificationIds.current = currentIds;
      return;
    }

    const newItems = visible.filter((item) => !initialNotificationIds.current.includes(item.id));
    initialNotificationIds.current = currentIds;
    newItems.forEach((item) => {
      void deliverNotification(item.title, item.body);
    });
  }, [activeSessionId, data.notifications, resolvedProfile]);

  useEffect(() => {
    if (!activeSessionId || resolvedProfile?.role !== "teacher" || !teacherAnalyticsOpen) {
      setReport(defaultReport);
      setIsGenerating(false);
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      setIsGenerating(true);
      void import("./lib/gemini")
        .then(({ generatePulseReport }) => generatePulseReport(data.questions))
        .then((nextReport) => {
          if (!cancelled) {
            startTransition(() => {
              setReport(nextReport);
              setIsGenerating(false);
            });
          }
        })
        .catch(() => {
          if (!cancelled) {
            setIsGenerating(false);
          }
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [activeSessionId, data.questions, resolvedProfile?.role, teacherAnalyticsOpen]);

  const visibleQuestions = useMemo(() => {
    if (questionFilter === "all") {
      return data.questions;
    }
    return data.questions.filter((question) => question.status === questionFilter);
  }, [data.questions, questionFilter]);

  const handleAuth = async () => {
    if (!firebaseReady) {
      setAuthStatus("Add Firebase keys first to use real authentication.");
      return;
    }

    setAuthBusy(true);
    setAuthStatus(authMode === "signup" ? "Creating your account..." : "Signing you in...");

    try {
      if (authMode === "signup") {
        if (!name.trim()) {
          setAuthStatus("Enter your name first.");
          return;
        }
        const result = await registerWithEmail({
          name: name.trim(),
          email: email.trim(),
          password,
          role: authRole,
        });
        if (result.ok && auth?.currentUser) {
          setOptimisticProfile(
            buildFallbackProfile(auth.currentUser, authRole),
          );
        }
        setAuthStatus(result.ok ? "Opening your workspace..." : result.error || "Could not create account.");
        return;
      }

      setPendingAuthRole(authRole);
      const result = await loginWithEmail({ email: email.trim(), password });
      if (result.ok && auth?.currentUser) {
        setOptimisticProfile(getCachedProfile(auth.currentUser.uid));
      }
      setAuthStatus(result.ok ? "Opening your workspace..." : result.error || "Could not sign in.");
    } finally {
      setAuthBusy(false);
    }
  };

  const leaveSession = () => {
    setActiveSessionId("");
    setPendingSessionMeta(null);
    initialNotificationIds.current = [];
    const url = new URL(window.location.href);
    url.searchParams.delete("session");
    window.history.replaceState({}, "", url.toString());
  };

  if (loading && !optimisticProfile) {
    return <CenteredState title="Loading GyanSetu" body="Checking authentication and restoring your classroom session." />;
  }

  if (!resolvedUser || !resolvedProfile) {
    return (
      <AuthScreen
        authMode={authMode}
        setAuthMode={setAuthMode}
        authRole={authRole}
        setAuthRole={setAuthRole}
        name={name}
        setName={setName}
        email={email}
        setEmail={setEmail}
        password={password}
        setPassword={setPassword}
        authStatus={authStatus || error || ""}
        authBusy={authBusy}
        onSubmit={handleAuth}
      />
    );
  }

  if (!activeSessionId) {
    return <SessionLobby profile={resolvedProfile} onJoin={(sessionId, nextMeta) => { setPendingSessionMeta(nextMeta ?? null); setActiveSessionId(sessionId); }} onLogout={() => { setOptimisticProfile(null); setPendingSessionMeta(null); void logoutUser(); }} />;
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#eef6f8_0%,#f8fbfc_38%,#ffffff_100%)] text-ink">
      <TopBar
        profile={resolvedProfile}
        sessionCode={data.meta.sessionCode}
        liveConnected={liveConnected}
        onLeaveSession={leaveSession}
        onLogout={() => {
          leaveSession();
          void logoutUser();
        }}
      />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {resolvedProfile.role === "teacher" ? (
          <TeacherWorkspace
            data={data}
            understanding={understanding}
            mood={mood}
            liveConnected={liveConnected}
            liveError={liveError}
            sessionId={sessionId}
            visibleQuestions={visibleQuestions}
            questionFilter={questionFilter}
            setQuestionFilter={setQuestionFilter}
            report={report}
            isGenerating={isGenerating}
            activeSlowDown={activeSlowDown}
            showAnalytics={teacherAnalyticsOpen}
            setShowAnalytics={setTeacherAnalyticsOpen}
            onQuestionStatusChange={async (questionId, status) => {
              await updateQuestionStatus(questionId, status, activeSessionId);
              if (status !== "answered") {
                return;
              }

              const question = data.questions.find((item) => item.id === questionId);
              if (!question) {
                return;
              }

              void postNotification(
                {
                  title: question.authorId ? "Teacher answered your question" : "Teacher answered a question",
                  body: `Update on ${question.topic}: ${question.text.slice(0, 96)}${question.text.length > 96 ? "..." : ""}`,
                  audience: "student",
                  kind: "question",
                  recipientUserId: question.authorId,
                },
                activeSessionId,
              );
            }}
            onRequestStatusChange={async (requestId, status) => {
              await updateRequestStatus(requestId, status, activeSessionId);
            }}
            onPostSessionUpdate={async (message) => {
              const ok = await updateSessionMeta({ currentComprehension: message }, activeSessionId);
              if (ok) {
                void postNotification({ title: "Session update", body: message, audience: "all", kind: "session" }, activeSessionId);
              }
              return ok;
            }}
            activeSessionId={activeSessionId}
          />
        ) : (
          <StudentWorkspace
            profile={resolvedProfile}
            data={data}
            liveConnected={liveConnected}
            liveError={liveError}
            activeSessionId={activeSessionId}
          />
        )}
      </main>
    </div>
  );
}

function AuthScreen(props: {
  authMode: AuthMode;
  setAuthMode: (mode: AuthMode) => void;
  authRole: AppRole;
  setAuthRole: (role: AppRole) => void;
  name: string;
  setName: (value: string) => void;
  email: string;
  setEmail: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  authStatus: string;
  authBusy: boolean;
  onSubmit: () => void;
}) {
  const {
    authMode,
    setAuthMode,
    authRole,
    setAuthRole,
    name,
    setName,
    email,
    setEmail,
    password,
    setPassword,
    authStatus,
    authBusy,
    onSubmit,
  } = props;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(13,124,134,0.18),transparent_28%),radial-gradient(circle_at_top_right,rgba(245,165,36,0.16),transparent_26%),linear-gradient(180deg,#eff7f8_0%,#f8fbfc_42%,#ffffff_100%)] px-4 py-6">
      <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-[36px] bg-ink px-6 py-7 text-white shadow-panel">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-2 text-xs uppercase tracking-[0.22em] text-white/72">
            <Sparkles className="h-3.5 w-3.5" />
            Shared web and phone experience
          </div>
          <h1 className="mt-4 font-display text-4xl font-semibold">GyanSetu</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-white/72">
            Sign in as a teacher or student, join a live session, and work from the same real-time classroom system on both Android and web.
          </p>
        </section>

        <section className="rounded-[32px] border border-white/80 bg-white/90 p-6 shadow-panel">
          <div className="flex rounded-full bg-mist p-1 text-sm">
            <button disabled={authBusy} onClick={() => setAuthMode("login")} className={`flex-1 rounded-full px-4 py-3 ${authMode === "login" ? "bg-ink text-white" : "text-slate"}`}>Sign in</button>
            <button disabled={authBusy} onClick={() => setAuthMode("signup")} className={`flex-1 rounded-full px-4 py-3 ${authMode === "signup" ? "bg-ink text-white" : "text-slate"}`}>Create account</button>
          </div>

          <div className="mt-4">
            <p className="mb-2 px-1 text-xs font-medium uppercase tracking-[0.18em] text-slate">
              Continue as
            </p>
            <div className="flex rounded-full bg-mist p-1 text-sm">
              <button disabled={authBusy} onClick={() => setAuthRole("student")} className={`flex-1 rounded-full px-4 py-3 ${authRole === "student" ? "bg-white text-ink" : "text-slate"}`}>Student</button>
              <button disabled={authBusy} onClick={() => setAuthRole("teacher")} className={`flex-1 rounded-full px-4 py-3 ${authRole === "teacher" ? "bg-white text-ink" : "text-slate"}`}>Teacher</button>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            {authMode === "signup" ? <InputField label="Name" value={name} onChange={setName} /> : null}
            <InputField label="Email" value={email} onChange={setEmail} />
            <InputField label="Password" value={password} onChange={setPassword} type="password" />
          </div>

          {authStatus ? <div className="mt-4 rounded-[20px] bg-mist px-4 py-3 text-sm text-slate">{authStatus}</div> : null}

          <button disabled={authBusy} onClick={onSubmit} className={`mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-4 text-sm font-medium text-white ${authBusy ? "bg-slate-400" : "bg-ink"}`}>
            {authBusy ? "Opening..." : authMode === "signup" ? "Create account" : "Sign in"}
            <DoorOpen className="h-4 w-4" />
          </button>
        </section>
      </div>
    </div>
  );
}

function SessionLobby({
  profile,
  onJoin,
  onLogout,
}: {
  profile: { role: AppRole; name: string };
  onJoin: (sessionId: string, nextMeta?: SessionMeta) => void;
  onLogout: () => void;
}) {
  const [sessionCode, setSessionCode] = useState("");
  const [courseLabel, setCourseLabel] = useState("");
  const [title, setTitle] = useState("Monitor the room as it learns");
  const [status, setStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submitJoin = async () => {
    const normalizedCode = normalizeSessionCode(sessionCode);
    if (!normalizedCode) {
      setStatus("Enter a session code first.");
      return;
    }

    const sessionId = buildSessionIdFromCode(normalizedCode);

    setIsSubmitting(true);
    setStatus(profile.role === "teacher" ? "Opening classroom..." : "Checking session...");

    try {
      const joinUrl = buildJoinUrl(normalizedCode);

      if (profile.role === "teacher") {
        const nextMeta = buildSessionMetaPreview({
          sessionCode: normalizedCode,
          courseLabel: courseLabel.trim() || "CS-402 live session",
          title: title.trim() || "Monitor the room as it learns",
          joinUrl,
        });

        onJoin(sessionId, nextMeta);
        syncSessionUrl(normalizedCode);

        void ensureSeedSession(sessionId, {
          ...nextMeta,
        }).catch((error) => {
          console.warn("Could not create or open session in background.", error);
        });
        return;
      }

      const existing = await getSessionMeta(sessionId);
      if (!existing) {
        setStatus("That session does not exist yet.");
        return;
      }

      onJoin(sessionId, existing);
      syncSessionUrl(normalizedCode);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not open the session right now.";
      setStatus(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#eef6f8_0%,#f8fbfc_38%,#ffffff_100%)] px-4 py-6">
      <div className="mx-auto max-w-5xl grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-[34px] bg-ink px-6 py-7 text-white shadow-panel">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-2 text-xs uppercase tracking-[0.22em] text-white/72">
            <Sparkles className="h-3.5 w-3.5" />
            {profile.role} workspace
          </div>
          <h2 className="mt-4 font-display text-4xl font-semibold">Welcome, {profile.name}</h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-white/72">
            {profile.role === "teacher"
              ? "Create or reopen a classroom session, then share the QR and live link with students."
              : "Join the active class with the session code you received from the teacher or from the QR link."}
          </p>
        </section>

        <section className="rounded-[32px] border border-white/80 bg-white/90 p-6 shadow-panel">
          <InputField label="Session code" value={sessionCode} onChange={(value) => setSessionCode(value.toUpperCase())} />
          {profile.role === "teacher" ? (
            <>
              <div className="mt-4" />
              <InputField label="Course label" value={courseLabel} onChange={setCourseLabel} placeholder="CS-402 live session" />
              <div className="mt-4" />
              <InputField label="Session title" value={title} onChange={setTitle} placeholder="Monitor the room as it learns" />
            </>
          ) : null}
          {status ? <div className="mt-4 rounded-[20px] bg-mist px-4 py-3 text-sm text-slate">{status}</div> : null}
          <div className="mt-5 flex gap-3">
            <button disabled={isSubmitting} onClick={() => void submitJoin()} className={`inline-flex flex-1 items-center justify-center gap-2 rounded-full px-5 py-4 text-sm font-medium text-white ${isSubmitting ? "bg-slate-400" : "bg-ink"}`}>
              {profile.role === "teacher" ? <Plus className="h-4 w-4" /> : <DoorOpen className="h-4 w-4" />}
              {isSubmitting ? "Opening..." : profile.role === "teacher" ? "Create or open session" : "Join session"}
            </button>
            <button onClick={onLogout} className="rounded-full bg-mist px-5 py-4 text-sm text-slate">Logout</button>
          </div>
        </section>
      </div>
    </div>
  );
}

function TeacherWorkspace(props: {
  data: ClassroomSessionData;
  understanding: number;
  mood: { label: string; detail: string };
  activeSlowDown: ClassroomSessionData["slowdownSignals"][number] | undefined;
  liveConnected: boolean;
  liveError: string | null;
  sessionId: string;
  visibleQuestions: Question[];
  questionFilter: "all" | Question["status"];
  setQuestionFilter: Dispatch<SetStateAction<"all" | Question["status"]>>;
  report: ClassroomPulseReport;
  isGenerating: boolean;
  showAnalytics: boolean;
  setShowAnalytics: Dispatch<SetStateAction<boolean>>;
  onQuestionStatusChange: (questionId: string, status: Question["status"]) => Promise<void> | void;
  onRequestStatusChange: (requestId: string, status: SilentRequest["status"]) => Promise<void> | void;
  onPostSessionUpdate: (message: string) => Promise<boolean> | boolean;
  activeSessionId: string;
}) {
  const { data, activeSessionId, onPostSessionUpdate, activeSlowDown, showAnalytics, setShowAnalytics, ...dashboardProps } = props;
  const isNative = Capacitor.isNativePlatform();
  const [message, setMessage] = useState(data.meta.currentComprehension);
  const [announcement, setAnnouncement] = useState("");
  const [materialTitle, setMaterialTitle] = useState("");
  const [materialUrl, setMaterialUrl] = useState("");
  const [status, setStatus] = useState("");
  const [busyAction, setBusyAction] = useState<"" | "update" | "announcement" | "material">("");

  useEffect(() => {
    setMessage(data.meta.currentComprehension);
  }, [data.meta.currentComprehension]);

  return (
    <div className="space-y-6">
      <section className="rounded-[30px] border border-white/80 bg-white/90 p-5 shadow-panel">
        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="font-display text-2xl font-semibold text-ink">Teacher controls</p>
            <p className="mt-1 text-sm text-slate">Update the session, broadcast announcements, and share the live QR join flow.</p>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} className="mt-4 min-h-24 w-full rounded-[22px] border border-slate-200 bg-[#fbfdfe] px-4 py-3 text-sm outline-none focus:border-tide" placeholder="Current session update" />
            <div className="mt-3 flex gap-3">
              <button onClick={async () => { if (!message.trim()) { setStatus("Write a session update first."); return; } setBusyAction("update"); setStatus("Sending session update..."); try { const ok = await onPostSessionUpdate(message.trim()); setStatus(ok ? "Session update sent." : "Could not send session update."); } finally { setBusyAction(""); } }} disabled={busyAction !== ""} className={`rounded-full px-4 py-3 text-sm font-medium text-white ${busyAction !== "" ? "bg-slate-400" : "bg-ink"}`}>{busyAction === "update" ? "Sending..." : "Push session update"}</button>
              <button onClick={async () => { if (!announcement.trim()) { setStatus("Write an announcement first."); return; } setBusyAction("announcement"); setStatus("Sending announcement..."); try { const ok = await postNotification({ title: "Teacher announcement", body: announcement.trim(), audience: "all", kind: "alert" }, activeSessionId); if (ok) { setAnnouncement(""); setStatus("Announcement sent."); } else { setStatus("Could not send announcement."); } } finally { setBusyAction(""); } }} disabled={busyAction !== ""} className={`rounded-full px-4 py-3 text-sm font-medium text-white ${busyAction !== "" ? "bg-slate-400" : "bg-tide"}`}>{busyAction === "announcement" ? "Sending..." : "Send announcement"}</button>
            </div>
            <textarea value={announcement} onChange={(e) => setAnnouncement(e.target.value)} className="mt-4 min-h-20 w-full rounded-[22px] border border-slate-200 bg-[#fbfdfe] px-4 py-3 text-sm outline-none focus:border-tide" placeholder="Announcement for all students" />
            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <input value={materialTitle} onChange={(e) => setMaterialTitle(e.target.value)} className="rounded-[22px] border border-slate-200 bg-[#fbfdfe] px-4 py-3 text-sm outline-none focus:border-tide" placeholder="Study material title" />
              <input value={materialUrl} onChange={(e) => setMaterialUrl(e.target.value)} className="rounded-[22px] border border-slate-200 bg-[#fbfdfe] px-4 py-3 text-sm outline-none focus:border-tide" placeholder="https://example.com/material" />
              <button
                onClick={async () => {
                  if (!materialTitle.trim() || !materialUrl.trim()) {
                    setStatus("Add both a material title and link.");
                    return;
                  }
                  if (!isValidHttpUrl(materialUrl)) {
                    setStatus("Enter a valid material URL.");
                    return;
                  }
                  setBusyAction("material");
                  setStatus("Sharing study material...");
                  try {
                    const ok = await postNotification(
                      {
                        title: "New study material uploaded",
                        body: materialTitle.trim(),
                        audience: "student",
                        kind: "material",
                        actionLabel: "Open material",
                        actionUrl: materialUrl.trim(),
                      },
                      activeSessionId,
                    );
                    if (ok) {
                      setMaterialTitle("");
                      setMaterialUrl("");
                      setStatus("Study material shared with students.");
                    } else {
                      setStatus("Could not share study material.");
                    }
                  } finally {
                    setBusyAction("");
                  }
                }}
                disabled={busyAction !== ""}
                className={`rounded-full px-4 py-3 text-sm font-medium text-white ${busyAction !== "" ? "bg-slate-400" : "bg-amber"}`}
              >
                {busyAction === "material" ? "Sharing..." : "Share material"}
              </button>
            </div>
            {status ? <div className="mt-3 rounded-[20px] bg-mist px-4 py-3 text-sm text-slate">{status}</div> : null}
          </div>
          <div className="grid gap-4">
            <QRCodeCard sessionCode={data.meta.sessionCode} joinUrl={data.meta.joinUrl} />
            <NotificationPanel data={data} role="teacher" liveError={dashboardProps.liveError} />
            <AIChatPanel role="teacher" data={data} />
          </div>
        </div>
        {isNative ? (
          <div className="mt-4 flex justify-end">
            <button
              onClick={() => setShowAnalytics((current) => !current)}
              className="rounded-full bg-mist px-4 py-3 text-sm font-medium text-slate"
            >
              {showAnalytics ? "Hide analytics" : "Open analytics dashboard"}
            </button>
          </div>
        ) : null}
      </section>

      {showAnalytics ? (
        <Suspense fallback={<CenteredState title="Loading dashboard" body="Preparing teacher analytics and live classroom pulse." compact />}>
          <TeacherDashboard data={data} activeSlowDown={activeSlowDown} {...dashboardProps} />
        </Suspense>
      ) : null}
    </div>
  );
}

function StudentWorkspace({
  profile,
  data,
  liveConnected,
  liveError,
  activeSessionId,
}: {
  profile: { uid: string; name: string; role: AppRole };
  data: ClassroomSessionData;
  liveConnected: boolean;
  liveError: string | null;
  activeSessionId: string;
}) {
  const [question, setQuestion] = useState("");
  const [topic, setTopic] = useState("General");
  const [request, setRequest] = useState("");
  const [requestType, setRequestType] = useState<SilentRequest["type"]>("urgent question");
  const [status, setStatus] = useState("");
  const [busyAction, setBusyAction] = useState<"" | "understanding" | "example" | "slowdown" | "question" | "request">("");

  return (
    <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
      <section className="space-y-6">
        <section className="rounded-[32px] bg-ink px-5 py-6 text-white shadow-panel">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-2 text-xs uppercase tracking-[0.2em] text-white/72">
            <Sparkles className="h-3.5 w-3.5" />
            {data.meta.sessionCode}
          </div>
          <h1 className="mt-4 font-display text-3xl font-semibold">Welcome, {profile.name}</h1>
          <p className="mt-2 text-sm text-white/72">{data.meta.courseLabel}</p>
          <p className="mt-3 max-w-xl text-sm leading-6 text-white/80">{data.meta.currentComprehension}</p>
          <div className="mt-5 flex gap-3 text-sm">
            <span className={`rounded-full px-4 py-2 ${liveConnected ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{liveConnected ? "Live session connected" : "Demo fallback active"}</span>
          </div>
        </section>

        <section className="rounded-[30px] border border-white/80 bg-white/90 p-5 shadow-panel">
          <p className="font-display text-2xl font-semibold text-ink">Instant feedback</p>
          <p className="mt-1 text-sm text-slate">Signal understanding, ask questions, and send silent requests in real time.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <ActionButton disabled={busyAction !== ""} title={busyAction === "understanding" ? "Sending..." : "I get it"} icon={<CheckCircle2 className="h-5 w-5" />} tone="bg-emerald-50 text-emerald-700" onClick={async () => { setBusyAction("understanding"); setStatus("Sending understanding signal..."); try { const ok = await submitStudentSignal("Following clearly", activeSessionId); setStatus(ok ? "Understanding signal recorded." : "Firebase is not configured."); } finally { setBusyAction(""); } }} />
            <ActionButton disabled={busyAction !== ""} title={busyAction === "example" ? "Sending..." : "Need example"} icon={<MessageSquareText className="h-5 w-5" />} tone="bg-amber-50 text-amber-700" onClick={async () => { setBusyAction("example"); setStatus("Sending example request..."); try { const ok = await submitStudentSignal("Need one more example", activeSessionId); setStatus(ok ? "Example request recorded." : "Firebase is not configured."); } finally { setBusyAction(""); } }} />
            <ActionButton disabled={busyAction !== ""} title={busyAction === "slowdown" ? "Sending..." : "Slow down"} icon={<AlertTriangle className="h-5 w-5" />} tone="bg-rose-50 text-rose-700" onClick={async () => { setBusyAction("slowdown"); setStatus("Sending slow-down signal..."); try { const ok = await submitSlowDownSignal(activeSessionId); setStatus(ok ? "Slow-down signal sent." : "Firebase is not configured."); } finally { setBusyAction(""); } }} />
          </div>

          <input value={topic} onChange={(e) => setTopic(e.target.value)} className="mt-5 w-full rounded-[22px] border border-slate-200 bg-[#fbfdfe] px-4 py-3 text-sm outline-none focus:border-tide" placeholder="Question topic" />
          <textarea value={question} onChange={(e) => setQuestion(e.target.value)} className="mt-3 min-h-24 w-full rounded-[22px] border border-slate-200 bg-[#fbfdfe] px-4 py-3 text-sm outline-none focus:border-tide" placeholder="Ask your teacher a question" />
          <button onClick={async () => { if (!question.trim()) { setStatus("Write your question first."); return; } setBusyAction("question"); setStatus("Sending question..."); try { const ok = await submitQuestion({ author: profile.name, authorId: profile.uid, text: question, topic }, activeSessionId); if (ok) { void postNotification({ title: "New student question", body: `${profile.name} asked about ${topic}.`, audience: "teacher", kind: "question" }, activeSessionId); setQuestion(""); } setStatus(ok ? "Question sent." : "Firebase is not configured."); } finally { setBusyAction(""); } }} disabled={busyAction !== ""} className={`mt-4 rounded-full px-4 py-3 text-sm font-medium text-white ${busyAction !== "" ? "bg-slate-400" : "bg-ink"}`}>{busyAction === "question" ? "Sending..." : "Send question"}</button>

          <div className="mt-5 grid grid-cols-3 gap-2">
            {(["urgent question", "bathroom", "hand raise"] as const).map((option) => (
              <button key={option} onClick={() => setRequestType(option)} className={`rounded-full px-3 py-2 text-sm capitalize ${requestType === option ? "bg-ink text-white" : "bg-mist text-slate"}`}>{option}</button>
            ))}
          </div>
          <textarea value={request} onChange={(e) => setRequest(e.target.value)} className="mt-3 min-h-20 w-full rounded-[22px] border border-slate-200 bg-[#fbfdfe] px-4 py-3 text-sm outline-none focus:border-tide" placeholder="Optional note for the teacher" />
          <button onClick={async () => { setBusyAction("request"); setStatus("Sending silent request..."); try { const ok = await submitSilentRequest({ type: requestType, note: request, student: profile.name }, activeSessionId); if (ok) { void postNotification({ title: "Silent request received", body: `${profile.name} sent a ${requestType} request.`, audience: "teacher", kind: "request" }, activeSessionId); setRequest(""); } setStatus(ok ? "Silent request sent." : "Firebase is not configured."); } finally { setBusyAction(""); } }} disabled={busyAction !== ""} className={`mt-4 rounded-full px-4 py-3 text-sm font-medium text-white ${busyAction !== "" ? "bg-slate-400" : "bg-tide"}`}>{busyAction === "request" ? "Sending..." : "Send silent request"}</button>
          {status ? <div className="mt-4 rounded-[20px] bg-mist px-4 py-3 text-sm text-slate">{status}</div> : null}
        </section>
      </section>

      <div className="space-y-6">
        <SessionSummaryCard data={data} liveConnected={liveConnected} />
        <NotificationPanel data={data} role="student" viewerId={profile.uid} liveError={liveError} />
        <AIChatPanel role="student" data={data} />
      </div>
    </div>
  );
}

function NotificationPanel({
  data,
  role,
  viewerId,
  liveError,
}: {
  data: ClassroomSessionData;
  role: AppRole;
  viewerId?: string;
  liveError: string | null;
}) {
  const items = data.notifications
    .filter(
      (item) =>
        item.recipientUserId === viewerId ||
        (!item.recipientUserId && (item.audience === "all" || item.audience === role)),
    )
    .slice(0, 6);
  return (
    <section className="rounded-[30px] border border-white/80 bg-white/90 p-5 shadow-panel">
      <p className="font-display text-2xl font-semibold text-ink">Live notifications</p>
      <p className="mt-1 text-sm text-slate">Real-time classroom alerts and updates.</p>
      {liveError ? <div className="mt-4 rounded-[20px] bg-rose-50 px-4 py-3 text-sm text-rose-700">{liveError}</div> : null}
      <div className="mt-4 space-y-3">
        {items.map((item) => (
          <div key={item.id} className="rounded-[22px] border border-slate-200 bg-white px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-ink">{item.title}</p>
                <p className="mt-2 text-sm leading-6 text-slate">{item.body}</p>
                {item.actionLabel && item.actionUrl ? (
                  <a href={item.actionUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex rounded-full bg-mist px-3 py-2 text-xs font-medium uppercase tracking-[0.16em] text-tide">
                    {item.actionLabel}
                  </a>
                ) : null}
              </div>
              <span className="rounded-full bg-mist px-3 py-1 text-xs uppercase tracking-[0.16em] text-slate">{item.createdAtLabel ?? item.kind}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function AIChatPanel({ role, data }: { role: AppRole; data: ClassroomSessionData }) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      speaker: "assistant",
      text: role === "teacher" ? "Ask what the classroom needs next." : "Ask for a recap or simpler explanation.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  return (
    <section className="rounded-[30px] border border-white/80 bg-white/90 p-5 shadow-panel">
      <p className="font-display text-2xl font-semibold text-ink">AI chatbox</p>
      <p className="mt-1 text-sm text-slate">Gemini-powered classroom help with safe fallback when no key is set.</p>
      <div className="mt-4 space-y-3">
        {messages.slice(-4).map((message) => (
          <div key={message.id} className={`rounded-[22px] px-4 py-3 text-sm leading-6 ${message.speaker === "assistant" ? "bg-mist text-ink" : "bg-ink text-white"}`}>{message.text}</div>
        ))}
      </div>
      <textarea value={input} onChange={(e) => setInput(e.target.value)} className="mt-4 min-h-20 w-full rounded-[22px] border border-slate-200 bg-[#fbfdfe] px-4 py-3 text-sm outline-none focus:border-tide" placeholder={role === "teacher" ? "Ask what to explain next..." : "Ask for a quick recap..."} />
      {error ? <div className="mt-4 rounded-[20px] bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      <button onClick={async () => { if (!input.trim() || loading) return; const prompt = input.trim(); setMessages((current) => [...current, { id: `user-${Date.now()}`, speaker: "user", text: prompt }]); setInput(""); setError(""); setLoading(true); try { const { askClassroomAssistant } = await import("./lib/gemini"); const reply = await askClassroomAssistant({ question: prompt, session: data, role }); setMessages((current) => [...current, { id: `assistant-${Date.now()}`, speaker: "assistant", text: reply }]); } catch (chatError) { const message = chatError instanceof Error ? chatError.message : "AI is unavailable right now."; setError(message); } finally { setLoading(false); } }} disabled={loading} className={`mt-4 inline-flex items-center gap-2 rounded-full px-4 py-3 text-sm font-medium text-white ${loading ? "bg-slate-400" : "bg-ink"}`}>
        {loading ? "Thinking..." : "Ask AI"}
        <Send className="h-4 w-4" />
      </button>
    </section>
  );
}

function QRCodeCard({ sessionCode, joinUrl }: { sessionCode: string; joinUrl: string }) {
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [qrError, setQrError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setQrDataUrl("");
    setQrError("");
    void import("qrcode")
      .then(({ default: QRCode }) =>
        QRCode.toDataURL(joinUrl, {
          errorCorrectionLevel: "M",
          margin: 2,
          width: 320,
        }),
      )
      .then((dataUrl) => {
        if (!cancelled) {
          setQrDataUrl(dataUrl);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setQrDataUrl("");
          setQrError("QR image could not be generated. Use the join link below.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [joinUrl]);

  return (
    <section className="rounded-[30px] border border-white/80 bg-white/90 p-5 shadow-panel">
      <div className="flex items-center gap-3">
        <div className="rounded-2xl bg-mist p-3 text-tide"><QrCode className="h-5 w-5" /></div>
        <div>
          <p className="font-display text-2xl font-semibold text-ink">QR join code</p>
          <p className="text-sm text-slate">Dynamic session link for this classroom.</p>
        </div>
      </div>
      <div className="mt-4 rounded-[26px] bg-mist p-4">
        {qrDataUrl ? <img src={qrDataUrl} alt={`QR code for ${sessionCode}`} className="mx-auto h-56 w-56 rounded-[22px] bg-white object-cover" /> : <CenteredState title="Generating QR" body="Preparing the latest join code for this session." compact />}
      </div>
      {qrError ? <div className="mt-4 rounded-[20px] bg-amber-50 px-4 py-3 text-sm text-amber-700">{qrError}</div> : null}
      <a href={joinUrl} target="_blank" rel="noreferrer" className="mt-4 block break-words rounded-[20px] bg-white px-4 py-3 text-sm leading-6 text-tide">
        {joinUrl}
      </a>
    </section>
  );
}

function SessionSummaryCard({
  data,
  liveConnected,
}: {
  data: ClassroomSessionData;
  liveConnected: boolean;
}) {
  return (
    <section className="rounded-[30px] border border-white/80 bg-white/90 p-5 shadow-panel">
      <p className="font-display text-2xl font-semibold text-ink">Session access</p>
      <p className="mt-1 text-sm text-slate">Your current classroom details and join code.</p>
      <div className="mt-4 rounded-[24px] bg-mist p-4">
        <p className="text-xs uppercase tracking-[0.18em] text-slate">Session code</p>
        <p className="mt-2 font-display text-3xl font-semibold text-ink">{data.meta.sessionCode}</p>
        <p className="mt-3 text-sm leading-6 text-slate">{data.meta.joinUrl}</p>
      </div>
      <div className="mt-4">
        <span className={`rounded-full px-4 py-2 text-sm ${liveConnected ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
          {liveConnected ? "Realtime sync active" : "Waiting for live sync"}
        </span>
      </div>
    </section>
  );
}

function TopBar({
  profile,
  sessionCode,
  liveConnected,
  onLeaveSession,
  onLogout,
}: {
  profile: { role: AppRole; name: string };
  sessionCode: string;
  liveConnected: boolean;
  onLeaveSession: () => void;
  onLogout: () => void;
}) {
  return (
    <header className="border-b border-white/60 bg-white/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-ink text-white shadow-panel"><BookOpen className="h-5 w-5" /></div>
          <div>
            <p className="font-display text-xl font-semibold">GyanSetu</p>
            <p className="text-sm text-slate">{profile.role} mode for {profile.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-3 py-2 text-xs uppercase tracking-[0.18em] ${liveConnected ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{liveConnected ? sessionCode : "Demo"}</span>
          <button onClick={onLeaveSession} className="rounded-full bg-mist px-4 py-3 text-sm text-slate">Change session</button>
          <button onClick={onLogout} className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-3 text-sm text-white"><LogOut className="h-4 w-4" />Logout</button>
        </div>
      </div>
    </header>
  );
}

function InputField({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-ink">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} type={type} placeholder={placeholder} className="w-full rounded-[22px] border border-slate-200 bg-[#fbfdfe] px-4 py-3 text-sm outline-none focus:border-tide" />
    </label>
  );
}

function ActionButton({ title, icon, tone, onClick, disabled = false }: { title: string; icon: ReactNode; tone: string; onClick: () => void; disabled?: boolean }) {
  return <button disabled={disabled} onClick={onClick} className={`rounded-[24px] border border-slate-200 bg-white p-4 text-left transition ${disabled ? "opacity-60" : "hover:-translate-y-0.5 hover:shadow-panel"}`}><div className={`inline-flex rounded-2xl p-3 ${tone}`}>{icon}</div><p className="mt-4 font-display text-2xl font-semibold text-ink">{title}</p></button>;
}

function CenteredState({ title, body, compact = false }: { title: string; body: string; compact?: boolean }) {
  return <div className={`grid place-items-center text-center ${compact ? "h-48" : "min-h-screen"} px-4`}><div><p className="font-display text-3xl font-semibold text-ink">{title}</p><p className="mt-2 text-sm text-slate">{body}</p></div></div>;
}

function buildJoinUrl(sessionCode: string) {
  const publicUrl = cleanUrlCandidate(import.meta.env.VITE_PUBLIC_APP_URL);
  const currentOrigin = cleanUrlCandidate(window.location.origin);
  const isLocalOrigin = !currentOrigin || /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(currentOrigin);
  const stableHostedFallback = "https://deploy-root-rust.vercel.app";

  // When the teacher is on a real deployment, QR links must use that same origin first.
  // Otherwise a stale VITE_PUBLIC_APP_URL from build time sends students to the wrong (or dead) host.
  const candidates: string[] = [];
  if (!isLocalOrigin && currentOrigin) {
    candidates.push(currentOrigin);
  }
  if (publicUrl) {
    candidates.push(publicUrl);
  }
  candidates.push(stableHostedFallback);

  const seen = new Set<string>();
  const unique = candidates.filter((value) => {
    if (!value) {
      return false;
    }
    const normalized = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    if (seen.has(normalized)) {
      return false;
    }
    seen.add(normalized);
    return true;
  });

  for (const candidate of unique) {
    const normalizedCandidate = /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;

    try {
      const url = new URL(normalizedCandidate);
      url.pathname = "/";
      url.search = "";
      url.searchParams.set("session", sessionCode);
      return url.toString();
    } catch {
      // Try the next base URL candidate.
    }
  }

  const fallback = new URL(publicUrl || stableHostedFallback);
  fallback.searchParams.set("session", sessionCode);
  return fallback.toString();
}

function cleanUrlCandidate(value: string | undefined) {
  return (value ?? "").trim().replace(/[\]\s]+$/g, "");
}

function syncSessionUrl(sessionCode: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("session", sessionCode);
  window.history.replaceState({}, "", url.toString());
}

function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export default UnifiedApp;
