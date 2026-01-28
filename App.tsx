
import React, { useState, useRef, useEffect } from 'react';
import { Message, Memory, AppLanguage } from './types';
import { FUNCTION_REGISTRY, UI_TRANSLATIONS } from './constants';
import { generateAssistantResponseStream, generateImage, generateVideo, generateSpeech } from './services/geminiService';
import { decodeAudioData, decodeBase64 } from './services/audioService';
import FaceOverlay from './components/FaceOverlay';
import VoiceOverlay from './components/VoiceOverlay';
import VideoOverlay from './components/VideoOverlay';

declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
  interface Window {
    aistudio?: AIStudio;
  }
}

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isAuth, setIsAuth] = useState(false);
  const [showFaceScan, setShowFaceScan] = useState(false);
  const [showVoice, setShowVoice] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'functions' | 'profile'>('chat');
  const [generatingVideo, setGeneratingVideo] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [language, setLanguage] = useState<AppLanguage>('hinglish');
  const [memories, setMemories] = useState<Memory[]>([]);
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const t = UI_TRANSLATIONS[language];

  useEffect(() => {
    const savedMessages = localStorage.getItem('nexus_messages');
    const savedMemories = localStorage.getItem('nexus_memories');
    const savedLang = localStorage.getItem('nexus_lang');
    
    if (savedMessages) setMessages(JSON.parse(savedMessages));
    if (savedMemories) setMemories(JSON.parse(savedMemories));
    if (savedLang) setLanguage(savedLang as AppLanguage);

    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('nexus_messages', JSON.stringify(messages));
    localStorage.setItem('nexus_memories', JSON.stringify(memories));
    localStorage.setItem('nexus_lang', language);
  }, [messages, memories, language]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const parseMemories = (text: string) => {
    const memoryRegex = /\[LEARN:\s*([^\]]+)\]/gi;
    let match;
    const newFacts: string[] = [];
    while ((match = memoryRegex.exec(text)) !== null) {
      newFacts.push(match[1].trim());
    }

    if (newFacts.length > 0) {
      const newMemories: Memory[] = newFacts.map(fact => ({
        id: Math.random().toString(36).substr(2, 9),
        fact,
        timestamp: Date.now(),
        category: 'personal'
      }));
      setMemories(prev => {
        const filtered = newMemories.filter(nm => !prev.some(p => p.fact.toLowerCase() === nm.fact.toLowerCase()));
        return [...prev, ...filtered];
      });
      return text.replace(memoryRegex, '').trim();
    }
    return text;
  };

  const playTTS = async (messageId: string, content: string) => {
    if (isPlayingAudio || isOffline) return;
    setIsPlayingAudio(messageId);

    try {
      const base64Audio = await generateSpeech(content);
      if (base64Audio) {
        if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        }
        const ctx = audioContextRef.current;
        const buffer = await decodeAudioData(decodeBase64(base64Audio), ctx, 24000, 1);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.onended = () => setIsPlayingAudio(null);
        source.start(0);
      } else {
        setIsPlayingAudio(null);
      }
    } catch (err) {
      setIsPlayingAudio(null);
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || isStreaming) return;
    if (isOffline) {
       addAssistantMessage(t.offline_msg);
       return;
    }

    if (!isAuth) {
      setShowFaceScan(true);
      return;
    }

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: Date.now(),
      type: 'text'
    };

    setMessages(prev => [...prev, userMsg]);
    const userPrompt = input;
    setInput('');

    const lowerInput = userPrompt.toLowerCase();
    
    if (lowerInput.includes('video')) {
      if (window.aistudio) {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        if (!hasKey) await window.aistudio.openSelectKey();
      }
      setGeneratingVideo(userPrompt);
      const url = await generateVideo(userPrompt);
      setGeneratingVideo(null);
      addAssistantMessage(url ? "Video ready." : "Rendering failure.", 'video', undefined, url || undefined);
      return;
    }

    if (lowerInput.includes('image')) {
      if (window.aistudio) {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        if (!hasKey) await window.aistudio.openSelectKey();
      }
      const url = await generateImage(userPrompt);
      addAssistantMessage(url ? "Synthesis complete." : "Failed.", 'image', url || undefined);
      return;
    }

    setIsStreaming(true);
    const assistantId = (Date.now() + 1).toString();
    
    setMessages(prev => [...prev, {
      id: assistantId,
      role: 'assistant',
      content: "",
      timestamp: Date.now(),
      isStreaming: true
    }]);

    const resultText = await generateAssistantResponseStream(userPrompt, messages, memories, language, (chunk) => {
      setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: chunk } : m));
    });

    const cleanText = parseMemories(resultText);
    setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: cleanText, isStreaming: false } : m));
    setIsStreaming(false);
  };

  const addAssistantMessage = (content: string, type: Message['type'] = 'text', imageUrl?: string, videoUrl?: string) => {
    const msg: Message = { id: Date.now().toString(), role: 'assistant', content, timestamp: Date.now(), type, imageUrl, videoUrl };
    setMessages(prev => [...prev, msg]);
  };

  const handleVoiceCommand = (name: string, args?: any) => {
    switch (name) {
      case 'authenticate_user':
        setIsAuth(true);
        setShowVoice(false);
        break;
      case 'navigate_to':
        if (args?.destination) setActiveTab(args.destination);
        break;
      case 'close_voice_control':
        setShowVoice(false);
        break;
      default:
        console.warn("Unknown voice command:", name);
    }
  };

  const LangSelector = () => (
    <div className="flex bg-white/5 rounded-xl p-1 border border-white/10" role="group" aria-label="Select Language">
      {(['en', 'hi', 'hinglish'] as AppLanguage[]).map((l) => (
        <button
          key={l}
          onClick={() => setLanguage(l)}
          aria-pressed={language === l}
          className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all duration-300 focus-visible:ring-2 focus-visible:ring-blue-500 outline-none ${
            language === l ? 'bg-blue-600 text-white shadow-lg' : 'text-white/50 hover:text-white/80'
          }`}
        >
          {UI_TRANSLATIONS[l].lang_label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col h-screen bg-[#050505] text-white font-sans overflow-hidden selection:bg-blue-500/30">
      <header className="p-6 flex items-center justify-between border-b border-white/5 bg-black/40 backdrop-blur-2xl z-20">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
              <i className="fa-solid fa-n text-xl" aria-hidden="true"></i>
            </div>
            <div 
              className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-black ${isOffline ? 'bg-red-500' : 'bg-green-500'}`}
              aria-label={isOffline ? 'System Offline' : 'System Online'}
            ></div>
          </div>
          <div>
            <h1 className="text-sm font-black tracking-tighter uppercase italic">{t.nexus_elite}</h1>
            <span className="text-[9px] text-white/50 font-bold uppercase tracking-[0.2em]">
              {isOffline ? t.offline_mode : t.online_mode}
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <LangSelector />
          <button 
            onClick={() => setShowVoice(true)} 
            aria-label="Activate Voice Control"
            className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 border border-white/10 transition-all active:scale-90 focus-visible:ring-2 focus-visible:ring-blue-500 outline-none"
          >
            <i className="fa-solid fa-microphone-lines text-blue-400" aria-hidden="true"></i>
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-hidden relative">
        <div 
          role="region"
          aria-label="Chat Conversation"
          className={`h-full overflow-y-auto p-6 space-y-10 scrollbar-hide transition-all duration-700 ${activeTab === 'chat' ? 'opacity-100' : 'opacity-0 absolute inset-0 scale-95 translate-y-4 pointer-events-none'}`}
        >
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-sm mx-auto space-y-8 animate-in fade-in zoom-in duration-1000">
               <div className="w-24 h-24 rounded-[2rem] bg-white/5 flex items-center justify-center border border-white/10 animate-pulse">
                  <i className="fa-solid fa-sparkles text-4xl text-blue-400" aria-hidden="true"></i>
               </div>
               <div className="space-y-2">
                 <h2 className="text-3xl font-black italic tracking-tighter">{t.namaste}</h2>
                 <p className="text-white/60 text-xs leading-relaxed uppercase tracking-widest">{t.intro_desc}</p>
               </div>
            </div>
          )}

          {messages.map((msg) => (
            <div 
              key={msg.id} 
              className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} animate-in slide-in-from-bottom-4 duration-500`}
            >
              <div 
                className={`max-w-[88%] rounded-[2rem] p-6 relative shadow-2xl ${msg.role === 'user' ? 'bg-blue-600 rounded-tr-none shadow-blue-500/10' : 'bg-white/5 border border-white/10 rounded-tl-none backdrop-blur-xl'}`}
              >
                <p className="text-sm leading-relaxed whitespace-pre-wrap font-medium">{msg.content || '...'}</p>
                {msg.imageUrl && <img src={msg.imageUrl} className="mt-4 rounded-2xl w-full border border-white/10 shadow-2xl" alt="AI Generated visualization" />}
                {msg.videoUrl && <video src={msg.videoUrl} controls className="mt-4 rounded-2xl w-full border border-white/10 shadow-2xl" aria-label="AI Generated cinematic sequence" />}
                {msg.role === 'assistant' && !msg.isStreaming && (
                  <button 
                    onClick={() => playTTS(msg.id, msg.content)} 
                    aria-label="Play Speech"
                    className="mt-4 w-8 h-8 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 border border-white/10 transition-all active:scale-90 focus-visible:ring-2 focus-visible:ring-blue-500 outline-none"
                  >
                    <i className={`fa-solid ${isPlayingAudio === msg.id ? 'fa-volume-high animate-pulse text-blue-400' : 'fa-play text-white/60'} text-[10px]`} aria-hidden="true"></i>
                  </button>
                )}
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* Core Tab */}
        <div 
          role="region"
          aria-label="System Functions"
          className={`h-full overflow-y-auto p-6 transition-all duration-700 ${activeTab === 'functions' ? 'opacity-100' : 'opacity-0 absolute inset-0 translate-y-12 pointer-events-none'}`}
        >
           <h2 className="text-3xl font-black italic tracking-tighter mb-8">{t.core_systems}</h2>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             {FUNCTION_REGISTRY.map(fn => (
               <button 
                 key={fn.id} 
                 className="p-6 rounded-[2rem] bg-white/5 border border-white/10 hover:border-white/20 hover:bg-white/[0.08] transition-all cursor-pointer group text-left focus-visible:ring-2 focus-visible:ring-blue-500 outline-none"
               >
                 <div className={`w-12 h-12 rounded-xl ${fn.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                    <i className={`fa-solid ${fn.icon} text-white`} aria-hidden="true"></i>
                 </div>
                 <h3 className="font-bold">{fn.name}</h3>
                 <p className="text-xs text-white/50">{fn.description}</p>
               </button>
             ))}
           </div>
        </div>

        {/* Bio Tab */}
        <div 
          role="region"
          aria-label="Memory Profile"
          className={`h-full overflow-y-auto p-6 transition-all duration-700 ${activeTab === 'profile' ? 'opacity-100' : 'opacity-0 absolute inset-0 scale-90 pointer-events-none'}`}
        >
           <div className="flex flex-col items-center mb-10">
              <div className="w-32 h-32 rounded-full border-4 border-blue-500/30 p-1 mb-4 relative">
                 <div className="w-full h-full rounded-full bg-zinc-900 flex items-center justify-center border border-white/10 overflow-hidden">
                    <i className="fa-solid fa-user-secret text-4xl text-white/40" aria-hidden="true"></i>
                 </div>
                 <div className="absolute inset-0 rounded-full border border-blue-500 animate-ping opacity-20"></div>
              </div>
              <h2 className="text-2xl font-black italic">{t.memory_core}</h2>
              <button 
                onClick={() => { if(confirm('Delete all learned data?')) { setMemories([]); localStorage.removeItem('nexus_memories'); } }}
                className="mt-2 text-[8px] font-black uppercase tracking-widest text-red-500/70 hover:text-red-500 transition-colors focus-visible:ring-1 focus-visible:ring-red-500 outline-none"
              >
                {t.purge}
              </button>
           </div>
           
           <div className="space-y-3">
              <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40 px-2">{t.learned_facts}</h3>
              {memories.length === 0 ? (
                <div className="p-10 text-center text-white/40 text-xs italic bg-white/5 rounded-3xl border border-white/10">Nexus is currently observing your patterns.</div>
              ) : (
                <ul className="space-y-3">
                  {memories.map(m => (
                    <li key={m.id} className="p-4 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between group hover:bg-white/10 transition-colors">
                      <p className="text-xs font-medium italic">"{m.fact}"</p>
                      <button 
                        onClick={() => setMemories(prev => prev.filter(p => p.id !== m.id))}
                        aria-label="Remove memory fact"
                        className="opacity-0 group-hover:opacity-100 text-red-500/60 hover:text-red-500 transition-all p-2 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-red-500 outline-none rounded-lg"
                      >
                        <i className="fa-solid fa-trash-can text-[10px]" aria-hidden="true"></i>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
           </div>
        </div>
      </main>

      <footer className="p-6 bg-black/60 backdrop-blur-3xl border-t border-white/5 safe-bottom">
        {activeTab === 'chat' ? (
          <form onSubmit={handleSend} className="max-w-4xl mx-auto flex items-center gap-3">
            <label htmlFor="nexus-input" className="sr-only">Input command</label>
            <input
              id="nexus-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isOffline ? t.offline_mode : isAuth ? t.placeholder : t.auth_required}
              disabled={isStreaming || isOffline}
              className="flex-1 bg-white/5 border border-white/10 rounded-full py-4 px-8 text-sm focus:outline-none focus:border-blue-500/50 transition-all placeholder:text-white/40 focus-visible:ring-2 focus-visible:ring-blue-500/30"
            />
            <button 
              type="submit" 
              disabled={!input.trim() || isStreaming || isOffline}
              aria-label="Send Message"
              className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/40 disabled:opacity-30 transition-all active:scale-90 focus-visible:ring-2 focus-visible:ring-blue-400 outline-none"
            >
               <i className={`fa-solid ${isStreaming ? 'fa-spinner animate-spin' : 'fa-arrow-up'}`} aria-hidden="true"></i>
            </button>
          </form>
        ) : (
          <nav className="flex justify-around items-center h-12 max-w-md mx-auto" role="tablist">
            <button 
              role="tab"
              // Fix: Cast activeTab to any to avoid TypeScript narrowing errors in this block
              aria-selected={(activeTab as any) === 'chat'}
              onClick={() => setActiveTab('chat')} 
              // Fix: Cast activeTab to any to avoid TypeScript narrowing errors in this block
              className={`flex flex-col items-center gap-1 transition-all focus-visible:ring-2 focus-visible:ring-blue-500 outline-none p-2 rounded-xl ${(activeTab as any) === 'chat' ? 'text-blue-500 scale-110' : 'text-white/40 hover:text-white/60'}`}
            >
              <i className="fa-solid fa-comment text-xl" aria-hidden="true"></i>
              <span className="text-[8px] font-black uppercase tracking-widest">{t.tab_nexus}</span>
            </button>
            <button 
              role="tab"
              aria-selected={activeTab === 'functions'}
              onClick={() => setActiveTab('functions')} 
              className={`flex flex-col items-center gap-1 transition-all focus-visible:ring-2 focus-visible:ring-blue-500 outline-none p-2 rounded-xl ${activeTab === 'functions' ? 'text-blue-500 scale-110' : 'text-white/40 hover:text-white/60'}`}
            >
              <i className="fa-solid fa-grid-2 text-xl" aria-hidden="true"></i>
              <span className="text-[8px] font-black uppercase tracking-widest">{t.tab_core}</span>
            </button>
            <button 
              role="tab"
              aria-selected={activeTab === 'profile'}
              onClick={() => setActiveTab('profile')} 
              className={`flex flex-col items-center gap-1 transition-all focus-visible:ring-2 focus-visible:ring-blue-500 outline-none p-2 rounded-xl ${activeTab === 'profile' ? 'text-blue-500 scale-110' : 'text-white/40 hover:text-white/60'}`}
            >
              <i className="fa-solid fa-brain text-xl" aria-hidden="true"></i>
              <span className="text-[8px] font-black uppercase tracking-widest">{t.tab_bio}</span>
            </button>
          </nav>
        )}
      </footer>

      {showFaceScan && <FaceOverlay onSuccess={() => { setIsAuth(true); setShowFaceScan(false); }} onClose={() => setShowFaceScan(false)} />}
      {showVoice && <VoiceOverlay language={language} onCommand={handleVoiceCommand} onClose={() => setShowVoice(false)} />}
      {generatingVideo && <VideoOverlay prompt={generatingVideo} />}
    </div>
  );
};

export default App;
