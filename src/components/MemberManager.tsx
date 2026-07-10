import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, UserPlus, Filter, Search, Plus, Trash2, Edit2, ShieldAlert, Check, 
  X, Briefcase, Mail, Phone, Calendar, Clipboard, ShieldCheck, Trophy
} from 'lucide-react';
import { collection, doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, sanitizeData } from '../firebase';
import { Club, Member, Team } from '../types';

interface MemberManagerProps {
  club: Club;
  members: Member[];
  teams: Team[];
  onRefresh: () => void;
  quickAction: string | null;
  clearQuickAction: () => void;
}

export default function MemberManager({ 
  club, members, teams, onRefresh, quickAction, clearQuickAction 
}: MemberManagerProps) {
  const [activeSubTab, setActiveSubTab] = useState<'members' | 'teams'>('members');
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [teamFilter, setTeamFilter] = useState<string>('all');
  
  // Modals / Forms
  const [showMemberForm, setShowMemberForm] = useState(quickAction === 'add_member');
  const [showTeamForm, setShowTeamForm] = useState(quickAction === 'add_team');
  const [editingMember, setEditingMember] = useState<Member | null>(null);

  React.useEffect(() => {
    if (quickAction === 'add_member') {
      setShowMemberForm(true);
      setActiveSubTab('members');
      clearQuickAction();
    } else if (quickAction === 'add_team') {
      setShowTeamForm(true);
      setActiveSubTab('teams');
      clearQuickAction();
    }
  }, [quickAction]);

  // Member Form State
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState<'player' | 'coach' | 'admin'>('player');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [membershipAmount, setMembershipAmount] = useState('150');

  // Team Form State
  const [teamName, setTeamName] = useState('');
  const [category, setCategory] = useState('U15');
  const [coachId, setCoachId] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetMemberForm = () => {
    setFirstName('');
    setLastName('');
    setRole('player');
    setEmail('');
    setPhone('');
    setLicenseNumber('');
    setBirthDate('');
    setMembershipAmount('150');
    setEditingMember(null);
    setShowMemberForm(false);
  };

  const resetTeamForm = () => {
    setTeamName('');
    setCategory('U15');
    setCoachId('');
    setShowTeamForm(false);
  };

  const handleSaveMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !email.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      const isNew = !editingMember;
      const memberId = isNew ? 'member_' + Math.random().toString(36).substring(2, 11) : editingMember!.id;
      const path = `clubs/${club.id}/members/${memberId}`;

      const memberData: Member = {
        id: memberId,
        clubId: club.id,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        role,
        email: email.trim().toLowerCase(),
        phone: phone.trim() || undefined,
        licenseNumber: licenseNumber.trim() || undefined,
        birthDate: birthDate || undefined,
        membershipAmount: Number(membershipAmount) || 0,
        membershipPaid: editingMember ? editingMember.membershipPaid : false,
        createdAt: editingMember ? editingMember.createdAt : new Date().toISOString()
      };

      await setDoc(doc(db, 'clubs', club.id, 'members', memberId), sanitizeData(memberData)).catch(err => {
        handleFirestoreError(err, OperationType.WRITE, path);
        throw err;
      });

      // If we added a member and they are also a player or coach, we might want to also auto create their payment ledger
      if (isNew && role === 'player' && Number(membershipAmount) > 0) {
        const paymentId = 'pay_' + Math.random().toString(36).substring(2, 11);
        const paymentPath = `clubs/${club.id}/payments/${paymentId}`;
        await setDoc(doc(db, 'clubs', club.id, 'payments', paymentId), sanitizeData({
          id: paymentId,
          clubId: club.id,
          memberId,
          amount: Number(membershipAmount),
          status: 'pending',
          description: 'Cotisation Annuelle',
          date: new Date().toISOString()
        })).catch(err => {
          handleFirestoreError(err, OperationType.WRITE, paymentPath);
        });
      }

      resetMemberForm();
      onRefresh();
    } catch (err: any) {
      setError("Erreur d'enregistrement: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditMemberClick = (m: Member) => {
    setEditingMember(m);
    setFirstName(m.firstName);
    setLastName(m.lastName);
    setRole(m.role);
    setEmail(m.email);
    setPhone(m.phone || '');
    setLicenseNumber(m.licenseNumber || '');
    setBirthDate(m.birthDate || '');
    setMembershipAmount(String(m.membershipAmount || 150));
    setShowMemberForm(true);
  };

  const handleDeleteMember = async (id: string) => {
    if (!window.confirm("Êtes-vous sûr de vouloir supprimer ce membre ? Cette action supprimera également ses données associées.")) return;

    setIsLoading(true);
    setError(null);
    try {
      const path = `clubs/${club.id}/members/${id}`;
      await deleteDoc(doc(db, 'clubs', club.id, 'members', id)).catch(err => {
        handleFirestoreError(err, OperationType.DELETE, path);
        throw err;
      });
      onRefresh();
    } catch (err: any) {
      setError("Erreur lors de la suppression: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamName.trim()) return;

    setIsLoading(true);
    setError(null);
    try {
      const teamId = 'team_' + Math.random().toString(36).substring(2, 11);
      const path = `clubs/${club.id}/teams/${teamId}`;

      const newTeam: Team = {
        id: teamId,
        clubId: club.id,
        name: teamName.trim(),
        category,
        coachId: coachId || undefined,
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'clubs', club.id, 'teams', teamId), sanitizeData(newTeam)).catch(err => {
        handleFirestoreError(err, OperationType.WRITE, path);
        throw err;
      });

      resetTeamForm();
      onRefresh();
    } catch (err: any) {
      setError("Erreur lors de la création de l'équipe: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteTeam = async (id: string) => {
    if (!window.confirm("Supprimer cette équipe ?")) return;

    setIsLoading(true);
    setError(null);
    try {
      const path = `clubs/${club.id}/teams/${id}`;
      await deleteDoc(doc(db, 'clubs', club.id, 'teams', id)).catch(err => {
        handleFirestoreError(err, OperationType.DELETE, path);
        throw err;
      });
      onRefresh();
    } catch (err: any) {
      setError("Erreur: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Filtering Logic
  const filteredMembers = members.filter(m => {
    const matchesSearch = 
      `${m.firstName} ${m.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (m.licenseNumber && m.licenseNumber.includes(searchTerm));
    
    const matchesRole = roleFilter === 'all' ? true : m.role === roleFilter;

    // Filter by team requires searching through events/members, but since members are registered club wide, we can support simple team assignment. For now role filtering is highly robust.
    return matchesSearch && matchesRole;
  });

  return (
    <div id="members-management-section" className="space-y-6">
      {/* Tab Selectors */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveSubTab('members')}
          className={`px-5 py-3 font-semibold text-sm transition cursor-pointer flex items-center gap-2 ${
            activeSubTab === 'members' ? 'border-b-2 border-emerald-600 text-emerald-700' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Users className="w-4 h-4" />
          Membres ({members.length})
        </button>
        <button
          onClick={() => setActiveSubTab('teams')}
          className={`px-5 py-3 font-semibold text-sm transition cursor-pointer flex items-center gap-2 ${
            activeSubTab === 'teams' ? 'border-b-2 border-emerald-600 text-emerald-700' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Trophy className="w-4 h-4" />
          Équipes ({teams.length})
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* MEMBERS SUB TAB */}
      {activeSubTab === 'members' && (
        <div className="space-y-6">
          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4">
            <div className="flex-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Rechercher par nom, prénom, licence..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-600 text-sm"
                />
              </div>

              <div className="flex items-center gap-2 bg-white border border-slate-200 px-3 py-2 rounded-xl">
                <Filter className="w-4 h-4 text-slate-400" />
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="bg-transparent border-none text-xs font-semibold text-slate-600 focus:outline-none"
                >
                  <option value="all">Tous les rôles</option>
                  <option value="player">Joueurs</option>
                  <option value="coach">Coachs</option>
                  <option value="admin">Administrateurs</option>
                </select>
              </div>
            </div>

            <button
              onClick={() => setShowMemberForm(true)}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm px-4 py-2.5 rounded-xl shadow flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              Nouveau Membre
            </button>
          </div>

          {/* Member Registration / Edit Drawer or Modal */}
          {showMemberForm && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4"
            >
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <h4 className="font-bold text-slate-900 text-base">
                  {editingMember ? "Modifier le Membre" : "Enregistrer un Nouveau Membre"}
                </h4>
                <button onClick={resetMemberForm} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveMember} className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 uppercase">Prénom</label>
                  <input
                    type="text"
                    required
                    placeholder="ex: Thomas"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 uppercase">Nom</label>
                  <input
                    type="text"
                    required
                    placeholder="ex: Dubois"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 uppercase">Rôle</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as any)}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm bg-white"
                  >
                    <option value="player">Joueur / Licencié</option>
                    <option value="coach">Coach / Entraîneur</option>
                    <option value="admin">Administrateur</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 uppercase">Email</label>
                  <input
                    type="email"
                    required
                    placeholder="ex: thomas.dubois@gmail.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 uppercase">Téléphone</label>
                  <input
                    type="tel"
                    placeholder="ex: 0612345678"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 uppercase">N° Licence Fédérale (optionnel)</label>
                  <input
                    type="text"
                    placeholder="ex: LIC-89472"
                    value={licenseNumber}
                    onChange={(e) => setLicenseNumber(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 uppercase">Date de Naissance</label>
                  <input
                    type="date"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 uppercase">Prix de l'adhésion (€)</label>
                  <input
                    type="number"
                    value={membershipAmount}
                    onChange={(e) => setMembershipAmount(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>

                <div className="md:col-span-3 flex justify-end gap-3 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={resetMemberForm}
                    className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 text-sm hover:bg-slate-50 cursor-pointer"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-semibold cursor-pointer flex items-center gap-2"
                  >
                    {isLoading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
                    Enregistrer
                  </button>
                </div>
              </form>
            </motion.div>
          )}

          {/* Members Table */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs font-bold uppercase tracking-wider">
                    <th className="px-6 py-4">Nom complet / Licence</th>
                    <th className="px-6 py-4">Rôle</th>
                    <th className="px-6 py-4">Contact</th>
                    <th className="px-6 py-4">Cotisation</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                  {filteredMembers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-slate-400 text-xs">
                        Aucun membre trouvé correspondant à la recherche.
                      </td>
                    </tr>
                  ) : (
                    filteredMembers.map(m => (
                      <tr key={m.id} className="hover:bg-slate-50/50 transition">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-emerald-50 text-emerald-700 font-bold rounded-full flex items-center justify-center uppercase text-xs">
                              {m.firstName[0]}{m.lastName[0]}
                            </div>
                            <div>
                              <p className="font-bold text-slate-900">{m.firstName} {m.lastName}</p>
                              {m.licenseNumber ? (
                                <p className="text-[10px] font-semibold text-slate-400 flex items-center gap-1 mt-0.5">
                                  <Clipboard className="w-3 h-3 text-slate-300" />
                                  {m.licenseNumber}
                                </p>
                              ) : (
                                <span className="text-[10px] font-semibold text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded mt-0.5 inline-block">Licence manquante</span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${
                            m.role === 'admin' ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' :
                            m.role === 'coach' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                            'bg-blue-50 text-blue-700 border border-blue-100'
                          }`}>
                            {m.role === 'admin' ? <ShieldCheck className="w-3.5 h-3.5" /> : null}
                            {m.role === 'admin' ? 'Admin' : m.role === 'coach' ? 'Coach' : 'Joueur'}
                          </span>
                        </td>
                        <td className="px-6 py-4 space-y-1 text-xs text-slate-500 font-medium">
                          <p className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5 text-slate-400" /> {m.email}</p>
                          {m.phone && <p className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-slate-400" /> {m.phone}</p>}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1 text-xs font-bold ${m.membershipPaid ? 'text-emerald-600' : 'text-amber-500'}`}>
                            {m.membershipPaid ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                            {m.membershipPaid ? 'Payé' : 'En attente'} ({m.membershipAmount || 150} €)
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-1">
                            <button
                              onClick={() => handleEditMemberClick(m)}
                              className="p-1.5 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-800 transition cursor-pointer"
                              title="Modifier"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteMember(m.id)}
                              className="p-1.5 hover:bg-slate-100 rounded text-slate-400 hover:text-red-600 transition cursor-pointer"
                              title="Supprimer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TEAMS SUB TAB */}
      {activeSubTab === 'teams' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="font-bold text-slate-900 text-lg">Catégories & Équipes</h3>
              <p className="text-xs text-slate-400">Gérez les sections de votre club sportif.</p>
            </div>
            <button
              onClick={() => setShowTeamForm(true)}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm px-4 py-2.5 rounded-xl shadow flex items-center gap-2 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Nouvelle Équipe
            </button>
          </div>

          {showTeamForm && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4 max-w-xl"
            >
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <h4 className="font-bold text-slate-900 text-sm">Ajouter une Équipe</h4>
                <button onClick={resetTeamForm} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateTeam} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 uppercase">Nom de l'équipe</label>
                  <input
                    type="text"
                    required
                    placeholder="ex: Seniors Masculin A, U18 Féminines"
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-600 uppercase">Catégorie</label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm bg-white"
                    >
                      <option value="U11">U11 (Poussins)</option>
                      <option value="U13">U13 (Benjamins)</option>
                      <option value="U15">U15 (Minimes)</option>
                      <option value="U18">U18 (Cadets)</option>
                      <option value="U21">U21 (Juniors)</option>
                      <option value="Seniors">Seniors</option>
                      <option value="Vétérans">Vétérans</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-600 uppercase">Coach principal</label>
                    <select
                      value={coachId}
                      onChange={(e) => setCoachId(e.target.value)}
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm bg-white"
                    >
                      <option value="">Sélectionner un coach...</option>
                      {members.filter(m => m.role === 'coach').map(coach => (
                        <option key={coach.id} value={coach.id}>{coach.firstName} {coach.lastName}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={resetTeamForm}
                    className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 text-sm hover:bg-slate-50 cursor-pointer"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-semibold cursor-pointer flex items-center gap-2"
                  >
                    {isLoading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
                    Enregistrer
                  </button>
                </div>
              </form>
            </motion.div>
          )}

          {/* Teams Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {teams.length === 0 ? (
              <div className="col-span-3 py-12 text-center bg-white border border-dashed border-slate-200 rounded-2xl text-slate-400 text-xs">
                Aucune équipe créée pour l'instant.
              </div>
            ) : (
              teams.map(team => {
                const coach = members.find(m => m.id === team.coachId);
                const playersInTeamCount = members.filter(m => m.role === 'player').length; // For demo layout

                return (
                  <div
                    key={team.id}
                    className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow transition flex flex-col justify-between space-y-4"
                  >
                    <div className="space-y-2">
                      <div className="flex justify-between items-start">
                        <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">
                          {team.category}
                        </span>
                        <button
                          onClick={() => handleDeleteTeam(team.id)}
                          className="text-slate-300 hover:text-red-500 transition cursor-pointer"
                          title="Supprimer l'équipe"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <h4 className="font-bold text-slate-900 text-base">{team.name}</h4>
                    </div>

                    <div className="text-xs text-slate-500 space-y-1 pt-3 border-t border-slate-50">
                      <p className="flex items-center gap-1.5">
                        <Briefcase className="w-3.5 h-3.5 text-slate-400" />
                        <span>Entraîneur: <strong className="text-slate-700">{coach ? `${coach.firstName} ${coach.lastName}` : "Non assigné"}</strong></span>
                      </p>
                      <p className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-slate-400" />
                        <span>Effectif club: <strong className="text-slate-700">{playersInTeamCount} licenciés</strong></span>
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
