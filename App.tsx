
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Users, 
  Presentation, 
  MessageCircle, 
  ArrowRight, 
  Sparkles, 
  RefreshCcw, 
  LogOut, 
  CheckCircle2, 
  PlayCircle, 
  Globe, 
  GraduationCap,
  Timer,
  AlertTriangle,
  Snail,
  ShieldAlert,
  Loader2,
  Settings2,
  MessageSquarePlus,
  BadgeCheck,
  Send,
  Check,
  Coffee,
  HelpCircle,
  Clock,
  ThumbsUp,
  XCircle,
  BellRing,
  ShieldCheck,
  ZapOff,
  Activity,
  Hand,
  Lightbulb,
  Layers,
  Eye,
  EyeOff,
  Fingerprint
} from 'lucide-react';
import { Feedback, Session, ViewMode, AIInsights, SlowDownEvent, Answer, SilentRequest, RequestType, RequestStatus } from './types';
import { analyzeClassroomPulse } from './services/geminiService';
import { PulseChart } from './components/PulseChart';
import { QRCodeComponent } from './components/QRCodeComponent';
import { filterContent, isSpam } from './utils/moderation';
import { SentimentMeter } from './components/SentimentMeter';

const INITIAL_SESSION: Session = {
  id: `session-${Math.floor(100 + Math.random() * 900)}`,
  className: 'New Classroom Session',
  topic: 'General Discussion',
  createdAt: Date.now(),
  feedbacks: [],
  slowDownEvents: [],
  silentRequests: [],
  estimatedStudentCount: 30 
};

const App: React.FC = () => {
  const [viewMode, setViewMode] = useState<ViewMode>('landing');
  const [isTeacherLoggedIn, setIsTeacherLoggedIn] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  
  const [session, setSession] = useState<Session>(INITIAL_SESSION);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [insights, setInsights] = useState<AIInsights | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [clientIp, setClientIp] = useState<string | undefined>();
  const [isVpn, setIsVpn] = useState<boolean>(false);
  const [ipLoading, setIpLoading] = useState<boolean>(true);
  const [lastSlowDownAt, setLastSlowDownAt] = useState<number>(0);

  // Rate Limiting state
  const [lastPulseAt, setLastPulseAt] = useState<number>(0);
  const [lastAnswerAt, setLastAnswerAt] = useState<number>(0);
  const [cooldownSeconds, setCooldownSeconds] = useState<number>(0);
  const [moderationWarning, setModerationWarning] = useState<string | null>(null);
  
  // Teacher UI state
  const [isEditingClassSize, setIsEditingClassSize] = useState(false);
  const [tempClassSize, setTempClassSize] = useState(session.estimatedStudentCount);
  const [visibleIps, setVisibleIps] = useState<Set<string>>(new Set());

  // Student Form State
  const [studentRating, setStudentRating] = useState<number>(0);
  const [studentQuestion, setStudentQuestion] = useState('');
  const [answeringQuestionId, setAnsweringQuestionId] = useState<string | null>(null);
  const [studentAnswerText, setStudentAnswerText] = useState('');

  // Robust IP & VPN Detection
  const checkSecurity = useCallback(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    try {
      setIpLoading(true);
      const ipResponse = await fetch('https://api.ipify.org?format=json', { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!ipResponse.ok) throw new Error('IP fetch failed');
      const { ip } = await ipResponse.json();
      setClientIp(ip);
      try {
        const detailResponse = await fetch(`https://ipapi.co/${ip}/json/`);
        if (detailResponse.ok) {
          const data = await detailResponse.json();
          const suspiciousOrgs = ['Amazon', 'Google Cloud', 'DigitalOcean', 'Linode', 'OVH', 'M247', 'Datacamp', 'Choopa', 'Hosting'];
          const isSuspiciousOrg = suspiciousOrgs.some(org => 
            (data.org || '').toLowerCase().includes(org.toLowerCase()) || 
            (data.asn || '').toLowerCase().includes(org.toLowerCase())
          );
          if (isSuspiciousOrg || data.proxy === true || data.vpn === true) {
            setIsVpn(true);
          }
        }
      } catch (e) {}
    } catch (e) {
      setIsVpn(false);
    } finally {
      setIpLoading(false);
    }
  }, []);

  useEffect(() => {
    checkSecurity();
  }, [checkSecurity]);

  // Cooldown timer effect
  useEffect(() => {
    if (cooldownSeconds > 0) {
      const timer = setTimeout(() => setCooldownSeconds(c => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldownSeconds]);

  const activeAlert = useMemo(() => {
    const now = Date.now();
    const threshold = 60000; 
    const recentEvents = session.slowDownEvents.filter(e => now - e.timestamp < threshold);
    const uniqueStudentsCount = new Set(recentEvents.map(e => e.studentIp)).size;
    const requiredSignals = Math.max(1, Math.ceil(session.estimatedStudentCount * 0.10));
    return uniqueStudentsCount >= requiredSignals;
  }, [session.slowDownEvents, session.estimatedStudentCount]);

  const fetchAIInsights = useCallback(async () => {
    if (session.feedbacks.length === 0) return;
    setIsAnalyzing(true);
    const result = await analyzeClassroomPulse(session.feedbacks);
    setInsights(result);
    setIsAnalyzing(false);
  }, [session.feedbacks]);

  const handleTeacherLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (loginEmail && loginPassword) {
      setIsTeacherLoggedIn(true);
      setViewMode('teacher-dashboard');
      if (!insights) fetchAIInsights();
    }
  };

  const handleUpdateClassSize = () => {
    setSession(prev => ({ ...prev, estimatedStudentCount: tempClassSize }));
    setIsEditingClassSize(false);
  };

  const toggleIpVisibility = (id: string) => {
    setVisibleIps(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleStudentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (studentRating === 0 || isVpn || cooldownSeconds > 0) return;

    const now = Date.now();
    if (now - lastPulseAt < 15000) {
      setCooldownSeconds(15);
      return;
    }

    const cleanQuestion = filterContent(studentQuestion);
    if (isSpam(studentQuestion)) {
      setModerationWarning("Spam detected. Please provide a genuine question.");
      setTimeout(() => setModerationWarning(null), 3000);
      return;
    }

    if (cleanQuestion !== studentQuestion) {
      setModerationWarning("Your question was moderated to maintain classroom standards.");
      setTimeout(() => setModerationWarning(null), 5000);
    }

    const newFeedback: Feedback = {
      id: Math.random().toString(36).substr(2, 9),
      rating: studentRating,
      question: cleanQuestion,
      timestamp: now,
      studentIp: clientIp,
      answers: []
    };
    
    setSession(prev => ({ ...prev, feedbacks: [newFeedback, ...prev.feedbacks] }));
    setSubmitted(true);
    setLastPulseAt(now);
    setStudentRating(0);
    setStudentQuestion('');
    setCooldownSeconds(30); 
    setTimeout(() => setSubmitted(false), 3000);
  };

  const handleSilentRequest = (type: RequestType) => {
    if (isVpn) return;
    const existing = session.silentRequests.find(r => r.studentIp === clientIp && r.status === 'pending');
    if (existing) return;

    const newRequest: SilentRequest = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      status: 'pending',
      timestamp: Date.now(),
      studentIp: clientIp
    };

    setSession(prev => ({
      ...prev,
      silentRequests: [newRequest, ...prev.silentRequests]
    }));
  };

  const updateRequestStatus = (requestId: string, status: RequestStatus) => {
    setSession(prev => ({
      ...prev,
      silentRequests: prev.silentRequests.map(r => 
        r.id === requestId ? { ...r, status } : r
      )
    }));
  };

  const studentCurrentRequest = useMemo(() => {
    return session.silentRequests.find(r => r.studentIp === clientIp && r.status !== 'dismissed');
  }, [session.silentRequests, clientIp]);

  const handleStudentAnswer = (questionId: string) => {
    if (!studentAnswerText.trim() || isVpn) return;
    const now = Date.now();
    if (now - lastAnswerAt < 10000) {
      setModerationWarning("Please wait a moment before answering another question.");
      setTimeout(() => setModerationWarning(null), 3000);
      return;
    }

    const cleanAnswer = filterContent(studentAnswerText);
    if (isSpam(studentAnswerText)) {
      setModerationWarning("Answer blocked: Excessive repetition or spam pattern.");
      setTimeout(() => setModerationWarning(null), 3000);
      return;
    }

    const newAnswer: Answer = {
      id: Math.random().toString(36).substr(2, 9),
      text: cleanAnswer,
      timestamp: now,
      studentIp: clientIp,
      isVerified: false
    };

    setSession(prev => ({
      ...prev,
      feedbacks: prev.feedbacks.map(f => 
        f.id === questionId ? { ...f, answers: [...f.answers, newAnswer] } : f
      )
    }));
    
    setStudentAnswerText('');
    setAnsweringQuestionId(null);
    setLastAnswerAt(now);
    
    if (cleanAnswer !== studentAnswerText) {
      setModerationWarning("Answer moderated for classroom standards.");
      setTimeout(() => setModerationWarning(null), 3000);
    }
  };

  const verifyAnswer = (questionId: string, answerId: string) => {
    setSession(prev => ({
      ...prev,
      feedbacks: prev.feedbacks.map(f => 
        f.id === questionId ? { 
          ...f, 
          answers: f.answers.map(a => a.id === answerId ? { ...a, isVerified: !a.isVerified } : a) 
        } : f
      )
    }));
  };

  const handleSlowDown = () => {
    if (isVpn) return;
    const now = Date.now();
    if (now - lastSlowDownAt < 30000) return;
    const newEvent: SlowDownEvent = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: now,
      studentIp: clientIp
    };
    setSession(prev => ({ ...prev, slowDownEvents: [...prev.slowDownEvents, newEvent] }));
    setLastSlowDownAt(now);
  };

  const handleLogout = () => {
    setIsTeacherLoggedIn(false);
    setViewMode('landing');
  };

  const renderVpnBlock = () => (
    <div className="max-w-md mx-auto mt-20 text-center px-4 animate-in fade-in zoom-in-95 duration-500">
      <div className="bg-white rounded-[2.5rem] p-12 shadow-2xl border border-red-100 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-2 bg-red-500"></div>
        <div className="inline-flex items-center justify-center w-20 h-20 bg-red-50 text-red-600 rounded-2xl mb-8">
          <ShieldAlert className="w-10 h-10" />
        </div>
        <h2 className="text-3xl font-black text-slate-900 mb-4">Access Restricted</h2>
        <p className="text-slate-600 mb-8 leading-relaxed">GyanSetu detected a VPN. Please disable it to participate.</p>
        <button onClick={() => window.location.reload()} className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold hover:bg-slate-800 transition-all flex items-center justify-center gap-2">
          <RefreshCcw className="w-4 h-4" /> Refresh Connection
        </button>
      </div>
    </div>
  );

  const getRequestIcon = (type: RequestType) => {
    switch (type) {
      case 'bathroom': return <Coffee className="w-5 h-5" />;
      case 'urgent-question': return <HelpCircle className="w-5 h-5" />;
      case 'hand-raise': return <Hand className="w-5 h-5" />;
      case 'after-class': return <MessageCircle className="w-5 h-5" />;
    }
  };

  const renderLanding = () => (
    <div className="max-w-4xl mx-auto mt-12 md:mt-20 text-center animate-in fade-in slide-in-from-bottom-4 duration-700 px-4">
      <div className="inline-flex items-center justify-center w-24 h-24 bg-indigo-600 text-white rounded-3xl shadow-2xl mb-8 transform hover:rotate-12 transition-transform">
        <GraduationCap className="w-12 h-12" />
      </div>
      <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-slate-900 mb-6 tracking-tight">
        Welcome to <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">GyanSetu</span>
      </h1>
      <p className="text-xl text-slate-600 mb-12 max-w-2xl mx-auto leading-relaxed">Frictionless feedback, silent logistics, and AI-powered learning pivots.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto">
        <button onClick={() => setViewMode('teacher-login')} className="group flex flex-col items-center p-8 md:p-10 bg-white rounded-[2.5rem] border-2 border-slate-100 hover:border-indigo-500 hover:shadow-2xl transition-all relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-50 rounded-bl-[4rem] -mr-6 -mt-6 group-hover:scale-110 transition-transform"></div>
          <Presentation className="w-10 h-10 text-indigo-600 mb-6 relative z-10" />
          <h3 className="text-2xl font-bold text-slate-800 mb-2 relative z-10">Teacher</h3>
          <p className="text-slate-400 text-sm font-medium">Manage pulse & AI insights</p>
        </button>
        <button onClick={() => setViewMode('student-form')} className="group flex flex-col items-center p-8 md:p-10 bg-white rounded-[2.5rem] border-2 border-slate-100 hover:border-violet-500 hover:shadow-2xl transition-all relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-violet-50 rounded-bl-[4rem] -mr-6 -mt-6 group-hover:scale-110 transition-transform"></div>
          <Users className="w-10 h-10 text-violet-600 mb-6 relative z-10" />
          <h3 className="text-2xl font-bold text-slate-800 mb-2 relative z-10">Student</h3>
          <p className="text-slate-400 text-sm font-medium">Send feedback & silent requests</p>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans overflow-x-hidden">
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-50 shadow-sm h-20">
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-full flex items-center justify-between">
          <div onClick={() => setViewMode('landing')} className="flex items-center space-x-3 cursor-pointer group">
            <div className="bg-indigo-600 p-2 rounded-xl group-hover:scale-110 transition-transform">
               <GraduationCap className="text-white w-6 h-6" />
            </div>
            <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tighter">GyanSetu</h1>
          </div>
          {isTeacherLoggedIn && viewMode === 'teacher-dashboard' && (
            <div className="flex items-center gap-3 md:gap-4">
               <div className="hidden sm:flex flex-col items-end mr-2">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Teacher</span>
                  <span className="text-sm font-bold text-slate-700 truncate max-w-[120px]">{loginEmail}</span>
               </div>
               <button onClick={handleLogout} className="flex items-center gap-2 px-3 py-2 md:px-5 md:py-2.5 text-rose-500 hover:bg-rose-50 rounded-xl transition-all font-bold border border-transparent hover:border-rose-100">
                <LogOut className="w-4 h-4" /> <span className="hidden xs:inline">Sign Out</span>
               </button>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-10 w-full">
        {viewMode === 'landing' && renderLanding()}
        {viewMode === 'teacher-login' && (
          <div className="max-w-md mx-auto mt-6 md:mt-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <form onSubmit={handleTeacherLogin} className="bg-white rounded-[2.5rem] p-8 md:p-10 shadow-2xl space-y-8 border border-slate-100">
              <div className="text-center space-y-2">
                <h2 className="text-3xl font-black text-slate-800 tracking-tight italic">Educator Access</h2>
                <p className="text-slate-400 text-sm font-medium">Enter your credentials to manage the classroom</p>
              </div>
              <div className="space-y-4">
                <div className="space-y-1">
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Email Address</label>
                   <input type="email" required value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:border-indigo-500 transition-all font-medium" placeholder="teacher@university.edu" />
                </div>
                <div className="space-y-1">
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Secure Passcode</label>
                   <input type="password" required value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:border-indigo-500 transition-all font-medium" placeholder="••••••••" />
                </div>
              </div>
              <button type="submit" className="w-full bg-indigo-600 text-white py-5 rounded-[1.5rem] font-black shadow-xl shadow-indigo-100 hover:bg-indigo-700 active:scale-95 transition-all flex items-center justify-center gap-2">
                Join Control Deck <ArrowRight className="w-5 h-5" />
              </button>
            </form>
          </div>
        )}
        
        {viewMode === 'teacher-dashboard' && isTeacherLoggedIn && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 md:gap-8 pb-20">
            {/* Left Rail: Logistics */}
            <div className="lg:col-span-1 space-y-6 flex flex-col">
               <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-200 flex flex-col h-full min-h-[400px] lg:max-h-[850px] overflow-hidden">
                <div className="p-6 md:p-8 border-b bg-slate-50/50 font-black text-lg flex items-center justify-between">
                  <span className="flex items-center gap-2 text-slate-800">
                    <BellRing className="w-5 h-5 text-rose-500" />
                    Logistics Queue
                  </span>
                  <span className="text-[10px] bg-rose-500 text-white px-3 py-1 rounded-full font-black animate-pulse">
                    {session.silentRequests.filter(r => r.status === 'pending').length}
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
                  {session.silentRequests.filter(r => r.status !== 'dismissed').length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center opacity-30 text-center px-4 py-12">
                       <Clock className="w-12 h-12 mb-4" />
                       <p className="text-sm font-bold leading-relaxed">No pending logistics requests from students.</p>
                    </div>
                  ) : (
                    session.silentRequests.filter(r => r.status !== 'dismissed').map(r => (
                      <div key={r.id} className={`p-5 rounded-[1.5rem] border-2 transition-all animate-in slide-in-from-left-2 ${r.status === 'pending' ? 'bg-white border-rose-100 shadow-md' : r.status === 'approved' ? 'bg-emerald-50 border-emerald-100 opacity-60' : 'bg-amber-50 border-amber-100 opacity-60'}`}>
                        <div className="flex items-center justify-between mb-3">
                           <div className="flex items-center gap-3">
                              <div className="bg-slate-100 p-2.5 rounded-xl text-slate-600 shadow-inner">{getRequestIcon(r.type)}</div>
                              <span className="text-[10px] font-black uppercase tracking-widest text-slate-800">{r.type.replace('-', ' ')}</span>
                           </div>
                           <span className="text-[10px] font-bold text-slate-400">{new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        {r.status === 'pending' ? (
                          <div className="flex gap-2 mt-4">
                            <button onClick={() => updateRequestStatus(r.id, 'approved')} className={`flex-1 bg-emerald-500 text-white py-2.5 rounded-xl text-xs font-black hover:bg-emerald-600 flex items-center justify-center gap-1 transition-all hover:scale-105`}>Approve</button>
                            <button onClick={() => updateRequestStatus(r.id, 'wait')} className="flex-1 bg-amber-500 text-white py-2.5 rounded-xl text-xs font-black hover:bg-amber-600 flex items-center justify-center gap-1 transition-all hover:scale-105">Delay</button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100/50">
                             <span className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-1 ${r.status === 'approved' ? 'text-emerald-600' : 'text-amber-600'}`}>
                               {r.status}
                             </span>
                             <button onClick={() => updateRequestStatus(r.id, 'dismissed')} className="text-slate-300 hover:text-slate-600 transition-colors p-1"><XCircle className="w-5 h-5" /></button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Center: Analytics */}
            <div className="lg:col-span-2 space-y-8 order-first lg:order-none">
              {activeAlert && (
                <div className="bg-amber-100 border-4 border-amber-400 rounded-[2.5rem] p-6 md:p-8 flex flex-col sm:flex-row items-center gap-6 shadow-2xl animate-in slide-in-from-top-4 relative overflow-hidden ring-4 md:ring-8 ring-amber-400/10">
                  <div className="relative">
                    <div className="absolute inset-0 bg-amber-400 rounded-full blur-xl animate-pulse opacity-50"></div>
                    <AlertTriangle className="text-amber-600 w-12 h-12 md:w-16 md:h-16 animate-bounce relative z-10" />
                  </div>
                  <div className="flex-1 text-center sm:text-left">
                    <h4 className="text-amber-950 font-black text-2xl md:text-3xl tracking-tight uppercase italic mb-1">Caution: Slow Down</h4>
                    <p className="text-amber-900 font-bold opacity-80 text-base md:text-xl leading-tight">Student understanding is dropping significantly.</p>
                  </div>
                </div>
              )}
              
              <div className="bg-white rounded-[2.5rem] p-6 md:p-10 shadow-sm border border-slate-200">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 md:mb-10">
                  <div className="space-y-1">
                    <span className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em]">Live Classroom Telemetry</span>
                    <h3 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Understanding Pulse</h3>
                  </div>
                  <button onClick={() => setIsEditingClassSize(!isEditingClassSize)} className="p-3 bg-slate-50 rounded-2xl border-2 border-slate-100 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-all active:scale-95"><Settings2 className="w-6 h-6" /></button>
                </div>

                {isEditingClassSize && (
                  <div className="mb-10 p-6 md:p-8 bg-slate-50 rounded-[2rem] border-2 border-indigo-100 flex flex-col sm:flex-row items-end gap-4 animate-in slide-in-from-top-4">
                    <div className="flex-1 w-full">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Estimated Class Size</p>
                      <input type="number" value={tempClassSize} onChange={(e) => setTempClassSize(parseInt(e.target.value) || 1)} className="w-full p-4 bg-white border-2 border-slate-100 rounded-xl font-black text-2xl shadow-inner outline-none focus:border-indigo-500 transition-all" />
                    </div>
                    <button onClick={handleUpdateClassSize} className="w-full sm:w-auto bg-indigo-600 text-white px-8 py-5 rounded-xl font-black shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95">Apply</button>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-10">
                  <div className="md:col-span-2 overflow-x-hidden">
                    <PulseChart feedbacks={session.feedbacks} />
                  </div>
                  <div className="flex flex-col gap-6 items-center">
                    <SentimentMeter score={insights?.sentimentScore ?? 50} />
                  </div>
                </div>
              </div>

              {insights && insights.topicBreakdown.length > 0 && (
                <div className="bg-white rounded-[2.5rem] p-6 md:p-10 shadow-sm border border-slate-200">
                  <div className="flex items-center gap-3 mb-8">
                    <div className="bg-indigo-50 p-2.5 rounded-xl text-indigo-600"><Layers className="w-6 h-6" /></div>
                    <h3 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">Conceptual Heatmap</h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {insights.topicBreakdown.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between p-4 bg-slate-50/80 rounded-2xl border-2 border-slate-100 hover:border-indigo-100 transition-colors">
                        <span className="font-bold text-slate-700 truncate mr-2">{item.topic}</span>
                        <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest shrink-0 ${
                          item.level === 'High' ? 'bg-rose-500 text-white' : 
                          item.level === 'Medium' ? 'bg-amber-500 text-white' : 
                          'bg-emerald-500 text-white'
                        }`}>
                          {item.level} Risk
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-gradient-to-br from-indigo-800 via-indigo-900 to-slate-950 rounded-[3.5rem] p-8 md:p-12 text-white shadow-2xl relative overflow-hidden border-4 border-white/5 group">
                <h3 className="text-2xl md:text-3xl font-black flex items-center gap-4 mb-8 md:mb-10 relative z-10">
                  <Sparkles className="text-yellow-400 w-8 h-8 animate-pulse" /> AI intervention
                </h3>
                
                {insights ? (
                  <div className="space-y-8 md:space-y-10 relative z-10">
                    <div className="p-5 md:p-6 bg-white/5 backdrop-blur-sm rounded-3xl border border-white/10 italic text-lg md:text-xl leading-relaxed text-indigo-100 shadow-inner">
                       "{insights.summary}"
                    </div>
                    
                    <div className="bg-white/10 backdrop-blur-md p-6 md:p-8 rounded-[2.5rem] border border-white/10">
                      <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-300 mb-6 flex items-center gap-3">
                        <Lightbulb className="w-5 h-5" /> Confusion Points
                      </h4>
                      <ul className="space-y-4">
                        {insights.confusionPoints.map((p, idx) => (
                           <li key={idx} className="flex items-start gap-3 text-base font-bold text-indigo-50">
                             <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" /> 
                             <span>{p}</span>
                           </li>
                        ))}
                      </ul>
                    </div>

                    <div className="bg-white text-slate-900 p-8 md:p-10 rounded-[2.5rem] shadow-2xl border-b-8 border-indigo-200">
                      <span className="text-[10px] block font-black uppercase tracking-[0.15em] text-indigo-600 mb-2 italic">Recommended Strategy</span>
                      <p className="font-black text-xl md:text-2xl lg:text-3xl tracking-tight leading-tight">{insights.actionPlan}</p>
                    </div>
                  </div>
                ) : (
                  <button onClick={fetchAIInsights} disabled={isAnalyzing || session.feedbacks.length === 0} className="w-full bg-white text-indigo-900 px-6 py-8 md:py-10 rounded-[2.5rem] font-black text-xl md:text-2xl shadow-2xl transition-all flex items-center justify-center gap-4 hover:bg-indigo-50 active:scale-95 disabled:opacity-50">
                    <RefreshCcw className={`w-6 h-6 md:w-8 md:h-8 ${isAnalyzing ? 'animate-spin' : ''}`} />
                    {isAnalyzing ? 'Analyzing...' : 'Synthesize Insights'}
                  </button>
                )}
              </div>
            </div>

            {/* Right Rail: Feed */}
            <div className="lg:col-span-1 space-y-6 flex flex-col">
              <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-200 flex flex-col h-full min-h-[400px] lg:max-h-[850px] overflow-hidden">
                <div className="p-6 md:p-8 border-b bg-slate-50/50 font-black text-lg flex items-center justify-between">
                  <span className="flex items-center gap-2 text-slate-800">
                    <MessageSquarePlus className="w-5 h-5 text-indigo-600" />
                    Student Q&A
                  </span>
                  <span className="text-[10px] bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full font-black uppercase">{session.feedbacks.length} Pulses</span>
                </div>
                <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-8">
                  {session.feedbacks.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center opacity-30 text-center px-4 py-12">
                       <MessageCircle className="w-12 h-12 mb-4" />
                       <p className="text-sm font-bold leading-relaxed">No questions from students yet.</p>
                    </div>
                  ) : (
                    session.feedbacks.map((f) => (
                      <div key={f.id} className="space-y-4">
                        <div 
                          onClick={() => toggleIpVisibility(f.id)}
                          className="bg-slate-50/50 p-5 rounded-[1.5rem] border-2 border-transparent hover:border-indigo-100 transition-all cursor-pointer group"
                        >
                          <div className="flex justify-between items-center mb-3">
                            <span className={`px-2 py-0.5 rounded-full text-white font-black text-[8px] uppercase tracking-widest ${f.rating < 3 ? 'bg-rose-500' : 'bg-emerald-500'}`}>{f.rating}/5</span>
                            <span className="text-[9px] text-slate-400 font-bold">{new Date(f.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                          <p className="font-bold text-slate-800 text-sm leading-snug mb-3">
                            {f.question || "Rating pulse."}
                          </p>
                          
                          <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                  {visibleIps.has(f.id) ? (
                                      <div className="flex items-center gap-1.5 bg-slate-900 text-white px-2 py-0.5 rounded-lg text-[9px] font-black">
                                          <Fingerprint className="w-3 h-3 text-indigo-400" /> {f.studentIp}
                                      </div>
                                  ) : (
                                      <EyeOff className="w-3 h-3 text-slate-300" />
                                  )}
                              </div>
                              <span className="text-[8px] font-black text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity uppercase tracking-tighter">
                                  {visibleIps.has(f.id) ? 'Hide' : 'Show IP'}
                              </span>
                          </div>
                        </div>
                        
                        {f.answers.length > 0 && (
                          <div className="pl-4 space-y-3 border-l-2 border-slate-100 ml-3">
                            {f.answers.map(a => (
                              <div 
                                key={a.id} 
                                onClick={(e) => { if (a.isVerified) toggleIpVisibility(a.id); e.stopPropagation(); }}
                                className={`p-4 rounded-xl text-xs flex flex-col gap-2 border-2 transition-all ${a.isVerified ? 'border-emerald-500 bg-emerald-50 cursor-pointer' : 'bg-white border-slate-100'}`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <p className="font-bold text-slate-700 leading-relaxed flex-1">{a.text}</p>
                                  <button onClick={(e) => { verifyAnswer(f.id, a.id); e.stopPropagation(); }} className={`p-1 rounded-full shadow-sm shrink-0 ${a.isVerified ? 'bg-emerald-600 text-white' : 'bg-slate-50 text-slate-300'}`}>
                                    <Check className="w-3 h-3" />
                                  </button>
                                </div>
                                {a.isVerified && visibleIps.has(a.id) && (
                                  <div className="bg-emerald-900 text-white px-1.5 py-0.5 rounded-md text-[8px] font-black inline-flex items-center gap-1 self-start">
                                    <Fingerprint className="w-2.5 h-2.5" /> {a.studentIp}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Final QR Section */}
            <div className="lg:col-span-4 mt-8 w-full">
              <div className="bg-white rounded-[3.5rem] p-8 md:p-12 border-2 border-indigo-100 shadow-2xl flex flex-col lg:flex-row items-center justify-center gap-12 lg:gap-16 relative overflow-hidden">
                <div className="relative z-10 w-full max-w-[320px] md:max-w-[380px] flex-shrink-0">
                  <QRCodeComponent value={`https://socratic.edu/${session.id}`} size={undefined} />
                </div>
                
                <div className="relative z-10 text-center lg:text-left space-y-6 md:space-y-8 max-w-xl">
                  <div className="space-y-3">
                    <h3 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tight italic">Class Invitation</h3>
                    <p className="text-slate-500 font-medium text-lg md:text-xl leading-relaxed">Display this QR for your students to join the feedback loop.</p>
                  </div>
                  
                  <div className="p-8 md:p-10 bg-slate-50 rounded-[3rem] border-2 border-slate-100 shadow-inner w-full">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.5em] mb-2 text-center">Session ID</p>
                    <p className="text-5xl md:text-7xl font-black text-indigo-600 tracking-tighter text-center">{session.id}</p>
                  </div>
                  
                  <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4">
                    <div className="px-6 py-3 bg-indigo-50 rounded-2xl border border-indigo-100 text-indigo-600 font-black text-xs uppercase tracking-widest flex items-center gap-2">
                       <Globe className="w-4 h-4" /> socratic.edu/{session.id}
                    </div>
                    <span className="text-[9px] font-black text-slate-300 uppercase tracking-[0.2em] flex items-center gap-1">
                       <ShieldCheck className="w-4 h-4" /> Encrypted Session
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {viewMode === 'student-form' && (
          ipLoading ? (
            <div className="text-center py-24 flex flex-col items-center gap-6">
              <Loader2 className="w-16 h-16 animate-spin text-indigo-600" />
              <p className="text-xl font-black text-slate-400">Authenticating Session...</p>
            </div>
          ) : isVpn ? renderVpnBlock() : (
            <div className="max-w-xl mx-auto space-y-8 md:space-y-12 animate-in fade-in slide-in-from-bottom-8 duration-700 pb-24 px-1">
              {moderationWarning && (
                <div className="fixed bottom-8 left-4 right-4 md:left-1/2 md:-translate-x-1/2 z-[100] bg-rose-600 text-white px-6 py-4 rounded-2xl shadow-2xl font-black flex items-center gap-3 animate-in slide-in-from-bottom-6 border-2 border-white/20">
                   <ZapOff className="w-6 h-6 shrink-0" />
                   <span className="text-sm md:text-base">{moderationWarning}</span>
                </div>
              )}

              {studentCurrentRequest && (
                <div className={`p-6 md:p-8 rounded-[2.5rem] border-4 flex items-center gap-4 md:gap-6 shadow-xl animate-in zoom-in-95 ${studentCurrentRequest.status === 'pending' ? 'bg-white border-slate-200' : 'bg-emerald-600 border-emerald-400 text-white'}`}>
                  <div className={`p-4 rounded-2xl ${studentCurrentRequest.status === 'pending' ? 'bg-slate-100 text-slate-500' : 'bg-white/20 text-white'}`}>
                     <Clock className={`w-8 h-8 md:w-10 md:h-10 ${studentCurrentRequest.status === 'pending' ? 'animate-pulse' : ''}`} />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-black text-xl md:text-2xl tracking-tight">
                      {studentCurrentRequest.status === 'pending' ? 'Signal Pending' : 'Signal Confirmed'}
                    </h4>
                    <p className="text-xs md:text-sm font-bold opacity-80 leading-snug">
                      {studentCurrentRequest.status === 'pending' ? 'Teacher notified.' : 'Confirmed. Proceed silently.'}
                    </p>
                  </div>
                  <button onClick={() => updateRequestStatus(studentCurrentRequest.id, 'dismissed')} className="p-2 hover:bg-black/10 rounded-full"><XCircle className="w-6 h-6 md:w-8 md:h-8" /></button>
                </div>
              )}

              <div className="bg-white rounded-[3rem] md:rounded-[3.5rem] p-6 md:p-10 shadow-2xl border border-slate-200 relative overflow-hidden">
                <div className="flex flex-wrap justify-center gap-2 mb-10 md:mb-14 relative z-10">
                  {['Pulse', 'Peer', 'Logic'].map((label, idx) => {
                    const target = idx === 0 ? null : idx === 1 ? 'feed' : 'hall-pass';
                    const active = answeringQuestionId === target;
                    return (
                      <button key={label} onClick={() => setAnsweringQuestionId(target as any)} className={`flex-1 min-w-[80px] py-3 md:py-4 rounded-2xl font-black transition-all text-xs md:text-sm border-b-4 active:translate-y-1 active:border-b-0 ${active ? 'bg-violet-600 text-white border-violet-800 shadow-lg scale-105' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'}`}>{label}</button>
                    );
                  })}
                </div>

                {!answeringQuestionId ? (
                  <form onSubmit={handleStudentSubmit} className="space-y-10 md:space-y-14 relative z-10">
                    <div className="text-center space-y-8 md:space-y-10">
                      <div className="space-y-1">
                        <h2 className="text-3xl md:text-4xl font-black text-slate-900 italic">Rate Clarity</h2>
                        <p className="text-sm text-slate-400 font-medium">Anonymous & Real-time</p>
                      </div>
                      <div className="flex justify-between gap-2 md:gap-3">
                        {[1, 2, 3, 4, 5].map(r => (
                          <button key={r} type="button" onClick={() => setStudentRating(r)} className={`flex-1 py-6 md:py-10 rounded-2xl md:rounded-[2rem] font-black text-2xl md:text-4xl border-b-[6px] md:border-b-[8px] transition-all active:translate-y-1 active:border-b-0 ${studentRating === r ? 'bg-violet-600 text-white border-violet-800 scale-110 shadow-xl' : 'bg-slate-50 text-slate-300 border-slate-200'}`}>{r}</button>
                        ))}
                      </div>
                      <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-300 px-2">
                        <span className="text-rose-400/60">Lost</span>
                        <span className="text-amber-400/60">OK</span>
                        <span className="text-emerald-400/60">Perfect</span>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-2">Confidential Question</label>
                      <textarea value={studentQuestion} onChange={(e) => setStudentQuestion(e.target.value)} placeholder="What's your conceptual gap?" className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-[2rem] outline-none focus:border-violet-500 transition-all font-medium min-h-[140px] shadow-inner text-base" />
                    </div>
                    <button type="submit" disabled={studentRating === 0 || cooldownSeconds > 0} className={`w-full py-6 md:py-7 rounded-[2rem] text-xl md:text-2xl font-black shadow-2xl transition-all flex items-center justify-center gap-3 active:scale-[0.97] border-b-8 ${cooldownSeconds > 0 ? 'bg-slate-100 text-slate-300 border-slate-200 cursor-not-allowed' : 'bg-violet-600 text-white border-violet-800 hover:bg-violet-700'}`}>
                      {cooldownSeconds > 0 ? `Cooldown: ${cooldownSeconds}s` : <>Transmit Pulse <ArrowRight className="w-6 h-6" /></>}
                    </button>
                  </form>
                ) : answeringQuestionId === 'hall-pass' ? (
                   <div className="space-y-8 animate-in slide-in-from-right-8 duration-500 relative z-10">
                      <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight text-center">Silent Logistics</h2>
                      <button 
                        onClick={() => handleSilentRequest('hand-raise')}
                        disabled={!!studentCurrentRequest}
                        className={`w-full p-8 rounded-[2.5rem] border-b-8 flex items-center justify-center gap-6 md:gap-8 transition-all active:translate-y-1 active:border-b-0 ${studentCurrentRequest ? 'bg-slate-50 border-slate-200 text-slate-300 opacity-50 grayscale' : 'bg-indigo-600 text-white border-indigo-800 shadow-xl'}`}
                      >
                         <Hand className={`w-10 h-10 md:w-14 md:h-14 ${!studentCurrentRequest ? 'animate-bounce' : ''}`} />
                         <div className="text-left"><span className="text-2xl md:text-3xl font-black uppercase tracking-tight italic block">Raise Hand</span></div>
                      </button>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                         {[
                           { type: 'bathroom', icon: <Coffee />, label: 'Break' },
                           { type: 'after-class', icon: <MessageCircle />, label: 'Talk After' },
                           { type: 'urgent-question', icon: <HelpCircle />, label: 'Blocker' },
                         ].map((btn) => (
                           <button 
                            key={btn.type}
                            disabled={!!studentCurrentRequest}
                            onClick={() => handleSilentRequest(btn.type as RequestType)}
                            className={`p-6 rounded-[2rem] border-b-4 transition-all flex flex-col items-center gap-2 active:translate-y-1 active:border-b-0 ${studentCurrentRequest ? 'bg-slate-50 border-slate-100 text-slate-200' : 'bg-white border-rose-100 text-slate-700 hover:bg-rose-50 shadow-md'}`}
                           >
                              <div className={`p-4 rounded-2xl ${studentCurrentRequest ? 'bg-slate-100' : 'bg-rose-50 text-rose-500'}`}>{btn.icon}</div>
                              <span className="font-black text-[9px] uppercase tracking-widest">{btn.label}</span>
                           </button>
                         ))}
                      </div>
                   </div>
                ) : (
                  <div className="space-y-8 animate-in slide-in-from-right-8 duration-500 relative z-10">
                    <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight text-center">Peer Aid</h2>
                    <div className="space-y-8 max-h-[500px] overflow-y-auto pr-2 scroll-smooth">
                      {session.feedbacks.filter(f => f.question).length === 0 ? (
                        <div className="text-center py-12 flex flex-col items-center gap-4 opacity-30">
                           <MessageCircle className="w-12 h-12" />
                           <p className="font-bold">No public peer help requests yet.</p>
                        </div>
                      ) : (
                        session.feedbacks.filter(f => f.question).map(f => (
                          <div key={f.id} className="p-6 md:p-8 border-2 border-slate-100 rounded-[2.5rem] bg-slate-50/40 space-y-6">
                            <p className="font-black text-lg text-slate-800 leading-tight italic">"{f.question}"</p>
                            <div className="space-y-3 pl-6 border-l-2 border-violet-100">
                              {f.answers.map(a => (
                                <div key={a.id} className={`p-4 rounded-2xl text-xs flex flex-col gap-2 shadow-sm border-2 ${a.isVerified ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-100'}`}>
                                  <p className={a.isVerified ? 'font-black text-emerald-900' : 'font-medium text-slate-600'}>{a.text}</p>
                                  {a.isVerified && <span className="text-[8px] font-black uppercase text-emerald-600 tracking-widest italic">Verified Insight</span>}
                                </div>
                              ))}
                            </div>
                            <div className="flex gap-2">
                              <input 
                                type="text" 
                                value={answeringQuestionId === f.id ? studentAnswerText : ''} 
                                onChange={(e) => {setAnsweringQuestionId(f.id); setStudentAnswerText(e.target.value);}} 
                                placeholder="Add anonymous answer..." 
                                className="flex-1 px-6 py-4 bg-white border-2 border-slate-100 rounded-2xl text-sm font-bold outline-none focus:border-violet-500 shadow-inner" 
                              />
                              <button onClick={() => handleStudentAnswer(f.id)} className="bg-violet-600 text-white p-4 rounded-2xl hover:bg-violet-700 active:scale-90"><Send className="w-5 h-5" /></button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
              <div className="flex flex-col items-center gap-6">
                <button onClick={handleSlowDown} className="w-full sm:w-auto bg-amber-500 text-white px-12 py-6 rounded-[2.5rem] font-black text-lg flex items-center justify-center gap-3 border-b-8 border-amber-700 active:translate-y-2 active:border-b-0 shadow-xl shadow-amber-200">
                  <Snail className="w-8 h-8" /> Too Fast. Slow Down!
                </button>
                <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-200 animate-pulse"></div>
                    <span className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-300">Live Classroom Active</span>
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-200 animate-pulse"></div>
                </div>
              </div>
            </div>
          )
        )}
      </main>
      
      <footer className="bg-white border-t border-slate-100 py-12 md:py-16 mt-auto">
        <div className="max-w-7xl mx-auto px-6 flex flex-col items-center gap-8">
           <div className="flex items-center gap-3 grayscale opacity-30">
              <div className="bg-indigo-600 p-2 rounded-xl"><GraduationCap className="w-6 h-6 text-white" /></div>
              <span className="text-2xl font-black text-slate-900 tracking-tighter">GyanSetu</span>
           </div>
           <p className="text-[10px] text-slate-300 font-bold uppercase tracking-[0.4em]">© 2024 GyanSetu Pedagogical Labs</p>
        </div>
      </footer>
    </div>
  );
};

export default App;
