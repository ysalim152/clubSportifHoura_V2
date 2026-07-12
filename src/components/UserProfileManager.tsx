import React, { useState, useEffect, useRef } from 'react';
import { 
  User, Shield, Mail, Phone, Calendar, MapPin, Shirt, Award, CreditCard,
  FileText, ShieldCheck, Check, AlertCircle, RefreshCw, UploadCloud,
  Download, Sparkles, Key, PenTool, CheckCircle, Trash2, Camera, Map, HelpCircle
} from 'lucide-react';
import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, sanitizeData } from '../firebase';
import { Club, Member } from '../types';
import { User as AuthUser } from 'firebase/auth';
import { generateRegistrationFormPDF, generateParentalAuthPDF, generateCharterSignaturePDF } from '../utils/pdfGenerator';

interface UserProfileManagerProps {
  club: Club;
  currentUser: AuthUser;
  userProfile: any;
  onOpenMfaSettings: () => void;
  onRefreshClubData?: () => void;
  currencySymbol?: string;
}

export default function UserProfileManager({ 
  club, currentUser, userProfile, onOpenMfaSettings, onRefreshClubData, currencySymbol = '€'
}: UserProfileManagerProps) {
  
  const [member, setMember] = useState<Member | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Forms states
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [address, setAddress] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [equipmentSize, setEquipmentSize] = useState('M');
  const [preferredPosition, setPreferredPosition] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  
  // Charter signature state
  const [charterAccept, setCharterAccept] = useState(false);
  const [signatureText, setSignatureText] = useState('');
  const [isSigning, setIsSigning] = useState(false);

  // Success / Error messages
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Load member details
  useEffect(() => {
    fetchProfileAndMember();
  }, [club.id, currentUser.uid]);

  const fetchProfileAndMember = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const memberDocRef = doc(db, 'clubs', club.id, 'members', currentUser.uid);
      
      // Look for duplicate/old member documents with the current user's email address in the club
      const emailLower = currentUser.email?.toLowerCase().trim() || '';
      let oldMemberDocs: Member[] = [];
      
      if (emailLower) {
        try {
          const q = query(collection(db, 'clubs', club.id, 'members'), where('email', '==', emailLower));
          const querySnap = await getDocs(q);
          oldMemberDocs = querySnap.docs
            .filter(d => d.id !== currentUser.uid)
            .map(d => ({ id: d.id, ...d.data() } as Member));
        } catch (e) {
          console.error("Error searching duplicate member documents: ", e);
        }
      }

      const memberSnap = await getDoc(memberDocRef).catch(err => {
        handleFirestoreError(err, OperationType.GET, `clubs/${club.id}/members/${currentUser.uid}`);
        throw err;
      });

      let currentMemberData = memberSnap.exists() ? (memberSnap.data() as Member) : null;

      // If duplicate/older member documents created by an admin are found, merge and migrate them
      if (oldMemberDocs.length > 0) {
        const oldMember = oldMemberDocs[0];
        
        const mergedMember: Member = {
          id: currentUser.uid,
          clubId: club.id,
          firstName: currentMemberData?.firstName || oldMember.firstName || '',
          lastName: currentMemberData?.lastName || oldMember.lastName || '',
          role: oldMember.role || currentMemberData?.role || 'player',
          email: currentUser.email || currentMemberData?.email || oldMember.email || '',
          phone: currentMemberData?.phone || oldMember.phone || '',
          licenseNumber: currentMemberData?.licenseNumber || oldMember.licenseNumber || '',
          birthDate: currentMemberData?.birthDate || oldMember.birthDate || '',
          membershipAmount: currentMemberData?.membershipAmount !== undefined ? currentMemberData.membershipAmount : (oldMember.membershipAmount !== undefined ? oldMember.membershipAmount : 0),
          membershipPaid: currentMemberData?.membershipPaid || oldMember.membershipPaid || false,
          createdAt: oldMember.createdAt || currentMemberData?.createdAt || new Date().toISOString(),
          photoUrl: currentMemberData?.photoUrl || oldMember.photoUrl || '',
          equipmentSize: currentMemberData?.equipmentSize || oldMember.equipmentSize || 'M',
          
          // Documents
          medicalCertStatus: currentMemberData?.medicalCertStatus !== 'missing' && currentMemberData?.medicalCertStatus ? currentMemberData.medicalCertStatus : (oldMember.medicalCertStatus || 'missing'),
          medicalCertFile: currentMemberData?.medicalCertFile || oldMember.medicalCertFile || undefined,
          registrationFormStatus: currentMemberData?.registrationFormStatus !== 'missing' && currentMemberData?.registrationFormStatus ? currentMemberData.registrationFormStatus : (oldMember.registrationFormStatus || 'missing'),
          registrationFormFile: currentMemberData?.registrationFormFile || oldMember.registrationFormFile || undefined,
          parentalAuthStatus: currentMemberData?.parentalAuthStatus !== 'missing' && currentMemberData?.parentalAuthStatus ? currentMemberData.parentalAuthStatus : (oldMember.parentalAuthStatus || 'missing'),
          parentalAuthFile: currentMemberData?.parentalAuthFile || oldMember.parentalAuthFile || undefined,
          
          // Charter signature
          charterSigned: currentMemberData?.charterSigned || oldMember.charterSigned || false,
          charterSignedDate: currentMemberData?.charterSignedDate || oldMember.charterSignedDate || undefined,
          charterSignatureBase64: currentMemberData?.charterSignatureBase64 || oldMember.charterSignatureBase64 || undefined,
        };

        // Save the merged document at the active user's UID
        await setDoc(memberDocRef, sanitizeData(mergedMember)).catch(err => {
          handleFirestoreError(err, OperationType.WRITE, `clubs/${club.id}/members/${currentUser.uid}`);
          throw err;
        });

        currentMemberData = mergedMember;

        // Migrate other collections referencing old ID to the new UID
        for (const oldDoc of oldMemberDocs) {
          try {
            // 1. Migrate Payments
            const pq = query(collection(db, 'clubs', club.id, 'payments'), where('memberId', '==', oldDoc.id));
            const pqSnap = await getDocs(pq);
            for (const pDoc of pqSnap.docs) {
              await updateDoc(doc(db, 'clubs', club.id, 'payments', pDoc.id), { memberId: currentUser.uid });
            }

            // 2. Migrate Player Match Stats
            const sq = query(collection(db, 'clubs', club.id, 'playerStats'), where('memberId', '==', oldDoc.id));
            const sqSnap = await getDocs(sq);
            for (const sDoc of sqSnap.docs) {
              await updateDoc(doc(db, 'clubs', club.id, 'playerStats', sDoc.id), { memberId: currentUser.uid });
            }

            // 3. Migrate Event Convocations
            const eventsSnap = await getDocs(collection(db, 'clubs', club.id, 'events'));
            for (const eDoc of eventsSnap.docs) {
              const eventId = eDoc.id;
              const oldConvId = `${eventId}_${oldDoc.id}`;
              const oldConvRef = doc(db, 'clubs', club.id, 'events', eventId, 'convocations', oldConvId);
              const oldConvSnap = await getDoc(oldConvRef);
              if (oldConvSnap.exists()) {
                const convData = oldConvSnap.data();
                const newConvId = `${eventId}_${currentUser.uid}`;
                const newConvRef = doc(db, 'clubs', club.id, 'events', eventId, 'convocations', newConvId);
                await setDoc(newConvRef, sanitizeData({
                  ...convData,
                  id: newConvId,
                  memberId: currentUser.uid
                }));
                await deleteDoc(oldConvRef);
              }
            }

            // 4. Delete the duplicate member document to avoid listing duplicates
            await deleteDoc(doc(db, 'clubs', club.id, 'members', oldDoc.id));
          } catch (migrationErr) {
            console.error(`Error migrating documents for old member ${oldDoc.id}:`, migrationErr);
          }
        }

        // Trigger a fresh pull of data in parent App if possible
        if (onRefreshClubData) onRefreshClubData();
      }

      if (currentMemberData) {
        const mData = currentMemberData;
        setMember(mData);
        setFirstName(mData.firstName || '');
        setLastName(mData.lastName || '');
        setPhone(mData.phone || '');
        setBirthDate(mData.birthDate || '');
        setAddress((mData as any).address || '');
        setLicenseNumber(mData.licenseNumber || '');
        setEquipmentSize(mData.equipmentSize || 'M');
        setPreferredPosition((mData as any).preferredPosition || '');
        setPhotoUrl(mData.photoUrl || '');
        setCharterAccept(mData.charterSigned || false);
        setSignatureText(mData.charterSigned ? `${mData.firstName} ${mData.lastName}` : '');
      } else {
        // Self-heal/Auto-initialize member document if it does not exist
        const splitName = currentUser.displayName?.split(' ') || [];
        const initialMember: Member = {
          id: currentUser.uid,
          clubId: club.id,
          firstName: splitName[0] || userProfile?.firstName || 'Prénom',
          lastName: splitName.slice(1).join(' ') || userProfile?.lastName || 'Nom',
          role: userProfile?.role || 'player',
          email: currentUser.email || userProfile?.email || '',
          createdAt: new Date().toISOString()
        };

        await setDoc(memberDocRef, initialMember).catch(err => {
          handleFirestoreError(err, OperationType.WRITE, `clubs/${club.id}/members/${currentUser.uid}`);
          throw err;
        });

        setMember(initialMember);
        setFirstName(initialMember.firstName);
        setLastName(initialMember.lastName);
      }
    } catch (err: any) {
      console.error("Error fetching profile & member info: ", err);
      setErrorMsg("Erreur lors de la récupération du profil : " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Check if current user is minor
  const isMinor = birthDate ? (new Date().getFullYear() - new Date(birthDate).getFullYear() < 18) : false;

  // Handle Photo upload in base64
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 200 * 1024) {
      alert("La photo est trop volumineuse (max 200 Ko). Veuillez la compresser avant de la téléverser.");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      setPhotoUrl(base64String);
    };
    reader.readAsDataURL(file);
  };

  // Handle document upload
  const handleDocumentUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    docType: 'medicalCert' | 'registrationForm' | 'parentalAuth'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 400 * 1024) {
      alert("Le fichier est trop volumineux (max 400 Ko). Veuillez compresser votre document (image ou PDF) avant de le téléverser.");
      return;
    }

    setSaving(true);
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64String = reader.result as string;
        const fileMeta = {
          name: file.name,
          size: file.size,
          base64: base64String,
          uploadedAt: new Date().toISOString()
        };

        const statusField = `${docType}Status`;
        const fileField = `${docType}File`;

        if (member) {
          const updatedMember = {
            ...member,
            [statusField]: 'valid',
            [fileField]: fileMeta
          };

          await setDoc(doc(db, 'clubs', club.id, 'members', currentUser.uid), sanitizeData(updatedMember));
          setMember(updatedMember);
          setSuccessMsg("Document administratif téléversé avec succès.");
          if (onRefreshClubData) onRefreshClubData();
          setTimeout(() => setSuccessMsg(null), 3000);
        }
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      console.error("Document upload failed:", err);
      setErrorMsg("Impossible de téléverser le document.");
    } finally {
      setSaving(false);
    }
  };

  // Delete Document
  const handleDeleteDocument = async (docType: 'medicalCert' | 'registrationForm' | 'parentalAuth') => {
    if (!window.confirm("Voulez-vous supprimer ce document ?")) return;
    if (!member) return;

    setSaving(true);
    try {
      const statusField = `${docType}Status`;
      const fileField = `${docType}File`;

      const updatedMember = { ...member };
      (updatedMember as any)[statusField] = 'missing';
      (updatedMember as any)[fileField] = null;

      await setDoc(doc(db, 'clubs', club.id, 'members', currentUser.uid), sanitizeData(updatedMember));
      setMember(updatedMember);
      setSuccessMsg("Document supprimé avec succès.");
      if (onRefreshClubData) onRefreshClubData();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg("Erreur lors de la suppression du document.");
    } finally {
      setSaving(false);
    }
  };

  // Prefilled Form Downloads
  const handleDownloadForm = (type: 'registration' | 'parental') => {
    if (!member) return;
    try {
      const memberDataForPDF: Member = {
        ...member,
        firstName,
        lastName,
        phone,
        birthDate,
        equipmentSize,
        licenseNumber
      };

      if (type === 'registration') {
        generateRegistrationFormPDF(memberDataForPDF, club.name, club.sport);
      } else {
        generateParentalAuthPDF(memberDataForPDF, club.name);
      }
      setSuccessMsg("Votre formulaire pré-rempli a été généré !");
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err) {
      console.error("PDF generation failed:", err);
      setErrorMsg("Erreur lors de la génération du PDF.");
    }
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
      console.error("Erreur de téléchargement : ", err);
    }
  };

  // Handle Charter Acceptance / Digital Signature
  const handleSignCharter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!charterAccept || !signatureText.trim()) {
      setErrorMsg("Veuillez cocher la case d'acceptation et renseigner votre signature.");
      return;
    }

    setIsSigning(true);
    setErrorMsg(null);
    try {
      if (member) {
        const updatedMember: Member = {
          ...member,
          charterSigned: true,
          charterSignedDate: new Date().toISOString(),
          charterSignatureBase64: signatureText.trim()
        };

        await setDoc(doc(db, 'clubs', club.id, 'members', currentUser.uid), sanitizeData(updatedMember));
        setMember(updatedMember);
        setSuccessMsg("Charte du club acceptée et signée électroniquement !");
        if (onRefreshClubData) onRefreshClubData();
        setTimeout(() => setSuccessMsg(null), 3000);
      }
    } catch (err: any) {
      console.error("Charter sign error:", err);
      setErrorMsg("Échec de la signature de la charte.");
    } finally {
      setIsSigning(false);
    }
  };

  // Save General Profile Info
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      setErrorMsg("Le prénom et le nom sont obligatoires.");
      return;
    }

    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      // 1. Update club's member document
      if (member) {
        const updatedMember: Member = {
          ...member,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim(),
          birthDate: birthDate,
          equipmentSize: equipmentSize,
          licenseNumber: licenseNumber.trim(),
          photoUrl: photoUrl
        };
        // Add custom fields inside address and preferredPosition safely
        (updatedMember as any).address = address.trim();
        (updatedMember as any).preferredPosition = preferredPosition.trim();

        await setDoc(doc(db, 'clubs', club.id, 'members', currentUser.uid), sanitizeData(updatedMember)).catch(err => {
          handleFirestoreError(err, OperationType.WRITE, `clubs/${club.id}/members/${currentUser.uid}`);
          throw err;
        });

        setMember(updatedMember);
      }

      // 2. Sync with global user profile document
      const userDocRef = doc(db, 'users', currentUser.uid);
      await updateDoc(userDocRef, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        photoUrl: photoUrl,
        birthDate: birthDate,
        address: address.trim()
      }).catch(err => {
        // If users doc fails or has missing fields, fallback to full write
        setDoc(userDocRef, {
          uid: currentUser.uid,
          email: currentUser.email || '',
          role: userProfile?.role || 'player',
          status: 'approved',
          isSuperUser: userProfile?.isSuperUser || false,
          mfaEnabled: userProfile?.mfaEnabled || false,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim(),
          photoUrl: photoUrl,
          birthDate: birthDate,
          address: address.trim(),
          updatedAt: new Date().toISOString()
        }, { merge: true });
      });

      setSuccessMsg("Votre profil a été enregistré et synchronisé avec succès !");
      if (onRefreshClubData) onRefreshClubData();
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err: any) {
      console.error("Save profile error:", err);
      setErrorMsg("Erreur lors de l'enregistrement : " + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Format helper for documents status
  const getDocStatusBadge = (status: 'valid' | 'renew' | 'missing' | undefined) => {
    switch (status) {
      case 'valid':
        return <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase">Validé</span>;
      case 'renew':
        return <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase">À Renouveler</span>;
      case 'missing':
      default:
        return <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase font-bold">Manquant</span>;
    }
  };

  if (loading) {
    return (
      <div className="h-96 flex flex-col items-center justify-center bg-white rounded-2xl border border-slate-200 shadow-sm">
        <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin" />
        <span className="text-xs font-semibold text-slate-400 tracking-widest mt-3 uppercase">Chargement de votre profil...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* Page Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <User className="w-6 h-6 text-emerald-600" />
            Mon Profil Adhérent
          </h2>
          <p className="text-sm text-slate-500">
            Gérez vos informations personnelles, vos préférences sportives, vos documents administratifs et la sécurité de votre compte.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-full text-xs font-bold capitalize">
            Rôle : {
              member?.role === 'admin' ? 'Administrateur' :
              member?.role === 'president' ? "Président" :
              member?.role === 'vice_president_1' ? "Premier Vice-président" :
              member?.role === 'vice_president_2' ? "Deuxième Vice-président" :
              member?.role === 'sec_general' ? "Secrétaire Général" :
              member?.role === 'tresorier' ? "Trésorier" :
              member?.role === 'membre_actif' ? "Membre Actif" :
              member?.role === 'adherent' ? "Adhérent" :
              member?.role === 'player' ? "Joueur" :
              member?.role === 'visiteur' ? "Visiteur" :
              member?.role === 'coach' ? "Entraîneur" : (member?.role || 'Membre')
            }
          </span>
        </div>
      </div>

      {/* Success/Error Alerts */}
      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-semibold rounded-xl flex items-center gap-3 shadow-sm animate-fadeIn">
          <Check className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 text-sm font-semibold rounded-xl flex items-center gap-3 shadow-sm animate-fadeIn">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Profile Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN: Summary / Avatar card */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Summary / Avatar */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col items-center text-center">
            
            {/* Avatar container */}
            <div className="relative group">
              <div className="w-32 h-32 rounded-full border-4 border-slate-100 overflow-hidden bg-slate-50 flex items-center justify-center shadow-inner">
                {photoUrl ? (
                  <img src={photoUrl} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-16 h-16 text-slate-300" />
                )}
              </div>
              <label className="absolute bottom-1 right-1 w-9 h-9 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full flex items-center justify-center cursor-pointer shadow-md border-2 border-white transition transform hover:scale-110">
                <Camera className="w-4.5 h-4.5" />
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={handlePhotoUpload} 
                  className="hidden" 
                />
              </label>
            </div>

            <h3 className="text-xl font-bold text-slate-800 mt-4 tracking-tight">
              {firstName} {lastName}
            </h3>
            <p className="text-xs text-slate-400 font-medium mt-0.5">{currentUser.email}</p>

            <hr className="w-full my-4 border-slate-100" />

            {/* Quick Badges or Stats */}
            <div className="w-full space-y-2.5 text-left text-xs text-slate-600">
              
              <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                <span className="font-bold text-slate-400 uppercase text-[10px]">Licence</span>
                <span className="font-semibold text-slate-700">
                  {licenseNumber || <span className="text-rose-500 italic">À renseigner</span>}
                </span>
              </div>

              <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                <span className="font-bold text-slate-400 uppercase text-[10px]">Taille Maillot</span>
                <span className="font-semibold text-slate-700 bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded text-[10px] font-bold">
                  {equipmentSize}
                </span>
              </div>

              <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                <span className="font-bold text-slate-400 uppercase text-[10px]">Statut Médical</span>
                {getDocStatusBadge(member?.medicalCertStatus)}
              </div>

              {isMinor && (
                <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                  <span className="font-bold text-slate-400 uppercase text-[10px]">Autorisation Parentale</span>
                  {getDocStatusBadge(member?.parentalAuthStatus)}
                </div>
              )}
            </div>
          </div>

          {/* Fee / Membership dues Status card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
            <h4 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <CreditCard className="w-4.5 h-4.5 text-emerald-600" />
              Ma Cotisation Annuelle
            </h4>
            <div className="p-4 rounded-xl border flex justify-between items-center bg-slate-50/50">
              <div>
                <span className="block text-[10px] font-bold text-slate-400 uppercase">Tarif Cotisation</span>
                <span className="text-xl font-black text-slate-800">{member?.membershipAmount || 150} {currencySymbol}</span>
              </div>
              <div>
                {member?.membershipPaid ? (
                  <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 font-bold px-3 py-1 rounded-full text-[10px] uppercase">
                    <CheckCircle className="w-3.5 h-3.5" />
                    Réglée
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 font-bold px-3 py-1 rounded-full text-[10px] uppercase">
                    Non Réglée
                  </span>
                )}
              </div>
            </div>
            {!member?.membershipPaid && (
              <p className="text-[11px] text-slate-500 italic leading-relaxed">
                Veuillez vous rapprocher d'un administrateur ou trésorier du club pour régler votre cotisation de {member?.membershipAmount || 150} {currencySymbol} afin de valider définitivement votre licence de jeu.
              </p>
            )}
          </div>

          {/* MFA / Security Status card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
            <div className="flex justify-between items-start">
              <h4 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <Key className="w-4.5 h-4.5 text-emerald-600" />
                Sécurité du Compte
              </h4>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              La double authentification (MFA) sécurise votre compte en exigeant un code unique généré sur votre mobile lors de votre connexion.
            </p>
            <div className="flex items-center justify-between p-3.5 rounded-xl border bg-slate-50/50">
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${userProfile?.mfaEnabled ? 'bg-emerald-500 animate-pulse' : 'bg-rose-400'}`} />
                <span className="text-xs font-bold text-slate-700">
                  {userProfile?.mfaEnabled ? "MFA Activé" : "MFA Désactivé"}
                </span>
              </div>
              <button
                onClick={onOpenMfaSettings}
                className="text-xs font-bold text-emerald-600 hover:text-emerald-700 underline cursor-pointer"
              >
                Configurer
              </button>
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN: Tab forms & Uploads */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* Main profile edit form */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center gap-3 bg-slate-50/30">
              <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center">
                <User className="w-4.5 h-4.5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Informations Générales</h3>
                <p className="text-[10px] text-slate-400">Renseignez vos informations de contact et vos préférences physiques.</p>
              </div>
            </div>

            <form onSubmit={handleSaveProfile} className="p-6 space-y-5">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* First Name */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Prénom</label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-emerald-500 font-semibold"
                    placeholder="Votre prénom"
                  />
                </div>

                {/* Last Name */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Nom de famille</label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-emerald-500 font-semibold"
                    placeholder="Votre nom"
                  />
                </div>

                {/* Birthdate */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Date de naissance</label>
                  <input
                    type="date"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-emerald-500 font-semibold"
                  />
                </div>

                {/* Phone */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Téléphone</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-emerald-500 font-semibold"
                    placeholder="06 12 34 56 78"
                  />
                </div>

                {/* Address */}
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Adresse Postale</label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-emerald-500 font-medium"
                    placeholder="Ex: 12 Rue des Alouettes, 75000 Paris"
                  />
                </div>

                {/* License Number */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">N° de Licence Officiel</label>
                  <input
                    type="text"
                    value={licenseNumber}
                    onChange={(e) => setLicenseNumber(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-emerald-500 font-semibold"
                    placeholder="Ex: LIC1234567"
                  />
                </div>

                {/* Equipment Size */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Taille d'équipement recommandée</label>
                  <select
                    value={equipmentSize}
                    onChange={(e) => setEquipmentSize(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-emerald-500 font-semibold cursor-pointer"
                  >
                    <option value="XS">XS (Très petit)</option>
                    <option value="S">S (Petit)</option>
                    <option value="M">M (Moyen)</option>
                    <option value="L">L (Grand)</option>
                    <option value="XL">XL (Très grand)</option>
                    <option value="XXL">XXL (Double XL)</option>
                  </select>
                </div>

                {/* Preferred Position (Physical) */}
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Poste de prédilection / Notes sportives</label>
                  <input
                    type="text"
                    value={preferredPosition}
                    onChange={(e) => setPreferredPosition(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-emerald-500 font-medium"
                    placeholder="Ex: Attaquant gauche, Défenseur central, Milieu relayeur, etc."
                  />
                </div>

              </div>

              <div className="flex justify-end pt-3 border-t border-slate-100">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-6 rounded-xl transition text-sm cursor-pointer disabled:opacity-50 shadow-md shadow-emerald-600/10"
                >
                  {saving ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  <span>Enregistrer les modifications</span>
                </button>
              </div>

            </form>
          </div>

          {/* Dossier d'inscription & documents administratifs card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center gap-3 bg-slate-50/30">
              <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center">
                <FileText className="w-4.5 h-4.5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Mon Dossier Administratif</h3>
                <p className="text-[10px] text-slate-400">Générez vos formulaires d'inscription pré-remplis puis téléversez-les signés.</p>
              </div>
            </div>

            <div className="p-6 space-y-6">
              
              {/* Docs Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* 1. Medical Certificate */}
                <div className="p-4 rounded-xl border border-slate-200 space-y-3.5 bg-slate-50/30">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Certificat Médical</h4>
                      <p className="text-[10px] text-slate-400 mt-0.5">Obligatoire pour l'obtention de la licence.</p>
                    </div>
                    {getDocStatusBadge(member?.medicalCertStatus)}
                  </div>

                  <div className="flex items-center gap-2.5 pt-1.5">
                    {member?.medicalCertFile ? (
                      <div className="flex-1 flex items-center justify-between bg-white p-2 border border-slate-200 rounded-xl text-xs">
                        <span className="truncate max-w-[130px] font-mono text-[11px] text-slate-500">
                          {member.medicalCertFile.name}
                        </span>
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => handleDownloadUploadedFile(member.medicalCertFile!)}
                            className="p-1 text-slate-600 hover:text-slate-900 rounded"
                            title="Télécharger"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteDocument('medicalCert')}
                            className="p-1 text-rose-600 hover:text-rose-800 rounded"
                            title="Supprimer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <label className="flex-1 border border-dashed border-slate-300 hover:border-emerald-500 bg-white hover:bg-emerald-50/20 py-3.5 px-4 rounded-xl flex flex-col items-center justify-center cursor-pointer transition text-center">
                        <UploadCloud className="w-5 h-5 text-slate-400" />
                        <span className="text-[11px] font-bold text-slate-600 mt-1">Téléverser mon certificat</span>
                        <span className="text-[9px] text-slate-400 mt-0.5">Format PDF ou Image (max 400 Ko)</span>
                        <input 
                          type="file" 
                          accept="image/*,application/pdf" 
                          onChange={(e) => handleDocumentUpload(e, 'medicalCert')} 
                          className="hidden" 
                        />
                      </label>
                    )}
                  </div>
                </div>

                {/* 2. Registration Form */}
                <div className="p-4 rounded-xl border border-slate-200 space-y-3.5 bg-slate-50/30">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Fiche d'Inscription</h4>
                      <p className="text-[10px] text-slate-400 mt-0.5">À télécharger pré-remplie, à signer et téléverser.</p>
                    </div>
                    {getDocStatusBadge(member?.registrationFormStatus)}
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleDownloadForm('registration')}
                      className="flex-1 flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-900 text-white font-bold py-2 px-3 rounded-xl text-xs transition cursor-pointer shadow-sm"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Formulaire pré-rempli</span>
                    </button>
                  </div>

                  <div className="pt-1 border-t border-slate-100">
                    {member?.registrationFormFile ? (
                      <div className="flex items-center justify-between bg-white p-2 border border-slate-200 rounded-xl text-xs">
                        <span className="truncate max-w-[130px] font-mono text-[11px] text-slate-500">
                          {member.registrationFormFile.name}
                        </span>
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => handleDownloadUploadedFile(member.registrationFormFile!)}
                            className="p-1 text-slate-600 hover:text-slate-900 rounded"
                            title="Télécharger"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteDocument('registrationForm')}
                            className="p-1 text-rose-600 hover:text-rose-800 rounded"
                            title="Supprimer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <label className="border border-dashed border-slate-300 hover:border-emerald-500 bg-white hover:bg-emerald-50/20 py-3 px-4 rounded-xl flex flex-col items-center justify-center cursor-pointer transition text-center">
                        <UploadCloud className="w-4.5 h-4.5 text-slate-400" />
                        <span className="text-[10px] font-bold text-slate-600 mt-1">Téléverser la fiche signée</span>
                        <input 
                          type="file" 
                          accept="image/*,application/pdf" 
                          onChange={(e) => handleDocumentUpload(e, 'registrationForm')} 
                          className="hidden" 
                        />
                      </label>
                    )}
                  </div>
                </div>

                {/* 3. Parental Authorization (conditional if minor) */}
                {isMinor && (
                  <div className="p-4 rounded-xl border border-slate-200 space-y-3.5 bg-slate-50/30 col-span-1 md:col-span-2 animate-fadeIn">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Autorisation Parentale (Mineur)</h4>
                        <p className="text-[10px] text-slate-400 mt-0.5">Obligatoire car vous avez moins de 18 ans.</p>
                      </div>
                      {getDocStatusBadge(member?.parentalAuthStatus)}
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 pt-1">
                      <button
                        type="button"
                        onClick={() => handleDownloadForm('parental')}
                        className="flex-1 flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-900 text-white font-bold py-2.5 px-3 rounded-xl text-xs transition cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Télécharger l'Autorisation pré-remplie</span>
                      </button>

                      {member?.parentalAuthFile ? (
                        <div className="flex-1 flex items-center justify-between bg-white p-2.5 border border-slate-200 rounded-xl text-xs">
                          <span className="truncate max-w-[130px] font-mono text-[11px] text-slate-500">
                            {member.parentalAuthFile.name}
                          </span>
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => handleDownloadUploadedFile(member.parentalAuthFile!)}
                              className="p-1 text-slate-600 hover:text-slate-900 rounded"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteDocument('parentalAuth')}
                              className="p-1 text-rose-600 hover:text-rose-800 rounded"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <label className="flex-1 border border-dashed border-slate-300 hover:border-emerald-500 bg-white hover:bg-emerald-50/20 py-2 px-4 rounded-xl flex flex-col items-center justify-center cursor-pointer transition text-center">
                          <UploadCloud className="w-4 h-4 text-slate-400" />
                          <span className="text-[10px] font-bold text-slate-600 mt-0.5">Téléverser l'autorisation signée</span>
                          <input 
                            type="file" 
                            accept="image/*,application/pdf" 
                            onChange={(e) => handleDocumentUpload(e, 'parentalAuth')} 
                            className="hidden" 
                          />
                        </label>
                      )}
                    </div>
                  </div>
                )}

              </div>

              {/* Club Charter acceptance and digital signature */}
              <div className="p-5 bg-emerald-50/30 rounded-2xl border border-emerald-100 space-y-4">
                <div className="flex items-center gap-2 text-emerald-900">
                  <PenTool className="w-5 h-5 text-emerald-600" />
                  <h4 className="text-sm font-black uppercase tracking-wider">Acceptation de la Charte d'Éthique</h4>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  En tant que membre de {club.name}, vous vous engagez à respecter les valeurs d'esprit sportif, de fair-play, de respect mutuel envers les coéquipiers, entraîneurs, arbitres et adversaires, ainsi qu'à prendre soin du matériel collectif du club.
                </p>

                {member?.charterSigned ? (
                  <div className="p-4 bg-white rounded-xl border border-emerald-100 flex items-center gap-3">
                    <div className="w-8 h-8 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center shrink-0">
                      <Check className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="block text-xs font-bold text-slate-800">Charte signée électroniquement</span>
                      <span className="block text-[10px] text-slate-400">
                        Signé le {new Date(member.charterSignedDate!).toLocaleDateString('fr-FR')} par <strong className="text-emerald-700">{member.charterSignatureBase64}</strong>
                      </span>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleSignCharter} className="space-y-3.5 bg-white p-4 rounded-xl border border-slate-200">
                    <label className="flex items-start gap-3.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={charterAccept}
                        onChange={(e) => setCharterAccept(e.target.checked)}
                        className="mt-1 text-emerald-600 focus:ring-emerald-500 h-4 w-4 rounded"
                      />
                      <span className="text-xs text-slate-600 leading-normal font-semibold">
                        Je déclare avoir lu et j'accepte sans réserve les termes et conditions de la Charte d'Éthique de {club.name}.
                      </span>
                    </label>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
                      <input
                        type="text"
                        value={signatureText}
                        onChange={(e) => setSignatureText(e.target.value)}
                        placeholder="Tapez votre prénom et nom complet pour signer..."
                        disabled={!charterAccept}
                        className="flex-1 px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-emerald-500 disabled:opacity-50"
                      />
                      <button
                        type="submit"
                        disabled={isSigning || !charterAccept || !signatureText.trim()}
                        className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold py-2.5 px-5 rounded-xl transition cursor-pointer shrink-0"
                      >
                        {isSigning ? "Signature..." : "Signer et Accepter"}
                      </button>
                    </div>
                  </form>
                )}
              </div>

            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
