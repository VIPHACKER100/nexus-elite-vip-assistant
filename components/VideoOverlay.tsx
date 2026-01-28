
import React, { useState, useEffect } from 'react';

interface VideoOverlayProps {
  prompt: string;
}

const VideoOverlay: React.FC<VideoOverlayProps> = ({ prompt }) => {
  const [step, setStep] = useState(0);
  const steps = [
    "Analyzing visual concepts...",
    "Initializing Veo 3.1 Neural Engine...",
    "Rendering temporal sequences...",
    "Simulating physics and light...",
    "Finalizing high-end cinematic output..."
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setStep(prev => (prev + 1) % steps.length);
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center p-8 text-center">
      <div className="absolute inset-0 opacity-20 pointer-events-none overflow-hidden">
        <div className="w-[200%] h-[200%] bg-gradient-to-tr from-amber-500/20 via-transparent to-blue-500/20 animate-[spin_20s_linear_infinite]" />
      </div>
      
      <div className="relative">
        <div className="w-24 h-24 border-4 border-amber-500/20 rounded-full border-t-amber-500 animate-spin mb-8" />
        <div className="absolute inset-0 flex items-center justify-center">
          <i className="fa-solid fa-video text-amber-500 text-2xl animate-pulse"></i>
        </div>
      </div>

      <h2 className="text-2xl font-bold tracking-tight text-white mb-2">CREATING CINEMATIC VIDEO</h2>
      <p className="text-amber-500/80 font-mono text-sm uppercase tracking-widest mb-12">
        {steps[step]}
      </p>

      <div className="max-w-md p-6 rounded-2xl glass border border-white/10 text-white/40 text-sm italic">
        "{prompt}"
      </div>
      
      <p className="mt-12 text-white/20 text-[10px] uppercase tracking-widest font-bold">
        VE0 3.1 FAST PREVIEW ENGINE ACTIVE
      </p>
    </div>
  );
};

export default VideoOverlay;
