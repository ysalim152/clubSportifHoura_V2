import React, { useState, useEffect } from 'react';
import { 
  MessageSquare, Plus, Trash2, Send, Star, Clock, Check, AlertCircle, 
  Sparkles, Filter, ShieldAlert, Reply, Calendar, Search, ThumbsUp, 
  HelpCircle, MessageSquareHeart, CheckCircle, RefreshCw
} from 'lucide-react';
import { collection, query, getDocs, setDoc, doc, deleteDoc, updateDoc, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Club, FeedbackItem } from '../types';
import { User } from 'firebase/auth';

interface FeedbackManagerProps {
  club: Club;
  currentUser: User;
  userProfile: any;
}

export default function FeedbackManager({ club, currentUser, userProfile }: FeedbackManagerProps) {
  const isAdmin = userProfile?.role === 'admin' || userProfile?.isSuperUser;
  
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Tab states
  const [activeTab, setActiveTab] = useState<'list' | 'submit'>('list');
  
  // Feedback Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<FeedbackItem['type']>('suggestion');
  const [category, setCategory] = useState<FeedbackItem['category']>('app');
  const [priority, setPriority] = useState<FeedbackItem['priority']>('medium');
  const [rating, setRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');

  // Admin Reply state
  const [replyText, setReplyText] = useState<{ [feedbackId: string]: string }>({});
  const [submittingReply, setSubmittingReply] = useState<string | null>(null);

  // Success/Error notifications
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    fetchFeedbacks();
  }, [club.id, currentUser.uid, isAdmin]);

  const fetchFeedbacks = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      let q;
      const colRef = collection(db, 'clubs', club.id, 'feedbacks');
      if (isAdmin) {
        // Admins see everything
        q = query(colRef);
      } else {
        // Members see only theirs
        q = query(colRef, where('userId', '==', currentUser.uid));
      }

      const snap = await getDocs(q).catch(err => {
        handleFirestoreError(err, OperationType.LIST, `clubs/${club.id}/feedbacks`);
        throw err;
      });

      const list: FeedbackItem[] = [];
      snap.forEach(docSnap => {
        list.push({ id: docSnap.id, ...(docSnap.data() as any) } as FeedbackItem);
      });

      // Sort by createdAt descending
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setFeedbacks(list);
    } catch (err: any) {
      console.error("Error loading feedbacks:", err);
      setErrorMsg("Impossible de charger les retours : " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      setErrorMsg("Veuillez remplir le titre et la description.");
      return;
    }

    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const feedbackId = 'fb_' + Date.now();
    const newFeedback: FeedbackItem = {
      id: feedbackId,
      clubId: club.id,
      userId: currentUser.uid,
      userName: currentUser.displayName || userProfile?.firstName + ' ' + userProfile?.lastName || 'Membre anonyme',
      userEmail: currentUser.email || userProfile?.email || '',
      userRole: userProfile?.role || 'player',
      title: title.trim(),
      description: description.trim(),
      type,
      category,
      priority: type === 'bug' ? priority : 'low',
      rating,
      status: 'new',
      createdAt: new Date().toISOString()
    };

    try {
      await setDoc(doc(db, 'clubs', club.id, 'feedbacks', feedbackId), newFeedback).catch(err => {
        handleFirestoreError(err, OperationType.WRITE, `clubs/${club.id}/feedbacks/${feedbackId}`);
        throw err;
      });

      setSuccessMsg("Votre retour a été soumis avec succès ! L'équipe administrative en a été notifiée.");
      
      // Reset form
      setTitle('');
      setDescription('');
      setType('suggestion');
      setCategory('app');
      setPriority('medium');
      setRating(5);
      
      // Refresh list & switch tab
      await fetchFeedbacks();
      setActiveTab('list');
      
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err: any) {
      console.error("Error submitting feedback:", err);
      setErrorMsg("Une erreur est survenue lors de la soumission : " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateStatus = async (feedbackId: string, newStatus: FeedbackItem['status']) => {
    try {
      const docRef = doc(db, 'clubs', club.id, 'feedbacks', feedbackId);
      await updateDoc(docRef, { status: newStatus }).catch(err => {
        handleFirestoreError(err, OperationType.WRITE, `clubs/${club.id}/feedbacks/${feedbackId}`);
        throw err;
      });
      
      setFeedbacks(prev => prev.map(f => f.id === feedbackId ? { ...f, status: newStatus } : f));
      setSuccessMsg(`Statut du retour mis à jour en "${getLabelStatus(newStatus)}".`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      console.error("Error updating status:", err);
      setErrorMsg("Erreur lors de la mise à jour du statut.");
    }
  };

  const handleAdminReply = async (feedbackId: string) => {
    const text = replyText[feedbackId];
    if (!text || !text.trim()) return;

    setSubmittingReply(feedbackId);
    try {
      const docRef = doc(db, 'clubs', club.id, 'feedbacks', feedbackId);
      const updateData = {
        adminResponse: text.trim(),
        adminRespondedAt: new Date().toISOString(),
        adminResponderEmail: currentUser.email || 'Admin',
        status: 'resolved' as const // Automatically mark resolved when replied
      };

      await updateDoc(docRef, updateData).catch(err => {
        handleFirestoreError(err, OperationType.WRITE, `clubs/${club.id}/feedbacks/${feedbackId}`);
        throw err;
      });

      setFeedbacks(prev => prev.map(f => f.id === feedbackId ? { 
        ...f, 
        adminResponse: text.trim(), 
        adminRespondedAt: updateData.adminRespondedAt,
        adminResponderEmail: updateData.adminResponderEmail,
        status: 'resolved'
      } : f));

      setReplyText(prev => ({ ...prev, [feedbackId]: '' }));
      setSuccessMsg("Réponse enregistrée et transmise au membre.");
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      console.error("Error replying to feedback:", err);
      setErrorMsg("Erreur de sauvegarde de la réponse administrative.");
    } finally {
      setSubmittingReply(null);
    }
  };

  const handleDeleteFeedback = async (feedbackId: string) => {
    if (!window.confirm("Êtes-vous sûr de vouloir supprimer définitivement ce retour ?")) return;

    try {
      const docRef = doc(db, 'clubs', club.id, 'feedbacks', feedbackId);
      await deleteDoc(docRef).catch(err => {
        handleFirestoreError(err, OperationType.DELETE, `clubs/${club.id}/feedbacks/${feedbackId}`);
        throw err;
      });

      setFeedbacks(prev => prev.filter(f => f.id !== feedbackId));
      setSuccessMsg("Le retour a été supprimé.");
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      console.error("Error deleting feedback:", err);
      setErrorMsg("Impossible de supprimer le retour.");
    }
  };

  // Label Formatter Helpers
  const getLabelType = (t: FeedbackItem['type']) => {
    switch (t) {
      case 'suggestion': return 'Suggestion';
      case 'bug': return 'Signaler un Bug';
      case 'question': return 'Question';
      case 'compliment': return 'Compliment';
      default: return t;
    }
  };

  const getLabelCategory = (c: FeedbackItem['category']) => {
    switch (c) {
      case 'app': return 'Application / Portabilité';
      case 'club_life': return 'Vie de Club / Ambiance';
      case 'events': return 'Entraînements & Matchs';
      case 'equipment': return 'Matériel & Équipements';
      case 'other': return 'Autre sujet';
      default: return c;
    }
  };

  const getLabelStatus = (s: FeedbackItem['status']) => {
    switch (s) {
      case 'new': return 'Nouveau';
      case 'in_progress': return 'En cours de traitement';
      case 'resolved': return 'Résolu / Répondu';
      case 'closed': return 'Classé sans suite';
      default: return s;
    }
  };

  // Render Styling Helpers
  const getTypeBadgeStyles = (t: FeedbackItem['type']) => {
    switch (t) {
      case 'bug': return 'bg-rose-50 text-rose-700 border border-rose-200';
      case 'suggestion': return 'bg-indigo-50 text-indigo-700 border border-indigo-200';
      case 'question': return 'bg-amber-50 text-amber-700 border border-amber-200';
      case 'compliment': return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
      default: return 'bg-slate-50 text-slate-700 border border-slate-200';
    }
  };

  const getStatusBadgeStyles = (s: FeedbackItem['status']) => {
    switch (s) {
      case 'new': return 'bg-sky-50 text-sky-700 border border-sky-100';
      case 'in_progress': return 'bg-amber-50 text-amber-700 border border-amber-100';
      case 'resolved': return 'bg-emerald-50 text-emerald-700 border border-emerald-100';
      case 'closed': return 'bg-slate-100 text-slate-600 border border-slate-200';
      default: return 'bg-slate-50 text-slate-500';
    }
  };

  const getPriorityBadgeStyles = (p: FeedbackItem['priority']) => {
    switch (p) {
      case 'high': return 'bg-rose-100 text-rose-800 font-bold px-2 py-0.5 rounded text-[10px]';
      case 'medium': return 'bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded text-[10px]';
      case 'low': return 'bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[10px]';
      default: return '';
    }
  };

  // Calculations for DashStats
  const totalCount = feedbacks.length;
  const avgRating = totalCount > 0 
    ? (feedbacks.reduce((sum, f) => sum + f.rating, 0) / totalCount).toFixed(1) 
    : '5.0';
  const newCount = feedbacks.filter(f => f.status === 'new').length;
  const bugCount = feedbacks.filter(f => f.type === 'bug').length;
  const resolvedCount = feedbacks.filter(f => f.status === 'resolved').length;

  // Filtering Logic
  const filteredFeedbacks = feedbacks.filter(f => {
    const matchesSearch = f.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          f.description.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          f.userName.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesType = filterType === 'all' || f.type === filterType;
    const matchesStatus = filterStatus === 'all' || f.status === filterStatus;
    const matchesCategory = filterCategory === 'all' || f.category === filterCategory;

    return matchesSearch && matchesType && matchesStatus && matchesCategory;
  });

  return (
    <div className="space-y-6">
      {/* Title section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-emerald-600" />
            Module Feedback & Suggestions
          </h2>
          <p className="text-sm text-slate-500">
            {isAdmin 
              ? "Consultez, filtrez et répondez aux suggestions ou rapports de bug des adhérents de votre club."
              : "Partagez vos idées d'amélioration, signalez des bugs ou posez des questions à l'administration."
            }
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab(activeTab === 'list' ? 'submit' : 'list')}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2.5 px-4 rounded-xl transition cursor-pointer shadow-md shadow-emerald-600/10"
          >
            {activeTab === 'list' ? (
              <>
                <Plus className="w-4 h-4" />
                <span>Soumettre un Feedback</span>
              </>
            ) : (
              <>
                <MessageSquare className="w-4 h-4" />
                <span>Voir la Liste ({totalCount})</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Alert Notifications */}
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

      {/* STATS OVERVIEW CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Retours</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-black text-slate-900">{totalCount}</span>
            <span className="text-xs text-slate-400 font-medium">émis</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Satisfaction Moyenne</span>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-2xl font-black text-slate-900">{avgRating}</span>
            <div className="flex text-amber-400">
              <Star className="w-4 h-4 fill-amber-400" />
            </div>
            <span className="text-xs text-slate-400">/ 5</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">En attente</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-black text-amber-600">{newCount}</span>
            <span className="text-xs text-slate-400 font-medium">nouveaux</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm col-span-1">
          <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Résolus</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-black text-emerald-600">{resolvedCount}</span>
            <span className="text-xs text-emerald-600 font-semibold">{totalCount > 0 ? Math.round((resolvedCount/totalCount)*100) : 100}%</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm col-span-2 lg:col-span-1">
          <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Bugs Signalés</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-black text-rose-600">{bugCount}</span>
            <span className="text-xs text-rose-500 font-medium">alertes</span>
          </div>
        </div>
      </div>

      {/* MAIN VIEW CHANGER */}
      {activeTab === 'submit' ? (
        /* SUBMISSION FORM */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden max-w-2xl mx-auto">
          <div className="p-6 border-b border-slate-100 flex items-center gap-3 bg-slate-50/50">
            <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Nouveau Retour d'Expérience</h3>
              <p className="text-[10px] text-slate-400">Aidez-nous à améliorer le club en partageant vos retours.</p>
            </div>
          </div>

          <form onSubmit={handleSubmitFeedback} className="p-6 space-y-4">
            
            {/* Row 1: Type & Category */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Type de retour</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as any)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-emerald-500"
                >
                  <option value="suggestion">💡 Suggestion d'amélioration</option>
                  <option value="bug">🐛 Signalement de Bug / Problème technique</option>
                  <option value="question">❓ Question / Demande d'information</option>
                  <option value="compliment">❤️ Compliment / Encouragement</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Catégorie concernée</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as any)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-emerald-500"
                >
                  <option value="app">📱 Application mobile & Site internet</option>
                  <option value="club_life">🏠 Vie associative / Club House / Convivialité</option>
                  <option value="events">🏆 Événements, Matchs & Entraînements</option>
                  <option value="equipment">⚽ Matériel, Ballons, Maillots & Équipements</option>
                  <option value="other">💬 Autre sujet</option>
                </select>
              </div>
            </div>

            {/* Row 2: Bug Priority (conditional) */}
            {type === 'bug' && (
              <div className="p-4 bg-rose-50/50 rounded-xl border border-rose-100 space-y-1.5 animate-fadeIn">
                <label className="text-xs font-bold text-rose-800 uppercase tracking-wider block">Gravité du Bug</label>
                <div className="flex gap-3">
                  {(['low', 'medium', 'high'] as const).map(p => (
                    <label key={p} className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                      <input
                        type="radio"
                        name="priority"
                        checked={priority === p}
                        onChange={() => setPriority(p)}
                        className="text-rose-600 focus:ring-rose-500"
                      />
                      <span className="capitalize">
                        {p === 'low' ? 'Faible (gêne mineure)' : p === 'medium' ? 'Moyenne (ralentit)' : 'Bloquant / Urgent'}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Rating Stars Selection */}
            <div className="space-y-1.5 bg-slate-50 p-4 rounded-xl border border-slate-100">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block">
                Note d'évaluation globale (Satisfaction)
              </label>
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4, 5].map((star) => {
                  const isActive = hoverRating !== null ? star <= hoverRating : star <= rating;
                  return (
                    <button
                      type="button"
                      key={star}
                      onClick={() => setRating(star)}
                      onMouseEnter={() => setHoverRating(star)}
                      onMouseLeave={() => setHoverRating(null)}
                      className="text-2xl focus:outline-none transition transform hover:scale-110 cursor-pointer"
                    >
                      <Star 
                        className={`w-7 h-7 ${
                          isActive 
                            ? 'text-amber-400 fill-amber-400' 
                            : 'text-slate-300'
                        }`} 
                      />
                    </button>
                  );
                })}
                <span className="ml-3 text-xs text-slate-500 font-semibold font-mono">
                  {rating === 1 ? 'Très insatisfait' : 
                   rating === 2 ? 'Plutôt déçu' : 
                   rating === 3 ? 'Moyen' : 
                   rating === 4 ? 'Satisfait' : 
                   'Excellent !'}
                </span>
              </div>
            </div>

            {/* Title & Description */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Sujet / Titre résumé</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Problème d'affichage du calendrier"
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-emerald-500 font-semibold"
                maxLength={80}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Description détaillée</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Décrivez votre idée ou expliquez pas-à-pas comment reproduire le bug rencontré..."
                rows={5}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-6 rounded-xl transition text-sm cursor-pointer disabled:opacity-50"
              >
                {saving ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                <span>Soumettre mon feedback</span>
              </button>
            </div>

          </form>
        </div>
      ) : (
        /* FEEDBACKS LIST VIEW */
        <div className="space-y-6">
          
          {/* Filters Bar */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-3">
              {/* Search */}
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Rechercher par titre, contenu ou auteur..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Quick Selectors */}
              <div className="flex flex-wrap items-center gap-2">
                
                {/* Type Filter */}
                <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-200">
                  <Filter className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Type:</span>
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    className="bg-transparent border-none text-xs font-bold text-slate-700 focus:outline-none cursor-pointer"
                  >
                    <option value="all">Tous</option>
                    <option value="suggestion">Suggestions</option>
                    <option value="bug">Bugs</option>
                    <option value="question">Questions</option>
                    <option value="compliment">Compliments</option>
                  </select>
                </div>

                {/* Status Filter */}
                <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-200">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Statut:</span>
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="bg-transparent border-none text-xs font-bold text-slate-700 focus:outline-none cursor-pointer"
                  >
                    <option value="all">Tous</option>
                    <option value="new">Nouveaux</option>
                    <option value="in_progress">En cours</option>
                    <option value="resolved">Résolus / Répondus</option>
                    <option value="closed">Classés</option>
                  </select>
                </div>

                {/* Category Filter */}
                <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-200">
                  <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Catégorie:</span>
                  <select
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
                    className="bg-transparent border-none text-xs font-bold text-slate-700 focus:outline-none cursor-pointer"
                  >
                    <option value="all">Toutes</option>
                    <option value="app">Application</option>
                    <option value="club_life">Vie de Club</option>
                    <option value="events">Événements</option>
                    <option value="equipment">Équipements</option>
                    <option value="other">Autre</option>
                  </select>
                </div>

                {/* Manual Reload Button */}
                <button
                  onClick={fetchFeedbacks}
                  className="p-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition cursor-pointer text-slate-500"
                  title="Actualiser la liste"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>

              </div>
            </div>
          </div>

          {/* Feedbacks Grid */}
          {loading ? (
            <div className="h-64 flex flex-col items-center justify-center bg-white rounded-2xl border border-slate-200 shadow-sm">
              <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin" />
              <span className="text-xs font-semibold text-slate-400 tracking-widest mt-3 uppercase">Chargement des retours...</span>
            </div>
          ) : filteredFeedbacks.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center bg-white rounded-2xl border border-slate-200 shadow-sm p-6 text-center">
              <div className="w-12 h-12 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center mb-3">
                <MessageSquare className="w-6 h-6" />
              </div>
              <p className="text-slate-800 font-bold">Aucun retour d'expérience trouvé</p>
              <p className="text-xs text-slate-400 mt-1 max-w-sm">
                {searchQuery || filterType !== 'all' || filterStatus !== 'all' || filterCategory !== 'all'
                  ? "Modifiez vos filtres de recherche pour voir d'autres résultats."
                  : "Soyez le premier à soumettre une suggestion ou un retour pour ce club !"
                }
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6">
              {filteredFeedbacks.map((item) => {
                const hasReplied = !!item.adminResponse;
                
                return (
                  <div 
                    key={item.id} 
                    className={`bg-white rounded-2xl border transition shadow-sm overflow-hidden ${
                      item.status === 'new' 
                        ? 'border-l-4 border-l-sky-500 border-slate-200' 
                        : item.status === 'in_progress'
                        ? 'border-l-4 border-l-amber-500 border-slate-200'
                        : 'border-slate-200'
                    }`}
                  >
                    {/* Header bar of feedback card */}
                    <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/30">
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Type Badge */}
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${getTypeBadgeStyles(item.type)}`}>
                          {getLabelType(item.type)}
                        </span>

                        {/* Status Badge */}
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${getStatusBadgeStyles(item.status)}`}>
                          {getLabelStatus(item.status)}
                        </span>

                        {/* Category */}
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-semibold">
                          {getLabelCategory(item.category)}
                        </span>

                        {/* Priority for bugs */}
                        {item.type === 'bug' && item.priority && (
                          <span className={getPriorityBadgeStyles(item.priority)}>
                            Urgence: {item.priority}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{new Date(item.createdAt).toLocaleDateString('fr-FR')} {new Date(item.createdAt).toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'})}</span>
                      </div>
                    </div>

                    {/* Main content */}
                    <div className="p-5 space-y-4">
                      
                      {/* Submitter & Rating Row */}
                      <div className="flex justify-between items-start gap-4">
                        <div>
                          <h4 className="text-base font-black text-slate-900 tracking-tight leading-snug">{item.title}</h4>
                          <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                            <span>Soumis par</span>
                            <span className="font-bold text-slate-600">{item.userName}</span>
                            <span className="px-1 py-0.25 bg-slate-100 text-[9px] uppercase font-bold text-slate-500 rounded">
                              {item.userRole === 'admin' ? 'Admin' : item.userRole === 'coach' ? 'Coach' : 'Joueur'}
                            </span>
                            {isAdmin && <span className="text-slate-300 font-light">| {item.userEmail}</span>}
                          </p>
                        </div>

                        {/* Stars Indicator */}
                        <div className="flex items-center gap-0.5 bg-slate-50 px-2 py-1 rounded-lg border border-slate-100 shrink-0">
                          <span className="text-xs font-mono font-bold text-slate-700 mr-1">{item.rating}</span>
                          <div className="flex text-amber-400">
                            {[1, 2, 3, 4, 5].map((s) => (
                              <Star 
                                key={s} 
                                className={`w-3.5 h-3.5 ${s <= item.rating ? 'fill-amber-400' : 'text-slate-200'}`} 
                              />
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Description */}
                      <p className="text-sm text-slate-600 whitespace-pre-line leading-relaxed bg-slate-50/50 p-4 rounded-xl border border-slate-100/50">
                        {item.description}
                      </p>

                      {/* Admin Response section */}
                      {hasReplied ? (
                        <div className="p-4 bg-emerald-50/40 rounded-xl border border-emerald-100 space-y-2">
                          <div className="flex items-center justify-between text-xs font-bold text-emerald-800">
                            <div className="flex items-center gap-1.5">
                              <MessageSquareHeart className="w-4 h-4 text-emerald-600" />
                              <span>Réponse de l'administration du club</span>
                            </div>
                            <span className="text-[10px] font-mono font-medium text-slate-400">
                              {new Date(item.adminRespondedAt!).toLocaleDateString('fr-FR')}
                            </span>
                          </div>
                          <p className="text-xs text-slate-700 italic bg-white p-3 rounded-lg border border-emerald-50 leading-relaxed">
                            "{item.adminResponse}"
                          </p>
                        </div>
                      ) : (
                        !isAdmin && (
                          <div className="flex items-center gap-2 text-slate-400 text-xs italic">
                            <Clock className="w-4 h-4" />
                            <span>En attente de réponse ou de prise en charge par les administrateurs du club.</span>
                          </div>
                        )
                      )}

                      {/* Admin Actions Bar */}
                      {isAdmin && (
                        <div className="pt-4 border-t border-slate-100 space-y-4">
                          
                          {/* Change Status & Quick Operations */}
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-2 text-xs">
                              <span className="font-bold text-slate-500">Mettre à jour le statut :</span>
                              <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                                <button
                                  onClick={() => handleUpdateStatus(item.id, 'new')}
                                  className={`px-2 py-1 rounded text-[10px] font-bold cursor-pointer transition ${
                                    item.status === 'new' ? 'bg-white text-sky-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                                  }`}
                                >
                                  Nouveau
                                </button>
                                <button
                                  onClick={() => handleUpdateStatus(item.id, 'in_progress')}
                                  className={`px-2 py-1 rounded text-[10px] font-bold cursor-pointer transition ${
                                    item.status === 'in_progress' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                                  }`}
                                >
                                  En Cours
                                </button>
                                <button
                                  onClick={() => handleUpdateStatus(item.id, 'resolved')}
                                  className={`px-2 py-1 rounded text-[10px] font-bold cursor-pointer transition ${
                                    item.status === 'resolved' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                                  }`}
                                >
                                  Résolu
                                </button>
                                <button
                                  onClick={() => handleUpdateStatus(item.id, 'closed')}
                                  className={`px-2 py-1 rounded text-[10px] font-bold cursor-pointer transition ${
                                    item.status === 'closed' ? 'bg-white text-slate-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                                  }`}
                                >
                                  Classé
                                </button>
                              </div>
                            </div>

                            <button
                              onClick={() => handleDeleteFeedback(item.id)}
                              className="flex items-center gap-1.5 text-xs text-rose-600 hover:text-rose-800 hover:bg-rose-50 px-3 py-1.5 rounded-lg transition cursor-pointer font-semibold"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Supprimer</span>
                            </button>
                          </div>

                          {/* Write Response Form */}
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={replyText[item.id] || ''}
                              onChange={(e) => setReplyText(prev => ({ ...prev, [item.id]: e.target.value }))}
                              placeholder={hasReplied ? "Modifier la réponse administrative..." : "Rédiger une réponse officielle pour cet adhérent..."}
                              className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-emerald-500"
                            />
                            <button
                              onClick={() => handleAdminReply(item.id)}
                              disabled={submittingReply === item.id || !(replyText[item.id] || '').trim()}
                              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white font-bold py-1.5 px-4 rounded-xl text-xs transition cursor-pointer"
                            >
                              {submittingReply === item.id ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Reply className="w-3.5 h-3.5" />
                              )}
                              <span>{hasReplied ? "Mettre à jour" : "Répondre"}</span>
                            </button>
                          </div>

                        </div>
                      )}

                    </div>
                  </div>
                );
              })}
            </div>
          )}

        </div>
      )}
    </div>
  );
}
