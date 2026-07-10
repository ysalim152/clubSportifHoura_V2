import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { collection, doc, updateDoc, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { 
  Shield, Check, X, ShieldAlert, Users, RefreshCw, 
  AlertCircle, Search, Filter, ShieldCheck, Mail, Calendar
} from 'lucide-react';

interface UserProfile {
  uid: string;
  email: string;
  role: 'admin' | 'coach' | 'player';
  status: 'pending' | 'approved' | 'rejected';
  isSuperUser?: boolean;
  createdAt?: string;
  phoneNumber?: string;
  mfaEnabled?: boolean;
}

export default function SuperUserDashboard() {
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'coach' | 'player'>('all');
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, 'users'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: UserProfile[] = [];
      snapshot.forEach((doc) => {
        list.push({ uid: doc.id, ...doc.data() } as UserProfile);
      });
      // Sort: pending first, then by email
      list.sort((a, b) => {
        if (a.status === 'pending' && b.status !== 'pending') return -1;
        if (a.status !== 'pending' && b.status === 'pending') return 1;
        return (a.email || '').localeCompare(b.email || '');
      });
      setUsersList(list);
      setLoading(false);
    }, (err) => {
      console.error("Erreur de chargement des utilisateurs :", err);
      setError("Impossible de charger les demandes d'inscription. Vérifiez vos droits d'accès.");
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleUpdateStatus = async (userId: string, newStatus: 'approved' | 'rejected') => {
    setError(null);
    setProcessingId(userId);
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        status: newStatus,
        updatedAt: new Date().toISOString()
      });
    } catch (err: any) {
      console.error("Error updating user status:", err);
      setError("Erreur lors de la mise à jour du statut de l'utilisateur.");
    } finally {
      setProcessingId(null);
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'admin':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <Shield className="w-3.5 h-3.5" />
            Administrateur
          </span>
        );
      case 'coach':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
            <Users className="w-3.5 h-3.5" />
            Coach
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-slate-50 text-slate-700 border border-slate-200">
            <Users className="w-3.5 h-3.5" />
            Joueur
          </span>
        );
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
            <Check className="w-3 h-3" /> Approuvé
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800">
            <X className="w-3 h-3" /> Rejeté
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 animate-pulse">
            <AlertCircle className="w-3 h-3" /> En attente
          </span>
        );
    }
  };

  // Filter lists
  const filteredUsers = usersList.filter(user => {
    const matchesSearch = user.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || user.status === statusFilter;
    const matchesRole = roleFilter === 'all' || user.role === roleFilter;
    return matchesSearch && matchesStatus && matchesRole;
  });

  const pendingCount = usersList.filter(u => u.status === 'pending').length;

  return (
    <div id="super-user-dashboard" className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Welcome Card */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 -mt-6 -mr-6 w-36 h-36 bg-emerald-500/10 rounded-full blur-2xl"></div>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="bg-emerald-500 text-slate-950 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded">
                Super User Mode
              </span>
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight">Panneau de Contrôle de l'Application</h2>
            <p className="text-sm text-slate-400">
              Gérez, validez et attribuez les rôles de sécurité de tous les utilisateurs enregistrés de HouraSports.
            </p>
          </div>
          <div className="flex gap-3">
            <div className="bg-slate-800 border border-slate-700 px-4 py-2.5 rounded-xl text-center">
              <span className="block text-2xl font-black text-emerald-400">{pendingCount}</span>
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">En attente</span>
            </div>
            <div className="bg-slate-800 border border-slate-700 px-4 py-2.5 rounded-xl text-center">
              <span className="block text-2xl font-black text-white">{usersList.length}</span>
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Inscrits</span>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl flex items-center gap-2 text-sm shadow-sm">
          <AlertCircle className="w-5 h-5 shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      {/* Filters & Actions bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col md:flex-row gap-4 items-center justify-between shadow-sm">
        <div className="w-full md:w-80 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Rechercher par adresse e-mail..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition"
          />
        </div>

        <div className="flex flex-wrap gap-3 w-full md:w-auto">
          {/* Status filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Statut:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-3 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg outline-none cursor-pointer"
            >
              <option value="all">Tous</option>
              <option value="pending">En attente ({pendingCount})</option>
              <option value="approved">Approuvé</option>
              <option value="rejected">Rejeté</option>
            </select>
          </div>

          {/* Role filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Rôle:</span>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as any)}
              className="px-3 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg outline-none cursor-pointer"
            >
              <option value="all">Tous les rôles</option>
              <option value="admin">Administrateur</option>
              <option value="coach">Coach</option>
              <option value="player">Joueur</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Grid/List */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 flex flex-col items-center justify-center gap-3">
            <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin" />
            <p className="text-sm font-semibold text-slate-500">Chargement des utilisateurs...</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-16 text-center space-y-3">
            <ShieldAlert className="w-12 h-12 text-slate-300 mx-auto" />
            <p className="text-base font-bold text-slate-700">Aucun utilisateur trouvé</p>
            <p className="text-xs text-slate-400">Modifiez vos filtres de recherche ou attendez de nouvelles inscriptions.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Adresse E-mail</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Rôle Demandé</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Date d'Inscription</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Statut</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500 text-right">Actions de Validation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map((user) => (
                  <tr key={user.uid} className="hover:bg-slate-50/50 transition">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-xs uppercase text-slate-600">
                          {user.email ? user.email[0] : '?'}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{user.email}</p>
                          <span className="text-[10px] text-slate-400 font-mono">UID: {user.uid}</span>
                        </div>
                        {user.isSuperUser && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-200">
                            Super User
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">{getRoleBadge(user.role)}</td>
                    <td className="px-6 py-4 text-slate-500 text-xs">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        {user.createdAt ? new Date(user.createdAt).toLocaleDateString('fr-FR', {
                          day: '2-digit',
                          month: 'long',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        }) : 'Non spécifiée'}
                      </div>
                    </td>
                    <td className="px-6 py-4">{getStatusBadge(user.status)}</td>
                    <td className="px-6 py-4 text-right">
                      {user.isSuperUser ? (
                        <span className="text-xs text-slate-400 italic">Compte racine protégé</span>
                      ) : (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            disabled={processingId === user.uid || user.status === 'approved'}
                            onClick={() => handleUpdateStatus(user.uid, 'approved')}
                            className={`p-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1 transition cursor-pointer ${
                              user.status === 'approved'
                                ? 'bg-slate-50 border-slate-100 text-slate-400 cursor-not-allowed'
                                : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                            }`}
                            title="Approuver l'inscription"
                          >
                            <Check className="w-4 h-4" />
                            <span>Approuver</span>
                          </button>
                          <button
                            disabled={processingId === user.uid || user.status === 'rejected'}
                            onClick={() => handleUpdateStatus(user.uid, 'rejected')}
                            className={`p-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1 transition cursor-pointer ${
                              user.status === 'rejected'
                                ? 'bg-slate-50 border-slate-100 text-slate-400 cursor-not-allowed'
                                : 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100'
                            }`}
                            title="Rejeter l'inscription"
                          >
                            <X className="w-4 h-4" />
                            <span>Rejeter</span>
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
