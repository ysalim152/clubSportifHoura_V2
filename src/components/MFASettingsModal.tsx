import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ShieldCheck, X, Phone, Lock, EyeOff, CheckCircle2, 
  AlertCircle, ShieldAlert, KeyRound, Smartphone, Settings2, Trash2
} from 'lucide-react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { User } from 'firebase/auth';
import { db } from '../firebase';
import { sendMFACode } from '../lib/sms';
import AntiRobotVerification from './AntiRobotVerification';

interface MFASettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  onStatusChanged?: () => void;
}

export default function MFASettingsModal({ isOpen, onClose, currentUser, onStatusChanged }: MFASettingsModalProps) {
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [maskedPhone, setMaskedPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Verification states (during enrollment)
  const [verificationStep, setVerificationStep] = useState<'phone-input' | 'otp-input'>('phone-input');
  const [otpCode, setOtpCode] = useState('');
  const [sentCode, setSentCode] = useState<string | null>(null);
  const [isAntiRobotVerified, setIsAntiRobotVerified] = useState(false);
  const [sandboxCode, setSandboxCode] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && currentUser) {
      fetchMfaStatus();
    }
  }, [isOpen, currentUser]);

  const fetchMfaStatus = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const userRef = doc(db, 'users', currentUser.uid);
      const docSnap = await getDoc(userRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.mfaEnabled) {
          setMfaEnabled(true);
          const rawPhone = data.phoneNumber || '';
          setPhoneNumber(rawPhone);
          // Mask phone: +33 6 12 34 56 78 -> +33 6 •• •• •• 78
          if (rawPhone.length > 5) {
            const start = rawPhone.substring(0, 6);
            const end = rawPhone.substring(rawPhone.length - 2);
            setMaskedPhone(`${start} •• •• •• ${end}`);
          } else {
            setMaskedPhone(rawPhone);
          }
        } else {
          setMfaEnabled(false);
        }
      } else {
        setMfaEnabled(false);
      }
    } catch (err: any) {
      console.error("Error fetching MFA status:", err);
      setError("Impossible de charger les paramètres de sécurité.");
    } finally {
      setLoading(false);
    }
  };

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSandboxCode(null);

    if (!phoneNumber) {
      setError("Veuillez saisir un numéro de téléphone valide.");
      return;
    }

    // Basic format validation (+33...) or standard global formatting
    if (!phoneNumber.startsWith('+')) {
      setError("Le numéro de téléphone doit être au format international (ex: +33612345678).");
      return;
    }

    if (phoneNumber.length < 8) {
      setError("Le numéro de téléphone saisi est trop court.");
      return;
    }

    if (!isAntiRobotVerified) {
      setError("Veuillez compléter le test de sécurité anti-robot.");
      return;
    }

    setSaving(true);
    try {
      const res = await sendMFACode(phoneNumber);
      if (res.success) {
        setSentCode(res.code || null);
        setVerificationStep('otp-input');
        if (res.simulated) {
          setSandboxCode(res.code || null);
        }
        setSuccess("Code de sécurité envoyé avec succès par SMS !");
      } else {
        setError(res.error || "Une erreur est survenue lors de l'envoi de l'SMS.");
      }
    } catch (err: any) {
      setError(err.message || "Erreur lors de l'authentification.");
    } finally {
      setSaving(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!otpCode || otpCode.length !== 6) {
      setError("Veuillez saisir un code à 6 chiffres.");
      return;
    }

    if (otpCode !== sentCode) {
      setError("Code de vérification incorrect. Veuillez réessayer.");
      return;
    }

    setSaving(true);
    try {
      const userRef = doc(db, 'users', currentUser.uid);
      await setDoc(userRef, {
        mfaEnabled: true,
        phoneNumber: phoneNumber,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      setMfaEnabled(true);
      setSuccess("Félicitations ! La double authentification par SMS est désormais activée sur votre compte.");
      setVerificationStep('phone-input');
      setSentCode(null);
      setSandboxCode(null);
      setIsAntiRobotVerified(false);
      
      // Update parent component
      if (onStatusChanged) {
        onStatusChanged();
      }
    } catch (err: any) {
      console.error("Error enabling MFA:", err);
      setError("Impossible d'activer la double authentification.");
    } finally {
      setSaving(false);
    }
  };

  const handleDisableMfa = async () => {
    if (!window.confirm("Êtes-vous sûr de vouloir désactiver la double authentification par SMS ? Votre compte sera moins sécurisé.")) {
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const userRef = doc(db, 'users', currentUser.uid);
      await setDoc(userRef, {
        mfaEnabled: false,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      setMfaEnabled(false);
      setPhoneNumber('');
      setMaskedPhone('');
      setSuccess("La double authentification par SMS a été désactivée avec succès.");
      
      if (onStatusChanged) {
        onStatusChanged();
      }
    } catch (err: any) {
      console.error("Error disabling MFA:", err);
      setError("Impossible de désactiver la double authentification.");
    } finally {
      setSaving(false);
    }
  };

  const handleResetForm = () => {
    setVerificationStep('phone-input');
    setOtpCode('');
    setSentCode(null);
    setSandboxCode(null);
    setIsAntiRobotVerified(false);
    setError(null);
    setSuccess(null);
  };

  if (!isOpen) return null;

  return (
    <div id="mfa-settings-modal-overlay" className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-150 flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-emerald-100 text-emerald-700 rounded-lg flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm sm:text-base">Double Authentification (MFA)</h3>
              <p className="text-[10px] text-slate-500 font-medium">Sécurité renforcée de votre compte HouraSports</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 overflow-y-auto max-h-[80vh]">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3">
              <div className="w-9 h-9 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-xs text-slate-500 font-semibold">Chargement de votre profil de sécurité...</p>
            </div>
          ) : (
            <>
              {error && (
                <div className="p-3.5 bg-red-50 border border-red-200 text-red-700 text-xs sm:text-sm rounded-xl flex items-start gap-2.5">
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-600" />
                  <div>
                    <span className="font-bold">Erreur : </span>
                    <span>{error}</span>
                  </div>
                </div>
              )}

              {success && (
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs sm:text-sm rounded-xl flex items-start gap-2.5 animate-fade-in">
                  <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-emerald-600" />
                  <div>
                    <span className="font-bold">Succès : </span>
                    <span>{success}</span>
                  </div>
                </div>
              )}

              {mfaEnabled ? (
                /* MFA ENABLED STATE VIEW */
                <div className="space-y-5">
                  <div className="p-5 bg-emerald-50/50 border border-emerald-200 rounded-xl flex items-start gap-4">
                    <div className="w-10 h-10 bg-emerald-500 text-white rounded-xl flex items-center justify-center shadow-md shrink-0">
                      <ShieldCheck className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="font-extrabold text-emerald-900 text-sm">Statut : Activé</h4>
                      <p className="text-xs text-emerald-700 font-medium leading-relaxed mt-1">
                        Votre compte est protégé par la validation de connexion par code SMS. À chaque nouvelle connexion, un code de sécurité à 6 chiffres vous sera demandé.
                      </p>
                    </div>
                  </div>

                  <div className="border border-slate-100 rounded-xl p-4 flex justify-between items-center bg-slate-50">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-slate-200 text-slate-600 rounded-lg flex items-center justify-center">
                        <Smartphone className="w-4.5 h-4.5" />
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Téléphone d'authentification</p>
                        <p className="text-sm font-extrabold text-slate-800">{maskedPhone}</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleDisableMfa}
                      disabled={saving}
                      className="flex items-center gap-1.5 px-3 py-2 border border-red-200 hover:border-red-300 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold rounded-lg transition disabled:opacity-50 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Désactiver
                    </button>
                  </div>
                </div>
              ) : (
                /* MFA ENROLLMENT FORMS */
                <div className="space-y-5">
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex gap-3">
                    <ShieldAlert className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-slate-500 leading-normal">
                      L'authentification multifacteur (MFA) ajoute une barrière de sécurité supplémentaire. Après avoir saisi votre mot de passe habituel, vous recevrez un code SMS confidentiel sur votre téléphone pour valider l'accès.
                    </p>
                  </div>

                  {verificationStep === 'phone-input' ? (
                    <form onSubmit={handleSendCode} className="space-y-5">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5" />
                          Numéro de téléphone portable
                        </label>
                        <input
                          type="tel"
                          required
                          placeholder="+33 6 12 34 56 78"
                          value={phoneNumber}
                          onChange={(e) => setPhoneNumber(e.target.value)}
                          disabled={saving}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition duration-150 text-sm outline-none text-slate-900 font-semibold"
                        />
                        <p className="text-[10px] text-slate-400 font-semibold">
                          Le numéro doit débuter par le code pays international (ex: <span className="font-bold">+33</span> pour la France, <span className="font-bold">+32</span> pour la Belgique, etc.)
                        </p>
                      </div>

                      {/* Anti-robot slider verify */}
                      <div className="pt-2">
                        <AntiRobotVerification isVerified={isAntiRobotVerified} onVerify={setIsAntiRobotVerified} />
                      </div>

                      <button
                        type="submit"
                        disabled={saving || !isAntiRobotVerified}
                        className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 px-4 rounded-xl transition duration-150 shadow-md disabled:opacity-50 cursor-pointer text-xs sm:text-sm"
                      >
                        {saving ? (
                          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                          "Envoyer le code de vérification"
                        )}
                      </button>
                    </form>
                  ) : (
                    /* OTP ENTRY SCREEN */
                    <form onSubmit={handleVerifyCode} className="space-y-5 animate-fade-in">
                      {sandboxCode && (
                        <div className="p-3.5 bg-indigo-50 border border-indigo-200 text-indigo-800 text-xs rounded-xl space-y-1.5 shadow-inner">
                          <p className="font-bold flex items-center gap-1.5 text-indigo-900 uppercase tracking-wide text-[10px]">
                            <KeyRound className="w-3.5 h-3.5 text-indigo-600 animate-bounce" />
                            [Environnement de Test] Simulateur SMS
                          </p>
                          <p className="leading-tight font-medium">
                            Aucune clé API Twilio configurée. Le code de sécurité généré pour <span className="font-extrabold">{phoneNumber}</span> est :
                          </p>
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-lg font-black tracking-widest text-indigo-700 bg-white px-3 py-1 rounded-lg border border-indigo-150 select-all shadow-sm">
                              {sandboxCode}
                            </span>
                            <button
                              type="button"
                              onClick={() => setOtpCode(sandboxCode)}
                              className="text-xs font-extrabold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer"
                            >
                              Auto-remplir
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center">
                          <label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                            <Lock className="w-3.5 h-3.5" />
                            Saisir le code reçu par SMS
                          </label>
                          <button
                            type="button"
                            onClick={handleResetForm}
                            className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 transition"
                          >
                            Modifier le numéro
                          </button>
                        </div>
                        <input
                          type="text"
                          maxLength={6}
                          required
                          placeholder="Ex: 123456"
                          value={otpCode}
                          onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                          disabled={saving}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition duration-150 text-center tracking-[0.4em] font-extrabold text-lg outline-none text-slate-900"
                        />
                      </div>

                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={handleResetForm}
                          className="flex-1 border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold py-2.5 px-4 rounded-xl text-xs transition cursor-pointer text-center"
                        >
                          Retour
                        </button>
                        <button
                          type="submit"
                          disabled={saving || otpCode.length !== 6}
                          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 px-4 rounded-xl transition duration-150 shadow-md disabled:opacity-50 cursor-pointer text-xs text-center"
                        >
                          {saving ? (
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto"></div>
                          ) : (
                            "Confirmer et Activer"
                          )}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
