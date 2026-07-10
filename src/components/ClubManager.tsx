import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Plus, Users, Compass, Activity, ArrowRight, ShieldAlert, Check } from 'lucide-react';
import { collection, query, where, getDocs, writeBatch, doc, getDoc } from 'firebase/firestore';
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
  const [name, setName] = useState('');
  const [sport, setSport] = useState('Football');
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);

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

      // 1. Get clubs where the user is a member
      const memberClubsQuery = query(
        collection(db, 'clubs'),
        // Or we can find where the user is createdBy or we can query members directly
      );
      
      // Let's query all clubs, then filter in memory if needed, or query members.
      // Wait, firestore security rules only allow reading clubs where:
      // resource.data.createdBy == request.auth.uid OR isMember(clubId)
      // So let's fetch clubs created by user
      const createdClubsQuery = query(
        collection(db, 'clubs'),
        where('createdBy', '==', user.uid)
      );

      const createdSnapshot = await getDocs(createdClubsQuery).catch(err => {
        handleFirestoreError(err, OperationType.LIST, 'clubs');
        throw err;
      });

      const userClubs: Club[] = [];
      createdSnapshot.forEach(doc => {
        userClubs.push({ id: doc.id, ...doc.data() } as Club);
      });

      // Also let's try to search other clubs where the user might be a member. 
      // But if there is any error because they are not owner of some collections, we handle it gracefully.
      setClubs(userClubs);
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

  return (
    <div id="club-manager" className="min-h-screen bg-slate-50 flex flex-col justify-between font-sans">
      <header className="px-6 py-4 bg-white border-b border-slate-200 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-emerald-600 rounded-lg flex items-center justify-center text-white shadow-md">
            <Activity className="w-6 h-6" />
          </div>
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
            <p className="text-slate-500 mt-1">Créez ou sélectionnez l'association sportive à administrer.</p>
          </div>
          {!isCreating && (
            <button
              onClick={() => setIsCreating(true)}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-4 py-2.5 rounded-xl shadow transition duration-200 cursor-pointer text-sm"
            >
              <Plus className="w-4 h-4" />
              Créer un club
            </button>
          )}
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 shrink-0" />
            <span>{error}</span>
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
                <button
                  onClick={() => setIsCreating(true)}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-4 py-2 rounded-xl text-sm transition shadow cursor-pointer"
                >
                  Commencer maintenant
                </button>
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
                    </div>
                  </div>

                  <div className="border-t border-slate-50 mt-6 pt-4 flex items-center justify-between text-xs font-semibold text-emerald-600">
                    <div className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-slate-500 font-medium">Administrateur du club</span>
                    </div>
                    <div className="flex items-center gap-0.5">
                      Gérer
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
