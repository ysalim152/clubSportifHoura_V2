import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { db, handleFirestoreError, OperationType, auth, sanitizeData } from '../firebase';
import { collection, doc, setDoc, deleteDoc, getDocs, writeBatch } from 'firebase/firestore';
import { Club, Event, Team, Member, Convocation, PlayerMatchStat } from '../types';
import { 
  Plus as PlusIcon, Calendar as CalendarIcon, Clock as ClockIcon, 
  MapPin as MapPinIcon, Check as CheckIcon, X as XIcon, Trash2 as TrashIcon, 
  Award as AwardIcon, CheckSquare, Sparkles, Smile, ChevronRight,
  Trophy, Star, Percent, Flame, Activity
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

export default function EventManager({ 
  club, events, teams, members, onRefresh, quickAction, clearQuickAction 
}: EventManagerProps) {
  const [viewMode, setViewMode] = useState<'calendar' | 'leaderboards'>('calendar');
  const [detailsTab, setDetailsTab] = useState<'convocations' | 'bilan'>('convocations');
  const [showEventForm, setShowEventForm] = useState(quickAction === 'create_event');
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [convocations, setConvocations] = useState<Convocation[]>([]);
  const [isLoadingConvocations, setIsLoadingConvocations] = useState(false);

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
            {/* Calendar List Column */}
            <div className="lg:col-span-2 space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-bold text-slate-900 text-xl">Calendrier & Matchs</h3>
                  <p className="text-xs text-slate-400">Planification des activités du club.</p>
                </div>
                <button
                  onClick={() => setShowEventForm(true)}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm px-4 py-2.5 rounded-xl shadow flex items-center gap-2 transition cursor-pointer"
                >
                  <PlusIcon className="w-4 h-4" />
                  Créer un événement
                </button>
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
                          className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-600 uppercase">Équipe concernée</label>
                        <select
                          value={teamId}
                          onChange={(e) => setTeamId(e.target.value)}
                          required
                          className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm bg-white"
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
                          className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm bg-white"
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
                          className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-600 uppercase">Fin</label>
                        <input
                          type="datetime-local"
                          required
                          value={end}
                          onChange={(e) => setEnd(e.target.value)}
                          className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm"
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
                          className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm"
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
                            className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm"
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

              {/* Calendar Lists */}
              <div className="space-y-4">
                {events.length === 0 ? (
                  <div className="py-12 bg-white border border-slate-200 rounded-2xl text-center text-slate-400 text-sm">
                    Aucun événement dans le calendrier de votre club.
                  </div>
                ) : (
                  events.map(evt => {
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
                      <h4 className="font-extrabold text-slate-900 text-lg leading-tight">Feuille de Convocations</h4>
                      <p className="text-xs text-slate-400 mt-1 truncate">Pour : {selectedEvent.title}</p>
                    </div>

                    {/* Sub Tab Selector if event is a match */}
                    {selectedEvent.type === 'match' && (
                      <div className="flex bg-slate-100 p-1 rounded-xl mb-4">
                        <button
                          type="button"
                          onClick={() => setDetailsTab('convocations')}
                          className={`flex-1 py-2 text-xs font-bold rounded-lg transition cursor-pointer ${
                            detailsTab === 'convocations' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          👥 Présence ({convocations.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setDetailsTab('bilan')}
                          className={`flex-1 py-2 text-xs font-bold rounded-lg transition cursor-pointer ${
                            detailsTab === 'bilan' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          📝 Bilan du Match
                        </button>
                      </div>
                    )}

                    {/* TAB CONTENT: CONVOCATIONS & ATTENDANCE */}
                    {(selectedEvent.type !== 'match' || detailsTab === 'convocations') ? (
                      <div className="space-y-6">
                        {/* Match Score Entry Form (only for match type) */}
                        {selectedEvent.type === 'match' && (
                          <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-3">
                            <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                              <AwardIcon className="w-4 h-4 text-emerald-600" />
                              Saisir le Score du Match
                            </h5>
                            <form onSubmit={handleSaveScore} className="flex items-center gap-2">
                              <input
                                type="number"
                                placeholder="Home"
                                value={scoreHome}
                                onChange={(e) => setScoreHome(e.target.value)}
                                className="w-16 px-2 py-1.5 border border-slate-200 rounded-lg text-center text-sm font-bold bg-white"
                              />
                              <span className="font-extrabold text-slate-400">-</span>
                              <input
                                type="number"
                                placeholder="Away"
                                value={scoreAway}
                                onChange={(e) => setScoreAway(e.target.value)}
                                className="w-16 px-2 py-1.5 border border-slate-200 rounded-lg text-center text-sm font-bold bg-white"
                              />
                              <button
                                type="submit"
                                disabled={isLoading}
                                className="flex-1 bg-slate-900 text-white font-semibold py-1.5 px-3 rounded-lg text-xs hover:bg-slate-800 transition cursor-pointer"
                              >
                                Enregistrer
                              </button>
                            </form>
                          </div>
                        )}

                        <div className="space-y-4">
                          <div className="flex justify-between items-center text-xs text-slate-500 font-bold border-b border-slate-100 pb-2">
                            <span>Joueurs Convoqués</span>
                            <span>Statut de présence</span>
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
                                    className="flex justify-between items-center p-2.5 border border-slate-50 bg-slate-50/50 rounded-xl text-sm"
                                  >
                                    <div>
                                      <p className="font-bold text-slate-800 leading-tight">{member.firstName} {member.lastName}</p>
                                      <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Joueur du club</p>
                                    </div>

                                    <div className="flex items-center gap-1">
                                      <button
                                        onClick={() => handleUpdateStatus(conv, 'confirmed')}
                                        className={`p-1.5 rounded-lg border transition cursor-pointer ${
                                          conv.status === 'confirmed' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-white text-slate-400 hover:bg-slate-50 border-slate-200'
                                        }`}
                                        title="Présent / Confirmé"
                                      >
                                        <CheckIcon className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        onClick={() => handleUpdateStatus(conv, 'declined')}
                                        className={`p-1.5 rounded-lg border transition cursor-pointer ${
                                          conv.status === 'declined' ? 'bg-red-100 text-red-800 border-red-200' : 'bg-white text-slate-400 hover:bg-slate-50 border-slate-200'
                                        }`}
                                        title="Décliné / Absent"
                                      >
                                        <XIcon className="w-3.5 h-3.5" />
                                      </button>
                                      
                                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg ml-1 ${
                                        conv.status === 'confirmed' ? 'bg-emerald-50 text-emerald-700' :
                                        conv.status === 'declined' ? 'bg-red-50 text-red-700' :
                                        'bg-amber-50 text-amber-700'
                                      }`}>
                                        {conv.status === 'confirmed' ? 'Oui' : conv.status === 'declined' ? 'Non' : 'Attente'}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
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
