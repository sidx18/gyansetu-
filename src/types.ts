export type SlowDownSignal = {
  minute: string;
  count: number;
  thresholdHit: boolean;
};

export type PulsePoint = {
  minute: string;
  understanding: number;
  sentiment: number;
};

export type Question = {
  id: string;
  author: string;
  authorId?: string;
  text: string;
  votes: number;
  verified: boolean;
  status: "open" | "answered" | "flagged";
  topic: string;
};

export type SilentRequest = {
  id: string;
  student: string;
  type: "bathroom" | "urgent question" | "hand raise";
  note: string;
  time: string;
  status: "pending" | "approved" | "dismissed";
};

export type SessionArchive = {
  id: string;
  title: string;
  date: string;
  outcome: string;
  actionItems: string[];
};

export type ClassroomPulseReport = {
  summary: string;
  confusionPoints: string[];
  actionPlan: string[];
};

export type StudentSignal = {
  label: string;
  count: number;
};

export type AppNotification = {
  id: string;
  title: string;
  body: string;
  audience: "all" | "teacher" | "student";
  kind: "session" | "alert" | "request" | "question" | "ai" | "material";
  recipientUserId?: string;
  actionLabel?: string;
  actionUrl?: string;
  createdAtLabel?: string;
};

export type SessionMeta = {
  title: string;
  courseLabel: string;
  sessionCode: string;
  joinUrl: string;
  currentComprehension: string;
  moderationLabel: string;
  moderationDetail: string;
  updatedLabel: string;
};

export type ClassroomSessionData = {
  meta: SessionMeta;
  pulseHistory: PulsePoint[];
  slowdownSignals: SlowDownSignal[];
  questions: Question[];
  requests: SilentRequest[];
  archives: SessionArchive[];
  studentSignals: StudentSignal[];
  notifications: AppNotification[];
  source: "demo" | "firebase";
};
