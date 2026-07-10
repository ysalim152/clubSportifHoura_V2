import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { ShieldAlert, Lock, Unlock, RefreshCw, CheckCircle2, ShieldCheck } from 'lucide-react';

interface AntiRobotVerificationProps {
  onVerify: (verified: boolean) => void;
  isVerified: boolean;
}

export default function AntiRobotVerification({ onVerify, isVerified }: AntiRobotVerificationProps) {
  const [sliderValue, setSliderValue] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [mathChallenge, setMathChallenge] = useState({ num1: 0, num2: 0, result: 0 });
  const [userAnswer, setUserAnswer] = useState('');
  const [showMath, setShowMath] = useState(false);
  const [challengeError, setChallengeError] = useState<string | null>(null);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<number>(0);

  // Generate a random arithmetic challenge
  const generateMath = () => {
    const num1 = Math.floor(Math.random() * 9) + 1; // 1-9
    const num2 = Math.floor(Math.random() * 9) + 1; // 1-9
    setMathChallenge({ num1, num2, result: num1 + num2 });
    setUserAnswer('');
    setChallengeError(null);
  };

  useEffect(() => {
    generateMath();
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isVerified) return;
    setIsDragging(true);
    dragStartRef.current = Date.now();
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (isVerified) return;
    setIsDragging(true);
    dragStartRef.current = Date.now();
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !containerRef.current || isVerified) return;
      
      const rect = containerRef.current.getBoundingClientRect();
      const width = rect.width - 56; // handle width is 14 (56px)
      const clientX = e.clientX;
      const relativeX = clientX - rect.left - 28;
      
      let percentage = (relativeX / width) * 100;
      if (percentage < 0) percentage = 0;
      if (percentage > 100) percentage = 100;
      
      setSliderValue(percentage);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging || !containerRef.current || isVerified) return;
      
      const rect = containerRef.current.getBoundingClientRect();
      const width = rect.width - 56;
      const clientX = e.touches[0].clientX;
      const relativeX = clientX - rect.left - 28;
      
      let percentage = (relativeX / width) * 100;
      if (percentage < 0) percentage = 0;
      if (percentage > 100) percentage = 100;
      
      setSliderValue(percentage);
    };

    const handleMouseUp = () => {
      if (!isDragging) return;
      setIsDragging(false);
      
      if (sliderValue >= 98) {
        // Behavioral analysis check: if it was too fast (e.g., < 200ms), it might be a bot
        const duration = Date.now() - dragStartRef.current;
        if (duration < 200) {
          setChallengeError("Mouvement suspect détecté. Veuillez recommencer.");
          setSliderValue(0);
          return;
        }

        // Trigger step 2: Simple math challenge for double layer of security!
        setShowMath(true);
      } else {
        // Reset slider if not fully slid
        setSliderValue(0);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchmove', handleTouchMove);
    window.addEventListener('touchend', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [isDragging, sliderValue, isVerified]);

  const handleVerifyMathSubmit = () => {
    if (parseInt(userAnswer) === mathChallenge.result) {
      onVerify(true);
      setShowMath(false);
      setChallengeError(null);
    } else {
      setChallengeError("Calcul incorrect. Veuillez réessayer.");
      generateMath();
      setSliderValue(0);
      setShowMath(false);
    }
  };

  const handleReset = () => {
    setSliderValue(0);
    onVerify(false);
    setShowMath(false);
    setChallengeError(null);
    generateMath();
  };

  return (
    <div className="w-full space-y-3.5" id="robot-verification-container">
      {!isVerified ? (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 shadow-inner">
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
              Sécurité anti-robot
            </span>
            <button
              type="button"
              onClick={handleReset}
              className="text-slate-400 hover:text-slate-600 transition"
              title="Recommencer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          {challengeError && (
            <p className="text-xs font-semibold text-red-600 bg-red-50 border border-red-100 rounded-lg p-2 flex items-center gap-1.5 animate-pulse">
              <span>{challengeError}</span>
            </p>
          )}

          {!showMath ? (
            <div 
              ref={containerRef}
              className="relative h-12 bg-white border border-slate-200 rounded-xl overflow-hidden flex items-center justify-center select-none shadow-sm"
            >
              {/* Slider background instructions */}
              <span className="text-xs font-medium text-slate-400 pointer-events-none transition-opacity duration-150">
                Faites glisser pour vérifier
              </span>

              {/* Slider fill background */}
              <div 
                className="absolute left-0 top-0 bottom-0 bg-emerald-50 pointer-events-none transition-all"
                style={{ width: `${sliderValue}%` }}
              />

              {/* Slider thumb/handle */}
              <div
                onMouseDown={handleMouseDown}
                onTouchStart={handleTouchStart}
                className={`absolute left-1 top-1 bottom-1 w-12 bg-white rounded-lg border flex items-center justify-center shadow-md cursor-grab active:cursor-grabbing transition-colors duration-200 ${
                  isDragging ? 'border-emerald-500 bg-emerald-50 text-emerald-600' : 'border-slate-200 text-slate-400'
                }`}
                style={{ left: `calc(${sliderValue}% * (100% - 48px) / 100 + 4px)` }}
              >
                {sliderValue >= 98 ? (
                  <Unlock className="w-4.5 h-4.5 text-emerald-600" />
                ) : (
                  <Lock className="w-4.5 h-4.5" />
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-2.5 animate-fade-in">
              <p className="text-xs font-medium text-slate-600">
                Dernière étape : Combien font <span className="font-bold text-slate-900">{mathChallenge.num1} + {mathChallenge.num2}</span> ?
              </p>
              <div className="flex gap-2">
                <input
                  type="number"
                  required
                  placeholder="Votre réponse"
                  value={userAnswer}
                  onChange={(e) => setUserAnswer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleVerifyMathSubmit();
                    }
                  }}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm outline-none text-slate-900"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleVerifyMathSubmit}
                  className="px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-xs transition duration-150 shadow-sm"
                >
                  Valider
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center justify-between shadow-sm animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-500 text-white rounded-full flex items-center justify-center shadow-sm">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-emerald-800">Vérification réussie</p>
              <p className="text-[10px] text-emerald-600">Vous avez prouvé que vous n'êtes pas un robot.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleReset}
            className="text-[10px] font-bold text-slate-400 hover:text-slate-600 transition"
          >
            Réinitialiser
          </button>
        </div>
      )}
    </div>
  );
}
