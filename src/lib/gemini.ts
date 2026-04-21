import { GoogleGenAI } from "@google/genai";
import type { ClassroomPulseReport, ClassroomSessionData, Question } from "../types";
import { defaultReport } from "../data/mock";

const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

export async function generatePulseReport(
  questions: Question[],
): Promise<ClassroomPulseReport> {
  if (!apiKey) {
    return defaultReport;
  }

  const client = new GoogleGenAI({ apiKey });
  const prompt = `
You are helping a teacher adapt in real time.
Analyze this live classroom feedback and return strict JSON with keys:
summary (string), confusionPoints (string[]), actionPlan (string[]).

Questions:
${questions.map((question) => `- ${question.text}`).join("\n")}
`;

  try {
    const response = await client.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    const parsed = JSON.parse(response.text ?? "{}") as ClassroomPulseReport;
    if (
      typeof parsed.summary === "string" &&
      Array.isArray(parsed.confusionPoints) &&
      Array.isArray(parsed.actionPlan)
    ) {
      return parsed;
    }
  } catch (error) {
    console.warn("Gemini report generation failed, using fallback.", error);
  }

  return defaultReport;
}

export async function askClassroomAssistant(input: {
  question: string;
  session: ClassroomSessionData;
  role: "teacher" | "student";
}) {
  const fallback = buildFallbackReply(input.question, input.session, input.role);

  if (!apiKey) {
    return fallback;
  }

  const client = new GoogleGenAI({ apiKey });
  const prompt = `
You are GyanSetu AI, a concise classroom assistant for ${input.role}s.
Use the classroom state below to answer the user in 4 short bullet points max.

Session title: ${input.session.meta.title}
Course: ${input.session.meta.courseLabel}
Session code: ${input.session.meta.sessionCode}
Current comprehension: ${input.session.meta.currentComprehension}
Student signals: ${input.session.studentSignals.map((signal) => `${signal.label}: ${signal.count}`).join(", ")}
Open questions: ${input.session.questions.slice(0, 5).map((question) => question.text).join(" | ") || "None"}
Pending requests: ${input.session.requests.filter((request) => request.status === "pending").length}
Notifications: ${input.session.notifications.slice(0, 5).map((item) => item.title).join(" | ") || "None"}

User question: ${input.question}
`;

  try {
    const response = await client.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    const text = response.text?.trim();
    if (text) {
      return text;
    }
  } catch (error) {
    console.warn("Gemini chat failed, using fallback.", error);
  }

  return fallback;
}

function buildFallbackReply(question: string, session: ClassroomSessionData, role: "teacher" | "student") {
  const pendingRequests = session.requests.filter((request) => request.status === "pending").length;
  const topSignal = [...session.studentSignals].sort((left, right) => right.count - left.count)[0];
  const topQuestion = session.questions[0]?.text ?? "No live questions yet.";

  if (role === "teacher") {
    return [
      `Current top signal: ${topSignal?.label ?? "No signal yet"} (${topSignal?.count ?? 0}).`,
      `Pending silent requests: ${pendingRequests}.`,
      `Most recent student question: ${topQuestion}`,
      `Suggested next move: post a quick session update and recheck understanding after one example.`,
    ].join("\n");
  }

  return [
    `You are in session ${session.meta.sessionCode}.`,
    `Current classroom update: ${session.meta.currentComprehension}`,
    `Latest teacher-side activity: ${session.notifications[0]?.title ?? "No new teacher notification yet."}`,
    `You can ask: ${question || "for clarification, examples, or a pacing update."}`,
  ].join("\n");
}
