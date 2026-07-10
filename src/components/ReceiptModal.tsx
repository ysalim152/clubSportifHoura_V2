import React from 'react';
import { X, Printer, Download, Receipt, ShieldCheck, FileText } from 'lucide-react';
import { Payment, Member, Club } from '../types';

interface ReceiptModalProps {
  payment: Payment;
  member: Member;
  club: Club;
  onClose: () => void;
}

export default function ReceiptModal({ payment, member, club, onClose }: ReceiptModalProps) {
  const receiptNumber = `RE-${new Date(payment.date).getFullYear()}-${payment.id.substring(4).toUpperCase()}`;
  
  const handlePrint = () => {
    // Dynamically inject print style to hide everything else in the application
    const printStyles = document.createElement('style');
    printStyles.id = 'print-receipt-styles';
    printStyles.innerHTML = `
      @media print {
        body {
          background-color: white !important;
          color: black !important;
        }
        body * {
          visibility: hidden !important;
        }
        #printable-receipt, #printable-receipt * {
          visibility: visible !important;
        }
        #printable-receipt {
          position: absolute !important;
          left: 0 !important;
          top: 0 !important;
          width: 100% !important;
          max-width: 100% !important;
          border: none !important;
          box-shadow: none !important;
          padding: 20px !important;
          margin: 0 !important;
        }
      }
    `;
    document.head.appendChild(printStyles);
    window.print();
    // Clean up style tag after printing
    const styleEl = document.getElementById('print-receipt-styles');
    if (styleEl) {
      document.head.removeChild(styleEl);
    }
  };

  const formattedDate = new Date(payment.date).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  const todayFormatted = new Date().toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  const paymentMethodLabel = {
    card: '💳 Carte Bancaire',
    bank_transfer: '🏦 Virement',
    cash: '💵 Espèces',
    check: '✍️ Chèque'
  }[payment.paymentMethod || 'card'] || 'Non spécifié';

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-xl overflow-hidden border border-slate-100 flex flex-col my-8">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-150 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-emerald-600" />
            <span className="font-bold text-slate-800 text-sm">Génération de Reçu / Attestation</span>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-400 hover:text-slate-600 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Actions Bar */}
        <div className="px-6 py-3 bg-emerald-50/50 border-b border-emerald-100 flex flex-wrap justify-between items-center gap-3 shrink-0">
          <p className="text-xs text-emerald-800 font-medium flex items-center gap-1">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Document certifié conforme pour l'adhérent (justificatif CE / Mutuelle).</span>
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-3.5 py-2 rounded-xl shadow-sm flex items-center gap-1.5 transition cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimer ou PDF</span>
            </button>
          </div>
        </div>

        {/* Receipt Document Container */}
        <div className="p-8 bg-slate-100 flex-1 overflow-y-auto flex justify-center">
          {/* Printable Area */}
          <div 
            id="printable-receipt"
            className="bg-white w-full max-w-xl p-8 shadow-sm rounded-lg border border-slate-200 font-sans text-slate-800 space-y-8"
          >
            {/* Header of Receipt */}
            <div className="flex justify-between items-start border-b border-slate-150 pb-6">
              <div>
                <h1 className="font-black text-xl text-slate-900 tracking-tight uppercase">{club.name}</h1>
                <p className="text-xs text-slate-500 font-medium mt-0.5">Association Sportive de {club.sport}</p>
                {club.address && (
                  <p className="text-[10px] text-slate-400 mt-1 max-w-xs">{club.address}</p>
                )}
              </div>
              <div className="text-right">
                <span className="inline-block bg-slate-100 border border-slate-200 text-slate-600 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">
                  Justificatif de Paiement
                </span>
                <p className="text-xs font-bold text-slate-900 mt-3">Réf: {receiptNumber}</p>
                <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Date : {formattedDate}</p>
              </div>
            </div>

            {/* Main Certificate Title */}
            <div className="text-center space-y-2 py-2">
              <h2 className="text-lg font-extrabold text-slate-950 tracking-wider uppercase">
                ATTESTATION DE PAIEMENT
              </h2>
              <div className="w-12 h-1 bg-emerald-500 mx-auto rounded-full"></div>
            </div>

            {/* Certificate Body Text */}
            <div className="text-sm leading-relaxed text-slate-700 space-y-4 font-normal">
              <p>
                Je soussigné, représentant légal du club <strong>{club.name}</strong>, certifie par la présente que :
              </p>
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-2">
                <p className="grid grid-cols-3 text-xs">
                  <span className="text-slate-400 font-bold uppercase">Adhérent :</span>
                  <span className="col-span-2 text-slate-900 font-bold">{member.firstName} {member.lastName}</span>
                </p>
                {member.birthDate && (
                  <p className="grid grid-cols-3 text-xs">
                    <span className="text-slate-400 font-bold uppercase">Né(e) le :</span>
                    <span className="col-span-2 text-slate-900 font-bold">
                      {new Date(member.birthDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </span>
                  </p>
                )}
                {member.licenseNumber && (
                  <p className="grid grid-cols-3 text-xs">
                    <span className="text-slate-400 font-bold uppercase">N° de Licence :</span>
                    <span className="col-span-2 text-slate-900 font-mono font-bold text-xs">{member.licenseNumber}</span>
                  </p>
                )}
                <p className="grid grid-cols-3 text-xs">
                  <span className="text-slate-400 font-bold uppercase">Email :</span>
                  <span className="col-span-2 text-slate-900 font-bold">{member.email}</span>
                </p>
              </div>
              <p>
                A réglé la somme de <strong>{payment.amount} €</strong> (en toutes lettres : <em>{payment.amount} Euros</em>) au titre de son adhésion annuelle et de sa cotisation de licence pour la saison en cours.
              </p>
            </div>

            {/* Details Table */}
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase">
                    <th className="px-4 py-2.5">Désignation</th>
                    <th className="px-4 py-2.5">Mode de règlement</th>
                    <th className="px-4 py-2.5 text-right">Montant</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150 text-slate-700">
                  <tr>
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      {payment.description || "Cotisation sportive annuelle"}
                    </td>
                    <td className="px-4 py-3 text-slate-500 font-medium">
                      {paymentMethodLabel}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900">
                      {payment.amount.toFixed(2)} €
                    </td>
                  </tr>
                  <tr className="bg-slate-50 font-bold text-slate-900">
                    <td colSpan={2} className="px-4 py-2.5 text-right uppercase">Net perçu :</td>
                    <td className="px-4 py-2.5 text-right text-emerald-600 font-black text-sm">{payment.amount.toFixed(2)} €</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Signature Area */}
            <div className="pt-4 flex justify-between items-end">
              <div className="text-xs text-slate-400">
                <p>Document généré électroniquement par HouraSports.</p>
                <p className="mt-1">ID Validation : {payment.id}</p>
              </div>
              <div className="text-right space-y-1">
                <p className="text-[11px] text-slate-500 font-semibold">Fait à {club.address ? club.address.split(',')[0] : "le siège de l'association"},</p>
                <p className="text-[11px] text-slate-500 font-semibold">Le {todayFormatted}</p>
                <p className="text-xs font-bold text-slate-900 pt-2">Pour le Bureau,</p>
                <div className="pt-2 flex justify-end">
                  <div className="border border-dashed border-emerald-300 bg-emerald-50/50 rounded p-2 text-center inline-flex flex-col items-center justify-center w-28">
                    <span className="text-[7px] text-emerald-600 font-bold uppercase tracking-wider">Signature club</span>
                    <span className="text-[9px] text-emerald-700 font-extrabold mt-0.5">{club.name}</span>
                    <div className="w-12 h-0.5 bg-emerald-300 my-1"></div>
                    <span className="text-[6px] text-slate-400 font-semibold">Attestation acquittée</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-150 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-slate-200 bg-white rounded-lg text-slate-600 text-xs hover:bg-slate-50 font-bold transition cursor-pointer"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
