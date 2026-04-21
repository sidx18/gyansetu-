import type {
  ClassroomSessionData,
  ClassroomPulseReport,
  PulsePoint,
  Question,
  SessionMeta,
  SessionArchive,
  SilentRequest,
  SlowDownSignal,
  StudentSignal,
  AppNotification,
} from "../types";

export const defaultSessionMeta: SessionMeta = {
  title: "Monitor the room as it learns",
  courseLabel: "CS-402 live session",
  sessionCode: "CS402-ML",
  joinUrl: "gyansetu.app/join/CS402-ML",
  currentComprehension: "Current comprehension after the recap example",
  moderationLabel: "Protected",
  moderationDetail: "Spam, content, VPN checks on",
  updatedLabel: "Updated every 15 seconds",
};

export const pulseHistory: PulsePoint[] = [
  { minute: "09:00", understanding: 82, sentiment: 78 },
  { minute: "09:05", understanding: 76, sentiment: 74 },
  { minute: "09:10", understanding: 73, sentiment: 70 },
  { minute: "09:15", understanding: 67, sentiment: 63 },
  { minute: "09:20", understanding: 59, sentiment: 56 },
  { minute: "09:25", understanding: 72, sentiment: 69 },
  { minute: "09:30", understanding: 79, sentiment: 76 },
];

export const slowdownSignals: SlowDownSignal[] = [
  { minute: "09:12", count: 4, thresholdHit: false },
  { minute: "09:18", count: 11, thresholdHit: true },
  { minute: "09:27", count: 3, thresholdHit: false },
];

export const questions: Question[] = [
  {
    id: "q1",
    author: "Anonymous",
    text: "Can you show why backpropagation updates every layer and not only the last one?",
    votes: 18,
    verified: true,
    status: "open",
    topic: "Gradient flow",
  },
  {
    id: "q2",
    author: "Aarav",
    text: "Is overfitting the same as memorization in every case?",
    votes: 12,
    verified: false,
    status: "answered",
    topic: "Generalization",
  },
  {
    id: "q3",
    author: "Anonymous",
    text: "The loss function example moved too fast after the derivation step.",
    votes: 21,
    verified: true,
    status: "open",
    topic: "Loss function",
  },
];

export const requests: SilentRequest[] = [
  {
    id: "r1",
    student: "Seat B-12",
    type: "bathroom",
    note: "Back in 3 minutes",
    time: "09:14",
    status: "approved",
  },
  {
    id: "r2",
    student: "Seat A-04",
    type: "urgent question",
    note: "Need clarification before quiz starts",
    time: "09:19",
    status: "pending",
  },
  {
    id: "r3",
    student: "Seat C-07",
    type: "hand raise",
    note: "Wants to answer the example",
    time: "09:28",
    status: "pending",
  },
];

export const archives: SessionArchive[] = [
  {
    id: "s1",
    title: "Neural Networks: Week 4",
    date: "March 29, 2026",
    outcome: "Class confidence recovered after a worked example on gradient descent.",
    actionItems: [
      "Start next class with a one-minute recap on chain rule intuition.",
      "Share a visual cheat sheet on derivative symbols.",
    ],
  },
  {
    id: "s2",
    title: "Probability Distributions",
    date: "March 24, 2026",
    outcome: "Students were engaged but requested more pacing checks before proofs.",
    actionItems: [
      "Add checkpoint polls after each theorem.",
      "Move examples ahead of notation-heavy slides.",
    ],
  },
];

export const studentSignals: StudentSignal[] = [
  { label: "Following clearly", count: 18 },
  { label: "Need one more example", count: 9 },
  { label: "Lost at current step", count: 5 },
];

export const notifications: AppNotification[] = [
  {
    id: "n1",
    title: "Session live",
    body: "Students can now join with the active QR code and session link.",
    audience: "all",
    kind: "session",
    createdAtLabel: "09:00",
  },
  {
    id: "n2",
    title: "Need more pacing",
    body: "Slow-down threshold was crossed during the derivation segment.",
    audience: "teacher",
    kind: "alert",
    createdAtLabel: "09:18",
  },
  {
    id: "n3",
    title: "Clarification posted",
    body: "Teacher added an update about the loss function example.",
    audience: "student",
    kind: "question",
    createdAtLabel: "09:26",
  },
  {
    id: "n4",
    title: "New study material uploaded",
    body: "Gradient descent recap notes are ready for review after class.",
    audience: "student",
    kind: "material",
    actionLabel: "Open material",
    actionUrl: "https://example.com/gradient-descent-recap",
    createdAtLabel: "09:31",
  },
];

export const defaultReport: ClassroomPulseReport = {
  summary:
    "Students are attentive and motivated, but the live pulse dipped when the lecture shifted from concept review into symbolic derivation.",
  confusionPoints: [
    "Why gradients must propagate through hidden layers",
    "How the loss derivative connects to weight updates",
    "Difference between overfitting, memorization, and weak generalization",
  ],
  actionPlan: [
    "Pause the slide deck and reteach the current derivation with one color-coded worked example.",
    "Invite a low-stakes student verification step before resuming the next topic.",
    "Run a 30-second check-in poll after the recap to see whether confusion clears.",
  ],
};

export const defaultSessionData: ClassroomSessionData = {
  meta: defaultSessionMeta,
  pulseHistory,
  slowdownSignals,
  questions,
  requests,
  archives,
  studentSignals,
  notifications,
  source: "demo",
};
