
import { GoogleGenAI, Type } from "@google/genai";
import { Feedback, AIInsights } from "../types";

// Always use const ai = new GoogleGenAI({apiKey: process.env.API_KEY});
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export async function analyzeClassroomPulse(feedbacks: Feedback[]): Promise<AIInsights> {
  if (feedbacks.length === 0) {
    return {
      summary: "No feedback received yet.",
      confusionPoints: [],
      topicBreakdown: [],
      actionPlan: "Wait for students to submit their understanding levels.",
      teachingSuggestions: [],
      sentiment: { score: 50, label: "Neutral", nuance: "Waiting for data." },
      sentimentScore: 50,
      keywords: []
    };
  }

  const feedbackContext = feedbacks.map(f => `Rating: ${f.rating}/5. Question: ${f.question}`).join("\n");

  let response;
  try {
    response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Analyze this real-time classroom feedback and provide deep pedagogical insights.
      
      Student Feedback:
      ${feedbackContext}`,
      config: {
        systemInstruction: `You are an elite pedagogical strategist and learning scientist. Your mission is to provide the teacher with a high-fidelity "X-ray" of the classroom's mental state.
        
        Output Requirements:
        1. Summary: A nuanced overview of the class mood and clarity.
        2. Confusion Points: The specific technical hurdles or conceptual gaps identified.
        3. Topic Breakdown: List the primary topics being discussed, assign a confusion level (Low, Medium, High), and list specific confusion points for each topic.
        4. Action Plan: A primary, high-impact intervention (3-5 minutes).
        5. Teaching Suggestions: Provide 2-3 alternative pedagogical approaches beyond simple explanations (e.g., a specific analogy, a "think-pair-share" prompt, or a visualization exercise). Include a rationale for why this approach works for the identified confusion.
        6. Sentiment Analysis: A score (0-100), a label (e.g., "Frustrated", "Engaged", "Lost"), and a short description of the emotional state.
        7. Keywords: 5-8 recurring terms.`,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            confusionPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
            topicBreakdown: { 
              type: Type.ARRAY, 
              items: { 
                type: Type.OBJECT,
                properties: {
                  topic: { type: Type.STRING },
                  level: { type: Type.STRING, enum: ['Low', 'Medium', 'High'] },
                  specificConfusionPoints: { type: Type.ARRAY, items: { type: Type.STRING } }
                },
                required: ["topic", "level", "specificConfusionPoints"]
              } 
            },
            actionPlan: { type: Type.STRING },
            teachingSuggestions: { 
              type: Type.ARRAY, 
              items: {
                type: Type.OBJECT,
                properties: {
                  technique: { type: Type.STRING, description: "Name of the pedagogical strategy (e.g., 'The Bridge Analogy')." },
                  description: { type: Type.STRING, description: "Detailed instruction on how to execute it." },
                  rationale: { type: Type.STRING, description: "Why this works for the current classroom state." }
                },
                required: ["technique", "description", "rationale"]
              }
            },
            sentiment: {
              type: Type.OBJECT,
              properties: {
                score: { type: Type.NUMBER },
                label: { type: Type.STRING },
                nuance: { type: Type.STRING }
              },
              required: ["score", "label", "nuance"]
            },
            sentimentScore: { type: Type.NUMBER },
            keywords: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ["summary", "confusionPoints", "topicBreakdown", "actionPlan", "teachingSuggestions", "sentiment", "sentimentScore", "keywords"]
        }
      }
    });
  } catch (error) {
    console.error("Gemini API call failed:", error);
    return {
      summary: "The AI analysis service is currently unreachable.",
      confusionPoints: ["Network error or service disruption"],
      topicBreakdown: [],
      actionPlan: "Please check your internet connection and try again.",
      teachingSuggestions: [],
      sentiment: { score: 50, label: "Offline", nuance: "AI service connection failed." },
      sentimentScore: 50,
      keywords: []
    };
  }

  try {
    const text = response.text || '{}';
    const parsed = JSON.parse(text);
    // Ensure backward compatibility if the model doesn't return sentimentScore but returns sentiment.score
    if (parsed.sentiment && parsed.sentimentScore === undefined) {
      parsed.sentimentScore = parsed.sentiment.score;
    }
    return parsed as AIInsights;
  } catch (e) {
    console.error("Failed to parse AI response", e);
    return {
      summary: "Pedagogical data stream interrupted.",
      confusionPoints: ["Data parsing error"],
      topicBreakdown: [],
      actionPlan: "Continue teaching and try refreshing in a moment.",
      teachingSuggestions: [],
      sentiment: { score: 50, label: "Error", nuance: "Failed to parse AI response." },
      sentimentScore: 50,
      keywords: []
    };
  }
}
