import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, 
  Heart, 
  FileText, 
  Info, 
  ShieldCheck, 
  LogOut, 
  Users,
  Mail,
  CheckCircle,
  X
} from 'lucide-react';
import { getChatResponse } from './utils/gemini';
import { checkSafety, EMERGENCY_MESSAGE } from './utils/safety';
import { logToSheets } from './utils/logger';
import ReportViewer from './components/ReportViewer';

// --- Types ---
interface Message {
  id: string;
  role: 'user' | 'ai';
  content: string;
  timestamp: Date;
}

interface UserInfo {
  studentClass: string;
  studentNo: string;
  studentName: string;
  parentName: string;
}

type StaffCategory = '班主任' | '課外活動老師' | '主任' | '社工' | '書記' | '校長';


// Removed unused STUDENTS config as we now use Supabase

const App: React.FC = () => {
  // Auth State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [authError, setAuthError] = useState('');

  // Chat State
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'ai',
      content: '您好，我是「家長同行者」。看到您來到這裡，一定是這段育兒過程中有不少心聲想要分享。在這邊，您可以放心傾訴。請問今天有甚麼事情正困擾著您嗎？',
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [turnsUsed, setTurnsUsed] = useState(0);
  const MAX_TURNS = 30;

  // UI State
  const [showReport, setShowReport] = useState(false);
  const [reportA, setReportA] = useState('');
  const [reportB, setReportB] = useState('');
  const [showNotifyModal, setShowNotifyModal] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<StaffCategory[]>([]);
  const [notifiedStatus, setNotifiedStatus] = useState<'idle' | 'loading' | 'success' | 'limited'>('idle');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // --- Helpers ---
  const consumeStreamToString = async (stream: ReadableStream<Uint8Array>) => {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let result = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      result += decoder.decode(value);
    }
    return result;
  };

  // --- Auth Handlers ---
  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data: UserInfo = {
      studentClass: formData.get('class') as string,
      studentNo: formData.get('no') as string,
      studentName: formData.get('name') as string,
      parentName: formData.get('parent') as string,
    };

    try {
      setAuthError('');

      // Admin Bypass: Use 'admin' for all fields
      if (
        data.studentClass.toLowerCase() === 'admin' &&
        data.studentNo.toLowerCase() === 'admin' &&
        data.studentName.toLowerCase() === 'admin' &&
        data.parentName.toLowerCase() === 'admin'
      ) {
        setUserInfo({
          ...data,
          studentName: '系統管理員 (Admin)',
          parentName: '系統管理員'
        });
        setIsAuthenticated(true);
        return;
      }

      // In a real production app, we would use Supabase Auth or a secure verification RPC.
      // For this migration, we verify against the new 'students' table in Supabase.
      const { supabase } = await import('./utils/supabase');
      const { data: student, error } = await supabase
        .from('students')
        .select('*')
        .eq('class', data.studentClass)
        .eq('student_no', data.studentNo)
        .eq('student_name', data.studentName)
        .single();

      if (error || !student) {
        setAuthError('核對失敗，請確保學生資料正確。');
        return;
      }

      setUserInfo(data);
      setIsAuthenticated(true);
    } catch (err) {
      setAuthError('連接服務器失敗，請稍後再試。');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setUserInfo(null);
    setMessages([{ id: '1', role: 'ai', content: '您好，我是「家長同行者」...', timestamp: new Date() }]);
    setTurnsUsed(0);
  };

  // --- Chat Handlers ---
  const handleSend = async () => {
    if (!input.trim() || isTyping || turnsUsed >= MAX_TURNS) return;

    if (checkSafety(input)) {
      logToSheets({
        timestamp: new Date().toISOString(),
        studentId: userInfo ? `${userInfo.studentClass}-${userInfo.studentNo}` : 'ANONYMOUS',
        studentName: userInfo?.studentName || 'Unknown',
        type: 'EMERGENCY_ALERT',
        content: input
      });
      setMessages(prev => [...prev, 
        { id: Date.now().toString(), role: 'user', content: input, timestamp: new Date() },
        { id: (Date.now() + 1).toString(), role: 'ai', content: EMERGENCY_MESSAGE, timestamp: new Date() }
      ]);
      setInput('');
      return;
    }

    const userMsgContent = input;
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: userMsgContent, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);
    setTurnsUsed(prev => prev + 1);

    try {
      const studentId = `${userInfo!.studentClass}-${userInfo!.studentNo}`;
      const chatHistory = messages.map(m => ({ 
        role: m.role === 'ai' ? 'assistant' : 'user', 
        content: m.content 
      }));
      
      const aiMsgId = (Date.now() + 1).toString();
      let fullAIResponse = "";

      // Add a placeholder message for streaming
      setMessages(prev => [...prev, { id: aiMsgId, role: 'ai', content: "", timestamp: new Date() }]);

      const stream = await getChatResponse(userMsgContent, chatHistory, studentId);
      
      // Consume the stream
      const reader = stream.getReader();
      const decoder = new TextDecoder();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        fullAIResponse += chunk;
        
        setMessages(prev => prev.map(m => 
          m.id === aiMsgId ? { ...m, content: fullAIResponse } : m
        ));
      }

    } catch (error) {
      setMessages(prev => [...prev, { id: 'err', role: 'ai', content: '抱歉，系統暫時忙碌中，請稍後再試。', timestamp: new Date() }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleGenerateReport = async () => {
    setIsTyping(true);
    try {
      const studentId = userInfo ? `${userInfo.studentClass}-${userInfo.studentNo}` : undefined;
      const chatHistory = messages.map(m => ({ 
        role: m.role === 'ai' ? 'assistant' : 'user', 
        content: m.content 
      }));
      const prompt = "請根據上述對話，嚴格按照格式 A 和格式 B 生成兩份報告。格式 A 是『校方行動申請表』，格式 B 是『家長行動小貼士』。請直接輸出內容，中間用 --- 分隔。";
      const stream = await getChatResponse(prompt, chatHistory, studentId);
      const response = await consumeStreamToString(stream);
      console.log("Report Response:", response);
      
      let [partA, partB] = response.split(/---|\n\n---\n\n/);
      if (!partB && response.includes('格式 B')) {
        // Fallback if split failed but content exists
        const splitIndex = response.indexOf('格式 B');
        partA = response.substring(0, splitIndex);
        partB = response.substring(splitIndex);
      }
      
      setReportA(partA?.trim() || '報告生成失敗: 格式 A 未找到');
      setReportB(partB?.trim() || '報告生成失敗: 格式 B 未找到');
      setShowReport(true);
    } catch (error) {
      alert("報告生成失敗");
    } finally {
      setIsTyping(false);
    }
  };

  // --- Notification Handlers ---
  const checkDailyLimit = (studentId: string) => {
    const today = new Date().toISOString().split('T')[0];
    const history = JSON.parse(localStorage.getItem('notification_history') || '{}');
    return history[studentId] === today;
  };

  const logDailyLimit = (studentId: string) => {
    const today = new Date().toISOString().split('T')[0];
    const history = JSON.parse(localStorage.getItem('notification_history') || '{}');
    history[studentId] = today;
    localStorage.setItem('notification_history', JSON.stringify(history));
  };

  const handleRequestNotify = async () => {
    if (!userInfo || selectedStaff.length === 0) return;
    
    // 1. Check Rate Limit (Mocking Google Sheets check)
    const studentId = `${userInfo.studentClass}-${userInfo.studentNo}`;
    if (checkDailyLimit(studentId)) {
      setNotifiedStatus('limited');
      return;
    }

    setNotifiedStatus('loading');
    try {
      // 2. Generate Letter via AI
      const studentId = `${userInfo.studentClass}-${userInfo.studentNo}`;
      const chatHistory = messages.map(m => ({ 
        role: m.role === 'ai' ? 'assistant' : 'user', 
        content: m.content 
      }));
      const prompt = `請根據以上對話，生成一封簡短、客氣且以學校利益為基礎的「家長請求信」。收件人包括：${selectedStaff.join('、')}。信件應包含：學生 ${userInfo.studentName} 的情況、父母 ${userInfo.parentName} 的期望，以及建基於現有校內安排的合理請求。請注意語氣必須安撫家長情緒，同時維護學校專業形象。`;
      const stream = await getChatResponse(prompt, chatHistory, studentId);
      const letter = await consumeStreamToString(stream);

      // 3. Log to Google Sheets
      const testEmail = "cwwong@lst-lkkb.edu.hk";
      logToSheets({
        timestamp: new Date().toISOString(),
        studentId: studentId,
        studentName: userInfo.studentName,
        type: 'NOTIFICATION_REQUEST',
        content: `To: ${selectedStaff.join(', ')} (Test Email: ${testEmail})\nLetter: ${letter}`
      });
      
      logDailyLimit(studentId);
      setNotifiedStatus('success');
      setMessages(prev => [...prev, { id: 'notify-sent', role: 'ai', content: `【申請知會成功】\n已根據您的請求生成信件。系統已將知會電郵發送至：${selectedStaff.join('、')} (${testEmail})。每位學生每天於每個類別限申請一次。`, timestamp: new Date() }]);
    } catch (error) {
      alert("申請知會失敗");
      setNotifiedStatus('idle');
    }
  };

  // --- Render Auth Screen ---
  if (!isAuthenticated) {
    return (
      <div className="auth-container min-h-screen bg-[#F0F4F0] flex items-center justify-center p-4">
        <div className="max-w-md w-full glass p-8 rounded-2xl shadow-xl">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-sage-600 rounded-full flex items-center justify-center mx-auto mb-4 text-white shadow-lg">
              <ShieldCheck size={32} />
            </div>
            <h1 className="text-2xl font-bold text-gray-800">家長資訊站</h1>
            <p className="text-gray-600 mt-2">請輸入學生及家長資料進行核對</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <input name="class" required className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-sage-500 outline-none" placeholder="班別 (如: 1A)" />
            <input name="no" required className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-sage-500 outline-none" placeholder="學號 (如: 01)" />
            <input name="name" required className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-sage-500 outline-none" placeholder="學生姓名" />
            <input name="parent" required className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-sage-500 outline-none" placeholder="家長姓名" />
            {authError && <div className="text-red-500 text-xs text-center">{authError}</div>}
            <button type="submit" className="w-full py-3 bg-sage-600 hover:bg-sage-700 text-white font-semibold rounded-lg shadow-lg active:scale-95 transition-all">核對身份</button>
          </form>
          <div className="mt-8 text-[10px] text-gray-400 text-center uppercase tracking-widest leading-relaxed">
            本系統受《個人資料（私隱）條例》保護。資料僅用於身份核對及校方支援用途。
          </div>
        </div>
      </div>
    );
  }

  // --- Render Chat Screen ---
  return (
    <div className="chat-container">
      {showNotifyModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl scale-in-95">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg text-gray-800">申請知會同工</h3>
              <button onClick={() => setShowNotifyModal(false)} className="p-1 hover:bg-gray-100 rounded-full transition-colors"><X size={20}/></button>
            </div>
            <p className="text-xs text-gray-500 mb-4">請選擇您希望知會的類別。每位學生每日限於每個類別申請一次。</p>
            <div className="grid grid-cols-2 gap-2 mb-6">
              {['班主任', '課外活動老師', '主任', '社工', '書記', '校長'].map((staff) => (
                <button 
                  key={staff}
                  onClick={() => setSelectedStaff(prev => prev.includes(staff as StaffCategory) ? prev.filter(s => s !== staff) : [...prev, staff as StaffCategory])}
                  className={`px-3 py-2 text-xs rounded-xl border transition-all ${selectedStaff.includes(staff as StaffCategory) ? 'bg-sage-600 text-white border-sage-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                >
                  {staff}
                </button>
              ))}
            </div>
            {notifiedStatus === 'limited' && <div className="text-red-500 text-[11px] mb-4 text-center bg-red-50 p-2 rounded">您今天已為此學生提交過申請。</div>}
            <button 
              onClick={handleRequestNotify} 
              disabled={selectedStaff.length === 0 || notifiedStatus !== 'idle'}
              className="w-full py-3 bg-sage-600 text-white rounded-xl font-bold hover:bg-sage-700 disabled:bg-gray-300 transition-all flex items-center justify-center gap-2"
            >
              {notifiedStatus === 'loading' ? '正在生成並發送...' : notifiedStatus === 'success' ? <><CheckCircle size={18}/> 申請已發送</> : '確認申請知會'}
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="header flex justify-between items-center px-6 shadow-md">
        <div className="flex items-center gap-3">
          <Heart size={20} fill="white" />
          <div>
            <h1 className="text-sm sm:text-lg">家長資訊站</h1>
            <div className="text-[10px] opacity-80 flex items-center gap-2">
              <Users size={10} />
              <span>{userInfo?.studentClass} {userInfo?.studentName} | 轉數: {turnsUsed}/{MAX_TURNS}</span>
            </div>
          </div>
        </div>
        <button onClick={handleLogout} className="p-2 hover:bg-white/10 rounded-full transition-colors"><LogOut size={18}/></button>
      </header>

      {/* Messages */}
      <main className="messages-list flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`message-bubble ${msg.role === 'user' ? 'message-user' : 'message-ai'}`}>
            <div className="message-content text-sm leading-relaxed">{msg.content.split('\n').map((line, i) => <p key={i}>{line}</p>)}</div>
            <div className="text-[9px] mt-1 opacity-40 text-right">{msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
          </div>
        ))}
        {isTyping && <div className="message-bubble message-ai opacity-60 italic text-xs">正在細心處理中...</div>}
        {turnsUsed >= MAX_TURNS && <div className="text-center p-3 text-[10px] bg-amber-50 rounded-lg text-amber-700 mx-8">對話次數已達上限。請生成報告。</div>}
        <div ref={messagesEndRef} />
      </main>

      {/* Quick Actions */}
      <div className="flex gap-2 p-2 px-4 bg-white border-t border-gray-100 overflow-x-auto no-scrollbar shadow-inner">
        <button onClick={() => setShowNotifyModal(true)} className="flex-shrink-0 flex items-center gap-1 text-[11px] px-3 py-1.5 rounded-full border border-green-100 text-green-600 hover:bg-green-50 active:scale-95 transition-all">
          <Mail size={12}/> 申請知會相關同事
        </button>
        <button onClick={handleGenerateReport} className="flex-shrink-0 flex items-center gap-1 text-[11px] px-3 py-1.5 rounded-full border border-blue-100 text-blue-600 hover:bg-blue-50">
          <FileText size={12}/> 生成報告
        </button>
        <button onClick={async () => {
          setIsTyping(true);
          try {
            const studentId = userInfo ? `${userInfo.studentClass}-${userInfo.studentNo}` : undefined;
            const query = "請提供學校的基本資訊、重要校曆及學生支援流程概要。";
            const chatHistory = messages.map(m => ({ 
              role: m.role === 'ai' ? 'assistant' : 'user', 
              content: m.content 
            }));
            const stream = await getChatResponse(query, chatHistory, studentId);
            const response = await consumeStreamToString(stream);
            setMessages(prev => [...prev, { id: 'info-' + Date.now(), role: 'ai', content: response, timestamp: new Date() }]);
          } catch (error) {
            alert("查詢失敗");
          } finally {
            setIsTyping(false);
          }
        }} className="flex-shrink-0 flex items-center gap-1 text-[11px] px-3 py-1.5 rounded-full border border-gray-200 text-gray-500">
          <Info size={12}/> 學校資訊
        </button>
      </div>

      {/* Input */}
      <div className="input-area p-4 glass flex gap-2 border-t border-gray-100">
        <input 
          type="text" 
          className="input-field flex-1 px-4 py-2 border rounded-xl outline-none focus:ring-2 focus:ring-sage-400" 
          placeholder={turnsUsed >= MAX_TURNS ? "對話已結束" : "分享您的感受..."}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          disabled={turnsUsed >= MAX_TURNS || isTyping}
        />
        <button className="send-button bg-sage-600 text-white p-2 rounded-xl" onClick={handleSend} disabled={turnsUsed >= MAX_TURNS || isTyping || !input.trim()}><Send size={24}/></button>
      </div>

      <footer className="footer-disclaimer text-[9px] p-1 text-gray-400 text-center uppercase tracking-tighter">本人工智能建議僅供參考。緊急情況請撥打 999。系統符合香港私隱條例保障。</footer>

      {showReport && <ReportViewer reportA={reportA} reportB={reportB} onClose={() => setShowReport(false)} />}
    </div>
  );
};

export default App;
