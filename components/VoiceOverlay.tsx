
import React, { useEffect, useState, useRef } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage, Type, FunctionDeclaration } from '@google/genai';
import { decodeAudioData, decodeBase64, createPcmBlob } from '../services/audioService';

interface VoiceOverlayProps {
  onClose: () => void;
  onCommand?: (command: string, args?: any) => void;
}

const VoiceOverlay: React.FC<VoiceOverlayProps> = ({ onClose, onCommand }) => {
  const [status, setStatus] = useState<'CONNECTING' | 'LISTENING' | 'THINKING' | 'EXECUTING'>('CONNECTING');
  const [transcript, setTranscript] = useState('');
  const [volume, setVolume] = useState(0);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  // Function declarations for the Voice Assistant to "Control" the app
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
            systemInstruction: `You are the Nexus VIP Voice OS. You have direct control over the app's navigation and security modules. 
            Keep responses brief and sophisticated. When executing a tool, inform the user with a short confirmation.`,
          },
          callbacks: {
            onopen: () => {
              setStatus('LISTENING');
              const source = inputCtx.createMediaStreamSource(micStream!);
              scriptProcessor = inputCtx.createScriptProcessor(2048, 1, 1);
              
              scriptProcessor.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);
                
                // Calculate real-time volume for visualization
                let sum = 0;
                for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
                const rms = Math.sqrt(sum / inputData.length);
                setVolume(rms);

                const pcmBlob = createPcmBlob(inputData);
                sessionPromise.then(s => s.sendRealtimeInput({ media: pcmBlob }));
              };
              
              source.connect(scriptProcessor);
              scriptProcessor.connect(inputCtx.destination);
            },
            onmessage: async (msg: LiveServerMessage) => {
                // Handle Function Calls (Voice Control Logic)
                if (msg.toolCall) {
                  setStatus('EXECUTING');
                  for (const fc of msg.toolCall.functionCalls) {
                    console.log("Voice Command Executing:", fc.name, fc.args);
                    
                    if (onCommand) onCommand(fc.name, fc.args);
                    
                    // Respond back to AI to confirm tool execution
                    sessionPromise.then(s => s.sendToolResponse({
                      functionResponses: [{
                        id: fc.id,
                        name: fc.name,
                        response: { result: "Action completed successfully" }
                      }]
                    }));

                    if (fc.name === 'close_voice_control') {
                      setTimeout(onClose, 1000);
                    }
                  }
                  setTimeout(() => setStatus('LISTENING'), 2000);
                }

                // Audio Output
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
                    setTranscript(msg.serverContent.inputTranscription.text);
                }
                
                if (msg.serverContent?.interrupted) {
                    sourcesRef.current.forEach(s => s.stop());
                    sourcesRef.current.clear();
                    nextStartTimeRef.current = 0;
                    setStatus('LISTENING');
                }
            },
            onclose: () => onClose(),
            onerror: (e) => console.error("Neural Voice Error:", e)
          }
        });
      } catch (err) {
        console.error("Critical Voice Failure:", err);
        onClose();
      }
    };

    setupLiveSession();

    return () => {
      micStream?.getTracks().forEach(t => t.stop());
      scriptProcessor?.disconnect();
      audioContextRef.current?.close();
    };
  }, [onClose, onCommand]);

  return (
    <div className={`fixed inset-0 z-[100] transition-colors duration-1000 flex flex-col items-center justify-between p-12 backdrop-blur-3xl ${
      status === 'EXECUTING' ? 'bg-amber-500/10' : 
      status === 'THINKING' ? 'bg-blue-500/10' : 'bg-black/90'
    }`}>
      {/* Dynamic Background Glow */}
      <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80vw] h-[80vw] rounded-full blur-[120px] transition-all duration-1000 opacity-20 pointer-events-none ${
        status === 'EXECUTING' ? 'bg-amber-500 scale-110' : 
        status === 'THINKING' ? 'bg-blue-500 scale-100' : 'bg-white scale-90'
      }`} />

      <div className="flex flex-col items-center gap-6 text-center relative z-10">
        <div className={`w-20 h-20 rounded-3xl flex items-center justify-center border transition-all duration-500 ${
          status === 'EXECUTING' ? 'bg-amber-500/20 border-amber-500 animate-bounce' : 
          status === 'THINKING' ? 'bg-blue-500/20 border-blue-500' : 'bg-white/5 border-white/10'
        }`}>
          <i className={`fa-solid ${
            status === 'EXECUTING' ? 'fa-gears' : 
            status === 'THINKING' ? 'fa-brain' : 'fa-microphone-lines'
          } text-3xl transition-all ${
            status === 'EXECUTING' ? 'text-amber-400' : 
            status === 'THINKING' ? 'text-blue-400' : 'text-white/40'
          }`}></i>
        </div>
        <div>
          <h2 className="text-sm font-black tracking-[0.4em] uppercase text-white/40 mb-2">Nexus Voice OS</h2>
          <p className="text-2xl font-bold tracking-tight text-white">
            {status === 'CONNECTING' ? 'INITIALIZING NEURAL LINK' : 
             status === 'EXECUTING' ? 'EXECUTING COMMAND' :
             status === 'THINKING' ? 'PROCESSING' : 'LISTENING'}
          </p>
        </div>
      </div>

      <div className="w-full max-w-md flex flex-col gap-12 items-center relative z-10">
        {/* Spectral Wave Visualizer */}
        <div className="flex items-end gap-1.5 h-24">
            {[...Array(12)].map((_, i) => {
                const height = 10 + (volume * (100 + Math.random() * 200)) * (1 - Math.abs(i - 6) / 7);
                return (
                    <div 
                        key={i} 
                        className={`w-1.5 rounded-full transition-all duration-75 ${
                          status === 'EXECUTING' ? 'bg-amber-400' : 
                          status === 'THINKING' ? 'bg-blue-400' : 'bg-white/40'
                        }`}
                        style={{ height: `${Math.min(height, 90)}%` }}
                    />
                );
            })}
        </div>

        <div className="h-20 flex items-center justify-center">
          {transcript && (
              <p className="text-white/60 text-lg font-medium italic animate-in fade-in slide-in-from-bottom-2">
                  "{transcript}"
              </p>
          )}
        </div>
      </div>

      <button 
        onClick={onClose}
        className="w-20 h-20 rounded-full bg-white/5 border border-white/10 text-white/40 flex items-center justify-center hover:bg-red-500/20 hover:border-red-500 hover:text-red-500 transition-all active:scale-90 group relative z-10"
      >
        <i className="fa-solid fa-power-off text-2xl"></i>
      </button>
    </div>
  );
};

export default VoiceOverlay;
