
import React, { useState, useRef, useEffect } from 'react';
import { Message, UserProfile, AIFunction, FunctionCategory } from './types';
import { FUNCTION_REGISTRY } from './constants';
import { generateAssistantResponse, generateAssistantResponseStream, generateImage, generateVideo } from './services/geminiService';
import FaceOverlay from './components/FaceOverlay';
import VoiceOverlay from './components/VoiceOverlay';
import VideoOverlay from './components/VideoOverlay';

// Extending window to include aistudio properties for Veo API key management as per guidelines.
// Added AIStudio interface and readonly modifier to match the pre-configured environment declarations.
declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
  interface Window {
    readonly aistudio: AIStudio;
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
  const [needsApiKey, setNeedsApiKey] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Check if an API key has been selected for Veo models as per mandatory guidelines
    const checkApiKey = async () => {
      if (window.aistudio) {
        try {
          const hasKey = await window.aistudio.hasSelectedApiKey();
          if (!hasKey) {
            setNeedsApiKey(true);
          }
        } catch (e) {
          console.error("Failed to check API key status", e);
        }
      }
    };
    checkApiKey();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSelectKey = async () => {
    if (window.aistudio) {
      await window.aistudio.openSelectKey();
      // Assume success after trigger to mitigate race conditions as per guidelines
      setNeedsApiKey(false);
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || isStreaming) return;

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
    
    // Check for video generation requests
    if (lowerInput.includes('generate video') || lowerInput.includes('make a video')) {
      // Re-verify API key selection for video models
      if (window.aistudio && !(await window.aistudio.hasSelectedApiKey())) {
        setNeedsApiKey(true);
        return;
      }

      setGeneratingVideo(userPrompt);
      const videoUrl = await generateVideo(userPrompt);
      setGeneratingVideo(null);
      if (videoUrl) {
        addAssistantMessage("Video production complete. Initializing playback.", 'video', undefined, videoUrl);
      } else {
        addAssistantMessage("An error occurred during video rendering. Please ensure you have a valid paid project key.");
      }
      return;
    }

    if (lowerInput.includes('generate image') || lowerInput.includes('create an image')) {
      const imageUrl = await generateImage(userPrompt);
      if (imageUrl) {
        addAssistantMessage("Image asset generated as requested.", 'image', imageUrl);
      } else {
        addAssistantMessage("Failed to generate image asset.");
      }
      return;
    }

    const useSearch = lowerInput.includes('search') || lowerInput.includes('news') || lowerInput.includes('latest');
    const useMaps = lowerInput.includes('restaurant') || lowerInput.includes('near') || lowerInput.includes('map');

    if (useSearch || useMaps) {
      const response = await generateAssistantResponse(userPrompt, messages, useSearch, useMaps);
      addAssistantMessage(response.text, 'text', undefined, undefined, response.sources);
    } else {
      setIsStreaming(true);
      const assistantId = (Date.now() + 1).toString();
      let currentText = "";
      
      setMessages(prev => [...prev, {
        id: assistantId,
        role: 'assistant',
        content: "",
        timestamp: Date.now(),
        isStreaming: true
      }]);

      await generateAssistantResponseStream(userPrompt, messages, (chunk) => {
        currentText = chunk;
        setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: currentText } : m));
      });

      setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, isStreaming: false } : m));
      setIsStreaming(false);
    }
  };

  const handleVoiceCommand = (name: string, args?: any) => {
    switch (name) {
      case 'authenticate_user':
        setShowFaceScan(true);
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

  const addAssistantMessage = (content: string, type: Message['type'] = 'text', imageUrl?: string, videoUrl?: string, sources?: any[]) => {
    const msg: Message = {
      id: Date.now().toString(),
      role: 'assistant',
      content,
      timestamp: Date.now(),
      type,
      imageUrl,
      videoUrl,
      groundingSources: sources
    };
    setMessages(prev => [...prev, msg]);
  };

  const handleAuthSuccess = () => {
    setIsAuth(true);
    setShowFaceScan(false);
    addAssistantMessage("Biometric authentication successful. System unlocked.");
  };

  // API Key Selection Dialog for Veo and Gemini 3 Pro features
  if (needsApiKey) {
    return (
      <div className="fixed inset-0 z-[200] bg-black flex flex-col items-center justify-center p-8 text-center bg-zinc-950">
        <div className="max-w-md w-full p-10 rounded-[3rem] bg-white/5 border border-white/10 backdrop-blur-3xl shadow-2xl">
          <div className="w-20 h-20 rounded-3xl bg-amber-500/10 flex items-center justify-center mx-auto mb-8 border border-amber-500/30">
            <i className="fa-solid fa-key text-3xl text-amber-500 animate-pulse"></i>
          </div>
          <h2 className="text-2xl font-black tracking-tighter mb-4">PREMIUM ACCESS REQUIRED</h2>
          <p className="text-white/40 text-sm leading-relaxed mb-8">
            Advanced generation models require a paid API key. Please select a key from a Google Cloud project with billing enabled.
            <br/><br/>
            <a 
              href="https://ai.google.dev/gemini-api/docs/billing" 
              target="_blank" 
              rel="noreferrer" 
              className="text-amber-500 underline underline-offset-4 hover:text-amber-400 transition-colors font-bold"
            >
              Billing Documentation
            </a>
          </p>
          <button 
            onClick={handleSelectKey}
            className="w-full py-5 rounded-full bg-amber-500 hover:bg-amber-400 text-black text-xs font-black tracking-widest uppercase transition-all shadow-xl shadow-amber-500/20 active:scale-95 mb-4"
          >
            Open Selection Dialog
          </button>
          <p className="text-[10px] text-white/20 uppercase tracking-widest">Veo 3.1 & Gemini 3 Pro Prototyping</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#0a0a0a] text-white font-sans overflow-hidden">
      <header className="p-6 flex items-center justify-between border-b border-white/5 bg-black/50 backdrop-blur-xl z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <i className="fa-solid fa-microchip text-xl"></i>
          </div>
          <div>
            <h1 className="text-sm font-black tracking-tighter uppercase">Nexus VIP v8.0</h1>
            <div className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${isAuth ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
              <span className="text-[10px] text-white/40 font-bold uppercase tracking-widest">
                {isAuth ? 'Secure Session' : 'Locked'}
              </span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setShowVoice(true)}
            className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors"
          >
            <i className="fa-solid fa-microphone-lines text-white/60"></i>
          </button>
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-zinc-700 to-zinc-900 border border-white/10 flex items-center justify-center overflow-hidden">
             <i className="fa-solid fa-user text-white/20"></i>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-hidden relative">
        <div className={`h-full overflow-y-auto p-6 space-y-8 scrollbar-hide transition-all duration-500 ${activeTab === 'chat' ? 'opacity-100' : 'opacity-0 pointer-events-none absolute inset-0 scale-95'}`}>
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-sm mx-auto space-y-6">
              <div className="w-20 h-20 rounded-3xl bg-white/5 flex items-center justify-center mb-4">
                 <i className="fa-solid fa-bolt-lightning text-3xl text-blue-500"></i>
              </div>
              <h2 className="text-2xl font-bold italic tracking-tight">Advanced Intelligence</h2>
              <p className="text-white/40 text-sm leading-relaxed">
                Experience the pinnacle of AI technology with reasoning, high-end video generation, and real-time world grounding.
              </p>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-3xl p-5 ${
                msg.role === 'user' 
                  ? 'bg-blue-600 text-white shadow-xl shadow-blue-500/10' 
                  : 'bg-white/5 border border-white/10 backdrop-blur-md'
              }`}>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                {msg.imageUrl && <img src={msg.imageUrl} alt="AI" className="mt-4 rounded-2xl w-full" />}
                {msg.videoUrl && <video src={msg.videoUrl} controls className="mt-4 rounded-2xl w-full" />}
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* Functions Grid View */}
        <div className={`h-full overflow-y-auto p-6 transition-all duration-500 ${activeTab === 'functions' ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8 pointer-events-none absolute inset-0'}`}>
          <h2 className="text-2xl font-bold mb-8">Capacities</h2>
          <div className="grid grid-cols-2 gap-4">
            {FUNCTION_REGISTRY.map(fn => (
              <div key={fn.id} className="p-6 rounded-3xl bg-white/5 border border-white/5 hover:border-white/20 transition-all cursor-pointer group">
                <div className={`w-12 h-12 rounded-2xl ${fn.color} flex items-center justify-center mb-4 shadow-lg`}>
                  <i className={`fa-solid ${fn.icon} text-white text-xl`}></i>
                </div>
                <h3 className="font-bold text-sm mb-1">{fn.name}</h3>
                <p className="text-[10px] text-white/40 uppercase tracking-widest">{fn.category}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Profile View */}
        <div className={`h-full flex flex-col items-center justify-center p-6 transition-all duration-500 ${activeTab === 'profile' ? 'opacity-100 scale-100' : 'opacity-0 scale-90 pointer-events-none absolute inset-0'}`}>
          <div className="w-32 h-32 rounded-full bg-gradient-to-br from-zinc-700 to-zinc-950 p-1 mb-6 shadow-2xl">
            <div className="w-full h-full rounded-full bg-[#0a0a0a] flex items-center justify-center">
              <i className="fa-solid fa-user text-4xl text-white/20"></i>
            </div>
          </div>
          <h2 className="text-2xl font-black tracking-tight">VIP PRESTIGE</h2>
          <p className="text-blue-500 text-[10px] font-bold uppercase tracking-[0.3em] mt-2">Active Protocol: v8.0</p>
        </div>
      </main>

      <footer className="p-6 bg-black/50 backdrop-blur-2xl border-t border-white/5">
        {activeTab === 'chat' ? (
          <form onSubmit={handleSend} className="relative max-w-4xl mx-auto">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isAuth ? "Direct your Nexus Assistant..." : "Authentication Required..."}
              className="w-full bg-white/5 border border-white/10 rounded-full py-4 px-6 pr-14 text-sm focus:outline-none focus:border-blue-500/50 transition-all placeholder:text-white/20"
            />
            <button 
              type="submit"
              disabled={!input.trim() || isStreaming}
              className="absolute right-2 top-2 w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:grayscale transition-all active:scale-95"
            >
              <i className="fa-solid fa-arrow-up text-sm"></i>
            </button>
          </form>
        ) : (
          <div className="flex justify-around items-center h-14">
            <button onClick={() => setActiveTab('chat')} className="flex flex-col items-center gap-1 text-white/40">
              <i className="fa-solid fa-comment-dots text-xl"></i>
              <span className="text-[9px] font-black uppercase">Chat</span>
            </button>
            <button onClick={() => setActiveTab('functions')} className={`flex flex-col items-center gap-1 ${activeTab === 'functions' ? 'text-blue-500' : 'text-white/40'}`}>
              <i className="fa-solid fa-layer-group text-xl"></i>
              <span className="text-[9px] font-black uppercase">Caps</span>
            </button>
            <button onClick={() => setActiveTab('profile')} className={`flex flex-col items-center gap-1 ${activeTab === 'profile' ? 'text-blue-500' : 'text-white/40'}`}>
              <i className="fa-solid fa-user-shield text-xl"></i>
              <span className="text-[9px] font-black uppercase">User</span>
            </button>
          </div>
        )}
      </footer>

      {showFaceScan && <FaceOverlay onSuccess={handleAuthSuccess} onClose={() => setShowFaceScan(false)} />}
      {showVoice && <VoiceOverlay onCommand={handleVoiceCommand} onClose={() => setShowVoice(false)} />}
      {generatingVideo && <VideoOverlay prompt={generatingVideo} />}
    </div>
  );
};

export default App;
