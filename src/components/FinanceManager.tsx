import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  CreditCard, DollarSign, Plus, Search, Filter, ShieldAlert, Check, X, 
  ChevronRight, Calendar, User, TrendingUp, RefreshCw, Layers,
  Receipt, Printer, Download, FileText, Trash2, TrendingDown
} from 'lucide-react';
import { collection, doc, setDoc, updateDoc, deleteDoc, getDocs } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, sanitizeData } from '../firebase';
import { Club, Payment, Member, Expense } from '../types';
import ReceiptModal from './ReceiptModal';

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
  // Navigation tabs: 'payments' | 'expenses'
  const [activeTab, setActiveTab] = useState<'payments' | 'expenses'>('payments');
  
  // Modals / Forms visibility
  const [showPaymentForm, setShowPaymentForm] = useState(quickAction === 'add_payment');
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [selectedPaymentForReceipt, setSelectedPaymentForReceipt] = useState<Payment | null>(null);

  // Search & Filters state
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [expenseSearch, setExpenseSearch] = useState('');
  const [expenseCategoryFilter, setExpenseCategoryFilter] = useState('all');

  // Payment Form State
  const [memberId, setMemberId] = useState('');
  const [amount, setAmount] = useState('150');
  const [status, setStatus] = useState<'paid' | 'pending' | 'failed'>('paid');
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'cash' | 'check' | 'bank_transfer'>('card');
  const [description, setDescription] = useState('Adhésion Annuelle');

  // Expense Form State
  const [expenseTitle, setExpenseTitle] = useState('');
  const [expenseCategory, setExpenseCategory] = useState<'equipment' | 'transport' | 'referee' | 'other'>('equipment');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseDescription, setExpenseDescription] = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);

  // Global UI & Database States
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expensesLoading, setExpensesLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch expenses for this club
  const fetchExpenses = async () => {
    if (!club.id) return;
    setExpensesLoading(true);
    try {
      const expensesSnap = await getDocs(collection(db, 'clubs', club.id, 'expenses')).catch(err => {
        handleFirestoreError(err, OperationType.LIST, `clubs/${club.id}/expenses`);
        throw err;
      });
      const list: Expense[] = [];
      expensesSnap.forEach(docSnap => {
        list.push({ id: docSnap.id, ...docSnap.data() } as Expense);
      });
      // Sort by date descending
      list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setExpenses(list);
    } catch (err: any) {
      setError("Impossible de charger les dépenses: " + err.message);
    } finally {
      setExpensesLoading(false);
    }
  };

  useEffect(() => {
    fetchExpenses();
  }, [club.id]);

  useEffect(() => {
    if (quickAction === 'add_payment') {
      setActiveTab('payments');
      setShowPaymentForm(true);
      clearQuickAction();
    }
  }, [quickAction]);

  // Statistics calculation
  const totalCollected = payments
    .filter(p => p.status === 'paid')
    .reduce((sum, p) => sum + p.amount, 0);

  const totalPending = payments
    .filter(p => p.status === 'pending')
    .reduce((sum, p) => sum + p.amount, 0);

  const totalFailed = payments
    .filter(p => p.status === 'failed')
    .reduce((sum, p) => sum + p.amount, 0);

  const totalExpenses = expenses
    .reduce((sum, e) => sum + e.amount, 0);

  const netBalance = totalCollected - totalExpenses;

  // Forms Reset functions
  const resetPaymentForm = () => {
    setMemberId('');
    setAmount('150');
    setStatus('paid');
    setPaymentMethod('card');
    setDescription('Adhésion Annuelle');
    setShowPaymentForm(false);
  };

  const resetExpenseForm = () => {
    setExpenseTitle('');
    setExpenseCategory('equipment');
    setExpenseAmount('');
    setExpenseDescription('');
    setExpenseDate(new Date().toISOString().split('T')[0]);
    setShowExpenseForm(false);
  };

  // Payment Operations
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

      resetPaymentForm();
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

  // Expense Operations
  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseTitle.trim() || !expenseAmount) return;

    setIsLoading(true);
    setError(null);
    try {
      const expenseId = 'exp_' + Math.random().toString(36).substring(2, 11);
      const path = `clubs/${club.id}/expenses/${expenseId}`;

      const newExpense: Expense = {
        id: expenseId,
        clubId: club.id,
        title: expenseTitle.trim(),
        amount: Number(expenseAmount),
        category: expenseCategory,
        description: expenseDescription.trim() || undefined,
        date: new Date(expenseDate).toISOString()
      };

      await setDoc(doc(db, 'clubs', club.id, 'expenses', expenseId), sanitizeData(newExpense)).catch(err => {
        handleFirestoreError(err, OperationType.WRITE, path);
        throw err;
      });

      resetExpenseForm();
      fetchExpenses();
    } catch (err: any) {
      setError("Erreur d'enregistrement de la dépense: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteExpense = async (id: string) => {
    if (!window.confirm("Supprimer cette dépense de la trésorerie ?")) return;

    setIsLoading(true);
    try {
      const path = `clubs/${club.id}/expenses/${id}`;
      await deleteDoc(doc(db, 'clubs', club.id, 'expenses', id)).catch(err => {
        handleFirestoreError(err, OperationType.DELETE, path);
        throw err;
      });
      fetchExpenses();
    } catch (err: any) {
      setError("Erreur de suppression: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Filters and Searching
  const filteredPayments = payments.filter(p => {
    const member = members.find(m => m.id === p.memberId);
    const memberName = member ? `${member.firstName} ${member.lastName}` : '';
    
    const matchesSearch = 
      memberName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.description && p.description.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesStatus = statusFilter === 'all' ? true : p.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const filteredExpenses = expenses.filter(e => {
    const matchesSearch = 
      e.title.toLowerCase().includes(expenseSearch.toLowerCase()) ||
      (e.description && e.description.toLowerCase().includes(expenseSearch.toLowerCase()));

    const matchesCategory = expenseCategoryFilter === 'all' ? true : e.category === expenseCategoryFilter;

    return matchesSearch && matchesCategory;
  });

  const expenseCategoryMap = {
    equipment: { label: "Matériel & Équipements", color: "bg-blue-50 text-blue-700 border-blue-150" },
    transport: { label: "Frais de déplacement", color: "bg-purple-50 text-purple-700 border-purple-150" },
    referee: { label: "Arbitrage", color: "bg-amber-50 text-amber-700 border-amber-150" },
    other: { label: "Autre frais", color: "bg-slate-100 text-slate-700 border-slate-200" }
  };

  return (
    <div id="finances-section" className="space-y-8">
      {/* Financial Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Recettes Card */}
        <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Cotisations Encaissées</p>
            <h3 className="text-3xl font-black text-emerald-600">{totalCollected.toFixed(2)} €</h3>
            <p className="text-xs text-slate-400 font-medium">
              En attente : <span className="font-bold text-amber-600">{totalPending} €</span> | Rejetés : <span className="font-bold text-red-500">{totalFailed} €</span>
            </p>
          </div>
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center border border-emerald-100 shrink-0">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>

        {/* Expenses Card */}
        <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Total des Dépenses</p>
            <h3 className="text-3xl font-black text-rose-600">{totalExpenses.toFixed(2)} €</h3>
            <p className="text-xs text-slate-400 font-medium">{expenses.length} justificatifs enregistrés</p>
          </div>
          <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-xl flex items-center justify-center border border-rose-100 shrink-0">
            <TrendingDown className="w-6 h-6" />
          </div>
        </div>

        {/* Bilan Net Card */}
        <div className={`p-6 bg-white border rounded-2xl shadow-sm flex items-center justify-between ${
          netBalance >= 0 ? 'border-emerald-200 bg-emerald-50/10' : 'border-rose-200 bg-rose-50/10'
        }`}>
          <div className="space-y-1">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Bilan Net (Trésorerie)</p>
            <h3 className={`text-3xl font-black ${netBalance >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
              {netBalance >= 0 ? '+' : ''}{netBalance.toFixed(2)} €
            </h3>
            <p className="text-xs text-slate-400 font-medium">Solde de l'exercice en cours</p>
          </div>
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center border shrink-0 ${
            netBalance >= 0 
              ? 'bg-emerald-100 border-emerald-200 text-emerald-700' 
              : 'bg-rose-100 border-rose-200 text-rose-700'
          }`}>
            <DollarSign className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Segmented Tab Controls */}
      <div className="flex border-b border-slate-200 gap-1">
        <button
          onClick={() => {
            setActiveTab('payments');
            setError(null);
          }}
          className={`px-5 py-3 text-sm font-bold border-b-2 flex items-center gap-2 transition cursor-pointer ${
            activeTab === 'payments'
              ? 'border-emerald-600 text-emerald-600'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          <span>Cotisations & Recettes</span>
        </button>
        <button
          onClick={() => {
            setActiveTab('expenses');
            setError(null);
          }}
          className={`px-5 py-3 text-sm font-bold border-b-2 flex items-center gap-2 transition cursor-pointer ${
            activeTab === 'expenses'
              ? 'border-emerald-600 text-emerald-600'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          <TrendingDown className="w-4 h-4" />
          <span>Gestion des Dépenses</span>
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Ledger Area */}
      <div className="space-y-6">
        <AnimatePresence mode="wait">
          {activeTab === 'payments' ? (
            <motion.div
              key="payments-view"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="space-y-6"
            >
              {/* Header / Actions */}
              <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4">
                <div>
                  <h3 className="font-bold text-slate-900 text-lg">Suivi des Règlements</h3>
                  <p className="text-xs text-slate-400">Suivez, validez et générez les justificatifs de cotisation pour les adhérents.</p>
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

              {/* Payment Input Form */}
              {showPaymentForm && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4 max-w-2xl"
                >
                  <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                    <h4 className="font-bold text-slate-900 text-sm">Enregistrer un Règlement Manuel</h4>
                    <button onClick={resetPaymentForm} className="text-slate-400 hover:text-slate-600 cursor-pointer">
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
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm bg-white"
                      >
                        <option value="">Sélectionner un membre...</option>
                        {members.map(m => {
                          const roleLabel = {
                            admin: 'Administrateur',
                            president: "Président",
                            vice_president_1: "1er Vice-président",
                            vice_president_2: "2e Vice-président",
                            sec_general: "Secrétaire Général",
                            tresorier: "Trésorier",
                            membre_actif: "Membre Actif",
                            adherent: "Adhérent",
                            player: "Joueur",
                            visiteur: "Visiteur",
                            coach: "Entraîneur"
                          }[m.role] || m.role;
                          const isExempt = m.membershipAmount === 0 || ['president', 'vice_president_1', 'vice_president_2', 'sec_general', 'tresorier', 'membre_actif', 'visiteur'].includes(m.role);
                          return (
                            <option key={m.id} value={m.id}>
                              {m.firstName} {m.lastName} ({roleLabel}{isExempt ? ' - Exonéré' : ''})
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-600 uppercase">Montant de la cotisation (€)</label>
                      <input
                        type="number"
                        required
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-600 uppercase">Statut</label>
                      <select
                        value={status}
                        onChange={(e) => setStatus(e.target.value as any)}
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm bg-white"
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
                          className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm bg-white"
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
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm"
                      />
                    </div>

                    <div className="sm:col-span-2 flex justify-end gap-3 pt-4 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={resetPaymentForm}
                        className="px-4 py-2.5 border border-slate-200 rounded-xl text-slate-600 text-sm hover:bg-slate-50 cursor-pointer"
                      >
                        Annuler
                      </button>
                      <button
                        type="submit"
                        disabled={isLoading}
                        className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-semibold cursor-pointer flex items-center gap-2"
                      >
                        {isLoading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
                        Enregistrer
                      </button>
                    </div>
                  </form>
                </motion.div>
              )}

              {/* Search & Filters block */}
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

              {/* Payments Table */}
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs font-bold uppercase tracking-wider">
                        <th className="px-6 py-4">Membre / Licencié</th>
                        <th className="px-6 py-4">Description</th>
                        <th className="px-6 py-4">Date</th>
                        <th className="px-6 py-4">Mode / Règlement</th>
                        <th className="px-6 py-4">Montant</th>
                        <th className="px-6 py-4">Statut</th>
                        <th className="px-6 py-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                      {filteredPayments.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-6 py-12 text-center text-slate-400 text-xs">
                            Aucune cotisation répertoriée pour l'instant.
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
                                    <p className="text-[10px] text-slate-400 font-semibold">
                                      {member ? ({
                                        admin: 'Administrateur',
                                        president: "Président de l'association",
                                        vice_president_1: "1er Vice-président",
                                        vice_president_2: "2e Vice-président",
                                        sec_general: "Secrétaire Général",
                                        tresorier: "Trésorier",
                                        membre_actif: "Membre Actif",
                                        adherent: "Adhérent",
                                        player: "Joueur",
                                        visiteur: "Visiteur",
                                        coach: "Entraîneur"
                                      }[member.role] || member.role) : ""}
                                    </p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4 font-medium text-slate-650">
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
                                <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg ${
                                  p.status === 'paid' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                                  p.status === 'pending' ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                                  'bg-red-50 text-red-700 border border-red-100'
                                }`}>
                                  {p.status === 'paid' ? 'Payé' : p.status === 'pending' ? 'En attente' : 'Échoué'}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-right">
                                <div className="flex justify-end items-center gap-2">
                                  {p.status === 'paid' && member && (
                                    <button
                                      onClick={() => setSelectedPaymentForReceipt(p)}
                                      className="bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 text-emerald-700 text-xs font-bold py-1 px-2.5 rounded-lg transition cursor-pointer flex items-center gap-1"
                                      title="Attestation / Reçu de paiement"
                                    >
                                      <FileText className="w-3.5 h-3.5 text-emerald-600" />
                                      <span>Reçu</span>
                                    </button>
                                  )}
                                  {p.status === 'pending' && (
                                    <button
                                      onClick={() => handleMarkAsPaid(p)}
                                      className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold py-1 px-2.5 rounded-lg shadow-xs transition cursor-pointer"
                                    >
                                      Encaisser
                                    </button>
                                  )}
                                  <button
                                    onClick={() => handleDeletePayment(p.id)}
                                    className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-slate-50 rounded-lg transition cursor-pointer"
                                    title="Supprimer"
                                  >
                                    <Trash2 className="w-4 h-4" />
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
            </motion.div>
          ) : (
            <motion.div
              key="expenses-view"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="space-y-6"
            >
              {/* Header / Actions */}
              <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4">
                <div>
                  <h3 className="font-bold text-slate-900 text-lg">Registre des Dépenses</h3>
                  <p className="text-xs text-slate-400">Enregistrez et contrôlez tous les frais de l'association (matériel, déplacements, arbitrage, etc.).</p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowExpenseForm(true)}
                    className="bg-rose-600 hover:bg-rose-500 text-white font-medium text-sm px-4 py-2.5 rounded-xl shadow flex items-center gap-2 transition cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    Enregistrer une Dépense
                  </button>
                </div>
              </div>

              {/* Expense Input Form */}
              {showExpenseForm && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4 max-w-2xl"
                >
                  <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                    <h4 className="font-bold text-slate-900 text-sm">Déclarer un Frais ou Investissement</h4>
                    <button onClick={resetExpenseForm} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <form onSubmit={handleCreateExpense} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-600 uppercase">Motif / Intitulé du frais</label>
                      <input
                        type="text"
                        required
                        placeholder="ex: Achat de 10 ballons de match U15"
                        value={expenseTitle}
                        onChange={(e) => setExpenseTitle(e.target.value)}
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-600 uppercase">Montant TTC (€)</label>
                      <input
                        type="number"
                        required
                        placeholder="0.00"
                        value={expenseAmount}
                        onChange={(e) => setExpenseAmount(e.target.value)}
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-600 uppercase">Catégorie de charge</label>
                      <select
                        value={expenseCategory}
                        onChange={(e) => setExpenseCategory(e.target.value as any)}
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm bg-white"
                      >
                        <option value="equipment">⚽ Matériel & Équipements</option>
                        <option value="transport">🚗 Frais de déplacement</option>
                        <option value="referee">🏁 Arbitrage</option>
                        <option value="other">📦 Autre charge</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-600 uppercase">Date de facturation</label>
                      <input
                        type="date"
                        required
                        value={expenseDate}
                        onChange={(e) => setExpenseDate(e.target.value)}
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm"
                      />
                    </div>

                    <div className="sm:col-span-2 space-y-1">
                      <label className="text-xs font-bold text-slate-600 uppercase">Détails / Notes supplémentaires</label>
                      <textarea
                        rows={2}
                        placeholder="Optionnel : détails du fournisseur, justificatif, remboursement, etc."
                        value={expenseDescription}
                        onChange={(e) => setExpenseDescription(e.target.value)}
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none"
                      />
                    </div>

                    <div className="sm:col-span-2 flex justify-end gap-3 pt-4 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={resetExpenseForm}
                        className="px-4 py-2.5 border border-slate-200 rounded-xl text-slate-600 text-sm hover:bg-slate-50 cursor-pointer"
                      >
                        Annuler
                      </button>
                      <button
                        type="submit"
                        disabled={isLoading}
                        className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-sm font-semibold cursor-pointer flex items-center gap-2"
                      >
                        {isLoading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
                        Enregistrer la Dépense
                      </button>
                    </div>
                  </form>
                </motion.div>
              )}

              {/* Search & Filters */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 bg-white p-4 border border-slate-200 rounded-2xl shadow-sm">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Rechercher par motif, fournisseur..."
                    value={expenseSearch}
                    onChange={(e) => setExpenseSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:border-rose-650 text-sm"
                  />
                </div>

                <div className="flex items-center gap-2 border border-slate-200 px-3 py-2 rounded-xl bg-slate-50">
                  <Filter className="w-3.5 h-3.5 text-slate-400" />
                  <select
                    value={expenseCategoryFilter}
                    onChange={(e) => setExpenseCategoryFilter(e.target.value)}
                    className="bg-transparent border-none text-xs font-bold text-slate-600 focus:outline-none"
                  >
                    <option value="all">Toutes les charges</option>
                    <option value="equipment">Matériel & Équipements</option>
                    <option value="transport">Déplacements</option>
                    <option value="referee">Arbitrage</option>
                    <option value="other">Autre</option>
                  </select>
                </div>
              </div>

              {/* Expenses Table */}
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs font-bold uppercase tracking-wider">
                        <th className="px-6 py-4">Motif de dépense</th>
                        <th className="px-6 py-4">Catégorie</th>
                        <th className="px-6 py-4">Date de facturation</th>
                        <th className="px-6 py-4">Description / Note</th>
                        <th className="px-6 py-4">Montant</th>
                        <th className="px-6 py-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                      {expensesLoading ? (
                        <tr>
                          <td colSpan={6} className="px-6 py-12 text-center text-slate-400 text-xs">
                            <div className="w-6 h-6 border-2 border-rose-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                            <span className="mt-2 block">Chargement des dépenses...</span>
                          </td>
                        </tr>
                      ) : filteredExpenses.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-6 py-12 text-center text-slate-400 text-xs">
                            Aucune dépense enregistrée correspondant à ces filtres.
                          </td>
                        </tr>
                      ) : (
                        filteredExpenses.map(e => {
                          const catInfo = expenseCategoryMap[e.category] || expenseCategoryMap.other;
                          return (
                            <tr key={e.id} className="hover:bg-slate-50/50 transition">
                              <td className="px-6 py-4">
                                <div className="font-bold text-slate-900">{e.title}</div>
                              </td>
                              <td className="px-6 py-4">
                                <span className={`inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-lg border ${catInfo.color}`}>
                                  {catInfo.label}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-xs text-slate-400 font-semibold">
                                {new Date(e.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </td>
                              <td className="px-6 py-4 text-xs text-slate-500 italic max-w-xs truncate">
                                {e.description || "Aucun détail"}
                              </td>
                              <td className="px-6 py-4 font-extrabold text-rose-600">
                                - {e.amount.toFixed(2)} €
                              </td>
                              <td className="px-6 py-4 text-right">
                                <button
                                  onClick={() => handleDeleteExpense(e.id)}
                                  className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-slate-50 rounded-lg transition cursor-pointer"
                                  title="Supprimer"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Receipts Generator Modal rendering */}
      {selectedPaymentForReceipt && (
        <ReceiptModal
          payment={selectedPaymentForReceipt}
          member={members.find(m => m.id === selectedPaymentForReceipt.memberId)!}
          club={club}
          onClose={() => setSelectedPaymentForReceipt(null)}
        />
      )}
    </div>
  );
}
