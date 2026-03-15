
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
      sentimentScore: 50,
      keywords: []
    };
  }

  const feedbackContext = feedbacks.map(f => `Rating: ${f.rating}/5. Question: ${f.question}`).join("\n");

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Analyze this real-time classroom feedback and provide deep pedagogical insights.
    
    Student Feedback:
    ${feedbackContext}`,
    config: {
      systemInstruction: `You are an elite pedagogical strategist and learning scientist. Your mission is to provide the teacher with a high-fidelity "X-ray" of the classroom's mental state.
      
      Output Requirements:
      1. Summary: A nuanced overview of the class mood and clarity.
      2. Confusion Points: The specific technical hurdles or conceptual gaps identified.
      3. Topic Breakdown: List the primary topics being discussed and assign a confusion level (Low, Medium, High).
      4. Action Plan: A primary, high-impact intervention (3-5 minutes).
      5. Teaching Suggestions: Provide 2-3 alternative pedagogical approaches (e.g., a specific analogy, a "think-pair-share" prompt, or a visualization exercise).
      6. Sentiment Score: 0-100 (100 is maximum confidence).
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
                level: { type: Type.STRING, enum: ['Low', 'Medium', 'High'] }
              },
              required: ["topic", "level"]
            } 
          },
          actionPlan: { type: Type.STRING },
          teachingSuggestions: { 
            type: Type.ARRAY, 
            items: {
              type: Type.OBJECT,
              properties: {
                technique: { type: Type.STRING, description: "Name of the pedagogical strategy (e.g., 'The Bridge Analogy')." },
                description: { type: Type.STRING, description: "Detailed instruction on how to execute it." }
              },
              required: ["technique", "description"]
            }
          },
          sentimentScore: { type: Type.NUMBER },
          keywords: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ["summary", "confusionPoints", "topicBreakdown", "actionPlan", "teachingSuggestions", "sentimentScore", "keywords"]
      }
    }
  });

  try {
    const text = response.text || '{}';
    return JSON.parse(text) as AIInsights;
  } catch (e) {
    console.error("Failed to parse AI response", e);
    return {
      summary: "Pedagogical data stream interrupted.",
      confusionPoints: ["Data parsing error"],
      topicBreakdown: [],
      actionPlan: "Continue teaching and try refreshing in a moment.",
      teachingSuggestions: [],
      sentimentScore: 50,
      keywords: []
    };
  }
}
