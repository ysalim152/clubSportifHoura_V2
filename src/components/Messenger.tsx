import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { 
  MessageSquare, Send, Bell, Filter, Users, ShieldAlert, Sparkles, X, Heart, Smile 
} from 'lucide-react';
import { collection, doc, setDoc, query, orderBy, onSnapshot, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, auth, sanitizeData } from '../firebase';
import { Club, Message, Team } from '../types';

interface MessengerProps {
  club: Club;
  teams: Team[];
}

export default function Messenger({ club, teams }: MessengerProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [content, setContent] = useState('');
  const [type, setType] = useState<'announcement' | 'message'>('message');
  const [teamId, setTeamId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setIsLoading(true);
    // Realtime listener for active messenger boards
    const q = query(
      collection(db, 'clubs', club.id, 'messages'),
      orderBy('createdAt', 'asc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: Message[] = [];
      snapshot.forEach(doc => {
        list.push({ id: doc.id, ...doc.data() } as Message);
      });
      setMessages(list);
      setIsLoading(false);
      
      // Scroll to bottom
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, `clubs/${club.id}/messages`);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [club.id]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    const user = auth.currentUser;
    if (!user) return;

    setError(null);
    try {
      const messageId = 'msg_' + Math.random().toString(36).substring(2, 11);
      const path = `clubs/${club.id}/messages/${messageId}`;

      const newMessage: Message = {
        id: messageId,
        clubId: club.id,
        teamId: teamId || undefined,
        senderId: user.uid,
        senderName: user.displayName || user.email?.split('@')[0] || 'Anonyme',
        content: content.trim(),
        type,
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'clubs', club.id, 'messages', messageId), sanitizeData(newMessage)).catch(err => {
        handleFirestoreError(err, OperationType.WRITE, path);
        throw err;
      });

      setContent('');
    } catch (err: any) {
      setError("Erreur d'envoi : " + err.message);
    }
  };

  return (
    <div id="messenger-layout" className="grid grid-cols-1 lg:grid-cols-4 gap-8 min-h-[500px]">
      {/* Side Filters & Info Panel */}
      <div className="space-y-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
          <div>
            <h4 className="font-bold text-slate-900 text-base">Salons & Annonces</h4>
            <p className="text-xs text-slate-400">Canaux de communication du club.</p>
          </div>

          <div className="space-y-2">
            <button
              onClick={() => setTeamId('')}
              className={`w-full flex items-center justify-between text-xs font-bold p-3 rounded-xl border text-left cursor-pointer transition ${
                teamId === '' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-600 border-slate-100 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-emerald-600" />
                <span>Général Club (Tous)</span>
              </div>
            </button>

            {teams.map(team => (
              <button
                key={team.id}
                onClick={() => setTeamId(team.id)}
                className={`w-full flex items-center justify-between text-xs font-bold p-3 rounded-xl border text-left cursor-pointer transition ${
                  teamId === team.id ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-600 border-slate-100 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-slate-400" />
                  <span>{team.name}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-emerald-950 text-emerald-200 rounded-2xl p-5 space-y-3">
          <Sparkles className="w-6 h-6 text-emerald-400 animate-pulse" />
          <h5 className="font-bold text-white text-sm">Communication Active</h5>
          <p className="text-xs leading-relaxed text-emerald-300">
            Publiez des annonces officielles pour relancer les licences, convoquer vos licenciés, ou planifier des covoiturages pour le week-end !
          </p>
        </div>
      </div>

      {/* Main Bulletin Board Feed */}
      <div className="lg:col-span-3 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col h-[550px]">
        {/* Board Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 rounded-t-2xl">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-emerald-600" />
            <div>
              <h4 className="font-bold text-slate-900 text-sm">
                {teamId === '' ? 'Canal Général' : `Canal ${teams.find(t => t.id === teamId)?.name || 'Équipe'}`}
              </h4>
              <p className="text-[10px] text-slate-400 font-semibold">Diffusion en temps réel</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping"></span>
            <span className="text-[10px] text-slate-500 font-bold uppercase">Connecté</span>
          </div>
        </div>

        {/* Message Feed Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {isLoading ? (
            <div className="h-full flex items-center justify-center">
              <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs space-y-2">
              <Smile className="w-8 h-8 text-slate-300" />
              <p>Aucun message n'a encore été publié dans ce canal.</p>
              <p className="text-[10px] text-slate-400 font-normal">Soyez le premier à envoyer un message !</p>
            </div>
          ) : (
            messages
              .filter(msg => !teamId || msg.teamId === teamId)
              .map(msg => {
                const isCurrentUser = msg.senderId === auth.currentUser?.uid;
                const isAnnouncement = msg.type === 'announcement';

                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isCurrentUser ? 'items-end' : 'items-start'} space-y-1`}
                  >
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-bold px-1">
                      <span>{msg.senderName}</span>
                      <span>·</span>
                      <span>
                        {new Date(msg.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <div
                      className={`max-w-xl px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                        isAnnouncement ? 'bg-amber-50 text-amber-900 border border-amber-200' :
                        isCurrentUser ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-800'
                      }`}
                    >
                      {isAnnouncement && (
                        <div className="text-[10px] font-extrabold text-amber-700 uppercase tracking-wider mb-1 flex items-center gap-1">
                          <Bell className="w-3.5 h-3.5" />
                          Annonce Officielle
                        </div>
                      )}
                      <p>{msg.content}</p>
                    </div>
                  </div>
                );
              })
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input Form Box */}
        <div className="p-4 border-t border-slate-100">
          {error && (
            <div className="p-2.5 mb-2 bg-red-50 text-red-700 text-xs rounded-xl flex items-center justify-between">
              <span>{error}</span>
              <button onClick={() => setError(null)}><X className="w-4 h-4" /></button>
            </div>
          )}

          <form onSubmit={handleSendMessage} className="space-y-3">
            <div className="flex items-center gap-4 text-xs font-semibold">
              <label className="flex items-center gap-1.5 cursor-pointer text-slate-500">
                <input
                  type="radio"
                  name="msgType"
                  checked={type === 'message'}
                  onChange={() => setType('message')}
                  className="accent-emerald-600"
                />
                <span>Message standard</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-slate-500">
                <input
                  type="radio"
                  name="msgType"
                  checked={type === 'announcement'}
                  onChange={() => setType('announcement')}
                  className="accent-emerald-600"
                />
                <span className="text-amber-600">⚠️ Annonce officielle</span>
              </label>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Rédigez votre message pour le club..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="flex-1 px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-600 text-sm bg-slate-50"
              />
              <button
                type="submit"
                className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl px-5 flex items-center justify-center transition shadow cursor-pointer"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
