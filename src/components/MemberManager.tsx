import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, UserPlus, Filter, Search, Plus, Trash2, Edit2, ShieldAlert, Check, 
  X, Briefcase, Mail, Phone, Calendar, Clipboard, ShieldCheck, Trophy,
  Camera, User, FileText, Award, AlertTriangle, CheckCircle
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
  const [ageFilter, setAgeFilter] = useState<string>('all');

  // Age categorization function
  const getAgeCategory = (birthDateString: string | undefined): string => {
    if (!birthDateString) return 'Non renseigné';
    const birthDate = new Date(birthDateString);
    if (isNaN(birthDate.getTime())) return 'Non renseigné';
    
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }

    if (age < 7) return 'U7 (<7 ans)';
    if (age < 9) return 'U9 (7-8)';
    if (age < 11) return 'U11 (9-10)';
    if (age < 13) return 'U13 (11-12)';
    if (age < 15) return 'U15 (13-14)';
    if (age < 18) return 'U18 (15-17)';
    if (age < 35) return 'Seniors';
    return 'Vétérans';
  };

  const categoriesOrder = [
    'U7 (<7 ans)',
    'U9 (7-8)',
    'U11 (9-10)',
    'U13 (11-12)',
    'U15 (13-14)',
    'U18 (15-17)',
    'Seniors',
    'Vétérans',
    'Non renseigné'
  ];
  
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
  
  // Step 5 - Enriched Profile & Document Tracking states
  const [photoUrl, setPhotoUrl] = useState('');
  const [equipmentSize, setEquipmentSize] = useState('M');
  const [medicalCertStatus, setMedicalCertStatus] = useState<'valid' | 'renew' | 'missing'>('missing');
  const [registrationFormStatus, setRegistrationFormStatus] = useState<'valid' | 'renew' | 'missing'>('missing');
  const [selectedMemberForDetail, setSelectedMemberForDetail] = useState<Member | null>(null);

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
    setPhotoUrl('');
    setEquipmentSize('M');
    setMedicalCertStatus('missing');
    setRegistrationFormStatus('missing');
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
        createdAt: editingMember ? editingMember.createdAt : new Date().toISOString(),
        photoUrl: photoUrl.trim() || undefined,
        equipmentSize: equipmentSize || undefined,
        medicalCertStatus: medicalCertStatus || 'missing',
        registrationFormStatus: registrationFormStatus || 'missing'
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

  const handleSaveDetailProfile = async (updatedMember: Member) => {
    setIsLoading(true);
    setError(null);
    try {
      const path = `clubs/${club.id}/members/${updatedMember.id}`;
      await setDoc(doc(db, 'clubs', club.id, 'members', updatedMember.id), sanitizeData(updatedMember)).catch(err => {
        handleFirestoreError(err, OperationType.WRITE, path);
        throw err;
      });
      setSelectedMemberForDetail(null);
      onRefresh();
    } catch (err: any) {
      setError("Erreur de mise à jour de la fiche : " + err.message);
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
    setPhotoUrl(m.photoUrl || '');
    setEquipmentSize(m.equipmentSize || 'M');
    setMedicalCertStatus(m.medicalCertStatus || 'missing');
    setRegistrationFormStatus(m.registrationFormStatus || 'missing');
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
    const matchesAge = ageFilter === 'all' ? true : getAgeCategory(m.birthDate) === ageFilter;

    return matchesSearch && matchesRole && matchesAge;
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
      {activeSubTab === 'members' && (() => {
        const ageCounts: Record<string, number> = {};
        categoriesOrder.forEach(cat => { ageCounts[cat] = 0; });
        members.forEach(m => {
          const cat = getAgeCategory(m.birthDate);
          if (ageCounts[cat] !== undefined) {
            ageCounts[cat]++;
          } else {
            ageCounts['Non renseigné']++;
          }
        });

        const categoriesWithData = categoriesOrder
          .map(name => ({ name, count: ageCounts[name] }))
          .filter(item => item.count > 0);

        return (
          <div className="space-y-6">
            {/* Quick Category Summary Badges */}
            {categoriesWithData.length > 0 && (
              <div id="age-categories-summary-row" className="bg-slate-50 border border-slate-150 rounded-2xl p-4 flex flex-wrap items-center gap-2 shadow-sm">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mr-2">Catégories d'âge :</span>
                {categoriesWithData.map((cat, idx) => (
                  <button
                    key={idx}
                    onClick={() => setAgeFilter(ageFilter === cat.name ? 'all' : cat.name)}
                    className={`border rounded-full px-3 py-1 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                      ageFilter === cat.name
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-emerald-300 hover:bg-slate-50'
                    }`}
                    title="Cliquez pour filtrer"
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${ageFilter === cat.name ? 'bg-white' : 'bg-emerald-500'}`}></span>
                    <span>{cat.name} :</span>
                    <span className="font-extrabold">{cat.count}</span>
                  </button>
                ))}
                {ageFilter !== 'all' && (
                  <button
                    onClick={() => setAgeFilter('all')}
                    className="text-xs font-bold text-slate-500 hover:text-slate-800 transition cursor-pointer underline ml-auto"
                  >
                    Réinitialiser le filtre
                  </button>
                )}
              </div>
            )}

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
                    className="bg-transparent border-none text-xs font-semibold text-slate-600 focus:outline-none bg-white"
                  >
                    <option value="all">Tous les rôles</option>
                    <option value="player">Joueurs</option>
                    <option value="coach">Coachs</option>
                    <option value="admin">Administrateurs</option>
                  </select>
                </div>

                <div className="flex items-center gap-2 bg-white border border-slate-200 px-3 py-2 rounded-xl">
                  <Calendar className="w-4 h-4 text-slate-400" />
                  <select
                    value={ageFilter}
                    onChange={(e) => setAgeFilter(e.target.value)}
                    className="bg-transparent border-none text-xs font-semibold text-slate-600 focus:outline-none bg-white"
                  >
                    <option value="all">Toutes les catégories</option>
                    {categoriesOrder.map((cat, idx) => (
                      <option key={idx} value={cat}>{cat}</option>
                    ))}
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

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 uppercase">Taille Équipement</label>
                  <select
                    value={equipmentSize}
                    onChange={(e) => setEquipmentSize(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm bg-white"
                  >
                    <option value="XS">XS</option>
                    <option value="S">S</option>
                    <option value="M">M</option>
                    <option value="L">L</option>
                    <option value="XL">XL</option>
                    <option value="XXL">XXL</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 uppercase">Certificat Médical</label>
                  <select
                    value={medicalCertStatus}
                    onChange={(e) => setMedicalCertStatus(e.target.value as any)}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm bg-white"
                  >
                    <option value="valid">✅ Valide</option>
                    <option value="renew">⚠️ À renouveler</option>
                    <option value="missing">❌ Absent / Manquant</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 uppercase">Fiche d'Inscription</label>
                  <select
                    value={registrationFormStatus}
                    onChange={(e) => setRegistrationFormStatus(e.target.value as any)}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm bg-white"
                  >
                    <option value="valid">✅ Valide</option>
                    <option value="renew">⚠️ À renouveler</option>
                    <option value="missing">❌ Absente / Manquante</option>
                  </select>
                </div>

                <div className="md:col-span-3 space-y-1">
                  <label className="text-xs font-bold text-slate-600 uppercase">Photo de Profil ou Avatar (optionnel)</label>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <input
                      type="url"
                      placeholder="Lien photo (ex: https://images.unsplash.com/...)"
                      value={photoUrl}
                      onChange={(e) => setPhotoUrl(e.target.value)}
                      className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm"
                    />
                    <div className="flex gap-1.5 items-center bg-slate-50 border border-slate-200 p-1.5 rounded-lg">
                      <span className="text-[10px] font-bold text-slate-400 uppercase px-1">Presets :</span>
                      {['⚽', '🏃', '🏆', '👟', '🏐', '🥎'].map(emoji => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => setPhotoUrl(emoji)}
                          className={`w-7 h-7 rounded flex items-center justify-center text-sm border hover:bg-slate-100 transition cursor-pointer ${photoUrl === emoji ? 'border-emerald-600 bg-emerald-100 shadow-sm' : 'border-slate-200 bg-white'}`}
                          title={`Utiliser l'avatar ${emoji}`}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
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
                    <th className="px-6 py-4">Dossier Administratif</th>
                    <th className="px-6 py-4">Équipement & Cotis.</th>
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
                            <div 
                              onClick={() => setSelectedMemberForDetail(m)}
                              className="cursor-pointer hover:scale-105 transition-transform shrink-0"
                              title="Voir la fiche profil"
                            >
                              {m.photoUrl && m.photoUrl.length <= 4 ? (
                                <div className="w-10 h-10 bg-emerald-50 border border-emerald-100 rounded-full flex items-center justify-center text-lg select-none">
                                  {m.photoUrl}
                                </div>
                              ) : m.photoUrl ? (
                                <img
                                  src={m.photoUrl}
                                  alt={`${m.firstName}`}
                                  referrerPolicy="no-referrer"
                                  className="w-10 h-10 rounded-full object-cover border border-slate-200"
                                />
                              ) : (
                                <div className="w-10 h-10 bg-emerald-50 text-emerald-700 font-extrabold rounded-full flex items-center justify-center uppercase text-xs">
                                  {m.firstName[0] || ''}{m.lastName[0] || ''}
                                </div>
                              )}
                            </div>
                            <div>
                              <p 
                                onClick={() => setSelectedMemberForDetail(m)}
                                className="font-bold text-slate-900 hover:text-emerald-700 cursor-pointer transition flex items-center gap-1"
                              >
                                {m.firstName} {m.lastName}
                              </p>
                              <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                                {m.birthDate && (
                                  <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded inline-block">
                                    {getAgeCategory(m.birthDate)}
                                  </span>
                                )}
                                {m.licenseNumber ? (
                                  <span className="text-[10px] font-semibold text-slate-400 flex items-center gap-1">
                                    <Clipboard className="w-3 h-3 text-slate-300" />
                                    {m.licenseNumber}
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-semibold text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded inline-block">Licence manquante</span>
                                )}
                              </div>
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
                        <td className="px-6 py-4">
                          <div className="space-y-1.5 text-xs">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[9px] font-bold text-slate-400 uppercase w-11 shrink-0">Certif. M :</span>
                              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                                m.medicalCertStatus === 'valid' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                                m.medicalCertStatus === 'renew' ? 'bg-amber-50 text-amber-700 border-amber-100 animate-pulse' :
                                'bg-rose-50 text-rose-700 border-rose-100'
                              }`}>
                                {m.medicalCertStatus === 'valid' ? 'Valide' :
                                 m.medicalCertStatus === 'renew' ? 'À renouveler' : 'Absent'}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[9px] font-bold text-slate-400 uppercase w-11 shrink-0">Fiche Inscr:</span>
                              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                                m.registrationFormStatus === 'valid' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                                m.registrationFormStatus === 'renew' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                                'bg-rose-50 text-rose-700 border-rose-100'
                              }`}>
                                {m.registrationFormStatus === 'valid' ? 'Valide' :
                                 m.registrationFormStatus === 'renew' ? 'À renouveler' : 'Absente'}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="space-y-1 text-xs text-slate-500 font-medium">
                            <p className="flex items-center gap-1">
                              <span className="text-[9px] font-bold text-slate-400 uppercase">Taille :</span>
                              <span className="text-emerald-700 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded font-extrabold text-[10px]">
                                {m.equipmentSize || 'Non spécifiée'}
                              </span>
                            </p>
                            <p className="flex items-center gap-1">
                              <span className={m.membershipPaid ? 'text-emerald-600 font-bold' : 'text-amber-500 font-bold'}>
                                {m.membershipPaid ? '✓ Payé' : '✗ En attente'} ({m.membershipAmount || 150} €)
                              </span>
                            </p>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-1">
                            <button
                              onClick={() => setSelectedMemberForDetail(m)}
                              className="p-1.5 hover:bg-emerald-50 rounded text-emerald-600 hover:text-emerald-800 transition cursor-pointer"
                              title="Voir Fiche Profil & Dossier"
                            >
                              <FileText className="w-4 h-4" />
                            </button>
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
      );
    })()}

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

      {/* Step 5 - Fiche Profil Individuelle & Suivi Administratif Modal */}
      <AnimatePresence>
        {selectedMemberForDetail && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-2xl w-full overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Modal Header */}
              <div className="bg-slate-50 border-b border-slate-100 px-6 py-5 flex justify-between items-center">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-slate-900 text-lg">Fiche Profil & Dossier Administratif</h3>
                    <p className="text-xs text-slate-400 font-medium">Suivi individuel et validation des pièces jointes</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedMemberForDetail(null)}
                  className="w-8 h-8 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-600 flex items-center justify-center transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Content */}
              <div className="overflow-y-auto p-6 space-y-6">
                {/* Profile Card Summary */}
                <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-100 rounded-2xl p-5 flex flex-col sm:flex-row items-center gap-5">
                  {/* Photo Display */}
                  <div className="relative group shrink-0">
                    {selectedMemberForDetail.photoUrl && selectedMemberForDetail.photoUrl.length <= 4 ? (
                      <div className="w-20 h-20 bg-white border-2 border-emerald-500 rounded-full flex items-center justify-center text-4xl select-none shadow-md">
                        {selectedMemberForDetail.photoUrl}
                      </div>
                    ) : selectedMemberForDetail.photoUrl ? (
                      <img
                        src={selectedMemberForDetail.photoUrl}
                        alt={`${selectedMemberForDetail.firstName}`}
                        referrerPolicy="no-referrer"
                        className="w-20 h-20 rounded-full object-cover border-2 border-emerald-500 shadow-md"
                      />
                    ) : (
                      <div className="w-20 h-20 bg-emerald-600 text-white font-extrabold rounded-full flex items-center justify-center uppercase text-2xl shadow-md">
                        {selectedMemberForDetail.firstName[0] || ''}{selectedMemberForDetail.lastName[0] || ''}
                      </div>
                    )}
                  </div>

                  <div className="text-center sm:text-left space-y-1">
                    <h4 className="font-extrabold text-slate-900 text-xl flex flex-wrap items-center justify-center sm:justify-start gap-2">
                      <span>{selectedMemberForDetail.firstName} {selectedMemberForDetail.lastName}</span>
                      <span className={`inline-flex items-center text-xs font-bold px-2 py-0.5 rounded-full ${
                        selectedMemberForDetail.role === 'admin' ? 'bg-indigo-100 text-indigo-700' :
                        selectedMemberForDetail.role === 'coach' ? 'bg-emerald-100 text-emerald-700' :
                        'bg-blue-100 text-blue-700'
                      }`}>
                        {selectedMemberForDetail.role === 'admin' ? 'Admin' : selectedMemberForDetail.role === 'coach' ? 'Coach' : 'Joueur'}
                      </span>
                    </h4>
                    
                    <p className="text-xs text-slate-500 font-medium">
                      ✉ {selectedMemberForDetail.email} {selectedMemberForDetail.phone && `• 📞 ${selectedMemberForDetail.phone}`}
                    </p>
                    
                    {selectedMemberForDetail.birthDate && (
                      <p className="text-xs text-slate-400 font-semibold">
                        📅 Né le {new Date(selectedMemberForDetail.birthDate).toLocaleDateString('fr-FR')} ({getAgeCategory(selectedMemberForDetail.birthDate)})
                      </p>
                    )}
                  </div>
                </div>

                {/* Edit Form Fields for the Fiche */}
                <div className="space-y-4">
                  <h5 className="font-bold text-slate-700 text-xs uppercase tracking-wider border-b border-slate-100 pb-1">
                    Informations de Licence & Équipement
                  </h5>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* License Number Input */}
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1">
                        <Clipboard className="w-3.5 h-3.5 text-slate-400" />
                        N° Licence Officiel
                      </label>
                      <input
                        type="text"
                        placeholder="ex: LIC-1003482"
                        value={selectedMemberForDetail.licenseNumber || ''}
                        onChange={(e) => setSelectedMemberForDetail({
                          ...selectedMemberForDetail,
                          licenseNumber: e.target.value
                        })}
                        className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-500 bg-slate-50 focus:bg-white transition"
                      />
                    </div>

                    {/* Equipment Size Selector (interactive pill buttons) */}
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1 mb-1">
                        <span>👕 Taille d'Équipement</span>
                      </label>
                      <div className="flex gap-1.5 flex-wrap">
                        {['XS', 'S', 'M', 'L', 'XL', 'XXL'].map(size => (
                          <button
                            key={size}
                            type="button"
                            onClick={() => setSelectedMemberForDetail({
                              ...selectedMemberForDetail,
                              equipmentSize: size
                            })}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
                              selectedMemberForDetail.equipmentSize === size
                                ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm'
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            {size}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Profile Photo selector */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1">
                      <Camera className="w-3.5 h-3.5 text-slate-400" />
                      Modifier Photo ou Preset Avatar
                    </label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="url"
                        placeholder="https://images.unsplash.com/... ou lien de photo"
                        value={(selectedMemberForDetail.photoUrl && selectedMemberForDetail.photoUrl.length > 4) ? selectedMemberForDetail.photoUrl : ''}
                        onChange={(e) => setSelectedMemberForDetail({
                          ...selectedMemberForDetail,
                          photoUrl: e.target.value
                        })}
                        className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-500 bg-slate-50 focus:bg-white transition"
                      />
                      <div className="flex gap-1 items-center bg-slate-50 border border-slate-200 p-1 rounded-lg">
                        {['⚽', '🏃', '🏆', '👟', '🏐', '🥎'].map(emoji => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => setSelectedMemberForDetail({
                              ...selectedMemberForDetail,
                              photoUrl: emoji
                            })}
                            className={`w-7 h-7 rounded flex items-center justify-center text-sm border hover:bg-slate-100 transition cursor-pointer ${selectedMemberForDetail.photoUrl === emoji ? 'border-emerald-600 bg-emerald-100 shadow-sm' : 'border-slate-200 bg-white'}`}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Document Status Toggles */}
                <div className="space-y-4 pt-2">
                  <h5 className="font-bold text-slate-700 text-xs uppercase tracking-wider border-b border-slate-100 pb-1">
                    Dossier de Pièces Administratives
                  </h5>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Certificat Medical Selector */}
                    <div className="bg-slate-50 border border-slate-150 rounded-xl p-4 space-y-2">
                      <p className="text-xs font-bold text-slate-700 flex items-center gap-1">
                        <CheckCircle className="w-4 h-4 text-emerald-500" />
                        Certificat Médical
                      </p>
                      <div className="grid grid-cols-3 gap-1">
                        {[
                          { key: 'valid', label: 'Valide', color: 'bg-emerald-600 text-white border-emerald-600', inactive: 'bg-white text-slate-600 hover:bg-emerald-50' },
                          { key: 'renew', label: 'Renouveler', color: 'bg-amber-500 text-white border-amber-500', inactive: 'bg-white text-slate-600 hover:bg-amber-50' },
                          { key: 'missing', label: 'Absent', color: 'bg-red-600 text-white border-red-600', inactive: 'bg-white text-slate-600 hover:bg-red-50' },
                        ].map(opt => (
                          <button
                            key={opt.key}
                            type="button"
                            onClick={() => setSelectedMemberForDetail({
                              ...selectedMemberForDetail,
                              medicalCertStatus: opt.key as any
                            })}
                            className={`py-1.5 rounded-lg text-[11px] font-bold border text-center transition cursor-pointer ${
                              selectedMemberForDetail.medicalCertStatus === opt.key ? opt.color : opt.inactive
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Fiche d'Inscription Selector */}
                    <div className="bg-slate-50 border border-slate-150 rounded-xl p-4 space-y-2">
                      <p className="text-xs font-bold text-slate-700 flex items-center gap-1">
                        <FileText className="w-4 h-4 text-emerald-500" />
                        Fiche d'Inscription
                      </p>
                      <div className="grid grid-cols-3 gap-1">
                        {[
                          { key: 'valid', label: 'Valide', color: 'bg-emerald-600 text-white border-emerald-600', inactive: 'bg-white text-slate-600 hover:bg-emerald-50' },
                          { key: 'renew', label: 'Renouveler', color: 'bg-amber-500 text-white border-amber-500', inactive: 'bg-white text-slate-600 hover:bg-amber-50' },
                          { key: 'missing', label: 'Absente', color: 'bg-red-600 text-white border-red-600', inactive: 'bg-white text-slate-600 hover:bg-red-50' },
                        ].map(opt => (
                          <button
                            key={opt.key}
                            type="button"
                            onClick={() => setSelectedMemberForDetail({
                              ...selectedMemberForDetail,
                              registrationFormStatus: opt.key as any
                            })}
                            className={`py-1.5 rounded-lg text-[11px] font-bold border text-center transition cursor-pointer ${
                              selectedMemberForDetail.registrationFormStatus === opt.key ? opt.color : opt.inactive
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Cotisation Info Block */}
                <div className="border border-slate-150 rounded-xl p-4 flex justify-between items-center bg-slate-50">
                  <div className="space-y-0.5">
                    <p className="text-xs font-bold text-slate-500 uppercase">Statut Cotisation Club</p>
                    <p className="text-sm font-bold text-slate-800">
                      Montant de l'adhésion : {selectedMemberForDetail.membershipAmount || 150} €
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedMemberForDetail({
                        ...selectedMemberForDetail,
                        membershipPaid: !selectedMemberForDetail.membershipPaid
                      });
                    }}
                    className={`px-4 py-2 rounded-xl text-xs font-bold border transition flex items-center gap-1 cursor-pointer ${
                      selectedMemberForDetail.membershipPaid
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700 font-extrabold shadow-sm'
                        : 'bg-amber-50 border-amber-200 text-amber-700 font-extrabold hover:bg-amber-100'
                    }`}
                  >
                    {selectedMemberForDetail.membershipPaid ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        Cotisation Payée
                      </>
                    ) : (
                      <>
                        <X className="w-3.5 h-3.5" />
                        Non Payée (Modifier)
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="bg-slate-50 border-t border-slate-100 px-6 py-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedMemberForDetail(null)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-slate-600 text-xs font-bold hover:bg-slate-100 transition cursor-pointer"
                >
                  Fermer
                </button>
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() => handleSaveDetailProfile(selectedMemberForDetail)}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-md animate-none"
                >
                  {isLoading && <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
                  Enregistrer la Fiche
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
