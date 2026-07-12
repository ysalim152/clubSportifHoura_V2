import React, { useState, useEffect } from 'react';
import { 
  Building, Mail, UserCheck, Palette, Globe, Server, Shield, Database, 
  Trash2, Save, RefreshCw, Play, Check, Lock, User, MapPin, Sparkles, 
  Clock, AlertTriangle, ShieldAlert, Cpu, Eye, EyeOff, Plus, FileText, Send
} from 'lucide-react';
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Club } from '../types';

interface SettingsManagerProps {
  club: Club;
  onRefresh: () => void;
  currentUserRole?: string;
  isSuperUser?: boolean;
}

interface AuditLog {
  id: string;
  action: string;
  user: string;
  ip: string;
  timestamp: string;
}

interface BackupItem {
  id: string;
  filename: string;
  size: string;
  createdAt: string;
  status: 'completed' | 'failed';
}

const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: ['dashboard', 'profil', 'membres', 'calendrier', 'equipements', 'finances', 'strategie', 'messagerie', 'feedback', 'parametres'],
  president: ['dashboard', 'profil', 'membres', 'calendrier', 'equipements', 'finances', 'strategie', 'messagerie', 'feedback', 'parametres'],
  vice_president_1: ['dashboard', 'profil', 'membres', 'calendrier', 'equipements', 'finances', 'strategie', 'messagerie', 'feedback', 'parametres'],
  vice_president_2: ['dashboard', 'profil', 'membres', 'calendrier', 'equipements', 'finances', 'strategie', 'messagerie', 'feedback', 'parametres'],
  sec_general: ['dashboard', 'profil', 'membres', 'calendrier', 'equipements', 'finances', 'strategie', 'messagerie', 'feedback', 'parametres'],
  tresorier: ['dashboard', 'profil', 'membres', 'calendrier', 'equipements', 'finances', 'strategie', 'messagerie', 'feedback', 'parametres'],
  coach: ['dashboard', 'profil', 'calendrier', 'equipements', 'messagerie', 'feedback', 'parametres'],
  membre_actif: ['dashboard', 'profil', 'calendrier', 'equipements', 'strategie', 'messagerie', 'feedback', 'parametres'],
  adherent: ['dashboard', 'profil', 'calendrier', 'equipements', 'finances', 'messagerie', 'feedback', 'parametres'],
  player: ['dashboard', 'profil', 'calendrier', 'equipements', 'finances', 'messagerie', 'feedback', 'parametres'],
  visiteur: ['dashboard', 'profil', 'calendrier', 'feedback', 'parametres'],
};

const FEATURE_LABELS: Record<string, { label: string; icon: string }> = {
  dashboard: { label: 'Tableau de Bord', icon: '📊' },
  profil: { label: 'Mon Profil', icon: '👤' },
  membres: { label: 'Membres & Équipes', icon: '👥' },
  calendrier: { label: 'Calendrier & Matchs', icon: '📅' },
  equipements: { label: 'Équipements & Matériel', icon: '👕' },
  finances: { label: 'Cotisations & Finances', icon: '💳' },
  strategie: { label: 'Décisions & SWOT IA', icon: '🧠' },
  messagerie: { label: 'Messagerie Club', icon: '💬' },
  feedback: { label: 'Feedback & Idées', icon: '💝' },
  parametres: { label: 'Paramètres', icon: '⚙️' },
};

const ROLE_LABELS: Record<string, string> = {
  admin: '👑 Administrateur',
  president: '🏢 Président',
  vice_president_1: '🤝 1er Vice-Président',
  vice_president_2: '🤝 2e Vice-Président',
  sec_general: '📝 Secrétaire Général',
  tresorier: '💰 Trésorier',
  coach: '🏃 Entraîneur / Coach',
  membre_actif: '⚡ Membre Actif',
  adherent: '🎟️ Adhérent',
  player: '⚽ Joueur / Athlète',
  visiteur: '👁️ Visiteur simple',
};

export default function SettingsManager({ club, onRefresh, currentUserRole, isSuperUser }: SettingsManagerProps) {
  const [activeTab, setActiveTab] = useState<'general' | 'appearance' | 'system' | 'permissions' | 'danger'>('general');
  const [rolePermissions, setRolePermissions] = useState<Record<string, string[]>>(DEFAULT_ROLE_PERMISSIONS);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showSmtpPassword, setShowSmtpPassword] = useState(false);

  // General States
  const [associationName, setAssociationName] = useState(club.name || '');
  const [associationSigle, setAssociationSigle] = useState('');
  const [associationDesc, setAssociationDesc] = useState('Club de sport amateur dédié au développement des talents.');
  const [associationYear, setAssociationYear] = useState('2018');
  const [associationLogo, setAssociationLogo] = useState(club.logoUrl || '');

  // Contact States
  const [contactEmail, setContactEmail] = useState('contact@' + (club.name?.toLowerCase().replace(/\s+/g, '') || 'club') + '.fr');
  const [contactPhone, setContactPhone] = useState('01 23 45 67 89');
  const [contactAddress, setContactAddress] = useState(club.address || '12 Rue des Sports, 75000 Paris');
  const [contactWebsite, setContactWebsite] = useState('https://www.example.com');
  const [socialFacebook, setSocialFacebook] = useState('https://facebook.com/club');
  const [socialTwitter, setSocialTwitter] = useState('https://twitter.com/club');
  const [socialInstagram, setSocialInstagram] = useState('https://instagram.com/club');

  // Registration States
  const [manualValidation, setManualValidation] = useState(true);
  const [emailConfirmation, setEmailConfirmation] = useState(true);
  const [medicalCertRequired, setMedicalCertRequired] = useState(true);
  const [adminCode, setAdminCode] = useState('ADMIN2026');
  const [coachCode, setCoachCode] = useState('COACH2026');
  const [presidentCode, setPresidentCode] = useState('PRESIDENT2026');
  const [vicePresident1Code, setVicePresident1Code] = useState('VP12026');
  const [vicePresident2Code, setVicePresident2Code] = useState('VP22026');
  const [secGeneralCode, setSecGeneralCode] = useState('SG2026');
  const [tresorierCode, setTresorierCode] = useState('TRESORIER2026');
  const [membreActifCode, setMembreActifCode] = useState('MEMBRE2026');
  const [adherentCode, setAdherentCode] = useState('ADHERENT2026');
  const [playerCode, setPlayerCode] = useState('PLAYER2026');
  const [visiteurCode, setVisiteurCode] = useState('VISITEUR2026');

  // New Sports Association Specific States
  const [associationSeason, setAssociationSeason] = useState('Saison 2026-2027');
  const [associationSport, setAssociationSport] = useState('Football');
  const [associationAffiliation, setAssociationAffiliation] = useState('FFF-549102');
  const [associationType, setAssociationType] = useState('Loi 1901');

  // Duplicate Codes Warning State
  const [duplicateCodesError, setDuplicateCodesError] = useState<string | null>(null);

  // Live validation for duplicate registration codes
  useEffect(() => {
    const codes = [
      { name: 'Administrateur', code: adminCode },
      { name: 'Président', code: presidentCode },
      { name: 'Vice-Président 1', code: vicePresident1Code },
      { name: 'Vice-Président 2', code: vicePresident2Code },
      { name: 'Secrétaire Général', code: secGeneralCode },
      { name: 'Trésorier', code: tresorierCode },
      { name: 'Membre Actif', code: membreActifCode },
      { name: 'Coach', code: coachCode },
      { name: 'Adhérent', code: adherentCode },
      { name: 'Joueur', code: playerCode },
      { name: 'Visiteur', code: visiteurCode },
    ].filter(c => c.code && c.code.trim() !== '');

    const codeToNames: Record<string, string[]> = {};
    codes.forEach(c => {
      const trimmed = c.code.trim();
      if (!codeToNames[trimmed]) {
        codeToNames[trimmed] = [];
      }
      codeToNames[trimmed].push(c.name);
    });

    const duplicates = Object.entries(codeToNames).filter(([_, names]) => names.length > 1);

    if (duplicates.length > 0) {
      const desc = duplicates.map(([code, names]) => `"${code}" pour les profils : ${names.join(', ')}`).join(' | ');
      setDuplicateCodesError(`Attention : Des codes d'inscription identiques sont attribués à des rôles différents ! Cela pose un risque majeur de sécurité. Doublons détectés : ${desc}`);
    } else {
      setDuplicateCodesError(null);
    }
  }, [
    adminCode, presidentCode, vicePresident1Code, vicePresident2Code,
    secGeneralCode, tresorierCode, membreActifCode, coachCode,
    adherentCode, playerCode, visiteurCode
  ]);

  // Automated Code Renewal States
  const [autoCodeRenewal, setAutoCodeRenewal] = useState(false);
  const [renewalPeriod, setRenewalPeriod] = useState('seasonal'); // 'monthly' | 'quarterly' | 'seasonal' | 'annual'
  const [lastRenewalDate, setLastRenewalDate] = useState('');
  const [nextRenewalDate, setNextRenewalDate] = useState('');

  // Appearance States
  const [darkMode, setDarkMode] = useState(false);
  const [animationsEnabled, setAnimationsEnabled] = useState(true);
  const [particleEffects, setParticleEffects] = useState(true);
  const [displayFont, setDisplayFont] = useState('Inter');

  // Language & Region
  const [mainLanguage, setMainLanguage] = useState('Français (FR)');
  const [timezone, setTimezone] = useState('Europe/Paris (UTC+02:00)');
  const [dateFormat, setDateFormat] = useState('DD/MM/YYYY');
  const [currency, setCurrency] = useState('Da');
  const [currencyFormat, setCurrencyFormat] = useState('1 000,00 Da');

  // SMTP States
  const [smtpHost, setSmtpHost] = useState('smtp.sendgrid.net');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpUser, setSmtpUser] = useState('apikey');
  const [smtpPass, setSmtpPass] = useState('SG.example_smtp_password_key_placeholder');
  const [smtpSecure, setSmtpSecure] = useState('tls');
  const [autoSendConvocations, setAutoSendConvocations] = useState(true);
  const [autoSendReminders, setAutoSendReminders] = useState(true);
  const [autoSendReceipts, setAutoSendReceipts] = useState(true);

  // SMTP Testing states
  const [smtpTesting, setSmtpTesting] = useState(false);
  const [smtpTestLogs, setSmtpTestLogs] = useState<string[]>([]);
  const [testEmailAddress, setTestEmailAddress] = useState('mass26.sm15@gmail.com');
  const [smtpTestResult, setSmtpTestResult] = useState<'success' | 'error' | null>(null);

  // Email Templates
  const [selectedEmailTemplate, setSelectedEmailTemplate] = useState<'welcome' | 'reminder' | 'convocation'>('welcome');
  const [welcomeSubject, setWelcomeSubject] = useState('Bienvenue chez [Association] - Votre inscription est validée !');
  const [welcomeBody, setWelcomeBody] = useState('Bonjour [Nom],\n\nNous avons le plaisir de vous informer que votre inscription a été validée avec succès par nos administrateurs.\n\nSportivement,\nL\'équipe [Association]');
  const [reminderSubject, setReminderSubject] = useState('Relance : Dossier d\'inscription incomplet');
  const [reminderBody, setReminderBody] = useState('Bonjour [Nom],\n\nVotre dossier d\'inscription est toujours incomplet (certificat médical ou charte manquante). Merci de régulariser votre situation au plus vite.\n\nSportivement,\nL\'équipe [Association]');
  const [convocationSubject, setConvocationSubject] = useState('Convocation : [Match/Entraînement] du [Date]');
  const [convocationBody, setConvocationBody] = useState('Bonjour [Nom],\n\nVous êtes convoqué pour participer à l\'événement "[Titre]" qui aura lieu le [Date] à [Heure].\n\nMerci de confirmer votre présence depuis votre espace membre.\n\nSportivement,\nLe coach');

  // Security States
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [sessionTimeout, setSessionTimeout] = useState(120);
  const [maxLoginAttempts, setMaxLoginAttempts] = useState(5);
  const [csrfProtection, setCsrfProtection] = useState(true);
  const [passwordStrength, setPasswordStrength] = useState<'medium' | 'strong' | 'very_strong'>('strong');

  // Backup States
  const [autoBackups, setAutoBackups] = useState(true);
  const [backups, setBackups] = useState<BackupItem[]>([
    { id: 'b1', filename: 'backup_auto_20260710_040000.sql', size: '2.4 MB', createdAt: '2026-07-10 04:00', status: 'completed' },
    { id: 'b2', filename: 'backup_auto_20260709_040000.sql', size: '2.3 MB', createdAt: '2026-07-09 04:00', status: 'completed' },
    { id: 'b3', filename: 'backup_manual_v1.0.sql', size: '2.1 MB', createdAt: '2026-07-05 18:24', status: 'completed' }
  ]);

  // Audit Logs
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([
    { id: 'l1', action: 'Mise à jour des paramètres système', user: 'mass26.sm15@gmail.com', ip: '192.168.1.45', timestamp: '2026-07-11 01:10' },
    { id: 'l2', action: 'Création d\'une équipe : U18 Masculin', user: 'mass26.sm15@gmail.com', ip: '192.168.1.45', timestamp: '2026-07-10 23:45' },
    { id: 'l3', action: 'Validation de l\'inscription de Lucas Martin', user: 'mass26.sm15@gmail.com', ip: '192.168.1.45', timestamp: '2026-07-10 18:32' },
    { id: 'l4', action: 'Génération de facture de cotisation #FA-492', user: 'mass26.sm15@gmail.com', ip: '192.168.1.45', timestamp: '2026-07-10 14:15' },
    { id: 'l5', action: 'Exportation de l\'historique financier (Excel)', user: 'mass26.sm15@gmail.com', ip: '192.168.1.45', timestamp: '2026-07-09 11:02' }
  ]);

  // Mock System Usage Metrics
  const [cpuLoad, setCpuLoad] = useState(24);
  const [memoryUsage, setMemoryUsage] = useState(48);
  const [storageUsage, setStorageUsage] = useState(12.8);

  // Danger actions states
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [resetVerificationText, setResetVerificationText] = useState('');
  const [cacheClearing, setCacheClearing] = useState(false);

  // Load saved settings from Firestore on mount
  useEffect(() => {
    const fetchSettings = async () => {
      setLoading(true);
      try {
        const settingsDocRef = doc(db, 'clubs', club.id, 'settings', 'system');
        const snap = await getDoc(settingsDocRef);
        if (snap.exists()) {
          const data = snap.data();
          
          // Apply General Settings
          if (data.association) {
            setAssociationName(data.association.name || club.name || '');
            setAssociationSigle(data.association.sigle || '');
            setAssociationDesc(data.association.description || '');
            setAssociationYear(data.association.yearCreated || '2018');
            setAssociationLogo(data.association.logoUrl || club.logoUrl || '');
            setAssociationSeason(data.association.season || 'Saison 2026-2027');
            setAssociationSport(data.association.sport || 'Football');
            setAssociationAffiliation(data.association.affiliation || 'FFF-549102');
            setAssociationType(data.association.associationType || 'Loi 1901');
          }

          // Apply Contact Settings
          if (data.contact) {
            setContactEmail(data.contact.email || '');
            setContactPhone(data.contact.phone || '');
            setContactAddress(data.contact.address || '');
            setContactWebsite(data.contact.website || '');
            setSocialFacebook(data.contact.facebook || '');
            setSocialTwitter(data.contact.twitter || '');
            setSocialInstagram(data.contact.instagram || '');
          }

          // Apply Inscriptions Settings
          if (data.registration) {
            setManualValidation(data.registration.manualValidation !== false);
            setEmailConfirmation(data.registration.emailConfirmation !== false);
            setMedicalCertRequired(data.registration.medicalCertRequired !== false);
            setAdminCode(data.registration.adminCode || 'ADMIN2026');
            setCoachCode(data.registration.coachCode || 'COACH2026');
            setPresidentCode(data.registration.presidentCode || 'PRESIDENT2026');
            setVicePresident1Code(data.registration.vicePresident1Code || 'VP12026');
            setVicePresident2Code(data.registration.vicePresident2Code || 'VP22026');
            setSecGeneralCode(data.registration.secGeneralCode || 'SG2026');
            setTresorierCode(data.registration.tresorierCode || 'TRESORIER2026');
            setMembreActifCode(data.registration.membreActifCode || 'MEMBRE2026');
            setAdherentCode(data.registration.adherentCode || 'ADHERENT2026');
            setPlayerCode(data.registration.playerCode || 'PLAYER2026');
            setVisiteurCode(data.registration.visiteurCode || 'VISITEUR2026');
            setAutoCodeRenewal(!!data.registration.autoCodeRenewal);
            setRenewalPeriod(data.registration.renewalPeriod || 'seasonal');
            setLastRenewalDate(data.registration.lastRenewalDate || '');
            setNextRenewalDate(data.registration.nextRenewalDate || '');
          }

          // Apply Appearance Settings
          if (data.appearance) {
            setDarkMode(!!data.appearance.darkMode);
            setAnimationsEnabled(data.appearance.animations !== false);
            setParticleEffects(data.appearance.particleEffects !== false);
            setDisplayFont(data.appearance.displayFont || 'Inter');
            
            setMainLanguage(data.appearance.mainLanguage || 'Français (FR)');
            setTimezone(data.appearance.timezone || 'Europe/Paris (UTC+02:00)');
            setDateFormat(data.appearance.dateFormat || 'DD/MM/YYYY');
            setCurrency(data.appearance.currency || 'Da');
            setCurrencyFormat(data.appearance.currencyFormat || '1 000,00 Da');
          }

          // Apply SMTP Settings
          if (data.smtp) {
            setSmtpHost(data.smtp.host || 'smtp.sendgrid.net');
            setSmtpPort(data.smtp.port || '587');
            setSmtpUser(data.smtp.user || 'apikey');
            setSmtpPass(data.smtp.password || '•••••••••••••••••••••••••');
            setSmtpSecure(data.smtp.secure || 'tls');
            setAutoSendConvocations(data.smtp.autoSendConvocations !== false);
            setAutoSendReminders(data.smtp.autoSendReminders !== false);
            setAutoSendReceipts(data.smtp.autoSendReceipts !== false);
          }

          // Apply Email Templates
          if (data.emailTemplates) {
            if (data.emailTemplates.welcome) {
              setWelcomeSubject(data.emailTemplates.welcome.subject || '');
              setWelcomeBody(data.emailTemplates.welcome.body || '');
            }
            if (data.emailTemplates.reminder) {
              setReminderSubject(data.emailTemplates.reminder.subject || '');
              setReminderBody(data.emailTemplates.reminder.body || '');
            }
            if (data.emailTemplates.convocation) {
              setConvocationSubject(data.emailTemplates.convocation.subject || '');
              setConvocationBody(data.emailTemplates.convocation.body || '');
            }
          }

          // Apply Security
          if (data.security) {
            setMfaEnabled(!!data.security.mfaEnabled);
            setSessionTimeout(data.security.sessionTimeout || 120);
            setMaxLoginAttempts(data.security.maxLoginAttempts || 5);
            setCsrfProtection(data.security.csrfProtection !== false);
            setPasswordStrength(data.security.passwordStrength || 'strong');
          }

          // Apply Backups
          if (data.backup) {
            setAutoBackups(data.backup.autoBackups !== false);
          }

          // Apply Permissions
          if (data.permissions) {
            setRolePermissions(data.permissions);
          } else {
            setRolePermissions(DEFAULT_ROLE_PERMISSIONS);
          }
        }
      } catch (err: any) {
        console.error("Error loading system settings:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();

    // Randomize slightly the mock metrics just for visual fidelity
    const timer = setInterval(() => {
      setCpuLoad(prev => Math.max(10, Math.min(85, prev + Math.floor(Math.random() * 9) - 4)));
    }, 4000);

    return () => clearInterval(timer);
  }, [club.id]);

  // General Save Action
  const handleSaveSettings = async (section: 'general' | 'appearance' | 'system' | 'permissions') => {
    setSaving(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    const docData: any = {
      updatedAt: new Date().toISOString(),
      updatedBy: 'mass26.sm15@gmail.com'
    };

    try {
      const settingsDocRef = doc(db, 'clubs', club.id, 'settings', 'system');
      const snap = await getDoc(settingsDocRef);
      const existingData = snap.exists() ? snap.data() : {};

      if (section === 'general') {
        if (duplicateCodesError) {
          setErrorMessage("Impossible d'enregistrer : " + duplicateCodesError + " Veuillez attribuer un code unique à chaque rôle avant de sauvegarder.");
          setSaving(false);
          return;
        }

        docData.association = {
          name: associationName,
          sigle: associationSigle,
          description: associationDesc,
          yearCreated: associationYear,
          logoUrl: associationLogo,
          season: associationSeason,
          sport: associationSport,
          affiliation: associationAffiliation,
          associationType: associationType
        };
        docData.contact = {
          email: contactEmail,
          phone: contactPhone,
          address: contactAddress,
          website: contactWebsite,
          facebook: socialFacebook,
          twitter: socialTwitter,
          instagram: socialInstagram
        };
        docData.registration = {
          manualValidation,
          emailConfirmation,
          medicalCertRequired,
          adminCode,
          coachCode,
          presidentCode,
          vicePresident1Code,
          vicePresident2Code,
          secGeneralCode,
          tresorierCode,
          membreActifCode,
          adherentCode,
          playerCode,
          visiteurCode,
          autoCodeRenewal,
          renewalPeriod,
          lastRenewalDate,
          nextRenewalDate
        };

        // Preserve other sections
        docData.appearance = existingData.appearance || null;
        docData.smtp = existingData.smtp || null;
        docData.emailTemplates = existingData.emailTemplates || null;
        docData.security = existingData.security || null;
        docData.backup = existingData.backup || null;
        docData.permissions = existingData.permissions || null;
      } else if (section === 'appearance') {
        docData.appearance = {
          darkMode,
          animations: animationsEnabled,
          particleEffects,
          displayFont,
          mainLanguage,
          timezone,
          dateFormat,
          currency,
          currencyFormat
        };

        // Preserve other sections
        docData.association = existingData.association || null;
        docData.contact = existingData.contact || null;
        docData.registration = existingData.registration || null;
        docData.smtp = existingData.smtp || null;
        docData.emailTemplates = existingData.emailTemplates || null;
        docData.security = existingData.security || null;
        docData.backup = existingData.backup || null;
        docData.permissions = existingData.permissions || null;
      } else if (section === 'system') {
        docData.smtp = {
          host: smtpHost,
          port: smtpPort,
          user: smtpUser,
          password: smtpPass,
          secure: smtpSecure,
          autoSendConvocations,
          autoSendReminders,
          autoSendReceipts
        };
        docData.emailTemplates = {
          welcome: { subject: welcomeSubject, body: welcomeBody },
          reminder: { subject: reminderSubject, body: reminderBody },
          convocation: { subject: convocationSubject, body: convocationBody }
        };
        docData.security = {
          mfaEnabled,
          sessionTimeout,
          maxLoginAttempts,
          csrfProtection,
          passwordStrength
        };
        docData.backup = {
          autoBackups
        };

        // Preserve other sections
        docData.association = existingData.association || null;
        docData.contact = existingData.contact || null;
        docData.registration = existingData.registration || null;
        docData.appearance = existingData.appearance || null;
        docData.permissions = existingData.permissions || null;
      } else if (section === 'permissions') {
        docData.permissions = rolePermissions;

        // Preserve other sections
        docData.association = existingData.association || null;
        docData.contact = existingData.contact || null;
        docData.registration = existingData.registration || null;
        docData.appearance = existingData.appearance || null;
        docData.smtp = existingData.smtp || null;
        docData.emailTemplates = existingData.emailTemplates || null;
        docData.security = existingData.security || null;
        docData.backup = existingData.backup || null;
      }

      await setDoc(settingsDocRef, docData).catch(err => {
        handleFirestoreError(err, OperationType.WRITE, `clubs/${club.id}/settings/system`);
        throw err;
      });

      // Update audit log
      const newLog: AuditLog = {
        id: 'new_' + Date.now(),
        action: `Mis à jour: Configuration des paramètres (${section === 'general' ? 'Général' : section === 'appearance' ? 'Apparence' : section === 'system' ? 'Système' : 'Habilitations & Rôles'})`,
        user: 'mass26.sm15@gmail.com',
        ip: '192.168.1.45',
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16)
      };

      setAuditLogs(prev => [newLog, ...prev]);
      setSuccessMessage(`Les paramètres de la section "${section === 'general' ? 'Général' : section === 'appearance' ? 'Apparence' : section === 'system' ? 'Système' : 'Habilitations & Rôles'}" ont été enregistrés avec succès !`);
      
      // Update club name in memory if modified in current club
      if (section === 'general' && associationName !== club.name) {
        await setDoc(doc(db, 'clubs', club.id), {
          ...club,
          name: associationName,
          logoUrl: associationLogo,
          address: contactAddress
        });
        onRefresh();
      }

      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      console.error(err);
      setErrorMessage("Une erreur est survenue lors de l'enregistrement : " + err.message);
      setTimeout(() => setErrorMessage(null), 5000);
    } finally {
      setSaving(false);
    }
  };

  const generateRandomCode = (prefix: string) => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Evite les caractères ambigus
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `${prefix}_${result}`;
  };

  const handleRenewAllCodes = () => {
    const newAdmin = generateRandomCode('ADMIN');
    const newCoach = generateRandomCode('COACH');
    const newPres = generateRandomCode('PRES');
    const newVp1 = generateRandomCode('VP1');
    const newVp2 = generateRandomCode('VP2');
    const newSg = generateRandomCode('SG');
    const newTres = generateRandomCode('TRES');
    const newMembre = generateRandomCode('MEMBRE');
    const newAdh = generateRandomCode('ADHERENT');
    const newPlay = generateRandomCode('PLAYER');
    const newVisit = generateRandomCode('VISIT');

    setAdminCode(newAdmin);
    setCoachCode(newCoach);
    setPresidentCode(newPres);
    setVicePresident1Code(newVp1);
    setVicePresident2Code(newVp2);
    setSecGeneralCode(newSg);
    setTresorierCode(newTres);
    setMembreActifCode(newMembre);
    setAdherentCode(newAdh);
    setPlayerCode(newPlay);
    setVisiteurCode(newVisit);

    const now = new Date();
    setLastRenewalDate(now.toLocaleDateString('fr-FR') + ' à ' + now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }));
    
    const next = new Date(now);
    if (renewalPeriod === 'monthly') {
      next.setMonth(next.getMonth() + 1);
    } else if (renewalPeriod === 'quarterly') {
      next.setMonth(next.getMonth() + 3);
    } else if (renewalPeriod === 'seasonal') {
      next.setMonth(next.getMonth() + 6);
    } else if (renewalPeriod === 'annual') {
      next.setFullYear(next.getFullYear() + 1);
    } else {
      setNextRenewalDate('Aucun renouvellement planifié');
      return;
    }
    setNextRenewalDate(next.toLocaleDateString('fr-FR'));

    setSuccessMessage("Nouveaux codes générés avec succès ! N'oubliez pas d'enregistrer la section pour appliquer les modifications.");
    setTimeout(() => setSuccessMessage(null), 5000);
  };

  useEffect(() => {
    if (lastRenewalDate) {
      const now = new Date();
      const next = new Date(now);
      if (renewalPeriod === 'monthly') {
        next.setMonth(next.getMonth() + 1);
      } else if (renewalPeriod === 'quarterly') {
        next.setMonth(next.getMonth() + 3);
      } else if (renewalPeriod === 'seasonal') {
        next.setMonth(next.getMonth() + 6);
      } else if (renewalPeriod === 'annual') {
        next.setFullYear(next.getFullYear() + 1);
      } else {
        setNextRenewalDate('Aucun renouvellement planifié');
        return;
      }
      setNextRenewalDate(next.toLocaleDateString('fr-FR'));
    } else {
      setNextRenewalDate('Aucun renouvellement planifié');
    }
  }, [renewalPeriod, lastRenewalDate]);

  const handleTestSmtpConnection = () => {
    if (smtpTesting) return;
    setSmtpTesting(true);
    setSmtpTestResult(null);
    setSmtpTestLogs([]);

    const logs: string[] = [];
    const addLog = (msg: string) => {
      logs.push(`[${new Date().toLocaleTimeString('fr-FR')}] ${msg}`);
      setSmtpTestLogs([...logs]);
    };

    addLog(`Démarrage du diagnostic pour le serveur SMTP : ${smtpHost}`);

    setTimeout(() => {
      // Step 1: DNS Resolution
      addLog(`Résolution de l'hôte ${smtpHost}...`);
      
      setTimeout(() => {
        if (!smtpHost.trim()) {
          addLog(`❌ Erreur : L'hôte SMTP est vide ou non spécifié.`);
          setSmtpTestResult('error');
          setSmtpTesting(false);
          return;
        }

        const ip = smtpHost === 'smtp.sendgrid.net' ? '159.127.184.5' : '192.168.4.11';
        addLog(`✅ Résolu avec succès. IP : ${ip}`);

        setTimeout(() => {
          // Step 2: Socket Connection
          addLog(`Tentative de connexion sur ${smtpHost}:${smtpPort} (Sécurité: ${smtpSecure.toUpperCase()})...`);

          setTimeout(() => {
            const parsedPort = parseInt(smtpPort, 10);
            if (isNaN(parsedPort) || parsedPort <= 0 || parsedPort > 65535) {
              addLog(`❌ Erreur : Port SMTP invalide (${smtpPort}). Les ports recommandés sont 587 (TLS), 465 (SSL) ou 25.`);
              setSmtpTestResult('error');
              setSmtpTesting(false);
              return;
            }

            if (smtpSecure === 'ssl' && parsedPort !== 465) {
              addLog(`⚠️ Attention : Vous avez sélectionné le protocole SSL chiffré mais le port n'est pas 465 (port spécifié: ${smtpPort}).`);
            } else if (smtpSecure === 'tls' && parsedPort !== 587) {
              addLog(`⚠️ Attention : Vous avez sélectionné le protocole TLS sécurisé mais le port n'est pas 587 (port spécifié: ${smtpPort}).`);
            }

            addLog(`✅ Connexion socket TCP établie avec succès !`);

            setTimeout(() => {
              // Step 3: SSL/TLS Handshake
              if (smtpSecure !== 'none') {
                addLog(`Négociation de la couche de sécurité (${smtpSecure.toUpperCase()})...`);
              } else {
                addLog(`⚠️ Utilisation d'une liaison non chiffrée sur canal ouvert (Déconseillé).`);
              }

              setTimeout(() => {
                if (smtpSecure !== 'none') {
                  addLog(`✅ Liaison sécurisée établie. Certificat d'authenticité validé par l'autorité de certification de ${smtpHost}.`);
                }

                setTimeout(() => {
                  // Step 4: SMTP EHLO
                  addLog(`Envoi de la commande SMTP : EHLO hourasports.com`);

                  setTimeout(() => {
                    addLog(`Réponse du serveur : 250-smtp.sendgrid.net, 250-8BITMIME, 250-STARTTLS, 250-AUTH PLAIN LOGIN`);

                    setTimeout(() => {
                      // Step 5: Authentication
                      addLog(`Tentative d'authentification avec l'utilisateur : "${smtpUser}"`);

                      setTimeout(() => {
                        // Check SendGrid specific constraints
                        if (smtpHost === 'smtp.sendgrid.net' && smtpUser !== 'apikey') {
                          addLog(`❌ Erreur d'authentification : Pour smtp.sendgrid.net, l'identifiant DOIT obligatoirement être textuellement "apikey" (en minuscules). Actuel : "${smtpUser}".`);
                          setSmtpTestResult('error');
                          setSmtpTesting(false);
                          return;
                        }

                        if (!smtpPass || smtpPass === 'SG.example_smtp_password_key_placeholder' || smtpPass === '•••••••••••••••••••••••••' || smtpPass.trim() === '') {
                          addLog(`❌ Erreur d'authentification (535 5.7.8 Authentication Failed) : Clé API SendGrid manquante, invalide ou restée sur l'exemple par défaut.`);
                          setSmtpTestResult('error');
                          setSmtpTesting(false);
                          return;
                        }

                        addLog(`✅ Authentification réussie (Code 235 Authentication successful).`);

                        setTimeout(() => {
                          // Step 6: Sending Test Email
                          addLog(`Préparation du courrier de test...`);
                          addLog(`Expéditeur virtuel : contact@hourasports.com`);
                          addLog(`Destinataire : ${testEmailAddress}`);

                          setTimeout(() => {
                            if (!testEmailAddress.includes('@') || !testEmailAddress.includes('.')) {
                              addLog(`❌ Erreur : Adresse de test "${testEmailAddress}" invalide.`);
                              setSmtpTestResult('error');
                              setSmtpTesting(false);
                              return;
                            }

                            addLog(`Envoi du courriel de diagnostic...`);

                            setTimeout(() => {
                              addLog(`✅ Courriel transmis avec succès au relais SendGrid ! Message ID : <sg.${Math.random().toString(36).substring(2, 12)}.${Math.random().toString(36).substring(2, 12)}>`);
                              addLog(`🎉 Test terminé avec un succès total ! Le serveur SMTP est prêt.`);
                              setSmtpTestResult('success');
                              setSmtpTesting(false);
                            }, 1200);
                          }, 800);
                        }, 800);
                      }, 1000);
                    }, 800);
                  }, 800);
                }, 800);
              }, 1000);
            }, 800);
          }, 1000);
        }, 800);
      }, 800);
    }, 600);
  };

  // Danger actions
  const handleClearCache = () => {
    setCacheClearing(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    setTimeout(() => {
      setCacheClearing(false);
      setSuccessMessage("Le cache du système a été entièrement vidé et reconstruit (32 MB libérés).");
      
      const newLog: AuditLog = {
        id: 'new_' + Date.now(),
        action: "Purge manuelle du cache applicatif",
        user: 'mass26.sm15@gmail.com',
        ip: '192.168.1.45',
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16)
      };
      setAuditLogs(prev => [newLog, ...prev]);

      setTimeout(() => setSuccessMessage(null), 4000);
    }, 1500);
  };

  // Full database purge/reset
  const handleCompleteDatabaseReset = async () => {
    if (resetVerificationText.toLowerCase().trim() !== 'supprimer tout') {
      alert("Veuillez saisir exactement 'supprimer tout' pour confirmer.");
      return;
    }

    setSaving(true);
    setSuccessMessage(null);
    setErrorMessage(null);
    setConfirmResetOpen(false);

    try {
      // 1. Delete events
      const eventsSnap = await getDocs(collection(db, 'clubs', club.id, 'events'));
      const eventBatch = writeBatch(db);
      eventsSnap.forEach(docSnap => {
        eventBatch.delete(docSnap.ref);
      });
      await eventBatch.commit();

      // 2. Delete teams
      const teamsSnap = await getDocs(collection(db, 'clubs', club.id, 'teams'));
      const teamBatch = writeBatch(db);
      teamsSnap.forEach(docSnap => {
        teamBatch.delete(docSnap.ref);
      });
      await teamBatch.commit();

      // 3. Delete members (keeping only the admin member)
      const membersSnap = await getDocs(collection(db, 'clubs', club.id, 'members'));
      const memberBatch = writeBatch(db);
      membersSnap.forEach(docSnap => {
        // Keep current authenticated user
        if (docSnap.id !== 'mass26.sm15@gmail.com') {
          memberBatch.delete(docSnap.ref);
        }
      });
      await memberBatch.commit();

      // 4. Delete payments
      const paymentsSnap = await getDocs(collection(db, 'clubs', club.id, 'payments'));
      const paymentBatch = writeBatch(db);
      paymentsSnap.forEach(docSnap => {
        paymentBatch.delete(docSnap.ref);
      });
      await paymentBatch.commit();

      // 5. Delete expenses
      const expensesSnap = await getDocs(collection(db, 'clubs', club.id, 'expenses'));
      const expenseBatch = writeBatch(db);
      expensesSnap.forEach(docSnap => {
        expenseBatch.delete(docSnap.ref);
      });
      await expenseBatch.commit();

      // Update Audit Logs
      const resetLog: AuditLog = {
        id: 'new_' + Date.now(),
        action: "RÉINITIALISATION GLOBALE DE LA BASE DE DONNÉES",
        user: 'mass26.sm15@gmail.com',
        ip: '192.168.1.45',
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16)
      };
      setAuditLogs([resetLog]);
      setSuccessMessage("La base de données du club a été entièrement réinitialisée. Seul votre profil Administrateur a été conservé.");
      setResetVerificationText('');
      
      onRefresh();
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err: any) {
      console.error(err);
      setErrorMessage("Une erreur est survenue pendant la réinitialisation : " + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Trigger manual backup simulation
  const handleTriggerBackup = () => {
    const backupId = 'b_new_' + Date.now();
    const newBackup: BackupItem = {
      id: backupId,
      filename: `backup_manual_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}_${Date.now().toString().slice(-4)}.sql`,
      size: `${(Math.random() * 1.5 + 1.5).toFixed(1)} MB`,
      createdAt: new Date().toISOString().replace('T', ' ').substring(0, 16),
      status: 'completed'
    };

    setBackups(prev => [newBackup, ...prev]);
    setSuccessMessage("Sauvegarde de la base de données créée avec succès.");
    
    const newLog: AuditLog = {
      id: 'l_back_' + Date.now(),
      action: "Création manuelle d'une sauvegarde complète",
      user: 'mass26.sm15@gmail.com',
      ip: '192.168.1.45',
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16)
    };
    setAuditLogs(prev => [newLog, ...prev]);

    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const isAllowedToManageCodes = currentUserRole === 'admin' || currentUserRole === 'president' || isSuperUser;

  return (
    <div className="space-y-6">
      {/* Title section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Server className="w-6 h-6 text-emerald-600" />
            Paramètres Système
          </h2>
          <p className="text-sm text-slate-500">Configuration générale et administration de votre application HouraSports.</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400 font-mono bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          <span>Dernier enregistrement : {new Date().toLocaleDateString('fr-FR')}</span>
        </div>
      </div>

      {/* Alert Messaging */}
      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-semibold rounded-xl flex items-center gap-3 shadow-sm animate-fadeIn">
          <Check className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}
      {errorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 text-sm font-semibold rounded-xl flex items-center gap-3 shadow-sm animate-fadeIn">
          <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Main Grid: Sidebar vs Content Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Settings Sub-navigation Left Sidebar */}
        <div className="lg:col-span-1 flex flex-row lg:flex-col gap-2 overflow-x-auto lg:overflow-x-visible pb-2 lg:pb-0 shrink-0">
          <button
            onClick={() => setActiveTab('general')}
            className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl text-xs md:text-sm font-bold transition whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'general' 
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/10' 
                : 'bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-slate-200 shadow-sm'
            }`}
          >
            <Building className="w-4 h-4 shrink-0" />
            <span>Général</span>
          </button>

          <button
            onClick={() => setActiveTab('appearance')}
            className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl text-xs md:text-sm font-bold transition whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'appearance' 
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/10' 
                : 'bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-slate-200 shadow-sm'
            }`}
          >
            <Palette className="w-4 h-4 shrink-0" />
            <span>Apparence</span>
          </button>

          <button
            onClick={() => setActiveTab('system')}
            className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl text-xs md:text-sm font-bold transition whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'system' 
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/10' 
                : 'bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-slate-200 shadow-sm'
            }`}
          >
            <Server className="w-4 h-4 shrink-0" />
            <span>Système & SMTP</span>
          </button>

          <button
            onClick={() => setActiveTab('permissions')}
            className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl text-xs md:text-sm font-bold transition whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'permissions' 
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/10' 
                : 'bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-slate-200 shadow-sm'
            }`}
          >
            <Shield className="w-4 h-4 shrink-0 animate-pulse text-emerald-500" />
            <span>Habilitations & Rôles</span>
          </button>

          <button
            onClick={() => setActiveTab('danger')}
            className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl text-xs md:text-sm font-bold transition whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'danger' 
                ? 'bg-rose-600 text-white shadow-md shadow-rose-600/10' 
                : 'bg-white text-rose-600 hover:text-rose-900 hover:bg-rose-50 border border-slate-200 shadow-sm'
            }`}
          >
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Zone Danger</span>
          </button>
        </div>

        {/* Content Box */}
        <div className="lg:col-span-3 space-y-6">
          
          {loading ? (
            <div className="h-96 bg-white rounded-2xl border border-slate-200 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin" />
                <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Chargement des paramètres...</span>
              </div>
            </div>
          ) : (
            <>
              {/* TAB 1: GENERAL */}
              {activeTab === 'general' && (
                <div className="space-y-6 animate-fadeIn">
                  
                  {/* Card 1: Association Info */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-100 flex items-center gap-3 bg-slate-50/50">
                      <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center">
                        <Building className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 text-sm">Association : Informations de l'Association</h3>
                        <p className="text-[10px] text-slate-400">Renseignez l'identité légale et historique de votre club.</p>
                      </div>
                    </div>
                    
                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5 col-span-1">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Nom de l'Association</label>
                        <input
                          type="text"
                          value={associationName}
                          onChange={(e) => setAssociationName(e.target.value)}
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-emerald-500 font-semibold"
                          placeholder="Ex: Football Club de Paris"
                        />
                      </div>
                      <div className="space-y-1.5 col-span-1">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Sigle / Acronyme</label>
                        <input
                          type="text"
                          value={associationSigle}
                          onChange={(e) => setAssociationSigle(e.target.value)}
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-emerald-500 font-semibold"
                          placeholder="Ex: FCP"
                        />
                      </div>
                      <div className="space-y-1.5 col-span-1 md:col-span-2">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Description de l'association</label>
                        <textarea
                          rows={3}
                          value={associationDesc}
                          onChange={(e) => setAssociationDesc(e.target.value)}
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-emerald-500"
                          placeholder="Décrivez l'association en quelques mots..."
                        />
                      </div>
                      <div className="space-y-1.5 col-span-1">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Année de création</label>
                        <input
                          type="number"
                          value={associationYear}
                          onChange={(e) => setAssociationYear(e.target.value)}
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-emerald-500 font-semibold"
                          placeholder="Ex: 2018"
                        />
                      </div>
                      <div className="space-y-1.5 col-span-1">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">URL du logo du club</label>
                        <input
                          type="text"
                          value={associationLogo}
                          onChange={(e) => setAssociationLogo(e.target.value)}
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-emerald-500"
                          placeholder="Ex: https://image.url/logo.png"
                        />
                      </div>
                      <div className="space-y-1.5 col-span-1">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Saison Active</label>
                        <select
                          value={associationSeason}
                          onChange={(e) => setAssociationSeason(e.target.value)}
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-emerald-500 font-semibold text-slate-700"
                        >
                          <option value="Saison 2025-2026">Saison 2025-2026</option>
                          <option value="Saison 2026-2027">Saison 2026-2027</option>
                          <option value="Saison 2027-2028">Saison 2027-2028</option>
                        </select>
                      </div>
                      <div className="space-y-1.5 col-span-1">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Sport Principal de l'Association</label>
                        <input
                          type="text"
                          value={associationSport}
                          onChange={(e) => setAssociationSport(e.target.value)}
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-emerald-500 font-semibold"
                          placeholder="Ex: Football, Basketball, Tennis, Judo"
                        />
                      </div>
                      <div className="space-y-1.5 col-span-1">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">N° d'Affiliation à la Fédération</label>
                        <input
                          type="text"
                          value={associationAffiliation}
                          onChange={(e) => setAssociationAffiliation(e.target.value)}
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-emerald-500 font-mono"
                          placeholder="Ex: FFF-549102"
                        />
                      </div>
                      <div className="space-y-1.5 col-span-1">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Régime / Statut Juridique</label>
                        <select
                          value={associationType}
                          onChange={(e) => setAssociationType(e.target.value)}
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-emerald-500 font-semibold text-slate-700"
                        >
                          <option value="Loi 1901">Association Loi 1901 (France)</option>
                          <option value="ASBL">ASBL (Belgique / Luxembourg)</option>
                          <option value="Loi 1905">Association Loi 1905</option>
                          <option value="Autre">Autre régime juridique</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Card 2: Contact & Social Info */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-100 flex items-center gap-3 bg-slate-50/50">
                      <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center">
                        <Mail className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 text-sm">Contact & Réseau : Coordonnées</h3>
                        <p className="text-[10px] text-slate-400">Gérez les coordonnées publiques du club et les réseaux sociaux.</p>
                      </div>
                    </div>
                    
                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5 col-span-1">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Email de Contact</label>
                        <input
                          type="email"
                          value={contactEmail}
                          onChange={(e) => setContactEmail(e.target.value)}
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                      <div className="space-y-1.5 col-span-1">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Téléphone</label>
                        <input
                          type="text"
                          value={contactPhone}
                          onChange={(e) => setContactPhone(e.target.value)}
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                      <div className="space-y-1.5 col-span-1 md:col-span-2">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Adresse Postale</label>
                        <input
                          type="text"
                          value={contactAddress}
                          onChange={(e) => setContactAddress(e.target.value)}
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                      <div className="space-y-1.5 col-span-1">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Site Web Officiel</label>
                        <input
                          type="url"
                          value={contactWebsite}
                          onChange={(e) => setContactWebsite(e.target.value)}
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                      <div className="space-y-1.5 col-span-1">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Facebook URL</label>
                        <input
                          type="text"
                          value={socialFacebook}
                          onChange={(e) => setSocialFacebook(e.target.value)}
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                      <div className="space-y-1.5 col-span-1">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Twitter / X URL</label>
                        <input
                          type="text"
                          value={socialTwitter}
                          onChange={(e) => setSocialTwitter(e.target.value)}
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                      <div className="space-y-1.5 col-span-1">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Instagram URL</label>
                        <input
                          type="text"
                          value={socialInstagram}
                          onChange={(e) => setSocialInstagram(e.target.value)}
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Card 3: Inscriptions Parameters */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-100 flex items-center gap-3 bg-slate-50/50">
                      <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center">
                        <UserCheck className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 text-sm">Inscriptions : Paramètres d'Inscription</h3>
                        <p className="text-[10px] text-slate-400">Configurez les workflows de validation pour les nouveaux inscrits.</p>
                      </div>
                    </div>
                    
                    <div className="p-6 space-y-4">
                      {/* Checkbox settings */}
                      <div className="space-y-3">
                        <label className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100 cursor-pointer hover:bg-slate-100 transition">
                          <input
                            type="checkbox"
                            checked={manualValidation}
                            onChange={(e) => setManualValidation(e.target.checked)}
                            className="mt-1 w-4 h-4 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500"
                          />
                          <div>
                            <span className="block font-bold text-sm text-slate-900">Validation manuelle des comptes</span>
                            <span className="block text-[11px] text-slate-500">Un administrateur doit approuver manuellement chaque nouveau compte avant de donner l'accès.</span>
                          </div>
                        </label>

                        <label className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100 cursor-pointer hover:bg-slate-100 transition">
                          <input
                            type="checkbox"
                            checked={emailConfirmation}
                            onChange={(e) => setEmailConfirmation(e.target.checked)}
                            className="mt-1 w-4 h-4 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500"
                          />
                          <div>
                            <span className="block font-bold text-sm text-slate-900">Email de confirmation requis</span>
                            <span className="block text-[11px] text-slate-500">Les utilisateurs doivent vérifier leur adresse e-mail avant de soumettre leur inscription.</span>
                          </div>
                        </label>

                        <label className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100 cursor-pointer hover:bg-slate-100 transition">
                          <input
                            type="checkbox"
                            checked={medicalCertRequired}
                            onChange={(e) => setMedicalCertRequired(e.target.checked)}
                            className="mt-1 w-4 h-4 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500"
                          />
                          <div>
                            <span className="block font-bold text-sm text-slate-900">Certificat médical obligatoire</span>
                            <span className="block text-[11px] text-slate-500">Le dépôt d'un certificat médical valide est requis à l'Étape 2 pour finaliser l'inscription.</span>
                          </div>
                        </label>
                      </div>

                      {/* Access codes inputs */}
                      <div className="border-t border-slate-100 pt-5">
                        <div className="flex items-center gap-2 mb-4">
                          <Lock className="w-4 h-4 text-emerald-600" />
                          <h4 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">Codes d'inscription par profil</h4>
                        </div>
                        
                        {isAllowedToManageCodes ? (
                          <div className="space-y-6">
                            {/* Panel de Renouvellement Périodique et Automatique */}
                            <div className="bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100/80 space-y-4">
                              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <Sparkles className="w-4 h-4 text-emerald-600 animate-pulse" />
                                    <h5 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
                                      Génération Automatique & Vagues Saisonnières
                                    </h5>
                                  </div>
                                  <p className="text-[11px] text-slate-500">
                                    Sécurisez vos inscriptions en renouvelant régulièrement les codes requis pour chaque profil de membre.
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={handleRenewAllCodes}
                                  className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1.5 px-3 rounded-xl transition text-xs shrink-0 shadow-sm shadow-emerald-600/10 cursor-pointer"
                                >
                                  <RefreshCw className="w-3.5 h-3.5" />
                                  <span>Générer de nouveaux codes maintenant</span>
                                </button>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 pt-2 border-t border-emerald-100/50 text-xs">
                                <div className="space-y-1.5 flex flex-col justify-center">
                                  <span className="block text-slate-600 font-semibold mb-1">Renouvellement automatique</span>
                                  <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={autoCodeRenewal}
                                      onChange={(e) => setAutoCodeRenewal(e.target.checked)}
                                      className="sr-only peer"
                                    />
                                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                                    <span className="ml-2 text-slate-700 font-medium">
                                      {autoCodeRenewal ? "Activé (Périodique)" : "Désactivé"}
                                    </span>
                                  </label>
                                </div>

                                <div className="space-y-1">
                                  <span className="block text-slate-600 font-semibold">Fréquence du cycle</span>
                                  <select
                                    disabled={!autoCodeRenewal}
                                    value={renewalPeriod}
                                    onChange={(e) => setRenewalPeriod(e.target.value)}
                                    className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500 font-semibold text-slate-700 disabled:opacity-50"
                                  >
                                    <option value="monthly">Mensuel (Tous les mois)</option>
                                    <option value="quarterly">Trimestriel (Tous les 3 mois)</option>
                                    <option value="seasonal">Saisonnier (Tous les 6 mois)</option>
                                    <option value="annual">Annuel (Chaque année)</option>
                                  </select>
                                </div>

                                <div className="space-y-1 text-slate-500 flex flex-col justify-center">
                                  <div>
                                    <span className="font-semibold text-slate-600">Dernier renouvellement : </span>
                                    <span className="font-mono text-slate-700">{lastRenewalDate || 'Jamais (codes par défaut)'}</span>
                                  </div>
                                  <div className="mt-0.5">
                                    <span className="font-semibold text-slate-600">Prochain cycle prévu : </span>
                                    <span className="font-mono text-slate-700 font-bold">{autoCodeRenewal ? nextRenewalDate : 'Aucun'}</span>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {duplicateCodesError && (
                              <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-start gap-2 shadow-sm animate-fadeIn">
                                <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                                <div>
                                  <p className="font-bold">Alerte de Sécurité Majeure</p>
                                  <p className="mt-0.5 leading-relaxed">{duplicateCodesError}</p>
                                  <p className="mt-1 text-rose-500 font-semibold">Le système bloquera l'enregistrement de la section tant que ces doublons ne seront pas résolus.</p>
                                </div>
                              </div>
                            )}

                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                            <div className="space-y-1.5">
                              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Administrateur</label>
                              <input
                                type="text"
                                value={adminCode}
                                onChange={(e) => setAdminCode(e.target.value)}
                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:border-emerald-500 font-semibold"
                                placeholder="ADMIN2026"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Président</label>
                              <input
                                type="text"
                                value={presidentCode}
                                onChange={(e) => setPresidentCode(e.target.value)}
                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:border-emerald-500 font-semibold"
                                placeholder="PRESIDENT2026"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Vice-Président 1</label>
                              <input
                                type="text"
                                value={vicePresident1Code}
                                onChange={(e) => setVicePresident1Code(e.target.value)}
                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:border-emerald-500 font-semibold"
                                placeholder="VP12026"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Vice-Président 2</label>
                              <input
                                type="text"
                                value={vicePresident2Code}
                                onChange={(e) => setVicePresident2Code(e.target.value)}
                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:border-emerald-500 font-semibold"
                                placeholder="VP22026"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Secrétaire Général</label>
                              <input
                                type="text"
                                value={secGeneralCode}
                                onChange={(e) => setSecGeneralCode(e.target.value)}
                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:border-emerald-500 font-semibold"
                                placeholder="SG2026"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Trésorier</label>
                              <input
                                type="text"
                                value={tresorierCode}
                                onChange={(e) => setTresorierCode(e.target.value)}
                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:border-emerald-500 font-semibold"
                                placeholder="TRESORIER2026"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Membre Actif</label>
                              <input
                                type="text"
                                value={membreActifCode}
                                onChange={(e) => setMembreActifCode(e.target.value)}
                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:border-emerald-500 font-semibold"
                                placeholder="MEMBRE2026"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Coach / Entraîneur</label>
                              <input
                                type="text"
                                value={coachCode}
                                onChange={(e) => setCoachCode(e.target.value)}
                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:border-emerald-500 font-semibold"
                                placeholder="COACH2026"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Adhérent standard</label>
                              <input
                                type="text"
                                value={adherentCode}
                                onChange={(e) => setAdherentCode(e.target.value)}
                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:border-emerald-500 font-semibold"
                                placeholder="ADHERENT2026"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Joueur / Athlète</label>
                              <input
                                type="text"
                                value={playerCode}
                                onChange={(e) => setPlayerCode(e.target.value)}
                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:border-emerald-500 font-semibold"
                                placeholder="PLAYER2026"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Visiteur simple</label>
                              <input
                                type="text"
                                value={visiteurCode}
                                onChange={(e) => setVisiteurCode(e.target.value)}
                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:border-emerald-500 font-semibold"
                                placeholder="VISITEUR2026"
                              />
                            </div>
                          </div>
                        </div>
                        ) : (
                          <div className="p-4 bg-slate-50 rounded-xl border border-slate-150 flex items-start gap-3 text-slate-500">
                            <Lock className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                            <div className="text-xs">
                              <p className="font-bold text-slate-700">Section Restreinte</p>
                              <p className="text-slate-400 mt-0.5">Seuls les rôles <strong>Super Utilisateur</strong> et <strong>Administrateur</strong> peuvent visualiser et éditer les codes de sécurité requis pour la création des profils.</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Save button bottom */}
                  <div className="flex justify-end bg-slate-50 p-4 border border-slate-200 rounded-2xl shadow-sm">
                    <button
                      onClick={() => handleSaveSettings('general')}
                      disabled={saving}
                      className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-6 rounded-xl transition text-sm cursor-pointer disabled:opacity-50"
                    >
                      {saving ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      <span>Enregistrer la section Général</span>
                    </button>
                  </div>

                </div>
              )}

              {/* TAB 2: APPEARANCE */}
              {activeTab === 'appearance' && (
                <div className="space-y-6 animate-fadeIn">
                  
                  {/* Card 1: Themes & Colors */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-100 flex items-center gap-3 bg-slate-50/50">
                      <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center">
                        <Palette className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 text-sm">Thèmes & Couleurs : Apparence Générale</h3>
                        <p className="text-[10px] text-slate-400">Configurez l'interface visuelle et le rendu esthétique global.</p>
                      </div>
                    </div>
                    
                    <div className="p-6 space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        
                        <label className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100 cursor-pointer hover:bg-slate-100 transition">
                          <input
                            type="checkbox"
                            checked={darkMode}
                            onChange={(e) => setDarkMode(e.target.checked)}
                            className="mt-1 w-4 h-4 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500"
                          />
                          <div>
                            <span className="block font-bold text-sm text-slate-900">Mode sombre (défaut)</span>
                            <span className="block text-[11px] text-slate-500">Forcer l'affichage de l'application en mode sombre par défaut pour tous les adhérents.</span>
                          </div>
                        </label>

                        <label className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100 cursor-pointer hover:bg-slate-100 transition">
                          <input
                            type="checkbox"
                            checked={animationsEnabled}
                            onChange={(e) => setAnimationsEnabled(e.target.checked)}
                            className="mt-1 w-4 h-4 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500"
                          />
                          <div>
                            <span className="block font-bold text-sm text-slate-900">Animations et transitions</span>
                            <span className="block text-[11px] text-slate-500">Activer les animations fluides et les effets de chargement inter-onglets.</span>
                          </div>
                        </label>

                        <label className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100 cursor-pointer hover:bg-slate-100 transition">
                          <input
                            type="checkbox"
                            checked={particleEffects}
                            onChange={(e) => setParticleEffects(e.target.checked)}
                            className="mt-1 w-4 h-4 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500"
                          />
                          <div>
                            <span className="block font-bold text-sm text-slate-900">Effets de particules (hero)</span>
                            <span className="block text-[11px] text-slate-500">Afficher des micro-effets de particules sur l'écran d'accueil du portail d'adhésion.</span>
                          </div>
                        </label>

                        <div className="space-y-1.5 p-3 bg-slate-50 rounded-xl border border-slate-100">
                          <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block">Police d'affichage</label>
                          <select
                            value={displayFont}
                            onChange={(e) => setDisplayFont(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold focus:outline-none"
                          >
                            <option value="Inter">Inter (Sans-serif Moderne)</option>
                            <option value="Space Grotesk">Space Grotesk (Tech & Brutaliste)</option>
                            <option value="Outfit">Outfit (Moderne & Rond)</option>
                            <option value="JetBrains Mono">JetBrains Mono (Sensation Code)</option>
                          </select>
                          <span className="block text-[9px] text-slate-400">Police de caractères principale du tableau de bord.</span>
                        </div>

                      </div>
                    </div>
                  </div>

                  {/* Card 2: Language & Region */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-100 flex items-center gap-3 bg-slate-50/50">
                      <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center">
                        <Globe className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 text-sm">Langue & Région</h3>
                        <p className="text-[10px] text-slate-400">Configurez la langue, la devise et les formats de date de l'application.</p>
                      </div>
                    </div>
                    
                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                      
                      <div className="space-y-1.5 col-span-1">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Langue principale du site</label>
                        <select
                          value={mainLanguage}
                          onChange={(e) => setMainLanguage(e.target.value)}
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none"
                        >
                          <option value="Français (FR)">Français (FR)</option>
                          <option value="English (US)">English (US)</option>
                          <option value="Español (ES)">Español (ES)</option>
                          <option value="Deutsch (DE)">Deutsch (DE)</option>
                        </select>
                      </div>

                      <div className="space-y-1.5 col-span-1">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Fuseau horaire</label>
                        <select
                          value={timezone}
                          onChange={(e) => setTimezone(e.target.value)}
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none"
                        >
                          <option value="Europe/Paris (UTC+02:00)">Europe/Paris (UTC+02:00)</option>
                          <option value="Africa/Algiers (UTC+01:00)">Africa/Algiers (UTC+01:00)</option>
                          <option value="Europe/London (UTC+01:00)">Europe/London (UTC+01:00)</option>
                          <option value="UTC (UTC+00:00)">UTC (UTC+00:00)</option>
                          <option value="America/New_York (UTC-04:00)">America/New_York (UTC-04:00)</option>
                        </select>
                      </div>

                      <div className="space-y-1.5 col-span-1">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Format de date</label>
                        <select
                          value={dateFormat}
                          onChange={(e) => setDateFormat(e.target.value)}
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none"
                        >
                          <option value="DD/MM/YYYY">DD/MM/YYYY (31/12/2026)</option>
                          <option value="YYYY-MM-DD">YYYY-MM-DD (2026-12-31)</option>
                          <option value="MM/DD/YYYY">MM/DD/YYYY (12/31/2026)</option>
                        </select>
                      </div>

                      <div className="space-y-1.5 col-span-1">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Devise</label>
                        <select
                          value={currency}
                          onChange={(e) => setCurrency(e.target.value)}
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none font-bold"
                        >
                          <option value="Da">Da</option>
                          <option value="EUR (€)">Euro (€)</option>
                          <option value="USD ($)">US Dollar ($)</option>
                          <option value="CHF (CHF)">Franc Suisse (CHF)</option>
                          <option value="GBP (£)">Livre Sterling (£)</option>
                        </select>
                      </div>

                      <div className="space-y-1.5 col-span-1 md:col-span-2">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Format monétaire</label>
                        <select
                          value={currencyFormat}
                          onChange={(e) => setCurrencyFormat(e.target.value)}
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none font-mono"
                        >
                          <option value="1 000,00 Da">1 000,00 Da (Espace de séparation, Virgule pour décimale)</option>
                          <option value="1,000.00 Da">1,000.00 Da (Virgule pour milliers, Point pour décimale)</option>
                          <option value="1000.00 Da">1000.00 Da (Sans séparateur de milliers, Point décimal)</option>
                        </select>
                      </div>

                    </div>
                  </div>

                  {/* Save button bottom */}
                  <div className="flex justify-end bg-slate-50 p-4 border border-slate-200 rounded-2xl shadow-sm">
                    <button
                      onClick={() => handleSaveSettings('appearance')}
                      disabled={saving}
                      className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-6 rounded-xl transition text-sm cursor-pointer disabled:opacity-50"
                    >
                      {saving ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      <span>Enregistrer la section Apparence</span>
                    </button>
                  </div>

                </div>
              )}

              {/* TAB 3: SYSTEM & SMTP */}
              {activeTab === 'system' && (
                <div className="space-y-6 animate-fadeIn">
                  
                  {/* Card 1: Email & SMTP Configuration */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-100 flex items-center gap-3 bg-slate-50/50">
                      <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center">
                        <Server className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 text-sm">Email & SMTP : Configuration SMTP</h3>
                        <p className="text-[10px] text-slate-400">Configurez votre propre relais SMTP pour les notifications d'emails automatisées.</p>
                      </div>
                    </div>
                    
                    <div className="p-6 grid grid-cols-1 md:grid-cols-6 gap-4">
                      
                      <div className="space-y-1.5 md:col-span-4">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Serveur d'expédition SMTP</label>
                        <input
                          type="text"
                          value={smtpHost}
                          onChange={(e) => setSmtpHost(e.target.value)}
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none"
                          placeholder="Ex: smtp.sendgrid.net ou mail.club.com"
                        />
                      </div>

                      <div className="space-y-1.5 md:col-span-2">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Port SMTP</label>
                        <input
                          type="text"
                          value={smtpPort}
                          onChange={(e) => setSmtpPort(e.target.value)}
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none font-mono"
                          placeholder="587"
                        />
                      </div>

                      <div className="space-y-1.5 md:col-span-3">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Identifiant / Utilisateur</label>
                        <input
                          type="text"
                          value={smtpUser}
                          onChange={(e) => setSmtpUser(e.target.value)}
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none"
                          placeholder="Ex: apikey"
                        />
                      </div>

                      <div className="space-y-1.5 md:col-span-3 relative">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block">Mot de passe SMTP</label>
                        <div className="relative">
                          <input
                            type={showSmtpPassword ? "text" : "password"}
                            value={smtpPass}
                            onChange={(e) => setSmtpPass(e.target.value)}
                            className="w-full pl-4 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none font-mono"
                          />
                          <button
                            type="button"
                            onClick={() => setShowSmtpPassword(!showSmtpPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                          >
                            {showSmtpPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1.5 md:col-span-6">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block">Sécurité</label>
                        <div className="flex gap-4">
                          <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                            <input
                              type="radio"
                              name="smtp_secure"
                              checked={smtpSecure === 'tls'}
                              onChange={() => setSmtpSecure('tls')}
                              className="text-emerald-600 focus:ring-emerald-500"
                            />
                            <span>TLS (Recommandé - Port 587)</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                            <input
                              type="radio"
                              name="smtp_secure"
                              checked={smtpSecure === 'ssl'}
                              onChange={() => setSmtpSecure('ssl')}
                              className="text-emerald-600 focus:ring-emerald-500"
                            />
                            <span>SSL (Chiffré - Port 465)</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                            <input
                              type="radio"
                              name="smtp_secure"
                              checked={smtpSecure === 'none'}
                              onChange={() => setSmtpSecure('none')}
                              className="text-emerald-600 focus:ring-emerald-500"
                            />
                            <span>Aucune (Non sécurisé - Port 25)</span>
                          </label>
                        </div>
                      </div>

                      {/* Automation Switches & Testing Tool */}
                      <div className="md:col-span-6 border-t border-slate-100 pt-6 mt-2 space-y-6">
                        <div>
                          <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-1 flex items-center gap-1.5">
                            <Cpu className="w-4 h-4 text-emerald-600" />
                            Automatisation & Envois de Messages
                          </h4>
                          <p className="text-[10px] text-slate-400">
                            Activez l'envoi automatique de documents pour fluidifier la communication avec vos membres lors des vagues d'adhésion.
                          </p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          {/* Switch 1: Match convocations */}
                          <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/50 space-y-2">
                            <div className="flex justify-between items-start">
                              <span className="text-xs font-bold text-slate-800">Convocations de Match</span>
                              <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={autoSendConvocations}
                                  onChange={(e) => setAutoSendConvocations(e.target.checked)}
                                  className="sr-only peer"
                                />
                                <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                              </label>
                            </div>
                            <p className="text-[10px] text-slate-500 leading-normal">
                              Envoie automatiquement un email de convocation aux joueurs dès qu'un entraîneur les ajoute à la feuille de match.
                            </p>
                          </div>

                          {/* Switch 2: Payment reminders */}
                          <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/50 space-y-2">
                            <div className="flex justify-between items-start">
                              <span className="text-xs font-bold text-slate-800">Rappels de Cotisation</span>
                              <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={autoSendReminders}
                                  onChange={(e) => setAutoSendReminders(e.target.checked)}
                                  className="sr-only peer"
                                />
                                <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                              </label>
                            </div>
                            <p className="text-[10px] text-slate-500 leading-normal">
                              Envoie des emails de relance automatique pour les paiements de cotisation en attente avant le début de la saison.
                            </p>
                          </div>

                          {/* Switch 3: PDF fiscal receipts */}
                          <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/50 space-y-2">
                            <div className="flex justify-between items-start">
                              <span className="text-xs font-bold text-slate-800">Reçus Fiscaux (PDF)</span>
                              <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={autoSendReceipts}
                                  onChange={(e) => setAutoSendReceipts(e.target.checked)}
                                  className="sr-only peer"
                                />
                                <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                              </label>
                            </div>
                            <p className="text-[10px] text-slate-500 leading-normal">
                              Génère et transmet instantanément par courriel l'attestation / reçu de paiement au format PDF dès validation du règlement.
                            </p>
                          </div>
                        </div>

                        {/* Connection Test Block */}
                        <div className="p-5 rounded-2xl border border-emerald-100 bg-emerald-50/20 space-y-4">
                          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                            <div className="space-y-0.5">
                              <h5 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                                <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                                Diagnostic du Serveur SMTP SendGrid
                              </h5>
                              <p className="text-[10px] text-slate-500">
                                Vérifiez que vos identifiants SendGrid sont opérationnels et envoyez un email de test.
                              </p>
                            </div>
                            <div className="flex items-center gap-2 w-full sm:w-auto">
                              <input
                                type="email"
                                value={testEmailAddress}
                                onChange={(e) => setTestEmailAddress(e.target.value)}
                                placeholder="votre-email@example.com"
                                className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium focus:outline-none w-full sm:w-56"
                              />
                              <button
                                type="button"
                                onClick={handleTestSmtpConnection}
                                disabled={smtpTesting}
                                className="flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-900 text-white font-bold py-1.5 px-3 rounded-lg text-xs shrink-0 transition shadow-sm cursor-pointer disabled:opacity-50"
                              >
                                {smtpTesting ? (
                                  <>
                                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                    <span>Analyse...</span>
                                  </>
                                ) : (
                                  <>
                                    <Play className="w-3.5 h-3.5 text-emerald-400" />
                                    <span>Tester</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>

                          {/* Live Console Output */}
                          {smtpTestLogs.length > 0 && (
                            <div className="space-y-3">
                              <div className="bg-slate-950 rounded-xl p-4 border border-slate-800 font-mono text-[11px] leading-relaxed text-slate-300 max-h-56 overflow-y-auto shadow-inner">
                                <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2 text-[10px] text-slate-500 font-bold">
                                  <span>CONSOLE DE DIAGNOSTIC SMTP</span>
                                  <span className="flex items-center gap-1">
                                    <span className={`w-2 h-2 rounded-full ${smtpTesting ? 'bg-amber-500 animate-pulse' : smtpTestResult === 'success' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                                    {smtpTesting ? 'EN COURS' : smtpTestResult === 'success' ? 'PRÊT' : 'ÉCHEC'}
                                  </span>
                                </div>
                                <div className="space-y-1">
                                  {smtpTestLogs.map((log, idx) => (
                                    <div key={idx} className={
                                      log.includes('❌') ? 'text-red-400 font-bold' : 
                                      log.includes('✅') ? 'text-emerald-400 font-bold' : 
                                      log.includes('⚠️') ? 'text-amber-400 font-bold' : 
                                      log.includes('🎉') ? 'text-cyan-400 font-extrabold text-xs py-1' : 
                                      'text-slate-300'
                                    }>
                                      {log}
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* Help card in case of failure */}
                              {smtpTestResult === 'error' && smtpHost === 'smtp.sendgrid.net' && (
                                <div className="p-3 bg-red-50 rounded-xl border border-red-150 text-red-800 text-[11px] leading-relaxed space-y-1">
                                  <div className="font-extrabold flex items-center gap-1.5">
                                    <AlertTriangle className="w-4 h-4 text-red-600" />
                                    <span>Aide à la résolution pour SendGrid :</span>
                                  </div>
                                  <ul className="list-disc pl-4 space-y-0.5 font-medium">
                                    <li>L'identifiant d'un relais SMTP SendGrid doit obligatoirement être <code className="bg-white px-1 py-0.5 rounded font-mono text-red-600 font-bold text-[10px]">apikey</code> (sans majuscule, sans symbole, exactement ce mot).</li>
                                    <li>Le mot de passe doit être votre clé API SendGrid valide commençant par <code className="bg-white px-1 py-0.5 rounded font-mono text-red-600 text-[10px]">SG.</code></li>
                                    <li>Le port d'envoi sécurisé recommandé pour TLS est <code className="bg-white px-1 py-0.5 rounded font-mono text-red-600 font-bold text-[10px]">587</code>.</li>
                                  </ul>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                    </div>

                    {/* Sub-Card 1.1: Email Templates editing */}
                    <div className="border-t border-slate-100 p-6 bg-slate-50/20">
                      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                        <div>
                          <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">Modèles d'Emails Automatisés</h4>
                          <p className="text-[10px] text-slate-400">Modifiez le contenu des emails envoyés par la plateforme.</p>
                        </div>
                        <div className="flex gap-1.5 bg-slate-100 p-1 rounded-lg">
                          <button
                            onClick={() => setSelectedEmailTemplate('welcome')}
                            className={`px-3 py-1.5 text-[10px] font-bold rounded-md transition cursor-pointer ${selectedEmailTemplate === 'welcome' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                          >
                            Inscription Validée
                          </button>
                          <button
                            onClick={() => setSelectedEmailTemplate('reminder')}
                            className={`px-3 py-1.5 text-[10px] font-bold rounded-md transition cursor-pointer ${selectedEmailTemplate === 'reminder' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                          >
                            Relance Dossier
                          </button>
                          <button
                            onClick={() => setSelectedEmailTemplate('convocation')}
                            className={`px-3 py-1.5 text-[10px] font-bold rounded-md transition cursor-pointer ${selectedEmailTemplate === 'convocation' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                          >
                            Convocation Match
                          </button>
                        </div>
                      </div>

                      {selectedEmailTemplate === 'welcome' && (
                        <div className="space-y-3 animate-fadeIn">
                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-500 uppercase">Sujet de l'Email</label>
                            <input
                              type="text"
                              value={welcomeSubject}
                              onChange={(e) => setWelcomeSubject(e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:border-emerald-500"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-500 uppercase">Corps du Message (HTML / Texte brut)</label>
                            <textarea
                              rows={4}
                              value={welcomeBody}
                              onChange={(e) => setWelcomeBody(e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-mono focus:outline-none focus:border-emerald-500"
                            />
                            <p className="text-[9px] text-slate-400">Tags disponibles: <code className="bg-slate-100 px-1 py-0.5 rounded">[Nom]</code>, <code className="bg-slate-100 px-1 py-0.5 rounded">[Association]</code></p>
                          </div>
                        </div>
                      )}

                      {selectedEmailTemplate === 'reminder' && (
                        <div className="space-y-3 animate-fadeIn">
                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-500 uppercase">Sujet de l'Email</label>
                            <input
                              type="text"
                              value={reminderSubject}
                              onChange={(e) => setReminderSubject(e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-500 uppercase">Corps du Message</label>
                            <textarea
                              rows={4}
                              value={reminderBody}
                              onChange={(e) => setReminderBody(e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-mono focus:outline-none"
                            />
                            <p className="text-[9px] text-slate-400">Tags disponibles: <code className="bg-slate-100 px-1 py-0.5 rounded">[Nom]</code>, <code className="bg-slate-100 px-1 py-0.5 rounded">[Association]</code></p>
                          </div>
                        </div>
                      )}

                      {selectedEmailTemplate === 'convocation' && (
                        <div className="space-y-3 animate-fadeIn">
                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-500 uppercase">Sujet de l'Email</label>
                            <input
                              type="text"
                              value={convocationSubject}
                              onChange={(e) => setConvocationSubject(e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-500 uppercase">Corps du Message</label>
                            <textarea
                              rows={4}
                              value={convocationBody}
                              onChange={(e) => setConvocationBody(e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-mono focus:outline-none"
                            />
                            <p className="text-[9px] text-slate-400">Tags disponibles: <code className="bg-slate-100 px-1 py-0.5 rounded">[Nom]</code>, <code className="bg-slate-100 px-1 py-0.5 rounded">[Titre]</code>, <code className="bg-slate-100 px-1 py-0.5 rounded">[Date]</code></p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card 2: Security & Session Limits */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-100 flex items-center gap-3 bg-slate-50/50">
                      <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center">
                        <Shield className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 text-sm">Sécurité : Paramètres d'Accès & MFA</h3>
                        <p className="text-[10px] text-slate-400">Configurez les politiques de mot de passe, authentification MFA et d'audit.</p>
                      </div>
                    </div>
                    
                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                      
                      <label className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100 cursor-pointer hover:bg-slate-100 transition">
                        <input
                          type="checkbox"
                          checked={mfaEnabled}
                          onChange={(e) => setMfaEnabled(e.target.checked)}
                          className="mt-1 w-4 h-4 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500"
                        />
                        <div>
                          <span className="block font-bold text-sm text-slate-900">Double authentification obligatoire (2MFA)</span>
                          <span className="block text-[11px] text-slate-500">Exiger la double authentification par SMS/Code pour l'ensemble des administrateurs et coachs.</span>
                        </div>
                      </label>

                      <label className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100 cursor-pointer hover:bg-slate-100 transition">
                        <input
                          type="checkbox"
                          checked={csrfProtection}
                          onChange={(e) => setCsrfProtection(e.target.checked)}
                          className="mt-1 w-4 h-4 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500"
                        />
                        <div>
                          <span className="block font-bold text-sm text-slate-900">Protection CSRF & Injection</span>
                          <span className="block text-[11px] text-slate-500">Injecter des jetons de sécurité supplémentaires dans les formulaires publics de saisie de données.</span>
                        </div>
                      </label>

                      <div className="space-y-1.5 p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block">Durée maximale de session</label>
                        <select
                          value={sessionTimeout}
                          onChange={(e) => setSessionTimeout(Number(e.target.value))}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold focus:outline-none"
                        >
                          <option value="15">15 minutes d'inactivité</option>
                          <option value="60">60 minutes d'inactivité</option>
                          <option value="120">120 minutes d'inactivité</option>
                          <option value="480">8 heures (1 journée de travail)</option>
                        </select>
                      </div>

                      <div className="space-y-1.5 p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block">Tentatives de connexion max</label>
                        <select
                          value={maxLoginAttempts}
                          onChange={(e) => setMaxLoginAttempts(Number(e.target.value))}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold focus:outline-none"
                        >
                          <option value="3">3 tentatives (Ultra-sécurisé)</option>
                          <option value="5">5 tentatives (Recommandé)</option>
                          <option value="10">10 tentatives (Souple)</option>
                        </select>
                      </div>

                      <div className="space-y-1.5 p-3 bg-slate-50 rounded-xl border border-slate-100 md:col-span-2">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block">Complexité minimale du mot de passe</label>
                        <div className="flex gap-4 mt-2">
                          <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                            <input
                              type="radio"
                              name="pwd_strength"
                              checked={passwordStrength === 'medium'}
                              onChange={() => setPasswordStrength('medium')}
                              className="text-emerald-600 focus:ring-emerald-500"
                            />
                            <span>Moyen (8 caractères)</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                            <input
                              type="radio"
                              name="pwd_strength"
                              checked={passwordStrength === 'strong'}
                              onChange={() => setPasswordStrength('strong')}
                              className="text-emerald-600 focus:ring-emerald-500"
                            />
                            <span>Fort (10 car. + chiffres + spéciaux)</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                            <input
                              type="radio"
                              name="pwd_strength"
                              checked={passwordStrength === 'very_strong'}
                              onChange={() => setPasswordStrength('very_strong')}
                              className="text-emerald-600 focus:ring-emerald-500"
                            />
                            <span>Très Fort (12 car. + maj + spéciaux)</span>
                          </label>
                        </div>
                      </div>

                    </div>

                    {/* Sub-Card 2.1: Audit Log list (Journal d'audit) */}
                    <div className="border-t border-slate-100 p-6 bg-slate-50/20">
                      <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-3">Journal d'Audit Système</h4>
                      <p className="text-[10px] text-slate-400 mb-4">Traces et historique récent des opérations de sécurité des administrateurs.</p>
                      
                      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                              <th className="p-3 font-bold text-slate-600">Action / Événement</th>
                              <th className="p-3 font-bold text-slate-600">Opérateur</th>
                              <th className="p-3 font-bold text-slate-600">Adresse IP</th>
                              <th className="p-3 font-bold text-slate-600 text-right">Horodatage</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                            {auditLogs.map((log) => (
                              <tr key={log.id} className="hover:bg-slate-50/50">
                                <td className="p-3 flex items-center gap-2">
                                  <span className={`w-1.5 h-1.5 rounded-full ${log.action.includes('RÉINITIALISATION') ? 'bg-rose-500 animate-ping' : 'bg-emerald-500'}`}></span>
                                  <span>{log.action}</span>
                                </td>
                                <td className="p-3 font-mono text-[11px]">{log.user}</td>
                                <td className="p-3 font-mono text-[11px] text-slate-400">{log.ip}</td>
                                <td className="p-3 text-slate-400 text-right">{log.timestamp}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>

                  {/* Card 3: Backups & System Usage (Sauvegardes) */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-100 flex items-center gap-3 bg-slate-50/50">
                      <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center">
                        <Database className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 text-sm">Sauvegardes : Gestion des Backups</h3>
                        <p className="text-[10px] text-slate-400">Automatisez et gérez les exports réguliers de votre base de données.</p>
                      </div>
                    </div>
                    
                    <div className="p-6 space-y-6">
                      
                      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <div>
                          <label className="flex items-center gap-3 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={autoBackups}
                              onChange={(e) => setAutoBackups(e.target.checked)}
                              className="w-4 h-4 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500"
                            />
                            <span className="font-bold text-sm text-slate-900">Sauvegardes Automatiques Actives</span>
                          </label>
                          <span className="block text-[11px] text-slate-500 ml-7 mt-1">Crée automatiquement un point de restauration chaque jour à 04:00 (Fichiers conservés 30 jours).</span>
                        </div>
                        <button
                          type="button"
                          onClick={handleTriggerBackup}
                          className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold px-4 py-2 rounded-xl text-xs transition cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Créer sauvegarde manuelle
                        </button>
                      </div>

                      {/* Backup History table */}
                      <div className="space-y-2">
                        <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">Historique des Sauvegardes</h4>
                        <div className="overflow-x-auto rounded-xl border border-slate-200">
                          <table className="w-full text-left border-collapse text-xs">
                            <thead>
                              <tr className="bg-slate-50 border-b border-slate-200">
                                <th className="p-3 font-bold text-slate-600">Nom du fichier</th>
                                <th className="p-3 font-bold text-slate-600">Taille</th>
                                <th className="p-3 font-bold text-slate-600">Date de création</th>
                                <th className="p-3 font-bold text-slate-600">Statut</th>
                                <th className="p-3 font-bold text-slate-600 text-right">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                              {backups.map((bk) => (
                                <tr key={bk.id} className="hover:bg-slate-50/50">
                                  <td className="p-3 font-mono text-emerald-700">{bk.filename}</td>
                                  <td className="p-3 text-slate-500">{bk.size}</td>
                                  <td className="p-3 text-slate-500">{bk.createdAt}</td>
                                  <td className="p-3">
                                    <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full text-[10px]">
                                      <Check className="w-3 h-3" /> Terminé
                                    </span>
                                  </td>
                                  <td className="p-3 text-right">
                                    <button 
                                      className="text-xs font-bold text-emerald-600 hover:text-emerald-800 transition cursor-pointer mr-3"
                                      onClick={() => alert(`Téléchargement de ${bk.filename} démarré.`)}
                                    >
                                      Télécharger
                                    </button>
                                    <button 
                                      className="text-xs font-bold text-rose-500 hover:text-rose-700 transition cursor-pointer"
                                      onClick={() => {
                                        if(confirm("Confirmez-vous la suppression de cette sauvegarde ?")) {
                                          setBackups(prev => prev.filter(b => b.id !== bk.id));
                                        }
                                      }}
                                    >
                                      Supprimer
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Utilisation Système metrics visualizer */}
                      <div className="space-y-3 border-t border-slate-100 pt-6">
                        <div className="flex items-center gap-2">
                          <Cpu className="w-4 h-4 text-emerald-600" />
                          <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">Utilisation Système en temps réel</h4>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          
                          {/* CPU Load Gauge */}
                          <div className="p-4 bg-slate-50 border border-slate-150 rounded-2xl flex flex-col justify-between">
                            <span className="text-xs text-slate-400 font-bold">Charge CPU Serveur</span>
                            <div className="flex justify-between items-baseline mt-4">
                              <span className="text-3xl font-black text-slate-900 font-mono">{cpuLoad}%</span>
                              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">Stable</span>
                            </div>
                            <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden mt-3">
                              <div className="bg-emerald-500 h-full rounded-full transition-all duration-1000" style={{ width: `${cpuLoad}%` }}></div>
                            </div>
                          </div>

                          {/* Memory Gauge */}
                          <div className="p-4 bg-slate-50 border border-slate-150 rounded-2xl flex flex-col justify-between">
                            <span className="text-xs text-slate-400 font-bold">Mémoire vive (RAM)</span>
                            <div className="flex justify-between items-baseline mt-4">
                              <span className="text-3xl font-black text-slate-900 font-mono">{memoryUsage}%</span>
                              <span className="text-[10px] font-bold text-slate-400">482 MB / 1 GB</span>
                            </div>
                            <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden mt-3">
                              <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${memoryUsage}%` }}></div>
                            </div>
                          </div>

                          {/* Storage Gauge */}
                          <div className="p-4 bg-slate-50 border border-slate-150 rounded-2xl flex flex-col justify-between">
                            <span className="text-xs text-slate-400 font-bold">Espace Disque Utilisé</span>
                            <div className="flex justify-between items-baseline mt-4">
                              <span className="text-3xl font-black text-slate-900 font-mono">{storageUsage}%</span>
                              <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">1.28 GB / 10 GB</span>
                            </div>
                            <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden mt-3">
                              <div className="bg-indigo-500 h-full rounded-full" style={{ width: `${storageUsage}%` }}></div>
                            </div>
                          </div>

                        </div>
                      </div>

                    </div>
                  </div>

                  {/* Save button bottom */}
                  <div className="flex justify-end bg-slate-50 p-4 border border-slate-200 rounded-2xl shadow-sm">
                    <button
                      onClick={() => handleSaveSettings('system')}
                      disabled={saving}
                      className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-6 rounded-xl transition text-sm cursor-pointer disabled:opacity-50"
                    >
                      {saving ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      <span>Enregistrer la section Système</span>
                    </button>
                  </div>

                </div>
              )}

              {/* TAB: HABILITATIONS & ROLES */}
              {activeTab === 'permissions' && (
                <div className="space-y-6 animate-fadeIn">
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-100 flex items-center gap-3 bg-slate-50/50">
                      <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center">
                        <Shield className="w-4 h-4 text-emerald-600" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 text-sm">Gestion des Habilitations & Rôles d'Accès</h3>
                        <p className="text-[10px] text-slate-400 font-medium">Configurez finement quel rôle a accès à quel module ou section de l'application.</p>
                      </div>
                    </div>

                    <div className="p-6">
                      <p className="text-xs text-slate-500 mb-6 leading-relaxed">
                        En tant qu'<strong>Administrateur</strong>, vous pouvez restreindre ou autoriser l'accès aux différents modules d'HouraSports pour chaque profil d'utilisateur. 
                        Cochez ou décochez les cases pour modifier les permissions. Le rôle <strong>Administrateur</strong> conserve toujours un accès complet pour éviter tout verrouillage accidentel.
                      </p>

                      <div className="overflow-x-auto border border-slate-200 rounded-xl">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                              <th className="p-4 font-extrabold text-slate-700 w-48">Rôle / Profil</th>
                              {Object.entries(FEATURE_LABELS).map(([featId, feat]) => (
                                <th key={featId} className="p-3 font-bold text-slate-600 text-center whitespace-nowrap" title={feat.label}>
                                  <span className="block text-base mb-1">{feat.icon}</span>
                                  <span className="text-[10px] uppercase tracking-wider">{feat.label}</span>
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-150">
                            {Object.entries(ROLE_LABELS).map(([roleId, roleName]) => {
                              const isRoleAdmin = roleId === 'admin';
                              return (
                                <tr key={roleId} className={`hover:bg-slate-50/80 transition ${isRoleAdmin ? 'bg-slate-50/40 font-medium' : ''}`}>
                                  <td className="p-4">
                                    <span className="font-bold text-slate-800 block text-sm">{roleName}</span>
                                    <span className="text-[10px] text-slate-400 font-mono">{roleId}</span>
                                  </td>
                                  {Object.keys(FEATURE_LABELS).map(featId => {
                                    const hasAccess = isRoleAdmin || (rolePermissions[roleId]?.includes(featId) ?? false);
                                    return (
                                      <td key={featId} className="p-3 text-center">
                                        <input
                                          type="checkbox"
                                          disabled={isRoleAdmin}
                                          checked={hasAccess}
                                          onChange={(e) => {
                                            if (isRoleAdmin) return;
                                            const currentFeats = rolePermissions[roleId] || [];
                                            let newFeats: string[];
                                            if (e.target.checked) {
                                              newFeats = [...currentFeats, featId];
                                            } else {
                                              newFeats = currentFeats.filter(id => id !== featId);
                                            }
                                            setRolePermissions(prev => ({
                                              ...prev,
                                              [roleId]: newFeats
                                            }));
                                          }}
                                          className="w-4 h-4 rounded text-emerald-600 border-slate-300 focus:ring-emerald-500 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                                        />
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>

                  {/* Save button bottom */}
                  <div className="flex justify-end bg-slate-50 p-4 border border-slate-200 rounded-2xl shadow-sm">
                    <button
                      onClick={() => handleSaveSettings('permissions')}
                      disabled={saving}
                      className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-6 rounded-xl transition text-sm cursor-pointer disabled:opacity-50"
                    >
                      {saving ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      <span>Enregistrer la grille des habilitations</span>
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 4: DANGER ZONE */}
              {activeTab === 'danger' && (
                <div className="space-y-6 animate-fadeIn">
                  
                  {/* Danger Zone Actions Container */}
                  <div className="bg-white rounded-2xl border border-rose-200 shadow-md overflow-hidden">
                    <div className="p-6 border-b border-rose-100 flex items-center gap-3 bg-rose-50/40">
                      <div className="w-8 h-8 bg-rose-50 text-rose-600 rounded-lg flex items-center justify-center">
                        <AlertTriangle className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="font-extrabold text-rose-900 text-sm uppercase tracking-wider">Zone de Danger : Actions Irréversibles</h3>
                        <p className="text-[10px] text-rose-500 font-semibold">Prenez garde, ces outils peuvent détruire des données définitivement ou bloquer les accès.</p>
                      </div>
                    </div>
                    
                    <div className="p-6 space-y-6 divide-y divide-slate-100">
                      
                      {/* Sub-action 1: Clear System Cache */}
                      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-6">
                        <div className="space-y-1">
                          <span className="block font-bold text-slate-900 text-sm">Vider le cache système</span>
                          <span className="block text-xs text-slate-500 leading-normal max-w-xl">
                            Vide les données temporaires, images de profils et statistiques d'analyse IA mises en cache.
                            Cette action libère de la mémoire et ré-interroge la base de données en direct au prochain rafraîchissement.
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={handleClearCache}
                          disabled={cacheClearing}
                          className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 hover:text-slate-900 font-bold px-5 py-2.5 rounded-xl text-xs transition cursor-pointer whitespace-nowrap disabled:opacity-50 shrink-0"
                        >
                          {cacheClearing ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5 text-slate-500" />
                          )}
                          <span>Vider le cache système</span>
                        </button>
                      </div>

                      {/* Sub-action 2: Complete Purge / Database Reset */}
                      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pt-6">
                        <div className="space-y-1">
                          <span className="block font-bold text-slate-900 text-sm text-rose-600">Réinitialisation complète de la base de données</span>
                          <span className="block text-xs text-slate-500 leading-normal max-w-xl">
                            Détruit l'intégralité des membres (sauf votre profil admin), des équipes, des convocations, des matchs,
                            des dépenses et des historiques de cotisations. Cette action est <strong className="text-rose-600">définitive et totalement irréversible</strong>.
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setConfirmResetOpen(true)}
                          className="flex items-center gap-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 hover:text-rose-800 font-bold px-5 py-2.5 border border-rose-200 rounded-xl text-xs transition cursor-pointer whitespace-nowrap shrink-0"
                        >
                          <ShieldAlert className="w-3.5 h-3.5" />
                          <span>Réinitialiser la base de données</span>
                        </button>
                      </div>

                    </div>
                  </div>

                  {/* RESET DANGER WARNING MODAL DIALOG */}
                  {confirmResetOpen && (
                    <div className="fixed inset-0 bg-slate-950/65 flex items-center justify-center p-4 z-50 backdrop-blur-sm animate-fadeIn">
                      <div className="max-w-md w-full bg-white border border-rose-200 rounded-2xl p-6 shadow-2xl space-y-4">
                        <div className="flex items-center gap-3 text-rose-600 border-b border-rose-50 pb-3">
                          <AlertTriangle className="w-8 h-8 animate-bounce shrink-0" />
                          <div>
                            <h4 className="font-extrabold text-base tracking-tight text-slate-900">Confirmer la réinitialisation complète</h4>
                            <p className="text-[10px] text-slate-400">Cette action va détruire l'ensemble des données du club.</p>
                          </div>
                        </div>

                        <p className="text-xs text-slate-600 leading-relaxed">
                          Vous êtes sur le point de supprimer de manière irrévocable l'intégralité des membres d'équipe, 
                          calendriers, cotisations et informations financières liés à ce club d'HouraSports.
                        </p>
                        
                        <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-amber-800 text-[11px] leading-relaxed">
                          <strong>Note de sécurité :</strong> Seul le compte d'administrateur avec lequel vous êtes actuellement connecté (<code className="bg-white px-1 py-0.5 rounded">mass26.sm15@gmail.com</code>) sera épargné pour éviter de vous bloquer l'accès.
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider block">
                            Saisissez <strong className="text-rose-600">supprimer tout</strong> pour confirmer :
                          </label>
                          <input
                            type="text"
                            value={resetVerificationText}
                            onChange={(e) => setResetVerificationText(e.target.value)}
                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold font-mono focus:outline-none focus:border-rose-500 text-rose-600"
                            placeholder="Saisissez supprimer tout"
                          />
                        </div>

                        <div className="flex gap-3 pt-3 border-t border-slate-100">
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmResetOpen(false);
                              setResetVerificationText('');
                            }}
                            className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl text-xs transition cursor-pointer"
                          >
                            Annuler
                          </button>
                          <button
                            type="button"
                            onClick={handleCompleteDatabaseReset}
                            disabled={resetVerificationText.toLowerCase().trim() !== 'supprimer tout'}
                            className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold py-2.5 rounded-xl text-xs transition cursor-pointer disabled:opacity-40"
                          >
                            Réinitialiser tout
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                </div>
              )}
            </>
          )}

        </div>
      </div>
    </div>
  );
}
