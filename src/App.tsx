import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Activity, Users, Calendar, CreditCard, MessageSquare, LogOut, 
  ChevronRight, LayoutDashboard, Compass, RefreshCw, AlertCircle,
  ShieldCheck, Settings2, ShieldAlert, X
} from 'lucide-react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, getDocs, query, orderBy, doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType, logout } from './firebase';
import { Club, Member, Team, Event, Payment } from './types';

import AuthScreen from './components/AuthScreen';
import ClubManager from './components/ClubManager';
import Dashboard from './components/Dashboard';
import MemberManager from './components/MemberManager';
import EventManager from './components/EventManager';
import FinanceManager from './components/FinanceManager';
import Messenger from './components/Messenger';
import MfaGate from './components/MfaGate';
import MFASettingsModal from './components/MFASettingsModal';
import SuperUserDashboard from './components/SuperUserDashboard';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<{
    uid: string;
    email: string;
    role: 'admin' | 'coach' | 'player';
    status: 'pending' | 'approved' | 'rejected';
    isSuperUser?: boolean;
  } | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [selectedClub, setSelectedClub] = useState<Club | null>(null);
  const [isMfaVerified, setIsMfaVerified] = useState(false);
  const [isMfaSettingsOpen, setIsMfaSettingsOpen] = useState(false);
  const [hasMfaEnabled, setHasMfaEnabled] = useState(false);
  const [checkingMfa, setCheckingMfa] = useState(false);
  
  // Tab states: 'dashboard' | 'membres' | 'calendrier' | 'finances' | 'messagerie'
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [quickAction, setQuickAction] = useState<string | null>(null);

  // Firestore collections states
  const [members, setMembers] = useState<Member[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);

  const [authLoading, setAuthLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 1. Auth Listener & MFA Configuration Checker
  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      
      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }

      if (user) {
        setCheckingMfa(true);
        setProfileLoading(true);

        const isSuper = user.email?.toLowerCase().trim() === 'mass26.sm15@gmail.com';
        const userDocRef = doc(db, 'users', user.uid);

        unsubscribeProfile = onSnapshot(userDocRef, async (userDocSnap) => {
          let profileData = null;

          if (userDocSnap.exists()) {
            profileData = userDocSnap.data();
          } else {
            profileData = {
              uid: user.uid,
              email: user.email || '',
              role: isSuper ? 'admin' : 'player',
              status: 'approved',
              isSuperUser: isSuper,
              createdAt: new Date().toISOString()
            };
            try {
              await setDoc(userDocRef, profileData);
            } catch (e) {
              console.error("Error creating user profile:", e);
            }
          }

          setUserProfile(profileData as any);
          
          if (profileData?.mfaEnabled) {
            setHasMfaEnabled(true);
          } else {
            setHasMfaEnabled(false);
            setIsMfaVerified(true);
          }
          setProfileLoading(false);
          setCheckingMfa(false);
        }, (error) => {
          console.error("Profile onSnapshot error:", error);
          setHasMfaEnabled(false);
          setIsMfaVerified(true);
          setProfileLoading(false);
          setCheckingMfa(false);
        });

      } else {
        setUserProfile(null);
        setHasMfaEnabled(false);
        setIsMfaVerified(false);
        setCheckingMfa(false);
        setProfileLoading(false);
        setSelectedClub(null);
        setMembers([]);
        setTeams([]);
        setEvents([]);
        setPayments([]);
      }
      
      setAuthLoading(false);
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) {
        (unsubscribeProfile as any)();
      }
    };
  }, []);

  // 2. Data Fetcher for current selected club
  const fetchClubData = async () => {
    if (!selectedClub) return;
    setDataLoading(true);
    setError(null);

    try {
      // Fetch members
      const membersSnap = await getDocs(collection(db, 'clubs', selectedClub.id, 'members')).catch(err => {
        handleFirestoreError(err, OperationType.LIST, `clubs/${selectedClub.id}/members`);
        throw err;
      });
      const membersList: Member[] = [];
      membersSnap.forEach(doc => {
        membersList.push({ id: doc.id, ...doc.data() } as Member);
      });

      // Self-healing: if the current user is the club creator and has no member document, create it
      if (currentUser) {
        const hasCreatorAsMember = membersList.some(m => m.id === currentUser.uid);
        if (!hasCreatorAsMember && selectedClub.createdBy === currentUser.uid) {
          const memberId = currentUser.uid;
          const memberData: Member = {
            id: memberId,
            clubId: selectedClub.id,
            firstName: currentUser.displayName?.split(' ')[0] || 'Admin',
            lastName: currentUser.displayName?.split(' ').slice(1).join(' ') || 'Club',
            role: 'admin',
            email: currentUser.email || '',
            membershipAmount: 0,
            membershipPaid: true,
            createdAt: new Date().toISOString()
          };
          try {
            await setDoc(doc(db, 'clubs', selectedClub.id, 'members', memberId), memberData);
            membersList.push(memberData);
          } catch (e) {
            console.error("Error creating creator member doc:", e);
          }
        }
      }

      setMembers(membersList);

      // Fetch teams
      const teamsSnap = await getDocs(collection(db, 'clubs', selectedClub.id, 'teams')).catch(err => {
        handleFirestoreError(err, OperationType.LIST, `clubs/${selectedClub.id}/teams`);
        throw err;
      });
      const teamsList: Team[] = [];
      teamsSnap.forEach(doc => {
        teamsList.push({ id: doc.id, ...doc.data() } as Team);
      });
      setTeams(teamsList);

      // Fetch events
      const eventsSnap = await getDocs(collection(db, 'clubs', selectedClub.id, 'events')).catch(err => {
        handleFirestoreError(err, OperationType.LIST, `clubs/${selectedClub.id}/events`);
        throw err;
      });
      const eventsList: Event[] = [];
      eventsSnap.forEach(doc => {
        eventsList.push({ id: doc.id, ...doc.data() } as Event);
      });
      // Sort events by date ascending
      eventsList.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
      setEvents(eventsList);

      // Fetch payments
      const paymentsSnap = await getDocs(collection(db, 'clubs', selectedClub.id, 'payments')).catch(err => {
        handleFirestoreError(err, OperationType.LIST, `clubs/${selectedClub.id}/payments`);
        throw err;
      });
      const paymentsList: Payment[] = [];
      paymentsSnap.forEach(doc => {
        paymentsList.push({ id: doc.id, ...doc.data() } as Payment);
      });
      setPayments(paymentsList);

    } catch (err: any) {
      setError("Certains chargements de données ont échoué: " + err.message);
    } finally {
      setDataLoading(false);
    }
  };

  useEffect(() => {
    if (selectedClub) {
      fetchClubData();
    }
  }, [selectedClub]);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (err: any) {
      console.error(err);
    }
  };

  const handleOpenQuickAction = (action: string) => {
    setQuickAction(action);
    if (action === 'add_member' || action === 'add_team') {
      setActiveTab('membres');
    } else if (action === 'create_event') {
      setActiveTab('calendrier');
    } else if (action === 'add_payment') {
      setActiveTab('finances');
    }
  };

  if (authLoading || checkingMfa || profileLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // Auth Guard
  if (!currentUser) {
    return (
      <AuthScreen 
        onLoginSuccess={() => {}} 
        isLoading={authLoading} 
        setIsLoading={setAuthLoading} 
        error={error} 
        setError={setError} 
      />
    );
  }

  // Approval / Validation Guard (Allow super user to bypass approval status check)
  if (userProfile && userProfile.status !== 'approved' && !userProfile.isSuperUser) {
    const isPending = userProfile.status === 'pending';
    const roleTranslation = {
      admin: 'Administrateur',
      coach: 'Coach',
      player: 'Joueur'
    }[userProfile.role] || userProfile.role;

    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-between font-sans">
        {/* Header */}
        <header className="px-6 py-4 bg-white border-b border-slate-200 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-emerald-600 rounded-lg flex items-center justify-center text-white shadow-md">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <h1 className="font-bold text-xl tracking-tight text-slate-900">HouraSports</h1>
              <p className="text-xs text-slate-500 font-medium">SaaS de gestion de club</p>
            </div>
          </div>
        </header>

        <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-12 flex items-center justify-center">
          <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl shadow-xl p-8 text-center space-y-6">
            <div className="mx-auto w-16 h-16 rounded-full flex items-center justify-center bg-amber-50 border border-amber-200">
              {isPending ? (
                <ShieldAlert className="w-8 h-8 animate-pulse text-amber-500" />
              ) : (
                <X className="w-8 h-8 text-rose-600" />
              )}
            </div>
            
            <div className="space-y-2">
              <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
                {isPending ? "Inscription en cours de validation" : "Demande d'inscription refusée"}
              </h2>
              <p className="text-sm text-slate-500 leading-relaxed">
                {isPending 
                  ? `Votre demande d'inscription avec le rôle de ${roleTranslation} est en cours d'examen par le super-utilisateur de l'application.` 
                  : `Votre demande d'inscription avec le rôle de ${roleTranslation} a été refusée.`
                }
              </p>
              <p className="text-xs text-slate-400 leading-normal">
                {isPending 
                  ? "L'accès à l'application sera automatiquement débloqué en temps réel dès que le super-utilisateur aura validé votre compte. Vous n'avez pas besoin de rafraîchir cette page."
                  : "Veuillez contacter le super-utilisateur de la plateforme si vous estimez qu'il s'agit d'une erreur."
                }
              </p>
            </div>

            <div className="border-t border-slate-100 pt-6">
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 px-4 rounded-xl transition text-sm cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>Se déconnecter ({currentUser.email})</span>
              </button>
            </div>
          </div>
        </main>

        <footer className="py-6 border-t border-slate-100 bg-white text-center text-xs text-slate-400 shrink-0">
          <p>&copy; 2026 HouraSports - Tous droits réservés.</p>
        </footer>
      </div>
    );
  }

  // SMS Multi-Factor Verification Gate Guard
  if (hasMfaEnabled && !isMfaVerified) {
    return (
      <MfaGate 
        currentUser={currentUser}
        onSuccess={() => setIsMfaVerified(true)}
        onLogout={handleLogout}
      />
    );
  }

  // Club Selector Guard
  if (!selectedClub) {
    return (
      <ClubManager 
        onSelectClub={(club) => setSelectedClub(club)} 
        onLogout={handleLogout} 
      />
    );
  }

  const menuItems = [
    { id: 'dashboard', label: 'Tableau de Bord', icon: LayoutDashboard },
    { id: 'membres', label: 'Membres & Équipes', icon: Users },
    { id: 'calendrier', label: 'Calendrier & Matchs', icon: Calendar },
    { id: 'finances', label: 'Cotisations & Finances', icon: CreditCard },
    { id: 'messagerie', label: 'Messagerie Club', icon: MessageSquare },
  ];
  if (userProfile?.isSuperUser) {
    menuItems.push({ id: 'super_user', label: 'Super Utilisateur', icon: ShieldCheck });
  }

  return (
    <div id="hourasports-app" className="min-h-screen bg-slate-50 flex flex-col md:flex-row font-sans text-slate-800">
      {/* Sidebar navigation */}
      <aside className="w-full md:w-72 bg-slate-900 text-slate-300 flex flex-col justify-between shrink-0 border-r border-slate-850">
        <div className="p-6 space-y-8">
          {/* Logo Brand */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center text-slate-950 shadow-md">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <h2 className="font-black text-white text-lg tracking-tight">HouraSports</h2>
              <p className="text-[10px] text-emerald-400 font-extrabold uppercase tracking-widest">SaaS de club</p>
            </div>
          </div>

          {/* Club Info Bar */}
          <div className="p-4 bg-slate-850 rounded-xl border border-slate-800 flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500/10 text-emerald-400 rounded-lg flex items-center justify-center font-bold text-sm uppercase">
              {selectedClub.name.substring(0, 2)}
            </div>
            <div className="overflow-hidden">
              <p className="font-bold text-white text-sm truncate leading-tight">{selectedClub.name}</p>
              <button 
                onClick={() => setSelectedClub(null)}
                className="text-[10px] text-emerald-400 hover:text-emerald-300 font-bold transition flex items-center gap-0.5 mt-0.5 cursor-pointer"
              >
                <Compass className="w-3 h-3" /> Changer de club
              </button>
            </div>
          </div>

          {/* Main Navigation links */}
          <nav className="space-y-1.5">
            {menuItems.map(item => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    setQuickAction(null);
                  }}
                  className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-bold tracking-tight transition cursor-pointer ${
                    isActive 
                      ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/25' 
                      : 'hover:bg-slate-800 text-slate-400 hover:text-slate-150'
                  }`}
                >
                  <item.icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                  <span className="whitespace-nowrap">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* User Info & Sign out */}
        <div className="p-6 border-t border-slate-800 space-y-4">
          <button
            onClick={() => setIsMfaSettingsOpen(true)}
            className="w-full flex items-center justify-between p-2.5 rounded-xl border border-slate-800 hover:border-slate-700 hover:bg-slate-850/50 text-left transition cursor-pointer group"
            title="Paramètres de sécurité & MFA"
          >
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="w-9 h-9 bg-slate-800 rounded-full border border-slate-700 flex items-center justify-center text-white font-bold text-xs uppercase shadow-inner shrink-0 group-hover:border-emerald-500 transition">
                {currentUser.displayName ? currentUser.displayName[0] : currentUser.email ? currentUser.email[0] : '?'}
              </div>
              <div className="overflow-hidden">
                <p className="font-bold text-white text-xs truncate leading-normal">
                  {currentUser.displayName || currentUser.email?.split('@')[0]}
                </p>
                <span className="inline-flex items-center gap-1 text-[9px] text-slate-500 font-bold uppercase tracking-wider group-hover:text-emerald-400 transition mt-0.5">
                  <ShieldCheck className="w-3 h-3 text-emerald-500 shrink-0" />
                  MFA / Sécurité
                </span>
              </div>
            </div>
            <Settings2 className="w-4 h-4 text-slate-500 group-hover:text-slate-300 transition shrink-0 ml-1" />
          </button>

          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 border border-slate-800 hover:border-slate-700 bg-slate-850 hover:bg-slate-800 text-slate-400 hover:text-white font-semibold py-2.5 px-4 rounded-xl text-xs transition cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Se déconnecter</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col">
        {/* Top Header Panel */}
        <header className="px-8 py-4 bg-white border-b border-slate-200 flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
            <span>Espace d'administration</span>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-slate-800 font-bold capitalize">{activeTab}</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchClubData}
              disabled={dataLoading}
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-lg transition cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${dataLoading ? 'animate-spin text-emerald-600' : ''}`} />
              <span>Actualiser</span>
            </button>
          </div>
        </header>

        {/* Content Box */}
        <div className="flex-1 p-8 overflow-y-auto max-w-7xl w-full mx-auto space-y-6">
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {dataLoading && members.length === 0 ? (
            <div className="h-96 flex items-center justify-center">
              <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                {activeTab === 'dashboard' && (
                  <Dashboard 
                    club={selectedClub} 
                    members={members} 
                    teams={teams} 
                    events={events} 
                    payments={payments}
                    onNavigate={(tab) => setActiveTab(tab)}
                    onOpenQuickAction={handleOpenQuickAction}
                  />
                )}

                {activeTab === 'membres' && (
                  <MemberManager 
                    club={selectedClub} 
                    members={members} 
                    teams={teams} 
                    onRefresh={fetchClubData}
                    quickAction={quickAction}
                    clearQuickAction={() => setQuickAction(null)}
                  />
                )}

                {activeTab === 'calendrier' && (
                  <EventManager 
                    club={selectedClub} 
                    events={events} 
                    teams={teams} 
                    members={members} 
                    onRefresh={fetchClubData}
                    quickAction={quickAction}
                    clearQuickAction={() => setQuickAction(null)}
                  />
                )}

                {activeTab === 'finances' && (
                  <FinanceManager 
                    club={selectedClub} 
                    payments={payments} 
                    members={members} 
                    onRefresh={fetchClubData}
                    quickAction={quickAction}
                    clearQuickAction={() => setQuickAction(null)}
                  />
                )}

                {activeTab === 'messagerie' && (
                  <Messenger 
                    club={selectedClub} 
                    teams={teams} 
                  />
                )}

                {activeTab === 'super_user' && userProfile?.isSuperUser && (
                  <SuperUserDashboard />
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </main>

      {/* MFA Security Settings Modal */}
      <MFASettingsModal
        isOpen={isMfaSettingsOpen}
        onClose={() => setIsMfaSettingsOpen(false)}
        currentUser={currentUser}
        onStatusChanged={async () => {
          // Re-query Firestore MFA settings to synchronize global app security state
          try {
            const userDocRef = doc(db, 'users', currentUser.uid);
            const userDocSnap = await getDoc(userDocRef);
            if (userDocSnap.exists() && userDocSnap.data()?.mfaEnabled) {
              setHasMfaEnabled(true);
            } else {
              setHasMfaEnabled(false);
            }
          } catch (err) {
            console.error("Erreur de synchronisation MFA :", err);
          }
        }}
      />
    </div>
  );
}
