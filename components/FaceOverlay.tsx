import React, { useEffect, useRef, useState } from 'react';

interface FaceOverlayProps {
  onSuccess: () => void;
  onClose: () => void;
}

const FaceOverlay: React.FC<FaceOverlayProps> = ({ onSuccess, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<'IDLE' | 'SCANNING' | 'VERIFIED' | 'ERROR'>('IDLE');
  const [errorMessage, setErrorMessage] = useState('');
  const retryCount = useRef(0);
  const MAX_RETRIES = 3;
  const streamRef = useRef<MediaStream | null>(null);

  const stopAllTracks = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
        track.enabled = false;
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  useEffect(() => {
    let isMounted = true;

    const startCamera = async () => {
      // First, ensure any previous stream is stopped
      stopAllTracks();

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if (isMounted) {
          setStatus('ERROR');
          setErrorMessage('Camera API is not supported in this browser.');
        }
        return;
      }

      try {
        // Progressive constraints
        const constraintOptions = [
          { video: { facingMode: 'user' }, audio: false },
          { video: true, audio: false }
        ];

        let stream: MediaStream | null = null;
        let lastError: any = null;

        for (const constraints of constraintOptions) {
          try {
            stream = await navigator.mediaDevices.getUserMedia(constraints);
            if (stream) break;
          } catch (err) {
            lastError = err;
            continue;
          }
        }

        if (!stream && lastError) {
          throw lastError;
        }

        if (isMounted && videoRef.current && stream) {
          streamRef.current = stream;
          videoRef.current.srcObject = stream;
          
          // Wait for the video to be ready
          await new Promise<void>((resolve, reject) => {
            if (!videoRef.current) return reject();
            videoRef.current.onloadedmetadata = () => {
              videoRef.current?.play().then(resolve).catch(reject);
            };
            // Fallback for already loaded metadata
            if (videoRef.current.readyState >= 2) {
              videoRef.current.play().then(resolve).catch(reject);
            }
          });

          if (isMounted) {
            setStatus('SCANNING');
            
            // Simulate scanning process
            const scanTimer = setTimeout(() => {
              if (isMounted) {
                setStatus('VERIFIED');
                const successTimer = setTimeout(() => {
                  if (isMounted) onSuccess();
                }, 1200);
              }
            }, 2500);
          }
        }
      } catch (err: any) {
        console.error("Camera access failed:", err);
        
        // Handle hardware busy error (NotReadableError / "Could not start video source")
        if ((err.name === 'NotReadableError' || err.message?.includes('source')) && retryCount.current < MAX_RETRIES) {
          retryCount.current++;
          const backoff = 500 * retryCount.current;
          console.log(`Camera busy, retrying in ${backoff}ms (Attempt ${retryCount.current}/${MAX_RETRIES})...`);
          setTimeout(() => {
            if (isMounted) startCamera();
          }, backoff);
          return;
        }

        if (isMounted) {
          setStatus('ERROR');
          let userMsg = 'Biometric hardware failure.';
          if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            userMsg = 'Camera access denied. Please enable permissions in settings.';
          } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
            userMsg = 'No camera detected on this device.';
          } else if (err.name === 'NotReadableError' || err.message?.includes('source')) {
            userMsg = 'Camera hardware is busy. Close other apps using the camera and try again.';
          } else {
            userMsg = err.message || 'Unknown biometric hardware error.';
          }
          setErrorMessage(userMsg);
        }
      }
    };

    // Slight delay before first start to avoid race conditions with transitions
    const initialDelay = setTimeout(startCamera, 300);

    return () => {
      isMounted = false;
      clearTimeout(initialDelay);
      stopAllTracks();
    };
  }, [onSuccess, onClose]);

  return (
    <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center p-6 animate-in fade-in duration-500 backdrop-blur-xl">
      <div className="relative w-full max-w-sm aspect-[3/4] rounded-[2.5rem] overflow-hidden border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)] bg-[#050505]">
        {status !== 'ERROR' ? (
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            muted 
            className="w-full h-full object-cover grayscale opacity-60 transition-opacity duration-1000"
            style={{ opacity: status === 'SCANNING' ? 0.8 : status === 'VERIFIED' ? 1 : 0.4 }}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-10 text-center">
            <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mb-6">
                <i className="fa-solid fa-triangle-exclamation text-3xl text-red-500 animate-pulse"></i>
            </div>
            <h3 className="text-white font-bold mb-2">SCANNER ERROR</h3>
            <p className="text-white/40 text-xs leading-relaxed mb-8">{errorMessage}</p>
            <button 
              onClick={() => window.location.reload()} 
              className="px-6 py-2 rounded-full border border-white/10 text-[10px] font-black tracking-widest text-white/60 hover:text-white transition-colors"
            >
              SYSTEM REBOOT
            </button>
          </div>
        )}
        
        {/* Scanning UI Elements */}
        {status !== 'ERROR' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              {/* Scan Circle */}
              <div className={`w-72 h-72 border border-white/5 rounded-full transition-all duration-700 flex items-center justify-center ${status === 'VERIFIED' ? 'border-amber-500/50 scale-105' : 'animate-[pulse_4s_infinite]'}`}>
                  <div className={`w-64 h-64 border-2 rounded-full transition-all duration-1000 ${status === 'VERIFIED' ? 'border-amber-500 shadow-[0_0_30px_rgba(245,158,11,0.3)]' : 'border-white/10'}`}>
                      {/* Scan Line */}
                      {status === 'SCANNING' && (
                          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-amber-500 to-transparent shadow-[0_0_20px_rgba(245,158,11,0.8)] animate-[scan_2.5s_ease-in-out_infinite]"></div>
                      )}
                  </div>
              </div>

              {/* Verified Checkmark */}
              {status === 'VERIFIED' && (
                  <div className="absolute inset-0 flex items-center justify-center animate-in zoom-in duration-300">
                      <i className="fa-solid fa-check text-5xl text-amber-500 drop-shadow-lg"></i>
                  </div>
              )}
          </div>
        )}

        {/* Status Text Bar */}
        <div className="absolute bottom-10 left-0 right-0 text-center px-6 pointer-events-none">
            <div className="bg-black/40 backdrop-blur-md py-2 px-4 rounded-full border border-white/5 inline-block">
                <p className={`text-[10px] font-black tracking-[0.2em] uppercase ${status === 'VERIFIED' ? 'text-amber-500' : status === 'ERROR' ? 'text-red-500' : 'text-white/60'}`}>
                    {status === 'IDLE' && 'Initializing...'}
                    {status === 'SCANNING' && 'Verifying Bio-Signature...'}
                    {status === 'VERIFIED' && 'Access Granted'}
                    {status === 'ERROR' && 'Hardware Locked'}
                </p>
            </div>
        </div>
      </div>

      <button 
        onClick={onClose}
        className="mt-12 text-[10px] font-black tracking-[0.3em] text-white/20 hover:text-white transition-all uppercase"
      >
        CANCEL AUTHENTICATION
      </button>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes scan {
            0% { top: 10%; opacity: 0; }
            10% { opacity: 1; }
            90% { opacity: 1; }
            100% { top: 90%; opacity: 0; }
        }
      `}} />
    </div>
  );
};

export default FaceOverlay;