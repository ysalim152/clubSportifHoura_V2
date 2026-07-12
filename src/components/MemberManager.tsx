import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, UserPlus, Filter, Search, Plus, Trash2, Edit2, ShieldAlert, Check, 
  X, Briefcase, Mail, Phone, Calendar, Clipboard, ShieldCheck, Trophy,
  Camera, User, FileText, Award, AlertTriangle, CheckCircle, Download, UploadCloud,
  FileUp, FileDown, Paperclip, Eye, CreditCard, Shirt, DollarSign, Grid, List
} from 'lucide-react';
import { collection, doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, sanitizeData } from '../firebase';
import { Club, Member, Team, UserRole, Event, Payment } from '../types';
import { generateRegistrationFormPDF, generateParentalAuthPDF, generateCharterSignaturePDF } from '../utils/pdfGenerator';

interface MemberManagerProps {
  club: Club;
  members: Member[];
  teams: Team[];
  onRefresh: () => void;
  quickAction: string | null;
  clearQuickAction: () => void;
  currencySymbol?: string;
  events?: Event[];
  payments?: Payment[];
}

export default function MemberManager({ 
  club, members, teams, onRefresh, quickAction, clearQuickAction, currencySymbol = '€', events = [], payments = []
}: MemberManagerProps) {
  const getRoleDisplay = (role: string) => {
    switch (role) {
      case 'admin':
        return { label: 'Administrateur', classes: 'bg-indigo-50 text-indigo-700 border border-indigo-100' };
      case 'president':
        return { label: "Président de l'association", classes: 'bg-rose-50 text-rose-700 border border-rose-100 font-extrabold' };
      case 'vice_president_1':
        return { label: "1er Vice-président", classes: 'bg-pink-50 text-pink-700 border border-pink-100 font-semibold' };
      case 'vice_president_2':
        return { label: "2e Vice-président", classes: 'bg-pink-50 text-pink-700 border border-pink-100 font-semibold' };
      case 'sec_general':
        return { label: 'Secrétaire Général', classes: 'bg-purple-50 text-purple-700 border border-purple-100 font-semibold' };
      case 'tresorier':
        return { label: 'Trésorier', classes: 'bg-amber-50 text-amber-700 border border-amber-100 font-bold' };
      case 'membre_actif':
        return { label: 'Membre Actif', classes: 'bg-violet-50 text-violet-700 border border-violet-100' };
      case 'adherent':
        return { label: 'Adhérent', classes: 'bg-sky-50 text-sky-700 border border-sky-100' };
      case 'player':
        return { label: 'Joueur', classes: 'bg-blue-50 text-blue-700 border border-blue-100' };
      case 'visiteur':
        return { label: 'Visiteur', classes: 'bg-slate-100 text-slate-600 border border-slate-200' };
      case 'coach':
        return { label: 'Coach / Entraîneur', classes: 'bg-emerald-50 text-emerald-700 border border-emerald-100' };
      default:
        return { label: role, classes: 'bg-slate-50 text-slate-700 border border-slate-150' };
    }
  };

  const [activeSubTab, setActiveSubTab] = useState<'members' | 'teams' | 'dossiers' | 'signatures' | 'cotisations'>('members');
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [teamFilter, setTeamFilter] = useState<string>('all');
  const [ageFilter, setAgeFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');

  // Reminder states for Step 1
  const [selectedMemberForReminder, setSelectedMemberForReminder] = useState<Member | null>(null);
  const [reminderTone, setReminderTone] = useState<'friendly' | 'professional' | 'urgent'>('friendly');
  const [reminderChannel, setReminderChannel] = useState<'email' | 'sms'>('email');
  const [dossierDocFilter, setDossierDocFilter] = useState<'all' | 'medical' | 'registration' | 'parental'>('all');
  const [isReminderCopied, setIsReminderCopied] = useState(false);

  // Step 4 states (Cotisations & Équipements)
  const [selectedMemberForPayReminder, setSelectedMemberForPayReminder] = useState<Member | null>(null);
  const [payReminderTone, setPayReminderTone] = useState<'friendly' | 'professional' | 'urgent'>('friendly');
  const [payReminderChannel, setPayReminderChannel] = useState<'email' | 'sms'>('email');
  const [isPayReminderCopied, setIsPayReminderCopied] = useState(false);
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<'all' | 'paid' | 'pending'>('all');
  const [sizeFilter, setSizeFilter] = useState<string>('all');
  const [isUpdatingStep4Id, setIsUpdatingStep4Id] = useState<string | null>(null);

  // Helper for automated copywriter reminder drafts (Step 1)
  const getDraftMessage = (m: Member, tone: 'friendly' | 'professional' | 'urgent', channel: 'email' | 'sms') => {
    const isMinor = m.birthDate ? (new Date().getFullYear() - new Date(m.birthDate).getFullYear() < 18) : false;
    const missingDocs = [];
    if (m.medicalCertStatus !== 'valid') {
      missingDocs.push(m.medicalCertStatus === 'renew' ? "Certificat Médical (à renouveler)" : "Certificat Médical (manquant)");
    }
    if (m.registrationFormStatus !== 'valid') {
      missingDocs.push(m.registrationFormStatus === 'renew' ? "Fiche d'Inscription (à renouveler)" : "Fiche d'Inscription (manquante)");
    }
    if (isMinor && m.parentalAuthStatus !== 'valid') {
      missingDocs.push(m.parentalAuthStatus === 'renew' ? "Autorisation Parentale (à renouveler)" : "Autorisation Parentale (manquante)");
    }

    const docListStr = missingDocs.map(d => `• ${d}`).join('\n');

    if (channel === 'email') {
      if (tone === 'friendly') {
        return {
          subject: `📜 Compléter ton dossier chez ${club.name} !`,
          body: `Salut ${m.firstName},\n\nJ'espère que tu as la forme ! 😄\n\nOn a hâte de démarrer les séances avec toi. Pour que ton dossier soit valide auprès de la fédération de ${club.sport}, peux-tu nous faire parvenir au plus vite les pièces suivantes :\n\n${docListStr}\n\nTu peux générer ou téléverser tes documents directement sur ton espace club.\n\nBonne semaine et à très vite sur le terrain ! ⚽\nL'équipe ${club.name}`
        };
      } else if (tone === 'professional') {
        return {
          subject: `Suivi administratif : Documents d'inscription requis - ${club.name}`,
          body: `Bonjour ${m.firstName},\n\nNous vous contactons pour finaliser votre affiliation au club ${club.name} (Sport pratiqué : ${club.sport}) pour la saison en cours.\n\nAprès contrôle de nos bases de données, votre dossier est actuellement répertorié comme incomplet. Les documents administratifs suivants sont obligatoires :\n\n${docListStr}\n\nNous vous remercions de bien vouloir régulariser votre dossier dans les meilleurs délais soit en téléversant les justificatifs signés sur la plateforme, soit en les remettant au bureau.\n\nNous vous souhaitons une excellente saison.\n\nCordialement,\nLe secrétariat de ${club.name}`
        };
      } else {
        return {
          subject: `🔴 RAPPEL URGENT : Inscription incomplète & suspension de licence - ${club.name}`,
          body: `Bonjour ${m.firstName},\n\nSauf erreur de notre part, votre dossier d'adhésion au club ${club.name} est toujours incomplet à ce jour. Les pièces ci-dessous n'ont pas encore été remises ou validées :\n\n${docListStr}\n\nNous vous rappelons que pour des raisons légales et d'assurance réglementaire, la détention de ces justificatifs (notamment le certificat médical à jour) est obligatoire pour participer aux activités, entraînements et compétitions.\n\nSans réception de ces justificatifs sous 48 heures, votre participation aux entraînements sera temporairement suspendue.\n\nMerci de faire le nécessaire d'extrême urgence.\n\nLa direction administrative de ${club.name}`
        };
      }
    } else {
      // SMS Channel
      if (tone === 'friendly') {
        return {
          subject: '',
          body: `Salut ${m.firstName} ! Il te manque juste : ${missingDocs.join(', ')} pour valider ton inscription chez ${club.name}. Télécharge tes formulaires pré-remplis sur l'app ! Merci d'avance 😊`
        };
      } else if (tone === 'professional') {
        return {
          subject: '',
          body: `Bonjour ${m.firstName}, après contrôle de votre dossier ${club.name}, merci de nous transmettre au plus vite : ${missingDocs.join(', ')}. À téléverser sur votre espace ou à remettre à votre coach. Merci.`
        };
      } else {
        return {
          subject: '',
          body: `RAPPEL URGENT ${m.firstName} : Votre dossier ${club.name} est incomplet (${missingDocs.join(', ')}). Sans réception sous 48h, l'accès aux entraînements et matchs sera suspendu pour assurance non-conforme. Merci.`
        };
      }
    }
  };

  const handleCopyReminder = (text: string) => {
    navigator.clipboard.writeText(text);
    setIsReminderCopied(true);
    setTimeout(() => setIsReminderCopied(false), 2000);
  };

  // Step 4 copywriter payment reminders and update helpers
  const getPaymentReminderDraft = (m: Member, tone: 'friendly' | 'professional' | 'urgent', channel: 'email' | 'sms') => {
    const amount = m.membershipAmount || 150;
    if (channel === 'email') {
      if (tone === 'friendly') {
        return {
          subject: `💳 Ta cotisation club chez ${club.name} 😊`,
          body: `Salut ${m.firstName},\n\nJ'espère que tu vas bien et que tu t'éclates aux entraînements ! ⚽\n\nPour finaliser ton inscription et nous aider à financer les équipements de la saison, il ne reste plus qu'à régler ta cotisation de ${amount} ${currencySymbol}.\n\nTu peux effectuer le paiement par carte sur l'app, ou déposer un chèque/espèces auprès de ton coach.\n\nUn grand merci pour ton aide et à très vite sur les terrains !\nL'équipe ${club.name}`
        };
      } else if (tone === 'professional') {
        return {
          subject: `Rappel de règlement : Cotisation annuelle ${club.name}`,
          body: `Bonjour ${m.firstName},\n\nNous vous contactons dans le cadre du suivi administratif de votre adhésion au sein du club ${club.name} pour la saison en cours.\n\nÀ ce jour, le règlement de votre cotisation annuelle d'un montant de ${amount} ${currencySymbol} n'a pas encore été enregistré.\n\nNous vous invitons à régulariser cette situation dans les meilleurs délais soit en effectuant le paiement en ligne depuis votre espace personnel, soit en remettant votre chèque ou règlement en espèces au secrétariat.\n\nNous vous remercions par avance de votre diligence.\n\nCordialement,\nLe trésorier de ${club.name}`
        };
      } else {
        return {
          subject: `🔴 RAPPEL IMPORTANT : Cotisation impayée & suspension de licence - ${club.name}`,
          body: `Bonjour ${m.firstName},\n\nSauf erreur ou omission de notre part, nous n'avons toujours pas reçu le règlement de votre cotisation annuelle de ${amount} ${currencySymbol} pour la saison en cours au club ${club.name}.\n\nPour rappel, le paiement de la cotisation est une condition légale d'obtention et de maintien de votre licence de jeu. Sans régularisation sous 48 heures, nous nous verrons dans l'obligation de suspendre temporairement votre participation aux matchs officiels et entraînements.\n\nMerci de procéder au règlement d'extrême urgence.\n\nLa direction financière de ${club.name}`
        };
      }
    } else {
      // SMS
      if (tone === 'friendly') {
        return {
          subject: '',
          body: `Salut ${m.firstName} ! Pense à régler ta cotisation de ${amount}${currencySymbol} pour finaliser ton inscription chez ${club.name}. Tu peux payer directement en ligne sur l'app ! Merci beaucoup ! 😄`
        };
      } else if (tone === 'professional') {
        return {
          subject: '',
          body: `Bonjour ${m.firstName}, votre cotisation club de ${amount}${currencySymbol} reste à régler. Merci de faire le nécessaire en ligne ou d'apporter votre paiement au bureau du club. Cordialement, le Trésorier ${club.name}.`
        };
      } else {
        return {
          subject: '',
          body: `RAPPEL URGENT ${m.firstName} : Votre cotisation ${club.name} (${amount}${currencySymbol}) est impayée. Sans règlement sous 48h, votre licence sera suspendue et l'accès aux terrains bloqué. Merci de régler d'urgence.`
        };
      }
    }
  };

  const handleCopyPayReminder = (text: string) => {
    navigator.clipboard.writeText(text);
    setIsPayReminderCopied(true);
    setTimeout(() => setIsPayReminderCopied(false), 2000);
  };

  const handleQuickUpdateStep4 = async (memberId: string, updates: Partial<Member>) => {
    setIsUpdatingStep4Id(memberId);
    setError(null);
    try {
      const member = members.find(m => m.id === memberId);
      if (!member) return;
      const updatedMember = { ...member, ...updates };
      const path = `clubs/${club.id}/members/${memberId}`;
      await setDoc(doc(db, 'clubs', club.id, 'members', memberId), sanitizeData(updatedMember)).catch(err => {
        handleFirestoreError(err, OperationType.WRITE, path);
        throw err;
      });
      
      // If marked as paid, write to payments collection to integrate with Finances tab!
      if (updates.membershipPaid === true) {
        const paymentId = `pay_${memberId}_${Date.now()}`;
        const paymentPath = `clubs/${club.id}/payments/${paymentId}`;
        const paymentData = {
          clubId: club.id,
          memberId: memberId,
          amount: updatedMember.membershipAmount || 150,
          status: 'paid' as const,
          paymentMethod: 'cash' as const,
          description: `Règlement Cotisation - ${updatedMember.firstName} ${updatedMember.lastName}`,
          date: new Date().toISOString()
        };
        await setDoc(doc(db, 'clubs', club.id, 'payments', paymentId), paymentData).catch(err => {
          handleFirestoreError(err, OperationType.WRITE, paymentPath);
        });
      }
      
      onRefresh();
    } catch (err: any) {
      setError("Erreur lors de la mise à jour de l'étape 4 : " + err.message);
    } finally {
      setIsUpdatingStep4Id(null);
    }
  };

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

  const exportToCSV = (headers: string[], rows: string[][], filename: string) => {
    const escapeField = (field: any) => {
      if (field === null || field === undefined) return '';
      const stringified = String(field);
      return `"${stringified.replace(/"/g, '""')}"`;
    };

    const csvContent = [
      headers.map(escapeField).join(';'),
      ...rows.map(row => row.map(escapeField).join(';'))
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportMembersCSV = () => {
    const headers = [
      'ID', 'Nom', 'Prénom', 'Rôle', 'Email', 'Téléphone', 'N° Licence', 
      'Date de Naissance', 'Catégorie d\'âge', 'Cotisation Payée', 
      'Montant Cotisation', 'Taille Équipement', 'Certificat Médical', 
      'Fiche d\'Inscription', 'Autorisation Parentale', 'Charte Signée', 'Date d\'Inscription'
    ];

    const rows = members.map(m => [
      m.id,
      m.lastName || '',
      m.firstName || '',
      getRoleDisplay(m.role).label,
      m.email || '',
      m.phone || '',
      m.licenseNumber || '',
      m.birthDate || '',
      getAgeCategory(m.birthDate),
      m.membershipPaid ? 'Oui' : 'Non',
      String(m.membershipAmount || 0),
      m.equipmentSize || '',
      m.medicalCertStatus === 'valid' ? 'Valide' : m.medicalCertStatus === 'renew' ? 'À renouveler' : 'Manquant',
      m.registrationFormStatus === 'valid' ? 'Valide' : m.registrationFormStatus === 'renew' ? 'À renouveler' : 'Manquant',
      m.parentalAuthStatus === 'valid' ? 'Valide' : m.parentalAuthStatus === 'renew' ? 'À renouveler' : 'Manquant',
      m.charterSigned ? 'Oui' : 'Non',
      m.createdAt ? new Date(m.createdAt).toLocaleDateString('fr-FR') : ''
    ]);

    exportToCSV(headers, rows, `membres_${club.name.toLowerCase().replace(/\s+/g, '_')}.csv`);
  };

  const handleExportEventsCSV = () => {
    const headers = [
      'ID', 'Titre', 'Type', 'Date de Début', 'Date de Fin', 'Lieu', 
      'Adversaire', 'Statut Convocations', 'Score Domicile', 'Score Extérieur', 'Détails'
    ];

    const rows = (events || []).map(e => [
      e.id,
      e.title || '',
      e.type === 'match' ? 'Match' : e.type === 'training' ? 'Entraînement' : e.type === 'tournament' ? 'Tournoi' : 'Autre',
      e.start ? new Date(e.start).toLocaleString('fr-FR') : '',
      e.end ? new Date(e.end).toLocaleString('fr-FR') : '',
      e.location || '',
      e.opponent || '',
      e.convocationStatus === 'draft' ? 'Brouillon' : e.convocationStatus === 'sent' ? 'Envoyé' : 'Fermé',
      e.scoreHome !== undefined && e.scoreHome !== null ? String(e.scoreHome) : '',
      e.scoreAway !== undefined && e.scoreAway !== null ? String(e.scoreAway) : '',
      e.details || ''
    ]);

    exportToCSV(headers, rows, `evenements_${club.name.toLowerCase().replace(/\s+/g, '_')}.csv`);
  };

  const handleExportPaymentsCSV = () => {
    const headers = [
      'ID', 'Membre', 'Montant', 'Statut', 'Méthode de Paiement', 'Description', 'Date'
    ];

    const rows = (payments || []).map(p => {
      const m = members.find(member => member.id === p.memberId);
      const memberName = m ? `${m.lastName} ${m.firstName}` : 'Membre inconnu';
      const methodLabel = p.paymentMethod === 'card' ? 'Carte bancaire' 
        : p.paymentMethod === 'cash' ? 'Espèces' 
        : p.paymentMethod === 'check' ? 'Chèque' 
        : p.paymentMethod === 'bank_transfer' ? 'Virement bancaire' 
        : '';

      return [
        p.id,
        memberName,
        String(p.amount),
        p.status === 'paid' ? 'Payé' : p.status === 'pending' ? 'En attente' : 'Échoué',
        methodLabel,
        p.description || '',
        p.date ? new Date(p.date).toLocaleDateString('fr-FR') : ''
      ];
    });

    exportToCSV(headers, rows, `paiements_${club.name.toLowerCase().replace(/\s+/g, '_')}.csv`);
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
  const [role, setRole] = useState<UserRole>('player');
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

  // Step 3 - Electronic Signature states
  const [selectedMemberForSigning, setSelectedMemberForSigning] = useState<Member | null>(null);
  const [signatureMode, setSignatureMode] = useState<'draw' | 'type'>('type');
  const [typedSignature, setTypedSignature] = useState('');
  const [isDrawing, setIsDrawing] = useState(false);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

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
        registrationFormStatus: registrationFormStatus || 'missing',
        parentalAuthStatus: editingMember ? (editingMember.parentalAuthStatus || 'missing') : 'missing',
        medicalCertFile: editingMember ? editingMember.medicalCertFile : undefined,
        registrationFormFile: editingMember ? editingMember.registrationFormFile : undefined,
        parentalAuthFile: editingMember ? editingMember.parentalAuthFile : undefined
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

  const handleDocumentUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    docType: 'medicalCert' | 'registrationForm' | 'parentalAuth'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Strict size constraint: max 400KB to fit easily into Firestore 1MB limit
    if (file.size > 400 * 1024) {
      alert("Le fichier est trop volumineux (max 400 Ko). Veuillez compresser votre document (image ou PDF) avant de le téléverser.");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      if (selectedMemberForDetail) {
        const fileMeta = {
          name: file.name,
          size: file.size,
          base64: base64String,
          uploadedAt: new Date().toISOString()
        };

        const statusField = `${docType}Status` as keyof Member;
        const fileField = `${docType}File` as keyof Member;

        setSelectedMemberForDetail({
          ...selectedMemberForDetail,
          [statusField]: 'valid',
          [fileField]: fileMeta
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDownloadUploadedFile = (fileMeta: { name: string; base64: string }) => {
    try {
      const link = document.createElement('a');
      link.href = fileMeta.base64;
      link.download = fileMeta.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Erreur de téléchargement du document : ", err);
    }
  };

  const handleDeleteUploadedFile = (docType: 'medicalCert' | 'registrationForm' | 'parentalAuth') => {
    if (selectedMemberForDetail) {
      const statusField = `${docType}Status` as keyof Member;
      const fileField = `${docType}File` as keyof Member;

      const updated = { ...selectedMemberForDetail };
      updated[statusField] = 'missing' as any;
      
      // Remove file metadata safely
      if (fileField === 'medicalCertFile') {
        updated.medicalCertFile = undefined;
      } else if (fileField === 'registrationFormFile') {
        updated.registrationFormFile = undefined;
      } else if (fileField === 'parentalAuthFile') {
        updated.parentalAuthFile = undefined;
      }

      setSelectedMemberForDetail(updated);
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

  // Step 3 - Electronic Signature helpers
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.strokeStyle = '#059669'; // Emerald-600
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const rect = canvas.getBoundingClientRect();
    let x, y;
    if ('touches' in e) {
      if (e.touches.length === 0) return;
      x = e.touches[0].clientX - rect.left;
      y = e.touches[0].clientY - rect.top;
    } else {
      x = e.nativeEvent.clientX - rect.left;
      y = e.nativeEvent.clientY - rect.top;
    }

    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    let x, y;
    if ('touches' in e) {
      if (e.touches.length === 0) return;
      x = e.touches[0].clientX - rect.left;
      y = e.touches[0].clientY - rect.top;
    } else {
      x = e.nativeEvent.clientX - rect.left;
      y = e.nativeEvent.clientY - rect.top;
    }

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const generateTypedSignatureImage = (name: string): string => {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 150;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#f8fafc'; // Slate-50 bg
      ctx.fillRect(0, 0, 400, 150);
      
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      ctx.strokeRect(0, 0, 400, 150);

      ctx.font = 'italic bold 28px cursive';
      ctx.fillStyle = '#059669'; // Emerald-600
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(name, 200, 75);
    }
    return canvas.toDataURL('image/png');
  };

  const handleOpenSigningModal = (member: Member) => {
    setSelectedMemberForSigning(member);
    setSignatureMode('type');
    setTypedSignature(`${member.firstName} ${member.lastName}`);
  };

  const handleSaveSignature = async () => {
    if (!selectedMemberForSigning) return;
    
    setIsLoading(true);
    setError(null);
    try {
      let finalBase64 = '';
      if (signatureMode === 'type') {
        if (!typedSignature.trim()) {
          throw new Error("Veuillez saisir votre nom complet pour signer.");
        }
        finalBase64 = generateTypedSignatureImage(typedSignature.trim());
      } else {
        const canvas = canvasRef.current;
        if (!canvas) {
          throw new Error("Le pavé de signature n'est pas disponible.");
        }
        // Check if canvas is empty
        const ctx = canvas.getContext('2d');
        const buffer = new Uint32Array(ctx!.getImageData(0, 0, canvas.width, canvas.height).data.buffer);
        const isEmpty = !buffer.some(color => color !== 0);
        if (isEmpty) {
          throw new Error("Veuillez dessiner votre signature avant de valider.");
        }
        finalBase64 = canvas.toDataURL('image/png');
      }

      const memberRef = doc(db, 'clubs', club.id, 'members', selectedMemberForSigning.id);
      await updateDoc(memberRef, {
        charterSigned: true,
        charterSignedDate: new Date().toISOString(),
        charterSignatureBase64: finalBase64
      });

      setSelectedMemberForSigning(null);
      onRefresh();
    } catch (err: any) {
      setError(err.message || "Erreur lors de la signature.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetSignature = async (memberId: string) => {
    if (!window.confirm("Voulez-vous réinitialiser et supprimer la signature de ce membre ?")) return;

    setIsLoading(true);
    setError(null);
    try {
      const memberRef = doc(db, 'clubs', club.id, 'members', memberId);
      await updateDoc(memberRef, {
        charterSigned: false,
        charterSignedDate: null,
        charterSignatureBase64: null
      });
      onRefresh();
    } catch (err: any) {
      setError("Erreur lors de la réinitialisation: " + err.message);
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

  // Executive overview stats
  const totalPlayers = members.filter(m => m.role === 'player' || m.role === 'adherent').length;
  const totalCoaches = members.filter(m => m.role === 'coach').length;
  const totalAdmins = members.filter(m => ['admin', 'president', 'vice_president_1', 'vice_president_2', 'sec_general', 'tresorier', 'membre_actif'].includes(m.role)).length;

  const complDossiersCount = members.filter(m => {
    const isMinor = m.birthDate ? (new Date().getFullYear() - new Date(m.birthDate).getFullYear() < 18) : false;
    return m.medicalCertStatus === 'valid' && m.registrationFormStatus === 'valid' && (!isMinor || m.parentalAuthStatus === 'valid');
  }).length;
  const adminCompliancePct = members.length > 0 ? Math.round((complDossiersCount / members.length) * 100) : 100;

  const charterSignedCount = members.filter(m => m.charterSigned).length;
  const charterSignedPct = members.length > 0 ? Math.round((charterSignedCount / members.length) * 100) : 100;

  const cotisationsPaidCount = members.filter(m => m.membershipPaid).length;
  const cotisationsPaidPct = members.length > 0 ? Math.round((cotisationsPaidCount / members.length) * 100) : 100;

  return (
    <div id="members-management-section" className="space-y-6">
      {/* Executive KPI Control Center */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 bg-slate-50/50 p-4 rounded-3xl border border-slate-100">
        {/* Card 1: Effectif */}
        <button
          type="button"
          onClick={() => setActiveSubTab('members')}
          className={`bg-white border border-slate-200 hover:border-emerald-500 rounded-2xl p-4 text-left shadow-sm transition hover:shadow-md cursor-pointer group flex flex-col justify-between h-32 ${activeSubTab === 'members' ? 'ring-2 ring-emerald-500/20 border-emerald-500' : ''}`}
        >
          <div className="flex justify-between items-start w-full">
            <div className="w-9 h-9 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
              <Users className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-bold bg-emerald-50 border border-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
              {totalCoaches} Coachs
            </span>
          </div>
          <div className="mt-2">
            <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Effectif Global</h5>
            <p className="text-xl font-black text-slate-850 flex items-baseline gap-1 mt-0.5">
              {members.length} <span className="text-xs font-semibold text-slate-500">Membres</span>
            </p>
            <p className="text-[10px] text-slate-500 font-medium">
              {totalPlayers} joueurs, {totalAdmins} admins
            </p>
          </div>
        </button>

        {/* Card 2: Conformité Dossiers */}
        <button
          type="button"
          onClick={() => setActiveSubTab('dossiers')}
          className={`bg-white border border-slate-200 hover:border-emerald-500 rounded-2xl p-4 text-left shadow-sm transition hover:shadow-md cursor-pointer group flex flex-col justify-between h-32 ${activeSubTab === 'dossiers' ? 'ring-2 ring-emerald-500/20 border-emerald-500' : ''}`}
        >
          <div className="flex justify-between items-start w-full">
            <div className="w-9 h-9 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
              <Clipboard className="w-5 h-5" />
            </div>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${adminCompliancePct === 100 ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-amber-50 border-amber-100 text-amber-700'}`}>
              {adminCompliancePct}% Conforme
            </span>
          </div>
          <div className="mt-2">
            <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Dossiers Inscription</h5>
            <p className="text-xl font-black text-slate-850 flex items-baseline gap-1 mt-0.5">
              {complDossiersCount} <span className="text-xs font-semibold text-slate-500">Complets</span>
            </p>
            <p className="text-[10px] text-slate-500 font-medium">
              Restent {members.length - complDossiersCount} dossiers incomplets
            </p>
          </div>
        </button>

        {/* Card 3: Signatures Chartes */}
        <button
          type="button"
          onClick={() => setActiveSubTab('signatures')}
          className={`bg-white border border-slate-200 hover:border-emerald-500 rounded-2xl p-4 text-left shadow-sm transition hover:shadow-md cursor-pointer group flex flex-col justify-between h-32 ${activeSubTab === 'signatures' ? 'ring-2 ring-emerald-500/20 border-emerald-500' : ''}`}
        >
          <div className="flex justify-between items-start w-full">
            <div className="w-9 h-9 bg-teal-50 text-teal-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-bold bg-teal-50 border border-teal-100 text-teal-700 px-2 py-0.5 rounded-full">
              {charterSignedPct}% Signé
            </span>
          </div>
          <div className="mt-2">
            <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Signature Charte</h5>
            <p className="text-xl font-black text-slate-850 flex items-baseline gap-1 mt-0.5">
              {charterSignedCount} <span className="text-xs font-semibold text-slate-500">Signés</span>
            </p>
            <p className="text-[10px] text-slate-500 font-medium">
              {members.length - charterSignedCount} signatures en attente
            </p>
          </div>
        </button>

        {/* Card 4: Cotisations */}
        <button
          type="button"
          onClick={() => setActiveSubTab('cotisations')}
          className={`bg-white border border-slate-200 hover:border-emerald-500 rounded-2xl p-4 text-left shadow-sm transition hover:shadow-md cursor-pointer group flex flex-col justify-between h-32 ${activeSubTab === 'cotisations' ? 'ring-2 ring-emerald-500/20 border-emerald-500' : ''}`}
        >
          <div className="flex justify-between items-start w-full">
            <div className="w-9 h-9 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
              <CreditCard className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-bold bg-amber-50 border border-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
              {cotisationsPaidPct}% Réglé
            </span>
          </div>
          <div className="mt-2">
            <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cotisations Perçues</h5>
            <p className="text-xl font-black text-slate-850 flex items-baseline gap-1 mt-0.5">
              {cotisationsPaidCount} <span className="text-xs font-semibold text-slate-500">Payés</span>
            </p>
            <p className="text-[10px] text-slate-500 font-medium">
              {members.length - cotisationsPaidCount} cotisations en attente
            </p>
          </div>
        </button>
      </div>

      {/* Tab Selectors */}
      <div className="flex border-b border-slate-200 overflow-x-auto">
        <button
          onClick={() => setActiveSubTab('members')}
          className={`px-3 md:px-5 py-2.5 md:py-3 font-semibold text-xs md:text-sm transition cursor-pointer flex items-center gap-1.5 md:gap-2 whitespace-nowrap shrink-0 ${
            activeSubTab === 'members' ? 'border-b-2 border-emerald-600 text-emerald-700' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Users className="w-3.5 h-3.5 md:w-4 md:h-4" />
          Membres ({members.length})
        </button>
        <button
          onClick={() => setActiveSubTab('teams')}
          className={`px-3 md:px-5 py-2.5 md:py-3 font-semibold text-xs md:text-sm transition cursor-pointer flex items-center gap-1.5 md:gap-2 whitespace-nowrap shrink-0 ${
            activeSubTab === 'teams' ? 'border-b-2 border-emerald-600 text-emerald-700' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Trophy className="w-3.5 h-3.5 md:w-4 md:h-4" />
          Équipes ({teams.length})
        </button>
        <button
          onClick={() => setActiveSubTab('dossiers')}
          className={`px-3 md:px-5 py-2.5 md:py-3 font-semibold text-xs md:text-sm transition cursor-pointer flex items-center gap-1.5 md:gap-2 whitespace-nowrap shrink-0 ${
            activeSubTab === 'dossiers' ? 'border-b-2 border-emerald-600 text-emerald-700' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Clipboard className="w-3.5 h-3.5 md:w-4 md:h-4" />
          Dossiers & Relances
          {members.filter(m => {
            const isMinor = m.birthDate ? (new Date().getFullYear() - new Date(m.birthDate).getFullYear() < 18) : false;
            return m.medicalCertStatus !== 'valid' || m.registrationFormStatus !== 'valid' || (isMinor && m.parentalAuthStatus !== 'valid');
          }).length > 0 && (
            <span className="bg-rose-500 text-white text-[9px] md:text-[10px] font-extrabold px-1.5 py-0.5 rounded-full">
              {members.filter(m => {
                const isMinor = m.birthDate ? (new Date().getFullYear() - new Date(m.birthDate).getFullYear() < 18) : false;
                return m.medicalCertStatus !== 'valid' || m.registrationFormStatus !== 'valid' || (isMinor && m.parentalAuthStatus !== 'valid');
              }).length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveSubTab('signatures')}
          className={`px-3 md:px-5 py-2.5 md:py-3 font-semibold text-xs md:text-sm transition cursor-pointer flex items-center gap-1.5 md:gap-2 whitespace-nowrap shrink-0 ${
            activeSubTab === 'signatures' ? 'border-b-2 border-emerald-600 text-emerald-700' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5 md:w-4 md:h-4" />
          Signatures Chartes
          {members.filter(m => !m.charterSigned).length > 0 && (
            <span className="bg-amber-500 text-white text-[9px] md:text-[10px] font-extrabold px-1.5 py-0.5 rounded-full">
              {members.filter(m => !m.charterSigned).length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveSubTab('cotisations')}
          className={`px-3 md:px-5 py-2.5 md:py-3 font-semibold text-xs md:text-sm transition cursor-pointer flex items-center gap-1.5 md:gap-2 whitespace-nowrap shrink-0 ${
            activeSubTab === 'cotisations' ? 'border-b-2 border-emerald-600 text-emerald-700' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <CreditCard className="w-3.5 h-3.5 md:w-4 md:h-4" />
          Cotisations & Équipements
          {members.filter(m => !m.membershipPaid).length > 0 && (
            <span className="bg-amber-500 text-white text-[9px] md:text-[10px] font-extrabold px-1.5 py-0.5 rounded-full">
              {members.filter(m => !m.membershipPaid).length}
            </span>
          )}
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

            {/* Controls Bar */}
            <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-4">
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
              </div>

              <div className="flex items-center gap-2.5 flex-wrap">
                {/* View Mode Switcher */}
                <div className="flex items-center gap-1 bg-slate-100/80 border border-slate-200 p-1 rounded-xl shrink-0">
                  <button
                    type="button"
                    onClick={() => setViewMode('table')}
                    className={`p-1.5 rounded-lg transition cursor-pointer flex items-center justify-center ${
                      viewMode === 'table' ? 'bg-white text-emerald-600 shadow-sm border border-slate-100' : 'text-slate-400 hover:text-slate-650'
                    }`}
                    title="Vue en table"
                  >
                    <List className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('grid')}
                    className={`p-1.5 rounded-lg transition cursor-pointer flex items-center justify-center ${
                      viewMode === 'grid' ? 'bg-white text-emerald-600 shadow-sm border border-slate-100' : 'text-slate-400 hover:text-slate-650'
                    }`}
                    title="Vue en trombinoscope"
                  >
                    <Grid className="w-4 h-4" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleExportMembersCSV}
                  className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-medium text-sm px-3 py-2.5 rounded-xl shadow-sm flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap"
                  title="Exporter la liste complète des membres en format CSV / Excel"
                >
                  <FileDown className="w-4 h-4 text-emerald-600" />
                  <span>Exporter Membres</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportEventsCSV}
                  className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-medium text-sm px-3 py-2.5 rounded-xl shadow-sm flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap"
                  title="Exporter la liste des événements en format CSV / Excel"
                >
                  <Calendar className="w-4 h-4 text-emerald-600" />
                  <span>Exporter Événements</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportPaymentsCSV}
                  className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-medium text-sm px-3 py-2.5 rounded-xl shadow-sm flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap"
                  title="Exporter tous les règlements en format CSV / Excel"
                >
                  <CreditCard className="w-4 h-4 text-emerald-600" />
                  <span>Exporter Paiements</span>
                </button>

                <button
                  onClick={() => setShowMemberForm(true)}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm px-4 py-2.5 rounded-xl shadow flex items-center justify-center gap-2 transition cursor-pointer whitespace-nowrap"
                >
                  <UserPlus className="w-4 h-4" />
                  Nouveau Membre
                </button>
              </div>
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
                    onChange={(e) => {
                      const newRole = e.target.value as UserRole;
                      setRole(newRole);
                      // Executive members and visitors are exempt from cotisation
                      const isExempt = ['president', 'vice_president_1', 'vice_president_2', 'sec_general', 'tresorier', 'membre_actif', 'visiteur'].includes(newRole);
                      if (isExempt) {
                        setMembershipAmount('0');
                      } else {
                        setMembershipAmount('150');
                      }
                    }}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm bg-white cursor-pointer"
                  >
                    <option value="admin">Administrateur</option>
                    <option value="president">Président de l'association (Exécutif / Exonéré)</option>
                    <option value="vice_president_1">Premier vice président (Exécutif / Exonéré)</option>
                    <option value="vice_president_2">Deuxième vice président (Exécutif / Exonéré)</option>
                    <option value="sec_general">Secrétaire Général (Exécutif / Exonéré)</option>
                    <option value="tresorier">Trésorier (Exécutif / Exonéré)</option>
                    <option value="membre_actif">Membre Actif (Exécutif / Exonéré)</option>
                    <option value="adherent">Adhérent (Cotisation annuelle)</option>
                    <option value="player">Joueur (Cotisation annuelle)</option>
                    <option value="visiteur">Visiteur (Lecture seule, sans adhésion)</option>
                    <option value="coach">Coach / Entraîneur</option>
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
                  <label className="text-xs font-bold text-slate-600 uppercase">Prix de l'adhésion ({currencySymbol})</label>
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

          {/* Members List Table or Trombinoscope Grid */}
          {viewMode === 'table' ? (
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
                            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${getRoleDisplay(m.role).classes}`}>
                              {m.role === 'admin' || ['president', 'vice_president_1', 'vice_president_2', 'sec_general', 'tresorier'].includes(m.role) ? <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" /> : null}
                              {getRoleDisplay(m.role).label}
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
                              <div className="flex items-center gap-1.5">
                                <span className="text-[9px] font-bold text-slate-400 uppercase w-11 shrink-0">Autori. P :</span>
                                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                                  m.parentalAuthStatus === 'valid' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                                  m.parentalAuthStatus === 'renew' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                                  'bg-rose-50 text-rose-700 border-rose-100'
                                }`}>
                                  {m.parentalAuthStatus === 'valid' ? 'Valide' :
                                   m.parentalAuthStatus === 'renew' ? 'À renouveler' : 'Absente'}
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
                                  {m.membershipPaid ? '✓ Payé' : '✗ En attente'} ({m.membershipAmount || 150} {currencySymbol})
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
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {filteredMembers.length === 0 ? (
                <div className="col-span-full py-12 text-center bg-white border border-dashed border-slate-250 rounded-2xl text-slate-400 text-xs">
                  Aucun membre trouvé correspondant à la recherche.
                </div>
              ) : (
                filteredMembers.map(m => {
                  const isMinor = m.birthDate ? (new Date().getFullYear() - new Date(m.birthDate).getFullYear() < 18) : false;
                  const isFileComplete = m.medicalCertStatus === 'valid' && m.registrationFormStatus === 'valid' && (!isMinor || m.parentalAuthStatus === 'valid');
                  return (
                    <div
                      key={m.id}
                      className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition duration-200 hover:-translate-y-0.5 flex flex-col justify-between space-y-4"
                    >
                      {/* Top Row: Role Badge & Admin Status */}
                      <div className="flex justify-between items-center">
                        <span className={`inline-flex items-center gap-1.5 text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider ${getRoleDisplay(m.role).classes}`}>
                          {m.role === 'admin' || ['president', 'vice_president_1', 'vice_president_2', 'sec_general', 'tresorier'].includes(m.role) ? <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" /> : null}
                          {getRoleDisplay(m.role).label}
                        </span>
                        
                        <span className={`w-2.5 h-2.5 rounded-full border ${
                          isFileComplete ? 'bg-emerald-500 border-emerald-250' : 'bg-amber-500 border-amber-250'
                        }`} title={isFileComplete ? 'Dossier Administratif Complet' : 'Dossier Administratif Incomplet'} />
                      </div>

                      {/* Middle: Avatar & Identification */}
                      <div className="flex flex-col items-center text-center space-y-2">
                        <div 
                          onClick={() => setSelectedMemberForDetail(m)}
                          className="cursor-pointer hover:scale-105 transition-transform"
                        >
                          {m.photoUrl && m.photoUrl.length <= 4 ? (
                            <div className="w-16 h-16 bg-emerald-50 border border-emerald-100 rounded-full flex items-center justify-center text-3xl select-none shadow-sm">
                              {m.photoUrl}
                            </div>
                          ) : m.photoUrl ? (
                            <img
                              src={m.photoUrl}
                              alt={`${m.firstName}`}
                              referrerPolicy="no-referrer"
                              className="w-16 h-16 rounded-full object-cover border border-slate-200 shadow-sm"
                            />
                          ) : (
                            <div className="w-16 h-16 bg-emerald-50 text-emerald-700 font-extrabold rounded-full flex items-center justify-center uppercase text-xl border border-emerald-100 shadow-sm">
                              {m.firstName[0] || ''}{m.lastName[0] || ''}
                            </div>
                          )}
                        </div>

                        <div>
                          <h4 
                            onClick={() => setSelectedMemberForDetail(m)}
                            className="font-bold text-slate-800 text-sm hover:text-emerald-700 cursor-pointer transition"
                          >
                            {m.firstName} {m.lastName}
                          </h4>
                          {m.licenseNumber ? (
                            <p className="text-[10px] text-slate-400 font-mono mt-0.5">{m.licenseNumber}</p>
                          ) : (
                            <span className="text-[9px] font-bold text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded mt-1 inline-block">Licence manquante</span>
                          )}
                        </div>
                      </div>

                      {/* Stats/Badges: Age & Cotisation & Size */}
                      <div className="bg-slate-50/80 rounded-xl p-3 text-xs space-y-2 border border-slate-100">
                        <div className="flex justify-between">
                          <span className="text-slate-400 font-semibold">Taille:</span>
                          <span className="font-extrabold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded text-[10px]">
                            {m.equipmentSize || 'Non spécifiée'}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400 font-semibold">Cotisation:</span>
                          <span className={`font-bold px-1.5 py-0.5 rounded text-[10px] ${
                            m.membershipPaid ? 'text-emerald-700 bg-emerald-50' : 'text-amber-700 bg-amber-50'
                          }`}>
                            {m.membershipPaid ? '✓ Payée' : '✗ Attente'} ({m.membershipAmount || 150}{currencySymbol})
                          </span>
                        </div>
                      </div>

                      {/* Admin compliance details summary */}
                      <div className="grid grid-cols-2 gap-1.5 text-[9px] font-bold text-center">
                        <div className={`p-1.5 rounded border ${m.medicalCertStatus === 'valid' ? 'bg-emerald-50/50 border-emerald-100 text-emerald-700' : 'bg-rose-50/50 border-rose-100 text-rose-700'}`}>
                          Certif. Médical
                        </div>
                        <div className={`p-1.5 rounded border ${m.registrationFormStatus === 'valid' ? 'bg-emerald-50/50 border-emerald-100 text-emerald-700' : 'bg-rose-50/50 border-rose-100 text-rose-700'}`}>
                          Fiche Inscr.
                        </div>
                      </div>

                      {/* Bottom Actions */}
                      <div className="flex justify-between items-center pt-3 border-t border-slate-100">
                        <button
                          onClick={() => setSelectedMemberForDetail(m)}
                          className="text-xs font-bold text-slate-500 hover:text-emerald-700 flex items-center gap-1 transition cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Voir la fiche
                        </button>
                        
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleEditMemberClick(m)}
                            className="p-1.5 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-800 transition cursor-pointer"
                            title="Modifier"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteMember(m.id)}
                            className="p-1.5 hover:bg-slate-100 rounded text-slate-400 hover:text-red-600 transition cursor-pointer"
                            title="Supprimer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
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
              
              // Get players matching this team's category
              const teamPlayers = members.filter(m => {
                if (m.role !== 'player') return false;
                const mCategory = getAgeCategory(m.birthDate);
                return mCategory.toLowerCase().startsWith(team.category.toLowerCase()) || 
                       mCategory.toLowerCase().includes(team.category.toLowerCase());
              });

              // Assign border and bg classes based on category
              let categoryColorClass = 'border-l-slate-400 text-slate-600 bg-slate-50';
              if (team.category.includes('U11')) categoryColorClass = 'border-l-emerald-500 text-emerald-700 bg-emerald-50/55';
              else if (team.category.includes('U13')) categoryColorClass = 'border-l-teal-500 text-teal-700 bg-teal-50/55';
              else if (team.category.includes('U15')) categoryColorClass = 'border-l-cyan-500 text-cyan-700 bg-cyan-50/55';
              else if (team.category.includes('U18')) categoryColorClass = 'border-l-blue-500 text-blue-700 bg-blue-50/55';
              else if (team.category.includes('Seniors')) categoryColorClass = 'border-l-indigo-500 text-indigo-700 bg-indigo-50/55';
              else if (team.category.includes('Vétérans')) categoryColorClass = 'border-l-violet-500 text-violet-700 bg-violet-50/55';

              return (
                <div
                  key={team.id}
                  className="bg-white border border-slate-250 border-l-4 rounded-2xl p-5 shadow-sm hover:shadow-md transition duration-200 flex flex-col justify-between space-y-4"
                  style={{ borderLeftColor: 
                    team.category.includes('U11') ? '#10b981' : // emerald-500
                    team.category.includes('U13') ? '#14b8a6' : // teal-500
                    team.category.includes('U15') ? '#06b6d4' : // cyan-500
                    team.category.includes('U18') ? '#3b82f6' : // blue-500
                    team.category.includes('Seniors') ? '#6366f1' : // indigo-500
                    team.category.includes('Vétérans') ? '#8b5cf6' : '#94a3b8' // violet-500 or slate-400
                  }}
                >
                  <div className="space-y-2">
                    <div className="flex justify-between items-start">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border border-slate-100 ${categoryColorClass}`}>
                        {team.category}
                      </span>
                      <button
                        onClick={() => handleDeleteTeam(team.id)}
                        className="w-7 h-7 hover:bg-rose-50 hover:text-rose-600 rounded-full flex items-center justify-center text-slate-300 transition cursor-pointer"
                        title="Supprimer l'équipe"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <h4 className="font-extrabold text-slate-800 text-base tracking-tight">{team.name}</h4>
                  </div>

                  {/* Coach assignment box */}
                  <div className="flex items-center gap-2.5 p-3 bg-slate-50/55 border border-slate-100 rounded-xl">
                    {coach ? (
                      <>
                        {coach.photoUrl && coach.photoUrl.length <= 4 ? (
                          <div className="w-8 h-8 bg-emerald-100 text-emerald-800 font-bold rounded-full flex items-center justify-center text-sm border border-emerald-200">
                            {coach.photoUrl}
                          </div>
                        ) : coach.photoUrl ? (
                          <img
                            src={coach.photoUrl}
                            alt={coach.firstName}
                            referrerPolicy="no-referrer"
                            className="w-8 h-8 rounded-full object-cover border border-slate-200"
                          />
                        ) : (
                          <div className="w-8 h-8 bg-emerald-100 text-emerald-800 font-extrabold rounded-full flex items-center justify-center uppercase text-[10px]">
                            {coach.firstName[0] || ''}{coach.lastName[0] || ''}
                          </div>
                        )}
                        <div className="text-[11px]">
                          <p className="text-slate-400 font-semibold uppercase tracking-wider text-[9px]">Coach Principal</p>
                          <p className="font-bold text-slate-700">{coach.firstName} {coach.lastName}</p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="w-8 h-8 bg-amber-50 text-amber-600 border border-amber-100 rounded-full flex items-center justify-center">
                          <AlertTriangle className="w-4 h-4 animate-pulse" />
                        </div>
                        <div className="text-[11px]">
                          <p className="text-slate-400 font-semibold uppercase tracking-wider text-[9px]">Coach Principal</p>
                          <p className="font-bold text-amber-600">Non assigné</p>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Roster / Players Overlap list */}
                  <div className="space-y-2 pt-1">
                    <div className="flex justify-between items-center text-xs font-semibold">
                      <span className="text-slate-400">Roster effectif :</span>
                      <span className="text-slate-700 font-bold">{teamPlayers.length} joueurs inscrits</span>
                    </div>

                    {teamPlayers.length > 0 ? (
                      <div className="flex items-center gap-1.5">
                        {/* Stacked Avatars */}
                        <div className="flex -space-x-2.5 overflow-hidden">
                          {teamPlayers.slice(0, 5).map((player) => {
                            return (
                              <div
                                key={player.id}
                                className="inline-block shrink-0"
                                title={`${player.firstName} ${player.lastName}`}
                              >
                                {player.photoUrl && player.photoUrl.length <= 4 ? (
                                  <div className="w-7 h-7 bg-white text-emerald-700 rounded-full ring-2 ring-white flex items-center justify-center text-xs font-bold shadow-sm select-none">
                                    {player.photoUrl}
                                  </div>
                                ) : player.photoUrl ? (
                                  <img
                                    src={player.photoUrl}
                                    alt={player.firstName}
                                    referrerPolicy="no-referrer"
                                    className="w-7 h-7 rounded-full object-cover ring-2 ring-white shadow-sm"
                                  />
                                ) : (
                                  <div className="w-7 h-7 bg-slate-100 text-slate-700 rounded-full ring-2 ring-white flex items-center justify-center text-[10px] font-extrabold shadow-sm select-none">
                                    {player.firstName[0] || ''}{player.lastName[0] || ''}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                          
                          {teamPlayers.length > 5 && (
                            <div className="w-7 h-7 bg-slate-100 text-slate-500 rounded-full ring-2 ring-white flex items-center justify-center text-[9px] font-black shadow-sm select-none">
                              +{teamPlayers.length - 5}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <p className="text-[10px] italic text-slate-400">Aucun joueur correspondant détecté</p>
                    )}
                  </div>
                </div>
              );
            })
            )}
          </div>
        </div>
      )}

      {/* DOSSIERS SUB TAB - STEP 1 (COMPLIANCE DASHBOARD & REMINDERS) */}
      {activeSubTab === 'dossiers' && (() => {
        const totalMembers = members.length;
        const minorsCount = members.filter(m => {
          if (!m.birthDate) return false;
          const birth = new Date(m.birthDate);
          if (isNaN(birth.getTime())) return false;
          const age = new Date().getFullYear() - birth.getFullYear();
          return age < 18;
        }).length;

        const validMedicalCert = members.filter(m => m.medicalCertStatus === 'valid').length;
        const validRegistrationForm = members.filter(m => m.registrationFormStatus === 'valid').length;
        const minorsWithValidParentalAuth = members.filter(m => {
          if (!m.birthDate) return false;
          const birth = new Date(m.birthDate);
          if (isNaN(birth.getTime())) return false;
          const age = new Date().getFullYear() - birth.getFullYear();
          return age < 18 && m.parentalAuthStatus === 'valid';
        }).length;

        const totalDocsToVerify = totalMembers * 2 + minorsCount;
        const totalValidDocs = validMedicalCert + validRegistrationForm + minorsWithValidParentalAuth;
        const globalComplianceRate = totalDocsToVerify > 0 ? Math.round((totalValidDocs / totalDocsToVerify) * 100) : 100;

        // Filter members who have at least one missing/renew document
        const membersWithIncompleteDossier = members.filter(m => {
          const isMinor = m.birthDate ? (new Date().getFullYear() - new Date(m.birthDate).getFullYear() < 18) : false;
          
          const isMissingCert = m.medicalCertStatus !== 'valid';
          const isMissingForm = m.registrationFormStatus !== 'valid';
          const isMissingAuth = isMinor && m.parentalAuthStatus !== 'valid';

          if (dossierDocFilter === 'medical') return isMissingCert;
          if (dossierDocFilter === 'registration') return isMissingForm;
          if (dossierDocFilter === 'parental') return isMissingAuth;

          return isMissingCert || isMissingForm || isMissingAuth;
        });

        // Search within incomplete dossiers
        const filteredIncompleteMembers = membersWithIncompleteDossier.filter(m => {
          const fullName = `${m.firstName} ${m.lastName}`.toLowerCase();
          return fullName.includes(searchTerm.toLowerCase()) || 
                 (m.licenseNumber && m.licenseNumber.includes(searchTerm));
        });

        return (
          <div className="space-y-6">
            {/* Dashboard Header & Stats Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              {/* Compliance gauge card */}
              <div className="bg-white border border-slate-200 rounded-3xl p-6 flex flex-col items-center justify-center text-center space-y-4 shadow-sm">
                <h5 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Conformité Globale</h5>
                
                <div className="relative w-32 h-32 flex items-center justify-center">
                  <svg className="w-full h-full -rotate-90">
                    <circle
                      cx="64"
                      cy="64"
                      r="54"
                      className="stroke-slate-100 fill-none"
                      strokeWidth="10"
                    />
                    <circle
                      cx="64"
                      cy="64"
                      r="54"
                      className="stroke-emerald-600 fill-none transition-all duration-500"
                      strokeWidth="10"
                      strokeDasharray={2 * Math.PI * 54}
                      strokeDashoffset={2 * Math.PI * 54 * (1 - globalComplianceRate / 100)}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute text-center">
                    <span className="text-3xl font-extrabold text-slate-800">{globalComplianceRate}%</span>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Valide</p>
                  </div>
                </div>

                <div className="text-xs text-slate-500 font-medium">
                  <strong>{totalValidDocs}</strong> documents conformes sur <strong>{totalDocsToVerify}</strong> requis.
                </div>
              </div>

              {/* Detail cards */}
              <div className="lg:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-6">
                {/* Certificats */}
                <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm flex flex-col justify-between space-y-4">
                  <div className="flex justify-between items-start">
                    <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center">
                      <CheckCircle className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] font-bold bg-slate-50 border border-slate-200 text-slate-600 px-2 py-0.5 rounded-full">
                      Taux: {totalMembers > 0 ? Math.round((validMedicalCert / totalMembers) * 100) : 100}%
                    </span>
                  </div>
                  <div>
                    <h6 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Certificats Médicaux</h6>
                    <p className="text-2xl font-black text-slate-800 mt-1">
                      {validMedicalCert} <span className="text-slate-400 text-sm font-bold">/ {totalMembers}</span>
                    </p>
                    <p className="text-[11px] text-slate-500 font-medium mt-1">
                      {totalMembers - validMedicalCert} dossiers en attente ou invalides.
                    </p>
                  </div>
                </div>

                {/* Fiches d'inscription */}
                <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm flex flex-col justify-between space-y-4">
                  <div className="flex justify-between items-start">
                    <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center">
                      <FileText className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] font-bold bg-slate-50 border border-slate-200 text-slate-600 px-2 py-0.5 rounded-full">
                      Taux: {totalMembers > 0 ? Math.round((validRegistrationForm / totalMembers) * 100) : 100}%
                    </span>
                  </div>
                  <div>
                    <h6 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Fiches d'Inscription</h6>
                    <p className="text-2xl font-black text-slate-800 mt-1">
                      {validRegistrationForm} <span className="text-slate-400 text-sm font-bold">/ {totalMembers}</span>
                    </p>
                    <p className="text-[11px] text-slate-500 font-medium mt-1">
                      {totalMembers - validRegistrationForm} fiches signées manquantes.
                    </p>
                  </div>
                </div>

                {/* Autorisations parentales */}
                <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm flex flex-col justify-between space-y-4">
                  <div className="flex justify-between items-start">
                    <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center">
                      <Award className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] font-bold bg-slate-50 border border-slate-200 text-slate-600 px-2 py-0.5 rounded-full">
                      Taux: {minorsCount > 0 ? Math.round((minorsWithValidParentalAuth / minorsCount) * 100) : 100}%
                    </span>
                  </div>
                  <div>
                    <h6 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Autorisations Parentales</h6>
                    <p className="text-2xl font-black text-slate-800 mt-1">
                      {minorsWithValidParentalAuth} <span className="text-slate-400 text-sm font-bold">/ {minorsCount}</span>
                    </p>
                    <p className="text-[11px] text-slate-500 font-medium mt-1">
                      Requis pour les mineurs ({minorsCount} membres actifs).
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Incomplete Table */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-5">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <h5 className="font-extrabold text-slate-900 text-lg">Dossiers Incomplets & Actions de Relance</h5>
                  <p className="text-xs text-slate-400 font-medium">Détection automatique des dossiers à régulariser ou à renouveler</p>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto shrink-0">
                  <div className="relative flex-1 sm:w-64">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Chercher par nom..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-600 text-xs"
                    />
                  </div>

                  <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-xl text-xs font-bold text-slate-600">
                    <Filter className="w-3.5 h-3.5 text-slate-400" />
                    <select
                      value={dossierDocFilter}
                      onChange={(e) => setDossierDocFilter(e.target.value as any)}
                      className="bg-transparent border-none focus:outline-none"
                    >
                      <option value="all">Tous les documents manquants</option>
                      <option value="medical">Certificat Médical Invalide</option>
                      <option value="registration">Fiche d'Inscription Manquante</option>
                      {minorsCount > 0 && <option value="parental">Autorisation Parentale Manquante</option>}
                    </select>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-slate-100">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      <th className="px-6 py-4">Membre</th>
                      <th className="px-6 py-4 text-center">Certif. Médical</th>
                      <th className="px-6 py-4 text-center">Fiche Inscript.</th>
                      <th className="px-6 py-4 text-center">Autori. Parentale</th>
                      <th className="px-6 py-4 text-right">Actions rapides</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredIncompleteMembers.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-slate-400 font-medium">
                          {searchTerm ? "Aucun dossier ne correspond à votre recherche." : "Félicitations ! Tous les dossiers de ce filtre sont 100% complets ! 🎉"}
                        </td>
                      </tr>
                    ) : (
                      filteredIncompleteMembers.map(m => {
                        const isMinor = m.birthDate ? (new Date().getFullYear() - new Date(m.birthDate).getFullYear() < 18) : false;
                        
                        return (
                          <tr key={m.id} className="hover:bg-slate-50/50 transition">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-700 font-bold flex items-center justify-center uppercase shrink-0">
                                  {m.firstName[0]}{m.lastName[0]}
                                </div>
                                <div>
                                  <span className="font-extrabold text-slate-800 block hover:text-emerald-700 transition cursor-pointer" onClick={() => setSelectedMemberForDetail(m)}>
                                    {m.lastName.toUpperCase()} {m.firstName}
                                  </span>
                                  <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">
                                    {isMinor ? "Mineur" : "Adulte"} • {getAgeCategory(m.birthDate)}
                                  </span>
                                </div>
                              </div>
                            </td>

                            <td className="px-6 py-4 text-center">
                              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                                m.medicalCertStatus === 'valid' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                                m.medicalCertStatus === 'renew' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                                'bg-rose-50 text-rose-700 border-rose-100'
                              }`}>
                                {m.medicalCertStatus === 'valid' ? 'Valide' :
                                 m.medicalCertStatus === 'renew' ? 'À renouveler' : 'Absent'}
                              </span>
                            </td>

                            <td className="px-6 py-4 text-center">
                              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                                m.registrationFormStatus === 'valid' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                                m.registrationFormStatus === 'renew' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                                'bg-rose-50 text-rose-700 border-rose-100'
                              }`}>
                                {m.registrationFormStatus === 'valid' ? 'Valide' :
                                 m.registrationFormStatus === 'renew' ? 'À renouveler' : 'Absente'}
                              </span>
                            </td>

                            <td className="px-6 py-4 text-center">
                              {isMinor ? (
                                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                                  m.parentalAuthStatus === 'valid' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                                  m.parentalAuthStatus === 'renew' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                                  'bg-rose-50 text-rose-700 border-rose-100'
                                }`}>
                                  {m.parentalAuthStatus === 'valid' ? 'Valide' :
                                   m.parentalAuthStatus === 'renew' ? 'À renouveler' : 'Absente'}
                                </span>
                              ) : (
                                <span className="text-[10px] text-slate-300 italic font-medium">N/A (Majeur)</span>
                              )}
                            </td>

                            <td className="px-6 py-4 text-right">
                              <div className="flex justify-end gap-2">
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => generateRegistrationFormPDF(m, club.name, club.sport)}
                                    className="p-1 hover:bg-slate-100 rounded text-slate-600 transition cursor-pointer"
                                    title="Générer Fiche d'inscription PDF pré-remplie"
                                  >
                                    <FileText className="w-4 h-4 text-emerald-600" />
                                  </button>
                                  {isMinor && (
                                    <button
                                      onClick={() => generateParentalAuthPDF(m, club.name)}
                                      className="p-1 hover:bg-slate-100 rounded text-slate-600 transition cursor-pointer"
                                      title="Générer Autorisation parentale PDF pré-remplie"
                                    >
                                      <Award className="w-4 h-4 text-blue-600" />
                                    </button>
                                  )}
                                </div>

                                <button
                                  onClick={() => {
                                    setSelectedMemberForReminder(m);
                                    setReminderTone('friendly');
                                    setReminderChannel('email');
                                  }}
                                  className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold px-2.5 py-1 rounded-lg transition text-[11px] flex items-center gap-1 cursor-pointer"
                                  title="Générer un message de relance"
                                >
                                  <Mail className="w-3.5 h-3.5" />
                                  Relancer
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Step 3 - Signatures Électroniques des Règlements & Chartes */}
      {activeSubTab === 'signatures' && (() => {
        const totalSigned = members.filter(m => m.charterSigned).length;
        const totalUnsigned = members.length - totalSigned;
        const signatureRate = members.length > 0 ? Math.round((totalSigned / members.length) * 100) : 100;

        const filteredSignatureMembers = members.filter(m => {
          const fullName = `${m.firstName} ${m.lastName}`.toLowerCase();
          return fullName.includes(searchTerm.toLowerCase()) || 
                 (m.licenseNumber && m.licenseNumber.includes(searchTerm));
        });

        return (
          <div className="space-y-6">
            {/* Header & Gauge */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="bg-white border border-slate-200 rounded-3xl p-6 flex flex-col items-center justify-center text-center space-y-4 shadow-sm col-span-1">
                <h5 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Taux de Signature Charte</h5>
                
                <div className="relative w-28 h-28 flex items-center justify-center">
                  <svg className="w-full h-full -rotate-90">
                    <circle cx="56" cy="56" r="46" className="stroke-slate-100 fill-none" strokeWidth="8" />
                    <circle
                      cx="56"
                      cy="56"
                      r="46"
                      className="stroke-emerald-600 fill-none transition-all duration-500"
                      strokeWidth="8"
                      strokeDasharray={2 * Math.PI * 46}
                      strokeDashoffset={2 * Math.PI * 46 * (1 - signatureRate / 100)}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute text-center">
                    <span className="text-2xl font-black text-slate-800">{signatureRate}%</span>
                    <p className="text-[9px] font-bold text-slate-400 uppercase">Signé</p>
                  </div>
                </div>

                <div className="text-xs text-slate-500 font-medium">
                  <strong>{totalSigned}</strong> membres ont signé la charte d'éthique.
                </div>
              </div>

              <div className="lg:col-span-2 bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <h4 className="font-bold text-slate-900 text-lg">Charte Éthique & Règlement Intérieur</h4>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Afin d'assurer une pratique sécurisée et d'inculquer les valeurs de fair-play de <strong>{club.name}</strong>, tout licencié doit obligatoirement signer la charte d'éthique du club. 
                  </p>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Cette étape de <strong>Signature Électronique (Étape 3)</strong> permet de générer une attestation de consentement certifiée juridiquement, avec enregistrement d'empreinte d'identité.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100 text-xs">
                  <span className="px-3 py-1 bg-emerald-50 text-emerald-700 font-bold rounded-lg border border-emerald-100 flex items-center gap-1">
                    ✓ Conforme RGPD
                  </span>
                  <span className="px-3 py-1 bg-blue-50 text-blue-700 font-bold rounded-lg border border-blue-100 flex items-center gap-1">
                    ✓ Certificat PDF sécurisé
                  </span>
                  <span className="px-3 py-1 bg-amber-50 text-amber-700 font-bold rounded-lg border border-amber-100 flex items-center gap-1">
                    ✓ Double couche sécurité active
                  </span>
                </div>
              </div>
            </div>

            {/* List of members for signing */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-5">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <h5 className="font-extrabold text-slate-900 text-base">Membres & Statuts de signature</h5>
                  <p className="text-xs text-slate-400 font-medium">Signez ou téléchargez les chartes de déontologie</p>
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Chercher un membre..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-600 text-xs"
                  />
                </div>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-slate-100">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      <th className="px-6 py-4">Membre</th>
                      <th className="px-6 py-4">Rôle</th>
                      <th className="px-6 py-4 text-center">Statut Charte</th>
                      <th className="px-6 py-4 text-center">Date d'engagement</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredSignatureMembers.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-slate-400 font-medium">
                          Aucun membre trouvé.
                        </td>
                      </tr>
                    ) : (
                      filteredSignatureMembers.map(m => (
                        <tr key={m.id} className="hover:bg-slate-50/50 transition">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-700 font-bold flex items-center justify-center uppercase shrink-0">
                                {m.firstName[0]}{m.lastName[0]}
                              </div>
                              <div>
                                <span className="font-extrabold text-slate-800 block">
                                  {m.lastName.toUpperCase()} {m.firstName}
                                </span>
                                <span className="text-[10px] text-slate-400 font-medium">
                                  {m.email}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="font-semibold text-slate-600">
                              {getRoleDisplay(m.role).label}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                              m.charterSigned
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                : 'bg-amber-50 text-amber-700 border-amber-100'
                            }`}>
                              {m.charterSigned ? '✓ Signée' : '⚠ En attente'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-center text-slate-500 font-medium">
                            {m.charterSigned && m.charterSignedDate ? (
                              new Date(m.charterSignedDate).toLocaleDateString('fr-FR')
                            ) : (
                              <span className="text-slate-300 italic">Non signé</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex justify-end gap-2">
                              {m.charterSigned ? (
                                <>
                                  <button
                                    onClick={() => generateCharterSignaturePDF(m, club.name, m.charterSignatureBase64, m.charterSignedDate)}
                                    className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 rounded-lg text-[11px] font-bold transition flex items-center gap-1 cursor-pointer"
                                    title="Télécharger l'attestation signée"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                    Attestation PDF
                                  </button>
                                  <button
                                    onClick={() => handleResetSignature(m.id)}
                                    className="p-1.5 hover:bg-rose-50 rounded text-slate-300 hover:text-red-600 transition cursor-pointer"
                                    title="Supprimer la signature"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={() => handleOpenSigningModal(m)}
                                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-[11px] shadow-sm hover:shadow transition flex items-center gap-1 cursor-pointer"
                                >
                                  <ShieldCheck className="w-3.5 h-3.5" />
                                  Signer la charte
                                </button>
                              )}
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

      {/* Step 4 - Cotisations & Équipements */}
      {activeSubTab === 'cotisations' && (() => {
        const totalPaid = members.filter(m => m.membershipPaid).length;
        const totalPending = members.length - totalPaid;
        const totalAmountCollected = members
          .filter(m => m.membershipPaid)
          .reduce((sum, m) => sum + (m.membershipAmount || 150), 0);
        const totalAmountPending = members
          .filter(m => !m.membershipPaid)
          .reduce((sum, m) => sum + (m.membershipAmount || 150), 0);

        // Size statistics
        const sizeStats = members.reduce((acc, m) => {
          const s = m.equipmentSize || 'Non spécifié';
          acc[s] = (acc[s] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

        // Filter members
        const filteredMembers = members.filter(m => {
          // Name/license Search
          const fullName = `${m.firstName} ${m.lastName}`.toLowerCase();
          const matchesSearch = fullName.includes(searchTerm.toLowerCase()) || 
                 (m.licenseNumber && m.licenseNumber.includes(searchTerm));
                 
          // Payment Filter
          const matchesPayment = paymentStatusFilter === 'all' || 
                 (paymentStatusFilter === 'paid' && m.membershipPaid) ||
                 (paymentStatusFilter === 'pending' && !m.membershipPaid);
                 
          // Size Filter
          const matchesSize = sizeFilter === 'all' || 
                 (sizeFilter === 'unspecified' && !m.equipmentSize) ||
                 m.equipmentSize === sizeFilter;

          return matchesSearch && matchesPayment && matchesSize;
        });

        return (
          <div className="space-y-6">
            {/* Header / Key Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {/* Financial Progress Card */}
              <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm flex flex-col justify-between space-y-4">
                <div className="flex justify-between items-start">
                  <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center">
                    <DollarSign className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-bold bg-emerald-50 border border-emerald-200 text-emerald-700 px-2 py-0.5 rounded-full">
                    {members.length > 0 ? Math.round((totalPaid / members.length) * 100) : 100}% Réglé
                  </span>
                </div>
                <div>
                  <h6 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Trésorerie Cotisations</h6>
                  <p className="text-2xl font-black text-slate-800 mt-1">
                    {totalAmountCollected} {currencySymbol} <span className="text-slate-400 text-xs font-bold">perçus</span>
                  </p>
                  <p className="text-[11px] text-slate-500 font-medium mt-1">
                    En attente : <strong className="text-amber-600">{totalAmountPending} {currencySymbol}</strong> ({totalPending} membres)
                  </p>
                </div>
              </div>

              {/* Members Paid Count Card */}
              <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm flex flex-col justify-between space-y-4">
                <div className="flex justify-between items-start">
                  <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center">
                    <CreditCard className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-bold bg-slate-50 border border-slate-200 text-slate-600 px-2 py-0.5 rounded-full">
                    {totalPaid} / {members.length}
                  </span>
                </div>
                <div>
                  <h6 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Règlements Validés</h6>
                  <p className="text-2xl font-black text-slate-800 mt-1">
                    {totalPaid} <span className="text-slate-400 text-xs font-bold">Membres à jour</span>
                  </p>
                  <p className="text-[11px] text-slate-500 font-medium mt-1">
                    Restent <strong className="text-slate-700">{totalPending}</strong> dossiers financiers à régulariser.
                  </p>
                </div>
              </div>

              {/* Equipment Distribution Stats Card */}
              <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm flex flex-col md:col-span-2 justify-between space-y-4">
                <div className="flex justify-between items-start">
                  <div className="w-10 h-10 bg-teal-50 text-teal-600 rounded-2xl flex items-center justify-center">
                    <Shirt className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-bold bg-slate-50 border border-slate-200 text-slate-600 px-2 py-0.5 rounded-full">
                    Tailles Spécifiées : {members.filter(m => m.equipmentSize).length} / {members.length}
                  </span>
                </div>
                <div>
                  <h6 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Répartition des Tailles d'Équipement</h6>
                  <div className="grid grid-cols-6 gap-2 mt-2">
                    {['XS', 'S', 'M', 'L', 'XL', 'XXL'].map(size => {
                      const count = sizeStats[size] || 0;
                      const pct = members.length > 0 ? Math.round((count / members.length) * 100) : 0;
                      return (
                        <div key={size} className="bg-slate-50 border border-slate-100 rounded-xl p-1.5 text-center">
                          <p className="text-[10px] font-extrabold text-slate-700">{size}</p>
                          <p className="text-sm font-black text-emerald-600 mt-0.5">{count}</p>
                          <p className="text-[8px] text-slate-400 font-medium">{pct}%</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Filters Panel */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                {/* Search Bar */}
                <div className="relative w-64">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Rechercher un membre..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-150 rounded-xl focus:outline-none focus:border-emerald-600 text-xs font-medium focus:bg-white transition"
                  />
                </div>

                {/* Status Filter */}
                <div className="flex items-center gap-1 bg-slate-50 border border-slate-150 p-1 rounded-xl">
                  <button
                    onClick={() => setPaymentStatusFilter('all')}
                    className={`px-3 py-1 text-[11px] font-bold rounded-lg transition cursor-pointer ${
                      paymentStatusFilter === 'all' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Tous les paiements
                  </button>
                  <button
                    onClick={() => setPaymentStatusFilter('paid')}
                    className={`px-3 py-1 text-[11px] font-bold rounded-lg transition cursor-pointer ${
                      paymentStatusFilter === 'paid' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-emerald-700'
                    }`}
                  >
                    Payés ({totalPaid})
                  </button>
                  <button
                    onClick={() => setPaymentStatusFilter('pending')}
                    className={`px-3 py-1 text-[11px] font-bold rounded-lg transition cursor-pointer ${
                      paymentStatusFilter === 'pending' ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-500 hover:text-amber-700'
                    }`}
                  >
                    En attente ({totalPending})
                  </button>
                </div>

                {/* Size Filter */}
                <div className="relative">
                  <select
                    value={sizeFilter}
                    onChange={(e) => setSizeFilter(e.target.value)}
                    className="pl-8 pr-4 py-2 bg-slate-50 border border-slate-150 rounded-xl text-xs font-bold text-slate-600 focus:outline-none focus:border-emerald-600 appearance-none cursor-pointer"
                  >
                    <option value="all">Toutes les tailles</option>
                    <option value="XS">Taille XS</option>
                    <option value="S">Taille S</option>
                    <option value="M">Taille M</option>
                    <option value="L">Taille L</option>
                    <option value="XL">Taille XL</option>
                    <option value="XXL">Taille XXL</option>
                    <option value="unspecified">Taille non renseignée</option>
                  </select>
                  <Filter className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              <div className="text-xs text-slate-400 font-semibold">
                {filteredMembers.length} membres affichés
              </div>
            </div>

            {/* Members Step 4 Tracking Table */}
            <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-slate-400 text-[11px] font-extrabold uppercase tracking-wider">
                      <th className="px-6 py-4">Membre / Licencié</th>
                      <th className="px-6 py-4">Taille Équipement (Pills Interactifs)</th>
                      <th className="px-6 py-4">Montant de Cotisation</th>
                      <th className="px-6 py-4">Statut de Règlement</th>
                      <th className="px-6 py-4 text-right">Relance & Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredMembers.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-slate-400 text-xs">
                          Aucun membre ne correspond à vos critères de recherche ou de filtrage.
                        </td>
                      </tr>
                    ) : (
                      filteredMembers.map(m => (
                        <tr key={m.id} className="hover:bg-slate-50/50 transition animate-none">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              {/* Photo Avatar */}
                              <div>
                                {m.photoUrl && m.photoUrl.length <= 4 ? (
                                  <div className="w-9 h-9 bg-emerald-50 border border-emerald-100 rounded-full flex items-center justify-center text-base select-none">
                                    {m.photoUrl}
                                  </div>
                                ) : m.photoUrl ? (
                                  <img
                                    src={m.photoUrl}
                                    alt={`${m.firstName}`}
                                    referrerPolicy="no-referrer"
                                    className="w-9 h-9 rounded-full object-cover border border-slate-200"
                                  />
                                ) : (
                                  <div className="w-9 h-9 bg-emerald-50 text-emerald-700 font-extrabold rounded-full flex items-center justify-center uppercase text-[11px]">
                                    {m.firstName[0] || ''}{m.lastName[0] || ''}
                                  </div>
                                )}
                              </div>
                              <div>
                                <p className="font-bold text-slate-900 text-sm">{m.firstName} {m.lastName}</p>
                                <p className="text-[10px] font-semibold text-slate-400 flex items-center gap-1 mt-0.5">
                                  <span>{getAgeCategory(m.birthDate)}</span>
                                  {m.licenseNumber && <span>• {m.licenseNumber}</span>}
                                </p>
                              </div>
                            </div>
                          </td>

                          {/* Equipment size interactive pills */}
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-1.5">
                              <div className="flex gap-1 flex-wrap">
                                {['XS', 'S', 'M', 'L', 'XL', 'XXL'].map(size => {
                                  const isSelected = m.equipmentSize === size;
                                  return (
                                    <button
                                      key={size}
                                      onClick={() => handleQuickUpdateStep4(m.id, { equipmentSize: size })}
                                      disabled={isUpdatingStep4Id === m.id}
                                      className={`w-7 h-7 text-[10px] font-extrabold rounded-lg border flex items-center justify-center transition cursor-pointer ${
                                        isSelected
                                          ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm font-black'
                                          : 'bg-white border-slate-250 text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                                      }`}
                                      title={`Attribuer la taille ${size}`}
                                    >
                                      {size}
                                    </button>
                                  );
                                })}
                              </div>
                              {/* Non spécifié / Reset button */}
                              {m.equipmentSize && (
                                <button
                                  onClick={() => handleQuickUpdateStep4(m.id, { equipmentSize: undefined })}
                                  disabled={isUpdatingStep4Id === m.id}
                                  className="text-[10px] font-bold text-slate-400 hover:text-rose-600 px-1 transition cursor-pointer"
                                  title="Réinitialiser la taille"
                                >
                                  Effacer
                                </button>
                              )}
                            </div>
                          </td>

                          {/* Editable Fee Amount */}
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-1.5 max-w-[120px]">
                              <input
                                type="number"
                                value={m.membershipAmount ?? 150}
                                onChange={(e) => {
                                  const val = Number(e.target.value);
                                  handleQuickUpdateStep4(m.id, { membershipAmount: val });
                                }}
                                disabled={isUpdatingStep4Id === m.id}
                                className="w-16 px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 focus:outline-none focus:border-emerald-500 text-center focus:bg-white transition"
                              />
                              <span className="text-xs font-bold text-slate-400">{currencySymbol}</span>
                            </div>
                          </td>

                          {/* Payment status toggle button */}
                          <td className="px-6 py-4">
                            <button
                              onClick={() => handleQuickUpdateStep4(m.id, { membershipPaid: !m.membershipPaid })}
                              disabled={isUpdatingStep4Id === m.id}
                              className={`px-3 py-1.5 rounded-full text-[10px] font-extrabold border transition flex items-center gap-1 cursor-pointer shadow-sm hover:shadow-md ${
                                m.membershipPaid
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700 font-extrabold shadow-sm'
                                  : 'bg-amber-50 border-amber-200 text-amber-700 font-extrabold'
                              }`}
                            >
                              {m.membershipPaid ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-600" />
                                  ✓ Cotisation Payée
                                </>
                              ) : (
                                <>
                                  <X className="w-3 h-3 text-amber-500" />
                                  ✗ En attente de paiement
                                </>
                              )}
                            </button>
                          </td>

                          {/* Actions / Relances */}
                          <td className="px-6 py-4 text-right">
                            <div className="flex justify-end gap-1.5">
                              {!m.membershipPaid ? (
                                <button
                                  onClick={() => setSelectedMemberForPayReminder(m)}
                                  className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-white font-bold rounded-lg text-[10px] flex items-center gap-1 transition cursor-pointer shadow-sm"
                                  title="Générer un message de relance de paiement"
                                >
                                  <Mail className="w-3.5 h-3.5" />
                                  Relancer
                                </button>
                              ) : (
                                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-1 rounded-lg">
                                  Dossier financier clos
                                </span>
                              )}
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
                      <span className={`inline-flex items-center text-xs font-bold px-2 py-0.5 rounded-full ${getRoleDisplay(selectedMemberForDetail.role).classes}`}>
                        {getRoleDisplay(selectedMemberForDetail.role).label}
                      </span>
                    </h4>
                    
                    <p className="text-xs text-slate-500 font-medium">
                      ✉ {selectedMemberForDetail.email} {selectedMemberForDetail.phone && `• 📞 ${selectedMemberForDetail.phone}`}
                    </p>
                    
                    {selectedMemberForDetail.birthDate && (
                      <p className="text-xs text-slate-400 font-semibold">
                        📅 Né le {new Date(selectedMemberForDetail.birthDate).toLocaleDateString('fr-FR')}
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

                  <div className="space-y-4">
                    {/* 1. Certificat Médical */}
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center">
                            <CheckCircle className="w-5 h-5" />
                          </div>
                          <div>
                            <h6 className="font-extrabold text-slate-800 text-sm">Certificat Médical</h6>
                            <p className="text-[10px] text-slate-400">À fournir par votre médecin traitant</p>
                          </div>
                        </div>
                        
                        <span className={`self-start sm:self-auto px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                          selectedMemberForDetail.medicalCertStatus === 'valid' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                          selectedMemberForDetail.medicalCertStatus === 'renew' ? 'bg-amber-100 text-amber-700 border-amber-200 animate-pulse' :
                          'bg-rose-100 text-rose-700 border-rose-200'
                        }`}>
                          {selectedMemberForDetail.medicalCertStatus === 'valid' ? '✓ Valide' :
                           selectedMemberForDetail.medicalCertStatus === 'renew' ? '⚠ À renouveler' : '✗ Absent'}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                        {/* Status Select */}
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Statut du document</span>
                          <div className="grid grid-cols-3 gap-1">
                            {[
                              { key: 'valid', label: 'Valide', color: 'bg-emerald-600 text-white border-emerald-600', inactive: 'bg-white text-slate-600 border-slate-200 hover:bg-emerald-50' },
                              { key: 'renew', label: 'Renouveler', color: 'bg-amber-500 text-white border-amber-500', inactive: 'bg-white text-slate-600 border-slate-200 hover:bg-amber-50' },
                              { key: 'missing', label: 'Absent', color: 'bg-red-600 text-white border-red-600', inactive: 'bg-white text-slate-600 border-slate-200 hover:bg-red-50' },
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

                        {/* File Upload / Download */}
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Fichier numérisé</span>
                          {selectedMemberForDetail.medicalCertFile ? (
                            <div className="bg-white border border-emerald-150 rounded-lg p-2 flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 overflow-hidden">
                                <Paperclip className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                <div className="overflow-hidden">
                                  <p className="text-[11px] font-bold text-slate-700 truncate" title={selectedMemberForDetail.medicalCertFile.name}>
                                    {selectedMemberForDetail.medicalCertFile.name}
                                  </p>
                                  <p className="text-[9px] text-slate-400">
                                    {(selectedMemberForDetail.medicalCertFile.size / 1024).toFixed(1)} Ko
                                  </p>
                                </div>
                              </div>
                              <div className="flex gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleDownloadUploadedFile(selectedMemberForDetail.medicalCertFile!)}
                                  className="p-1 hover:bg-slate-100 rounded text-slate-600 transition cursor-pointer"
                                  title="Télécharger"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteUploadedFile('medicalCert')}
                                  className="p-1 hover:bg-rose-50 rounded text-rose-600 transition cursor-pointer"
                                  title="Supprimer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <label className="border border-dashed border-slate-200 hover:border-emerald-500 rounded-lg p-2 flex items-center justify-center gap-1.5 cursor-pointer transition bg-white text-center">
                              <UploadCloud className="w-4 h-4 text-slate-400" />
                              <span className="text-[11px] font-bold text-slate-600">Téléverser le certificat</span>
                              <input
                                type="file"
                                accept=".pdf,.png,.jpg,.jpeg"
                                onChange={(e) => handleDocumentUpload(e, 'medicalCert')}
                                className="hidden"
                              />
                            </label>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 2. Fiche d'Inscription */}
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center">
                            <FileText className="w-5 h-5" />
                          </div>
                          <div>
                            <h6 className="font-extrabold text-slate-800 text-sm flex items-center gap-1.5">
                              Fiche d'Inscription
                            </h6>
                            <p className="text-[10px] text-slate-400">Formulaire d'adhésion officiel</p>
                          </div>
                        </div>
                        
                        <span className={`self-start sm:self-auto px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                          selectedMemberForDetail.registrationFormStatus === 'valid' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                          selectedMemberForDetail.registrationFormStatus === 'renew' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                          'bg-rose-100 text-rose-700 border-rose-200'
                        }`}>
                          {selectedMemberForDetail.registrationFormStatus === 'valid' ? '✓ Valide' :
                           selectedMemberForDetail.registrationFormStatus === 'renew' ? '⚠ À renouveler' : '✗ Absente'}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                        {/* Status Select & Download template */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Statut du document</span>
                            <button
                              type="button"
                              onClick={() => generateRegistrationFormPDF(selectedMemberForDetail, club.name, club.sport)}
                              className="text-[10px] font-extrabold text-emerald-700 hover:text-emerald-600 flex items-center gap-1 cursor-pointer transition"
                            >
                              <Download className="w-3 h-3" />
                              Modèle PDF pré-rempli
                            </button>
                          </div>
                          <div className="grid grid-cols-3 gap-1">
                            {[
                              { key: 'valid', label: 'Valide', color: 'bg-emerald-600 text-white border-emerald-600', inactive: 'bg-white text-slate-600 border-slate-200 hover:bg-emerald-50' },
                              { key: 'renew', label: 'Renouveler', color: 'bg-amber-500 text-white border-amber-500', inactive: 'bg-white text-slate-600 border-slate-200 hover:bg-amber-50' },
                              { key: 'missing', label: 'Absent', color: 'bg-red-600 text-white border-red-600', inactive: 'bg-white text-slate-600 border-slate-200 hover:bg-red-50' },
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

                        {/* File Upload / Download */}
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Fichier signé</span>
                          {selectedMemberForDetail.registrationFormFile ? (
                            <div className="bg-white border border-emerald-150 rounded-lg p-2 flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 overflow-hidden">
                                <Paperclip className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                <div className="overflow-hidden">
                                  <p className="text-[11px] font-bold text-slate-700 truncate" title={selectedMemberForDetail.registrationFormFile.name}>
                                    {selectedMemberForDetail.registrationFormFile.name}
                                  </p>
                                  <p className="text-[9px] text-slate-400">
                                    {(selectedMemberForDetail.registrationFormFile.size / 1024).toFixed(1)} Ko
                                  </p>
                                </div>
                              </div>
                              <div className="flex gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleDownloadUploadedFile(selectedMemberForDetail.registrationFormFile!)}
                                  className="p-1 hover:bg-slate-100 rounded text-slate-600 transition cursor-pointer"
                                  title="Télécharger"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteUploadedFile('registrationForm')}
                                  className="p-1 hover:bg-rose-50 rounded text-rose-600 transition cursor-pointer"
                                  title="Supprimer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <label className="border border-dashed border-slate-200 hover:border-emerald-500 rounded-lg p-2 flex items-center justify-center gap-1.5 cursor-pointer transition bg-white text-center">
                              <UploadCloud className="w-4 h-4 text-slate-400" />
                              <span className="text-[11px] font-bold text-slate-600">Téléverser la fiche signée</span>
                              <input
                                type="file"
                                accept=".pdf,.png,.jpg,.jpeg"
                                onChange={(e) => handleDocumentUpload(e, 'registrationForm')}
                                className="hidden"
                              />
                            </label>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 3. Autorisation Parentale */}
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center">
                            <Award className="w-5 h-5" />
                          </div>
                          <div>
                            <h6 className="font-extrabold text-slate-800 text-sm">Autorisation Parentale</h6>
                            <p className="text-[10px] text-slate-400">Requis pour les membres mineurs</p>
                          </div>
                        </div>
                        
                        <span className={`self-start sm:self-auto px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                          (selectedMemberForDetail.parentalAuthStatus || 'missing') === 'valid' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                          (selectedMemberForDetail.parentalAuthStatus || 'missing') === 'renew' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                          'bg-rose-100 text-rose-700 border-rose-200'
                        }`}>
                          {(selectedMemberForDetail.parentalAuthStatus || 'missing') === 'valid' ? '✓ Valide' :
                           (selectedMemberForDetail.parentalAuthStatus || 'missing') === 'renew' ? '⚠ À renouveler' : '✗ Absente'}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                        {/* Status Select & Download template */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Statut du document</span>
                            <button
                              type="button"
                              onClick={() => generateParentalAuthPDF(selectedMemberForDetail, club.name)}
                              className="text-[10px] font-extrabold text-emerald-700 hover:text-emerald-600 flex items-center gap-1 cursor-pointer transition"
                            >
                              <Download className="w-3 h-3" />
                              Modèle PDF pré-rempli
                            </button>
                          </div>
                          <div className="grid grid-cols-3 gap-1">
                            {[
                              { key: 'valid', label: 'Valide', color: 'bg-emerald-600 text-white border-emerald-600', inactive: 'bg-white text-slate-600 border-slate-200 hover:bg-emerald-50' },
                              { key: 'renew', label: 'Renouveler', color: 'bg-amber-500 text-white border-amber-500', inactive: 'bg-white text-slate-600 border-slate-200 hover:bg-amber-50' },
                              { key: 'missing', label: 'Absent', color: 'bg-red-600 text-white border-red-600', inactive: 'bg-white text-slate-600 border-slate-200 hover:bg-red-50' },
                            ].map(opt => (
                              <button
                                key={opt.key}
                                type="button"
                                onClick={() => setSelectedMemberForDetail({
                                  ...selectedMemberForDetail,
                                  parentalAuthStatus: opt.key as any
                                })}
                                className={`py-1.5 rounded-lg text-[11px] font-bold border text-center transition cursor-pointer ${
                                  (selectedMemberForDetail.parentalAuthStatus || 'missing') === opt.key ? opt.color : opt.inactive
                                }`}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* File Upload / Download */}
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Fichier signé</span>
                          {selectedMemberForDetail.parentalAuthFile ? (
                            <div className="bg-white border border-emerald-150 rounded-lg p-2 flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 overflow-hidden">
                                <Paperclip className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                <div className="overflow-hidden">
                                  <p className="text-[11px] font-bold text-slate-700 truncate" title={selectedMemberForDetail.parentalAuthFile.name}>
                                    {selectedMemberForDetail.parentalAuthFile.name}
                                  </p>
                                  <p className="text-[9px] text-slate-400">
                                    {(selectedMemberForDetail.parentalAuthFile.size / 1024).toFixed(1)} Ko
                                  </p>
                                </div>
                              </div>
                              <div className="flex gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleDownloadUploadedFile(selectedMemberForDetail.parentalAuthFile!)}
                                  className="p-1 hover:bg-slate-100 rounded text-slate-600 transition cursor-pointer"
                                  title="Télécharger"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteUploadedFile('parentalAuth')}
                                  className="p-1 hover:bg-rose-50 rounded text-rose-600 transition cursor-pointer"
                                  title="Supprimer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <label className="border border-dashed border-slate-200 hover:border-emerald-500 rounded-lg p-2 flex items-center justify-center gap-1.5 cursor-pointer transition bg-white text-center">
                              <UploadCloud className="w-4 h-4 text-slate-400" />
                              <span className="text-[11px] font-bold text-slate-600">Téléverser l'autorisation signée</span>
                              <input
                                type="file"
                                accept=".pdf,.png,.jpg,.jpeg"
                                onChange={(e) => handleDocumentUpload(e, 'parentalAuth')}
                                className="hidden"
                              />
                            </label>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Cotisation Info Block */}
                <div className="border border-slate-150 rounded-xl p-4 flex justify-between items-center bg-slate-50">
                  <div className="space-y-0.5">
                    <p className="text-xs font-bold text-slate-500 uppercase">Statut Cotisation Club</p>
                    <p className="text-sm font-bold text-slate-800">
                      Montant de l'adhésion : {selectedMemberForDetail.membershipAmount || 150} {currencySymbol}
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

      {/* Step 1 - Automated Intelligent Relance Modal */}
      <AnimatePresence>
        {selectedMemberForReminder && (() => {
          const m = selectedMemberForReminder;
          const draft = getDraftMessage(m, reminderTone, reminderChannel);
          
          return (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 15 }}
                className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-xl w-full overflow-hidden flex flex-col max-h-[90vh]"
              >
                {/* Modal Header */}
                <div className="bg-slate-50 border-b border-slate-100 px-6 py-5 flex justify-between items-center">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center">
                      <Mail className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-extrabold text-slate-900 text-base">Régularisation de Dossier</h3>
                      <p className="text-[11px] text-slate-400 font-medium">Assistant de rédaction de relance pour {m.firstName} {m.lastName}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedMemberForReminder(null)}
                    className="w-8 h-8 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-600 flex items-center justify-center transition cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Modal Body */}
                <div className="p-6 space-y-5 overflow-y-auto">
                  
                  {/* Selector for Channel (Email vs SMS) */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Canal de diffusion</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setReminderChannel('email')}
                        className={`py-2 px-4 rounded-xl font-bold text-xs border flex items-center justify-center gap-2 transition cursor-pointer ${
                          reminderChannel === 'email'
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                            : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-600'
                        }`}
                      >
                        <Mail className="w-4 h-4" />
                        Relance Email
                      </button>
                      <button
                        onClick={() => setReminderChannel('sms')}
                        className={`py-2 px-4 rounded-xl font-bold text-xs border flex items-center justify-center gap-2 transition cursor-pointer ${
                          reminderChannel === 'sms'
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                            : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-600'
                        }`}
                      >
                        <Phone className="w-4 h-4" />
                        Relance SMS
                      </button>
                    </div>
                  </div>

                  {/* Selector for Tone (Amical vs Pro vs Urgent) */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Ton du Message (Assistant IA)</label>
                    <div className="grid grid-cols-3 gap-2 bg-slate-50 p-1 rounded-xl border border-slate-200">
                      <button
                        onClick={() => setReminderTone('friendly')}
                        className={`py-1.5 px-3 rounded-lg font-bold text-[10px] uppercase tracking-wide flex items-center justify-center gap-1 transition cursor-pointer ${
                          reminderTone === 'friendly'
                            ? 'bg-white text-emerald-700 shadow-sm font-extrabold'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        😊 Amical
                      </button>
                      <button
                        onClick={() => setReminderTone('professional')}
                        className={`py-1.5 px-3 rounded-lg font-bold text-[10px] uppercase tracking-wide flex items-center justify-center gap-1 transition cursor-pointer ${
                          reminderTone === 'professional'
                            ? 'bg-white text-emerald-700 shadow-sm font-extrabold'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        💼 Professionnel
                      </button>
                      <button
                        onClick={() => setReminderTone('urgent')}
                        className={`py-1.5 px-3 rounded-lg font-bold text-[10px] uppercase tracking-wide flex items-center justify-center gap-1 transition cursor-pointer ${
                          reminderTone === 'urgent'
                            ? 'bg-white text-rose-700 shadow-sm font-extrabold'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        🔴 Urgent / Ferme
                      </button>
                    </div>
                  </div>

                  {/* Draft Preview Block */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Aperçu de la relance</label>
                      <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                        Prêt à envoyer
                      </span>
                    </div>

                    <div className="bg-slate-900 text-slate-100 rounded-2xl p-4 font-mono text-xs space-y-3 shadow-inner border border-slate-800">
                      {reminderChannel === 'email' && (
                        <div className="border-b border-slate-800 pb-2 mb-2">
                          <span className="text-slate-500">Sujet:</span> <span className="text-teal-400 font-extrabold">{draft.subject}</span>
                        </div>
                      )}
                      <div className="whitespace-pre-wrap leading-relaxed text-slate-200">
                        {draft.body}
                      </div>
                    </div>
                  </div>

                </div>

                {/* Modal Footer */}
                <div className="bg-slate-50 border-t border-slate-100 px-6 py-4 flex justify-between items-center shrink-0">
                  <span className="text-[10px] text-slate-400 font-medium">
                    {reminderChannel === 'email' ? '📧 Email pré-rédigé' : '📱 SMS de rappel'}
                  </span>
                  
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedMemberForReminder(null)}
                      className="px-4 py-2 border border-slate-200 rounded-xl text-slate-600 text-xs font-bold hover:bg-slate-100 transition cursor-pointer"
                    >
                      Annuler
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => handleCopyReminder(reminderChannel === 'email' ? `Sujet: ${draft.subject}\n\n${draft.body}` : draft.body)}
                      className={`px-5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-md ${
                        isReminderCopied 
                          ? 'bg-emerald-600 text-white' 
                          : 'bg-slate-800 hover:bg-slate-700 text-white'
                      }`}
                    >
                      {isReminderCopied ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          Copier avec succès !
                        </>
                      ) : (
                        <>
                          <Clipboard className="w-3.5 h-3.5" />
                          Copier le texte
                        </>
                      )}
                    </button>
                  </div>
                </div>

              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>

      {/* Step 3 - Interactive Signature Pad Modal */}
      <AnimatePresence>
        {selectedMemberForSigning && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Modal Header */}
              <div className="bg-slate-50 border-b border-slate-100 px-6 py-5 flex justify-between items-center">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-slate-900 text-base">Signature de la Charte Club</h3>
                    <p className="text-[11px] text-slate-400 font-medium">{selectedMemberForSigning.firstName} {selectedMemberForSigning.lastName}</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedMemberForSigning(null)}
                  className="w-8 h-8 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-600 flex items-center justify-center transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-4 overflow-y-auto">
                {/* Charter Text Snippet */}
                <div className="bg-slate-50 border border-slate-150 rounded-2xl p-4 space-y-2.5">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider border-b border-slate-200 pb-1.5">
                    Charte de Fair-Play & Engagement Sportif
                  </h4>
                  <div className="text-[11px] text-slate-500 space-y-2 max-h-40 overflow-y-auto pr-1">
                    <p>
                      <strong>Article 1 : Respect & Déontologie</strong><br />
                      Je m'engage à respecter les arbitres, les adversaires, mes coéquipiers, ainsi que l'ensemble du staff technique et les décisions de mon club.
                    </p>
                    <p>
                      <strong>Article 2 : Assiduité & Ponctualité</strong><br />
                      Je m'efforcerai d'être ponctuel aux entraînements ainsi qu'aux convocations de matches, et de prévenir à l'avance en cas d'empêchement justifié.
                    </p>
                    <p>
                      <strong>Article 3 : Fair-play absolu</strong><br />
                      Je proscris tout comportement violent, haineux ou antisportif, tant sur le terrain que dans les tribunes ou sur les réseaux sociaux.
                    </p>
                    <p>
                      <strong>Article 4 : Respect du Matériel</strong><br />
                      Je prendrai soin des équipements, maillots et installations mis à ma disposition par {club.name}.
                    </p>
                  </div>
                </div>

                {/* Signature Mode Selector */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Méthode de Signature</label>
                  <div className="grid grid-cols-2 gap-2 bg-slate-50 p-1 rounded-xl border border-slate-150">
                    <button
                      type="button"
                      onClick={() => setSignatureMode('type')}
                      className={`py-1.5 rounded-lg text-xs font-bold transition cursor-pointer text-center ${
                        signatureMode === 'type' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      Saisie clavier
                    </button>
                    <button
                      type="button"
                      onClick={() => setSignatureMode('draw')}
                      className={`py-1.5 rounded-lg text-xs font-bold transition cursor-pointer text-center ${
                        signatureMode === 'draw' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      Dessiner tactile
                    </button>
                  </div>
                </div>

                {/* Signature Area */}
                <div className="space-y-2">
                  {signatureMode === 'type' ? (
                    <div className="space-y-3 bg-slate-50 border border-slate-200 rounded-2xl p-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Votre nom complet</label>
                        <input
                          type="text"
                          value={typedSignature}
                          onChange={(e) => setTypedSignature(e.target.value)}
                          placeholder="Nom de signature..."
                          className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-emerald-600 font-medium"
                        />
                      </div>
                      
                      {/* Live preview */}
                      <div className="border border-dashed border-slate-200 bg-white rounded-xl h-24 flex flex-col items-center justify-center relative overflow-hidden">
                        <span className="absolute top-1.5 left-2 text-[9px] font-bold text-slate-300 uppercase tracking-wider">Aperçu Signature</span>
                        <p className="font-serif italic text-2xl font-semibold text-emerald-600 font-[cursive]">
                          {typedSignature || "Veuillez taper votre nom"}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2 bg-slate-50 border border-slate-200 rounded-2xl p-4">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Dessinez ci-dessous</span>
                        <button
                          type="button"
                          onClick={clearCanvas}
                          className="text-[10px] font-bold text-emerald-700 hover:text-emerald-600 cursor-pointer"
                        >
                          Effacer le dessin
                        </button>
                      </div>
                      <div className="border border-dashed border-slate-200 bg-white rounded-xl overflow-hidden h-28 flex items-center justify-center">
                        <canvas
                          ref={canvasRef}
                          width={400}
                          height={110}
                          onMouseDown={startDrawing}
                          onMouseMove={draw}
                          onMouseUp={stopDrawing}
                          onMouseLeave={stopDrawing}
                          onTouchStart={startDrawing}
                          onTouchMove={draw}
                          onTouchEnd={stopDrawing}
                          className="w-full h-full cursor-crosshair"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Consent checkbox */}
                <label className="flex items-start gap-2.5 p-1 cursor-pointer">
                  <input
                    type="checkbox"
                    required
                    className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5"
                  />
                  <span className="text-[11px] text-slate-500 font-medium leading-normal select-none">
                    J'atteste avoir lu et m'engage à respecter scrupuleusement la charte éthique de mon club pour la saison en cours.
                  </span>
                </label>
              </div>

              {/* Modal Footer */}
              <div className="bg-slate-50 border-t border-slate-100 px-6 py-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedMemberForSigning(null)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-slate-600 text-xs font-bold hover:bg-slate-100 transition cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={handleSaveSignature}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-md"
                >
                  {isLoading && <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
                  Valider ma signature
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Step 4 - Assistant de Rédac Relance de Paiement Modal */}
      <AnimatePresence>
        {selectedMemberForPayReminder && (() => {
          const m = selectedMemberForPayReminder;
          const draft = getPaymentReminderDraft(m, payReminderTone, payReminderChannel);
          return (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 15 }}
                className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]"
              >
                {/* Modal Header */}
                <div className="bg-slate-50 border-b border-slate-100 px-6 py-5 flex justify-between items-center">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 bg-amber-50 text-amber-600 rounded-lg flex items-center justify-center">
                      <CreditCard className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-extrabold text-slate-900 text-base">Relance Cotisation Impayée</h3>
                      <p className="text-[11px] text-slate-400 font-medium">Assistant de rédaction de relance pour {m.firstName} {m.lastName}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedMemberForPayReminder(null)}
                    className="w-8 h-8 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-600 flex items-center justify-center transition cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Modal Body */}
                <div className="p-6 space-y-5 overflow-y-auto">
                  
                  {/* Selector for Channel (Email vs SMS) */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Canal de diffusion</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setPayReminderChannel('email')}
                        className={`py-2 px-4 rounded-xl font-bold text-xs border flex items-center justify-center gap-2 transition cursor-pointer ${
                          payReminderChannel === 'email'
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                            : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-600'
                        }`}
                      >
                        <Mail className="w-4 h-4" />
                        Relance Email
                      </button>
                      <button
                        type="button"
                        onClick={() => setPayReminderChannel('sms')}
                        className={`py-2 px-4 rounded-xl font-bold text-xs border flex items-center justify-center gap-2 transition cursor-pointer ${
                          payReminderChannel === 'sms'
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                            : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-600'
                        }`}
                      >
                        <Phone className="w-4 h-4" />
                        Relance SMS
                      </button>
                    </div>
                  </div>

                  {/* Selector for Tone (Amical vs Pro vs Urgent) */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Ton du Message (Assistant IA)</label>
                    <div className="grid grid-cols-3 gap-2 bg-slate-50 p-1 rounded-xl border border-slate-200">
                      <button
                        type="button"
                        onClick={() => setPayReminderTone('friendly')}
                        className={`py-1.5 px-3 rounded-lg font-bold text-[10px] uppercase tracking-wide flex items-center justify-center gap-1 transition cursor-pointer ${
                          payReminderTone === 'friendly'
                            ? 'bg-white text-emerald-700 shadow-sm font-extrabold'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        😊 Amical
                      </button>
                      <button
                        type="button"
                        onClick={() => setPayReminderTone('professional')}
                        className={`py-1.5 px-3 rounded-lg font-bold text-[10px] uppercase tracking-wide flex items-center justify-center gap-1 transition cursor-pointer ${
                          payReminderTone === 'professional'
                            ? 'bg-white text-emerald-700 shadow-sm font-extrabold'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        💼 Professionnel
                      </button>
                      <button
                        type="button"
                        onClick={() => setPayReminderTone('urgent')}
                        className={`py-1.5 px-3 rounded-lg font-bold text-[10px] uppercase tracking-wide flex items-center justify-center gap-1 transition cursor-pointer ${
                          payReminderTone === 'urgent'
                            ? 'bg-white text-rose-700 shadow-sm font-extrabold'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        🔴 Urgent / Ferme
                      </button>
                    </div>
                  </div>

                  {/* Draft Preview Block */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Aperçu de la relance</label>
                      <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                        Prêt à envoyer
                      </span>
                    </div>

                    <div className="bg-slate-900 text-slate-100 rounded-2xl p-4 font-mono text-xs space-y-3 shadow-inner border border-slate-800">
                      {payReminderChannel === 'email' && (
                        <div className="border-b border-slate-800 pb-2 mb-2">
                          <span className="text-slate-500">Sujet:</span> <span className="text-teal-400 font-extrabold">{draft.subject}</span>
                        </div>
                      )}
                      <div className="whitespace-pre-wrap leading-relaxed text-slate-200">
                        {draft.body}
                      </div>
                    </div>
                  </div>

                </div>

                {/* Modal Footer */}
                <div className="bg-slate-50 border-t border-slate-100 px-6 py-4 flex justify-between items-center shrink-0">
                  <span className="text-[10px] text-slate-400 font-medium">
                    {payReminderChannel === 'email' ? '📧 Email pré-rédigé' : '📱 SMS de rappel'}
                  </span>
                  
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedMemberForPayReminder(null)}
                      className="px-4 py-2 border border-slate-200 rounded-xl text-slate-600 text-xs font-bold hover:bg-slate-100 transition cursor-pointer"
                    >
                      Annuler
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => handleCopyPayReminder(payReminderChannel === 'email' ? `Sujet: ${draft.subject}\n\n${draft.body}` : draft.body)}
                      className={`px-5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-md ${
                        isPayReminderCopied 
                          ? 'bg-emerald-600 text-white' 
                          : 'bg-slate-800 hover:bg-slate-700 text-white'
                      }`}
                    >
                      {isPayReminderCopied ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          Copier avec succès !
                        </>
                      ) : (
                        <>
                          <Clipboard className="w-3.5 h-3.5" />
                          Copier le texte
                        </>
                      )}
                    </button>
                  </div>
                </div>

              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
}
