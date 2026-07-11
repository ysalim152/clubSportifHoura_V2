import React, { useState, useEffect } from 'react';
import { 
  Shirt, Plus, Search, Filter, Trash2, Edit3, UserPlus, ArrowLeftRight, 
  AlertTriangle, CheckCircle, TrendingUp, Box, Info, Archive, UserCheck, 
  RefreshCw, FileDown, Layers, List, Grid, X, HelpCircle
} from 'lucide-react';
import { collection, doc, setDoc, deleteDoc, updateDoc, getDocs } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, sanitizeData } from '../firebase';
import { Club, Member, Equipment } from '../types';

interface EquipmentLog {
  id: string;
  equipmentId: string;
  memberId: string;
  memberName: string;
  quantity: number;
  type: 'allocation' | 'return';
  date: string;
  notes?: string;
}

interface EquipmentManagerProps {
  club: Club;
  members: Member[];
  equipments: Equipment[];
  onRefresh: () => Promise<void>;
  userRole: string;
}

export default function EquipmentManager({ 
  club, members, equipments, onRefresh, userRole 
}: EquipmentManagerProps) {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  
  // Modals state
  const [showFormModal, setShowFormModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [editingEquipment, setEditingEquipment] = useState<Equipment | null>(null);
  const [activeEquipment, setActiveEquipment] = useState<Equipment | null>(null);
  const [logs, setLogs] = useState<EquipmentLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    category: 'Maillots & Shorts',
    totalQuantity: 50,
    allocatedQuantity: 0,
    size: 'M',
    location: '',
    description: ''
  });

  // Assign Form State
  const [assignData, setAssignData] = useState({
    memberId: '',
    quantity: 1,
    type: 'allocation' as 'allocation' | 'return',
    notes: ''
  });

  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const categories = [
    'Maillots & Shorts',
    'Ballons',
    'Plots & Chasubles',
    'Pharmacie & Soins',
    'Matériel d\'entraînement',
    'Autre'
  ];

  const canManage = ['admin', 'president', 'tresorier', 'sec_general', 'coach'].includes(userRole);

  // Fetch logs when activeEquipment changes or logs modal is opened
  const fetchLogs = async (eqId: string) => {
    setLogsLoading(true);
    try {
      const logsSnap = await getDocs(collection(db, 'clubs', club.id, 'equipments', eqId, 'logs'));
      const logsList: EquipmentLog[] = [];
      logsSnap.forEach(doc => {
        logsList.push({ id: doc.id, ...doc.data() } as EquipmentLog);
      });
      // Sort logs by date descending
      logsList.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setLogs(logsList);
    } catch (err) {
      console.error("Error loading equipment logs:", err);
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => {
    if (activeEquipment && showLogsModal) {
      fetchLogs(activeEquipment.id);
    }
  }, [activeEquipment, showLogsModal]);

  // Open Add modal
  const handleAddClick = () => {
    setEditingEquipment(null);
    setFormData({
      name: '',
      category: 'Maillots & Shorts',
      totalQuantity: 10,
      allocatedQuantity: 0,
      size: 'M',
      location: '',
      description: ''
    });
    setFormError(null);
    setShowFormModal(true);
  };

  // Open Edit modal
  const handleEditClick = (eq: Equipment) => {
    setEditingEquipment(eq);
    setFormData({
      name: eq.name,
      category: eq.category,
      totalQuantity: eq.totalQuantity,
      allocatedQuantity: eq.allocatedQuantity,
      size: eq.size || 'Unique',
      location: eq.location || '',
      description: eq.description || ''
    });
    setFormError(null);
    setShowFormModal(true);
  };

  // Open Assign modal
  const handleAssignClick = (eq: Equipment) => {
    setActiveEquipment(eq);
    setAssignData({
      memberId: '',
      quantity: 1,
      type: 'allocation',
      notes: ''
    });
    setFormError(null);
    setShowAssignModal(true);
  };

  // Submit equipment creation/edition
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setFormError('Le nom de l\'équipement est requis.');
      return;
    }
    if (formData.totalQuantity < 0) {
      setFormError('La quantité totale doit être supérieure ou égale à 0.');
      return;
    }
    if (formData.allocatedQuantity < 0) {
      setFormError('La quantité attribuée doit être supérieure ou égale à 0.');
      return;
    }
    if (formData.allocatedQuantity > formData.totalQuantity) {
      setFormError('La quantité attribuée ne peut pas dépasser la quantité totale.');
      return;
    }

    setLoading(true);
    setFormError(null);

    const availableQuantity = formData.totalQuantity - formData.allocatedQuantity;
    const eqId = editingEquipment ? editingEquipment.id : 'eq_' + Math.random().toString(36).substr(2, 9);
    
    const eqData: Equipment = {
      id: eqId,
      clubId: club.id,
      name: formData.name.trim(),
      category: formData.category,
      totalQuantity: Number(formData.totalQuantity),
      allocatedQuantity: Number(formData.allocatedQuantity),
      availableQuantity: availableQuantity,
      size: formData.size || 'Unique',
      location: formData.location.trim() || undefined,
      description: formData.description.trim() || undefined,
      createdAt: editingEquipment ? editingEquipment.createdAt : new Date().toISOString()
    };

    const path = `clubs/${club.id}/equipments/${eqId}`;

    try {
      await setDoc(doc(db, 'clubs', club.id, 'equipments', eqId), sanitizeData(eqData));
      setShowFormModal(false);
      await onRefresh();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
      setFormError('Une erreur est survenue lors de l\'enregistrement.');
    } finally {
      setLoading(false);
    }
  };

  // Submit assignment / return
  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeEquipment) return;
    if (!assignData.memberId) {
      setFormError('Veuillez sélectionner un membre.');
      return;
    }
    if (assignData.quantity <= 0) {
      setFormError('La quantité doit être supérieure à 0.');
      return;
    }

    const memberObj = members.find(m => m.id === assignData.memberId);
    const memberName = memberObj ? `${memberObj.lastName} ${memberObj.firstName}` : 'Membre';

    const updatedAllocated = assignData.type === 'allocation' 
      ? activeEquipment.allocatedQuantity + Number(assignData.quantity)
      : activeEquipment.allocatedQuantity - Number(assignData.quantity);

    if (assignData.type === 'allocation' && Number(assignData.quantity) > activeEquipment.availableQuantity) {
      setFormError(`Impossible d'attribuer plus d'équipements que le stock disponible (${activeEquipment.availableQuantity} dispo).`);
      return;
    }

    if (assignData.type === 'return' && Number(assignData.quantity) > activeEquipment.allocatedQuantity) {
      setFormError(`Impossible de retourner plus d'équipements que le nombre actuellement attribué (${activeEquipment.allocatedQuantity} attribués).`);
      return;
    }

    setLoading(true);
    setFormError(null);

    const updatedAvailable = activeEquipment.totalQuantity - updatedAllocated;
    const logId = 'log_' + Math.random().toString(36).substr(2, 9);

    const logData: EquipmentLog = {
      id: logId,
      equipmentId: activeEquipment.id,
      memberId: assignData.memberId,
      memberName: memberName,
      quantity: Number(assignData.quantity),
      type: assignData.type,
      date: new Date().toISOString(),
      notes: assignData.notes.trim() || undefined
    };

    try {
      // 1. Save Log
      await setDoc(doc(db, 'clubs', club.id, 'equipments', activeEquipment.id, 'logs', logId), sanitizeData(logData));
      
      // 2. Update Equipment quantities
      await updateDoc(doc(db, 'clubs', club.id, 'equipments', activeEquipment.id), {
        allocatedQuantity: updatedAllocated,
        availableQuantity: updatedAvailable
      });

      setShowAssignModal(false);
      await onRefresh();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `clubs/${club.id}/equipments/${activeEquipment.id}`);
      setFormError('Erreur de mise à jour des stocks.');
    } finally {
      setLoading(false);
    }
  };

  // Delete equipment
  const handleDeleteEquipment = async (eqId: string) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer cet équipement du stock ?')) return;

    try {
      await deleteDoc(doc(db, 'clubs', club.id, 'equipments', eqId));
      await onRefresh();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `clubs/${club.id}/equipments/${eqId}`);
      alert('Erreur lors de la suppression.');
    }
  };

  // CSV Export
  const exportToCSV = () => {
    const headers = [
      'ID', 'Nom', 'Catégorie', 'Taille', 'Quantité Totale', 'Quantité Attribuée', 'Disponible', 'Emplacement', 'Description', 'Date de création'
    ];

    const rows = filteredEquipments.map(eq => [
      eq.id,
      eq.name,
      eq.category,
      eq.size || 'Unique',
      String(eq.totalQuantity),
      String(eq.allocatedQuantity),
      String(eq.availableQuantity),
      eq.location || '',
      eq.description || '',
      new Date(eq.createdAt).toLocaleDateString('fr-FR')
    ]);

    const escapeField = (field: any) => {
      if (field === null || field === undefined) return '';
      const stringified = String(field);
      return `"${stringified.replace(/"/g, '""')}"`;
    };

    const csvContent = [
      headers.map(escapeField).join(';'),
      ...rows.map(row => row.map(escapeField).join(';'))
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `inventaire_equipements_${club.name.toLowerCase().replace(/\s+/g, '_')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filtering Logic
  const filteredEquipments = equipments.filter(eq => {
    const matchesSearch = eq.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (eq.description && eq.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (eq.location && eq.location.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesCategory = selectedCategory === 'all' || eq.category === selectedCategory;

    let matchesStatus = true;
    if (selectedStatus === 'exhausted') {
      matchesStatus = eq.availableQuantity === 0;
    } else if (selectedStatus === 'low') {
      matchesStatus = eq.availableQuantity > 0 && eq.availableQuantity <= 3;
    } else if (selectedStatus === 'ok') {
      matchesStatus = eq.availableQuantity > 3;
    }

    return matchesSearch && matchesCategory && matchesStatus;
  });

  // Calculate high-level stats
  const totalReferences = equipments.length;
  const totalItemsOwned = equipments.reduce((sum, eq) => sum + eq.totalQuantity, 0);
  const totalItemsAllocated = equipments.reduce((sum, eq) => sum + eq.allocatedQuantity, 0);
  const exhaustedItemsCount = equipments.filter(eq => eq.availableQuantity === 0).length;
  const lowStockItemsCount = equipments.filter(eq => eq.availableQuantity > 0 && eq.availableQuantity <= 3).length;

  return (
    <div className="space-y-6">
      {/* Upper stats banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm flex items-center gap-4 transition hover:shadow-md">
          <div className="p-3.5 bg-indigo-50 text-indigo-600 rounded-xl">
            <Archive className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Références de Stock</p>
            <h4 className="text-2xl font-black text-slate-800 mt-1">{totalReferences}</h4>
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm flex items-center gap-4 transition hover:shadow-md">
          <div className="p-3.5 bg-emerald-50 text-emerald-600 rounded-xl">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Volume Total d'Équipements</p>
            <h4 className="text-2xl font-black text-slate-800 mt-1">
              {totalItemsOwned} <span className="text-xs font-semibold text-slate-400">unités</span>
            </h4>
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm flex items-center gap-4 transition hover:shadow-md">
          <div className="p-3.5 bg-amber-50 text-amber-600 rounded-xl">
            <UserCheck className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Équipements Distribués</p>
            <h4 className="text-2xl font-black text-slate-800 mt-1">
              {totalItemsAllocated} <span className="text-xs font-semibold text-slate-400">/{totalItemsOwned}</span>
            </h4>
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm flex items-center gap-4 transition hover:shadow-md">
          <div className="p-3.5 bg-rose-50 text-rose-600 rounded-xl">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Ruptures de Stock</p>
            <h4 className="text-2xl font-black text-rose-600 mt-1">
              {exhaustedItemsCount} <span className="text-xs font-semibold text-slate-400">épuisé(s)</span>
            </h4>
          </div>
        </div>
      </div>

      {/* Main Controls Panel */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-4">
          <div>
            <h3 className="font-extrabold text-slate-900 text-lg">Inventaire & Matériel du Club</h3>
            <p className="text-xs text-slate-400">Contrôlez les équipements disponibles, gérez les attributions et prévenez les ruptures de stock.</p>
          </div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="flex items-center gap-1 bg-slate-100 border border-slate-200 p-1 rounded-xl">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-lg transition ${viewMode === 'grid' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                title="Mode Grille"
              >
                <Grid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-lg transition ${viewMode === 'list' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                title="Mode Liste"
              >
                <List className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={exportToCSV}
              className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-semibold text-sm px-3.5 py-2.5 rounded-xl shadow-sm flex items-center justify-center gap-1.5 transition cursor-pointer"
              title="Exporter l'inventaire au format CSV/Excel"
            >
              <FileDown className="w-4 h-4 text-emerald-600" />
              <span>Exporter CSV</span>
            </button>

            {canManage && (
              <button
                onClick={handleAddClick}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm px-4 py-2.5 rounded-xl shadow-md shadow-emerald-600/10 flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Nouveau matériel</span>
              </button>
            )}
          </div>
        </div>

        {/* Filter bars */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
          {/* Search bar */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
            <input
              type="text"
              placeholder="Rechercher par nom, emplacement..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </div>

          {/* Category Filter */}
          <div className="relative">
            <Filter className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-4" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 cursor-pointer"
            >
              <option value="all">Toutes les catégories</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="relative">
            <AlertTriangle className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-4" />
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 cursor-pointer"
            >
              <option value="all">Tous les états de stock</option>
              <option value="ok">En stock suffisant (&gt;3)</option>
              <option value="low">Stock faible (1-3)</option>
              <option value="exhausted">Épuisé (0 disponible)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main inventory rendering */}
      {filteredEquipments.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
          <Shirt className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h4 className="font-bold text-slate-700 text-base">Aucun équipement trouvé</h4>
          <p className="text-slate-400 text-xs mt-1">Essayez de modifier vos filtres de recherche ou ajoutez un nouvel équipement.</p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredEquipments.map(eq => {
            const isExhausted = eq.availableQuantity === 0;
            const isLow = eq.availableQuantity > 0 && eq.availableQuantity <= 3;

            return (
              <div 
                key={eq.id} 
                className={`bg-white border rounded-2xl shadow-sm overflow-hidden flex flex-col justify-between transition-all duration-300 ${
                  isExhausted 
                    ? 'border-rose-200 ring-1 ring-rose-100 bg-rose-50/10' 
                    : isLow 
                    ? 'border-amber-200 ring-1 ring-amber-100 bg-amber-50/10' 
                    : 'border-slate-200 hover:shadow-md'
                }`}
              >
                {/* Header info */}
                <div className="p-6 space-y-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] uppercase font-extrabold text-slate-400 tracking-wider bg-slate-100 border border-slate-150 px-2.5 py-1 rounded-full">
                        {eq.category}
                      </span>
                      <h4 className="font-extrabold text-slate-900 text-base mt-2.5 leading-tight">{eq.name}</h4>
                    </div>
                    
                    {/* Status indicator */}
                    {isExhausted ? (
                      <span className="bg-rose-100 text-rose-800 border border-rose-200 text-[11px] font-black px-2.5 py-1 rounded-lg flex items-center gap-1 shrink-0 shadow-sm animate-pulse">
                        <X className="w-3 h-3 text-rose-600" />
                        Épuisé !
                      </span>
                    ) : isLow ? (
                      <span className="bg-amber-100 text-amber-800 border border-amber-200 text-[11px] font-black px-2.5 py-1 rounded-lg flex items-center gap-1 shrink-0 shadow-sm">
                        <AlertTriangle className="w-3 h-3 text-amber-600" />
                        Stock faible
                      </span>
                    ) : (
                      <span className="bg-emerald-100 text-emerald-800 border border-emerald-200 text-[11px] font-black px-2.5 py-1 rounded-lg flex items-center gap-1 shrink-0 shadow-sm">
                        <CheckCircle className="w-3 h-3 text-emerald-600" />
                        Disponible
                      </span>
                    )}
                  </div>

                  {/* Size and Location */}
                  <div className="grid grid-cols-2 gap-3 pt-1 border-t border-slate-100 text-xs">
                    <div>
                      <span className="text-slate-400 block font-medium">Taille :</span>
                      <span className="font-extrabold text-slate-700">{eq.size || 'Unique'}</span>
                    </div>
                    {eq.location && (
                      <div>
                        <span className="text-slate-400 block font-medium">Emplacement :</span>
                        <span className="font-extrabold text-slate-700 truncate block" title={eq.location}>
                          {eq.location}
                        </span>
                      </div>
                    )}
                  </div>

                  {eq.description && (
                    <p className="text-slate-500 text-xs leading-relaxed line-clamp-2 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                      {eq.description}
                    </p>
                  )}

                  {/* Quantity bar / stats */}
                  <div className="space-y-2 pt-2 border-t border-slate-100">
                    <div className="flex justify-between text-xs font-bold text-slate-600">
                      <span>Disponible : {eq.availableQuantity}</span>
                      <span>Total : {eq.totalQuantity}</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden flex">
                      <div 
                        style={{ width: `${(eq.availableQuantity / eq.totalQuantity) * 100}%` }}
                        className={`h-full transition-all duration-500 ${isExhausted ? 'bg-rose-500' : isLow ? 'bg-amber-500' : 'bg-emerald-500'}`}
                      />
                      <div 
                        style={{ width: `${(eq.allocatedQuantity / eq.totalQuantity) * 100}%` }}
                        className="h-full bg-indigo-500 transition-all duration-500 opacity-80"
                        title={`Attribué: ${eq.allocatedQuantity}`}
                      />
                    </div>
                    <div className="flex justify-between items-center text-[10px] text-slate-400">
                      <span>En Stock : {eq.availableQuantity} u.</span>
                      <span className="text-indigo-600 font-semibold">Attribué : {eq.allocatedQuantity} u.</span>
                    </div>
                  </div>
                </div>

                {/* Footer buttons / Actions */}
                <div className="bg-slate-50 border-t border-slate-100 px-6 py-3.5 flex items-center justify-between gap-2">
                  <button
                    onClick={() => {
                      setActiveEquipment(eq);
                      setShowLogsModal(true);
                    }}
                    className="text-slate-600 hover:text-slate-900 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Info className="w-3.5 h-3.5 text-slate-400" />
                    Historique
                  </button>

                  <div className="flex items-center gap-2">
                    {canManage && (
                      <>
                        <button
                          onClick={() => handleAssignClick(eq)}
                          className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 hover:text-indigo-800 border border-indigo-100 text-xs font-extrabold px-3 py-2 rounded-xl transition flex items-center gap-1 shadow-sm cursor-pointer"
                          title="Attribuer ou Retourner du matériel"
                        >
                          <ArrowLeftRight className="w-3.5 h-3.5" />
                          Attribuer
                        </button>
                        <button
                          onClick={() => handleEditClick(eq)}
                          className="text-slate-500 hover:text-slate-800 p-2 rounded-lg hover:bg-slate-200/50 transition cursor-pointer"
                          title="Modifier"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteEquipment(eq.id)}
                          className="text-rose-600 hover:text-rose-800 p-2 rounded-lg hover:bg-rose-50 transition cursor-pointer"
                          title="Supprimer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* List Mode Table */
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-550 border-b border-slate-100 text-slate-500 font-extrabold text-xs uppercase tracking-wider">
                  <th className="px-6 py-4">Nom de l'équipement</th>
                  <th className="px-6 py-4">Catégorie</th>
                  <th className="px-6 py-4">Taille</th>
                  <th className="px-6 py-4">Emplacement</th>
                  <th className="px-6 py-4">Total</th>
                  <th className="px-6 py-4">Distribué</th>
                  <th className="px-6 py-4">Disponible</th>
                  <th className="px-6 py-4">État Stock</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEquipments.map(eq => {
                  const isExhausted = eq.availableQuantity === 0;
                  const isLow = eq.availableQuantity > 0 && eq.availableQuantity <= 3;

                  return (
                    <tr 
                      key={eq.id} 
                      className={`hover:bg-slate-50/50 transition ${
                        isExhausted ? 'bg-rose-50/10' : isLow ? 'bg-amber-50/10' : ''
                      }`}
                    >
                      <td className="px-6 py-4 font-bold text-slate-900">{eq.name}</td>
                      <td className="px-6 py-4 text-xs">
                        <span className="bg-slate-100 px-2 py-0.5 border border-slate-200 rounded text-slate-600 font-medium">
                          {eq.category}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-semibold text-slate-700 text-xs">{eq.size || 'Unique'}</td>
                      <td className="px-6 py-4 text-slate-500 text-xs">{eq.location || '-'}</td>
                      <td className="px-6 py-4 font-semibold text-slate-700">{eq.totalQuantity}</td>
                      <td className="px-6 py-4 text-indigo-600 font-semibold">{eq.allocatedQuantity}</td>
                      <td className="px-6 py-4 font-extrabold text-slate-800">{eq.availableQuantity}</td>
                      <td className="px-6 py-4">
                        {isExhausted ? (
                          <span className="bg-rose-100 text-rose-800 border border-rose-200 text-[10px] font-black px-2 py-0.5 rounded">
                            Épuisé
                          </span>
                        ) : isLow ? (
                          <span className="bg-amber-100 text-amber-800 border border-amber-200 text-[10px] font-black px-2 py-0.5 rounded">
                            Faible
                          </span>
                        ) : (
                          <span className="bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-black px-2 py-0.5 rounded">
                            Correct
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => {
                              setActiveEquipment(eq);
                              setShowLogsModal(true);
                            }}
                            className="text-slate-400 hover:text-slate-600 p-1.5 rounded hover:bg-slate-100 cursor-pointer"
                            title="Historique d'attribution"
                          >
                            <Info className="w-4 h-4" />
                          </button>

                          {canManage && (
                            <>
                              <button
                                onClick={() => handleAssignClick(eq)}
                                className="text-indigo-600 hover:text-indigo-800 p-1.5 rounded hover:bg-indigo-50 font-extrabold text-xs cursor-pointer"
                                title="Distribuer / Retourner"
                              >
                                <ArrowLeftRight className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleEditClick(eq)}
                                className="text-slate-400 hover:text-slate-700 p-1.5 rounded hover:bg-slate-100 cursor-pointer"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteEquipment(eq.id)}
                                className="text-rose-500 hover:text-rose-700 p-1.5 rounded hover:bg-rose-50 cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 1. Modal: Create / Edit Equipment */}
      {showFormModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xl max-w-lg w-full overflow-hidden">
            <div className="bg-slate-900 px-6 py-4 flex items-center justify-between text-white">
              <h3 className="font-extrabold text-base flex items-center gap-2">
                <Shirt className="w-5 h-5 text-emerald-400" />
                {editingEquipment ? 'Modifier le matériel' : 'Ajouter un équipement'}
              </h3>
              <button 
                onClick={() => setShowFormModal(false)}
                className="text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="p-6 space-y-4">
              {formError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3.5 rounded-xl text-xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Nom de l'équipement *</label>
                <input
                  type="text"
                  placeholder="ex: Ballons Select taille 5, Maillots Adidas Rouge..."
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Catégorie</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 cursor-pointer"
                  >
                    {categories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Taille / Dimension</label>
                  <input
                    type="text"
                    placeholder="ex: S, M, L, Unique, T5..."
                    value={formData.size}
                    onChange={(e) => setFormData({ ...formData, size: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Quantité Totale *</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={formData.totalQuantity}
                    onChange={(e) => setFormData({ ...formData, totalQuantity: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Dont Attribué(s) *</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={formData.allocatedQuantity}
                    onChange={(e) => setFormData({ ...formData, allocatedQuantity: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Lieu de Stockage</label>
                <input
                  type="text"
                  placeholder="ex: Local matériel, Armoire A haut..."
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Description / Commentaires</label>
                <textarea
                  placeholder="Précisions sur l'état, marque ou utilisation..."
                  rows={2}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 resize-none"
                />
              </div>

              <div className="flex items-center justify-between pt-4 gap-3 bg-slate-50 -mx-6 -my-6 p-6 border-t border-slate-100">
                <span className="text-[11px] text-slate-400">
                  Stock disponible calculé : <strong className="text-slate-600 font-bold">{formData.totalQuantity - formData.allocatedQuantity}</strong> u.
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowFormModal(false)}
                    className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold text-xs px-4 py-2.5 rounded-xl cursor-pointer"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow cursor-pointer flex items-center gap-1.5"
                  >
                    {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                    Enregistrer
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Modal: Assign / Retrieve Equipment */}
      {showAssignModal && activeEquipment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xl max-w-lg w-full overflow-hidden">
            <div className="bg-slate-900 px-6 py-4 flex items-center justify-between text-white">
              <h3 className="font-extrabold text-base flex items-center gap-2">
                <ArrowLeftRight className="w-5 h-5 text-emerald-400" />
                Distribution / Retour : {activeEquipment.name}
              </h3>
              <button 
                onClick={() => setShowAssignModal(false)}
                className="text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAssignSubmit} className="p-6 space-y-4">
              {formError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3.5 rounded-xl text-xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Status Alert Info */}
              <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl flex items-center justify-between text-xs text-slate-600">
                <span>Stock dispo : <strong className="text-slate-800 font-black">{activeEquipment.availableQuantity}</strong></span>
                <span>Déjà distribué : <strong className="text-indigo-600 font-black">{activeEquipment.allocatedQuantity}</strong></span>
                <span>Total : <strong className="text-slate-800 font-bold">{activeEquipment.totalQuantity}</strong></span>
              </div>

              {/* Transaction Type */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Type de transaction</label>
                <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setAssignData({ ...assignData, type: 'allocation' })}
                    className={`py-2 text-xs font-bold rounded-lg transition cursor-pointer ${
                      assignData.type === 'allocation' 
                        ? 'bg-white text-emerald-800 shadow-sm border border-emerald-50' 
                        : 'text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    Distribuer à un membre
                  </button>
                  <button
                    type="button"
                    onClick={() => setAssignData({ ...assignData, type: 'return' })}
                    className={`py-2 text-xs font-bold rounded-lg transition cursor-pointer ${
                      assignData.type === 'return' 
                        ? 'bg-white text-indigo-800 shadow-sm border border-indigo-50' 
                        : 'text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    Retour du matériel
                  </button>
                </div>
              </div>

              {/* Member Selector */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Adhérent / Bénévole / Joueur *</label>
                <select
                  required
                  value={assignData.memberId}
                  onChange={(e) => setAssignData({ ...assignData, memberId: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 cursor-pointer"
                >
                  <option value="">-- Sélectionner un membre --</option>
                  {members.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.lastName.toUpperCase()} {m.firstName} ({m.role === 'player' ? 'Joueur' : m.role === 'coach' ? 'Coach' : 'Staff'})
                    </option>
                  ))}
                </select>
              </div>

              {/* Quantity */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Quantité *</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={assignData.quantity}
                  onChange={(e) => setAssignData({ ...assignData, quantity: parseInt(e.target.value) || 1 })}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              {/* Notes */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Notes complémentaires</label>
                <input
                  type="text"
                  placeholder="ex: Attribué pour la saison, prêt exceptionnel, retour abîmé..."
                  value={assignData.notes}
                  onChange={(e) => setAssignData({ ...assignData, notes: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAssignModal(false)}
                  className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold text-xs px-4 py-2.5 rounded-xl cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow cursor-pointer flex items-center gap-1.5"
                >
                  {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  Valider
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. Modal: History Logs of allocations */}
      {showLogsModal && activeEquipment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xl max-w-2xl w-full overflow-hidden">
            <div className="bg-slate-900 px-6 py-4 flex items-center justify-between text-white">
              <h3 className="font-extrabold text-base flex items-center gap-2">
                <Info className="w-5 h-5 text-emerald-400" />
                Historique des mouvements : {activeEquipment.name}
              </h3>
              <button 
                onClick={() => setShowLogsModal(false)}
                className="text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="flex justify-between items-center bg-slate-50 border border-slate-200 p-4 rounded-xl text-xs">
                <div>
                  <span className="text-slate-400 block font-bold uppercase">Catégorie</span>
                  <span className="font-extrabold text-slate-800">{activeEquipment.category}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-bold uppercase">Taille</span>
                  <span className="font-extrabold text-slate-800">{activeEquipment.size || 'Unique'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-bold uppercase">Stock Interne</span>
                  <span className="font-extrabold text-emerald-600">{activeEquipment.availableQuantity} dispo</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-bold uppercase">Distribué</span>
                  <span className="font-extrabold text-indigo-600">{activeEquipment.allocatedQuantity} u.</span>
                </div>
              </div>

              <h4 className="font-extrabold text-slate-800 text-sm">Registre des distributions</h4>

              {logsLoading ? (
                <div className="text-center py-12 text-slate-400 text-xs">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-500" />
                  Chargement de l'historique...
                </div>
              ) : logs.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-slate-200 rounded-2xl text-slate-400 text-xs">
                  Aucun mouvement enregistré pour cet équipement.
                </div>
              ) : (
                <div className="max-h-[300px] overflow-y-auto space-y-2.5 pr-2">
                  {logs.map(log => (
                    <div 
                      key={log.id} 
                      className={`p-3.5 rounded-xl border flex items-center justify-between text-xs transition ${
                        log.type === 'allocation' 
                          ? 'bg-emerald-50/20 border-emerald-100' 
                          : 'bg-indigo-50/20 border-indigo-100'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded font-black text-[10px] uppercase ${
                            log.type === 'allocation' 
                              ? 'bg-emerald-100 text-emerald-800' 
                              : 'bg-indigo-100 text-indigo-800'
                          }`}>
                            {log.type === 'allocation' ? 'Attribué' : 'Retourné'}
                          </span>
                          <span className="font-bold text-slate-800">{log.memberName}</span>
                        </div>
                        {log.notes && (
                          <p className="text-slate-500 leading-tight italic bg-white/50 p-1.5 rounded border border-slate-100 mt-1">
                            &ldquo;{log.notes}&rdquo;
                          </p>
                        )}
                        <span className="text-[10px] text-slate-400 block">
                          Le {new Date(log.date).toLocaleString('fr-FR')}
                        </span>
                      </div>
                      
                      <div className="text-right">
                        <span className={`text-base font-black ${
                          log.type === 'allocation' ? 'text-emerald-700' : 'text-indigo-700'
                        }`}>
                          {log.type === 'allocation' ? '-' : '+'}{log.quantity} u.
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-end pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowLogsModal(false)}
                  className="bg-slate-900 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow cursor-pointer hover:bg-slate-850"
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
