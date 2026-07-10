import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { db, handleFirestoreError, OperationType, auth, sanitizeData } from '../firebase';
import { collection, doc, setDoc, deleteDoc, getDocs, writeBatch } from 'firebase/firestore';
import { Club, Event, Team, Member, Convocation } from '../types';
import { 
  Plus as PlusIcon, Calendar as CalendarIcon, Clock as ClockIcon, 
  MapPin as MapPinIcon, Check as CheckIcon, X as XIcon, Trash2 as TrashIcon, 
  Award as AwardIcon, CheckSquare, Sparkles, Smile, ChevronRight
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
  const [showEventForm, setShowEventForm] = useState(quickAction === 'create_event');
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [convocations, setConvocations] = useState<Convocation[]>([]);
  const [isLoadingConvocations, setIsLoadingConvocations] = useState(false);

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

  useEffect(() => {
    if (quickAction === 'create_event') {
      setShowEventForm(true);
      clearQuickAction();
    }
  }, [quickAction]);

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
    <div id="events-section" className="grid grid-cols-1 lg:grid-cols-3 gap-8">
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

      {/* Right Column: Attendance & convocations sheets */}
      <div className="space-y-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6 sticky top-6">
          {selectedEvent ? (
            <div className="space-y-6">
              <div>
                <h4 className="font-extrabold text-slate-900 text-lg leading-tight">Feuille de Convocations</h4>
                <p className="text-xs text-slate-400 mt-1 truncate">Pour : {selectedEvent.title}</p>
              </div>

              {/* Match Score Entry Form */}
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

              {/* Convocations list */}
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
                            {/* Actions to update attendance quickly */}
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
    </div>
  );
}
