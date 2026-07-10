export interface Club {
  id: string;
  name: string;
  sport: string;
  logoUrl?: string;
  address?: string;
  createdBy: string;
  createdAt: string;
}

export interface Member {
  id: string;
  clubId: string;
  firstName: string;
  lastName: string;
  role: 'player' | 'coach' | 'admin';
  email: string;
  phone?: string;
  licenseNumber?: string;
  birthDate?: string;
  membershipPaid?: boolean;
  membershipAmount?: number;
  createdAt: string;
  photoUrl?: string;
  equipmentSize?: string; // e.g. XS, S, M, L, XL, XXL
  medicalCertStatus?: 'valid' | 'renew' | 'missing';
  medicalCertFile?: { name: string; size: number; base64: string; uploadedAt: string };
  registrationFormStatus?: 'valid' | 'renew' | 'missing';
  registrationFormFile?: { name: string; size: number; base64: string; uploadedAt: string };
  parentalAuthStatus?: 'valid' | 'renew' | 'missing';
  parentalAuthFile?: { name: string; size: number; base64: string; uploadedAt: string };
}

export interface Team {
  id: string;
  clubId: string;
  name: string;
  category: string;
  coachId?: string;
  createdAt: string;
}

export interface Event {
  id: string;
  clubId: string;
  teamId: string;
  title: string;
  type: 'training' | 'match' | 'tournament' | 'other';
  start: string; // ISO string
  end: string;   // ISO string
  location?: string;
  opponent?: string;
  convocationStatus: 'draft' | 'sent' | 'closed';
  scoreHome?: number;
  scoreAway?: number;
  details?: string;
  createdAt: string;
}

export interface Convocation {
  id: string; // eventId + "_" + memberId
  eventId: string;
  memberId: string;
  status: 'pending' | 'confirmed' | 'declined' | 'absent' | 'present';
  role?: 'player' | 'substitute';
  updatedAt: string;
}

export interface Payment {
  id: string;
  clubId: string;
  memberId: string;
  amount: number;
  status: 'paid' | 'pending' | 'failed';
  paymentMethod?: 'card' | 'cash' | 'check' | 'bank_transfer';
  description?: string;
  date: string;
}

export interface Expense {
  id: string;
  clubId: string;
  title: string;
  amount: number;
  category: 'equipment' | 'transport' | 'referee' | 'other';
  description?: string;
  date: string;
}

export interface Message {
  id: string;
  clubId: string;
  teamId?: string;
  senderId: string;
  senderName: string;
  content: string;
  type: 'announcement' | 'message';
  createdAt: string;
}

export interface PlayerMatchStat {
  id: string; // eventId_memberId
  clubId: string;
  eventId: string;
  memberId: string;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  rating: number; // e.g. 1 to 10, or 0 if unrated
  comment?: string;
}

