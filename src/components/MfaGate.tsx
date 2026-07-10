import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { 
  ShieldAlert, Lock, Unlock, Phone, LogOut, ArrowLeft,
  RefreshCw, CheckCircle2, AlertCircle, KeyRound, ArrowRight
} from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { User } from 'firebase/auth';
import { db } from '../firebase';
import { sendMFACode } from '../lib/sms';

interface MfaGateProps {
  currentUser: User;
  onSuccess: () => void;
  onLogout: () => void;
}

export default function MfaGate({ currentUser, onSuccess, onLogout }: MfaGateProps) {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [maskedPhone, setMaskedPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // OTP inputs: 6 separate character boxes
  const [otpValues, setOtpValues] = useState<string[]>(Array(6).fill(''));
  const [sentCode, setSentCode] = useState<string | null>(null);
  const [sandboxCode, setSandboxCode] = useState<string | null>(null);
  
  // Resend SMS countdown timer
  const [countdown, setCountdown] = useState(30);

  const inputRefs = useRef<HTMLInputElement[]>([]);

  useEffect(() => {
    fetchPhoneAndTriggerSMS();
  }, [currentUser]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (countdown > 0 && sentCode) {
      timer = setTimeout(() => setCountdown(prev => prev - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [countdown, sentCode]);

  const fetchPhoneAndTriggerSMS = async () => {
    setLoading(true);
    setError(null);
    try {
      const userRef = doc(db, 'users', currentUser.uid);
      const docSnap = await getDoc(userRef);
      if (docSnap.exists() && docSnap.data().mfaEnabled) {
        const phone = docSnap.data().phoneNumber || '';
        setPhoneNumber(phone);
        
        // Mask phone
        if (phone.length > 5) {
          const start = phone.substring(0, 6);
          const end = phone.substring(phone.length - 2);
          setMaskedPhone(`${start} •• •• •• ${end}`);
        } else {
          setMaskedPhone(phone);
        }

        // Send OTP
        await triggerSMS(phone);
      } else {
        // Fallback or safety check: if MFA not enabled, bypass immediately
        onSuccess();
      }
    } catch (err: any) {
      console.error("MfaGate loading error:", err);
      setError("Impossible de charger vos données d'authentification double.");
      setLoading(false);
    }
  };

  const triggerSMS = async (targetPhone: string) => {
    setSending(true);
    setError(null);
    setSuccess(null);
    setSandboxCode(null);
    try {
      const res = await sendMFACode(targetPhone);
      if (res.success) {
        setSentCode(res.code || null);
        if (res.simulated) {
          setSandboxCode(res.code || null);
        }
        setSuccess("Code de validation envoyé par SMS.");
        setCountdown(30); // Reset timer
        // Focus first input box
        setTimeout(() => {
          if (inputRefs.current[0]) inputRefs.current[0].focus();
        }, 150);
      } else {
        setError(res.error || "Une erreur est survenue lors de l'envoi du SMS.");
      }
    } catch (err: any) {
      setError("Erreur de connexion lors de l'envoi de l'SMS.");
    } finally {
      setSending(false);
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (countdown > 0 || sending) return;
    await triggerSMS(phoneNumber);
  };

  const handleInputChange = (index: number, val: string) => {
    const numericVal = val.replace(/\D/g, '');
    if (!numericVal) {
      const nextValues = [...otpValues];
      nextValues[index] = '';
      setOtpValues(nextValues);
      return;
    }

    const nextValues = [...otpValues];
    // Take only the last digit if multiple were entered
    nextValues[index] = numericVal[numericVal.length - 1];
    setOtpValues(nextValues);

    // Focus next element
    if (index < 5 && nextValues[index]) {
      inputRefs.current[index + 1].focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!otpValues[index] && index > 0) {
        // Go back to previous field and clear it
        const nextValues = [...otpValues];
        nextValues[index - 1] = '';
        setOtpValues(nextValues);
        inputRefs.current[index - 1].focus();
      } else {
        // Clear current field
        const nextValues = [...otpValues];
        nextValues[index] = '';
        setOtpValues(nextValues);
      }
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData('text').replace(/\D/g, '').substring(0, 6);
    if (pasteData.length === 6) {
      const chars = pasteData.split('');
      setOtpValues(chars);
      // Focus last item
      inputRefs.current[5].focus();
    }
  };

  const handleVerify = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);
    setSuccess(null);

    const enteredOtp = otpValues.join('');
    if (enteredOtp.length !== 6) {
      setError("Veuillez saisir les 6 chiffres du code.");
      return;
    }

    if (enteredOtp !== sentCode) {
      setError("Le code de sécurité saisi est incorrect. Veuillez réessayer.");
      return;
    }

    setVerifying(true);
    // Mimic secure server check delay
    setTimeout(() => {
      setVerifying(false);
      onSuccess();
    }, 400);
  };

  // Trigger verify automatically when 6 digits are fully filled
  useEffect(() => {
    if (otpValues.join('').length === 6 && sentCode) {
      handleVerify();
    }
  }, [otpValues, sentCode]);

  const handleAutoFill = () => {
    if (sandboxCode) {
      const chars = sandboxCode.split('');
      setOtpValues(chars);
    }
  };

  return (
    <div id="mfa-login-gate" className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-xl p-8 space-y-6 text-center"
      >
        {/* Security Shield Lock Banner */}
        <div className="mx-auto w-16 h-16 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shadow-inner border border-emerald-100">
          <Lock className="w-8 h-8 animate-pulse" />
        </div>

        <div className="space-y-1.5">
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Double Authentification</h2>
          <p className="text-xs sm:text-sm text-slate-500 font-medium">
            Entrez le code à 6 chiffres envoyé au numéro
          </p>
          {loading ? (
            <div className="h-5 w-24 bg-slate-100 animate-pulse rounded-lg mx-auto mt-1" />
          ) : (
            <p className="font-extrabold text-slate-900 flex items-center justify-center gap-1.5 text-sm sm:text-base">
              <Phone className="w-4 h-4 text-emerald-500" />
              {maskedPhone}
            </p>
          )}
        </div>

        {error && (
          <div className="p-3.5 bg-red-50 border border-red-200 text-red-700 text-xs sm:text-sm rounded-xl flex items-start text-left gap-2.5">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-600" />
            <div>
              <span className="font-bold">Erreur : </span>
              <span>{error}</span>
            </div>
          </div>
        )}

        {success && !error && (
          <div className="p-3 bg-emerald-50 border border-emerald-150 text-emerald-800 text-xs rounded-xl flex items-center justify-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span className="font-semibold">{success}</span>
          </div>
        )}

        {sandboxCode && (
          <div className="p-3.5 bg-indigo-50 border border-indigo-200 text-indigo-800 text-xs rounded-xl space-y-1.5 shadow-inner text-left">
            <p className="font-bold flex items-center gap-1.5 text-indigo-900 uppercase tracking-wide text-[10px]">
              <KeyRound className="w-3.5 h-3.5 text-indigo-600" />
              [MFA Sandbox] Code reçu
            </p>
            <p className="leading-normal font-medium text-[11px] text-slate-600">
              Twilio n'est pas activé. Utilisez ce code de validation de test :
            </p>
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-base font-black tracking-widest text-indigo-700 bg-white px-2.5 py-1 rounded-lg border border-indigo-150 select-all shadow-sm">
                {sandboxCode}
              </span>
              <button
                type="button"
                onClick={handleAutoFill}
                className="text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer"
              >
                Auto-remplir le code
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="py-8 flex flex-col items-center justify-center gap-2">
            <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-xs text-slate-400 font-semibold">Génération du code SMS...</p>
          </div>
        ) : (
          /* Split character inputs */
          <div className="space-y-6">
            <div className="flex justify-between gap-2 max-w-sm mx-auto" onPaste={handlePaste}>
              {otpValues.map((val, idx) => (
                <input
                  key={idx}
                  ref={(el) => (inputRefs.current[idx] = el as HTMLInputElement)}
                  type="text"
                  pattern="[0-9]*"
                  inputMode="numeric"
                  maxLength={1}
                  value={val}
                  onChange={(e) => handleInputChange(idx, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(idx, e)}
                  disabled={verifying || sending}
                  className="w-12 h-14 bg-slate-50 border border-slate-200 rounded-xl text-center text-xl font-extrabold text-slate-800 focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 shadow-sm transition outline-none disabled:opacity-60"
                />
              ))}
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={handleVerify}
                disabled={otpValues.join('').length !== 6 || verifying || sending}
                className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3.5 px-4 rounded-xl transition duration-150 shadow-md disabled:opacity-50 cursor-pointer text-sm"
              >
                {verifying ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <>
                    <span>Valider et accéder</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <div className="flex justify-between items-center text-xs pt-2">
                <button
                  type="button"
                  onClick={onLogout}
                  className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 font-bold transition cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Retour
                </button>

                {countdown > 0 ? (
                  <span className="text-slate-400 font-semibold">
                    Renvoyer le code dans {countdown}s
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={sending}
                    className="flex items-center gap-1.5 text-emerald-600 hover:text-emerald-700 font-extrabold transition cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${sending ? 'animate-spin' : ''}`} />
                    Renvoyer par SMS
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
