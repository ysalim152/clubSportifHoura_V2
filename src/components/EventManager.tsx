import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { db, handleFirestoreError, OperationType, auth, sanitizeData } from '../firebase';
import { collection, doc, setDoc, deleteDoc, getDocs, writeBatch, updateDoc } from 'firebase/firestore';
import { Club, Event, Team, Member, Convocation, PlayerMatchStat } from '../types';
import { 
  Plus as PlusIcon, Calendar as CalendarIcon, Clock as ClockIcon, 
  MapPin as MapPinIcon, Check as CheckIcon, X as XIcon, Trash2 as TrashIcon, 
  Award as AwardIcon, CheckSquare, Sparkles, Smile, ChevronRight, ChevronLeft,
  Trophy, Star, Percent, Flame, Activity, Users, Search, Share2, Sliders, Grid, List, Clipboard
} from 'lucide-react';

interface EventManagerProps {
  club: Club;
  events: Event[];
  teams: Team[];
  members: Member[];
  onRefresh: () => void;
  quickAction: string | null;
  clearQuickAction: () => void;
}

interface ExtendedEvent extends Event {
  lineup?: {
    goalkeeper?: string;
    defenders?: string[];
    midfielders?: string[];
    attackers?: string[];
  };
}

export default function EventManager({ 
  club, events, teams, members, onRefresh, quickAction, clearQuickAction 
}: EventManagerProps) {
  const [viewMode, setViewMode] = useState<'calendar' | 'leaderboards'>('calendar');
  const [detailsTab, setDetailsTab] = useState<'convocations' | 'bilan' | 'tactique'>('convocations');
  const [showEventForm, setShowEventForm] = useState(quickAction === 'create_event');
  const [selectedEvent, setSelectedEvent] = useState<ExtendedEvent | null>(null);
  const [convocations, setConvocations] = useState<Convocation[]>([]);
  const [isLoadingConvocations, setIsLoadingConvocations] = useState(false);

  // Advanced Filtering and Calendar View State
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterTeam, setFilterTeam] = useState<string>('all');
  const [filterTime, setFilterTime] = useState<'all' | 'upcoming' | 'past'>('upcoming');
  const [calendarView, setCalendarView] = useState<'list' | 'month'>('list');
  const [currentCalendarMonth, setCurrentCalendarMonth] = useState<Date>(new Date());
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<Date | null>(null);

  // All Statistics for Leaderboards & Form loading
  const [allPlayerStats, setAllPlayerStats] = useState<PlayerMatchStat[]>([]);
  const [isLoadingAllStats, setIsLoadingAllStats] = useState(false);
  const [allConvocations, setAllConvocations] = useState<Convocation[]>([]);
  const [isLoadingAllConvocations, setIsLoadingAllConvocations] = useState(false);

  // Match Report Bilan form state
  const [reportForm, setReportForm] = useState<Record<string, {
    goals: number;
    assists: number;
    yellowCards: number;
    redCards: number;
    rating: number;
    comment: string;
  }>>({});

  // Tactical Lineup Creator States
  const [tacticalFormation, setTacticalFormation] = useState<'4-4-2' | '4-3-3' | '4-2-3-1' | '3-5-2'>('4-4-2');
  const [tacticalAssignments, setTacticalAssignments] = useState<Record<string, string>>({}); // positionId -> memberId
  const [manualAddMemberId, setManualAddMemberId] = useState('');

  // Synchronize tactical assignments from convocations
  useEffect(() => {
    const assignments: Record<string, string> = {};
    convocations.forEach(c => {
      if (c.role === 'starter' && c.position) {
        assignments[c.position] = c.memberId;
      }
    });
    setTacticalAssignments(assignments);
  }, [convocations]);

  // Compute standard tactical positions coordinates (French terminology)
  const formationPositions = React.useMemo(() => {
    switch(tacticalFormation) {
      case '4-3-3':
        return {
          'GB': { x: '50%', y: '88%' },
          'DG': { x: '15%', y: '70%' },
          'DC1': { x: '38%', y: '73%' },
          'DC2': { x: '62%', y: '73%' },
          'DD': { x: '85%', y: '70%' },
          'MDC': { x: '50%', y: '54%' },
          'MC1': { x: '30%', y: '44%' },
          'MC2': { x: '70%', y: '44%' },
          'AG': { x: '20%', y: '22%' },
          'AC': { x: '50%', y: '16%' },
          'AD': { x: '80%', y: '22%' }
        };
      case '4-2-3-1':
        return {
          'GB': { x: '50%', y: '88%' },
          'DG': { x: '15%', y: '70%' },
          'DC1': { x: '38%', y: '73%' },
          'DC2': { x: '62%', y: '73%' },
          'DD': { x: '85%', y: '70%' },
          'MDF1': { x: '35%', y: '56%' },
          'MDF2': { x: '65%', y: '56%' },
          'MG': { x: '15%', y: '36%' },
          'MOC': { x: '50%', y: '32%' },
          'MD': { x: '85%', y: '36%' },
          'BC': { x: '50%', y: '14%' }
        };
      case '3-5-2':
        return {
          'GB': { x: '50%', y: '88%' },
          'DC1': { x: '25%', y: '73%' },
          'DC2': { x: '50%', y: '75%' },
          'DC3': { x: '75%', y: '73%' },
          'MG': { x: '12%', y: '48%' },
          'MDC': { x: '50%', y: '54%' },
          'MC1': { x: '32%', y: '40%' },
          'MC2': { x: '68%', y: '40%' },
          'MD': { x: '88%', y: '48%' },
          'BC1': { x: '35%', y: '18%' },
          'BC2': { x: '65%', y: '18%' }
        };
      case '4-4-2':
      default:
        return {
          'GB': { x: '50%', y: '88%' },
          'DG': { x: '15%', y: '70%' },
          'DC1': { x: '38%', y: '72%' },
          'DC2': { x: '62%', y: '72%' },
          'DD': { x: '85%', y: '70%' },
          'MG': { x: '15%', y: '44%' },
          'MC1': { x: '38%', y: '47%' },
          'MC2': { x: '62%', y: '47%' },
          'MD': { x: '85%', y: '44%' },
          'BC1': { x: '35%', y: '18%' },
          'BC2': { x: '65%', y: '18%' }
        };
    }
  }, [tacticalFormation]);

  // Feedback State
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Event Form State
  const [title, setTitle] = useState('');
  const [type, setType] = useState<'training' | 'match' | 'tournament' | 'other'>('match');
  const [teamId, setTeamId] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [location, setLocation] = useState('');
  const [opponent, setOpponent] = useState('');
  const [details, setDetails] = useState('');

  // Score Form State
  const [scoreHome, setScoreHome] = useState('');
  const [scoreAway, setScoreAway] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch all player statistics for the club
  const fetchAllPlayerStats = async () => {
    setIsLoadingAllStats(true);
    try {
      const q = collection(db, 'clubs', club.id, 'playerStats');
      const snap = await getDocs(q).catch(err => {
        handleFirestoreError(err, OperationType.LIST, `clubs/${club.id}/playerStats`);
        throw err;
      });
      const list: PlayerMatchStat[] = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() } as PlayerMatchStat);
      });
      setAllPlayerStats(list);
    } catch (err: any) {
      console.error("Error fetching all player stats:", err);
    } finally {
      setIsLoadingAllStats(false);
    }
  };

  // Fetch all convocations for all events in parallel to compute attendance
  const fetchAllConvocations = async () => {
    if (events.length === 0) {
      setAllConvocations([]);
      return;
    }
    setIsLoadingAllConvocations(true);
    try {
      const promises = events.map(async (evt) => {
        const q = collection(db, 'clubs', club.id, 'events', evt.id, 'convocations');
        const snap = await getDocs(q).catch(err => {
          handleFirestoreError(err, OperationType.LIST, `clubs/${club.id}/events/${evt.id}/convocations`);
          throw err;
        });
        const list: Convocation[] = [];
        snap.forEach(d => {
          list.push({ id: d.id, ...d.data() } as Convocation);
        });
        return list;
      });
      const results = await Promise.all(promises);
      setAllConvocations(results.flat());
    } catch (err) {
      console.error("Error fetching all convocations:", err);
    } finally {
      setIsLoadingAllConvocations(false);
    }
  };

  useEffect(() => {
    fetchAllPlayerStats();
  }, [club.id]);

  useEffect(() => {
    fetchAllConvocations();
  }, [events, club.id]);

  useEffect(() => {
    if (quickAction === 'create_event') {
      setShowEventForm(true);
      clearQuickAction();
    }
  }, [quickAction]);

  // Synchronize Report Form whenever convocations or selectedEvent or stats change
  useEffect(() => {
    if (selectedEvent) {
      const initialForm: typeof reportForm = {};
      convocations.forEach(conv => {
        const existingStat = allPlayerStats.find(
          stat => stat.eventId === selectedEvent.id && stat.memberId === conv.memberId
        );
        initialForm[conv.memberId] = {
          goals: existingStat?.goals || 0,
          assists: existingStat?.assists || 0,
          yellowCards: existingStat?.yellowCards || 0,
          redCards: existingStat?.redCards || 0,
          rating: existingStat?.rating || 0,
          comment: existingStat?.comment || ''
        };
      });
      setReportForm(initialForm);
    }
    setSuccessMsg(null);
  }, [selectedEvent, convocations, allPlayerStats]);

  const handleUpdateReportField = (memberId: string, field: string, value: any) => {
    setReportForm(prev => ({
      ...prev,
      [memberId]: {
        ...prev[memberId],
        [field]: value
      }
    }));
  };

  const handleSaveMatchReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEvent) return;

    setIsLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const batch = writeBatch(db);
      
      (Object.entries(reportForm) as [string, {
        goals: number;
        assists: number;
        yellowCards: number;
        redCards: number;
        rating: number;
        comment: string;
      }][]).forEach(([memberId, values]) => {
        const statId = `${selectedEvent.id}_${memberId}`;
        const ref = doc(db, 'clubs', club.id, 'playerStats', statId);
        batch.set(ref, sanitizeData({
          id: statId,
          clubId: club.id,
          eventId: selectedEvent.id,
          memberId,
          goals: values.goals,
          assists: values.assists,
          yellowCards: values.yellowCards,
          redCards: values.redCards,
          rating: values.rating,
          comment: values.comment
        }));
      });

      await batch.commit().catch(err => {
        handleFirestoreError(err, OperationType.WRITE, `clubs/${club.id}/playerStats`);
        throw err;
      });

      setSuccessMsg("Bilan du match enregistré avec succès !");
      await fetchAllPlayerStats();
      onRefresh();
    } catch (err: any) {
      setError("Erreur d'enregistrement du bilan: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Memoized Computations for leaderboards
  const goalscorers = React.useMemo(() => {
    const map: Record<string, number> = {};
    allPlayerStats.forEach(stat => {
      if (stat.goals > 0) {
        map[stat.memberId] = (map[stat.memberId] || 0) + stat.goals;
      }
    });
    return Object.entries(map)
      .map(([memberId, totalGoals]) => {
        const m = members.find(player => player.id === memberId);
        return {
          memberId,
          name: m ? `${m.firstName} ${m.lastName}` : "Joueur inconnu",
          email: m?.email || '',
          goals: totalGoals
        };
      })
      .sort((a, b) => b.goals - a.goals);
  }, [allPlayerStats, members]);

  const playmakers = React.useMemo(() => {
    const map: Record<string, number> = {};
    allPlayerStats.forEach(stat => {
      if (stat.assists > 0) {
        map[stat.memberId] = (map[stat.memberId] || 0) + stat.assists;
      }
    });
    return Object.entries(map)
      .map(([memberId, totalAssists]) => {
        const m = members.find(player => player.id === memberId);
        return {
          memberId,
          name: m ? `${m.firstName} ${m.lastName}` : "Joueur inconnu",
          email: m?.email || '',
          assists: totalAssists
        };
      })
      .sort((a, b) => b.assists - a.assists);
  }, [allPlayerStats, members]);

  const attendanceStats = React.useMemo(() => {
    const players = members.filter(m => m.role === 'player');
    return players.map(player => {
      const convs = allConvocations.filter(c => c.memberId === player.id);
      const totalConvoked = convs.length;
      const totalPresent = convs.filter(c => c.status === 'confirmed').length;
      const rate = totalConvoked > 0 ? Math.round((totalPresent / totalConvoked) * 100) : 0;
      return {
        player,
        totalConvoked,
        totalPresent,
        rate
      };
    }).sort((a, b) => b.rate - a.rate);
  }, [allConvocations, members]);

  const disciplineLeaderboard = React.useMemo(() => {
    const map: Record<string, { yellow: number; red: number; score: number }> = {};
    allPlayerStats.forEach(stat => {
      if (stat.yellowCards > 0 || stat.redCards > 0) {
        if (!map[stat.memberId]) {
          map[stat.memberId] = { yellow: 0, red: 0, score: 0 };
        }
        map[stat.memberId].yellow += stat.yellowCards;
        map[stat.memberId].red += stat.redCards;
        map[stat.memberId].score += (stat.yellowCards * 1) + (stat.redCards * 3);
      }
    });
    return Object.entries(map)
      .map(([memberId, counts]) => {
        const m = members.find(player => player.id === memberId);
        return {
          memberId,
          name: m ? `${m.firstName} ${m.lastName}` : "Joueur inconnu",
          email: m?.email || '',
          yellow: counts.yellow,
          red: counts.red,
          score: counts.score
        };
      })
      .sort((a, b) => b.score - a.score); // highest penalty score first
  }, [allPlayerStats, members]);

  const ratingLeaderboard = React.useMemo(() => {
    const map: Record<string, { sum: number; count: number }> = {};
    allPlayerStats.forEach(stat => {
      if (stat.rating > 0) {
        if (!map[stat.memberId]) {
          map[stat.memberId] = { sum: 0, count: 0 };
        }
        map[stat.memberId].sum += stat.rating;
        map[stat.memberId].count += 1;
      }
    });
    return Object.entries(map)
      .map(([memberId, data]) => {
        const m = members.find(player => player.id === memberId);
        return {
          memberId,
          name: m ? `${m.firstName} ${m.lastName}` : "Joueur inconnu",
          email: m?.email || '',
          avgRating: Math.round((data.sum / data.count) * 10) / 10,
          matchesRated: data.count
        };
      })
      .sort((a, b) => b.avgRating - a.avgRating);
  }, [allPlayerStats, members]);

  const fetchConvocations = async (eventId: string) => {
    setIsLoadingConvocations(true);
    try {
      const q = collection(db, 'clubs', club.id, 'events', eventId, 'convocations');
      const snap = await getDocs(q).catch(err => {
        handleFirestoreError(err, OperationType.LIST, `clubs/${club.id}/events/${eventId}/convocations`);
        throw err;
      });
      const list: Convocation[] = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() } as Convocation);
      });
      setConvocations(list);
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsLoadingConvocations(false);
    }
  };

  useEffect(() => {
    if (selectedEvent) {
      fetchConvocations(selectedEvent.id);
    } else {
      setConvocations([]);
    }
  }, [selectedEvent]);

  const resetForm = () => {
    setTitle('');
    setType('match');
    setTeamId('');
    setStart('');
    setEnd('');
    setLocation('');
    setOpponent('');
    setDetails('');
    setShowEventForm(false);
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !teamId || !start || !end) return;

    setIsLoading(true);
    setError(null);
    try {
      const eventId = 'event_' + Math.random().toString(36).substring(2, 11);
      const path = `clubs/${club.id}/events/${eventId}`;

      const newEvent: Event = {
        id: eventId,
        clubId: club.id,
        teamId,
        title: title.trim(),
        type,
        start,
        end,
        location: location.trim() || undefined,
        opponent: type === 'match' ? opponent.trim() || undefined : undefined,
        convocationStatus: 'sent',
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'clubs', club.id, 'events', eventId), sanitizeData(newEvent)).catch(err => {
        handleFirestoreError(err, OperationType.WRITE, path);
        throw err;
      });

      // Auto-convoke all players by default to make the flow simple & rewarding
      const players = members.filter(m => m.role === 'player');
      const batch = writeBatch(db);
      players.forEach(p => {
        const convId = eventId + '_' + p.id;
        const convRef = doc(db, 'clubs', club.id, 'events', eventId, 'convocations', convId);
        batch.set(convRef, {
          id: convId,
          eventId,
          memberId: p.id,
          status: 'pending',
          updatedAt: new Date().toISOString()
        });
      });
      await batch.commit().catch(err => {
        handleFirestoreError(err, OperationType.WRITE, `clubs/${club.id}/events/${eventId}/convocations`);
      });

      resetForm();
      onRefresh();
    } catch (err: any) {
      setError("Erreur de création: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteEvent = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Supprimer cet événement ?")) return;

    setIsLoading(true);
    setError(null);
    try {
      const path = `clubs/${club.id}/events/${id}`;
      await deleteDoc(doc(db, 'clubs', club.id, 'events', id)).catch(err => {
        handleFirestoreError(err, OperationType.DELETE, path);
        throw err;
      });
      if (selectedEvent?.id === id) setSelectedEvent(null);
      onRefresh();
    } catch (err: any) {
      setError("Erreur lors de la suppression: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateStatus = async (conv: Convocation, newStatus: 'confirmed' | 'declined' | 'absent' | 'present') => {
    setIsLoading(true);
    try {
      const path = `clubs/${club.id}/events/${selectedEvent!.id}/convocations/${conv.id}`;
      await setDoc(doc(db, 'clubs', club.id, 'events', selectedEvent!.id, 'convocations', conv.id), sanitizeData({
        ...conv,
        status: newStatus,
        updatedAt: new Date().toISOString()
      })).catch(err => {
        handleFirestoreError(err, OperationType.WRITE, path);
        throw err;
      });
      fetchConvocations(selectedEvent!.id);
    } catch (err: any) {
      setError("Erreur de mise à jour du statut: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveScore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEvent) return;

    setIsLoading(true);
    try {
      const path = `clubs/${club.id}/events/${selectedEvent.id}`;
      await setDoc(doc(db, 'clubs', club.id, 'events', selectedEvent.id), sanitizeData({
        ...selectedEvent,
        scoreHome: scoreHome !== '' ? Number(scoreHome) : undefined,
        scoreAway: scoreAway !== '' ? Number(scoreAway) : undefined
      })).catch(err => {
        handleFirestoreError(err, OperationType.WRITE, path);
        throw err;
      });

      setSelectedEvent({
        ...selectedEvent,
        scoreHome: scoreHome !== '' ? Number(scoreHome) : undefined,
        scoreAway: scoreAway !== '' ? Number(scoreAway) : undefined
      });
      setScoreHome('');
      setScoreAway('');
      onRefresh();
    } catch (err: any) {
      setError("Erreur d'enregistrement du score: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Dynamic Role check based on current user email
  const currentUserEmail = auth.currentUser?.email;
  const currentUserMember = members.find(m => m.email === currentUserEmail);
  const currentUserRole = currentUserMember?.role || 'visiteur';
  const canManage = ['admin', 'president', 'vice_president_1', 'vice_president_2', 'sec_general', 'tresorier', 'coach'].includes(currentUserRole);

  const handleAddPlayerToConvocation = async (memberId: string) => {
    if (!selectedEvent) return;
    setIsLoading(true);
    setError(null);
    try {
      const convId = selectedEvent.id + '_' + memberId;
      const convRef = doc(db, 'clubs', club.id, 'events', selectedEvent.id, 'convocations', convId);
      await setDoc(convRef, {
        id: convId,
        eventId: selectedEvent.id,
        memberId,
        status: 'pending',
        role: 'player',
        updatedAt: new Date().toISOString()
      }).catch(err => {
        handleFirestoreError(err, OperationType.WRITE, `clubs/${club.id}/events/${selectedEvent.id}/convocations/${convId}`);
        throw err;
      });
      await fetchConvocations(selectedEvent.id);
      await fetchAllConvocations();
    } catch (err: any) {
      setError("Erreur d'ajout à la convocation : " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemovePlayerFromConvocation = async (convId: string) => {
    if (!selectedEvent) return;
    if (!window.confirm("Retirer ce joueur de la convocation ?")) return;
    setIsLoading(true);
    setError(null);
    try {
      await deleteDoc(doc(db, 'clubs', club.id, 'events', selectedEvent.id, 'convocations', convId)).catch(err => {
        handleFirestoreError(err, OperationType.DELETE, `clubs/${club.id}/events/${selectedEvent.id}/convocations/${convId}`);
        throw err;
      });
      await fetchConvocations(selectedEvent.id);
      await fetchAllConvocations();
    } catch (err: any) {
      setError("Erreur de retrait de la convocation : " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateConvocationRole = async (conv: Convocation, newRole: string) => {
    if (!selectedEvent) return;
    setIsLoading(true);
    setError(null);
    try {
      const convRef = doc(db, 'clubs', club.id, 'events', selectedEvent.id, 'convocations', conv.id);
      await updateDoc(convRef, {
        role: newRole,
        updatedAt: new Date().toISOString()
      }).catch(err => {
        handleFirestoreError(err, OperationType.WRITE, `clubs/${club.id}/events/${selectedEvent.id}/convocations/${conv.id}`);
        throw err;
      });
      await fetchConvocations(selectedEvent.id);
    } catch (err: any) {
      setError("Erreur de mise à jour du rôle : " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveLineup = async (updatedLineup: any) => {
    if (!selectedEvent) return;
    setIsLoading(true);
    setError(null);
    try {
      const path = `clubs/${club.id}/events/${selectedEvent.id}`;
      const updatedEvent = {
        ...selectedEvent,
        lineup: updatedLineup
      };
      await setDoc(doc(db, 'clubs', club.id, 'events', selectedEvent.id), sanitizeData(updatedEvent)).catch(err => {
        handleFirestoreError(err, OperationType.WRITE, path);
        throw err;
      });
      setSelectedEvent(updatedEvent);
      onRefresh();
    } catch (err: any) {
      setError("Erreur d'enregistrement de la composition : " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Generate a beautiful WhatsApp Convocations text template and return sharing URL
  const getWhatsAppShareUrl = () => {
    if (!selectedEvent) return '';
    const dateStr = new Date(selectedEvent.start).toLocaleDateString('fr-FR', { 
      weekday: 'long', 
      day: 'numeric', 
      month: 'long', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    
    let text = `*📋 CONVOCATIONS - ${selectedEvent.title.toUpperCase()}*\n\n`;
    text += `📅 *Date :* ${dateStr}\n`;
    if (selectedEvent.location) text += `📍 *Lieu :* ${selectedEvent.location}\n`;
    if (selectedEvent.opponent) text += `⚔️ *Adversaire :* ${selectedEvent.opponent}\n`;
    text += `\n*🛡️ GROUPE CONVOQUÉ :*\n`;
    
    const starters = convocations.filter(c => c.role === 'starter');
    const subs = convocations.filter(c => c.role === 'substitute');
    const unassigned = convocations.filter(c => !c.role || (c.role !== 'starter' && c.role !== 'substitute'));
    
    if (starters.length > 0) {
      text += `\n🌟 *Titulaires :*\n`;
      starters.forEach(c => {
        const m = members.find(player => player.id === c.memberId);
        if (m) text += `- ${m.firstName} ${m.lastName} (${c.position || 'Non défini'})\n`;
      });
    }
    
    if (subs.length > 0) {
      text += `\n🔄 *Remplaçants :*\n`;
      subs.forEach(c => {
        const m = members.find(player => player.id === c.memberId);
        if (m) text += `- ${m.firstName} ${m.lastName}\n`;
      });
    }

    if (unassigned.length > 0) {
      if (starters.length === 0 && subs.length === 0) {
        text += `\n📋 *Joueurs :*\n`;
      } else {
        text += `\n📋 *Autres convoqués :*\n`;
      }
      unassigned.forEach(c => {
        const m = members.find(player => player.id === c.memberId);
        if (m) text += `- ${m.firstName} ${m.lastName}\n`;
      });
    }
    
    text += `\n👉 *Merci de confirmer votre présence sur l'application dès que possible.*`;
    return `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
  };

  // Filter events based on search, type, team, past/upcoming, and clicked date
  const filteredEvents = React.useMemo(() => {
    let list = [...events];
    
    if (searchTerm.trim() !== '') {
      const q = searchTerm.toLowerCase();
      list = list.filter(evt => 
        evt.title.toLowerCase().includes(q) || 
        evt.opponent?.toLowerCase().includes(q) || 
        evt.location?.toLowerCase().includes(q)
      );
    }
    
    if (filterType !== 'all') {
      list = list.filter(evt => evt.type === filterType);
    }
    
    if (filterTeam !== 'all') {
      list = list.filter(evt => evt.teamId === filterTeam);
    }
    
    const now = new Date();
    if (filterTime === 'upcoming') {
      list = list.filter(evt => new Date(evt.start) >= now);
    } else if (filterTime === 'past') {
      list = list.filter(evt => new Date(evt.start) < now);
    }

    if (selectedCalendarDate) {
      const targetStr = selectedCalendarDate.toDateString();
      list = list.filter(evt => new Date(evt.start).toDateString() === targetStr);
    }
    
    // Sort by chronological order (past events or upcoming)
    return list.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  }, [events, searchTerm, filterType, filterTeam, filterTime, selectedCalendarDate]);

  // Compute days for monthly grid view
  const calendarDays = React.useMemo(() => {
    const year = currentCalendarMonth.getFullYear();
    const month = currentCalendarMonth.getMonth();
    const firstDayIndexRaw = new Date(year, month, 1).getDay();
    const firstDayIndex = firstDayIndexRaw === 0 ? 6 : firstDayIndexRaw - 1; 
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const days: (Date | null)[] = [];
    for (let i = 0; i < firstDayIndex; i++) {
      days.push(null);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      days.push(new Date(year, month, d));
    }
    return days;
  }, [currentCalendarMonth]);

  const handlePrevMonth = () => {
    setCurrentCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  return (
    <div className="space-y-6">
      {/* View Mode Tabs Selector */}
      <div className="flex bg-white border border-slate-200 rounded-2xl p-1.5 shadow-sm max-w-md">
        <button
          onClick={() => setViewMode('calendar')}
          className={`flex-1 py-3 px-5 rounded-xl font-bold text-sm tracking-tight transition flex items-center justify-center gap-2 cursor-pointer ${
            viewMode === 'calendar' 
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/10' 
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <CalendarIcon className="w-4 h-4" />
          Calendrier & Matchs
        </button>
        <button
          onClick={() => setViewMode('leaderboards')}
          className={`flex-1 py-3 px-5 rounded-xl font-bold text-sm tracking-tight transition flex items-center justify-center gap-2 cursor-pointer ${
            viewMode === 'leaderboards' 
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/10' 
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Trophy className="w-4 h-4" />
          Classements & Trophées
        </button>
      </div>

      <AnimatePresence mode="wait">
        {viewMode === 'calendar' ? (
          <motion.div
            key="calendar-view"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-8"
          >
            {/* Calendar List/Month Column */}
            <div className="lg:col-span-2 space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="font-extrabold text-slate-900 text-2xl tracking-tight flex items-center gap-2">
                    <CalendarIcon className="w-6 h-6 text-emerald-600" />
                    Calendrier & Matchs
                  </h3>
                  <p className="text-xs text-slate-400">Planification des activités, gestion d'effectifs et résultats.</p>
                </div>
                <div className="flex items-center gap-2">
                  {/* View Toggle */}
                  <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                    <button
                      onClick={() => setCalendarView('list')}
                      className={`p-1.5 rounded-lg transition cursor-pointer ${
                        calendarView === 'list' ? 'bg-white text-slate-800 shadow-sm font-bold' : 'text-slate-400 hover:text-slate-600'
                      }`}
                      title="Vue Liste"
                    >
                      <List className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setCalendarView('month')}
                      className={`p-1.5 rounded-lg transition cursor-pointer ${
                        calendarView === 'month' ? 'bg-white text-slate-800 shadow-sm font-bold' : 'text-slate-400 hover:text-slate-600'
                      }`}
                      title="Vue Calendrier Mensuel"
                    >
                      <Grid className="w-4 h-4" />
                    </button>
                  </div>

                  {canManage && (
                    <button
                      onClick={() => setShowEventForm(true)}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm px-4 py-2 rounded-xl shadow-md shadow-emerald-600/10 flex items-center gap-2 transition cursor-pointer"
                    >
                      <PlusIcon className="w-4 h-4" />
                      Créer un événement
                    </button>
                  )}
                </div>
              </div>

              {/* Advanced Filter Toolbar */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3">
                <div className="flex flex-col md:flex-row gap-3">
                  {/* Search Bar */}
                  <div className="relative flex-1">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Rechercher par adversaire, lieu, titre..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition outline-none"
                    />
                  </div>

                  {/* Filter Selects */}
                  <div className="grid grid-cols-3 gap-2 shrink-0">
                    <select
                      value={filterType}
                      onChange={(e) => setFilterType(e.target.value)}
                      className="px-3 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50 font-medium text-slate-700 outline-none cursor-pointer"
                    >
                      <option value="all">Tous types</option>
                      <option value="match">⚽ Matchs</option>
                      <option value="training">🏃 Entraînements</option>
                      <option value="tournament">🏆 Tournois</option>
                      <option value="other">📅 Autres</option>
                    </select>

                    <select
                      value={filterTeam}
                      onChange={(e) => setFilterTeam(e.target.value)}
                      className="px-3 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50 font-medium text-slate-700 outline-none cursor-pointer"
                    >
                      <option value="all">Équipes (Toutes)</option>
                      {teams.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>

                    <select
                      value={filterTime}
                      onChange={(e) => setFilterTime(e.target.value as any)}
                      className="px-3 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50 font-medium text-slate-700 outline-none cursor-pointer"
                    >
                      <option value="upcoming">🗓️ À venir</option>
                      <option value="past">✅ Passés</option>
                      <option value="all">♾️ Tout</option>
                    </select>
                  </div>
                </div>

                {/* Day Filter Indicator */}
                {selectedCalendarDate && (
                  <div className="flex items-center justify-between bg-emerald-50 text-emerald-800 border border-emerald-100 rounded-xl px-3 py-1.5 text-xs animate-fadeIn">
                    <span className="flex items-center gap-1.5 font-semibold">
                      <CalendarIcon className="w-3.5 h-3.5 text-emerald-600" />
                      Filtre : {selectedCalendarDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </span>
                    <button
                      onClick={() => setSelectedCalendarDate(null)}
                      className="text-[10px] font-bold text-emerald-600 hover:text-emerald-800 cursor-pointer uppercase outline-none"
                    >
                      Effacer le filtre
                    </button>
                  </div>
                )}
              </div>

              {error && (
                <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl flex items-start gap-3">
                  <XIcon className="w-5 h-5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Event Form */}
              {showEventForm && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4"
                >
                  <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                    <h4 className="font-bold text-slate-900 text-sm">Ajouter un Événement</h4>
                    <button onClick={resetForm} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                      <XIcon className="w-5 h-5" />
                    </button>
                  </div>

                  <form onSubmit={handleCreateEvent} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-600 uppercase">Intitulé de l'événement</label>
                        <input
                          type="text"
                          required
                          placeholder="ex: Match vs FC Lyon, Entraînement Technique..."
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-600 uppercase">Équipe concernée</label>
                        <select
                          value={teamId}
                          onChange={(e) => setTeamId(e.target.value)}
                          required
                          className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
                        >
                          <option value="">Sélectionner une équipe...</option>
                          {teams.map(t => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-600 uppercase">Type</label>
                        <select
                          value={type}
                          onChange={(e) => setType(e.target.value as any)}
                          className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
                        >
                          <option value="match">⚽ Match officiel</option>
                          <option value="training">🏃 Entraînement</option>
                          <option value="tournament">🏆 Tournoi / Coupe</option>
                          <option value="other">📅 Autre</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-600 uppercase">Début</label>
                        <input
                          type="datetime-local"
                          required
                          value={start}
                          onChange={(e) => setStart(e.target.value)}
                          className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-600 uppercase">Fin</label>
                        <input
                          type="datetime-local"
                          required
                          value={end}
                          onChange={(e) => setEnd(e.target.value)}
                          className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-600 uppercase">Lieu / Stade</label>
                        <input
                          type="text"
                          placeholder="ex: Stade Municipal, Terrain Honneur..."
                          value={location}
                          onChange={(e) => setLocation(e.target.value)}
                          className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
                        />
                      </div>

                      {type === 'match' && (
                        <div className="space-y-1">
                          <label className="text-xs font-bold text-slate-600 uppercase">Adversaire</label>
                          <input
                            type="text"
                            placeholder="ex: Olympique Lyonnais"
                            value={opponent}
                            onChange={(e) => setOpponent(e.target.value)}
                            className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
                          />
                        </div>
                      )}
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={resetForm}
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
                        Enregistrer l'événement
                      </button>
                    </div>
                  </form>
                </motion.div>
              )}

              {/* Monthly Calendar Grid */}
              {calendarView === 'month' && (
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                  {/* Month Selector Header */}
                  <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                    <h4 className="font-extrabold text-slate-800 text-sm capitalize">
                      {currentCalendarMonth.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                    </h4>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={handlePrevMonth}
                        className="p-1.5 hover:bg-slate-100 text-slate-600 rounded-lg transition cursor-pointer"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setCurrentCalendarMonth(new Date())}
                        className="text-[10px] font-bold px-2 py-1 text-emerald-600 hover:bg-emerald-50 rounded-lg transition cursor-pointer uppercase"
                      >
                        Aujourd'hui
                      </button>
                      <button
                        onClick={handleNextMonth}
                        className="p-1.5 hover:bg-slate-100 text-slate-600 rounded-lg transition cursor-pointer"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Calendar Grid */}
                  <div className="grid grid-cols-7 gap-1.5 text-center">
                    {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(day => (
                      <div key={day} className="text-[10px] font-bold text-slate-400 uppercase py-1">
                        {day}
                      </div>
                    ))}

                    {calendarDays.map((date, idx) => {
                      if (!date) {
                        return <div key={`empty-${idx}`} className="aspect-square bg-slate-50/50 rounded-lg" />;
                      }

                      const isToday = date.toDateString() === new Date().toDateString();
                      const isSelectedDate = selectedCalendarDate?.toDateString() === date.toDateString();
                      
                      // Find events on this date
                      const dayEvents = events.filter(evt => new Date(evt.start).toDateString() === date.toDateString());

                      return (
                        <div
                          key={date.toISOString()}
                          onClick={() => setSelectedCalendarDate(date)}
                          className={`aspect-square p-1 rounded-lg cursor-pointer transition flex flex-col justify-between items-center border ${
                            isSelectedDate 
                              ? 'bg-emerald-600 border-emerald-600 text-white shadow-md shadow-emerald-600/20' 
                              : isToday 
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-950 font-extrabold' 
                              : 'bg-white border-slate-100 hover:bg-slate-50 text-slate-800'
                          }`}
                        >
                          <span className="text-[11px] font-bold leading-none">{date.getDate()}</span>
                          
                          {/* Event Dots indicator */}
                          {dayEvents.length > 0 && (
                            <div className="flex gap-1 justify-center max-w-full overflow-hidden">
                              {dayEvents.slice(0, 3).map(evt => (
                                <span 
                                  key={evt.id} 
                                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                    isSelectedDate ? 'bg-white' :
                                    evt.type === 'match' ? 'bg-red-500' :
                                    evt.type === 'training' ? 'bg-blue-500' : 'bg-slate-400'
                                  }`} 
                                />
                              ))}
                              {dayEvents.length > 3 && (
                                <span className={`text-[7px] font-bold shrink-0 ${isSelectedDate ? 'text-white' : 'text-slate-400'}`}>+</span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Calendar Lists */}
              <div className="space-y-4">
                {filteredEvents.length === 0 ? (
                  <div className="py-12 bg-white border border-slate-200 rounded-2xl text-center text-slate-400 text-sm">
                    Aucun événement correspondant aux filtres sélectionnés.
                  </div>
                ) : (
                  filteredEvents.map(evt => {
                    const team = teams.find(t => t.id === evt.teamId);
                    const isSelected = selectedEvent?.id === evt.id;

                    return (
                      <div
                        key={evt.id}
                        onClick={() => setSelectedEvent(evt)}
                        className={`p-5 bg-white border rounded-2xl cursor-pointer transition flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                          isSelected ? 'border-emerald-600 ring-2 ring-emerald-50' : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-start gap-4">
                          <div className="w-12 h-12 bg-slate-50 rounded-xl border border-slate-100 flex flex-col items-center justify-center shrink-0">
                            <span className="text-[10px] text-slate-400 font-extrabold uppercase">
                              {new Date(evt.start).toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '')}
                            </span>
                            <span className="text-lg font-black text-slate-950 leading-none">
                              {new Date(evt.start).toLocaleDateString('fr-FR', { day: 'numeric' })}
                            </span>
                          </div>

                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${
                                evt.type === 'match' ? 'bg-red-50 text-red-600 border border-red-100' :
                                evt.type === 'training' ? 'bg-blue-50 text-blue-600 border border-blue-100' :
                                'bg-slate-100 text-slate-600'
                              }`}>
                                {evt.type === 'match' ? '⚽ Match' : evt.type === 'training' ? '🏃 Entraînement' : '📅 Événement'}
                              </span>
                              {team && (
                                <span className="text-xs font-semibold text-slate-500">
                                  {team.name}
                                </span>
                              )}
                            </div>

                            <h4 className="font-bold text-slate-900 text-base leading-tight">
                              {evt.title}
                              {evt.opponent && <span className="text-slate-400 font-medium"> vs {evt.opponent}</span>}
                            </h4>

                            <div className="flex items-center gap-4 text-xs text-slate-400 font-medium">
                              <span className="flex items-center gap-1">
                                <ClockIcon className="w-3.5 h-3.5" />
                                {new Date(evt.start).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} - {new Date(evt.end).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                              {evt.location && (
                                <span className="flex items-center gap-1">
                                  <MapPinIcon className="w-3.5 h-3.5" />
                                  {evt.location}
                                </span>
                              )}
                            </div>

                            {evt.scoreHome !== undefined && evt.scoreAway !== undefined && (
                              <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-800 text-xs font-bold px-3 py-1 rounded-lg border border-emerald-100 mt-2">
                                <AwardIcon className="w-3.5 h-3.5 text-emerald-600" />
                                Score: {evt.scoreHome} - {evt.scoreAway}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-end md:self-center">
                          <button
                            onClick={(e) => handleDeleteEvent(evt.id, e)}
                            className="p-2 hover:bg-slate-50 text-slate-300 hover:text-red-500 rounded-lg transition cursor-pointer"
                            title="Supprimer l'événement"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>
                          <ChevronRight className="w-5 h-5 text-slate-300" />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right Column: Attendance, Convocations, and Match Reports */}
            <div className="space-y-6">
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6 sticky top-6">
                {selectedEvent ? (
                  <div className="space-y-6">
                    <div>
                      <h4 className="font-extrabold text-slate-900 text-lg leading-tight">{selectedEvent.title}</h4>
                      <p className="text-xs text-slate-400 mt-1 truncate">Gestion de l'effectif & feuille de match</p>
                    </div>

                    {/* Sub Tab Selector if event is a match */}
                    {selectedEvent.type === 'match' ? (
                      <div className="flex bg-slate-100 p-1 rounded-xl mb-4 border border-slate-200">
                        <button
                          type="button"
                          onClick={() => setDetailsTab('convocations')}
                          className={`flex-1 py-2 text-[11px] font-bold rounded-lg transition cursor-pointer flex items-center justify-center gap-1 ${
                            detailsTab === 'convocations' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          👥 Présence ({convocations.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setDetailsTab('tactique')}
                          className={`flex-1 py-2 text-[11px] font-bold rounded-lg transition cursor-pointer flex items-center justify-center gap-1 ${
                            detailsTab === 'tactique' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          🗺️ Tactique
                        </button>
                        <button
                          type="button"
                          onClick={() => setDetailsTab('bilan')}
                          className={`flex-1 py-2 text-[11px] font-bold rounded-lg transition cursor-pointer flex items-center justify-center gap-1 ${
                            detailsTab === 'bilan' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          📝 Bilan
                        </button>
                      </div>
                    ) : (
                      // For non-matches, default to convocations/presence tab
                      <div className="bg-slate-50 p-2 rounded-xl text-xs font-bold text-slate-500 flex items-center gap-1">
                        🗓️ Événement d'entraînement ou autre activité
                      </div>
                    )}

                    {/* TAB CONTENT: CONVOCATIONS & PRESENCE */}
                    {(selectedEvent.type !== 'match' || detailsTab === 'convocations') ? (
                      <div className="space-y-6 animate-fadeIn">
                        {/* Score Capture at top of Convocations */}
                        {selectedEvent.type === 'match' && (
                          <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-3">
                            <h5 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                              <AwardIcon className="w-4 h-4 text-emerald-600" />
                              Saisir le Score du Match
                            </h5>
                            <form onSubmit={handleSaveScore} className="flex items-center gap-2">
                              <div className="flex-1 flex items-center justify-center gap-2">
                                <div className="text-center">
                                  <span className="text-[10px] text-slate-400 font-bold block mb-1">CLUB</span>
                                  <input
                                    type="number"
                                    placeholder="Score"
                                    value={scoreHome}
                                    onChange={(e) => setScoreHome(e.target.value)}
                                    className="w-16 px-2 py-1.5 border border-slate-200 rounded-lg text-center text-sm font-bold bg-white outline-none"
                                  />
                                </div>
                                <span className="font-extrabold text-slate-400 mt-4">-</span>
                                <div className="text-center">
                                  <span className="text-[10px] text-slate-400 font-bold block mb-1">ADV</span>
                                  <input
                                    type="number"
                                    placeholder="Score"
                                    value={scoreAway}
                                    onChange={(e) => setScoreAway(e.target.value)}
                                    className="w-16 px-2 py-1.5 border border-slate-200 rounded-lg text-center text-sm font-bold bg-white outline-none"
                                  />
                                </div>
                              </div>
                              <button
                                type="submit"
                                disabled={isLoading}
                                className="bg-slate-900 text-white font-semibold py-2 px-3 rounded-lg text-xs hover:bg-slate-800 transition cursor-pointer self-end mb-0.5"
                              >
                                Enregistrer
                              </button>
                            </form>
                          </div>
                        )}

                        {/* WhatsApp Share Button */}
                        <div className="flex justify-end">
                          <a
                            href={getWhatsAppShareUrl()}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-[#25D366] hover:bg-[#1ebd54] text-white font-extrabold text-xs px-4 py-2.5 rounded-xl shadow-sm flex items-center gap-2 transition cursor-pointer w-full justify-center"
                          >
                            <Share2 className="w-4 h-4" />
                            Partager les convocations sur WhatsApp
                          </a>
                        </div>

                        {/* Add Player manually Section */}
                        {canManage && (
                          <div className="p-4 bg-slate-50/50 border border-slate-200 rounded-xl space-y-3">
                            <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                              <PlusIcon className="w-4 h-4 text-emerald-600" />
                              Convoquer un joueur manuellement
                            </h5>
                            <div className="flex gap-2">
                              <select
                                id="manual-add-player-select"
                                value={manualAddMemberId}
                                onChange={(e) => setManualAddMemberId(e.target.value)}
                                className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-xs bg-white text-slate-700 outline-none"
                              >
                                <option value="">Choisir un joueur...</option>
                                {members
                                  .filter(m => m.role === 'player' && !convocations.some(c => c.memberId === m.id))
                                  .map(m => (
                                    <option key={m.id} value={m.id}>{m.firstName} {m.lastName}</option>
                                  ))}
                              </select>
                              <button
                                type="button"
                                onClick={() => {
                                  if (manualAddMemberId) {
                                    handleAddPlayerToConvocation(manualAddMemberId);
                                    setManualAddMemberId('');
                                  }
                                }}
                                className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-3 py-2 rounded-xl text-xs transition cursor-pointer"
                              >
                                Convoquer
                              </button>
                            </div>
                          </div>
                        )}

                        <div className="space-y-4">
                          <div className="flex justify-between items-center text-xs text-slate-500 font-bold border-b border-slate-100 pb-2">
                            <span>Membres Convoqués ({convocations.length})</span>
                            <span>Statut & Rôle</span>
                          </div>

                          {isLoadingConvocations ? (
                            <div className="py-8 flex justify-center">
                              <div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
                            </div>
                          ) : convocations.length === 0 ? (
                            <p className="text-xs text-slate-400 text-center py-4">Aucun joueur convoqué.</p>
                          ) : (
                            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                              {convocations.map(conv => {
                                const member = members.find(m => m.id === conv.memberId);
                                if (!member) return null;

                                return (
                                  <div
                                    key={conv.id}
                                    className="p-3 border border-slate-100 bg-slate-50/50 rounded-xl space-y-2 text-sm"
                                  >
                                    <div className="flex justify-between items-start gap-2">
                                      <div>
                                        <p className="font-extrabold text-slate-800 leading-tight">{member.firstName} {member.lastName}</p>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                                          {conv.role === 'starter' ? '🌟 Titulaire' : conv.role === 'substitute' ? '🔄 Remplaçant' : '📋 Convoqué'}
                                          {conv.position ? ` - ${conv.position}` : ''}
                                        </p>
                                      </div>

                                      <div className="flex items-center gap-1 shrink-0">
                                        <button
                                          onClick={() => handleUpdateStatus(conv, 'confirmed')}
                                          className={`p-1 rounded-lg border transition cursor-pointer ${
                                            conv.status === 'confirmed' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-white text-slate-400 hover:bg-slate-50 border-slate-200'
                                          }`}
                                          title="Présent"
                                        >
                                          <CheckIcon className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                          onClick={() => handleUpdateStatus(conv, 'declined')}
                                          className={`p-1 rounded-lg border transition cursor-pointer ${
                                            conv.status === 'declined' ? 'bg-red-100 text-red-800 border-red-200' : 'bg-white text-slate-400 hover:bg-slate-50 border-slate-200'
                                          }`}
                                          title="Absent"
                                        >
                                          <XIcon className="w-3.5 h-3.5" />
                                        </button>
                                        {canManage && (
                                          <button
                                            onClick={() => handleRemovePlayerFromConvocation(conv.id)}
                                            className="p-1 text-slate-300 hover:text-red-500 rounded-lg transition cursor-pointer"
                                            title="Désinviter"
                                          >
                                            <TrashIcon className="w-3.5 h-3.5" />
                                          </button>
                                        )}
                                      </div>
                                    </div>

                                    {/* Starter / Substitute Quick Selection Dropdown */}
                                    {canManage && (
                                      <div className="flex items-center gap-2 pt-1 border-t border-slate-100/50">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase">Statut :</span>
                                        <select
                                          value={conv.role || ''}
                                          onChange={(e) => handleUpdateConvocationRole(conv, e.target.value)}
                                          className="text-[10px] font-semibold text-slate-700 bg-white border border-slate-200 rounded px-1.5 py-0.5 outline-none cursor-pointer"
                                        >
                                          <option value="">📋 Non défini</option>
                                          <option value="starter">🌟 Titulaire</option>
                                          <option value="substitute">🔄 Remplaçant</option>
                                        </select>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : detailsTab === 'tactique' ? (
                      <div className="space-y-4 animate-fadeIn">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-500 uppercase">Dispositif :</span>
                          <select
                            value={tacticalFormation}
                            onChange={(e) => setTacticalFormation(e.target.value as any)}
                            className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs bg-white font-bold text-slate-800 outline-none cursor-pointer"
                          >
                            <option value="4-4-2">4-4-2 Standard</option>
                            <option value="4-3-3">4-3-3 Attaque</option>
                            <option value="4-2-3-1">4-2-3-1 Équilibré</option>
                            <option value="3-5-2">3-5-2 Moderne</option>
                          </select>
                        </div>

                        {/* Interactive Green Soccer Pitch Canvas */}
                        <div className="relative w-full h-[360px] bg-emerald-800 rounded-2xl overflow-hidden border-4 border-emerald-900 shadow-inner">
                          {/* Pitch Markings */}
                          <div className="absolute inset-2 border border-white/20 pointer-events-none rounded-lg" />
                          <div className="absolute top-1/2 left-2 right-2 h-px bg-white/20 pointer-events-none" />
                          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 border border-white/20 rounded-full pointer-events-none" />
                          
                          {/* Goal Areas */}
                          <div className="absolute top-2 left-1/2 -translate-x-1/2 w-32 h-14 border border-white/20 border-t-0 pointer-events-none" />
                          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-32 h-14 border border-white/20 border-b-0 pointer-events-none" />

                          {/* Render Pitch Player Dots */}
                          {Object.entries(formationPositions).map(([posId, pos]: [string, any]) => {
                            const memberId = tacticalAssignments[posId];
                            const assignedPlayer = memberId ? members.find(m => m.id === memberId) : null;

                            return (
                              <div 
                                key={posId}
                                className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-10"
                                style={{ left: pos.x, top: pos.y }}
                              >
                                <div className="relative group flex flex-col items-center">
                                  {/* Circular Player dot */}
                                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black border-2 shadow-lg transition duration-200 ${
                                    assignedPlayer 
                                      ? 'bg-yellow-400 text-slate-950 border-yellow-300 scale-110 font-bold' 
                                      : 'bg-emerald-700 text-emerald-100 border-white/40 hover:bg-emerald-600 cursor-pointer'
                                  }`}>
                                    {assignedPlayer ? `${assignedPlayer.firstName[0]}${assignedPlayer.lastName[0]}` : '+'}
                                  </div>
                                  
                                  {/* Position name label */}
                                  <span className="bg-slate-950/85 text-[8px] font-extrabold text-white px-1.5 py-0.5 rounded mt-0.5 whitespace-nowrap uppercase tracking-wider block text-center shadow-sm">
                                    {assignedPlayer ? `${assignedPlayer.lastName}` : posId}
                                  </span>

                                  {/* Select menu overlaid invisibly */}
                                  {canManage && (
                                    <select
                                      value={memberId || ''}
                                      onChange={async (e) => {
                                        const val = e.target.value;
                                        if (val === '') {
                                          // Free up position
                                          const currentConv = convocations.find(c => c.memberId === memberId);
                                          if (currentConv) {
                                            const ref = doc(db, 'clubs', club.id, 'events', selectedEvent.id, 'convocations', currentConv.id);
                                            await updateDoc(ref, { 
                                              role: '', 
                                              position: '',
                                              updatedAt: new Date().toISOString()
                                            });
                                            await fetchConvocations(selectedEvent.id);
                                          }
                                        } else {
                                          // Assign player
                                          const targetConv = convocations.find(c => c.memberId === val);
                                          if (targetConv) {
                                            const ref = doc(db, 'clubs', club.id, 'events', selectedEvent.id, 'convocations', targetConv.id);
                                            await updateDoc(ref, { 
                                              role: 'starter',
                                              position: posId,
                                              updatedAt: new Date().toISOString()
                                            });
                                            await fetchConvocations(selectedEvent.id);
                                          }
                                        }
                                      }}
                                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-20"
                                    >
                                      <option value="">-- Libre ({posId}) --</option>
                                      {convocations.map(c => {
                                        const m = members.find(player => player.id === c.memberId);
                                        if (!m) return null;
                                        const isAssigned = Object.values(tacticalAssignments).includes(c.memberId);
                                        return (
                                          <option key={c.id} value={c.memberId}>
                                            {m.firstName} {m.lastName} {isAssigned ? '⚠️ (Déjà placé)' : ''}
                                          </option>
                                        );
                                      })}
                                    </select>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* List of Substitutes */}
                        <div className="space-y-2">
                          <span className="text-xs font-bold text-slate-500 uppercase block">🔄 Remplaçants du Match :</span>
                          <div className="grid grid-cols-2 gap-2">
                            {convocations.filter(c => c.role === 'substitute').length === 0 ? (
                              <p className="text-[10px] text-slate-400 font-semibold italic col-span-2">Aucun remplaçant désigné. Tentez d'ajuster leur rôle dans l'onglet Présence.</p>
                            ) : (
                              convocations.filter(c => c.role === 'substitute').map(c => {
                                const m = members.find(player => player.id === c.memberId);
                                if (!m) return null;
                                return (
                                  <div key={c.id} className="p-2 bg-slate-50 border border-slate-150 rounded-xl flex items-center justify-between text-xs">
                                    <span className="font-extrabold text-slate-700 truncate">{m.firstName} {m.lastName}</span>
                                    {canManage && (
                                      <button
                                        onClick={() => handleUpdateConvocationRole(c, '')}
                                        className="text-[9px] font-bold text-red-500 hover:text-red-700 cursor-pointer"
                                      >
                                        Enlever
                                      </button>
                                    )}
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>

                        {/* Save Action */}
                        <button
                          type="button"
                          onClick={() => {
                            const startersList = convocations.filter(c => c.role === 'starter').map(c => c.memberId);
                            const subsList = convocations.filter(c => c.role === 'substitute').map(c => c.memberId);
                            handleSaveLineup({
                              defenders: startersList,
                              midfielders: subsList
                            });
                            setSuccessMsg("Composition et schéma tactique enregistrés avec succès !");
                          }}
                          className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold py-2.5 rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          <Clipboard className="w-4 h-4" />
                          Enregistrer la Compo Officielle
                        </button>
                      </div>
                    ) : (
                      /* TAB CONTENT: BILAN & STATS DU MATCH (COACH INPUTS) */
                      <div className="space-y-4">
                        <div className="border-b border-slate-100 pb-2">
                          <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Feuille de stats individuelle</h5>
                          <p className="text-[10px] text-slate-400 font-medium">Saisissez les statistiques de match pour motiver les joueurs et générer les classements.</p>
                        </div>

                        {convocations.length === 0 ? (
                          <div className="py-8 text-center text-xs text-slate-400">
                            Convoquez d'abord des joueurs pour saisir leurs statistiques de match.
                          </div>
                        ) : (
                          <form onSubmit={handleSaveMatchReport} className="space-y-4">
                            {successMsg && (
                              <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-800 text-xs font-bold rounded-xl flex items-center gap-2">
                                <CheckIcon className="w-4 h-4 text-emerald-600" />
                                <span>{successMsg}</span>
                              </div>
                            )}

                            <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
                              {convocations.map(conv => {
                                const member = members.find(m => m.id === conv.memberId);
                                if (!member) return null;

                                const playerForm = reportForm[conv.memberId] || {
                                  goals: 0,
                                  assists: 0,
                                  yellowCards: 0,
                                  redCards: 0,
                                  rating: 0,
                                  comment: ''
                                };

                                return (
                                  <div key={conv.id} className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-2">
                                    <div className="flex justify-between items-start">
                                      <div>
                                        <p className="font-extrabold text-slate-800 text-sm">{member.firstName} {member.lastName}</p>
                                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Statistiques du match</p>
                                      </div>
                                      
                                      <select
                                        value={playerForm.rating}
                                        onChange={(e) => handleUpdateReportField(conv.memberId, 'rating', Number(e.target.value))}
                                        className="px-2 py-1 border border-slate-200 rounded-lg text-xs font-bold bg-white text-slate-700 shadow-sm cursor-pointer"
                                      >
                                        <option value="0">Note --</option>
                                        {[1,2,3,4,5,6,7,8,9,10].map(n => (
                                          <option key={n} value={n}>{n}/10</option>
                                        ))}
                                      </select>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                      {/* Goals Counter */}
                                      <div className="flex items-center justify-between p-1.5 bg-white border border-slate-100 rounded-lg">
                                        <span className="font-medium text-slate-500 text-[10px] uppercase">⚽ Buts</span>
                                        <div className="flex items-center gap-1.5">
                                          <button
                                            type="button"
                                            onClick={() => handleUpdateReportField(conv.memberId, 'goals', Math.max(0, playerForm.goals - 1))}
                                            className="w-5 h-5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded flex items-center justify-center font-bold"
                                          >
                                            -
                                          </button>
                                          <span className="font-black w-3 text-center">{playerForm.goals}</span>
                                          <button
                                            type="button"
                                            onClick={() => handleUpdateReportField(conv.memberId, 'goals', playerForm.goals + 1)}
                                            className="w-5 h-5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded flex items-center justify-center font-bold"
                                          >
                                            +
                                          </button>
                                        </div>
                                      </div>

                                      {/* Assists Counter */}
                                      <div className="flex items-center justify-between p-1.5 bg-white border border-slate-100 rounded-lg">
                                        <span className="font-medium text-slate-500 text-[10px] uppercase">👟 Passes</span>
                                        <div className="flex items-center gap-1.5">
                                          <button
                                            type="button"
                                            onClick={() => handleUpdateReportField(conv.memberId, 'assists', Math.max(0, playerForm.assists - 1))}
                                            className="w-5 h-5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded flex items-center justify-center font-bold"
                                          >
                                            -
                                          </button>
                                          <span className="font-black w-3 text-center">{playerForm.assists}</span>
                                          <button
                                            type="button"
                                            onClick={() => handleUpdateReportField(conv.memberId, 'assists', playerForm.assists + 1)}
                                            className="w-5 h-5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded flex items-center justify-center font-bold"
                                          >
                                            +
                                          </button>
                                        </div>
                                      </div>

                                      {/* Yellow Card Counter */}
                                      <div className="flex items-center justify-between p-1.5 bg-white border border-slate-100 rounded-lg">
                                        <span className="font-medium text-slate-500 text-[10px] uppercase">🟨 Cartons J.</span>
                                        <div className="flex items-center gap-1.5">
                                          <button
                                            type="button"
                                            onClick={() => handleUpdateReportField(conv.memberId, 'yellowCards', Math.max(0, playerForm.yellowCards - 1))}
                                            className="w-5 h-5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded flex items-center justify-center font-bold"
                                          >
                                            -
                                          </button>
                                          <span className="font-black w-3 text-center">{playerForm.yellowCards}</span>
                                          <button
                                            type="button"
                                            onClick={() => handleUpdateReportField(conv.memberId, 'yellowCards', Math.min(2, playerForm.yellowCards + 1))}
                                            className="w-5 h-5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded flex items-center justify-center font-bold"
                                          >
                                            +
                                          </button>
                                        </div>
                                      </div>

                                      {/* Red Card Counter */}
                                      <div className="flex items-center justify-between p-1.5 bg-white border border-slate-100 rounded-lg">
                                        <span className="font-medium text-slate-500 text-[10px] uppercase">🟥 Cartons R.</span>
                                        <div className="flex items-center gap-1.5">
                                          <button
                                            type="button"
                                            onClick={() => handleUpdateReportField(conv.memberId, 'redCards', Math.max(0, playerForm.redCards - 1))}
                                            className="w-5 h-5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded flex items-center justify-center font-bold"
                                          >
                                            -
                                          </button>
                                          <span className="font-black w-3 text-center">{playerForm.redCards}</span>
                                          <button
                                            type="button"
                                            onClick={() => handleUpdateReportField(conv.memberId, 'redCards', Math.min(1, playerForm.redCards + 1))}
                                            className="w-5 h-5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded flex items-center justify-center font-bold"
                                          >
                                            +
                                          </button>
                                        </div>
                                      </div>
                                    </div>

                                    <input
                                      type="text"
                                      placeholder="Note de match (ex: Solide en défense, a relancé propre)"
                                      value={playerForm.comment}
                                      onChange={(e) => handleUpdateReportField(conv.memberId, 'comment', e.target.value)}
                                      className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-700 placeholder-slate-400"
                                    />
                                  </div>
                                );
                              })}
                            </div>

                            <button
                              type="submit"
                              disabled={isLoading}
                              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold py-2.5 rounded-xl text-sm transition shadow flex items-center justify-center gap-2 cursor-pointer"
                            >
                              {isLoading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
                              Enregistrer le Bilan & Stats
                            </button>
                          </form>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-12 space-y-3">
                    <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                      <CheckSquare className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900">Feuille de présence</h4>
                      <p className="text-xs text-slate-400 max-w-xs mx-auto">Sélectionnez un match ou entraînement pour gérer l'effectif, convoquer les joueurs et saisir les scores en direct.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        ) : (
          /* LEADERBOARD & TROPHIES VIEW */
          <motion.div
            key="leaderboards-view"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            <div>
              <h3 className="font-black text-slate-900 text-2xl tracking-tight flex items-center gap-2">
                <Trophy className="w-6 h-6 text-amber-500" />
                Tableau d'Honneur & Trophées du Club
              </h3>
              <p className="text-xs text-slate-400 mt-1">Performances, classements des buteurs, passeurs et taux d'assiduité des joueurs.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* Leaderboard Column 1: Buteurs */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                  <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                    <Trophy className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-slate-900 text-sm">Meilleurs Buteurs</h4>
                    <p className="text-[10px] text-slate-400 font-semibold">Classement interne du club</p>
                  </div>
                </div>

                {isLoadingAllStats ? (
                  <div className="py-8 flex justify-center">
                    <div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                ) : goalscorers.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-xs">Aucun but enregistré. Saisissez des bilans de match.</div>
                ) : (
                  <div className="space-y-3">
                    {goalscorers.slice(0, 10).map((player, index) => (
                      <div key={player.memberId} className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-50">
                        <div className="flex items-center gap-3">
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                            index === 0 ? 'bg-amber-100 text-amber-800' :
                            index === 1 ? 'bg-slate-200 text-slate-800' :
                            index === 2 ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'
                          }`}>
                            {index + 1}
                          </span>
                          <div>
                            <p className="font-extrabold text-slate-800 text-xs leading-none">{player.name}</p>
                            <p className="text-[9px] text-slate-400 mt-0.5">{player.email}</p>
                          </div>
                        </div>
                        <span className="flex items-center gap-1 font-black text-slate-950 text-sm bg-amber-50 border border-amber-100 px-2.5 py-1 rounded-lg">
                          ⚽ {player.goals}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Leaderboard Column 2: Passeurs */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                  <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-slate-900 text-sm">Meilleurs Passeurs</h4>
                    <p className="text-[10px] text-slate-400 font-semibold">Classement des passes décisives</p>
                  </div>
                </div>

                {isLoadingAllStats ? (
                  <div className="py-8 flex justify-center">
                    <div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                ) : playmakers.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-xs">Aucune passe décisive enregistrée.</div>
                ) : (
                  <div className="space-y-3">
                    {playmakers.slice(0, 10).map((player, index) => (
                      <div key={player.memberId} className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-50">
                        <div className="flex items-center gap-3">
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                            index === 0 ? 'bg-amber-100 text-amber-800' :
                            index === 1 ? 'bg-slate-200 text-slate-800' :
                            index === 2 ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'
                          }`}>
                            {index + 1}
                          </span>
                          <div>
                            <p className="font-extrabold text-slate-800 text-xs leading-none">{player.name}</p>
                            <p className="text-[9px] text-slate-400 mt-0.5">{player.email}</p>
                          </div>
                        </div>
                        <span className="flex items-center gap-1 font-black text-slate-950 text-sm bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-lg">
                          👟 {player.assists}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Leaderboard Column 3: Presence Rate */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                  <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                    <Percent className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-slate-900 text-sm">Taux d'Assiduité</h4>
                    <p className="text-[10px] text-slate-400 font-semibold">Taux de présence aux convocations</p>
                  </div>
                </div>

                {isLoadingAllConvocations ? (
                  <div className="py-8 flex justify-center">
                    <div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                ) : attendanceStats.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-xs">Aucune convocation à analyser.</div>
                ) : (
                  <div className="space-y-3">
                    {attendanceStats.slice(0, 10).map((stat, index) => (
                      <div key={stat.player.id} className="p-3 bg-slate-50 rounded-xl border border-slate-50 space-y-2">
                        <div className="flex justify-between items-center text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-slate-800">{stat.player.firstName} {stat.player.lastName}</span>
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            stat.rate >= 80 ? 'bg-emerald-100 text-emerald-800' :
                            stat.rate >= 50 ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {stat.rate}%
                          </span>
                        </div>
                        
                        {/* Progress Bar */}
                        <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all ${
                              stat.rate >= 80 ? 'bg-emerald-500' :
                              stat.rate >= 50 ? 'bg-amber-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${stat.rate}%` }}
                          />
                        </div>

                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider text-right">
                          {stat.totalPresent} / {stat.totalConvoked} Matchs
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
