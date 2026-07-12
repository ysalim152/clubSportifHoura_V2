import React, { useState, useEffect } from 'react';
import { 
  Trophy, Plus, Search, Calendar, Users, ChevronRight, Play, CheckCircle, 
  Trash2, RefreshCw, X, Award, Shield, FileText, BarChart3, Edit3, Save, Info, List,
  Check, PlayCircle, Star, ArrowRight, TrendingUp, Clock, ChevronLeft, Bell, BellOff, Archive
} from 'lucide-react';
import { collection, doc, setDoc, deleteDoc, getDocs, onSnapshot } from 'firebase/firestore';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { db, auth, handleFirestoreError, OperationType, sanitizeData } from '../firebase';
import { Club, Team, Tournament, TournamentMatch, TournamentNotification } from '../types';
import { generateTournamentPDF } from '../utils/pdfGenerator';

interface TournamentManagerProps {
  club: Club;
  teams: Team[];
  userRole: string;
}

export default function TournamentManager({ club, teams, userRole }: TournamentManagerProps) {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Active tournament for view
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
  const [activeTab, setActiveTab] = useState<'matches' | 'ranking' | 'bracket' | 'calendar' | 'settings' | 'stats'>('matches');

  // Calendar View states
  const [currentDate, setCurrentDate] = useState<Date>(new Date());

  // Editing match schedule/score additional states
  const [matchDate, setMatchDate] = useState<string>('');
  const [matchTime, setMatchTime] = useState<string>('');
  const [matchStatus, setMatchStatus] = useState<'pending' | 'completed'>('pending');

  // Form states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [name, setName] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [category, setCategory] = useState('Seniors');
  const [format, setFormat] = useState<'round_robin' | 'single_elimination'>('round_robin');
  
  // Custom team list for creation
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [customTeamName, setCustomTeamName] = useState('');

  // Editing match score
  const [editingMatch, setEditingMatch] = useState<TournamentMatch | null>(null);
  const [homeScore, setHomeScore] = useState<number>(0);
  const [awayScore, setAwayScore] = useState<number>(0);

  // Tournament Notifications state
  const [notifications, setNotifications] = useState<TournamentNotification[]>([]);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);

  // Archiving state
  const [viewArchived, setViewArchived] = useState(false);

  // Archive/Unarchive tournament
  const handleToggleArchiveTournament = async (tournamentId: string, currentArchived: boolean) => {
    if (!canManage) return;
    try {
      const tournamentToUpdate = tournaments.find(t => t.id === tournamentId);
      if (!tournamentToUpdate) return;
      const updatedTournament: Tournament = {
        ...tournamentToUpdate,
        isArchived: !currentArchived
      };
      await setDoc(doc(db, 'clubs', club.id, 'tournaments', tournamentId), sanitizeData(updatedTournament));
      setSuccessMsg(!currentArchived ? "Tournoi archivé avec succès !" : "Tournoi restauré avec succès !");
      await fetchTournaments();
    } catch (err: any) {
      setError("Erreur lors de la modification de l'état d'archivage : " + err.message);
    }
  };

  // Toggle notification subscription
  const handleToggleSubscription = async () => {
    if (!selectedTournament) return;
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setError("Veuillez vous connecter pour vous abonner aux notifications.");
      return;
    }

    try {
      const currentSubscribers = selectedTournament.subscribers || [];
      const isSubscribed = currentSubscribers.includes(uid);
      const updatedSubscribers = isSubscribed
        ? currentSubscribers.filter(id => id !== uid)
        : [...currentSubscribers, uid];

      const updatedTournament: Tournament = {
        ...selectedTournament,
        subscribers: updatedSubscribers
      };

      await setDoc(doc(db, 'clubs', club.id, 'tournaments', selectedTournament.id), sanitizeData(updatedTournament));
      setSuccessMsg(isSubscribed ? "Désabonné des notifications avec succès." : "Abonné aux notifications du tournoi !");
      await fetchTournaments();
    } catch (err: any) {
      setError("Erreur d'abonnement : " + err.message);
    }
  };

  // Helper to create notification in DB
  const createNotification = async (title: string, message: string, type: 'schedule_change' | 'match_result', matchId: string) => {
    if (!selectedTournament) return;
    try {
      const notifId = `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const notifRef = doc(db, 'clubs', club.id, 'tournaments', selectedTournament.id, 'notifications', notifId);
      const newNotif = {
        id: notifId,
        tournamentId: selectedTournament.id,
        title,
        message,
        type,
        matchId,
        createdAt: new Date().toISOString(),
        createdBy: auth.currentUser?.email || 'Organisateur'
      };
      await setDoc(notifRef, sanitizeData(newNotif));
    } catch (err) {
      console.error("Error creating notification document:", err);
    }
  };

  // Real-time notifications listener
  useEffect(() => {
    if (!selectedTournament) {
      setNotifications([]);
      return;
    }

    const notificationsRef = collection(db, 'clubs', club.id, 'tournaments', selectedTournament.id, 'notifications');
    const unsubscribe = onSnapshot(
      notificationsRef,
      (snapshot) => {
        const list: TournamentNotification[] = [];
        snapshot.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() } as TournamentNotification);
        });
        // Sort newest first
        list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setNotifications(list);
      },
      (err) => {
        console.error("Error listening to notifications:", err);
      }
    );

    return () => unsubscribe();
  }, [selectedTournament?.id, club.id]);

  // Check management permission
  const canManage = ['admin', 'president', 'tresorier', 'sec_general', 'coach'].includes(userRole);

  // Fetch tournaments
  const fetchTournaments = async () => {
    setLoading(true);
    setError(null);
    try {
      const querySnap = await getDocs(collection(db, 'clubs', club.id, 'tournaments')).catch(err => {
        handleFirestoreError(err, OperationType.LIST, `clubs/${club.id}/tournaments`);
        throw err;
      });
      const list: Tournament[] = [];
      querySnap.forEach(doc => {
        list.push({ id: doc.id, ...doc.data() } as Tournament);
      });
      // Sort by newest
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setTournaments(list);

      // Keep selected tournament reference fresh
      if (selectedTournament) {
        const fresh = list.find(t => t.id === selectedTournament.id);
        if (fresh) setSelectedTournament(fresh);
      }
    } catch (err: any) {
      setError("Échec du chargement des tournois : " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTournaments();
  }, [club.id]);

  // Sync calendar month with tournament date
  useEffect(() => {
    if (selectedTournament?.date) {
      const parsed = new Date(selectedTournament.date);
      if (!isNaN(parsed.getTime())) {
        setCurrentDate(parsed);
      }
    }
  }, [selectedTournament?.id]);

  // Handle Quick Pre-fill
  const handlePrefillTeams = (count: number) => {
    const list: string[] = [];
    // 1. Add club's own teams if available
    teams.forEach(t => {
      if (list.length < count) list.push(t.name);
    });
    // 2. Add external teams to reach target count
    const externals = [
      "Olympique de Marseille", "Paris Saint-Germain", "Olympique Lyonnais", 
      "AS Monaco", "LOSC Lille", "RC Lens", "Stade Rennais", "FC Nantes"
    ];
    let extIndex = 0;
    while (list.length < count && extIndex < externals.length) {
      const nameToAdd = externals[extIndex++];
      if (!list.includes(nameToAdd)) {
        list.push(nameToAdd);
      }
    }
    // Fill with fillers if still short
    let fillerId = 1;
    while (list.length < count) {
      list.push(`Équipe Visiteuse ${fillerId++}`);
    }
    setSelectedTeams(list);
  };

  // Add custom team
  const handleAddCustomTeam = () => {
    const trimmed = customTeamName.trim();
    if (!trimmed) return;
    if (selectedTeams.includes(trimmed)) {
      setError("Cette équipe est déjà ajoutée.");
      return;
    }
    setSelectedTeams([...selectedTeams, trimmed]);
    setCustomTeamName('');
    setError(null);
  };

  // Remove custom team
  const handleRemoveTeam = (teamToRemove: string) => {
    setSelectedTeams(selectedTeams.filter(t => t !== teamToRemove));
  };

  // Generate Matches based on selected format & teams
  const handleCreateTournament = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Veuillez saisir un nom pour le tournoi.");
      return;
    }

    if (selectedTeams.length < 3 && format === 'round_robin') {
      setError("Un championnat de type Poule Unique nécessite au moins 3 équipes.");
      return;
    }

    if (format === 'single_elimination' && ![4, 8, 16].includes(selectedTeams.length)) {
      setError("Le tournoi à élimination directe nécessite exactement 4, 8 ou 16 équipes pour générer un arbre régulier.");
      return;
    }

    setLoading(true);

    try {
      const tournamentId = 'tour_' + Math.random().toString(36).substring(2, 11);
      const generatedMatches: TournamentMatch[] = [];

      if (format === 'round_robin') {
        // Generate Round Robin pairings using Round-robin scheduling algorithm (Berger tables)
        const tempTeams = [...selectedTeams];
        if (tempTeams.length % 2 !== 0) {
          tempTeams.push('BYE'); // Odd number of teams requires a dummy BYE team
        }
        
        const numTeams = tempTeams.length;
        const numRounds = numTeams - 1;
        const halfSize = numTeams / 2;

        let matchCount = 1;
        for (let round = 1; round <= numRounds; round++) {
          for (let i = 0; i < halfSize; i++) {
            const home = tempTeams[i];
            const away = tempTeams[numTeams - 1 - i];
            
            // Skip matches involving dummy BYE
            if (home !== 'BYE' && away !== 'BYE') {
              generatedMatches.push({
                id: `match_${tournamentId}_${matchCount++}`,
                round: round,
                homeTeam: home,
                awayTeam: away,
                status: 'pending'
              });
            }
          }
          // Rotate teams for the next round
          tempTeams.splice(1, 0, tempTeams.pop()!);
        }
      } else {
        // Single Elimination Matches (Round 1)
        // Round 1 matches depends on team count: e.g., 8 teams -> 4 matches in round 1
        // Round identifiers: 1 = Quarts de finale, 2 = Demi-finales, 3 = Finale
        const numTeams = selectedTeams.length;
        const startingRound = numTeams === 16 ? 1 : (numTeams === 8 ? 2 : 3); 
        // 16 teams: Round 1 (16 teams, 8 matches), Round 2 (demis, 4 teams, 2 matches), Round 3 (finale, 2 teams, 1 match)
        // Let's normalize rounds:
        // Round 1: Quarters (for 8 teams) or Huitièmes (for 16 teams)
        // We will assign clear round numbers:
        // 8 teams: Round 1 = Quarts (4 matches), Round 2 = Demis (2 matches), Round 3 = Finale (1 match)
        // 4 teams: Round 2 = Demis (2 matches), Round 3 = Finale (1 match)
        // This is robust!
        
        let matchCount = 1;
        
        if (numTeams === 8) {
          // Round 1 (Quarters): 4 matches
          for (let i = 0; i < 4; i++) {
            generatedMatches.push({
              id: `match_${tournamentId}_q_${i + 1}`,
              round: 1, // Quarts
              homeTeam: selectedTeams[i * 2],
              awayTeam: selectedTeams[i * 2 + 1],
              status: 'pending'
            });
          }
          // Round 2 (Demis): 2 pending matches
          generatedMatches.push({
            id: `match_${tournamentId}_d_1`,
            round: 2, // Demis
            homeTeam: 'Vainqueur Quart 1',
            awayTeam: 'Vainqueur Quart 2',
            status: 'pending'
          });
          generatedMatches.push({
            id: `match_${tournamentId}_d_2`,
            round: 2, // Demis
            homeTeam: 'Vainqueur Quart 3',
            awayTeam: 'Vainqueur Quart 4',
            status: 'pending'
          });
          // Round 3 (Finale): 1 pending match
          generatedMatches.push({
            id: `match_${tournamentId}_f_1`,
            round: 3, // Finale
            homeTeam: 'Vainqueur Demi 1',
            awayTeam: 'Vainqueur Demi 2',
            status: 'pending'
          });
        } else if (numTeams === 4) {
          // Round 2 (Demis): 2 matches
          for (let i = 0; i < 2; i++) {
            generatedMatches.push({
              id: `match_${tournamentId}_d_${i + 1}`,
              round: 2, // Demis
              homeTeam: selectedTeams[i * 2],
              awayTeam: selectedTeams[i * 2 + 1],
              status: 'pending'
            });
          }
          // Round 3 (Finale): 1 pending match
          generatedMatches.push({
            id: `match_${tournamentId}_f_1`,
            round: 3, // Finale
            homeTeam: 'Vainqueur Demi 1',
            awayTeam: 'Vainqueur Demi 2',
            status: 'pending'
          });
        } else if (numTeams === 16) {
          // Round 0 (Huitièmes): 8 matches
          for (let i = 0; i < 8; i++) {
            generatedMatches.push({
              id: `match_${tournamentId}_h_${i + 1}`,
              round: 0, // Huitièmes
              homeTeam: selectedTeams[i * 2],
              awayTeam: selectedTeams[i * 2 + 1],
              status: 'pending'
            });
          }
          // Round 1 (Quarts): 4 matches
          for (let i = 0; i < 4; i++) {
            generatedMatches.push({
              id: `match_${tournamentId}_q_${i + 1}`,
              round: 1, // Quarts
              homeTeam: `Vainqueur Huitième ${i * 2 + 1}`,
              awayTeam: `Vainqueur Huitième ${i * 2 + 2}`,
              status: 'pending'
            });
          }
          // Round 2 (Demis): 2 matches
          generatedMatches.push({
            id: `match_${tournamentId}_d_1`,
            round: 2, // Demis
            homeTeam: 'Vainqueur Quart 1',
            awayTeam: 'Vainqueur Quart 2',
            status: 'pending'
          });
          generatedMatches.push({
            id: `match_${tournamentId}_d_2`,
            round: 2, // Demis
            homeTeam: 'Vainqueur Quart 3',
            awayTeam: 'Vainqueur Quart 4',
            status: 'pending'
          });
          // Round 3 (Finale): 1 match
          generatedMatches.push({
            id: `match_${tournamentId}_f_1`,
            round: 3, // Finale
            homeTeam: 'Vainqueur Demi 1',
            awayTeam: 'Vainqueur Demi 2',
            status: 'pending'
          });
        }
      }

      const newTournament: Tournament = {
        id: tournamentId,
        clubId: club.id,
        name: trimmedName,
        date,
        category,
        format,
        teams: selectedTeams,
        status: 'draft',
        matches: generatedMatches,
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'clubs', club.id, 'tournaments', tournamentId), sanitizeData(newTournament));
      
      setSuccessMsg(`Le tournoi "${trimmedName}" a été généré avec succès !`);
      setName('');
      setSelectedTeams([]);
      setShowCreateModal(false);
      await fetchTournaments();
    } catch (err: any) {
      setError("Erreur lors de la création du tournoi : " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Open Score Editor / Viewer
  const handleOpenScoreEditor = (match: TournamentMatch) => {
    setEditingMatch(match);
    setHomeScore(match.homeScore ?? 0);
    setAwayScore(match.awayScore ?? 0);
    setMatchDate(match.date || '');
    setMatchTime(match.time || '');
    setMatchStatus(match.status);
  };

  // Update Match Score & Schedule
  const handleSaveScore = async () => {
    if (!selectedTournament || !editingMatch) return;
    setError(null);

    try {
      // Create updated matches list
      const updatedMatches = selectedTournament.matches.map(m => {
        if (m.id === editingMatch.id) {
          const isCompleted = matchStatus === 'completed';
          const winnerTeam = isCompleted 
            ? (homeScore > awayScore ? m.homeTeam : (awayScore > homeScore ? m.awayTeam : undefined))
            : undefined;

          const updatedMatch: TournamentMatch = {
            ...m,
            date: matchDate || undefined,
            time: matchTime || undefined,
            status: matchStatus,
            homeScore: isCompleted ? homeScore : undefined,
            awayScore: isCompleted ? awayScore : undefined,
            winner: winnerTeam
          };

          // Clean undefined keys for Firebase compatibility
          const cleanMatch = { ...updatedMatch };
          if (cleanMatch.date === undefined) delete cleanMatch.date;
          if (cleanMatch.time === undefined) delete cleanMatch.time;
          if (cleanMatch.homeScore === undefined) delete cleanMatch.homeScore;
          if (cleanMatch.awayScore === undefined) delete cleanMatch.awayScore;
          if (cleanMatch.winner === undefined) delete cleanMatch.winner;

          return cleanMatch;
        }
        return m;
      });

      // If Single Elimination, automatically update the next round dependencies!
      if (selectedTournament.format === 'single_elimination' && matchStatus === 'completed') {
        const winningTeamName = homeScore >= awayScore ? editingMatch.homeTeam : editingMatch.awayTeam;

        // Auto advancement propagation logic
        if (editingMatch.id.includes('_h_')) {
          // Huitièmes (round 0) -> Quarts (round 1)
          const hNumber = parseInt(editingMatch.id.split('_h_')[1], 10); // 1 to 8
          const qNumber = Math.ceil(hNumber / 2); // 1 to 4
          const qMatchId = `match_${selectedTournament.id}_q_${qNumber}`;
          const isHomeSlot = hNumber % 2 !== 0;

          updatedMatches.forEach(m => {
            if (m.id === qMatchId) {
              if (isHomeSlot) m.homeTeam = winningTeamName;
              else m.awayTeam = winningTeamName;
            }
          });
        } else if (editingMatch.id.includes('_q_')) {
          // Quarts (round 1) -> Demis (round 2)
          const qNumber = parseInt(editingMatch.id.split('_q_')[1], 10); // 1 to 4
          const dNumber = Math.ceil(qNumber / 2); // 1 to 2
          const dMatchId = `match_${selectedTournament.id}_d_${dNumber}`;
          const isHomeSlot = qNumber % 2 !== 0;

          updatedMatches.forEach(m => {
            if (m.id === dMatchId) {
              if (isHomeSlot) m.homeTeam = winningTeamName;
              else m.awayTeam = winningTeamName;
            }
          });
        } else if (editingMatch.id.includes('_d_')) {
          // Demis (round 2) -> Finale (round 3)
          const dNumber = parseInt(editingMatch.id.split('_d_')[1], 10); // 1 to 2
          const fMatchId = `match_${selectedTournament.id}_f_1`;
          const isHomeSlot = dNumber === 1;

          updatedMatches.forEach(m => {
            if (m.id === fMatchId) {
              if (isHomeSlot) m.homeTeam = winningTeamName;
              else m.awayTeam = winningTeamName;
            }
          });
        }
      }

      // Check if all matches are completed to auto-complete the tournament
      const allCompleted = updatedMatches.every(m => m.status === 'completed');
      const newStatus = allCompleted ? 'completed' : 'active';

      const updatedTournament: Tournament = {
        ...selectedTournament,
        status: newStatus,
        matches: updatedMatches
      };

      await setDoc(doc(db, 'clubs', club.id, 'tournaments', selectedTournament.id), sanitizeData(updatedTournament));

      // Trigger notifications for registered/subscribed users about schedule or score change
      const dateChanged = (matchDate || undefined) !== editingMatch.date;
      const timeChanged = (matchTime || undefined) !== editingMatch.time;
      const statusChanged = matchStatus !== editingMatch.status;
      const scoreChanged = matchStatus === 'completed' && (homeScore !== editingMatch.homeScore || awayScore !== editingMatch.awayScore);

      if (statusChanged && matchStatus === 'completed') {
        await createNotification(
          `🏆 Nouveau Résultat de Match`,
          `Le match ${editingMatch.homeTeam} vs ${editingMatch.awayTeam} s'est terminé sur le score de ${homeScore} - ${awayScore}.`,
          'match_result',
          editingMatch.id
        );
      } else if (scoreChanged) {
        await createNotification(
          `✏️ Score Mis à Jour`,
          `Le score du match ${editingMatch.homeTeam} vs ${editingMatch.awayTeam} a été modifié à ${homeScore} - ${awayScore}.`,
          'match_result',
          editingMatch.id
        );
      } else if (dateChanged || timeChanged) {
        const dStr = matchDate ? new Date(matchDate).toLocaleDateString('fr-FR') : 'à définir';
        const tStr = matchTime || 'à définir';
        await createNotification(
          `📅 Changement de Planning`,
          `Le match ${editingMatch.homeTeam} vs ${editingMatch.awayTeam} est désormais programmé pour le ${dStr} à ${tStr}.`,
          'schedule_change',
          editingMatch.id
        );
      }

      setEditingMatch(null);
      setSuccessMsg("Match mis à jour avec succès !");
      await fetchTournaments();
    } catch (err: any) {
      setError("Erreur de sauvegarde du match : " + err.message);
    }
  };

  // Change Tournament Status
  const handleChangeStatus = async (status: 'draft' | 'active' | 'completed') => {
    if (!selectedTournament) return;
    try {
      const updated = { ...selectedTournament, status };
      await setDoc(doc(db, 'clubs', club.id, 'tournaments', selectedTournament.id), sanitizeData(updated));
      setSuccessMsg("Statut du tournoi mis à jour !");
      await fetchTournaments();
    } catch (err: any) {
      setError("Erreur : " + err.message);
    }
  };

  // Delete Tournament
  const handleDeleteTournament = async (tId: string) => {
    if (!window.confirm("Êtes-vous sûr de vouloir supprimer définitivement ce tournoi ? Tous les matchs seront perdus.")) return;
    try {
      await deleteDoc(doc(db, 'clubs', club.id, 'tournaments', tId));
      setSuccessMsg("Tournoi supprimé avec succès.");
      setSelectedTournament(null);
      await fetchTournaments();
    } catch (err: any) {
      setError("Erreur lors de la suppression : " + err.message);
    }
  };

  // Calendar helper: generate days of the month (Monday start)
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth(); // 0-indexed
    
    const firstDayOfMonth = new Date(year, month, 1);
    let startDayOfWeek = firstDayOfMonth.getDay(); // 0 = Sunday, 1 = Monday...
    startDayOfWeek = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;

    const totalDays = new Date(year, month + 1, 0).getDate();

    const prevMonthDays = [];
    const prevMonthTotalDays = new Date(year, month, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      prevMonthDays.push({
        date: new Date(year, month - 1, prevMonthTotalDays - i),
        isCurrentMonth: false
      });
    }

    const currentMonthDays = [];
    for (let i = 1; i <= totalDays; i++) {
      currentMonthDays.push({
        date: new Date(year, month, i),
        isCurrentMonth: true
      });
    }

    const nextMonthDays = [];
    const totalCells = 42;
    const remainingCells = totalCells - (prevMonthDays.length + currentMonthDays.length);
    for (let i = 1; i <= remainingCells; i++) {
      nextMonthDays.push({
        date: new Date(year, month + 1, i),
        isCurrentMonth: false
      });
    }

    return [...prevMonthDays, ...currentMonthDays, ...nextMonthDays];
  };

  const formatDateString = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getMatchesForDate = (d: Date) => {
    if (!selectedTournament) return [];
    const dateStr = formatDateString(d);
    return selectedTournament.matches.filter(m => m.date === dateStr);
  };

  // Calculate Standing Table for Round Robin
  const calculateStandings = (tournament: Tournament) => {
    const table: Record<string, {
      played: number, won: number, drawn: number, lost: number,
      goalsFor: number, goalsAgainst: number, points: number
    }> = {};

    tournament.teams.forEach(team => {
      table[team] = { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 };
    });

    tournament.matches.forEach(m => {
      if (m.status !== 'completed' || m.homeScore === undefined || m.awayScore === undefined) return;

      // Ensure team objects exist (handles corner case where custom teams were somehow altered)
      if (!table[m.homeTeam]) table[m.homeTeam] = { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 };
      if (!table[m.awayTeam]) table[m.awayTeam] = { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 };

      const home = table[m.homeTeam];
      const away = table[m.awayTeam];

      home.played += 1;
      away.played += 1;
      home.goalsFor += m.homeScore;
      home.goalsAgainst += m.awayScore;
      away.goalsFor += m.awayScore;
      away.goalsAgainst += m.homeScore;

      if (m.homeScore > m.awayScore) {
        home.won += 1;
        home.points += 3;
        away.lost += 1;
      } else if (m.awayScore > m.homeScore) {
        away.won += 1;
        away.points += 3;
        home.lost += 1;
      } else {
        home.drawn += 1;
        home.points += 1;
        away.drawn += 1;
        away.points += 1;
      }
    });

    return Object.entries(table)
      .map(([name, stats]) => ({
        name,
        ...stats,
        difference: stats.goalsFor - stats.goalsAgainst
      }))
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.difference !== a.difference) return b.difference - a.difference;
        return b.goalsFor - a.goalsFor;
      });
  };

  // Get total goals scored in the app
  const getTotalGoals = () => {
    let sum = 0;
    tournaments.forEach(t => {
      t.matches.forEach(m => {
        if (m.status === 'completed') {
          sum += (m.homeScore || 0) + (m.awayScore || 0);
        }
      });
    });
    return sum;
  };

  return (
    <div className="space-y-6">
      {/* Notifications */}
      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-xl flex items-center justify-between shadow-sm animate-fadeIn">
          <div className="flex items-center gap-2.5">
            <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
            <span className="font-semibold">{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="p-1 hover:bg-emerald-100 rounded text-emerald-700 transition">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 text-sm rounded-xl flex items-center justify-between shadow-sm animate-fadeIn">
          <div className="flex items-center gap-2.5">
            <Info className="w-5 h-5 text-rose-600 shrink-0" />
            <span className="font-medium">{error}</span>
          </div>
          <button onClick={() => setError(null)} className="p-1 hover:bg-rose-100 rounded text-rose-700 transition">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Panel */}
      {!selectedTournament ? (
        <div className="space-y-6">
          {/* Top KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600 shrink-0 border border-amber-100">
                <Trophy className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Tournois</h4>
                <p className="text-2xl font-extrabold text-slate-800 leading-none mt-1">{tournaments.length}</p>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600 shrink-0 border border-emerald-100">
                <PlayCircle className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">En cours / Actifs</h4>
                <p className="text-2xl font-extrabold text-slate-800 leading-none mt-1">
                  {tournaments.filter(t => t.status === 'active' || t.status === 'draft').length}
                </p>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600 shrink-0 border border-indigo-100">
                <CheckCircle className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Terminés</h4>
                <p className="text-2xl font-extrabold text-slate-800 leading-none mt-1">
                  {tournaments.filter(t => t.status === 'completed').length}
                </p>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 bg-rose-50 rounded-xl flex items-center justify-center text-rose-600 shrink-0 border border-rose-100">
                <TrendingUp className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Buts Marqués</h4>
                <p className="text-2xl font-extrabold text-slate-800 leading-none mt-1">{getTotalGoals()}</p>
              </div>
            </div>
          </div>

          {/* Table / List Header */}
          <div className="bg-white p-6 rounded-2xl border border-slate-150 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-amber-500" /> Gestion des Tournois du Club
                </h2>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Organisez vos championnats, coupes et tournois de détection en quelques clics.
                </p>
              </div>
              {canManage && (
                <button
                  onClick={() => {
                    setName('');
                    setSelectedTeams([]);
                    setError(null);
                    setShowCreateModal(true);
                  }}
                  className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold px-4.5 py-2.5 rounded-xl transition shadow-md shadow-emerald-900/10 text-xs cursor-pointer uppercase tracking-wider"
                >
                  <Plus className="w-4 h-4" /> Créer un Tournoi
                </button>
              )}
            </div>

            {/* Tabs for Active vs Archived */}
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3 pt-1">
              <button
                onClick={() => setViewArchived(false)}
                className={`px-4 py-2 rounded-xl text-xs font-extrabold uppercase tracking-wider transition flex items-center gap-2 cursor-pointer border ${
                  !viewArchived
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-250'
                    : 'text-slate-500 hover:bg-slate-50 border-transparent'
                }`}
              >
                <Trophy className="w-4 h-4" />
                Tournois Actifs
              </button>
              <button
                onClick={() => setViewArchived(true)}
                className={`px-4 py-2 rounded-xl text-xs font-extrabold uppercase tracking-wider transition flex items-center gap-2 cursor-pointer border ${
                  viewArchived
                    ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                    : 'text-slate-500 hover:bg-slate-50 border-transparent'
                }`}
              >
                <Archive className="w-4 h-4" />
                Archives ({tournaments.filter(t => t.isArchived).length})
              </button>
            </div>

            {(() => {
              const filteredTournaments = tournaments.filter(t => viewArchived ? !!t.isArchived : !t.isArchived);

              if (loading) {
                return (
                  <div className="py-20 flex items-center justify-center">
                    <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                );
              }

              if (filteredTournaments.length === 0) {
                return (
                  <div className="py-16 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    {viewArchived ? (
                      <Archive className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    ) : (
                      <Trophy className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    )}
                    <h3 className="font-extrabold text-slate-700 text-sm">
                      {viewArchived ? "Aucun tournoi archivé" : "Aucun tournoi planifié"}
                    </h3>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 leading-relaxed">
                      {viewArchived 
                        ? "Il n'y a pas encore de tournoi archivé dans votre club." 
                        : "Il n'y a pas encore de tournoi configuré pour votre club. Créez-en un pour lancer des poules ou un arbre de tournoi !"}
                    </p>
                  </div>
                );
              }

              return (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 pt-2">
                  {filteredTournaments.map(t => {
                    const completedMatches = t.matches.filter(m => m.status === 'completed').length;
                    const totalMatches = t.matches.length;
                    const progressPct = totalMatches > 0 ? Math.round((completedMatches / totalMatches) * 100) : 0;

                    return (
                      <div 
                        key={t.id} 
                        className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition duration-200 overflow-hidden flex flex-col justify-between"
                      >
                        <div className="p-5 space-y-4">
                          <div className="flex items-center justify-between">
                            <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${
                              t.status === 'completed' ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' :
                              t.status === 'active' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                              'bg-slate-100 text-slate-600 border border-slate-200'
                            }`}>
                              {t.status === 'completed' ? 'Terminé' : t.status === 'active' ? 'En cours' : 'Brouillon'}
                            </span>
                            <span className="text-xs font-bold text-slate-400 flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5" /> {new Date(t.date).toLocaleDateString('fr-FR')}
                            </span>
                          </div>

                          <div>
                            <h3 className="font-extrabold text-slate-900 leading-tight text-base hover:text-emerald-700 transition cursor-pointer" onClick={() => {
                              setSelectedTournament(t);
                              setActiveTab('matches');
                            }}>
                              {t.name}
                            </h3>
                            <div className="flex gap-4 mt-2 text-xs font-semibold text-slate-500">
                              <span className="flex items-center gap-1 text-slate-700"><Users className="w-3.5 h-3.5 text-slate-400" /> {t.teams.length} Équipes</span>
                              <span>•</span>
                              <span className="text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded uppercase tracking-wide text-[9px] border border-emerald-100/50">{t.category}</span>
                            </div>
                          </div>

                          {/* Progress Bar */}
                          <div className="space-y-1.5">
                            <div className="flex justify-between text-[11px] font-bold text-slate-500">
                              <span>Avancement matchs</span>
                              <span>{completedMatches}/{totalMatches} ({progressPct}%)</span>
                            </div>
                            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                              <div className="bg-emerald-500 h-full transition-all duration-350" style={{ width: `${progressPct}%` }}></div>
                            </div>
                          </div>
                        </div>

                        <div className="bg-slate-50 px-5 py-4 border-t border-slate-150 flex items-center justify-between">
                          <button
                            onClick={() => {
                              setSelectedTournament(t);
                              setActiveTab('matches');
                            }}
                            className="text-xs font-extrabold text-emerald-700 hover:text-emerald-800 transition flex items-center gap-1 uppercase tracking-wider cursor-pointer"
                          >
                            Gérer / Consulter <ChevronRight className="w-4 h-4" />
                          </button>
                          <div className="flex items-center gap-1">
                            {canManage && (
                              <button
                                onClick={() => handleToggleArchiveTournament(t.id, !!t.isArchived)}
                                className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-xl transition cursor-pointer"
                                title={t.isArchived ? "Désarchiver le tournoi" : "Archiver le tournoi"}
                              >
                                <Archive className="w-4.5 h-4.5" />
                              </button>
                            )}
                            {canManage && (
                              <button
                                onClick={() => handleDeleteTournament(t.id)}
                                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition cursor-pointer"
                                title="Supprimer le tournoi"
                              >
                                <Trash2 className="w-4.5 h-4.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>
      ) : (
        /* Tournament Detail View */
        <div className="space-y-6">
          {/* Header Banner */}
          <div className="bg-white p-6 rounded-2xl border border-slate-150 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="space-y-1">
              <button
                onClick={() => setSelectedTournament(null)}
                className="text-xs font-extrabold text-slate-500 hover:text-slate-800 transition flex items-center gap-1 uppercase tracking-wider mb-2 cursor-pointer"
              >
                ← Retour aux tournois
              </button>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight">{selectedTournament.name}</h1>
                <span className="text-xs font-black bg-indigo-50 text-indigo-700 border border-indigo-100 px-3 py-1 rounded-full uppercase">
                  {selectedTournament.format === 'round_robin' ? 'Poule Unique' : 'Élimination Directe'}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-slate-500">
                <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {new Date(selectedTournament.date).toLocaleDateString('fr-FR')}</span>
                <span>•</span>
                <span>Catégorie : <strong className="text-slate-800">{selectedTournament.category}</strong></span>
                <span>•</span>
                <span>Statut : <span className={`font-black uppercase tracking-wider ${
                  selectedTournament.status === 'completed' ? 'text-indigo-600' : 'text-emerald-600'
                }`}>{selectedTournament.status === 'completed' ? 'Terminé' : 'Actif'}</span></span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Notifications & Subscription controls */}
              <button
                onClick={() => setShowNotificationsModal(true)}
                className="relative p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 border border-slate-200 rounded-xl transition cursor-pointer"
                title="Notifications et flux d'actualité"
              >
                <Bell className="w-4.5 h-4.5" />
                {notifications.length > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white font-black text-[9px] w-5 h-5 flex items-center justify-center rounded-full border-2 border-white animate-pulse">
                    {notifications.length}
                  </span>
                )}
              </button>

              <button
                onClick={handleToggleSubscription}
                className={`flex items-center gap-1.5 font-extrabold px-3.5 py-2.5 rounded-xl transition text-xs cursor-pointer uppercase tracking-wider border ${
                  (selectedTournament.subscribers || []).includes(auth.currentUser?.uid || '')
                    ? 'bg-emerald-50 border-emerald-250 text-emerald-700 hover:bg-emerald-100'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
                title={(selectedTournament.subscribers || []).includes(auth.currentUser?.uid || '') ? "Vous êtes abonné aux notifications" : "S'abonner aux notifications"}
              >
                {(selectedTournament.subscribers || []).includes(auth.currentUser?.uid || '') ? (
                  <>
                    <Bell className="w-4 h-4 text-emerald-600 fill-emerald-600" />
                    <span className="hidden sm:inline">Abonné</span>
                  </>
                ) : (
                  <>
                    <BellOff className="w-4 h-4 text-slate-400" />
                    <span className="hidden sm:inline">S'abonner</span>
                  </>
                )}
              </button>

              {canManage && (
                <button
                  onClick={() => generateTournamentPDF(selectedTournament, club.name)}
                  className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-extrabold px-4 py-2.5 rounded-xl transition border border-slate-200 text-xs cursor-pointer uppercase tracking-wider"
                >
                  <FileText className="w-4 h-4 text-emerald-600" /> Exporter en PDF
                </button>
              )}

              {canManage && selectedTournament.status !== 'completed' && (
                <button
                  onClick={() => handleChangeStatus('completed')}
                  className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold px-4.5 py-2.5 rounded-xl transition shadow-md shadow-indigo-900/10 text-xs cursor-pointer uppercase tracking-wider"
                >
                  <CheckCircle className="w-4 h-4" /> Clôturer le tournoi
                </button>
              )}
            </div>
          </div>

          {/* Internal Navigation Tabs */}
          <div className="flex border-b border-slate-200 bg-white p-1 rounded-xl shadow-sm">
            <button
              onClick={() => setActiveTab('matches')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-xs font-extrabold uppercase tracking-wider transition ${
                activeTab === 'matches' ? 'bg-slate-900 text-white shadow' : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              <List className="w-4 h-4" /> Matchs & Résultats
            </button>
            {selectedTournament.format === 'round_robin' ? (
              <button
                onClick={() => setActiveTab('ranking')}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-xs font-extrabold uppercase tracking-wider transition ${
                  activeTab === 'ranking' ? 'bg-slate-900 text-white shadow' : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                <BarChart3 className="w-4 h-4" /> Classement Poule
              </button>
            ) : (
              <button
                onClick={() => setActiveTab('bracket')}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-xs font-extrabold uppercase tracking-wider transition ${
                  activeTab === 'bracket' ? 'bg-slate-900 text-white shadow' : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                <Trophy className="w-4 h-4" /> Arbre des Phases Finales
              </button>
            )}
            <button
              onClick={() => setActiveTab('calendar')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-xs font-extrabold uppercase tracking-wider transition ${
                activeTab === 'calendar' ? 'bg-slate-900 text-white shadow' : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              <Calendar className="w-4 h-4" /> Calendrier
            </button>
            <button
              onClick={() => setActiveTab('stats')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-xs font-extrabold uppercase tracking-wider transition ${
                activeTab === 'stats' ? 'bg-slate-900 text-white shadow' : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              <BarChart3 className="w-4 h-4" /> Statistiques
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-xs font-extrabold uppercase tracking-wider transition ${
                activeTab === 'settings' ? 'bg-slate-900 text-white shadow' : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              <Info className="w-4 h-4" /> Détails & Équipes
            </button>
          </div>

          {/* Tab Content */}
          {activeTab === 'matches' && (
            <div className="bg-white p-6 rounded-2xl border border-slate-150 shadow-sm space-y-6">
              {/* Group matches by Rounds */}
              {(Array.from(new Set(selectedTournament.matches.map(m => m.round))) as number[])
                .sort((a, b) => a - b)
                .map(roundNum => {
                   const roundMatches = selectedTournament.matches.filter(m => m.round === roundNum);
                   let roundLabel = `Journée ${roundNum}`;
                   if (selectedTournament.format === 'single_elimination') {
                     if (roundNum === 0) roundLabel = "Huitièmes de finale";
                     else if (roundNum === 1) roundLabel = "Quarts de finale";
                     else if (roundNum === 2) roundLabel = "Demi-finales";
                     else if (roundNum === 3) roundLabel = "Finale";
                   }

                   return (
                     <div key={roundNum} className="space-y-3.5">
                       <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-1.5">
                         {roundLabel}
                       </h3>
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                         {roundMatches.map(m => {
                           const isCompleted = m.status === 'completed';
                           const hasWinner = m.winner && m.winner !== 'Nul';

                           return (
                             <div 
                               key={m.id} 
                               onClick={() => handleOpenScoreEditor(m)}
                               className={`p-4 rounded-xl border flex items-center justify-between transition group/match ${
                                 isCompleted ? 'bg-slate-50 border-slate-150 hover:bg-slate-100' : 'bg-white border-slate-200 hover:border-emerald-300'
                               } cursor-pointer`}
                             >
                               <div className="space-y-2 flex-1 pr-4">
                                 {/* Match date/time header */}
                                 {m.date && (
                                   <div className="flex items-center gap-1.5 text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">
                                     <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                     <span>{new Date(m.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                                     {m.time && (
                                       <>
                                         <span className="text-slate-300">•</span>
                                         <Clock className="w-3.5 h-3.5 text-slate-400" />
                                         <span>{m.time}</span>
                                       </>
                                     )}
                                   </div>
                                 )}

                                 {/* Home Team */}
                                 <div className="flex items-center justify-between">
                                   <span className={`text-xs font-bold truncate max-w-[200px] ${
                                     isCompleted && m.winner === m.homeTeam ? 'text-emerald-700 font-extrabold' : 'text-slate-800'
                                   }`}>
                                     {m.homeTeam}
                                   </span>
                                   {isCompleted && (
                                     <span className={`text-sm font-black w-6 text-center ${
                                       m.homeScore! > m.awayScore! ? 'text-emerald-600' : 'text-slate-500'
                                     }`}>
                                       {m.homeScore}
                                     </span>
                                   )}
                                 </div>

                                 {/* Away Team */}
                                 <div className="flex items-center justify-between">
                                   <span className={`text-xs font-bold truncate max-w-[200px] ${
                                     isCompleted && m.winner === m.awayTeam ? 'text-emerald-700 font-extrabold' : 'text-slate-800'
                                   }`}>
                                     {m.awayTeam}
                                   </span>
                                   {isCompleted && (
                                     <span className={`text-sm font-black w-6 text-center ${
                                       m.awayScore! > m.homeScore! ? 'text-emerald-600' : 'text-slate-500'
                                     }`}>
                                       {m.awayScore}
                                     </span>
                                   )}
                                 </div>
                               </div>

                               {/* Edit indicator / status pill */}
                               <div className="shrink-0 pl-3 border-l border-slate-100 flex flex-col items-center justify-center min-w-[70px]">
                                 {isCompleted ? (
                                   <span className="text-[9px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-extrabold uppercase">Terminé</span>
                                 ) : (
                                   <span className="text-[9px] bg-amber-50 text-amber-600 border border-amber-100 px-2 py-0.5 rounded font-extrabold uppercase group-hover/match:bg-emerald-50 group-hover/match:text-emerald-700 group-hover/match:border-emerald-100 transition duration-150">
                                     {canManage ? 'Gérer' : 'Détails'}
                                   </span>
                                 )}
                               </div>
                             </div>
                           );
                         })}
                       </div>
                     </div>
                   );
                 })}
             </div>
          )}

          {activeTab === 'ranking' && selectedTournament.format === 'round_robin' && (
            <div className="bg-white p-6 rounded-2xl border border-slate-150 shadow-sm space-y-4 overflow-x-auto">
              <div>
                <h3 className="font-extrabold text-slate-900 text-sm">Classement Général - {selectedTournament.name}</h3>
                <p className="text-[11px] text-slate-400 font-bold mt-0.5 uppercase tracking-wide">3 points pour une victoire, 1 pour un nul, 0 pour une défaite.</p>
              </div>

              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-400 font-black uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-2 text-center w-10">Pos</th>
                    <th className="py-3 px-4">Équipe</th>
                    <th className="py-3 px-3 text-center">Points</th>
                    <th className="py-3 px-3 text-center">Joués</th>
                    <th className="py-3 px-3 text-center">G</th>
                    <th className="py-3 px-3 text-center">N</th>
                    <th className="py-3 px-3 text-center">P</th>
                    <th className="py-3 px-3 text-center">BP</th>
                    <th className="py-3 px-3 text-center">BC</th>
                    <th className="py-3 px-3 text-center">Diff</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                  {calculateStandings(selectedTournament).map((team, idx) => {
                    const isLeader = idx === 0;
                    return (
                      <tr key={team.name} className={`hover:bg-slate-50/50 transition ${
                        isLeader ? 'bg-amber-50/20' : ''
                      }`}>
                        <td className="py-3.5 px-2 text-center">
                          <span className={`w-6 h-6 rounded-lg flex items-center justify-center font-extrabold text-xs mx-auto ${
                            idx === 0 ? 'bg-amber-100 text-amber-800 border border-amber-200 shadow-sm' :
                            idx === 1 ? 'bg-slate-100 text-slate-700' :
                            idx === 2 ? 'bg-orange-50 text-orange-700' :
                            'text-slate-400'
                          }`}>
                            {idx + 1}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-extrabold text-slate-900 text-sm flex items-center gap-2">
                          {isLeader && <Trophy className="w-4 h-4 text-amber-500 shrink-0" />}
                          {team.name}
                        </td>
                        <td className="py-3.5 px-3 text-center text-sm font-black text-slate-900 bg-slate-50/40">{team.points}</td>
                        <td className="py-3.5 px-3 text-center">{team.played}</td>
                        <td className="py-3.5 px-3 text-center text-emerald-600">{team.won}</td>
                        <td className="py-3.5 px-3 text-center text-slate-400">{team.drawn}</td>
                        <td className="py-3.5 px-3 text-center text-rose-500">{team.lost}</td>
                        <td className="py-3.5 px-3 text-center">{team.goalsFor}</td>
                        <td className="py-3.5 px-3 text-center">{team.goalsAgainst}</td>
                        <td className={`py-3.5 px-3 text-center font-bold ${
                          team.difference > 0 ? 'text-emerald-600' : team.difference < 0 ? 'text-rose-500' : 'text-slate-400'
                        }`}>
                          {team.difference > 0 ? `+${team.difference}` : team.difference}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'bracket' && selectedTournament.format === 'single_elimination' && (
            <div className="bg-white p-6 rounded-2xl border border-slate-150 shadow-sm overflow-x-auto space-y-6">
              <h3 className="font-extrabold text-slate-900 text-sm mb-4">Arbre du Tournoi</h3>
              
              <div className="flex flex-col lg:flex-row items-center lg:items-stretch justify-center gap-8 min-w-[700px] py-6">
                
                {/* 1. Quarters Column (Optional, only shown if 8 teams) */}
                {selectedTournament.teams.length >= 8 && (
                  <div className="flex-1 flex flex-col justify-around gap-6">
                    <h4 className="text-center font-black text-[10px] text-slate-400 uppercase tracking-widest mb-2">Quarts de finale</h4>
                    {[1, 2, 3, 4].map(qIdx => {
                      const match = selectedTournament.matches.find(m => m.id.endsWith(`_q_${qIdx}`));
                      if (!match) return null;
                      return (
                        <div key={match.id} className="bg-slate-50 border border-slate-200 p-3 rounded-xl space-y-1 shadow-sm max-w-[200px] w-full mx-auto">
                          <div className={`text-xs flex justify-between font-bold ${match.winner === match.homeTeam ? 'text-emerald-700' : 'text-slate-600'}`}>
                            <span className="truncate">{match.homeTeam}</span>
                            <span>{match.status === 'completed' ? match.homeScore : '-'}</span>
                          </div>
                          <div className={`text-xs flex justify-between font-bold border-t border-slate-100 pt-1 mt-1 ${match.winner === match.awayTeam ? 'text-emerald-700' : 'text-slate-600'}`}>
                            <span className="truncate">{match.awayTeam}</span>
                            <span>{match.status === 'completed' ? match.awayScore : '-'}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Connection lines would go here, we make a neat horizontal flex to denote flow */}
                <div className="hidden lg:flex items-center justify-center text-slate-300">
                  <ArrowRight className="w-5 h-5" />
                </div>

                {/* 2. Semis Column */}
                <div className="flex-1 flex flex-col justify-around gap-8">
                  <h4 className="text-center font-black text-[10px] text-slate-400 uppercase tracking-widest mb-2">Demi-finales</h4>
                  {[1, 2].map(dIdx => {
                    const match = selectedTournament.matches.find(m => m.id.endsWith(`_d_${dIdx}`));
                    if (!match) return null;
                    return (
                      <div key={match.id} className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl space-y-1 shadow-sm max-w-[200px] w-full mx-auto">
                        <div className={`text-xs flex justify-between font-bold ${match.winner === match.homeTeam ? 'text-emerald-700 font-black' : 'text-slate-600'}`}>
                          <span className="truncate">{match.homeTeam}</span>
                          <span>{match.status === 'completed' ? match.homeScore : '-'}</span>
                        </div>
                        <div className={`text-xs flex justify-between font-bold border-t border-slate-100 pt-1 mt-1 ${match.winner === match.awayTeam ? 'text-emerald-700 font-black' : 'text-slate-600'}`}>
                          <span className="truncate">{match.awayTeam}</span>
                          <span>{match.status === 'completed' ? match.awayScore : '-'}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="hidden lg:flex items-center justify-center text-slate-300">
                  <ArrowRight className="w-5 h-5" />
                </div>

                {/* 3. Final Column */}
                <div className="flex-1 flex flex-col justify-center">
                  <h4 className="text-center font-black text-[10px] text-slate-400 uppercase tracking-widest mb-2">Grande Finale</h4>
                  {(() => {
                    const match = selectedTournament.matches.find(m => m.id.includes('_f_'));
                    if (!match) return null;
                    return (
                      <div className="bg-amber-500/5 border-2 border-amber-400 p-5 rounded-2xl space-y-3.5 shadow max-w-[240px] w-full mx-auto text-center relative overflow-hidden">
                        <div className="absolute top-0 right-0 bg-amber-400 text-amber-950 font-black uppercase text-[8px] px-2.5 py-1 rounded-bl-xl tracking-widest">
                          Championnat
                        </div>
                        <div className="space-y-2 text-left">
                          <div className={`text-xs flex justify-between font-bold ${match.winner === match.homeTeam ? 'text-emerald-800 font-black text-sm' : 'text-slate-700'}`}>
                            <span className="truncate">{match.homeTeam}</span>
                            <span>{match.status === 'completed' ? match.homeScore : '-'}</span>
                          </div>
                          <div className={`text-xs flex justify-between font-bold border-t border-amber-200/50 pt-2 mt-2 ${match.winner === match.awayTeam ? 'text-emerald-800 font-black text-sm' : 'text-slate-700'}`}>
                            <span className="truncate">{match.awayTeam}</span>
                            <span>{match.status === 'completed' ? match.awayScore : '-'}</span>
                          </div>
                        </div>
                        {match.status === 'completed' && match.winner && (
                          <div className="pt-2 border-t border-amber-200/30 flex flex-col items-center gap-1">
                            <Trophy className="w-7 h-7 text-amber-500 animate-bounce" />
                            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Vainqueur</span>
                            <span className="font-black text-slate-900 text-sm truncate max-w-full">{match.winner}</span>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>

              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="bg-white p-6 rounded-2xl border border-slate-150 shadow-sm space-y-6">
              <div>
                <h3 className="font-extrabold text-slate-900 text-sm">Équipes Engagées dans le Tournoi</h3>
                <p className="text-xs text-slate-500">Liste officielle des {selectedTournament.teams.length} équipes qui disputent cette édition.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {selectedTournament.teams.map((tName, i) => (
                  <div key={i} className="p-4 rounded-xl border border-slate-250 bg-slate-50 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-200 flex items-center justify-center font-bold text-slate-600 text-xs">
                      {i + 1}
                    </div>
                    <span className="font-extrabold text-slate-800 text-xs truncate">{tName}</span>
                  </div>
                ))}
              </div>

              {canManage && (
                <div className="pt-6 border-t border-slate-100 flex justify-end gap-3">
                  <button
                    onClick={() => handleToggleArchiveTournament(selectedTournament.id, !!selectedTournament.isArchived)}
                    className="flex items-center gap-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 font-extrabold px-4.5 py-2.5 rounded-xl transition text-xs cursor-pointer uppercase tracking-wider border border-amber-200"
                  >
                    <Archive className="w-4 h-4" /> {selectedTournament.isArchived ? "Désarchiver le Tournoi" : "Archiver le Tournoi"}
                  </button>
                  <button
                    onClick={() => handleDeleteTournament(selectedTournament.id)}
                    className="flex items-center gap-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-extrabold px-4.5 py-2.5 rounded-xl transition text-xs cursor-pointer uppercase tracking-wider border border-rose-200"
                  >
                    <Trash2 className="w-4 h-4" /> Supprimer ce Tournoi
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'stats' && (
            <div className="space-y-6">
              {(() => {
                const totalMatches = selectedTournament.matches.length;
                const completedMatches = selectedTournament.matches.filter(m => m.status === 'completed').length;
                const pendingMatches = totalMatches - completedMatches;
                const participationRate = totalMatches > 0 ? Math.round((completedMatches / totalMatches) * 100) : 0;

                const teamStats: Record<string, { wins: number; goalsScored: number; goalsConceded: number; played: number }> = {};
                selectedTournament.teams.forEach(tName => {
                  teamStats[tName] = { wins: 0, goalsScored: 0, goalsConceded: 0, played: 0 };
                });

                selectedTournament.matches.forEach(m => {
                  if (m.status === 'completed') {
                    const home = m.homeTeam;
                    const away = m.awayTeam;
                    if (!teamStats[home]) teamStats[home] = { wins: 0, goalsScored: 0, goalsConceded: 0, played: 0 };
                    if (!teamStats[away]) teamStats[away] = { wins: 0, goalsScored: 0, goalsConceded: 0, played: 0 };

                    teamStats[home].played += 1;
                    teamStats[away].played += 1;

                    const hs = m.homeScore ?? 0;
                    const as = m.awayScore ?? 0;

                    teamStats[home].goalsScored += hs;
                    teamStats[home].goalsConceded += as;
                    teamStats[away].goalsScored += as;
                    teamStats[away].goalsConceded += hs;

                    if (m.winner) {
                      if (m.winner === home) teamStats[home].wins += 1;
                      else if (m.winner === away) teamStats[away].wins += 1;
                    } else {
                      if (hs > as) teamStats[home].wins += 1;
                      else if (as > hs) teamStats[away].wins += 1;
                    }
                  }
                });

                const winsChartData = selectedTournament.teams.map(tName => ({
                  name: tName,
                  victoires: teamStats[tName]?.wins || 0,
                  buts: teamStats[tName]?.goalsScored || 0,
                })).sort((a, b) => b.victoires - a.victoires);

                const completionChartData = [
                  { name: 'Matchs Joués', value: completedMatches, color: '#10b981' },
                  { name: 'Matchs Restants', value: pendingMatches, color: '#cbd5e1' }
                ];

                const totalGoals = selectedTournament.matches.reduce((sum, m) => {
                  if (m.status === 'completed') {
                    return sum + (m.homeScore ?? 0) + (m.awayScore ?? 0);
                  }
                  return sum;
                }, 0);

                const avgGoals = completedMatches > 0 ? (totalGoals / completedMatches).toFixed(1) : '0';

                let topScoringTeam = "N/A";
                let maxGoals = 0;
                winsChartData.forEach(item => {
                  if (item.buts > maxGoals) {
                    maxGoals = item.buts;
                    topScoringTeam = item.name;
                  }
                });

                return (
                  <div className="space-y-6">
                    {/* KPI Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      {/* KPI 1 */}
                      <div className="bg-white p-5 rounded-2xl border border-slate-150 shadow-sm flex items-center justify-between">
                        <div className="space-y-1">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Matchs Joués</span>
                          <span className="text-2xl font-black text-slate-800">{completedMatches} <span className="text-slate-400 text-xs font-semibold">/ {totalMatches}</span></span>
                          <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1.5">
                            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${participationRate}%` }}></div>
                          </div>
                        </div>
                        <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                          <Check className="w-5 h-5" />
                        </div>
                      </div>

                      {/* KPI 2 */}
                      <div className="bg-white p-5 rounded-2xl border border-slate-150 shadow-sm flex items-center justify-between">
                        <div className="space-y-1">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Taux de Participation</span>
                          <span className="text-2xl font-black text-slate-800">{participationRate}%</span>
                          <p className="text-[10px] text-slate-400 font-bold">Complétion du tournoi</p>
                        </div>
                        <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                          <TrendingUp className="w-5 h-5" />
                        </div>
                      </div>

                      {/* KPI 3 */}
                      <div className="bg-white p-5 rounded-2xl border border-slate-150 shadow-sm flex items-center justify-between">
                        <div className="space-y-1">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Buts Marqués</span>
                          <span className="text-2xl font-black text-slate-800">{totalGoals}</span>
                          <p className="text-[10px] text-slate-400 font-bold">{avgGoals} buts / match</p>
                        </div>
                        <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                          <Award className="w-5 h-5" />
                        </div>
                      </div>

                      {/* KPI 4 */}
                      <div className="bg-white p-5 rounded-2xl border border-slate-150 shadow-sm flex items-center justify-between">
                        <div className="space-y-1">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Meilleure Attaque</span>
                          <span className="text-sm font-black text-slate-800 truncate block max-w-[150px]">{topScoringTeam}</span>
                          <p className="text-[10px] text-emerald-600 font-bold">{maxGoals > 0 ? `${maxGoals} buts inscrits` : "Aucun but"}</p>
                        </div>
                        <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                          <Trophy className="w-5 h-5" />
                        </div>
                      </div>
                    </div>

                    {/* Charts Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Wins & Goals Bar Chart */}
                      <div className="bg-white p-6 rounded-2xl border border-slate-150 shadow-sm space-y-4">
                        <div>
                          <h4 className="font-extrabold text-slate-800 text-sm">Victoires & Buts par Équipe</h4>
                          <p className="text-[10px] text-slate-400 font-bold">Comparatif des performances offensives et des succès par équipe.</p>
                        </div>
                        <div className="h-72 w-full flex items-center justify-center">
                          {completedMatches === 0 ? (
                            <div className="text-center py-10">
                              <BarChart3 className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                              <p className="text-xs text-slate-400 font-bold">Aucune donnée disponible. Jouez des matchs pour voir les statistiques !</p>
                            </div>
                          ) : (
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={winsChartData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                                <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                                <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} />
                                <Tooltip 
                                  contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '12px', color: '#fff', fontSize: '11px' }}
                                  itemStyle={{ color: '#38bdf8' }}
                                />
                                <Bar dataKey="victoires" name="Victoires" fill="#10b981" radius={[4, 4, 0, 0]} barSize={20} />
                                <Bar dataKey="buts" name="Buts marqués" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={20} />
                                <Legend wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', paddingTop: '10px' }} />
                              </BarChart>
                            </ResponsiveContainer>
                          )}
                        </div>
                      </div>

                      {/* Match Completion/Participation Pie Chart */}
                      <div className="bg-white p-6 rounded-2xl border border-slate-150 shadow-sm space-y-4">
                        <div>
                          <h4 className="font-extrabold text-slate-800 text-sm">Taux de Participation (Matchs)</h4>
                          <p className="text-[10px] text-slate-400 font-bold">Progrès global et avancement des rencontres planifiées.</p>
                        </div>
                        <div className="relative h-72 w-full flex items-center justify-center">
                          {totalMatches === 0 ? (
                            <div className="text-center py-10">
                              <Clock className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                              <p className="text-xs text-slate-400 font-bold">Aucun match planifié dans ce tournoi.</p>
                            </div>
                          ) : (
                            <>
                              <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                  <Pie
                                    data={completionChartData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={65}
                                    outerRadius={90}
                                    paddingAngle={5}
                                    dataKey="value"
                                  >
                                    {completionChartData.map((entry, index) => (
                                      <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                  </Pie>
                                  <Tooltip 
                                    contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '12px', color: '#fff', fontSize: '11px' }}
                                  />
                                  <Legend wrapperStyle={{ fontSize: '10px', fontWeight: 'bold' }} />
                                </PieChart>
                              </ResponsiveContainer>
                              {/* Center percentage indicator */}
                              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none mt-[-24px]">
                                <span className="text-2xl font-black text-slate-800">{participationRate}%</span>
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Joués</span>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {activeTab === 'calendar' && (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              {/* Calendar Grid Container (takes 3 cols on lg screens) */}
              <div className="lg:col-span-3 bg-white p-6 rounded-2xl border border-slate-150 shadow-sm space-y-4">
                {/* Calendar Navigation Header */}
                <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-emerald-600" />
                    <h3 className="font-extrabold text-slate-800 text-sm">
                      {currentDate.toLocaleString('fr-FR', { month: 'long', year: 'numeric' }).toUpperCase()}
                    </h3>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => {
                        const prev = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
                        setCurrentDate(prev);
                      }}
                      className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition text-slate-600 cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        setCurrentDate(new Date());
                      }}
                      className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 transition text-[10px] font-black uppercase tracking-wider text-slate-600 cursor-pointer"
                    >
                      Aujourd'hui
                    </button>
                    <button
                      onClick={() => {
                        const next = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
                        setCurrentDate(next);
                      }}
                      className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition text-slate-600 cursor-pointer"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Days of week headers (French Lundi to Dimanche) */}
                <div className="grid grid-cols-7 gap-1 text-center font-black text-[10px] text-slate-400 uppercase tracking-wider pb-1">
                  <div>Lun</div>
                  <div>Mar</div>
                  <div>Mer</div>
                  <div>Jeu</div>
                  <div>Ven</div>
                  <div>Sam</div>
                  <div>Dim</div>
                </div>

                {/* Calendar Grid cells */}
                <div className="grid grid-cols-7 gap-1 bg-slate-100 p-0.5 rounded-xl overflow-hidden border border-slate-100">
                  {getDaysInMonth(currentDate).map(({ date: dayDate, isCurrentMonth }, idx) => {
                    const isToday = formatDateString(dayDate) === formatDateString(new Date());
                    const dayMatches = getMatchesForDate(dayDate);
                    
                    return (
                      <div 
                        key={idx} 
                        className={`min-h-[90px] p-1.5 flex flex-col justify-between transition duration-150 ${
                          isCurrentMonth ? 'bg-white' : 'bg-slate-50/70 text-slate-300'
                        } ${isToday ? 'ring-2 ring-emerald-500 ring-inset bg-emerald-50/10' : ''}`}
                      >
                        {/* Day number */}
                        <div className="flex justify-between items-center">
                          <span className={`text-[11px] font-extrabold ${
                            isCurrentMonth ? 'text-slate-800' : 'text-slate-400'
                          } ${isToday ? 'text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-md font-black' : ''}`}>
                            {dayDate.getDate()}
                          </span>
                          {dayMatches.length > 0 && (
                            <span className="text-[9px] font-black bg-slate-100 text-slate-600 px-1 py-0.5 rounded">
                              {dayMatches.length}
                            </span>
                          )}
                        </div>

                        {/* Match Badges inside Cell */}
                        <div className="space-y-1 mt-1.5 flex-1 overflow-y-auto max-h-[70px] custom-scrollbar">
                          {dayMatches.map(m => {
                            const isCompleted = m.status === 'completed';
                            return (
                              <div
                                key={m.id}
                                onClick={() => handleOpenScoreEditor(m)}
                                className={`text-[9px] leading-tight p-1 rounded font-bold cursor-pointer transition border hover:scale-[1.02] active:scale-[0.98] ${
                                  isCompleted 
                                    ? 'bg-slate-50 border-slate-150 text-slate-600' 
                                    : 'bg-emerald-50/80 border-emerald-100 text-emerald-800 hover:bg-emerald-100/80'
                                }`}
                                title={`${m.homeTeam} vs ${m.awayTeam} ${m.time ? `@ ${m.time}` : ''}`}
                              >
                                <div className="truncate flex items-center justify-between">
                                  <span>{m.time || '--:--'}</span>
                                  <span className="opacity-70">R{m.round}</span>
                                </div>
                                <div className="truncate mt-0.5 font-extrabold text-slate-700">{m.homeTeam} - {m.awayTeam}</div>
                                {isCompleted && m.homeScore !== undefined && m.awayScore !== undefined && (
                                  <div className="font-black text-center text-emerald-700 mt-0.5">{m.homeScore} - {m.awayScore}</div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Sidebar: Match Scheduler / Unscheduled Matches */}
              <div className="bg-white p-6 rounded-2xl border border-slate-150 shadow-sm space-y-4">
                <div>
                  <h4 className="font-extrabold text-slate-800 text-xs uppercase tracking-wide">Matchs à Programmer</h4>
                  <p className="text-[10px] text-slate-400 font-bold mt-0.5">
                    Planifiez vos matchs en renseignant une date et une heure.
                  </p>
                </div>

                <div className="space-y-2.5 max-h-[480px] overflow-y-auto pr-1">
                  {selectedTournament.matches.filter(m => !m.date).length === 0 ? (
                    <div className="py-10 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                      <Check className="w-8 h-8 text-emerald-500 mx-auto mb-1.5" />
                      <p className="text-[10px] text-slate-500 font-black uppercase">Tous les matchs sont programmés !</p>
                    </div>
                  ) : (
                    selectedTournament.matches.filter(m => !m.date).map(m => {
                      let roundLabel = `Journée ${m.round}`;
                      if (selectedTournament.format === 'single_elimination') {
                        if (m.round === 0) roundLabel = "Huitièmes";
                        else if (m.round === 1) roundLabel = "Quarts";
                        else if (m.round === 2) roundLabel = "Demis";
                        else if (m.round === 3) roundLabel = "Finale";
                      }

                      return (
                        <div 
                          key={m.id}
                          onClick={() => handleOpenScoreEditor(m)}
                          className="p-3 bg-slate-50 rounded-xl border border-slate-200 hover:border-emerald-300 transition cursor-pointer flex flex-col gap-1.5"
                        >
                          <div className="flex justify-between items-center">
                            <span className="text-[8px] font-black uppercase tracking-wider bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">
                              {roundLabel}
                            </span>
                            <span className="text-[8px] font-black uppercase tracking-wider text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100">
                              Non planifié
                            </span>
                          </div>
                          <div className="text-[11px] font-extrabold text-slate-800 flex flex-col gap-0.5">
                            <span className="truncate">{m.homeTeam}</span>
                            <span className="text-[9px] text-slate-400 font-bold">vs</span>
                            <span className="truncate">{m.awayTeam}</span>
                          </div>
                          {canManage && (
                            <button 
                              className="w-full mt-1 bg-white hover:bg-emerald-50 border border-slate-200 hover:border-emerald-200 text-slate-600 hover:text-emerald-700 text-[9px] font-extrabold py-1.5 rounded-lg transition flex items-center justify-center gap-1 uppercase tracking-wider cursor-pointer"
                            >
                              <Calendar className="w-3 h-3" /> Programmer
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* CREATE TOURNAMENT MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-55 p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 bg-slate-900 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2.5">
                <Trophy className="w-5.5 h-5.5 text-amber-400" />
                <div>
                  <h3 className="font-black text-base uppercase tracking-tight">Nouveau Tournoi</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Configurez et générez le calendrier</p>
                </div>
              </div>
              <button 
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTournament} className="p-6 overflow-y-auto space-y-5 flex-1">
              <div className="space-y-1.5">
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-wider">Nom du Tournoi</label>
                <input 
                  type="text" 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex : Tournoi de Printemps 2026"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black text-slate-400 uppercase tracking-wider">Date du Tournoi</label>
                  <input 
                    type="date" 
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-black text-slate-400 uppercase tracking-wider">Catégorie d'âge</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                  >
                    <option value="U11">U11</option>
                    <option value="U13">U13</option>
                    <option value="U15">U15</option>
                    <option value="U18">U18</option>
                    <option value="Seniors">Seniors</option>
                    <option value="Vétérans">Vétérans</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-wider">Format de la Compétition</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setFormat('round_robin');
                      setSelectedTeams([]);
                    }}
                    className={`p-3.5 rounded-xl border-2 text-left transition flex flex-col gap-1 cursor-pointer ${
                      format === 'round_robin' 
                        ? 'border-emerald-500 bg-emerald-50/20 text-emerald-900' 
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-350'
                    }`}
                  >
                    <span className="font-extrabold text-xs">Poule Unique</span>
                    <span className="text-[10px] opacity-80 leading-snug">Championnat fermé, chaque équipe affronte toutes les autres.</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setFormat('single_elimination');
                      setSelectedTeams([]);
                    }}
                    className={`p-3.5 rounded-xl border-2 text-left transition flex flex-col gap-1 cursor-pointer ${
                      format === 'single_elimination' 
                        ? 'border-emerald-500 bg-emerald-50/20 text-emerald-900' 
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-350'
                    }`}
                  >
                    <span className="font-extrabold text-xs">Élimination Directe</span>
                    <span className="text-[10px] opacity-80 leading-snug">Format Coupe : Quarts, Demis, Finale. Matchs couperet.</span>
                  </button>
                </div>
              </div>

              {/* TEAMS SELECTION SECTION */}
              <div className="space-y-3.5 border-t border-slate-100 pt-4.5">
                <div className="flex justify-between items-center">
                  <label className="text-[11px] font-black text-slate-400 uppercase tracking-wider">
                    Équipes Engagées ({selectedTeams.length})
                  </label>
                  
                  {/* Quick Auto Fill suggestions */}
                  <div className="flex gap-1.5">
                    {format === 'round_robin' ? (
                      <button
                        type="button"
                        onClick={() => handlePrefillTeams(4)}
                        className="text-[10px] font-extrabold text-slate-500 hover:text-emerald-700 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded"
                      >
                        4 Équipes
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => handlePrefillTeams(4)}
                          className="text-[10px] font-extrabold text-slate-500 hover:text-emerald-700 bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded"
                        >
                          4 Éqs
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePrefillTeams(8)}
                          className="text-[10px] font-extrabold text-slate-500 hover:text-emerald-700 bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded"
                        >
                          8 Éqs
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customTeamName}
                    onChange={(e) => setCustomTeamName(e.target.value)}
                    placeholder="Saisir ou choisir une équipe..."
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomTeam}
                    className="bg-slate-900 hover:bg-slate-850 text-white font-extrabold text-xs px-4 py-2 rounded-xl transition cursor-pointer"
                  >
                    Ajouter
                  </button>
                </div>

                {/* Selected Teams list */}
                {selectedTeams.length === 0 ? (
                  <p className="text-[11px] text-slate-400 font-bold italic">Saisissez des noms d'équipes ou utilisez un bouton de remplissage rapide ci-dessus.</p>
                ) : (
                  <div className="flex flex-wrap gap-2 max-h-[140px] overflow-y-auto p-1.5 bg-slate-50 rounded-xl border border-slate-150">
                    {selectedTeams.map(tName => (
                      <span key={tName} className="inline-flex items-center gap-1 bg-white text-slate-800 text-[11px] font-bold pl-3 pr-1.5 py-1 rounded-lg border border-slate-200 shadow-sm">
                        {tName}
                        <button
                          type="button"
                          onClick={() => handleRemoveTeam(tName)}
                          className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 p-0.5 rounded"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-extrabold px-4 py-2.5 rounded-xl transition text-xs cursor-pointer uppercase tracking-wider"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold px-5 py-2.5 rounded-xl transition shadow-md shadow-emerald-900/10 text-xs cursor-pointer uppercase tracking-wider"
                >
                  Générer le Tournoi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT SCORE & SCHEDULE MODAL */}
      {editingMatch && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-55 p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-sm w-full overflow-hidden flex flex-col">
            <div className="p-5 bg-slate-900 text-white flex justify-between items-center">
              <span className="font-black text-sm uppercase tracking-wide">{canManage ? "Gestion du Match" : "Détails du Match"}</span>
              <button onClick={() => setEditingMatch(null)} className="text-slate-400 hover:text-white transition cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Scheduling (Date & Time) */}
              <div className="grid grid-cols-2 gap-3 pb-3 border-b border-slate-100">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Date du Match</label>
                  <input
                    type="date"
                    value={matchDate}
                    onChange={(e) => setMatchDate(e.target.value)}
                    disabled={!canManage}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-75 disabled:bg-slate-50/50"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Heure du Match</label>
                  <input
                    type="time"
                    value={matchTime}
                    onChange={(e) => setMatchTime(e.target.value)}
                    disabled={!canManage}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-75 disabled:bg-slate-50/50"
                  />
                </div>
              </div>

              {/* Status Selector */}
              <div className="space-y-1 pb-3 border-b border-slate-100">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Statut du Match</label>
                <select
                  value={matchStatus}
                  onChange={(e) => setMatchStatus(e.target.value as 'pending' | 'completed')}
                  disabled={!canManage}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-75 disabled:bg-slate-50/50"
                >
                  <option value="pending">En attente / Planifié</option>
                  <option value="completed">Terminé (Saisir le score)</option>
                </select>
              </div>

              {/* Score Input (only active if matchStatus is 'completed') */}
              {matchStatus === 'completed' ? (
                <div className="flex items-center justify-between gap-4 py-2">
                  {/* Home team */}
                  <div className="flex-1 text-center space-y-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Domicile</span>
                    <div className="font-extrabold text-xs text-slate-800 line-clamp-2 min-h-[32px] flex items-center justify-center">
                      {editingMatch.homeTeam}
                    </div>
                    <input
                      type="number"
                      min="0"
                      value={homeScore}
                      onChange={(e) => setHomeScore(Math.max(0, parseInt(e.target.value) || 0))}
                      disabled={!canManage}
                      className="w-16 h-14 text-center bg-slate-50 border border-slate-200 rounded-2xl text-xl font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-75"
                    />
                  </div>

                  <div className="text-xl font-black text-slate-300 pt-6">VS</div>

                  {/* Away team */}
                  <div className="flex-1 text-center space-y-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Extérieur</span>
                    <div className="font-extrabold text-xs text-slate-800 line-clamp-2 min-h-[32px] flex items-center justify-center">
                      {editingMatch.awayTeam}
                    </div>
                    <input
                      type="number"
                      min="0"
                      value={awayScore}
                      onChange={(e) => setAwayScore(Math.max(0, parseInt(e.target.value) || 0))}
                      disabled={!canManage}
                      className="w-16 h-14 text-center bg-slate-50 border border-slate-200 rounded-2xl text-xl font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-75"
                    />
                  </div>
                </div>
              ) : (
                <div className="py-4 text-center text-slate-400 text-xs font-medium bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  Le match est en attente de jeu. Passez le statut à "Terminé" pour enregistrer les scores.
                </div>
              )}

              {selectedTournament?.format === 'single_elimination' && matchStatus === 'completed' && homeScore === awayScore && (
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-800 text-[11px] font-bold text-center">
                  ⚠ Match de coupe : Le vainqueur sera qualifié d'office. En cas d'égalité, le score de tirs au but détermine la qualification.
                </div>
              )}

              <div className="pt-4 border-t border-slate-100 flex gap-3">
                <button
                  type="button"
                  onClick={() => setEditingMatch(null)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-extrabold py-2.5 rounded-xl transition text-xs uppercase tracking-wider cursor-pointer text-center"
                >
                  {canManage ? 'Annuler' : 'Fermer'}
                </button>
                {canManage && (
                  <button
                    type="button"
                    onClick={handleSaveScore}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-2.5 rounded-xl transition text-xs uppercase tracking-wider shadow-md cursor-pointer"
                  >
                    Valider
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* NOTIFICATIONS & ACTIVITY FEED MODAL */}
      {showNotificationsModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-55 p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-5 bg-slate-900 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-amber-400" />
                <span className="font-black text-sm uppercase tracking-wide">Flux d'Activité & Notifications</span>
              </div>
              <button onClick={() => setShowNotificationsModal(false)} className="text-slate-400 hover:text-white transition cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick action / Subscription toggle in modal header */}
            <div className="p-4 bg-slate-50 border-b border-slate-150 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 shrink-0">
              <div className="space-y-0.5">
                <p className="text-[11px] font-bold text-slate-700">Abonnement aux alertes de ce tournoi</p>
                <p className="text-[10px] text-slate-500">Soyez averti des changements de planning ou des résultats.</p>
              </div>
              <button
                onClick={handleToggleSubscription}
                className={`flex items-center gap-1.5 font-extrabold px-3.5 py-1.5 rounded-lg transition text-[10px] cursor-pointer uppercase tracking-wider border ${
                  selectedTournament && (selectedTournament.subscribers || []).includes(auth.currentUser?.uid || '')
                    ? 'bg-emerald-50 border-emerald-250 text-emerald-700 hover:bg-emerald-100'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {selectedTournament && (selectedTournament.subscribers || []).includes(auth.currentUser?.uid || '') ? (
                  <>
                    <Bell className="w-3.5 h-3.5 text-emerald-600 fill-emerald-600" />
                    <span>Abonné</span>
                  </>
                ) : (
                  <>
                    <BellOff className="w-3.5 h-3.5 text-slate-400" />
                    <span>S'abonner</span>
                  </>
                )}
              </button>
            </div>

            {/* Notifications List */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {notifications.length === 0 ? (
                <div className="py-12 text-center">
                  <BellOff className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <h3 className="font-extrabold text-slate-700 text-xs">Aucune notification</h3>
                  <p className="text-[11px] text-slate-500 max-w-xs mx-auto mt-1 leading-relaxed">
                    Il n'y a pas encore d'activité enregistrée pour ce tournoi. Les changements de planning et résultats de matchs s'afficheront ici.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {notifications.map((notif) => (
                    <div key={notif.id} className="bg-slate-50 rounded-2xl border border-slate-150 p-4 space-y-2.5 hover:bg-slate-100/50 transition">
                      <div className="flex justify-between items-start gap-4">
                        <div className="flex gap-2.5">
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border ${
                            notif.type === 'match_result'
                              ? 'bg-amber-50 border-amber-100 text-amber-600'
                              : 'bg-sky-50 border-sky-100 text-sky-600'
                          }`}>
                            {notif.type === 'match_result' ? (
                              <Trophy className="w-4 h-4" />
                            ) : (
                              <Calendar className="w-4 h-4" />
                            )}
                          </div>
                          <div>
                            <h4 className="font-extrabold text-slate-900 text-xs">{notif.title}</h4>
                            <p className="text-[11px] font-semibold text-slate-500 mt-0.5 leading-relaxed">{notif.message}</p>
                          </div>
                        </div>
                        <span className="text-[9px] font-bold text-slate-400 whitespace-nowrap bg-slate-200/50 px-2 py-0.5 rounded-full shrink-0">
                          {(() => {
                            try {
                              const d = new Date(notif.createdAt);
                              return d.toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
                            } catch {
                              return notif.createdAt;
                            }
                          })()}
                        </span>
                      </div>
                      <div className="pt-2 border-t border-slate-200/60 flex justify-between items-center text-[10px] text-slate-400 font-bold uppercase tracking-wide">
                        <span>Auteur : {notif.createdBy.split('@')[0]}</span>
                        <span className="bg-white border border-slate-150 px-2 py-0.5 rounded text-[9px]">
                          {notif.type === 'match_result' ? 'Résultat' : 'Planning'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 flex justify-end shrink-0 bg-slate-50">
              <button
                onClick={() => setShowNotificationsModal(false)}
                className="bg-slate-900 hover:bg-slate-850 text-white font-extrabold px-5 py-2.5 rounded-xl transition text-xs uppercase tracking-wider cursor-pointer"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
