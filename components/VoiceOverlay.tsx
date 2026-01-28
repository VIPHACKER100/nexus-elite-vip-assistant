
import React, { useEffect, useState, useRef } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage, Type, FunctionDeclaration } from '@google/genai';
import { decodeAudioData, decodeBase64, createPcmBlob } from '../services/audioService';
import { UI_TRANSLATIONS } from '../constants';
import { AppLanguage } from '../types';

interface CachedCommand {
  id: string;
  text: string;
  action?: string;
  args?: any;
  timestamp: number;
}

interface VoiceOverlayProps {
  onClose: () => void;
  onCommand?: (command: string, args?: any) => void;
  language: AppLanguage;
}

const VoiceOverlay: React.FC<VoiceOverlayProps> = ({ onClose, onCommand, language }) => {
  const [status, setStatus] = useState<'CONNECTING' | 'LISTENING' | 'THINKING' | 'EXECUTING' | 'OFFLINE'>('CONNECTING');
  const [transcript, setTranscript] = useState('');
  const [volume, setVolume] = useState(0);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [cachedProtocols, setCachedProtocols] = useState<CachedCommand[]>([]);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const lastTranscriptionRef = useRef<string>('');
  
  const t = UI_TRANSLATIONS[language];

  // Function declarations for the Live API
  const functionDeclarations: FunctionDeclaration[] = [
    {
      name: 'authenticate_user',
      description: 'Trigger the biometric face recognition scanner to unlock the system.',
      parameters: { type: Type.OBJECT, properties: {} }
    },
    {
      name: 'navigate_to',
      description: 'Switch between the main app sections: chat, functions, or profile.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          destination: { type: Type.STRING, enum: ['chat', 'functions', 'profile'] }
        },
        required: ['destination']
      }
    },
    {
      name: 'close_voice_control',
      description: 'Exit the voice interaction mode and return to the main interface.',
      parameters: { type: Type.OBJECT, properties: {} }
    }
  ];

  useEffect(() => {
    // Load advanced cached commands
    const saved = localStorage.getItem('nexus_protocol_cache');
    if (saved) setCachedProtocols(JSON.parse(saved));

    const handleNetworkChange = () => {
      const online = navigator.onLine;
      setIsOnline(online);
      if (!online) setStatus('OFFLINE');
    };

    window.addEventListener('online', handleNetworkChange);
    window.addEventListener('offline', handleNetworkChange);

    return () => {
      window.removeEventListener('online', handleNetworkChange);
      window.removeEventListener('offline', handleNetworkChange);
    };
  }, []);

  const saveToCache = (newCommand: Partial<CachedCommand>) => {
    setCachedProtocols(prev => {
      // Find if we should update an existing "recent" one or add new
      const now = Date.now();
      const updated = [
        {
          id: Math.random().toString(36).substring(7),
          text: newCommand.text || lastTranscriptionRef.current || 'Unknown command',
          action: newCommand.action,
          args: newCommand.args,
          timestamp: now,
          ...newCommand
        },
        ...prev.filter(p => p.action !== newCommand.action || JSON.stringify(p.args) !== JSON.stringify(newCommand.args))
      ].slice(0, 6);
      
      localStorage.setItem('nexus_protocol_cache', JSON.stringify(updated));
      return updated;
    });
  };

  useEffect(() => {
    if (!isOnline) {
      setStatus('OFFLINE');
      return;
    }

    let micStream: MediaStream | null = null;
    let scriptProcessor: ScriptProcessorNode | null = null;

    const setupLiveSession = async () => {
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        audioContextRef.current = outputCtx;

        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });

        const sessionPromise = ai.live.connect({
          model: 'gemini-2.5-flash-native-audio-preview-12-2025',
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
            },
            tools: [{ functionDeclarations }],
            inputAudioTranscription: {},
            systemInstruction: `You are the Nexus VIP Voice OS. You talk like an elite human assistant.
            Response Guidelines:
            - Keep confirmations extremely short ("Link active", "Navigating now", "Authentication ready").
            - Maintain high-end vocabulary.
            - Focus on efficiency.`,
          },
          callbacks: {
            onopen: () => {
              setStatus('LISTENING');
              const source = inputCtx.createMediaStreamSource(micStream!);
              scriptProcessor = inputCtx.createScriptProcessor(2048, 1, 1);
              
              scriptProcessor.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);
                let sum = 0;
                for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
                setVolume(Math.sqrt(sum / inputData.length));
                const pcmBlob = createPcmBlob(inputData);
                sessionPromise.then(s => s.sendRealtimeInput({ media: pcmBlob }));
              };
              
              source.connect(scriptProcessor);
              scriptProcessor.connect(inputCtx.destination);
            },
            onmessage: async (msg: LiveServerMessage) => {
                if (msg.toolCall) {
                  setStatus('EXECUTING');
                  for (const fc of msg.toolCall.functionCalls) {
                    // Execute locally
                    if (onCommand) onCommand(fc.name, fc.args);
                    
                    // Cache the successful tool call for offline re-use
                    saveToCache({ action: fc.name, args: fc.args, text: lastTranscriptionRef.current });

                    sessionPromise.then(s => s.sendToolResponse({
                      functionResponses: [{ id: fc.id, name: fc.name, response: { result: "Success" } }]
                    }));
                    if (fc.name === 'close_voice_control') setTimeout(onClose, 1000);
                  }
                  setTimeout(() => setStatus('LISTENING'), 1500);
                }

                const base64Audio = msg.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
                if (base64Audio) {
                    setStatus('THINKING');
                    nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
                    const buffer = await decodeAudioData(decodeBase64(base64Audio), outputCtx, 24000, 1);
                    const source = outputCtx.createBufferSource();
                    source.buffer = buffer;
                    source.connect(outputCtx.destination);
                    source.onended = () => {
                      sourcesRef.current.delete(source);
                      if (sourcesRef.current.size === 0) setStatus('LISTENING');
                    };
                    source.start(nextStartTimeRef.current);
                    nextStartTimeRef.current += buffer.duration;
                    sourcesRef.current.add(source);
                }

                if (msg.serverContent?.inputTranscription) {
                    const txt = msg.serverContent.inputTranscription.text;
                    setTranscript(txt);
                    lastTranscriptionRef.current = txt;
                }
                
                if (msg.serverContent?.interrupted) {
                    sourcesRef.current.forEach(s => s.stop());
                    sourcesRef.current.clear();
                    nextStartTimeRef.current = 0;
                    setStatus('LISTENING');
                }
            },
            onclose: () => setStatus('OFFLINE'),
            onerror: () => setStatus('OFFLINE')
          }
        });
      } catch (err) {
        setStatus('OFFLINE');
      }
    };

    setupLiveSession();

    return () => {
      micStream?.getTracks().forEach(t => t.stop());
      scriptProcessor?.disconnect();
      audioContextRef.current?.close();
    };
  }, [isOnline, onClose, onCommand]);

  const handleProtocolExecution = (protocol: CachedCommand) => {
    if (protocol.action && onCommand) {
      setTranscript(protocol.text);
      setStatus('EXECUTING');
      onCommand(protocol.action, protocol.args);
      setTimeout(() => {
        if (protocol.action === 'close_voice_control') onClose();
        else setStatus('OFFLINE');
      }, 800);
    }
  };

  const getActionLabel = (action?: string, args?: any) => {
    if (!action) return 'Query';
    switch (action) {
      case 'authenticate_user': return 'Bio-Auth';
      case 'navigate_to': return `Go to ${args?.destination || 'Core'}`;
      case 'close_voice_control': return 'Terminate';
      default: return 'System';
    }
  };

  return (
    <div 
      role="dialog"
      aria-modal="true"
      aria-label="Nexus Voice OS"
      className={`fixed inset-0 z-[100] transition-all duration-1000 flex flex-col items-center justify-between p-8 pb-12 backdrop-blur-3xl ${
      status === 'OFFLINE' ? 'bg-red-950/60' :
      status === 'EXECUTING' ? 'bg-amber-600/20' : 
      status === 'THINKING' ? 'bg-blue-600/20' : 'bg-black/95'
    }`}>
      {/* Dynamic Ambient Glow */}
      <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120vw] h-[120vw] rounded-full blur-[160px] transition-all duration-1000 opacity-20 pointer-events-none ${
        status === 'OFFLINE' ? 'bg-red-500 scale-110' :
        status === 'EXECUTING' ? 'bg-amber-400 scale-100' : 
        status === 'THINKING' ? 'bg-blue-400 scale-105' : 'bg-white/10 scale-90'
      }`} aria-hidden="true" />

      {/* Header Status */}
      <div className="flex flex-col items-center gap-6 text-center relative z-10 pt-10">
        <div 
          className={`w-24 h-24 rounded-[2rem] flex items-center justify-center border-2 transition-all duration-700 shadow-2xl ${
          status === 'OFFLINE' ? 'bg-red-500/10 border-red-500 animate-pulse shadow-red-500/20' :
          status === 'EXECUTING' ? 'bg-amber-500/10 border-amber-500 shadow-amber-500/20' : 
          status === 'THINKING' ? 'bg-blue-500/10 border-blue-500 shadow-blue-500/20' : 'bg-white/5 border-white/10'
        }`}
        >
          <i className={`fa-solid ${
            status === 'OFFLINE' ? 'fa-triangle-exclamation' :
            status === 'EXECUTING' ? 'fa-microchip' : 
            status === 'THINKING' ? 'fa-atom' : 'fa-microphone-lines'
          } text-4xl transition-all ${
            status === 'OFFLINE' ? 'text-red-400' :
            status === 'EXECUTING' ? 'text-amber-400' : 
            status === 'THINKING' ? 'text-blue-400' : 'text-white/60'
          }`}></i>
        </div>
        <div>
          <h2 className="text-[10px] font-black tracking-[0.6em] uppercase text-white/40 mb-3 ml-[0.6em]">Nexus Neural Link</h2>
          <p 
            className="text-3xl font-black tracking-tighter text-white uppercase italic"
            aria-live="polite"
          >
            {status === 'CONNECTING' ? 'SYNCING...' : 
             status === 'OFFLINE' ? 'LINK SEVERED' :
             status === 'EXECUTING' ? 'UPDATING...' :
             status === 'THINKING' ? 'REASONING...' : 'LISTENING'}
          </p>
        </div>
      </div>

      {/* Main Interaction Area */}
      <div className="w-full max-w-lg flex flex-col gap-10 items-center relative z-10">
        {status !== 'OFFLINE' ? (
          <>
            <div 
              className="flex items-end gap-2 h-32" 
              aria-hidden="true"
            >
                {[...Array(16)].map((_, i) => {
                    const height = 15 + (volume * (150 + Math.random() * 250)) * (1 - Math.abs(i - 8) / 9);
                    return (
                        <div 
                            key={i} 
                            className={`w-2 rounded-full transition-all duration-100 shadow-sm ${
                              status === 'EXECUTING' ? 'bg-amber-400 shadow-amber-500/50' : 
                              status === 'THINKING' ? 'bg-blue-400 shadow-blue-500/50' : 'bg-white/40'
                            }`}
                            style={{ height: `${Math.min(height, 100)}%` }}
                        />
                    );
                })}
            </div>
            <div className="min-h-[4rem] px-8 flex items-center justify-center text-center">
              {transcript && (
                  <p 
                    className="text-xl text-white font-medium italic animate-in fade-in slide-in-from-bottom-4 duration-500 leading-tight"
                    aria-live="polite"
                  >
                      "{transcript}"
                  </p>
              )}
            </div>
          </>
        ) : (
          <div className="p-8 rounded-[3rem] bg-white/5 border border-white/10 backdrop-blur-3xl animate-in zoom-in slide-in-from-bottom-8 duration-700 w-full shadow-2xl">
            <div className="flex items-center justify-between mb-8 px-2">
                <div>
                   <p className="text-white/80 text-xs font-black uppercase tracking-widest">{t.offline_msg}</p>
                   <p className="text-[10px] text-white/40 uppercase tracking-widest mt-1">Localized Protocol Cache Active</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center border border-red-500/30">
                   <i className="fa-solid fa-wifi-slash text-red-400"></i>
                </div>
            </div>

            <nav className="space-y-4" aria-label="Recent Voice Protocols">
              <h4 className="text-[10px] font-black text-white/30 uppercase tracking-[0.4em] ml-2 mb-4">Saved Neural States</h4>
              {cachedProtocols.length === 0 ? (
                <div className="text-[11px] text-white/20 italic text-center py-8 border border-dashed border-white/5 rounded-2xl">Buffer empty. Awaiting successful sync.</div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {cachedProtocols.map((protocol) => (
                    <button
                      key={protocol.id}
                      onClick={() => handleProtocolExecution(protocol)}
                      className="group w-full text-left p-5 rounded-2xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/5 hover:border-white/20 transition-all focus-visible:ring-2 focus-visible:ring-amber-500 outline-none flex items-center gap-4 relative overflow-hidden"
                    >
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-colors ${protocol.action ? 'bg-amber-500/10 border-amber-500/30 text-amber-500' : 'bg-white/5 border-white/10 text-white/30'}`}>
                         <i className={`fa-solid ${protocol.action === 'authenticate_user' ? 'fa-fingerprint' : protocol.action === 'navigate_to' ? 'fa-location-arrow' : 'fa-bolt-lightning'} text-sm`}></i>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                           <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/40">{getActionLabel(protocol.action, protocol.args)}</span>
                           <span className="text-[8px] text-white/20 uppercase font-bold">{new Date(protocol.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                        </div>
                        <p className="text-[13px] text-white/90 font-medium truncate italic leading-none">"{protocol.text}"</p>
                      </div>
                      <i className="fa-solid fa-chevron-right text-[10px] text-white/10 group-hover:text-amber-500 group-hover:translate-x-1 transition-all" aria-hidden="true"></i>
                    </button>
                  ))}
                </div>
              )}
            </nav>
          </div>
        )}
      </div>

      {/* Control Footer */}
      <div className="relative z-10 w-full flex flex-col items-center gap-6">
          <p className="text-[9px] font-bold text-white/20 uppercase tracking-[0.5em] animate-pulse">
            Spectral Bio-Link v3.0
          </p>
          <button 
            onClick={onClose}
            aria-label="Terminate Connection"
            className="w-24 h-24 rounded-full bg-white/5 border border-white/10 text-white/40 flex items-center justify-center hover:bg-red-500/20 hover:border-red-500 hover:text-red-500 transition-all active:scale-90 shadow-2xl group focus-visible:ring-2 focus-visible:ring-red-500 outline-none"
          >
            <i className="fa-solid fa-power-off text-3xl transition-transform group-hover:rotate-12" aria-hidden="true"></i>
          </button>
      </div>
    </div>
  );
};

export default VoiceOverlay;
