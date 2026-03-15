
export interface Answer {
  id: string;
  text: string;
  timestamp: number;
  studentIp?: string;
  isVerified: boolean;
}

export interface Feedback {
  id: string;
  rating: number; // 1-5
  question: string;
  timestamp: number;
  studentIp?: string;
  answers: Answer[];
}

export interface SlowDownEvent {
  id: string;
  timestamp: number;
  studentIp?: string;
}

export type RequestStatus = 'pending' | 'approved' | 'wait' | 'dismissed';
export type RequestType = 'bathroom' | 'urgent-question' | 'hand-raise' | 'after-class';

export interface SilentRequest {
  id: string;
  type: RequestType;
  status: RequestStatus;
  timestamp: number;
  studentIp?: string;
}

export interface Session {
  id: string;
  className: string;
  topic: string;
  createdAt: number;
  feedbacks: Feedback[];
  slowDownEvents: SlowDownEvent[];
  silentRequests: SilentRequest[];
  estimatedStudentCount: number;
}

export interface TopicInsight {
  topic: string;
  level: 'Low' | 'Medium' | 'High';
}

export interface TeachingStrategy {
  technique: string;
  description: string;
}

export interface AIInsights {
  summary: string;
  confusionPoints: string[];
  topicBreakdown: TopicInsight[];
  actionPlan: string;
  teachingSuggestions: TeachingStrategy[];
  sentimentScore: number; // 0-100
  keywords: string[];
}

export type ViewMode = 'landing' | 'teacher-login' | 'teacher-dashboard' | 'student-form';
