import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Plus, Users, Compass, Activity, ArrowRight, ShieldAlert, Check, Copy, Lock, UserPlus } from 'lucide-react';
import { collection, query, where, getDocs, writeBatch, doc, getDoc, updateDoc, arrayUnion, setDoc } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType, sanitizeData } from '../firebase';
import { Club } from '../types';

interface ClubManagerProps {
  onSelectClub: (club: Club) => void;
  onLogout: () => void;
}

export default function ClubManager({ onSelectClub, onLogout }: ClubManagerProps) {
  const [clubs, setClubs] = useState<Club[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  
  // Create club state
  const [name, setName] = useState('');
  const [sport, setSport] = useState('Football');
  const [address, setAddress] = useState('');
  
  // Join club state
  const [joinClubId, setJoinClubId] = useState('');
  const [joinRole, setJoinRole] = useState('player');
  const [joinCode, setJoinCode] = useState('');
  const [joinFirstName, setJoinFirstName] = useState('');
  const [joinLastName, setJoinLastName] = useState('');
  
  const [copiedClubId, setCopiedClubId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const sportsList = [
    'Football', 'Basketball', 'Tennis', 'Handball', 'Rugby', 
    'Volleyball', 'Athlétisme', 'Gymnastique', 'Natation', 'Autre'
  ];

  const fetchClubs = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const user = auth.currentUser;
      if (!user) return;

      // 1. Fetch user's joinedClubs array
      let joinedClubIds: string[] = [];
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          joinedClubIds = userDoc.data().joinedClubs || [];
        }
      } catch (err) {
        console.warn("Could not fetch user's joined clubs list:", err);
      }

      // 2. Fetch clubs created by user
      const createdClubsQuery = query(
        collection(db, 'clubs'),
        where('createdBy', '==', user.uid)
      );

      const createdSnapshot = await getDocs(createdClubsQuery).catch(err => {
        handleFirestoreError(err, OperationType.LIST, 'clubs');
        throw err;
      });

      const userClubsMap = new Map<string, Club>();
      createdSnapshot.forEach(doc => {
        userClubsMap.set(doc.id, { id: doc.id, ...doc.data() } as Club);
      });

      // 3. Fetch joined clubs details
      for (const clubId of joinedClubIds) {
        if (!userClubsMap.has(clubId)) {
          try {
            const clubDoc = await getDoc(doc(db, 'clubs', clubId));
            if (clubDoc.exists()) {
              userClubsMap.set(clubId, { id: clubId, ...clubDoc.data() } as Club);
            }
          } catch (err) {
            console.warn(`Could not fetch details for joined club ${clubId}:`, err);
          }
        }
      }

      setClubs(Array.from(userClubsMap.values()));
    } catch (err: any) {
      setError("Impossible de charger vos clubs. " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchClubs();
  }, []);

  const handleCreateClub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setError(null);
    setIsLoading(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Utilisateur non connecté.");

      const clubId = 'club_' + Math.random().toString(36).substring(2, 11);
      const batch = writeBatch(db);

      const newClub: Club = {
        id: clubId,
        name: name.trim(),
        sport,
        address: address.trim() || undefined,
        createdBy: user.uid,
        createdAt: new Date().toISOString()
      };

      // Set club doc
      const clubRef = doc(db, 'clubs', clubId);
      batch.set(clubRef, sanitizeData(newClub));

      // Create member doc for the creator as 'admin'
      const memberId = user.uid; // Set memberId to user's UID to represent their user account
      const memberRef = doc(db, 'clubs', clubId, 'members', memberId);
      batch.set(memberRef, {
        id: memberId,
        clubId,
        firstName: user.displayName?.split(' ')[0] || 'Admin',
        lastName: user.displayName?.split(' ').slice(1).join(' ') || 'Club',
        role: 'admin',
        email: user.email || '',
        createdAt: new Date().toISOString()
      });

      // Initialize system settings with default registration codes
      const settingsRef = doc(db, 'clubs', clubId, 'settings', 'system');
      batch.set(settingsRef, {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        updatedBy: user.email || user.uid,
        registration: {
          manualValidation: true,
          emailConfirmation: true,
          medicalCertRequired: true,
          adminCode: 'ADMIN2026',
          coachCode: 'COACH2026',
          presidentCode: 'PRESIDENT2026',
          vicePresident1Code: 'VP12026',
          vicePresident2Code: 'VP22026',
          secGeneralCode: 'SG2026',
          tresorierCode: 'TRESORIER2026',
          membreActifCode: 'MEMBRE2026',
          adherentCode: 'ADHERENT2026',
          playerCode: 'PLAYER2026',
          visiteurCode: 'VISITEUR2026'
        },
        appearance: {
          darkMode: false,
          animations: true,
          particleEffects: true,
          displayFont: 'Inter',
          mainLanguage: 'Français (FR)',
          timezone: 'Africa/Algiers (UTC+01:00)',
          dateFormat: 'DD/MM/YYYY',
          currency: 'Da',
          currencyFormat: '1 000,00 Da'
        }
      });

      await batch.commit().catch(err => {
        handleFirestoreError(err, OperationType.WRITE, `clubs/${clubId}`);
        throw err;
      });

      // Reset form
      setName('');
      setAddress('');
      setIsCreating(false);
      
      // Select the newly created club instantly!
      onSelectClub(newClub);
    } catch (err: any) {
      setError("Erreur lors de la création du club. " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinClub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinClubId.trim() || !joinCode.trim()) return;

    setError(null);
    setSuccess(null);
    setIsLoading(true);

    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Utilisateur non connecté.");

      // Check if already a member in the current fetched list
      if (clubs.some(c => c.id === joinClubId.trim())) {
        throw new Error("Vous êtes déjà membre de ce club !");
      }

      // Try creating member document first to leverage Firestore security rules validation
      const memberRef = doc(db, 'clubs', joinClubId.trim(), 'members', user.uid);
      const memberData = {
        id: user.uid,
        clubId: joinClubId.trim(),
        firstName: joinFirstName.trim() || user.displayName?.split(' ')[0] || 'Membre',
        lastName: joinLastName.trim() || user.displayName?.split(' ').slice(1).join(' ') || 'Sportif',
        role: joinRole,
        email: user.email || '',
        registrationCode: joinCode.trim(), // Validated by our Firestore rules
        createdAt: new Date().toISOString()
      };

      // Set document
      await setDoc(memberRef, sanitizeData(memberData)).catch(err => {
        console.error("Join member write failed:", err);
        throw new Error("Code d'inscription invalide pour ce profil ou Identifiant de Club inexistant.");
      });

      // Write user document updates
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        await updateDoc(userRef, {
          joinedClubs: arrayUnion(joinClubId.trim()),
          role: joinRole,
          status: 'approved'
        });
      } else {
        await setDoc(userRef, {
          uid: user.uid,
          email: user.email || '',
          role: joinRole,
          status: 'approved',
          joinedClubs: [joinClubId.trim()],
          createdAt: new Date().toISOString()
        });
      }

      setSuccess("Vous avez rejoint le club avec succès !");
      setJoinClubId('');
      setJoinCode('');
      setJoinFirstName('');
      setJoinLastName('');
      setIsJoining(false);

      // Reload club list
      await fetchClubs();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div id="club-manager" className="min-h-screen bg-slate-50 flex flex-col justify-between font-sans">
      <header className="px-6 py-4 bg-white border-b border-slate-200 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <img src="/club_logo.svg" alt="Club Logo" className="w-10 h-10 object-contain" referrerPolicy="no-referrer" id="club-logo-selector" />
          <div>
            <h1 className="font-bold text-xl tracking-tight text-slate-900">HouraSports</h1>
            <p className="text-xs text-slate-500 font-medium">Sélection de club</p>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="text-xs font-semibold text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 px-4 py-2 rounded-lg transition cursor-pointer"
        >
          Se déconnecter
        </button>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-12 space-y-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Vos Clubs Sportifs</h2>
            <p className="text-slate-500 mt-1">Créez, rejoignez ou sélectionnez l'association sportive à administrer ou consulter.</p>
          </div>
          {!isCreating && !isJoining && (
            <div className="flex gap-3">
              <button
                onClick={() => setIsJoining(true)}
                className="flex items-center gap-2 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 font-semibold px-4 py-2.5 rounded-xl shadow-sm transition duration-200 cursor-pointer text-sm font-sans"
              >
                <UserPlus className="w-4 h-4 text-slate-500" />
                Rejoindre un club
              </button>
              <button
                onClick={() => setIsCreating(true)}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-4 py-2.5 rounded-xl shadow transition duration-200 cursor-pointer text-sm font-sans"
              >
                <Plus className="w-4 h-4" />
                Créer un club
              </button>
            </div>
          )}
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-xl flex items-center gap-3">
            <Check className="w-5 h-5 shrink-0 text-emerald-600" />
            <span>{success}</span>
          </div>
        )}

        {isCreating ? (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white border border-slate-200 rounded-2xl p-6 shadow-md space-y-6 max-w-2xl mx-auto"
          >
            <div className="border-b border-slate-100 pb-4">
              <h3 className="text-xl font-bold text-slate-900">Nouveau Club Sportif</h3>
              <p className="text-xs text-slate-500">Configurez l'identité de votre association sportive.</p>
            </div>

            <form onSubmit={handleCreateClub} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Nom de l'association</label>
                  <input
                    type="text"
                    required
                    placeholder="ex: FC Villeurbanne, Basket Club..."
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-emerald-600 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Discipline sportive</label>
                  <select
                    value={sport}
                    onChange={(e) => setSport(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-emerald-600 text-sm"
                  >
                    {sportsList.map(sp => (
                      <option key={sp} value={sp}>{sp}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Adresse / Siège social</label>
                <input
                  type="text"
                  placeholder="ex: 12 Rue des Sports, 69000 Lyon"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-emerald-600 text-sm"
                />
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-4 py-2.5 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 text-sm font-medium cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-xl shadow-md flex items-center gap-2 transition cursor-pointer text-sm disabled:opacity-50"
                >
                  {isLoading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
                  Créer le club
                </button>
              </div>
            </form>
          </motion.div>
        ) : isJoining ? (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white border border-slate-200 rounded-2xl p-6 shadow-md space-y-6 max-w-2xl mx-auto font-sans"
          >
            <div className="border-b border-slate-100 pb-4 flex justify-between items-start">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Rejoindre un Club existant</h3>
                <p className="text-xs text-slate-500">Saisissez l'identifiant du club et le code secret d'inscription correspondant à votre profil.</p>
              </div>
              <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center">
                <Lock className="w-5 h-5" />
              </div>
            </div>

            <form onSubmit={handleJoinClub} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Identifiant du Club (ID)</label>
                  <input
                    type="text"
                    required
                    placeholder="ex: club_xxxxxxxxx"
                    value={joinClubId}
                    onChange={(e) => setJoinClubId(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 font-mono text-xs focus:outline-none focus:border-emerald-600 font-semibold"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Profil / Rôle souhaité</label>
                  <select
                    value={joinRole}
                    onChange={(e) => setJoinRole(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-emerald-600 text-sm"
                  >
                    <option value="admin">Administrateur (Accès complet)</option>
                    <option value="president">Président</option>
                    <option value="vice_president_1">Premier vice président</option>
                    <option value="vice_president_2">Deuxième vice président</option>
                    <option value="sec_general">Secrétaire Général</option>
                    <option value="tresorier">Trésorier</option>
                    <option value="membre_actif">Membre Actif</option>
                    <option value="adherent">Adhérent</option>
                    <option value="player">Joueur</option>
                    <option value="visiteur">Visiteur</option>
                    <option value="coach">Entraîneur / Coach</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Prénom</label>
                  <input
                    type="text"
                    placeholder="Votre prénom"
                    value={joinFirstName}
                    onChange={(e) => setJoinFirstName(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-emerald-600 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Nom</label>
                  <input
                    type="text"
                    placeholder="Votre nom"
                    value={joinLastName}
                    onChange={(e) => setJoinLastName(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-emerald-600 text-sm"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Code d'inscription secret</label>
                <input
                  type="password"
                  required
                  placeholder="Saisissez le code secret"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-emerald-600 text-sm"
                />
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsJoining(false)}
                  className="px-4 py-2.5 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 text-sm font-medium cursor-pointer animate-none"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-xl shadow-md flex items-center gap-2 transition cursor-pointer text-sm disabled:opacity-50"
                >
                  {isLoading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
                  Rejoindre le club
                </button>
              </div>
            </form>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {isLoading ? (
              <div className="col-span-2 py-12 flex justify-center">
                <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : clubs.length === 0 ? (
              <div className="col-span-2 bg-white border border-dashed border-slate-200 rounded-2xl p-12 text-center space-y-4">
                <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                  <Compass className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h4 className="font-bold text-slate-900">Aucun club trouvé</h4>
                  <p className="text-sm text-slate-500 max-w-sm mx-auto">Vous n'avez pas encore créé ou rejoint de club de sport sur cette plateforme.</p>
                </div>
                <div className="flex gap-3 justify-center">
                  <button
                    onClick={() => setIsJoining(true)}
                    className="border border-slate-200 hover:border-slate-300 bg-white text-slate-700 font-semibold px-4 py-2 rounded-xl text-sm transition shadow-sm cursor-pointer"
                  >
                    Rejoindre un club
                  </button>
                  <button
                    onClick={() => setIsCreating(true)}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-4 py-2 rounded-xl text-sm transition shadow cursor-pointer"
                  >
                    Créer un club
                  </button>
                </div>
              </div>
            ) : (
              clubs.map(club => (
                <motion.div
                  key={club.id}
                  whileHover={{ y: -3, transition: { duration: 0.1 } }}
                  onClick={() => onSelectClub(club)}
                  className="bg-white border border-slate-200 hover:border-emerald-500 rounded-2xl p-6 shadow-sm hover:shadow-md transition duration-200 flex flex-col justify-between cursor-pointer"
                >
                  <div className="space-y-4">
                    <div className="flex justify-between items-start">
                      <div className="w-12 h-12 bg-emerald-50 text-emerald-700 rounded-xl flex items-center justify-center font-bold text-xl uppercase shadow-inner">
                        {club.name.substring(0, 2)}
                      </div>
                      <span className="text-xs bg-slate-100 text-slate-600 font-semibold px-2.5 py-1 rounded-full border border-slate-200">
                        {club.sport}
                      </span>
                    </div>

                    <div>
                      <h4 className="font-bold text-lg text-slate-900 leading-tight">{club.name}</h4>
                      {club.address && (
                        <p className="text-xs text-slate-400 mt-1 truncate">{club.address}</p>
                      )}
                      
                      <div 
                        className="flex items-center gap-1.5 mt-3 bg-slate-50 border border-slate-200/60 rounded-lg px-2.5 py-1.5 w-fit text-xs hover:bg-slate-100 transition cursor-pointer select-none"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(club.id);
                          setCopiedClubId(club.id);
                          setTimeout(() => setCopiedClubId(null), 2000);
                        }}
                      >
                        <span className="font-mono text-[10px] text-slate-500 font-semibold uppercase">ID: {club.id}</span>
                        {copiedClubId === club.id ? (
                          <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-0.5">
                            <Check className="w-3 h-3" /> Copié
                          </span>
                        ) : (
                          <Copy className="w-3 h-3 text-slate-400 hover:text-emerald-600 transition" />
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-slate-50 mt-6 pt-4 flex items-center justify-between text-xs font-semibold text-emerald-600">
                    <div className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-slate-500 font-medium">
                        {club.createdBy === auth.currentUser?.uid ? "Administrateur / Créateur" : "Membre du club"}
                      </span>
                    </div>
                    <div className="flex items-center gap-0.5">
                      {club.createdBy === auth.currentUser?.uid ? "Gérer" : "Accéder"}
                      <ArrowRight className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        )}
      </main>

      <footer className="py-6 border-t border-slate-100 bg-white text-center text-xs text-slate-400">
        <p>&copy; 2026 HouraSports - Tous droits réservés.</p>
      </footer>
    </div>
  );
}
