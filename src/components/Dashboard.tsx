import React from 'react';
import { motion } from 'motion/react';
import { 
  Users, Calendar, CreditCard, MessageSquare, Plus, Activity, 
  TrendingUp, AlertCircle, CheckCircle2, Trophy 
} from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { Club, Member, Team, Event, Payment } from '../types';

interface DashboardProps {
  club: Club;
  members: Member[];
  teams: Team[];
  events: Event[];
  payments: Payment[];
  onNavigate: (tab: string) => void;
  onOpenQuickAction: (action: string) => void;
}

export default function Dashboard({ 
  club, members, teams, events, payments, onNavigate, onOpenQuickAction 
}: DashboardProps) {
  
  // Computations
  const totalMembers = members.length;
  const playersCount = members.filter(m => m.role === 'player').length;
  const coachesCount = members.filter(m => m.role === 'coach').length;
  const teamsCount = teams.length;
  const nextEvents = events.filter(e => new Date(e.start) >= new Date()).slice(0, 3);
  
  // Financial computations
  const totalCollected = payments
    .filter(p => p.status === 'paid')
    .reduce((sum, p) => sum + p.amount, 0);

  const totalPending = payments
    .filter(p => p.status === 'pending')
    .reduce((sum, p) => sum + p.amount, 0);

  // Data for PieChart: Payments
  const financeData = [
    { name: 'Payé', value: totalCollected, color: '#10b981' }, // emerald-500
    { name: 'En attente', value: totalPending, color: '#f59e0b' } // amber-500
  ];

  // Data for BarChart: Members by Role
  const roleData = [
    { name: 'Joueurs', count: playersCount },
    { name: 'Coachs', count: coachesCount },
    { name: 'Admins', count: members.filter(m => m.role === 'admin').length }
  ];

  return (
    <div id="dashboard-tab" className="space-y-8">
      {/* Welcome Banner */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 md:p-8 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 opacity-10 bg-radial-gradient flex items-center justify-center">
          <Activity className="w-64 h-64 text-emerald-500" />
        </div>
        <div className="max-w-xl space-y-4">
          <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold px-3 py-1 rounded-full">
            Espace Club Actif
          </span>
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">
            Tableau de Bord — {club.name}
          </h2>
          <p className="text-slate-300 text-sm leading-relaxed">
            Bienvenue sur votre console de pilotage d'association sportive. Gérez vos équipes, vos licenciés, planifiez vos prochains matchs et contrôlez vos comptes en un clin d'œil.
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { 
            title: "Membres Actifs", 
            value: totalMembers, 
            sub: `${playersCount} joueurs · ${coachesCount} coachs`,
            icon: Users,
            color: "text-blue-600 bg-blue-50 border-blue-100" 
          },
          { 
            title: "Équipes Engagées", 
            value: teamsCount, 
            sub: `${teamsCount} catégories inscrites`,
            icon: Trophy,
            color: "text-emerald-600 bg-emerald-50 border-emerald-100" 
          },
          { 
            title: "Fonds Encaissés", 
            value: `${totalCollected} €`, 
            sub: `${totalPending} € en attente`,
            icon: CreditCard,
            color: "text-emerald-600 bg-emerald-50 border-emerald-100" 
          },
          { 
            title: "Événements à Venir", 
            value: events.filter(e => new Date(e.start) >= new Date()).length, 
            sub: "Matchs et entraînements",
            icon: Calendar,
            color: "text-purple-600 bg-purple-50 border-purple-100" 
          }
        ].map((card, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: idx * 0.05 }}
            className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm flex items-center justify-between"
          >
            <div className="space-y-1">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{card.title}</p>
              <h3 className="text-3xl font-extrabold text-slate-900">{card.value}</h3>
              <p className="text-xs text-slate-400 font-medium">{card.sub}</p>
            </div>
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center border ${card.color}`}>
              <card.icon className="w-6 h-6" />
            </div>
          </motion.div>
        ))}
      </div>

      {/* Main Grid: Charts & Next Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Quick Actions */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div className="space-y-4">
            <div>
              <h3 className="font-bold text-slate-900 text-lg">Actions Rapides</h3>
              <p className="text-xs text-slate-400">Raccourcis d'administration instantanés.</p>
            </div>
            <div className="grid grid-cols-1 gap-3">
              {[
                { label: "Ajouter un membre", action: "add_member", icon: Plus, color: "hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200" },
                { label: "Créer un événement", action: "create_event", icon: Plus, color: "hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-200" },
                { label: "Ajouter une équipe", action: "add_team", icon: Plus, color: "hover:bg-purple-50 hover:text-purple-600 hover:border-purple-200" },
                { label: "Enregistrer un règlement", action: "add_payment", icon: Plus, color: "hover:bg-amber-50 hover:text-amber-600 hover:border-amber-200" }
              ].map((btn, idx) => (
                <button
                  key={idx}
                  onClick={() => onOpenQuickAction(btn.action)}
                  className={`flex items-center gap-3 w-full p-3.5 border border-slate-200 rounded-xl text-left text-sm font-semibold text-slate-700 transition cursor-pointer ${btn.color}`}
                >
                  <div className="w-7 h-7 bg-slate-50 rounded-lg flex items-center justify-center border border-slate-100 shrink-0">
                    <btn.icon className="w-4 h-4 text-slate-500" />
                  </div>
                  <span>{btn.label}</span>
                </button>
              ))}
            </div>
          </div>
          
          <div className="border-t border-slate-100 pt-4 mt-6">
            <button
              onClick={() => onNavigate('messagerie')}
              className="w-full flex items-center justify-between text-xs font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100/80 p-3 rounded-xl transition cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                <span>Consulter la messagerie club</span>
              </div>
              <span>&rarr;</span>
            </button>
          </div>
        </div>

        {/* Financial Analytics */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="font-bold text-slate-900 text-lg">Finances du Club</h3>
                <p className="text-xs text-slate-400">Répartition des cotisations annuelles.</p>
              </div>
              <TrendingUp className="w-5 h-5 text-emerald-600" />
            </div>
            
            <div className="h-48 w-full flex items-center justify-center">
              {totalCollected === 0 && totalPending === 0 ? (
                <p className="text-xs text-slate-400">Aucun paiement enregistré pour l'instant.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={financeData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {financeData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => `${value} €`} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-4 mt-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-emerald-500 rounded-full"></div>
              <div>
                <p className="text-xs text-slate-400 font-medium">Cotisations Payées</p>
                <p className="font-extrabold text-sm text-slate-900">{totalCollected} €</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-amber-500 rounded-full"></div>
              <div>
                <p className="text-xs text-slate-400 font-medium">En attente</p>
                <p className="font-extrabold text-sm text-slate-900">{totalPending} €</p>
              </div>
            </div>
          </div>
        </div>

        {/* Member distribution */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-slate-900 text-lg mb-4">Répartition des Effectifs</h3>
            <div className="h-48 w-full flex items-center justify-center">
              {totalMembers === 0 ? (
                <p className="text-xs text-slate-400">Aucun effectif renseigné pour l'instant.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={roleData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <XAxis dataKey="name" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip cursor={{ fill: 'rgba(241, 245, 249, 0.5)' }} />
                    <Bar dataKey="count" fill="#3b82f6" radius={[6, 6, 0, 0]} barSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4 mt-4">
            <button
              onClick={() => onNavigate('membres')}
              className="w-full text-center text-xs font-bold text-slate-600 hover:text-slate-900 transition cursor-pointer"
            >
              Gérer la liste complète des membres &rarr;
            </button>
          </div>
        </div>
      </div>

      {/* Calendar list overview */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="font-bold text-slate-900 text-lg">Prochains Rendez-vous</h3>
            <p className="text-xs text-slate-400">Matchs et entraînements programmés.</p>
          </div>
          <button
            onClick={() => onNavigate('calendrier')}
            className="text-xs font-bold text-emerald-600 hover:text-emerald-700 transition cursor-pointer"
          >
            Voir tout le calendrier &rarr;
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {nextEvents.length === 0 ? (
            <div className="col-span-3 py-8 text-center text-slate-400 text-xs">
              Aucun événement programmé dans les prochains jours.
            </div>
          ) : (
            nextEvents.map(evt => {
              const team = teams.find(t => t.id === evt.teamId);
              return (
                <div
                  key={evt.id}
                  className="p-4 border border-slate-100 rounded-2xl bg-slate-50 flex flex-col justify-between space-y-3"
                >
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        evt.type === 'match' ? 'bg-red-50 text-red-600 border border-red-100' :
                        evt.type === 'training' ? 'bg-blue-50 text-blue-600 border border-blue-100' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {evt.type === 'match' ? '⚽ Match' : evt.type === 'training' ? '🏃 Entraînement' : '📅 Événement'}
                      </span>
                      <span className="text-[10px] text-slate-400 font-bold">
                        {new Date(evt.start).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                    <h4 className="font-bold text-slate-900 text-sm truncate">{evt.title}</h4>
                    {team && (
                      <p className="text-xs text-slate-500 font-semibold">{team.name}</p>
                    )}
                  </div>

                  <div className="text-[11px] text-slate-400 pt-2 border-t border-slate-100 flex justify-between items-center">
                    <span className="truncate max-w-[120px]">{evt.location || 'Stade du club'}</span>
                    <span className="font-semibold text-slate-500">
                      {new Date(evt.start).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
