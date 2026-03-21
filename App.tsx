
import React, { useState, useEffect, useCallback, useMemo, Component, ReactNode } from 'react';
import { 
  Users, 
  Presentation, 
  MessageCircle, 
  ArrowRight, 
  Sparkles, 
  RefreshCcw, 
  LogOut, 
  CheckCircle2, 
  Globe, 
  GraduationCap,
  AlertTriangle,
  Snail,
  ShieldAlert,
  Loader2,
  Settings2,
  MessageSquarePlus,
  Send,
  Check,
  Coffee,
  HelpCircle,
  Clock,
  XCircle,
  BellRing,
  ShieldCheck,
  ZapOff,
  Hand,
  Lightbulb,
  Layers,
  EyeOff,
  Fingerprint,
  Database,
  Trash2,
  Eraser,
  Settings,
  CircleAlert,
  Zap,
  LayoutDashboard,
  Megaphone,
  PlusCircle,
  QrCode,
  Activity,
  Copy,
  ExternalLink,
  ChevronRight,
  LogIn,
  FileText,
  TrendingUp,
  MessageSquare,
} from 'lucide-react';
import { Feedback, Session, ViewMode, AIInsights, SlowDownEvent, Answer, SilentRequest, RequestType, RequestStatus, SessionReport } from './types';
import { analyzeClassroomPulse } from './services/geminiService';
import { PulseChart } from './components/PulseChart';
import { QRCodeComponent } from './components/QRCodeComponent';
import { filterContent, isSpam } from './utils/moderation';
import { SentimentMeter } from './components/SentimentMeter';
import { SessionReportView } from './components/SessionReportView';
import { db, auth } from './firebase';
import { 
  doc, 
  setDoc, 
  onSnapshot, 
  collection, 
  query, 
  orderBy, 
  where,
  addDoc, 
  updateDoc, 
  deleteDoc, 
  getDocs, 
  writeBatch,
  getDoc
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User
} from 'firebase/auth';

const STORAGE_KEY = 'gyansetu_session_db';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string | null;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

const handleFirestoreError = (error: any, operationType: OperationType, path: string | null) => {
  // Ignore aborted requests
  if (
    error?.name === 'AbortError' || 
    error?.message?.toLowerCase().includes('aborted') || 
    error?.message?.toLowerCase().includes('user aborted') ||
    error?.code === 20 ||
    error?.code === 'aborted'
  ) {
    console.warn('Firestore operation aborted:', operationType, path);
    return;
  }

  // Handle transient network errors silently
  if (error?.message?.toLowerCase().includes('failed to fetch') || error?.message?.toLowerCase().includes('network error')) {
    console.warn('Firestore network issue (transient):', operationType, path);
    return;
  }

  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
};

const createInitialSession = (id?: string, teacherUid?: string): Session => ({
  id: id || `gs-${Math.floor(1000 + Math.random() * 9000)}`,
  className: 'Advanced Pedagogy 101',
  topic: 'Real-time Interaction Loops',
  createdAt: Date.now(),
  feedbacks: [],
  slowDownEvents: [],
  silentRequests: [],
  estimatedStudentCount: 30,
  teacherUid
});

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean, error: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = "Something went wrong.";
      try {
        const parsed = JSON.parse(this.state.error.message);
        if (parsed.error) errorMessage = `Firebase Error: ${parsed.error}`;
      } catch (e) {
        errorMessage = this.state.error.message || String(this.state.error);
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
          <div className="max-w-md w-full bg-white rounded-[2.5rem] p-12 shadow-2xl border border-rose-100 text-center space-y-6">
            <div className="w-20 h-20 bg-rose-50 text-rose-500 rounded-3xl mx-auto flex items-center justify-center">
              <AlertTriangle className="w-10 h-10" />
            </div>
            <h2 className="text-3xl font-black text-slate-900 tracking-tight leading-none uppercase italic">System Error</h2>
            <p className="text-slate-500 font-medium leading-relaxed">{errorMessage}</p>
            <button 
              onClick={() => window.location.reload()} 
              className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black flex items-center justify-center gap-2 shadow-xl shadow-slate-200 hover:bg-slate-800 transition-all"
            >
              <RefreshCcw className="w-5 h-5"/> Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const App: React.FC = () => {
  const [viewMode, setViewMode] = useState<ViewMode>('landing');
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [copySuccess, setCopySuccess] = useState(false);
  
  const [session, setSession] = useState<Session>(createInitialSession());

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [insights, setInsights] = useState<AIInsights | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [clientIp, setClientIp] = useState<string | undefined>();
  const [isVpn, setIsVpn] = useState<boolean>(false);
  const [networkDetails, setNetworkDetails] = useState<any>(null);
  const [ipLoading, setIpLoading] = useState<boolean>(true);
  const [lastSlowDownAt, setLastSlowDownAt] = useState<number>(0);

  const [lastPulseAt, setLastPulseAt] = useState<number>(0);
  const [lastAnswerAt, setLastAnswerAt] = useState<number>(0);
  const [cooldownSeconds, setCooldownSeconds] = useState<number>(0);
  const [moderationWarning, setModerationWarning] = useState<string | null>(null);
  const [securityCheckError, setSecurityCheckError] = useState<string | null>(null);
  
  const [showSettings, setShowSettings] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ type: 'clear' | 'new' | 'reset', title: string, message: string } | null>(null);
  const [tempClassSize, setTempClassSize] = useState(session.estimatedStudentCount);
  const [visibleIps, setVisibleIps] = useState<Set<string>>(new Set());
  const [reports, setReports] = useState<SessionReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<SessionReport | null>(null);

  const [studentRating, setStudentRating] = useState<number>(0);
  const [studentQuestion, setStudentQuestion] = useState('');
  const [answeringQuestionId, setAnsweringQuestionId] = useState<string | null>(null);
  const [studentAnswerText, setStudentAnswerText] = useState('');

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Handle Session Joining via URL and Real-time Sync
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlSessionId = params.get('session') || session.id;
    
    // Sync Session Metadata
    const unsubSession = onSnapshot(doc(db, 'sessions', urlSessionId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setSession(prev => ({ ...prev, ...data, id: urlSessionId }));
      } else if (user && (user.email === 'siddhant198u@gmail.com' || user.email === 'friendmemories1112@gmail.com')) {
        // If teacher is logged in and session doesn't exist, create it
        const newSess = createInitialSession(urlSessionId, user.uid);
        setDoc(doc(db, 'sessions', urlSessionId), {
          id: newSess.id,
          className: newSess.className,
          topic: newSess.topic,
          createdAt: newSess.createdAt,
          estimatedStudentCount: newSess.estimatedStudentCount,
          teacherUid: user.uid
        }).catch(e => handleFirestoreError(e, OperationType.WRITE, `sessions/${urlSessionId}`));
      }
    }, (e) => handleFirestoreError(e, OperationType.GET, `sessions/${urlSessionId}`));

    // Sync Feedbacks
    const unsubFeedbacks = onSnapshot(query(collection(db, 'sessions', urlSessionId, 'feedbacks'), orderBy('timestamp', 'desc')), (snap) => {
      const feedbacks = snap.docs.map(d => d.data() as Feedback);
      setSession(prev => ({ ...prev, feedbacks }));
    }, (e) => handleFirestoreError(e, OperationType.GET, `sessions/${urlSessionId}/feedbacks`));

    // Sync SlowDownEvents
    const unsubSlowDown = onSnapshot(query(collection(db, 'sessions', urlSessionId, 'slowDownEvents'), orderBy('timestamp', 'desc')), (snap) => {
      const slowDownEvents = snap.docs.map(d => d.data() as SlowDownEvent);
      setSession(prev => ({ ...prev, slowDownEvents }));
    }, (e) => handleFirestoreError(e, OperationType.GET, `sessions/${urlSessionId}/slowDownEvents`));

    // Sync SilentRequests
    const unsubRequests = onSnapshot(query(collection(db, 'sessions', urlSessionId, 'silentRequests'), orderBy('timestamp', 'desc')), (snap) => {
      const silentRequests = snap.docs.map(d => d.data() as SilentRequest);
      setSession(prev => ({ ...prev, silentRequests }));
    }, (e) => handleFirestoreError(e, OperationType.GET, `sessions/${urlSessionId}/silentRequests`));

    // Sync Reports
    let unsubReports = () => {};
    if (user) {
      unsubReports = onSnapshot(query(collection(db, 'reports'), where('teacherUid', '==', user.uid), orderBy('timestamp', 'desc')), (snap) => {
        const reports = snap.docs.map(d => d.data() as SessionReport);
        setReports(reports);
      }, (e) => handleFirestoreError(e, OperationType.GET, `reports`));
    }

    return () => {
      unsubSession();
      unsubFeedbacks();
      unsubSlowDown();
      unsubRequests();
      unsubReports();
    };
  }, [session.id, user]);

  const checkSecurity = useCallback(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000); // Increased timeout to 12s
    try {
      setIpLoading(true);
      setSecurityCheckError(null);
      const ipResponse = await fetch('https://api.ipify.org?format=json', { signal: controller.signal });
      if (!ipResponse.ok) throw new Error('IP fetch failed');
      const { ip } = await ipResponse.json();
      setClientIp(ip);
      try {
        const detailController = new AbortController();
        const detailTimeoutId = setTimeout(() => detailController.abort(), 8000); // Increased timeout to 8s
        const detailResponse = await fetch(`https://ipapi.co/${ip}/json/`, { signal: detailController.signal });
        clearTimeout(detailTimeoutId);
        if (detailResponse.ok) {
          const data = await detailResponse.json();
          setNetworkDetails(data);
          const suspiciousOrgs = [
            'Amazon', 'Google Cloud', 'DigitalOcean', 'Linode', 'OVH', 'M247', 'Datacamp', 'Choopa', 'Hosting',
            'Vultr', 'Hetzner', 'Microsoft', 'Azure', 'Oracle', 'Fastly', 'Cloudflare', 'Akamai', 'SoftLayer',
            'Rackspace', 'Leaseweb', 'Cogent', 'Zscaler', 'NordVPN', 'ExpressVPN', 'Surfshark', 'Private Internet Access',
            'CyberGhost', 'ProtonVPN', 'TunnelBear', 'Windscribe', 'VyprVPN', 'Mullvad', 'IPVanish', 'StrongVPN',
            'PureVPN', 'Tor', 'Exit Node', 'Proxy', 'VPN', 'Data Center', 'Server', 'Cloud', 'Infrastructure'
          ];
          const isSuspiciousOrg = suspiciousOrgs.some(org => 
            (data.org || '').toLowerCase().includes(org.toLowerCase()) || 
            (data.asn || '').toLowerCase().includes(org.toLowerCase())
          );
          if (isSuspiciousOrg || data.proxy === true || data.vpn === true) {
            setIsVpn(true);
          }
        }
      } catch (e) {
        // Silent fail for detail check
        console.warn('Security detail check failed (non-critical)');
      }
    } catch (e: any) {
      if (e.name === 'AbortError' || e.message?.toLowerCase().includes('aborted') || e.code === 20) {
        console.warn('Security check timed out. Proceeding with standard security.');
      } else if (e.message?.toLowerCase().includes('failed to fetch')) {
        console.warn('Security check network issue (likely adblocker). Proceeding with standard security.');
      } else {
        console.error('Security check failed:', e);
      }
      setIsVpn(false);
    } finally {
      clearTimeout(timeoutId);
      setIpLoading(false);
    }
  }, []);

  useEffect(() => {
    checkSecurity();
  }, [checkSecurity]);

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
    try {
      const result = await analyzeClassroomPulse(session.feedbacks);
      setInsights(result);
    } catch (error) {
      console.error("AI analysis failed:", error);
      // analyzeClassroomPulse already returns a fallback object on error, 
      // but this catch handles any errors that might occur before or during the call.
    } finally {
      setIsAnalyzing(false);
    }
  }, [session.feedbacks]);

  const handleTeacherLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      setViewMode('teacher-dashboard');
      if (!insights) fetchAIInsights();
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const handleSaveReport = async () => {
    if (!user || !insights) return;
    
    const avgRating = session.feedbacks.length > 0 
      ? parseFloat((session.feedbacks.reduce((acc, f) => acc + f.rating, 0) / session.feedbacks.length).toFixed(1))
      : 0;

    const report: Omit<SessionReport, 'id'> = {
      sessionId: session.id,
      teacherUid: user.uid,
      className: session.className,
      topic: session.topic,
      timestamp: Date.now(),
      summary: insights.summary,
      actionPlan: insights.actionPlan,
      averageRating: avgRating,
      totalFeedbacks: session.feedbacks.length,
      totalSlowDowns: session.slowDownEvents.length,
      totalRequests: session.silentRequests.length,
      confusionPoints: insights.confusionPoints,
      keywords: insights.keywords || []
    };

    try {
      const docRef = await addDoc(collection(db, 'reports'), report);
      await updateDoc(docRef, { id: docRef.id });
      alert('Session report archived successfully.');
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'reports');
    }
  };

  const handleUpdateClassSize = async () => {
    try {
      await updateDoc(doc(db, 'sessions', session.id), {
        estimatedStudentCount: tempClassSize
      });
      setShowSettings(false);
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `sessions/${session.id}`);
    }
  };

  const handleClearHistory = async () => {
    try {
      const batch = writeBatch(db);
      
      const feedbacks = await getDocs(collection(db, 'sessions', session.id, 'feedbacks'));
      feedbacks.forEach(d => batch.delete(d.ref));
      
      const slowDowns = await getDocs(collection(db, 'sessions', session.id, 'slowDownEvents'));
      slowDowns.forEach(d => batch.delete(d.ref));
      
      const requests = await getDocs(collection(db, 'sessions', session.id, 'silentRequests'));
      requests.forEach(d => batch.delete(d.ref));
      
      await batch.commit();
      setInsights(null);
      setShowSettings(false);
      setConfirmAction(null);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `sessions/${session.id}/history`);
    }
  };

  const handleNewSession = async () => {
    try {
      const newSess = createInitialSession(undefined, user?.uid);
      await setDoc(doc(db, 'sessions', newSess.id), {
        id: newSess.id,
        className: newSess.className,
        topic: newSess.topic,
        createdAt: newSess.createdAt,
        estimatedStudentCount: newSess.estimatedStudentCount,
        teacherUid: user?.uid
      });
      setSession(newSess);
      setInsights(null);
      setShowSettings(false);
      setConfirmAction(null);
      
      // Update URL
      const url = new URL(window.location.href);
      url.searchParams.set('session', newSess.id);
      window.history.pushState({}, '', url.toString());
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `sessions/new`);
    }
  };

  const handleResetDatabase = async () => {
    try {
      await handleClearHistory();
      await deleteDoc(doc(db, 'sessions', session.id));
      const newSess = createInitialSession(undefined, user?.uid);
      setSession(newSess);
      setInsights(null);
      setShowSettings(false);
      setConfirmAction(null);
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `sessions/${session.id}`);
    }
  };

  const toggleIpVisibility = (id: string) => {
    setVisibleIps(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (studentRating === 0 || isVpn || cooldownSeconds > 0) return;
    const now = Date.now();
    if (now - lastPulseAt < 15000) { setCooldownSeconds(15); return; }
    const cleanQuestion = filterContent(studentQuestion);
    if (isSpam(studentQuestion)) { setModerationWarning("Spam detected."); setTimeout(() => setModerationWarning(null), 3000); return; }
    
    const feedbackId = Math.random().toString(36).substr(2, 9);
    const newFeedback: Feedback = { 
      id: feedbackId, 
      rating: studentRating, 
      question: cleanQuestion, 
      timestamp: now, 
      studentIp: clientIp, 
      answers: [] 
    };
    
    try {
      await setDoc(doc(db, 'sessions', session.id, 'feedbacks', feedbackId), newFeedback);
      
      setSubmitted(true); setLastPulseAt(now); setStudentRating(0); setStudentQuestion(''); setCooldownSeconds(30); 
      setTimeout(() => setSubmitted(false), 3000);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `sessions/${session.id}/feedbacks/${feedbackId}`);
    }
  };

  const handleSilentRequest = async (type: RequestType) => {
    if (isVpn) return;
    if (session.silentRequests.find(r => r.studentIp === clientIp && r.status === 'pending')) return;
    
    const requestId = Math.random().toString(36).substr(2, 9);
    const newRequest: SilentRequest = { 
      id: requestId, 
      type, 
      status: 'pending', 
      timestamp: Date.now(), 
      studentIp: clientIp 
    };
    
    try {
      await setDoc(doc(db, 'sessions', session.id, 'silentRequests', requestId), newRequest);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `sessions/${session.id}/silentRequests/${requestId}`);
    }
  };

  const updateRequestStatus = async (requestId: string, status: RequestStatus) => {
    try {
      await updateDoc(doc(db, 'sessions', session.id, 'silentRequests', requestId), { status });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `sessions/${session.id}/silentRequests/${requestId}`);
    }
  };

  const studentCurrentRequest = useMemo(() => session.silentRequests.find(r => r.studentIp === clientIp && r.status !== 'dismissed'), [session.silentRequests, clientIp]);

  const handleStudentAnswer = async (questionId: string) => {
    if (!studentAnswerText.trim() || isVpn) return;
    const now = Date.now();
    if (now - lastAnswerAt < 10000) { setModerationWarning("Wait before answering again."); setTimeout(() => setModerationWarning(null), 3000); return; }
    const cleanAnswer = filterContent(studentAnswerText);
    const newAnswer: Answer = { id: Math.random().toString(36).substr(2, 9), text: cleanAnswer, timestamp: now, studentIp: clientIp, isVerified: false };
    
    try {
      const feedbackRef = doc(db, 'sessions', session.id, 'feedbacks', questionId);
      const feedbackSnap = await getDoc(feedbackRef);
      if (feedbackSnap.exists()) {
        const currentAnswers = feedbackSnap.data().answers || [];
        await updateDoc(feedbackRef, {
          answers: [...currentAnswers, newAnswer]
        });
      }
      
      setStudentAnswerText(''); setAnsweringQuestionId(null); setLastAnswerAt(now);
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `sessions/${session.id}/feedbacks/${questionId}`);
    }
  };

  const verifyAnswer = async (questionId: string, answerId: string) => {
    try {
      const feedbackRef = doc(db, 'sessions', session.id, 'feedbacks', questionId);
      const feedbackSnap = await getDoc(feedbackRef);
      if (feedbackSnap.exists()) {
        const currentAnswers = feedbackSnap.data().answers || [];
        const updatedAnswers = currentAnswers.map((a: any) => a.id === answerId ? { ...a, isVerified: !a.isVerified } : a);
        await updateDoc(feedbackRef, {
          answers: updatedAnswers
        });
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `sessions/${session.id}/feedbacks/${questionId}`);
    }
  };

  const handleSlowDown = async () => {
    if (isVpn) return;
    const now = Date.now();
    if (now - lastSlowDownAt < 30000) return;
    
    const eventId = Math.random().toString(36).substr(2, 9);
    const newEvent: SlowDownEvent = { id: eventId, timestamp: now, studentIp: clientIp };
    
    try {
      await setDoc(doc(db, 'sessions', session.id, 'slowDownEvents', eventId), newEvent);
      setLastSlowDownAt(now);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `sessions/${session.id}/slowDownEvents/${eventId}`);
    }
  };

  useEffect(() => {
    const testConnection = async () => {
      try {
        const { getDocFromServer, doc } = await import('firebase/firestore');
        await getDocFromServer(doc(db, 'sessions', 'connection-test'));
      } catch (error: any) {
        if (error?.message?.includes('the client is offline')) {
          console.error("Firebase connection error: The client is offline. Please check your Firebase configuration.");
        }
      }
    };
    testConnection();
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    setViewMode('landing');
  };

  const getRequestIcon = (type: RequestType) => {
    switch (type) {
      case 'bathroom': return <Coffee className="w-4 h-4" />;
      case 'urgent-question': return <CircleAlert className="w-4 h-4" />;
      case 'hand-raise': return <Hand className="w-4 h-4" />;
      case 'after-class': return <MessageCircle className="w-4 h-4" />;
    }
  };

  // Improved Join URL Logic
  const joinUrl = useMemo(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('session', session.id);
    return url.toString();
  }, [session.id]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(joinUrl);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  if (isAuthLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#f8fafc] gap-6">
        <div className="relative">
          <div className="absolute inset-0 bg-indigo-500 rounded-full blur-2xl animate-pulse opacity-20"></div>
          <Loader2 className="w-16 h-16 animate-spin text-indigo-600 relative z-10" />
        </div>
        <p className="text-xl font-black text-slate-400 tracking-tighter uppercase italic">Initializing Pulse...</p>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      {/* Security Check Error Notification */}
      {securityCheckError && (
        <div className="fixed bottom-6 right-6 z-[90] animate-in slide-in-from-right-6 duration-500">
          <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl shadow-xl flex items-center gap-4 max-w-sm">
            <div className="bg-amber-500 text-white p-2 rounded-xl">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-bold text-amber-900 leading-tight">{securityCheckError}</p>
            </div>
            <button onClick={() => setSecurityCheckError(null)} className="text-amber-400 hover:text-amber-600">
              <XCircle className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmAction && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-[2.5rem] p-8 md:p-10 max-w-md w-full shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-300">
            <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center mb-6">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h3 className="text-2xl font-black text-slate-900 tracking-tight mb-2">{confirmAction.title}</h3>
            <p className="text-slate-500 font-medium mb-8 leading-relaxed">{confirmAction.message}</p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button 
                onClick={() => {
                  if (confirmAction.type === 'clear') handleClearHistory();
                  else if (confirmAction.type === 'new') handleNewSession();
                  else if (confirmAction.type === 'reset') handleResetDatabase();
                }}
                className="flex-1 bg-rose-600 text-white py-4 rounded-xl font-black text-sm uppercase tracking-widest hover:bg-rose-700 transition-all shadow-lg shadow-rose-200"
              >
                Confirm Action
              </button>
              <button 
                onClick={() => setConfirmAction(null)}
                className="flex-1 bg-slate-100 text-slate-600 py-4 rounded-xl font-black text-sm uppercase tracking-widest hover:bg-slate-200 transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="min-h-screen flex flex-col selection:bg-indigo-100 selection:text-indigo-900">
      {/* Dynamic Header */}
      <header className="sticky top-0 z-[60] glass border-b border-slate-200/60 h-16 md:h-20 flex items-center">
        <div className="max-w-[1440px] mx-auto px-4 md:px-8 w-full flex items-center justify-between">
          <div onClick={() => setViewMode('landing')} className="flex items-center gap-2.5 cursor-pointer group">
            <div className="bg-gradient-to-tr from-indigo-600 to-violet-600 p-2 rounded-xl shadow-lg shadow-indigo-200 group-hover:rotate-6 transition-all duration-300">
               <GraduationCap className="text-white w-5 h-5 md:w-6 md:h-6" />
            </div>
            <div className="flex flex-col">
              <h1 className="text-lg md:text-xl font-black text-slate-900 leading-none tracking-tighter">GyanSetu</h1>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Real-Time Pulse</span>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {user && !isVpn && viewMode === 'teacher-dashboard' && (
              <div className="flex items-center gap-3">
                 <div className="hidden sm:flex flex-col items-end border-r border-slate-200 pr-4">
                    <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">Educator</span>
                    <span className="text-xs font-bold text-slate-700 truncate max-w-[120px]">{user.email}</span>
                 </div>
                 <button onClick={handleLogout} className="p-2.5 md:px-4 md:py-2 text-rose-500 hover:bg-rose-50 rounded-xl transition-all font-bold text-sm border border-transparent hover:border-rose-100 flex items-center gap-2">
                  <LogOut className="w-4 h-4" /> <span className="hidden sm:inline">End Session</span>
                 </button>
              </div>
            )}
            {!user && !isVpn && viewMode !== 'teacher-login' && viewMode !== 'student-form' && (
               <button onClick={() => setViewMode('teacher-login')} className="bg-slate-900 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-xl shadow-slate-200 hover:bg-slate-800 transition-all flex items-center gap-2">
                 <Presentation className="w-4 h-4" /> Educator Portal
               </button>
            )}
            {!isVpn && viewMode === 'student-form' && (
               <div className="px-4 py-1.5 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100 flex items-center gap-2 animate-pulse">
                  <Globe className="w-3.5 h-3.5" /> <span className="text-[10px] font-black uppercase tracking-widest">Connected</span>
               </div>
            )}
            {isVpn && (
               <div className="px-4 py-1.5 bg-rose-50 text-rose-600 rounded-xl border border-rose-100 flex items-center gap-2">
                  <ShieldAlert className="w-3.5 h-3.5" /> <span className="text-[10px] font-black uppercase tracking-widest">Security Alert</span>
               </div>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-[1440px] mx-auto px-4 md:px-8 py-6 md:py-10">
        {isVpn && (
          <div className="max-w-xl mx-auto py-20 animate-in fade-in slide-in-from-bottom-10 duration-700">
            <div className="bg-white rounded-[3rem] p-12 shadow-2xl border border-rose-100 text-center space-y-8 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-2 bg-rose-500"></div>
              <div className="w-20 h-20 bg-rose-50 text-rose-500 rounded-3xl mx-auto flex items-center justify-center">
                <ShieldAlert className="w-10 h-10" />
              </div>
              <div className="space-y-2">
                <h2 className="text-3xl font-black text-slate-900 tracking-tight leading-none uppercase italic">Access Denied</h2>
                <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest">Security Protocol 403: Proxy Detected</p>
              </div>
              <p className="text-slate-500 font-medium leading-relaxed">
                GyanSetu requires a direct, unproxied connection for institutional security and to prevent feedback spoofing. 
                Please disable your VPN, Proxy, or iCloud Private Relay and try again.
              </p>
              <div className="pt-4">
                <button 
                  onClick={() => window.location.reload()} 
                  className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black flex items-center justify-center gap-2 shadow-xl shadow-slate-200 hover:bg-slate-800 transition-all"
                >
                  <RefreshCcw className="w-5 h-5"/> Re-Authenticate Connection
                </button>
              </div>
              <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest pt-4 border-t border-slate-50">
                Network: {networkDetails?.org || 'Unknown Infrastructure'}
              </div>
            </div>
          </div>
        )}

        {!isVpn && viewMode === 'landing' && (
          <div className="max-w-6xl mx-auto py-12 md:py-20 flex flex-col items-center text-center">
             <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 border border-indigo-100 rounded-full text-indigo-600 font-bold text-xs uppercase tracking-widest mb-8 animate-float">
               <Sparkles className="w-3.5 h-3.5" /> Built for Modern Pedagogy
             </div>
             <h2 className="text-5xl md:text-7xl lg:text-8xl font-black text-slate-900 tracking-[ -0.05em] leading-[0.9] mb-8">
               Bridging the gap between <br/><span className="bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-600 bg-clip-text text-transparent">Teacher and Learner.</span>
             </h2>
             <p className="text-lg md:text-2xl text-slate-500 font-medium max-w-2xl leading-relaxed mb-12">
               GyanSetu provides an instant, anonymous feedback loop that transforms passive lectures into active learning experiences.
             </p>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl">
                <div onClick={() => setViewMode('teacher-login')} className="group p-10 bg-white rounded-[2.5rem] border border-slate-200 hover:border-indigo-500 transition-all duration-500 cursor-pointer premium-shadow flex flex-col items-center">
                   <div className="w-20 h-20 bg-indigo-50 rounded-3xl flex items-center justify-center text-indigo-600 mb-6 group-hover:scale-110 transition-transform">
                      <Presentation className="w-10 h-10" />
                   </div>
                   <h3 className="text-2xl font-black text-slate-800 mb-2 tracking-tight">Educator Control</h3>
                   <p className="text-slate-500 font-medium text-sm">Manage pulse, logistics, and AI insights.</p>
                </div>
                <div onClick={() => setViewMode('student-form')} className="group p-10 bg-white rounded-[2.5rem] border border-slate-200 hover:border-violet-500 transition-all duration-500 cursor-pointer premium-shadow flex flex-col items-center">
                   <div className="w-20 h-20 bg-violet-50 rounded-3xl flex items-center justify-center text-violet-600 mb-6 group-hover:scale-110 transition-transform">
                      <Users className="w-10 h-10" />
                   </div>
                   <h3 className="text-2xl font-black text-slate-800 mb-2 tracking-tight">Student Access</h3>
                   <p className="text-slate-500 font-medium text-sm">Send real-time feedback anonymously.</p>
                </div>
             </div>
          </div>
        )}

        {!isVpn && viewMode === 'teacher-login' && (
          <div className="max-w-md mx-auto py-12 animate-in fade-in slide-in-from-bottom-10 duration-700">
            <div className="bg-white rounded-[3rem] p-10 md:p-14 shadow-2xl border border-slate-100 flex flex-col">
               <div className="text-center mb-10">
                  <h2 className="text-3xl font-black text-slate-900 tracking-tighter mb-2">Educator Portal</h2>
                  <p className="text-slate-400 font-medium">Authentication required to manage session</p>
               </div>
               <div className="space-y-6">
                  <button 
                    onClick={handleTeacherLogin} 
                    className="w-full bg-white border-2 border-slate-100 text-slate-900 py-5 rounded-2xl font-black shadow-sm hover:bg-slate-50 active:scale-95 transition-all flex items-center justify-center gap-3"
                  >
                    <LogIn className="w-5 h-5 text-indigo-600" /> Sign in with Google
                  </button>
                  <p className="text-[10px] text-center text-slate-400 font-bold uppercase tracking-widest">
                    Authorized Educators Only
                  </p>
               </div>
            </div>
          </div>
        )}

        {!isVpn && viewMode === 'teacher-dashboard' && user && (
          <div className="space-y-8 animate-in fade-in duration-500">
            {/* Real-time Status Bar */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="md:col-span-3 glass border border-slate-200/60 p-5 rounded-3xl flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="bg-indigo-600 text-white p-3 rounded-2xl shadow-lg shadow-indigo-200">
                    <LayoutDashboard className="w-5 h-5" />
                  </div>
                  <div className="flex flex-col">
                    <h2 className="text-xl font-black text-slate-900 tracking-tight leading-none uppercase italic">{session.className}</h2>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Current Topic: {session.topic}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-xl text-[10px] font-black border border-emerald-100">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div> LIVE
                  </div>
                  <div className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-xl text-[10px] font-black border border-slate-200">
                    ID: {session.id}
                  </div>
                </div>
              </div>
              <div className="glass border border-indigo-200/60 p-5 rounded-3xl bg-indigo-50/30 flex items-center justify-center gap-4 group cursor-pointer hover:bg-indigo-50 transition-colors" onClick={() => setShowSettings(!showSettings)}>
                 <div className={`p-3 rounded-2xl transition-all ${showSettings ? 'bg-indigo-600 text-white' : 'bg-white text-indigo-600 shadow-sm border border-indigo-100'}`}>
                   <Settings className="w-5 h-5" />
                 </div>
                 <div className="flex flex-col">
                    <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">Dashboard</span>
                    <span className="text-sm font-black text-slate-800">Settings</span>
                 </div>
              </div>
              <button 
                onClick={() => setViewMode('teacher-reports')} 
                className="glass border border-indigo-200/60 p-5 rounded-3xl bg-indigo-50/30 flex items-center justify-center gap-4 group cursor-pointer hover:bg-indigo-50 transition-colors"
              >
                 <div className="p-3 rounded-2xl bg-white text-indigo-600 shadow-sm border border-indigo-100">
                   <FileText className="w-5 h-5" />
                 </div>
                 <div className="flex flex-col">
                    <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">Archives</span>
                    <span className="text-sm font-black text-slate-800">Reports</span>
                 </div>
              </button>
            </div>

            {showSettings && (
              <div className="p-8 bg-white rounded-[2.5rem] border border-slate-200 shadow-2xl animate-in slide-in-from-top-6 flex flex-col gap-8">
                 <div className="flex items-center justify-between border-b border-slate-100 pb-6">
                   <h3 className="text-2xl font-black text-slate-900 tracking-tight">Session Configuration</h3>
                   <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-slate-600"><XCircle className="w-6 h-6"/></button>
                 </div>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                       <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Target Class Size</label>
                       <div className="flex items-center gap-3">
                         <input type="number" value={tempClassSize} onChange={(e) => setTempClassSize(parseInt(e.target.value) || 1)} className="flex-1 p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-xl" />
                         <button onClick={handleUpdateClassSize} className="bg-indigo-600 text-white px-6 py-4 rounded-2xl font-black text-sm uppercase">Update Class Size</button>
                       </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                       <div className="space-y-4">
                         <label className="text-xs font-black text-slate-500 uppercase tracking-widest">QR Management</label>
                         <button 
                           onClick={() => setConfirmAction({
                             type: 'new',
                             title: 'Generate New Session',
                             message: 'This will create a new Session ID and QR code. Existing feedback for this specific ID will be cleared.'
                           })} 
                           className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all flex items-center justify-center gap-2"
                         >
                           <PlusCircle className="w-4 h-4" /> New Session
                         </button>
                       </div>
                       <div className="space-y-4">
                         <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Danger Zone</label>
                         <div className="grid grid-cols-2 gap-2">
                           <button 
                             onClick={() => setConfirmAction({
                               type: 'clear',
                               title: 'Clear Interaction History',
                               message: 'Are you sure you want to clear all feedback, slow down events, and silent requests? Session metadata will be preserved.'
                             })} 
                             className="bg-rose-50 text-rose-600 py-4 rounded-2xl font-black text-[9px] uppercase tracking-widest border border-rose-100 hover:bg-rose-100 transition-all flex items-center justify-center gap-2"
                           >
                             <Eraser className="w-4 h-4" /> Clear Interaction History
                           </button>
                           <button 
                             onClick={() => setConfirmAction({
                               type: 'reset',
                               title: 'Factory Reset',
                               message: 'This will permanently delete ALL session data and metadata. This action cannot be undone.'
                             })} 
                             className="bg-rose-600 text-white py-4 rounded-2xl font-black text-[9px] uppercase tracking-widest shadow-lg shadow-rose-200 hover:bg-rose-700 transition-all flex items-center justify-center gap-2"
                           >
                             <Trash2 className="w-4 h-4" /> Reset
                           </button>
                         </div>
                       </div>
                    </div>
                 </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Left Column: Analytics */}
              <div className="lg:col-span-8 space-y-8">
                {activeAlert && (
                  <div className="bg-rose-50 border-2 border-rose-200 rounded-[2.5rem] p-8 flex items-center gap-8 shadow-2xl shadow-rose-100 animate-pulse border-dashed">
                    <div className="bg-rose-500 text-white p-5 rounded-[2rem] shadow-xl shadow-rose-200">
                      <Snail className="w-10 h-10" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-rose-900 font-black text-2xl tracking-tighter uppercase italic">Clarity Crisis Detected</h4>
                      <p className="text-rose-700 font-bold opacity-80">Students are flagging that the material is moving too fast. Consider a pivot.</p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-slate-200/60 flex flex-col">
                    <div className="flex items-center justify-between mb-8">
                      <div className="flex items-center gap-3">
                        <div className="bg-slate-100 p-2.5 rounded-xl text-slate-600"><Activity className="w-5 h-5" /></div>
                        <h3 className="text-lg font-black text-slate-900 tracking-tight">Understanding Pulse</h3>
                      </div>
                    </div>
                    <PulseChart feedbacks={session.feedbacks} />
                  </div>

                  <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-slate-200/60 flex flex-col items-center justify-center">
                    <SentimentMeter sentiment={insights?.sentiment} score={insights?.sentimentScore ?? 50} />
                  </div>
                </div>

                <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-slate-200/60 flex flex-col">
                  <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-3">
                      <div className="bg-slate-100 p-2.5 rounded-xl text-slate-600"><Activity className="w-5 h-5" /></div>
                      <h3 className="text-lg font-black text-slate-900 tracking-tight">Recent Pulse Feed</h3>
                    </div>
                  </div>
                  <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                    {session.feedbacks.length === 0 ? (
                      <div className="py-10 opacity-30 text-center flex flex-col items-center gap-4">
                        <Activity className="w-8 h-8" />
                        <p className="font-black text-[10px] uppercase tracking-widest">No pulse data yet</p>
                      </div>
                    ) : (
                      [...session.feedbacks].sort((a, b) => b.timestamp - a.timestamp).slice(0, 50).map(f => (
                        <div key={f.id} className="flex items-center justify-between p-4 bg-slate-50/50 border border-slate-100 rounded-2xl">
                          <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-white shadow-sm ${
                              f.rating === 1 ? 'bg-rose-500' :
                              f.rating === 2 ? 'bg-orange-500' :
                              f.rating === 3 ? 'bg-amber-500' :
                              f.rating === 4 ? 'bg-lime-500' :
                              'bg-emerald-500'
                            }`}>
                              {f.rating}
                            </div>
                            <div className="flex flex-col">
                              <span className="text-[10px] font-black text-slate-800 uppercase tracking-widest">
                                {f.rating === 1 ? 'Lost' :
                                 f.rating === 2 ? 'Confused' :
                                 f.rating === 3 ? 'Getting it' :
                                 f.rating === 4 ? 'Solid' :
                                 'Expert'}
                              </span>
                              {f.studentIp && <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest">{f.studentIp}</span>}
                            </div>
                          </div>
                          <span className="text-[8px] font-bold text-slate-400">{new Date(f.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-slate-200/60 flex flex-col">
                  <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-3">
                      <div className="bg-slate-100 p-2.5 rounded-xl text-slate-600"><MessageCircle className="w-5 h-5" /></div>
                      <h3 className="text-lg font-black text-slate-900 tracking-tight">Student Questions & Peer Aid</h3>
                    </div>
                  </div>
                  <div className="space-y-6 max-h-[600px] overflow-y-auto pr-2">
                    {session.feedbacks.filter(f => f.question).length === 0 ? (
                      <div className="py-20 opacity-30 text-center flex flex-col items-center gap-4">
                        <HelpCircle className="w-12 h-12" />
                        <p className="font-black text-sm uppercase tracking-widest">No questions yet</p>
                      </div>
                    ) : (
                      session.feedbacks.filter(f => f.question).map(f => (
                        <div key={f.id} className="p-6 bg-slate-50/50 border-2 border-slate-100 rounded-[2rem] text-left space-y-4">
                          <div className="flex justify-between items-start">
                            <p className="font-bold text-slate-800">"{f.question}"</p>
                            <div className="flex flex-col items-end gap-1">
                              <span className="text-[10px] font-bold text-slate-400">{new Date(f.timestamp).toLocaleTimeString()}</span>
                              {f.studentIp && <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest">{f.studentIp}</span>}
                            </div>
                          </div>
                          <div className="space-y-3 pl-4 border-l-2 border-indigo-200">
                            {f.answers.map(a => (
                              <div key={a.id} className={`p-3 rounded-xl text-xs flex items-center justify-between gap-2 ${a.isVerified ? 'bg-emerald-50 text-emerald-800 font-bold border border-emerald-100' : 'bg-white border border-slate-200'}`}>
                                <div className="flex flex-col gap-1 flex-1">
                                  <div className="flex items-start gap-2">
                                    {a.isVerified && <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
                                    <p>{a.text}</p>
                                  </div>
                                  {a.studentIp && <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest ml-5.5">{a.studentIp}</span>}
                                </div>
                                <button 
                                  onClick={() => verifyAnswer(f.id, a.id)}
                                  className={`p-1.5 rounded-lg transition-all ${a.isVerified ? 'text-emerald-600 bg-emerald-100' : 'text-slate-300 hover:text-indigo-500 hover:bg-indigo-50'}`}
                                >
                                  <ShieldCheck className="w-4 h-4" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="bg-slate-950 rounded-[3rem] p-10 md:p-14 text-white shadow-2xl relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-1/3 h-full bg-gradient-to-l from-indigo-500/10 to-transparent pointer-events-none"></div>
                  <div className="relative z-10 flex flex-col md:flex-row gap-10">
                    <div className="flex-1 space-y-8">
                      <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-500/20 border border-indigo-500/30 rounded-full text-indigo-300 font-black text-[10px] uppercase tracking-widest">
                        <Sparkles className="w-3.5 h-3.5" /> AI Pedagogical Engine
                      </div>
                      
                      {insights ? (
                        <div className="space-y-10">
                           <div className="p-6 bg-white/5 backdrop-blur-md rounded-[2rem] border border-white/10 italic text-xl font-medium leading-relaxed text-indigo-50">
                             "{insights.summary}"
                           </div>

                           {/* Topic Breakdown Section */}
                           {insights.topicBreakdown && insights.topicBreakdown.length > 0 && (
                             <div className="space-y-4">
                               <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                                 <Layers className="w-3 h-3" /> Topic Breakdown
                               </h4>
                               <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                 {insights.topicBreakdown.map((topic, i) => (
                                   <div key={i} className="p-4 bg-white/5 border border-white/10 rounded-2xl space-y-2">
                                     <div className="flex items-center justify-between">
                                       <span className="font-black text-sm text-white">{topic.topic}</span>
                                       <span className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase ${
                                         topic.level === 'High' ? 'bg-rose-500/20 text-rose-400' :
                                         topic.level === 'Medium' ? 'bg-amber-500/20 text-amber-400' :
                                         'bg-emerald-500/20 text-emerald-400'
                                       }`}>
                                         {topic.level} Confusion
                                       </span>
                                     </div>
                                     <ul className="space-y-1">
                                       {topic.specificConfusionPoints.map((point, j) => (
                                         <li key={j} className="text-[10px] text-slate-400 flex items-start gap-1.5">
                                           <div className="w-1 h-1 rounded-full bg-indigo-500 mt-1.5 shrink-0" />
                                           {point}
                                         </li>
                                       ))}
                                     </ul>
                                   </div>
                                 ))}
                               </div>
                             </div>
                           )}

                           <div className="space-y-4">
                             <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                               <Megaphone className="w-3 h-3" /> Recommended Strategy
                             </h4>
                             <p className="text-3xl md:text-4xl font-black text-white tracking-tighter leading-[1.1]">{insights.actionPlan}</p>
                           </div>

                           {/* Alternative Teaching Methods */}
                           {insights.teachingSuggestions && insights.teachingSuggestions.length > 0 && (
                             <div className="space-y-4">
                               <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                                 <Lightbulb className="w-3 h-3" /> Alternative Pedagogical Approaches
                               </h4>
                               <div className="space-y-3">
                                 {insights.teachingSuggestions.map((suggestion, i) => (
                                   <div key={i} className="p-5 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl space-y-2">
                                     <h5 className="font-black text-indigo-300 text-sm uppercase tracking-tight">{suggestion.technique}</h5>
                                     <p className="text-xs text-slate-300 leading-relaxed">{suggestion.description}</p>
                                     <div className="pt-2 border-t border-white/5">
                                       <p className="text-[9px] font-bold text-indigo-400/80 italic">Rationale: {suggestion.rationale}</p>
                                     </div>
                                   </div>
                                 ))}
                               </div>
                             </div>
                           )}
                        </div>
                      ) : (
                        <div className="h-full flex flex-col items-center justify-center py-10 opacity-40">
                          <Loader2 className="w-12 h-12 animate-spin mb-4" />
                          <p className="font-bold text-indigo-200">Waiting for feedback stream...</p>
                        </div>
                      )}
                    </div>
                    <div className="w-full md:w-72 flex flex-col gap-4">
                       {insights ? (
                          <>
                            <div className="p-6 bg-white/5 border border-white/10 rounded-3xl space-y-4">
                              <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400">Confusion Points</span>
                              <ul className="space-y-2">
                                {insights.confusionPoints.slice(0, 3).map((p, i) => (
                                  <li key={i} className="flex items-start gap-2 text-xs font-bold text-slate-300">
                                    <CircleAlert className="w-3.5 h-3.5 text-rose-400 mt-0.5" /> {p}
                                  </li>
                                ))}
                              </ul>
                            </div>
                            <button onClick={fetchAIInsights} disabled={isAnalyzing} className="w-full bg-white text-slate-950 py-5 rounded-[1.5rem] font-black text-sm uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-indigo-50 transition-all active:scale-95 shadow-xl shadow-indigo-900/20">
                              <RefreshCcw className={`w-4 h-4 ${isAnalyzing ? 'animate-spin' : ''}`} /> Recalculate
                            </button>
                          </>
                       ) : (
                          <button onClick={fetchAIInsights} disabled={isAnalyzing || session.feedbacks.length === 0} className="w-full bg-indigo-600 text-white py-10 rounded-[2.5rem] font-black text-xl uppercase tracking-tighter flex flex-col items-center justify-center gap-4 hover:bg-indigo-700 transition-all disabled:opacity-30 border border-indigo-400/20">
                             <Zap className="w-8 h-8" /> Synthesize
                          </button>
                       )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Feed & Logistics */}
              <div className="lg:col-span-4 space-y-8">
                <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-200/60 flex flex-col h-[500px] lg:h-[600px] overflow-hidden">
                  <div className="p-6 border-b bg-slate-50/50 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                       <BellRing className="w-4 h-4 text-rose-500" />
                       <span className="font-black text-sm uppercase tracking-widest text-slate-800 italic">Logistics Queue</span>
                    </div>
                    <span className="text-[10px] bg-rose-500 text-white px-2 py-0.5 rounded-full font-black animate-pulse-slow">
                      {session.silentRequests.filter(r => r.status === 'pending').length}
                    </span>
                  </div>
                  <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {session.silentRequests.filter(r => r.status !== 'dismissed').length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center opacity-30 text-center px-4">
                         <Megaphone className="w-10 h-10 mb-4" />
                         <p className="text-xs font-bold text-slate-500">Logistics clear.</p>
                      </div>
                    ) : (
                      session.silentRequests.filter(r => r.status !== 'dismissed').map(r => (
                        <div key={r.id} className={`p-4 rounded-2xl border-2 transition-all duration-300 animate-in slide-in-from-right-4 ${r.status === 'pending' ? 'bg-white border-rose-100 premium-shadow' : 'bg-slate-50 border-slate-100 opacity-60'}`}>
                          <div className="flex items-center justify-between mb-3">
                             <div className="flex items-center gap-2">
                                <div className="bg-slate-100 p-2 rounded-lg text-slate-600">{getRequestIcon(r.type)}</div>
                                <div className="flex flex-col">
                                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-800">{r.type.replace('-', ' ')}</span>
                                  {r.studentIp && <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest">{r.studentIp}</span>}
                                </div>
                             </div>
                             <span className="text-[8px] font-bold text-slate-400">{new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                          {r.status === 'pending' && (
                            <div className="flex gap-2">
                               <button onClick={() => updateRequestStatus(r.id, 'approved')} className="flex-1 bg-emerald-500 text-white py-2 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-colors">OK</button>
                               <button onClick={() => updateRequestStatus(r.id, 'wait')} className="flex-1 bg-amber-500 text-white py-2 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-amber-600 transition-colors">Wait</button>
                            </div>
                          )}
                          {r.status !== 'pending' && (
                            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                               <span className={`text-[8px] font-black uppercase tracking-widest ${r.status === 'approved' ? 'text-emerald-600' : 'text-amber-600'}`}>{r.status}</span>
                               <button onClick={() => updateRequestStatus(r.id, 'dismissed')} className="text-slate-300 hover:text-slate-600"><XCircle className="w-4 h-4" /></button>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Updated Invitation Card with Working URL */}
                <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-[2.5rem] p-8 text-white shadow-2xl flex flex-col items-center text-center relative overflow-hidden group">
                   <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl -mr-16 -mt-16"></div>
                   <div className="w-full mb-6">
                     <QRCodeComponent value={joinUrl} size={240} />
                   </div>
                   <div className="space-y-5 relative z-10 w-full">
                      <div className="space-y-1">
                        <h4 className="text-xl font-black tracking-tight italic">Invite Students</h4>
                        <p className="text-[10px] font-bold text-indigo-200 uppercase tracking-widest">Institutional Access Loop</p>
                      </div>
                      
                      <div className="flex flex-col gap-2">
                        <div className="px-4 py-3 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 flex flex-col items-center gap-1.5 overflow-hidden">
                           <div className="flex items-center gap-2 w-full justify-center">
                              <Globe className="w-3.5 h-3.5 shrink-0" />
                              <span className="font-bold text-[10px] truncate max-w-full opacity-90">{joinUrl}</span>
                           </div>
                        </div>
                        
                        <div className="flex gap-2">
                          <button 
                            onClick={handleCopyLink}
                            className={`flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${copySuccess ? 'bg-emerald-500 text-white' : 'bg-white text-indigo-600 hover:bg-indigo-50'}`}
                          >
                            {copySuccess ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                            {copySuccess ? 'Copied!' : 'Copy Link'}
                          </button>
                          <a 
                            href={joinUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="bg-white/10 hover:bg-white/20 p-3 rounded-xl transition-all"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </div>
                      </div>

                      <button onClick={handleNewSession} className="text-[9px] font-black uppercase tracking-[0.2em] text-white/40 hover:text-white/80 flex items-center justify-center gap-1 mx-auto transition-colors">
                        <RefreshCcw className="w-2.5 h-2.5" /> Regenerate Session
                      </button>
                   </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {!isVpn && viewMode === 'teacher-reports' && user && (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button onClick={() => {setViewMode('teacher-dashboard'); setSelectedReport(null);}} className="p-3 bg-white border border-slate-200 rounded-2xl text-slate-600 hover:bg-slate-50 transition-all">
                  <ChevronRight className="w-5 h-5 rotate-180" />
                </button>
                <h2 className="text-3xl font-black text-slate-900 tracking-tight leading-none uppercase italic">Session Archives</h2>
              </div>
              <button 
                onClick={handleSaveReport} 
                disabled={session.feedbacks.length === 0 || !insights} 
                className="bg-indigo-600 text-white px-6 py-4 rounded-2xl font-black text-sm uppercase flex items-center gap-2 disabled:opacity-30 shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all"
              >
                <Sparkles className="w-4 h-4" /> Archive Current Session
              </button>
            </div>

            {selectedReport ? (
              <SessionReportView report={selectedReport} onClose={() => setSelectedReport(null)} />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {reports.length === 0 ? (
                  <div className="col-span-full py-20 text-center opacity-30 flex flex-col items-center gap-4">
                    <FileText className="w-16 h-16 text-slate-400" />
                    <p className="font-black text-lg uppercase tracking-widest">No archived reports found</p>
                  </div>
                ) : (
                  reports.map(report => (
                    <div key={report.id} onClick={() => setSelectedReport(report)} className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm hover:shadow-xl hover:border-indigo-200 transition-all cursor-pointer group flex flex-col h-full">
                      <div className="flex items-center justify-between mb-6">
                        <div className="bg-indigo-50 text-indigo-600 p-3 rounded-2xl group-hover:bg-indigo-600 group-hover:text-white transition-all">
                          <FileText className="w-5 h-5" />
                        </div>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{new Date(report.timestamp).toLocaleDateString()}</span>
                      </div>
                      <h3 className="text-xl font-black text-slate-900 tracking-tight mb-2 group-hover:text-indigo-600 transition-colors">{report.topic}</h3>
                      <p className="text-slate-500 text-sm font-medium line-clamp-2 mb-6 flex-1">{report.summary}</p>
                      <div className="flex items-center justify-between pt-6 border-t border-slate-100">
                        <div className="flex items-center gap-2">
                          <TrendingUp className="w-4 h-4 text-emerald-500" />
                          <span className="text-xs font-black text-slate-900">{report.averageRating} Pulse</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <MessageSquare className="w-4 h-4 text-indigo-500" />
                          <span className="text-xs font-black text-slate-900">{report.totalFeedbacks}</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {!isVpn && viewMode === 'student-form' && (
          <div className="max-w-xl mx-auto space-y-8 pb-20 animate-in fade-in slide-in-from-bottom-10 duration-700">
             {ipLoading ? (
               <div className="text-center py-20 flex flex-col items-center gap-6">
                 <div className="relative">
                   <div className="absolute inset-0 bg-indigo-500 rounded-full blur-2xl animate-pulse opacity-20"></div>
                   <Loader2 className="w-16 h-16 animate-spin text-indigo-600 relative z-10" />
                 </div>
                 <p className="text-xl font-black text-slate-400 tracking-tighter uppercase italic">Securing Tunnel...</p>
               </div>
             ) : (
               <div className="flex flex-col gap-8">
                 {/* Network Status Badge */}
                 <div className="flex items-center justify-between px-6 py-3 bg-slate-50 border border-slate-200/60 rounded-2xl text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                   <div className="flex items-center gap-4">
                     <div className="flex items-center gap-2">
                       <Globe className="w-3 h-3 text-indigo-500" />
                       <span>IP: {clientIp || 'Detecting...'}</span>
                     </div>
                     {networkDetails && (
                       <button 
                         onClick={() => alert(`Network Diagnostics:\nIP: ${clientIp}\nCity: ${networkDetails.city}\nRegion: ${networkDetails.region}\nOrg: ${networkDetails.org}\nASN: ${networkDetails.asn}`)}
                         className="text-indigo-400 hover:text-indigo-600 underline decoration-dotted underline-offset-2"
                       >
                         Details
                       </button>
                     )}
                   </div>
                   <div className="flex items-center gap-2">
                     <ShieldCheck className="w-3 h-3 text-emerald-500" />
                     <span>Secure Connection</span>
                   </div>
                 </div>

                 <div className="flex bg-white p-2 rounded-[2rem] border border-slate-200/60 premium-shadow">
                    {[
                      { id: null, label: 'Pulse', icon: <Megaphone className="w-4 h-4" /> },
                      { id: 'feed', label: 'Peer Aid', icon: <Users className="w-4 h-4" /> },
                      { id: 'hall-pass', label: 'Signal', icon: <BellRing className="w-4 h-4" /> }
                    ].map(tab => (
                      <button 
                        key={tab.label} 
                        onClick={() => setAnsweringQuestionId(tab.id as any)} 
                        className={`flex-1 py-4 rounded-[1.5rem] font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${answeringQuestionId === tab.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100 scale-[1.02]' : 'text-slate-400 hover:bg-slate-50'}`}
                      >
                         {tab.icon} {tab.label}
                      </button>
                    ))}
                 </div>

                 <div className="bg-white rounded-[3rem] p-8 md:p-12 shadow-2xl border border-slate-100">
                    {!answeringQuestionId ? (
                      <form onSubmit={handleStudentSubmit} className="space-y-12">
                         <div className="text-center space-y-6">
                            <h2 className="text-3xl font-black text-slate-900 tracking-tighter leading-none uppercase italic">Rate Clarity</h2>
                            <p className="text-sm font-medium text-slate-400 italic">Connected to: {session.id}</p>
                            
                            <div className="flex justify-between gap-2 sm:gap-4">
                               {[1, 2, 3, 4, 5].map(r => (
                                 <button 
                                   key={r} 
                                   type="button" 
                                   onClick={() => setStudentRating(r)} 
                                   className={`flex-1 aspect-square sm:aspect-auto sm:py-8 rounded-2xl sm:rounded-[2rem] font-black text-2xl sm:text-4xl transition-all active:scale-95 border-b-8 ${studentRating === r ? 'bg-indigo-600 text-white border-indigo-800 scale-105 shadow-xl shadow-indigo-100' : 'bg-slate-50 text-slate-300 border-slate-200'}`}
                                 >
                                   {r}
                                 </button>
                               ))}
                            </div>
                         </div>
                         <div className="space-y-4">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Optional Question (Private)</label>
                            <textarea value={studentQuestion} onChange={(e) => setStudentQuestion(e.target.value)} placeholder="What's tripping you up?" className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-3xl outline-none focus:border-indigo-500 transition-all font-medium h-32" />
                         </div>
                         <button type="submit" disabled={studentRating === 0 || cooldownSeconds > 0} className={`w-full py-6 rounded-3xl text-xl font-black shadow-2xl flex items-center justify-center gap-3 transition-all border-b-8 active:translate-y-1 active:border-b-0 ${cooldownSeconds > 0 ? 'bg-slate-100 text-slate-300 border-slate-200 cursor-not-allowed' : 'bg-indigo-600 text-white border-indigo-800 hover:bg-indigo-700'}`}>
                           {cooldownSeconds > 0 ? `Wait ${cooldownSeconds}s` : <>Transmit Pulse <ArrowRight className="w-5 h-5"/></>}
                         </button>
                      </form>
                    ) : (
                      <div className="text-center">
                         <h3 className="text-2xl font-black text-slate-900 tracking-tight uppercase italic mb-8">
                           {answeringQuestionId === 'feed' ? 'Peer Learning' : 'Logistics Signal'}
                         </h3>
                         {answeringQuestionId === 'hall-pass' ? (
                            <div className="space-y-6">
                               {studentCurrentRequest ? (
                                  <div className={`p-8 rounded-[2.5rem] border-4 flex flex-col items-center gap-4 animate-in zoom-in-95 ${studentCurrentRequest.status === 'pending' ? 'bg-white border-slate-100 text-slate-900 shadow-xl' : 'bg-emerald-600 border-emerald-400 text-white shadow-2xl shadow-emerald-200'}`}>
                                     <div className={`p-5 rounded-3xl ${studentCurrentRequest.status === 'pending' ? 'bg-slate-100 text-slate-400' : 'bg-white/20 text-white'}`}>
                                        <Clock className={`w-12 h-12 ${studentCurrentRequest.status === 'pending' ? 'animate-pulse' : ''}`} />
                                     </div>
                                     <h4 className="text-2xl font-black italic uppercase tracking-tight">{studentCurrentRequest.status === 'pending' ? 'Pending Signal' : 'Signal Approved'}</h4>
                                     <p className="text-sm font-bold opacity-80">{studentCurrentRequest.status === 'pending' ? 'Teacher has been notified.' : 'Confirmed. Proceed silently.'}</p>
                                     <button onClick={() => updateRequestStatus(studentCurrentRequest.id, 'dismissed')} className="mt-4 px-6 py-2 bg-black/10 hover:bg-black/20 rounded-full font-black text-[10px] uppercase tracking-widest">Close Notification</button>
                                  </div>
                               ) : (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                     <button onClick={() => handleSilentRequest('hand-raise')} className="p-8 bg-indigo-600 text-white rounded-[2rem] border-b-8 border-indigo-800 flex flex-col items-center gap-4 active:translate-y-1 active:border-b-0 shadow-lg">
                                        <Hand className="w-12 h-12 animate-bounce" />
                                        <span className="font-black text-lg uppercase tracking-tight italic">Raise Hand</span>
                                     </button>
                                     <div className="grid grid-cols-1 gap-4">
                                        <button onClick={() => handleSilentRequest('bathroom')} className="p-6 bg-white border-2 border-slate-100 rounded-[2rem] flex items-center justify-center gap-4 hover:bg-slate-50 transition-all font-black text-slate-700 uppercase tracking-widest text-xs">
                                           <Coffee className="w-5 h-5 text-rose-500" /> Break
                                        </button>
                                        <button onClick={() => handleSilentRequest('after-class')} className="p-6 bg-white border-2 border-slate-100 rounded-[2rem] flex items-center justify-center gap-4 hover:bg-slate-50 transition-all font-black text-slate-700 uppercase tracking-widest text-xs">
                                           <MessageCircle className="w-5 h-5 text-indigo-500" /> Talk After
                                        </button>
                                     </div>
                                  </div>
                               )}
                            </div>
                         ) : (
                            <div className="space-y-6">
                               {session.feedbacks.filter(f => f.question).length === 0 ? (
                                  <div className="py-20 opacity-30 text-center flex flex-col items-center gap-4">
                                     <Users className="w-12 h-12" />
                                     <p className="font-black text-sm uppercase tracking-widest">No peer questions yet</p>
                                  </div>
                               ) : (
                                  <div className="space-y-6 max-h-[500px] overflow-y-auto pr-2">
                                     {session.feedbacks.filter(f => f.question).map(f => (
                                        <div key={f.id} className="p-6 bg-slate-50/50 border-2 border-slate-100 rounded-[2rem] text-left space-y-4">
                                           <p className="font-bold text-slate-800">"{f.question}"</p>
                                           <div className="space-y-3 pl-4 border-l-2 border-indigo-200">
                                              {f.answers.map(a => (
                                                 <div key={a.id} className={`p-3 rounded-xl text-xs flex items-start gap-2 ${a.isVerified ? 'bg-emerald-50 text-emerald-800 font-bold border border-emerald-100' : 'bg-white border border-slate-200'}`}>
                                                    {a.isVerified && <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
                                                    <p>{a.text}</p>
                                                 </div>
                                              ))}
                                              <div className="flex gap-2">
                                                 <input 
                                                   type="text" 
                                                   value={answeringQuestionId === f.id ? studentAnswerText : ''} 
                                                   onChange={(e) => {setAnsweringQuestionId(f.id); setStudentAnswerText(e.target.value);}} 
                                                   placeholder="Help your peer..." 
                                                   className="flex-1 px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-indigo-500" 
                                                 />
                                                 <button onClick={() => handleStudentAnswer(f.id)} className="bg-indigo-600 text-white p-2 rounded-xl hover:bg-indigo-700"><Send className="w-4 h-4" /></button>
                                              </div>
                                           </div>
                                        </div>
                                     ))}
                                  </div>
                               )}
                            </div>
                         )}
                      </div>
                    )}
                 </div>

                 <div className="flex flex-col items-center gap-4">
                    <button onClick={handleSlowDown} className="w-full sm:w-auto bg-amber-500 text-white px-10 py-5 rounded-[2.5rem] font-black text-lg flex items-center justify-center gap-3 border-b-8 border-amber-700 active:translate-y-1 active:border-b-0 shadow-xl shadow-amber-100">
                       <Snail className="w-8 h-8" /> Moving too fast!
                    </button>
                    <div className="flex items-center gap-2 opacity-40">
                       <div className="w-1.5 h-1.5 rounded-full bg-slate-400"></div>
                       <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Institutional ID: {session.id}</span>
                       <div className="w-1.5 h-1.5 rounded-full bg-slate-400"></div>
                    </div>
                 </div>
               </div>
             )}
          </div>
        )}
      </main>
      
      <footer className="bg-white border-t border-slate-100 py-12">
        <div className="max-w-[1440px] mx-auto px-8 flex flex-col items-center gap-6 opacity-30 grayscale transition-all hover:grayscale-0 hover:opacity-100">
           <div className="flex items-center gap-2.5">
              <div className="bg-indigo-600 p-1.5 rounded-lg"><GraduationCap className="w-4 h-4 text-white" /></div>
              <span className="text-lg font-black text-slate-900 tracking-tighter">GyanSetu</span>
           </div>
        </div>
      </footer>
    </div>
    </ErrorBoundary>
  );
};

export default App;
