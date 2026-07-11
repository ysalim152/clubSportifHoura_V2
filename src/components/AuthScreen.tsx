import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  Activity, Shield, Users, Calendar, CreditCard, MessageSquare,
  Mail, Lock, ArrowLeft, CheckCircle2, AlertCircle, ShieldAlert
} from 'lucide-react';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { loginWithGoogle, auth, db } from '../firebase';
import { doc, setDoc } from 'firebase/firestore';
import AntiRobotVerification from './AntiRobotVerification';

interface AuthScreenProps {
  onLoginSuccess: () => void;
  isLoading: boolean;
  setIsLoading: (val: boolean) => void;
  error: string | null;
  setError: (val: string | null) => void;
}

type AuthMode = 'login' | 'register' | 'forgot';

export default function AuthScreen({ onLoginSuccess, isLoading, setIsLoading, error, setError }: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<string>('player');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState(false);

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      await loginWithGoogle();
      onLoginSuccess();
    } catch (err: any) {
      setError(err.message || 'Une erreur est survenue lors de la connexion.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!isVerified) {
      setError("Veuillez valider la vérification anti-robot.");
      return;
    }

    if (!email) {
      setError("Veuillez saisir votre adresse e-mail.");
      return;
    }

    if (mode !== 'forgot' && !password) {
      setError("Veuillez saisir votre mot de passe.");
      return;
    }

    if (mode === 'register') {
      if (password !== confirmPassword) {
        setError("Les mots de passe ne correspondent pas.");
        return;
      }
      if (password.length < 6) {
        setError("Le mot de passe doit contenir au moins 6 caractères.");
        return;
      }
    }

    setIsLoading(true);

    try {
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, email, password);
        onLoginSuccess();
      } else if (mode === 'register') {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        const isSuper = email.toLowerCase().trim() === 'mass26.sm15@gmail.com';
        const userRef = doc(db, 'users', user.uid);
        await setDoc(userRef, {
          uid: user.uid,
          email: email,
          role: role,
          status: isSuper ? 'approved' : 'pending',
          isSuperUser: isSuper,
          createdAt: new Date().toISOString()
        });
        onLoginSuccess();
      } else if (mode === 'forgot') {
        await sendPasswordResetEmail(auth, email);
        setSuccessMessage(`Un e-mail de réinitialisation a été envoyé à ${email}. Veuillez vérifier votre boîte de réception.`);
        setPassword('');
        setConfirmPassword('');
      }
    } catch (err: any) {
      console.error("Auth error:", err);
      let message = err.message || "Une erreur est survenue.";
      if (err.code === 'auth/wrong-password') {
        message = "Mot de passe incorrect.";
      } else if (err.code === 'auth/user-not-found') {
        message = "Aucun utilisateur trouvé avec cette adresse e-mail.";
      } else if (err.code === 'auth/email-already-in-use') {
        message = "Cette adresse e-mail est déjà utilisée par un autre compte.";
      } else if (err.code === 'auth/invalid-email') {
        message = "Adresse e-mail non valide.";
      } else if (err.code === 'auth/weak-password') {
        message = "Le mot de passe est trop faible (6 caractères minimum).";
      } else if (err.code === 'auth/missing-password') {
        message = "Mot de passe manquant.";
      } else if (err.code === 'auth/invalid-credential') {
        message = "Identifiants invalides ou mot de passe incorrect.";
      }
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleModeChange = (newMode: AuthMode) => {
    setMode(newMode);
    setError(null);
    setSuccessMessage(null);
    setPassword('');
    setConfirmPassword('');
    setIsVerified(false);
  };

  const features = [
    {
      icon: Users,
      title: "Gestion des Membres",
      desc: "Suivez vos licenciés, coachs et dirigeants avec leurs informations de contact et licences."
    },
    {
      icon: Calendar,
      title: "Calendrier & Convocations",
      desc: "Planifiez les entraînements et matchs. Convoquez vos joueurs et suivez leurs présences."
    },
    {
      icon: CreditCard,
      title: "Cotisations & Finances",
      desc: "Suivez les paiements des adhésions, relancez les retards et gérez la trésorerie de votre club."
    },
    {
      icon: MessageSquare,
      title: "Messagerie Collaborative",
      desc: "Communiquez instantanément avec vos équipes ou publiez des annonces officielles."
    }
  ];

  return (
    <div id="auth-screen" className="min-h-screen bg-slate-50 flex flex-col justify-between font-sans">
      {/* Header */}
      <header className="px-6 py-4 bg-white border-b border-slate-200 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-emerald-600 rounded-lg flex items-center justify-center text-white shadow-md">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-bold text-xl tracking-tight text-slate-900">HouraSports</h1>
            <p className="text-xs text-slate-500 font-medium">SaaS de gestion de club</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full">
          <Shield className="w-3.5 h-3.5 text-emerald-600" />
          Connexion sécurisée
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-12 flex flex-col lg:flex-row items-center justify-center gap-12">
        {/* Left column - Value prop */}
        <div className="flex-1 space-y-8 max-w-xl">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="space-y-4"
          >
            <span className="inline-block bg-emerald-50 text-emerald-700 text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full">
              SaaS de Gestion Sportive
            </span>
            <h2 className="text-4xl lg:text-5xl font-extrabold tracking-tight text-slate-900 leading-tight">
              Gérez votre club de sport en toute simplicité.
            </h2>
            <p className="text-lg text-slate-600 leading-relaxed">
              Une solution de gestion administrative, gestion des finances, organisation des événements, centralisation des effectifs et coordination des équipes bénévoles.
            </p>
          </motion.div>

          {/* Features grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {features.map((feat, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 * idx }}
                className="p-4 bg-white border border-slate-100 rounded-xl shadow-sm flex gap-3"
              >
                <div className="w-10 h-10 shrink-0 bg-emerald-50 rounded-lg flex items-center justify-center text-emerald-600">
                  <feat.icon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-slate-900">{feat.title}</h3>
                  <p className="text-xs text-slate-500 mt-1 leading-normal">{feat.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Right column - Connection Box */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-xl p-8 space-y-6"
        >
          {/* Tabs for Login / Register */}
          {mode !== 'forgot' && (
            <div className="flex border-b border-slate-100">
              <button
                type="button"
                onClick={() => handleModeChange('login')}
                className={`flex-1 pb-3 text-sm font-semibold border-b-2 transition-colors duration-200 ${
                  mode === 'login'
                    ? 'border-emerald-600 text-emerald-600'
                    : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                Connexion
              </button>
              <button
                type="button"
                onClick={() => handleModeChange('register')}
                className={`flex-1 pb-3 text-sm font-semibold border-b-2 transition-colors duration-200 ${
                  mode === 'register'
                    ? 'border-emerald-600 text-emerald-600'
                    : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                Inscription
              </button>
            </div>
          )}

          {mode === 'forgot' && (
            <button
              type="button"
              onClick={() => handleModeChange('login')}
              className="flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-800 transition duration-150"
            >
              <ArrowLeft className="w-4 h-4" />
              Retour à la connexion
            </button>
          )}

          <div className="space-y-2">
            <h3 className="text-2xl font-bold tracking-tight text-slate-900">
              {mode === 'login' && 'Connexion'}
              {mode === 'register' && 'Créer un compte'}
              {mode === 'forgot' && 'Mot de passe oublié ?'}
            </h3>
            <p className="text-sm text-slate-500">
              {mode === 'login' && 'Saisissez vos identifiants pour accéder à votre espace.'}
              {mode === 'register' && 'Rejoignez-nous en remplissant les champs ci-dessous.'}
              {mode === 'forgot' && 'Entrez votre adresse e-mail pour recevoir un lien de réinitialisation.'}
            </p>
          </div>

          {error && (
            <div className="p-3.5 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-600" />
              <div>
                <span className="font-semibold">Erreur : </span>
                <span>{error}</span>
              </div>
            </div>
          )}

          {successMessage && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-xl flex items-start gap-2.5">
              <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-emerald-600" />
              <div>
                <span className="font-semibold">Succès ! </span>
                <span>{successMessage}</span>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5" />
                Adresse e-mail
              </label>
              <input
                type="email"
                required
                placeholder="nom@exemple.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition duration-150 text-sm outline-none text-slate-900 disabled:opacity-60"
              />
            </div>

            {mode !== 'forgot' && (
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5" />
                    Mot de passe
                  </label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={() => handleModeChange('forgot')}
                      className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 hover:underline transition duration-150"
                    >
                      Mot de passe oublié ?
                    </button>
                  )}
                </div>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition duration-150 text-sm outline-none text-slate-900 disabled:opacity-60"
                />
              </div>
            )}

            {mode === 'register' && (
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" />
                  Confirmer le mot de passe
                </label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={isLoading}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition duration-150 text-sm outline-none text-slate-900 disabled:opacity-60"
                />
              </div>
            )}

            {mode === 'register' && (
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-slate-400" />
                  Rôle souhaité (soumis à validation)
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  disabled={isLoading}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition duration-150 text-sm outline-none text-slate-900 disabled:opacity-60 cursor-pointer"
                >
                  <option value="admin">Administrateur (Accès complet)</option>
                  <option value="president">Président de l'association (Exécutif / Exonéré)</option>
                  <option value="vice_president_1">Premier vice président (Exécutif / Exonéré)</option>
                  <option value="vice_president_2">Deuxième vice président (Exécutif / Exonéré)</option>
                  <option value="sec_general">Secrétaire Général (Exécutif / Exonéré)</option>
                  <option value="tresorier">Trésorier (Exécutif / Exonéré)</option>
                  <option value="membre_actif">Membre Actif (Exécutif / Exonéré)</option>
                  <option value="adherent">Adhérent (Avec cotisation annuelle)</option>
                  <option value="player">Joueur (Avec cotisation, inscrit aux disciplines)</option>
                  <option value="visiteur">Visiteur (Lecture seule, sans adhésion)</option>
                </select>
                <div className="bg-slate-50 border border-slate-150 rounded-xl p-3 text-[11px] text-slate-500 space-y-1">
                  <p className="font-bold text-slate-600">
                    {role === 'admin' && "• Administrateur : Accès complet de gestion et configuration globale."}
                    {role === 'president' && "• Président de l'association : Rôle exécutif suprême. Exonéré de cotisation."}
                    {role === 'vice_president_1' && "• Premier vice président : Gestion administrative générale. Exonéré."}
                    {role === 'vice_president_2' && "• Deuxième vice président : Responsabilité sportive et évènements. Exonéré."}
                    {role === 'sec_general' && "• Secrétaire Général : Gestion administrative, convocations et fiches d'inscription. Exonéré."}
                    {role === 'tresorier' && "• Trésorier : Gestion financière, cotisations, dépenses et encaissements. Exonéré."}
                    {role === 'membre_actif' && "• Membre Actif : Participation active aux décisions du club. Exonéré."}
                    {role === 'adherent' && "• Adhérent : Accès standard de membre adhérent soumis à cotisation annuelle."}
                    {role === 'player' && "• Joueur : Pratique sportive, inscrit aux disciplines et matchs, soumis à cotisation."}
                    {role === 'visiteur' && "• Visiteur : Accès limité en lecture seule. Sans adhésion ni cotisation."}
                  </p>
                  <p className="italic text-slate-400">
                    Note : L'inscription et l'attribution du rôle doivent être validées par le super-utilisateur de l'application.
                  </p>
                </div>
              </div>
            )}

            {/* Anti-Robot Verification Widget */}
            <AntiRobotVerification isVerified={isVerified} onVerify={setIsVerified} />

            <button
              type="submit"
              disabled={isLoading || (!isVerified && !isLoading)}
              className="w-full flex items-center justify-center gap-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3.5 px-4 rounded-xl transition duration-150 shadow-md disabled:opacity-50 cursor-pointer text-sm"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <span>
                  {mode === 'login' && 'Se connecter'}
                  {mode === 'register' && "S'inscrire"}
                  {mode === 'forgot' && "Réinitialiser le mot de passe"}
                </span>
              )}
            </button>
          </form>

          {/* Social Sign-In Divider */}
          <div className="relative flex py-2 items-center">
            <div className="flex-grow border-t border-slate-100"></div>
            <span className="flex-shrink mx-4 text-slate-400 text-xs font-medium uppercase tracking-wider">ou</span>
            <div className="flex-grow border-t border-slate-100"></div>
          </div>

          <button
            id="btn-google-login"
            type="button"
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 font-semibold py-3.5 px-4 rounded-xl transition duration-150 shadow-sm disabled:opacity-50 cursor-pointer text-sm"
          >
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.85z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.85c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            <span>Continuer avec Google</span>
          </button>

          <div className="border-t border-slate-100 pt-6">
            <div className="flex justify-around text-center text-[10px] sm:text-xs text-slate-400 font-medium">
              <div>
                <p className="font-bold text-slate-600">Fédérations</p>
                <p>Multi-Sports</p>
              </div>
              <div className="border-l border-slate-100"></div>
              <div>
                <p className="font-bold text-slate-600">Base de données</p>
                <p>Firestore Live</p>
              </div>
              <div className="border-l border-slate-100"></div>
              <div>
                <p className="font-bold text-slate-600">Sécurité</p>
                <p>Règles Fortress</p>
              </div>
            </div>
          </div>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="py-6 border-t border-slate-100 bg-white text-center text-xs text-slate-400">
        <p>&copy; 2026 HouraSports - Tous droits réservés.</p>
      </footer>
    </div>
  );
}

