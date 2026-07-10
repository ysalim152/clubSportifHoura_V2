import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  CreditCard, DollarSign, Plus, Search, Filter, ShieldAlert, Check, X, 
  ChevronRight, Calendar, User, TrendingUp, RefreshCw, Layers
} from 'lucide-react';
import { collection, doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, sanitizeData } from '../firebase';
import { Club, Payment, Member } from '../types';

interface FinanceManagerProps {
  club: Club;
  payments: Payment[];
  members: Member[];
  onRefresh: () => void;
  quickAction: string | null;
  clearQuickAction: () => void;
}

export default function FinanceManager({ 
  club, payments, members, onRefresh, quickAction, clearQuickAction 
}: FinanceManagerProps) {
  const [showPaymentForm, setShowPaymentForm] = useState(quickAction === 'add_payment');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Payment Form State
  const [memberId, setMemberId] = useState('');
  const [amount, setAmount] = useState('150');
  const [status, setStatus] = useState<'paid' | 'pending' | 'failed'>('paid');
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'cash' | 'check' | 'bank_transfer'>('card');
  const [description, setDescription] = useState('Adhésion Annuelle');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (quickAction === 'add_payment') {
      setShowPaymentForm(true);
      clearQuickAction();
    }
  }, [quickAction]);

  // Statistics
  const totalCollected = payments
    .filter(p => p.status === 'paid')
    .reduce((sum, p) => sum + p.amount, 0);

  const totalPending = payments
    .filter(p => p.status === 'pending')
    .reduce((sum, p) => sum + p.amount, 0);

  const totalFailed = payments
    .filter(p => p.status === 'failed')
    .reduce((sum, p) => sum + p.amount, 0);

  const resetForm = () => {
    setMemberId('');
    setAmount('150');
    setStatus('paid');
    setPaymentMethod('card');
    setDescription('Adhésion Annuelle');
    setShowPaymentForm(false);
  };

  const handleCreatePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberId || !amount) return;

    setIsLoading(true);
    setError(null);
    try {
      const paymentId = 'pay_' + Math.random().toString(36).substring(2, 11);
      const path = `clubs/${club.id}/payments/${paymentId}`;

      const newPayment: Payment = {
        id: paymentId,
        clubId: club.id,
        memberId,
        amount: Number(amount),
        status,
        paymentMethod: status === 'paid' ? paymentMethod : undefined,
        description: description.trim() || undefined,
        date: new Date().toISOString()
      };

      await setDoc(doc(db, 'clubs', club.id, 'payments', paymentId), sanitizeData(newPayment)).catch(err => {
        handleFirestoreError(err, OperationType.WRITE, path);
        throw err;
      });

      // Update member's paid status in database too if this matches their membership fee
      if (status === 'paid') {
        const memberRef = doc(db, 'clubs', club.id, 'members', memberId);
        await updateDoc(memberRef, { membershipPaid: true }).catch(err => {
          handleFirestoreError(err, OperationType.UPDATE, `clubs/${club.id}/members/${memberId}`);
        });
      }

      resetForm();
      onRefresh();
    } catch (err: any) {
      setError("Erreur d'enregistrement: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleMarkAsPaid = async (payment: Payment) => {
    setIsLoading(true);
    try {
      const path = `clubs/${club.id}/payments/${payment.id}`;
      // Update payment doc
      await updateDoc(doc(db, 'clubs', club.id, 'payments', payment.id), {
        status: 'paid',
        paymentMethod: 'card'
      }).catch(err => {
        handleFirestoreError(err, OperationType.UPDATE, path);
        throw err;
      });

      // Update member doc
      const memberRef = doc(db, 'clubs', club.id, 'members', payment.memberId);
      await updateDoc(memberRef, { membershipPaid: true }).catch(err => {
        handleFirestoreError(err, OperationType.UPDATE, `clubs/${club.id}/members/${payment.memberId}`);
      });

      onRefresh();
    } catch (err: any) {
      setError("Erreur lors de la mise à jour: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeletePayment = async (id: string) => {
    if (!window.confirm("Supprimer cet historique de paiement ?")) return;

    setIsLoading(true);
    try {
      const path = `clubs/${club.id}/payments/${id}`;
      await deleteDoc(doc(db, 'clubs', club.id, 'payments', id)).catch(err => {
        handleFirestoreError(err, OperationType.DELETE, path);
        throw err;
      });
      onRefresh();
    } catch (err: any) {
      setError("Erreur de suppression: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredPayments = payments.filter(p => {
    const member = members.find(m => m.id === p.memberId);
    const memberName = member ? `${member.firstName} ${member.lastName}` : '';
    
    const matchesSearch = 
      memberName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.description && p.description.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesStatus = statusFilter === 'all' ? true : p.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <div id="finances-section" className="space-y-8">
      {/* Cards Financial Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { 
            title: "Cotisations Encaissées", 
            amount: `${totalCollected} €`, 
            desc: "Trésorerie disponible",
            color: "text-emerald-700 bg-emerald-50 border-emerald-100" 
          },
          { 
            title: "Paiements en Attente", 
            amount: `${totalPending} €`, 
            desc: "Relances à envoyer",
            color: "text-amber-700 bg-amber-50 border-amber-100" 
          },
          { 
            title: "Cotisations Rejetées", 
            amount: `${totalFailed} €`, 
            desc: "Paiements en échec",
            color: "text-red-700 bg-red-50 border-red-100" 
          }
        ].map((card, idx) => (
          <div
            key={idx}
            className={`p-6 bg-white border rounded-2xl shadow-sm flex items-center justify-between ${card.color}`}
          >
            <div className="space-y-1">
              <p className="text-xs font-bold uppercase tracking-wider opacity-85">{card.title}</p>
              <h3 className="text-3xl font-black">{card.amount}</h3>
              <p className="text-xs opacity-70">{card.desc}</p>
            </div>
            <div className="w-12 h-12 bg-white/50 backdrop-blur rounded-xl flex items-center justify-center border border-white">
              <DollarSign className="w-6 h-6" />
            </div>
          </div>
        ))}
      </div>

      {/* Main Layout Area */}
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4">
          <div>
            <h3 className="font-bold text-slate-900 text-lg">Suivi des Règlements</h3>
            <p className="text-xs text-slate-400">Suivez et validez les adhésions des licenciés.</p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowPaymentForm(true)}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm px-4 py-2.5 rounded-xl shadow flex items-center gap-2 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Saisir un Paiement
            </button>
          </div>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Payment Entry Form */}
        {showPaymentForm && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4 max-w-2xl"
          >
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h4 className="font-bold text-slate-900 text-sm">Enregistrer un Règlement Manuel</h4>
              <button onClick={resetForm} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePayment} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-600 uppercase">Licencié concerné</label>
                <select
                  required
                  value={memberId}
                  onChange={(e) => setMemberId(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm bg-white"
                >
                  <option value="">Sélectionner un membre...</option>
                  {members.map(m => (
                    <option key={m.id} value={m.id}>{m.firstName} {m.lastName} ({m.role})</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-600 uppercase">Montant de la cotisation (€)</label>
                <input
                  type="number"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-600 uppercase">Statut</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as any)}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm bg-white"
                >
                  <option value="paid">✅ Payé / Encaissé</option>
                  <option value="pending">⏳ En attente de règlement</option>
                  <option value="failed">❌ Échec / Rejeté</option>
                </select>
              </div>

              {status === 'paid' && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 uppercase">Mode de paiement</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as any)}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm bg-white"
                  >
                    <option value="card">💳 Carte Bancaire</option>
                    <option value="bank_transfer">🏦 Virement</option>
                    <option value="cash">💵 Espèces</option>
                    <option value="check">✍️ Chèque</option>
                  </select>
                </div>
              )}

              <div className="sm:col-span-2 space-y-1">
                <label className="text-xs font-bold text-slate-600 uppercase">Description / Note</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm"
                />
              </div>

              <div className="sm:col-span-2 flex justify-end gap-3 pt-4 border-t border-slate-100">
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
                  Enregistrer
                </button>
              </div>
            </form>
          </motion.div>
        )}

        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 bg-white p-4 border border-slate-200 rounded-2xl shadow-sm">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Rechercher par membre, description..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-600 text-sm"
            />
          </div>

          <div className="flex items-center gap-2 border border-slate-200 px-3 py-2 rounded-xl bg-slate-50">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent border-none text-xs font-bold text-slate-600 focus:outline-none"
            >
              <option value="all">Tous les règlements</option>
              <option value="paid">Payés</option>
              <option value="pending">En attente</option>
              <option value="failed">Échoués</option>
            </select>
          </div>
        </div>

        {/* Ledger Table */}
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs font-bold uppercase tracking-wider">
                  <th className="px-6 py-4">Membre / Licencié</th>
                  <th className="px-6 py-4">Description</th>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4">Mode / Catégorie</th>
                  <th className="px-6 py-4">Montant</th>
                  <th className="px-6 py-4">Statut</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                {filteredPayments.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-slate-400 text-xs">
                      Aucune transaction répertoriée pour l'instant.
                    </td>
                  </tr>
                ) : (
                  filteredPayments.map(p => {
                    const member = members.find(m => m.id === p.memberId);
                    return (
                      <tr key={p.id} className="hover:bg-slate-50/50 transition">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 bg-slate-100 text-slate-600 font-bold rounded-full flex items-center justify-center uppercase text-xs">
                              {member ? `${member.firstName[0]}${member.lastName[0]}` : "?"}
                            </div>
                            <div>
                              <p className="font-bold text-slate-900">{member ? `${member.firstName} ${member.lastName}` : "Membre supprimé"}</p>
                              <p className="text-[10px] text-slate-400 font-semibold">{member?.role === 'player' ? 'Joueur' : 'Staff'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 font-medium text-slate-600">
                          {p.description || "Cotisation Annuelle"}
                        </td>
                        <td className="px-6 py-4 text-xs text-slate-400 font-semibold">
                          {new Date(p.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="px-6 py-4 text-xs">
                          {p.status === 'paid' && p.paymentMethod ? (
                            <span className="font-semibold text-slate-500 uppercase">
                              {p.paymentMethod === 'card' ? '💳 Carte' :
                               p.paymentMethod === 'bank_transfer' ? '🏦 Virement' :
                               p.paymentMethod === 'cash' ? '💵 Espèces' : '✍️ Chèque'}
                            </span>
                          ) : (
                            <span className="text-slate-400 font-medium">Non spécifié</span>
                          )}
                        </td>
                        <td className="px-6 py-4 font-extrabold text-slate-900">
                          {p.amount} €
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg ${
                            p.status === 'paid' ? 'bg-emerald-50 text-emerald-700' :
                            p.status === 'pending' ? 'bg-amber-50 text-amber-700' :
                            'bg-red-50 text-red-700'
                          }`}>
                            {p.status === 'paid' ? 'Payé' : p.status === 'pending' ? 'En attente' : 'Échoué'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-1">
                            {p.status === 'pending' && (
                              <button
                                onClick={() => handleMarkAsPaid(p)}
                                className="bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 text-emerald-700 text-xs font-bold py-1 px-2.5 rounded-lg transition cursor-pointer"
                              >
                                Encaisser
                              </button>
                            )}
                            <button
                              onClick={() => handleDeletePayment(p.id)}
                              className="p-1 text-slate-300 hover:text-red-500 rounded transition cursor-pointer"
                              title="Supprimer"
                            >
                              <X className="w-4 h-4" />
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
    </div>
  );
}
