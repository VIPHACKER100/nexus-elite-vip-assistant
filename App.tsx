
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
  const [avatar, setAvatar] = useState<string | null>(null);
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const t = UI_TRANSLATIONS[language];

  useEffect(() => {
    const savedMessages = localStorage.getItem('nexus_messages');
    const savedMemories = localStorage.getItem('nexus_memories');
    const savedLang = localStorage.getItem('nexus_lang');
    const savedAvatar = localStorage.getItem('nexus_avatar');
    
    if (savedMessages) setMessages(JSON.parse(savedMessages));
    if (savedMemories) setMemories(JSON.parse(savedMemories));
    if (savedLang) setLanguage(savedLang as AppLanguage);
    if (savedAvatar) setAvatar(savedAvatar);

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
    if (avatar) {
      localStorage.setItem('nexus_avatar', avatar);
    } else {
      localStorage.removeItem('nexus_avatar');
    }
  }, [messages, memories, language, avatar]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatar(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
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
    if (isOffline) return;
    if (!isAuth) { setShowFaceScan(true); return; }

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: input, timestamp: Date.now(), type: 'text' };
    setMessages(prev => [...prev, userMsg]);
    const userPrompt = input;
    setInput('');

    const lowerInput = userPrompt.toLowerCase();
    if (lowerInput.includes('video') || lowerInput.includes('image')) {
      if (window.aistudio && !(await window.aistudio.hasSelectedApiKey())) {
        await window.aistudio.openSelectKey();
      }
      if (lowerInput.includes('video')) {
        setGeneratingVideo(userPrompt);
        const url = await generateVideo(userPrompt);
        setGeneratingVideo(null);
        addAssistantMessage(url ? "Temporal sequence synthesized." : "Core error.", 'video', undefined, url || undefined);
      } else {
        const url = await generateImage(userPrompt);
        addAssistantMessage(url ? "Neural visualization complete." : "Core error.", 'image', url || undefined);
      }
      return;
    }

    setIsStreaming(true);
    const assistantId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: "", timestamp: Date.now(), isStreaming: true }]);

    const resultText = await generateAssistantResponseStream(userPrompt, messages, memories, language, (chunk) => {
      setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: chunk } : m));
    });

    setIsStreaming(false);
  };

  const addAssistantMessage = (content: string, type: Message['type'] = 'text', imageUrl?: string, videoUrl?: string) => {
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', content, timestamp: Date.now(), type, imageUrl, videoUrl }]);
  };

  const NavItem = ({ id, icon, label }: { id: typeof activeTab, icon: string, label: string }) => (
    <button 
      onClick={() => setActiveTab(id)}
      className={`flex md:flex-row flex-col items-center gap-3 p-4 md:w-full rounded-2xl transition-all group focus-visible:ring-2 focus-visible:ring-blue-500 outline-none
        ${activeTab === id ? 'nexus-glass text-blue-400' : 'text-white/40 hover:text-white/80'}`}
    >
      <i className={`fa-solid ${icon} text-xl md:text-lg transition-transform group-hover:scale-110`}></i>
      <span className="text-[10px] md:text-xs font-black uppercase tracking-widest">{label}</span>
    </button>
  );

  return (
    <div className="flex h-screen bg-[#050505] overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className={`neural-blob w-[500px] h-[500px] -top-40 -left-40 bg-blue-600/30 animate-float ${isStreaming ? 'opacity-40 scale-125' : ''}`}></div>
        <div className="neural-blob w-[400px] h-[400px] -bottom-40 -right-40 bg-indigo-600/20 animate-float" style={{ animationDelay: '-5s' }}></div>
      </div>

      {/* Side Navigation - Desktop/Tablet */}
      <aside className="hidden md:flex flex-col w-64 h-full nexus-glass border-r border-white/5 p-6 z-20 relative">
        <div className="flex items-center gap-3 mb-12">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
            <i className="fa-solid fa-n text-2xl"></i>
          </div>
          <div>
            <h1 className="text-sm font-black tracking-tight uppercase italic">{t.nexus_elite}</h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className={`w-1.5 h-1.5 rounded-full ${isOffline ? 'bg-red-500' : 'bg-green-500'}`}></div>
              <span className="text-[9px] text-white/50 font-bold uppercase tracking-widest">{isOffline ? t.offline_mode : 'ACTIVE'}</span>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-2">
          <NavItem id="chat" icon="fa-comment" label={t.tab_nexus} />
          <NavItem id="functions" icon="fa-grid-2" label={t.tab_core} />
          <NavItem id="profile" icon="fa-brain" label={t.tab_bio} />
        </nav>

        <div className="space-y-4 pt-6 border-t border-white/5">
          <div className="flex bg-white/5 rounded-xl p-1 border border-white/10">
            {(['en', 'hi', 'hinglish'] as AppLanguage[]).map((l) => (
              <button key={l} onClick={() => setLanguage(l)} className={`flex-1 py-2 rounded-lg text-[8px] font-black uppercase transition-all ${language === l ? 'bg-blue-600 text-white shadow-lg' : 'text-white/30 hover:text-white/60'}`}>{UI_TRANSLATIONS[l].lang_label}</button>
            ))}
          </div>
          <button onClick={() => setShowVoice(true)} className="w-full nexus-glass py-3 rounded-2xl flex items-center justify-center gap-3 hover:bg-white/5 transition-colors">
            <i className="fa-solid fa-microphone-lines text-blue-400"></i>
            <span className="text-[10px] font-black uppercase tracking-widest text-white/60">Voice Link</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-0 relative z-10">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between p-6 nexus-glass border-b border-white/5 backdrop-blur-3xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center">
              <i className="fa-solid fa-n"></i>
            </div>
            <span className="font-black italic text-sm tracking-tighter">{t.nexus_elite}</span>
          </div>
          <button onClick={() => setShowVoice(true)} className="w-10 h-10 rounded-full nexus-glass flex items-center justify-center">
            <i className="fa-solid fa-microphone-lines text-blue-400"></i>
          </button>
        </header>

        <main className="flex-1 overflow-hidden relative">
          {/* Chat Tab */}
          <section className={`h-full overflow-y-auto p-6 md:p-12 scrollbar-neural transition-all duration-700 ${activeTab === 'chat' ? 'opacity-100' : 'opacity-0 absolute inset-0 pointer-events-none translate-y-8'}`}>
            <div className="max-w-4xl mx-auto space-y-12">
              {messages.length === 0 && (
                <div className="h-[60vh] flex flex-col items-center justify-center text-center space-y-6">
                  <div className="w-24 h-24 rounded-[2.5rem] nexus-glass flex items-center justify-center animate-pulse">
                    <i className="fa-solid fa-sparkles text-4xl text-blue-400"></i>
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-4xl md:text-5xl font-black italic tracking-tighter">{t.namaste}</h2>
                    <p className="text-white/40 text-xs md:text-sm uppercase tracking-[0.3em] font-medium">{t.intro_desc}</p>
                  </div>
                </div>
              )}

              {messages.map((msg) => (
                <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} animate-in slide-in-from-bottom-6 duration-700`}>
                  <div className={`group relative max-w-[85%] md:max-w-[70%] p-6 rounded-[2rem] transition-all shadow-2xl ${msg.role === 'user' ? 'bg-blue-600 rounded-tr-none' : 'nexus-glass rounded-tl-none'}`}>
                    <p className="text-sm md:text-base leading-relaxed font-medium whitespace-pre-wrap">{msg.content || '...'}</p>
                    {msg.imageUrl && <img src={msg.imageUrl} className="mt-4 rounded-2xl w-full border border-white/10" alt="Neural Synthesis" />}
                    {msg.videoUrl && <video src={msg.videoUrl} controls className="mt-4 rounded-2xl w-full border border-white/10" />}
                    {msg.role === 'assistant' && !msg.isStreaming && (
                      <button onClick={() => playTTS(msg.id, msg.content)} className="absolute -right-12 top-2 w-10 h-10 rounded-full nexus-glass opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <i className={`fa-solid ${isPlayingAudio === msg.id ? 'fa-volume-high animate-pulse text-blue-400' : 'fa-play text-white/40'} text-xs`}></i>
                      </button>
                    )}
                  </div>
                  <span className="mt-2 px-4 text-[9px] font-black uppercase tracking-widest text-white/20">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
          </section>

          {/* Functions Tab */}
          <section className={`h-full overflow-y-auto p-6 md:p-12 transition-all duration-700 ${activeTab === 'functions' ? 'opacity-100' : 'opacity-0 absolute inset-0 pointer-events-none translate-y-8'}`}>
            <div className="max-w-6xl mx-auto">
              <h2 className="text-4xl font-black italic tracking-tighter mb-10">{t.core_systems}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {FUNCTION_REGISTRY.map(fn => (
                  <button key={fn.id} className="p-8 rounded-[2.5rem] nexus-glass hover:bg-white/5 text-left group transition-all">
                    <div className={`w-14 h-14 rounded-2xl ${fn.color} flex items-center justify-center mb-6 shadow-xl group-hover:scale-110 transition-transform`}>
                      <i className={`fa-solid ${fn.icon} text-2xl text-white`}></i>
                    </div>
                    <h3 className="text-lg font-bold mb-2">{fn.name}</h3>
                    <p className="text-xs text-white/40 leading-relaxed uppercase tracking-wider font-medium">{fn.description}</p>
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Profile/Bio Tab */}
          <section className={`h-full overflow-y-auto p-6 md:p-12 transition-all duration-700 ${activeTab === 'profile' ? 'opacity-100' : 'opacity-0 absolute inset-0 pointer-events-none translate-y-8'}`}>
            <div className="max-w-3xl mx-auto flex flex-col items-center">
              <div className="w-40 h-40 rounded-full border-4 border-blue-500/20 p-2 mb-8 relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                <div className="w-full h-full rounded-full nexus-glass flex items-center justify-center overflow-hidden border border-white/10 transition-all group-hover:border-blue-500/50">
                  {avatar ? (
                    <img src={avatar} className="w-full h-full object-cover" alt="User Avatar" />
                  ) : (
                    <i className="fa-solid fa-user-robot text-5xl text-white/20"></i>
                  )}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <i className="fa-solid fa-camera text-2xl text-white/80"></i>
                  </div>
                </div>
                <div className="absolute inset-0 rounded-full border border-blue-500 animate-[ping_3s_infinite] opacity-10 pointer-events-none"></div>
                <input type="file" ref={fileInputRef} onChange={handleAvatarUpload} accept="image/*" className="hidden" />
              </div>
              <h2 className="text-3xl font-black italic tracking-tighter mb-2">{t.memory_core}</h2>
              <div className="flex gap-4 mb-12">
                <button onClick={() => { if(confirm('Delete all learned data?')) { setMemories([]); localStorage.removeItem('nexus_memories'); } }} className="text-[10px] font-black uppercase tracking-widest text-red-500/50 hover:text-red-400 transition-colors">{t.purge}</button>
                {avatar && (
                  <button onClick={() => setAvatar(null)} className="text-[10px] font-black uppercase tracking-widest text-blue-500/50 hover:text-blue-400 transition-colors">Reset Avatar</button>
                )}
              </div>
              
              <div className="w-full space-y-4">
                <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/20 px-4">{t.learned_facts}</h3>
                {memories.length === 0 ? (
                  <div className="p-12 rounded-[2.5rem] nexus-glass text-center text-white/20 italic text-sm">Nexus Neural Processor: Awaiting user profiling data...</div>
                ) : (
                  <div className="grid grid-cols-1 gap-3">
                    {memories.map(m => (
                      <div key={m.id} className="p-6 rounded-2xl nexus-glass flex items-center justify-between group">
                        <p className="text-sm font-medium italic">"{m.fact}"</p>
                        <button onClick={() => setMemories(prev => prev.filter(p => p.id !== m.id))} className="w-8 h-8 rounded-full hover:bg-red-500/10 text-white/20 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100">
                          <i className="fa-solid fa-trash-can text-xs"></i>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        </main>

        {/* Input Bar - Adaptive */}
        <footer className="p-6 md:px-12 md:pb-12 nexus-glass md:bg-transparent md:border-none relative z-20">
          <div className="max-w-4xl mx-auto">
            {activeTab === 'chat' ? (
              <form onSubmit={handleSend} className="flex items-center gap-4 bg-[#0a0a0a] border border-white/10 rounded-full p-2 md:p-3 shadow-2xl focus-within:border-blue-500/50 transition-all">
                <input 
                  id="nexus-input"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={isOffline ? t.offline_mode : isAuth ? t.placeholder : t.auth_required}
                  disabled={isStreaming || isOffline}
                  className="flex-1 bg-transparent py-3 px-6 text-sm md:text-base focus:outline-none placeholder:text-white/20"
                />
                <button type="submit" disabled={!input.trim() || isStreaming || isOffline} className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/40 disabled:opacity-30 active:scale-95 transition-all">
                  <i className={`fa-solid ${isStreaming ? 'fa-spinner animate-spin' : 'fa-arrow-up'} text-lg`}></i>
                </button>
              </form>
            ) : (
              <div className="md:hidden flex justify-around items-center h-16 safe-bottom">
                <button onClick={() => setActiveTab('chat')} className="flex flex-col items-center gap-1 text-white/20">
                  <i className="fa-solid fa-comment text-xl"></i>
                  <span className="text-[8px] font-black uppercase">{t.tab_nexus}</span>
                </button>
                <button onClick={() => setActiveTab('functions')} className={`flex flex-col items-center gap-1 ${activeTab === 'functions' ? 'text-blue-500' : 'text-white/20'}`}>
                  <i className="fa-solid fa-grid-2 text-xl"></i>
                  <span className="text-[8px] font-black uppercase">{t.tab_core}</span>
                </button>
                <button onClick={() => setActiveTab('profile')} className={`flex flex-col items-center gap-1 ${activeTab === 'profile' ? 'text-blue-500' : 'text-white/20'}`}>
                  <i className="fa-solid fa-brain text-xl"></i>
                  <span className="text-[8px] font-black uppercase">{t.tab_bio}</span>
                </button>
              </div>
            )}
          </div>
        </footer>
      </div>

      {/* Overlays */}
      {showFaceScan && <FaceOverlay onSuccess={() => { setIsAuth(true); setShowFaceScan(false); }} onClose={() => setShowFaceScan(false)} />}
      {showVoice && <VoiceOverlay language={language} onCommand={handleVoiceCommand} onClose={() => setShowVoice(false)} />}
      {generatingVideo && <VideoOverlay prompt={generatingVideo} />}
    </div>
  );

  function handleVoiceCommand(name: string, args?: any) {
    if (name === 'authenticate_user') { setIsAuth(true); setShowVoice(false); }
    else if (name === 'navigate_to' && args?.destination) setActiveTab(args.destination);
    else if (name === 'close_voice_control') setShowVoice(false);
  }
};

export default App;
