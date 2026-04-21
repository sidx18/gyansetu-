import { useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import {
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  CircleHelp,
  Clock3,
  Download,
  Gauge,
  LayoutDashboard,
  MicOff,
  ShieldCheck,
  Sparkles,
  TimerReset,
  WandSparkles,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ClassroomPulseReport, ClassroomSessionData, Question, SessionArchive, SilentRequest, SlowDownSignal } from "../types";

const requestTone: Record<SilentRequest["status"], string> = {
  pending: "text-amber-700 bg-amber-100",
  approved: "text-emerald-700 bg-emerald-100",
  dismissed: "text-slate-700 bg-slate-200",
};

const paletteClasses = ["bg-tide", "bg-amber", "bg-coral"];

export function TeacherDashboard({
  data,
  understanding,
  mood,
  activeSlowDown,
  visibleQuestions,
  questionFilter,
  setQuestionFilter,
  report,
  isGenerating,
  liveConnected,
  liveError,
  sessionId,
  onQuestionStatusChange,
  onRequestStatusChange,
}: {
  data: ClassroomSessionData;
  understanding: number;
  mood: { label: string; detail: string };
  activeSlowDown: SlowDownSignal | undefined;
  visibleQuestions: Question[];
  questionFilter: "all" | Question["status"];
  setQuestionFilter: Dispatch<SetStateAction<"all" | Question["status"]>>;
  report: ClassroomPulseReport;
  isGenerating: boolean;
  liveConnected: boolean;
  liveError: string | null;
  sessionId: string;
  onQuestionStatusChange: (questionId: string, status: Question["status"]) => Promise<void> | void;
  onRequestStatusChange: (requestId: string, status: SilentRequest["status"]) => Promise<void> | void;
}) {
  const [selectedArchive, setSelectedArchive] = useState<SessionArchive | null>(null);

  return (
    <>
      <div className="space-y-6">
        <Panel className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm uppercase tracking-[0.24em] text-slate">Teacher dashboard</p>
              <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight">{data.meta.title}</h2>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-mist px-4 py-2 text-sm text-slate">
              <LayoutDashboard className="h-4 w-4 text-tide" />
              {data.meta.courseLabel}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            <span className={`rounded-full px-4 py-2 ${liveConnected ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
              {liveConnected ? `Firestore live: ${sessionId}` : "Using fallback data until Firestore collections are populated"}
            </span>
            {liveError ? <span className="rounded-full bg-rose-100 px-4 py-2 text-rose-700">{liveError}</span> : null}
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <MetricCard
              icon={Gauge}
              value={`${understanding}%`}
              label="Understanding"
              detail={data.meta.currentComprehension}
              tone="bg-tide/10 text-tide"
            />
            <MetricCard
              icon={BrainCircuit}
              value={mood.label}
              label="Mood"
              detail={mood.detail}
              tone="bg-emerald-100 text-emerald-700"
            />
            <MetricCard
              icon={ShieldCheck}
              value={data.meta.moderationLabel}
              label="Moderation"
              detail={data.meta.moderationDetail}
              tone="bg-amber-100 text-amber-700"
            />
          </div>
        </Panel>

        <Panel>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display text-2xl font-semibold">Pulse chart</h3>
              <p className="mt-1 text-sm text-slate">Understanding and sentiment over the last 30 minutes</p>
            </div>
            <div className="rounded-full bg-mist px-4 py-2 text-sm text-slate">{data.meta.updatedLabel}</div>
          </div>
          <div className="mt-5 h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.pulseHistory}>
                <defs>
                  <linearGradient id="understanding" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0d7c86" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#0d7c86" stopOpacity={0.08} />
                  </linearGradient>
                  <linearGradient id="sentiment" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f5a524" stopOpacity={0.75} />
                    <stop offset="95%" stopColor="#f5a524" stopOpacity={0.06} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#d8e3e8" vertical={false} />
                <XAxis dataKey="minute" stroke="#5d7285" tickLine={false} axisLine={false} />
                <YAxis stroke="#5d7285" tickLine={false} axisLine={false} width={36} />
                <Tooltip />
                <Area type="monotone" dataKey="understanding" stroke="#0d7c86" strokeWidth={3} fill="url(#understanding)" />
                <Area type="monotone" dataKey="sentiment" stroke="#f5a524" strokeWidth={2} fill="url(#sentiment)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-2xl font-semibold">Question management</h3>
              <p className="mt-1 text-sm text-slate">Anonymous and named student questions, ranked by urgency and peer validation</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(["all", "open", "answered", "flagged"] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setQuestionFilter(filter)}
                  className={`rounded-full px-4 py-2 text-sm transition ${questionFilter === filter ? "bg-ink text-white" : "bg-mist text-slate"}`}
                >
                  {filter[0].toUpperCase() + filter.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-5 space-y-3">
            {visibleQuestions.map((question) => (
              <div key={question.id} className="rounded-[24px] border border-slate-200 bg-white px-5 py-4 transition hover:-translate-y-0.5 hover:shadow-panel">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="rounded-2xl bg-mist px-3 py-2 text-sm font-medium text-tide">{question.topic}</div>
                    <div className="text-sm text-slate">{question.author}</div>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-slate">
                    <span>{question.votes} agree</span>
                    {question.verified ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">
                        <CheckCircle2 className="h-4 w-4" />
                        Peer verified
                      </span>
                    ) : null}
                  </div>
                </div>
                <p className="mt-3 text-base leading-7 text-ink">{question.text}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button onClick={() => void onQuestionStatusChange(question.id, "answered")} className="rounded-full bg-emerald-100 px-3 py-2 text-sm text-emerald-700 transition hover:brightness-95">Mark answered</button>
                  <button onClick={() => void onQuestionStatusChange(question.id, "flagged")} className="rounded-full bg-amber-100 px-3 py-2 text-sm text-amber-700 transition hover:brightness-95">Flag</button>
                  <button onClick={() => void onQuestionStatusChange(question.id, "open")} className="rounded-full bg-mist px-3 py-2 text-sm text-slate transition hover:bg-slate-200">Reopen</button>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="space-y-6">
        <AlertPanel signal={activeSlowDown} items={data.slowdownSignals} />

        <Panel>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display text-2xl font-semibold">AI classroom pulse</h3>
              <p className="mt-1 text-sm text-slate">Gemini-assisted summary of what the room needs next</p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-mist px-4 py-2 text-sm text-slate">
              <WandSparkles className={`h-4 w-4 ${isGenerating ? "animate-pulse" : "text-tide"}`} />
              {isGenerating ? "Analyzing feedback" : "Ready"}
            </div>
          </div>
          <div className="mt-5 space-y-5">
            <InsightBlock icon={Sparkles} title="Summary" lines={[report.summary]} />
            <InsightBlock icon={CircleHelp} title="Confusion points" lines={report.confusionPoints} />
            <InsightBlock icon={TimerReset} title="Action plan" lines={report.actionPlan} />
          </div>
        </Panel>

        <Panel>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display text-2xl font-semibold">Sentiment meter</h3>
              <p className="mt-1 text-sm text-slate">Live distribution of how students feel right now</p>
            </div>
            <MicOff className="h-5 w-5 text-slate" />
          </div>
          <div className="mt-5 grid gap-5 md:grid-cols-[0.95fr_1.05fr]">
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data.studentSignals} innerRadius={56} outerRadius={84} dataKey="count" stroke="none" paddingAngle={6}>
                    {data.studentSignals.map((entry, index) => (
                      <Cell fill={["#0d7c86", "#f5a524", "#ff6f61"][index % 3]} key={entry.label} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-3">
              {data.studentSignals.map((signal, index) => (
                <div key={signal.label} className="rounded-2xl bg-mist px-4 py-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-ink">{signal.label}</span>
                    <span className="text-sm text-slate">{signal.count} students</span>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-white">
                    <div className={`h-2 rounded-full ${paletteClasses[index]}`} style={{ width: `${Math.max((signal.count / Math.max(data.studentSignals.reduce((sum, item) => sum + item.count, 0), 1)) * 100, 8)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Panel>

        <Panel>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display text-2xl font-semibold">Silent requests</h3>
              <p className="mt-1 text-sm text-slate">Quiet classroom operations without disruption</p>
            </div>
            <Clock3 className="h-5 w-5 text-slate" />
          </div>
          <div className="mt-5 space-y-3">
            {data.requests.map((request) => (
              <div key={request.id} className="rounded-[22px] border border-slate-200 bg-white px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-ink">{request.student} requested {request.type}</p>
                    <p className="mt-1 text-sm text-slate">{request.note}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-sm font-medium ${requestTone[request.status]}`}>{request.status}</span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button onClick={() => void onRequestStatusChange(request.id, "approved")} className="rounded-full bg-emerald-100 px-3 py-2 text-sm text-emerald-700 transition hover:brightness-95">Approve</button>
                  <button onClick={() => void onRequestStatusChange(request.id, "dismissed")} className="rounded-full bg-amber-100 px-3 py-2 text-sm text-amber-700 transition hover:brightness-95">Dismiss</button>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display text-2xl font-semibold">Session archive</h3>
              <p className="mt-1 text-sm text-slate">Saved pedagogical notes and follow-up actions</p>
            </div>
            <Download className="h-5 w-5 text-slate" />
          </div>
          <div className="mt-5 space-y-4">
            {data.archives.map((archive) => (
              <div key={archive.id} className="rounded-[24px] bg-mist px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-ink">{archive.title}</p>
                    <p className="mt-1 text-sm text-slate">{archive.date}</p>
                  </div>
                  <button onClick={() => setSelectedArchive(archive)} className="rounded-full bg-white px-4 py-2 text-sm text-ink transition hover:bg-ink hover:text-white">Open report</button>
                </div>
                <p className="mt-4 text-sm leading-6 text-slate">{archive.outcome}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {archive.actionItems.map((item) => (
                    <span key={item} className="rounded-full bg-white px-3 py-2 text-sm text-slate">{item}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Panel>

        {selectedArchive ? (
          <Panel>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-2xl font-semibold">Archive report</h3>
                <p className="mt-1 text-sm text-slate">{selectedArchive.title} · {selectedArchive.date}</p>
              </div>
              <button onClick={() => setSelectedArchive(null)} className="rounded-full bg-mist px-4 py-2 text-sm text-slate transition hover:bg-slate-200">
                Close
              </button>
            </div>
            <div className="mt-5 rounded-[24px] bg-mist p-5">
              <p className="text-sm uppercase tracking-[0.18em] text-slate">Outcome</p>
              <p className="mt-2 text-sm leading-7 text-ink">{selectedArchive.outcome}</p>
              <p className="mt-5 text-sm uppercase tracking-[0.18em] text-slate">Action items</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedArchive.actionItems.map((item: string) => (
                  <span key={item} className="rounded-full bg-white px-3 py-2 text-sm text-slate">{item}</span>
                ))}
              </div>
            </div>
          </Panel>
        ) : null}
      </div>
    </>
  );
}

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-[30px] border border-white/70 bg-white/85 p-6 shadow-panel ${className}`}>{children}</div>;
}

function MetricCard({
  icon: Icon,
  value,
  label,
  detail,
  tone,
}: {
  icon: typeof Gauge;
  value: string;
  label: string;
  detail: string;
  tone: string;
}) {
  return (
    <div className="rounded-[24px] bg-mist p-5">
      <div className={`inline-flex rounded-2xl p-3 ${tone}`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-4 font-display text-3xl font-semibold text-ink">{value}</p>
      <p className="mt-1 font-medium text-ink">{label}</p>
      <p className="mt-2 text-sm leading-6 text-slate">{detail}</p>
    </div>
  );
}

function AlertPanel({ signal, items }: { signal: SlowDownSignal | undefined; items: SlowDownSignal[] }) {
  return (
    <Panel className={signal ? "border-coral/30 bg-coral/5" : ""}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.24em] text-slate">Pacing safety</p>
          <h3 className="mt-2 font-display text-2xl font-semibold">Slow-down threshold</h3>
          <p className="mt-2 max-w-md text-sm leading-6 text-slate">
            When student taps cross the classroom threshold inside the active window, the dashboard surfaces a high-visibility alert so the teacher can pause and reframe.
          </p>
        </div>
        <div className={`rounded-2xl p-3 ${signal ? "bg-coral text-white" : "bg-mist text-tide"}`}>
          <AlertTriangle className="h-6 w-6" />
        </div>
      </div>
      <div className="mt-5 grid gap-3">
        {items.map((item) => (
          <div key={item.minute} className={`flex items-center justify-between rounded-2xl px-4 py-3 ${item.thresholdHit ? "bg-coral text-white" : "bg-mist text-ink"}`}>
            <span className="font-medium">{item.minute}</span>
            <span>{item.count} signals</span>
            <span>{item.thresholdHit ? "Teacher alerted" : "Monitoring"}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function InsightBlock({ icon: Icon, title, lines }: { icon: typeof Sparkles; title: string; lines: string[] }) {
  return (
    <div className="rounded-[24px] bg-mist p-5">
      <div className="flex items-center gap-3">
        <div className="rounded-2xl bg-white p-3 text-tide">
          <Icon className="h-5 w-5" />
        </div>
        <h4 className="font-medium text-ink">{title}</h4>
      </div>
      <div className="mt-4 space-y-2 text-sm leading-6 text-slate">
        {lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
    </div>
  );
}

export default TeacherDashboard;
