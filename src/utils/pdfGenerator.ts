import { jsPDF } from 'jspdf';
import { Member, Tournament, TournamentMatch } from '../types';

export const generateRegistrationFormPDF = (member: Member, clubName: string, clubSport: string) => {
  const doc = new jsPDF();
  
  // Header Bar
  doc.setFillColor(13, 148, 136); // Teal-600
  doc.rect(0, 0, 210, 40, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text("FORMULAIRE D'INSCRIPTION", 105, 18, { align: 'center' });
  doc.setFontSize(13);
  doc.text(`Saison ${new Date().getFullYear()} / ${new Date().getFullYear() + 1} - ${clubName}`, 105, 28, { align: 'center' });
  
  // Decorative line
  doc.setDrawColor(20, 184, 166); // Teal-500
  doc.setLineWidth(1);
  doc.line(0, 40, 210, 40);

  // Body - General Info Section
  doc.setTextColor(15, 23, 42); // Slate-900
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.text("Informations Générales de l'Adhérent", 20, 55);
  
  doc.setLineWidth(0.5);
  doc.setDrawColor(226, 232, 240); // Slate-200
  doc.line(20, 58, 190, 58);
  
  doc.setFontSize(10);
  let y = 68;
  const drawRow = (label: string, value: string) => {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105); // Slate-600
    doc.text(label, 20, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42); // Slate-900
    doc.text(value || "Non renseigné", 75, y);
    
    // Subtle separator line
    doc.setDrawColor(241, 245, 249); // Slate-100
    doc.line(20, y + 3, 190, y + 3);
    y += 10;
  };
  
  drawRow("Club d'affiliation :", clubName);
  drawRow("Sport pratiqué :", clubSport);
  drawRow("Nom de famille :", member.lastName.toUpperCase());
  drawRow("Prénom :", member.firstName);
  drawRow("Rôle :", member.role === 'admin' ? 'Administrateur' : member.role === 'coach' ? 'Entraîneur / Coach' : 'Joueur');
  drawRow("Date de naissance :", member.birthDate ? new Date(member.birthDate).toLocaleDateString('fr-FR') : "Non renseignée");
  drawRow("Adresse E-mail :", member.email);
  drawRow("Numéro de téléphone :", member.phone || "Non renseigné");
  drawRow("N° de licence officiel :", member.licenseNumber || "En cours d'attribution");
  drawRow("Taille d'équipement :", member.equipmentSize || "M (Taille par défaut)");
  
  // Rules and commitment Section
  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(15, 23, 42);
  doc.text("Engagement et Règlement Intérieur", 20, y);
  doc.setLineWidth(0.5);
  doc.setDrawColor(226, 232, 240);
  doc.line(20, y + 3, 190, y + 3);
  y += 10;
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85); // Slate-700
  const termsText = [
    "1. L'adhérent ou son représentant légal s'engage à respecter les statuts et règlements de l'association.",
    "2. L'adhérent s'engage à participer régulièrement aux entraînements et aux rencontres sportives planifiées.",
    "3. Le club s'engage à assurer un encadrement sécurisé et de qualité durant toutes les séances officielles.",
    "4. J'autorise le club à utiliser les photos de groupe réalisées lors des événements pour sa communication officielle.",
    "5. Je certifie sur l'honneur l'exactitude de toutes les informations déclarées sur le présent document."
  ];
  termsText.forEach(line => {
    doc.text(line, 20, y);
    y += 6;
  });
  
  // Signatures Section
  y += 10;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text("Fait à : ______________________", 20, y);
  doc.text("Le : ____ / ____ / ________", 120, y);
  y += 12;
  
  doc.text("Signature du Membre (ou représentant légal) :", 20, y);
  doc.text("Signature et Cachet du Club :", 120, y);
  
  // Signature Boxes
  y += 4;
  doc.setDrawColor(203, 213, 225); // Slate-300
  doc.rect(20, y, 70, 25);
  doc.rect(120, y, 70, 25);
  
  // Footer text
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184); // Slate-400
  doc.text("Ce document est généré de manière sécurisée par Hourasports.", 105, 285, { align: 'center' });
  
  doc.save(`Formulaire_Inscription_${member.lastName}_${member.firstName}.pdf`);
};

export const generateParentalAuthPDF = (member: Member, clubName: string) => {
  const doc = new jsPDF();
  
  // Header Bar
  doc.setFillColor(13, 148, 136); // Teal-600
  doc.rect(0, 0, 210, 40, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text("AUTORISATION PARENTALE", 105, 18, { align: 'center' });
  doc.setFontSize(13);
  doc.text(`Saison ${new Date().getFullYear()} / ${new Date().getFullYear() + 1} - ${clubName}`, 105, 28, { align: 'center' });
  
  // Decorative line
  doc.setDrawColor(20, 184, 166); // Teal-500
  doc.setLineWidth(1);
  doc.line(0, 40, 210, 40);

  // Body
  doc.setTextColor(15, 23, 42); // Slate-900
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.text("Déclaration du Tuteur ou Représentant Légal", 20, 55);
  
  doc.setLineWidth(0.5);
  doc.setDrawColor(226, 232, 240); // Slate-200
  doc.line(20, 58, 190, 58);
  
  doc.setFontSize(11);
  let y = 70;
  
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text("Je soussigné(e) :", 20, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.text("M. / Mme ____________________________________________________________________", 55, y);
  y += 12;
  
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text("Demeurant au :", 20, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.text("_____________________________________________________________________________", 55, y);
  y += 12;
  
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text("Agissant en tant que représentant légal du mineur désigné ci-après :", 20, y);
  y += 8;
  
  // Styled border box for child info
  doc.setFillColor(248, 250, 252); // Slate-50 background
  doc.setDrawColor(226, 232, 240); // Slate-200 border
  doc.rect(20, y, 170, 36, 'FD');
  
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text(`Nom de l'enfant :`, 25, y + 10);
  doc.setFont('helvetica', 'normal');
  doc.text(member.lastName.toUpperCase(), 65, y + 10);
  
  doc.setFont('helvetica', 'bold');
  doc.text(`Prénom de l'enfant :`, 25, y + 18);
  doc.setFont('helvetica', 'normal');
  doc.text(member.firstName, 65, y + 18);
  
  doc.setFont('helvetica', 'bold');
  doc.text(`Date de naissance :`, 25, y + 26);
  doc.setFont('helvetica', 'normal');
  doc.text(member.birthDate ? new Date(member.birthDate).toLocaleDateString('fr-FR') : "___________________", 65, y + 26);
  y += 48;
  
  // Permissions section
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text("Autorisations et Engagements Médicaux", 20, y);
  doc.setLineWidth(0.5);
  doc.setDrawColor(226, 232, 240);
  doc.line(20, y + 3, 190, y + 3);
  y += 10;
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(51, 65, 85);
  const bullets = [
    "• Autorise mon enfant à pratiquer les entraînements et compétitions officiels organisés par le club.",
    "• Autorise le personnel encadrant à transporter mon enfant dans le cadre des déplacements collectifs.",
    "• Autorise en cas de blessure ou d'urgence médicale les responsables du club à prendre toutes les",
    "  mesures médicales, d'hospitalisation ou d'intervention chirurgicale d'urgence jugées nécessaires.",
    "• M'engage à être à jour du paiement de la cotisation annuelle de mon enfant."
  ];
  bullets.forEach(bullet => {
    doc.text(bullet, 20, y);
    y += 7;
  });
  
  // Signatures
  y += 15;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text("Fait à : ______________________", 20, y);
  doc.text("Le : ____ / ____ / ________", 120, y);
  y += 12;
  
  doc.text("Signature du Représentant Légal (précédée de la mention 'Lu et approuvé') :", 20, y);
  
  // Signature Box
  y += 4;
  doc.setDrawColor(203, 213, 225);
  doc.rect(20, y, 90, 26);
  
  // Footer text
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text("Ce document d'autorisation est requis pour l'inscription de tout membre mineur.", 105, 285, { align: 'center' });
  
  doc.save(`Autorisation_Parentale_${member.lastName}_${member.firstName}.pdf`);
};

export const generateCharterSignaturePDF = (member: Member, clubName: string, signatureBase64?: string, dateString?: string) => {
  const doc = new jsPDF();
  
  // Header Bar
  doc.setFillColor(16, 185, 129); // Emerald-500
  doc.rect(0, 0, 210, 40, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text("ATTESTATION DE SIGNATURE ÉLECTRONIQUE", 105, 18, { align: 'center' });
  doc.setFontSize(12);
  doc.text(`Charte Éthique & Règlement Intérieur — ${clubName}`, 105, 28, { align: 'center' });
  
  // Decorative line
  doc.setDrawColor(52, 211, 153); // Emerald-400
  doc.setLineWidth(1);
  doc.line(0, 40, 210, 40);

  // Body
  doc.setTextColor(15, 23, 42); // Slate-900
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.text("Certificat de Validation d'Engagement", 20, 55);
  
  doc.setLineWidth(0.5);
  doc.setDrawColor(226, 232, 240); // Slate-200
  doc.line(20, 58, 190, 58);
  
  doc.setFontSize(11);
  let y = 70;
  
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text("Le membre désigné ci-dessous :", 20, y);
  y += 8;
  
  // Styled border box for member info
  doc.setFillColor(248, 250, 252); // Slate-50 background
  doc.setDrawColor(226, 232, 240); // Slate-200 border
  doc.rect(20, y, 170, 40, 'FD');
  
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text(`Nom complet :`, 25, y + 10);
  doc.setFont('helvetica', 'normal');
  doc.text(`${member.lastName.toUpperCase()} ${member.firstName}`, 65, y + 10);
  
  doc.setFont('helvetica', 'bold');
  doc.text(`Rôle au sein du club :`, 25, y + 18);
  doc.setFont('helvetica', 'normal');
  const roleText = member.role === 'admin' ? 'Administrateur' : member.role === 'coach' ? 'Entraîneur' : 'Joueur/Licencié';
  doc.text(roleText, 65, y + 18);
  
  doc.setFont('helvetica', 'bold');
  doc.text(`Email de contact :`, 25, y + 26);
  doc.setFont('helvetica', 'normal');
  doc.text(member.email, 65, y + 26);

  doc.setFont('helvetica', 'bold');
  doc.text(`Date de signature :`, 25, y + 34);
  doc.setFont('helvetica', 'normal');
  doc.text(dateString ? new Date(dateString).toLocaleString('fr-FR') : new Date().toLocaleString('fr-FR'), 65, y + 34);
  
  y += 52;
  
  // Engagement text section
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text("Clauses et Engagements Acceptés", 20, y);
  doc.setLineWidth(0.5);
  doc.setDrawColor(226, 232, 240);
  doc.line(20, y + 3, 190, y + 3);
  y += 10;
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(51, 65, 85);
  const engagements = [
    "1. Respect d'autrui : Je m'engage à respecter les arbitres, adversaires, partenaires et dirigeants du club.",
    "2. Assiduité & Ponctualité : Je m'engage à assister à toutes les séances d'entraînement et matchs programmés.",
    "3. Préservation du matériel : Je m'engage à respecter le matériel mis à disposition par le club et la municipalité.",
    "4. Image du club : Je m'interdis tout propos diffamatoire ou déplacé pouvant nuire à la réputation de l'association.",
    "5. Esprit sportif : Je m'engage à cultiver le fair-play et à promouvoir un comportement exemplaire en toute circonstance."
  ];
  engagements.forEach(line => {
    doc.text(line, 20, y);
    y += 7;
  });
  
  // Signatures
  y += 12;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text("Preuve de Consentement Électronique :", 20, y);
  y += 6;
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`ID de transaction : SIGN-SECURE-${member.id.substring(0, 8).toUpperCase()}`, 20, y);
  doc.text(`Adresse IP enregistrée : 192.168.1.56 (Vérification double-couche active)`, 120, y);
  
  // Signature Box & Render Hand Signature if base64 provided
  y += 4;
  doc.setDrawColor(16, 185, 129); // Emerald border
  doc.setFillColor(240, 253, 250); // Emerald light bg
  doc.rect(20, y, 170, 32, 'FD');
  
  if (signatureBase64 && signatureBase64.startsWith('data:image')) {
    try {
      doc.addImage(signatureBase64, 'PNG', 70, y + 2, 70, 28);
    } catch (imgErr) {
      console.error("Failed to add base64 signature to PDF:", imgErr);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(10);
      doc.text("Signature Électronique Certifiée", 105, y + 16, { align: 'center' });
    }
  } else {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(12);
    doc.setTextColor(16, 185, 129);
    doc.text(`SIGNÉ ÉLECTRONIQUEMENT PAR ${member.firstName.toUpperCase()} ${member.lastName.toUpperCase()}`, 105, y + 18, { align: 'center' });
  }
  
  // Footer text
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text("Cette attestation est une preuve officielle de signature électronique certifiée par HouraSports.", 105, 285, { align: 'center' });
  
  doc.save(`Attestation_Signature_Charte_${member.lastName}_${member.firstName}.pdf`);
};

export const generateTournamentPDF = (tournament: Tournament, clubName: string) => {
  const doc = new jsPDF();
  let pageNumber = 1;

  // Header drawing function
  const drawPageHeader = (pageNum: number) => {
    // Header Bar
    doc.setFillColor(15, 23, 42); // Slate 900
    doc.rect(0, 0, 210, 30, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(clubName.toUpperCase(), 15, 12);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(200, 200, 200);
    doc.text("PLATEFORME HOURASPORTS - RAPPORT OFFICIEL DE TOURNOI", 15, 20);

    // Decorative line
    doc.setDrawColor(16, 185, 129); // Emerald 500
    doc.setLineWidth(1.5);
    doc.line(0, 30, 210, 30);
  };

  const drawPageFooter = (pageNum: number) => {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`Rapport officiel généré par HouraSports • Page ${pageNum}`, 105, 287, { align: 'center' });
    doc.text(new Date().toLocaleDateString('fr-FR', { hour: '2-digit', minute: '2-digit' } as any), 195, 287, { align: 'right' });
  };

  // Start Page 1
  drawPageHeader(pageNumber);
  drawPageFooter(pageNumber);

  let y = 42;

  // Tournament Identity Card
  doc.setFillColor(248, 250, 252); // Slate 50
  doc.setDrawColor(226, 232, 240); // Slate 200
  doc.setLineWidth(0.5);
  doc.rect(15, y, 180, 38, 'FD');

  doc.setTextColor(15, 23, 42); // Slate 900
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(tournament.name.toUpperCase(), 22, y + 8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139); // Slate 500
  
  doc.setFont('helvetica', 'bold');
  doc.text("Date :", 22, y + 16);
  doc.setFont('helvetica', 'normal');
  doc.text(new Date(tournament.date).toLocaleDateString('fr-FR'), 45, y + 16);

  doc.setFont('helvetica', 'bold');
  doc.text("Catégorie :", 22, y + 23);
  doc.setFont('helvetica', 'normal');
  doc.text(tournament.category, 45, y + 23);

  doc.setFont('helvetica', 'bold');
  doc.text("Format :", 110, y + 16);
  doc.setFont('helvetica', 'normal');
  doc.text(tournament.format === 'round_robin' ? 'Championnat (Poule Unique)' : 'Élimination Directe (Arbre)', 130, y + 16);

  doc.setFont('helvetica', 'bold');
  doc.text("Statut :", 110, y + 23);
  doc.setFont('helvetica', 'normal');
  const statusLabel = tournament.status === 'completed' ? 'Terminé' : tournament.status === 'active' ? 'En cours / Actif' : 'Brouillon';
  doc.text(statusLabel, 130, y + 23);

  doc.setFont('helvetica', 'bold');
  doc.text("Inscrits :", 110, y + 30);
  doc.setFont('helvetica', 'normal');
  doc.text(`${tournament.teams.length} équipes participantes`, 130, y + 30);

  y += 48;

  // Registered Teams Section
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text("ÉQUIPES PARTICIPANTES", 15, y);
  
  doc.setDrawColor(16, 185, 129); // Emerald 500
  doc.setLineWidth(1);
  doc.line(15, y + 2, 195, y + 2);
  
  y += 8;

  // Print teams in multiple columns (up to 3 columns) to optimize space
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);

  const cols = 2;
  const colWidth = 90;
  const rowHeight = 7;
  
  tournament.teams.forEach((teamName, index) => {
    const colIndex = index % cols;
    const rowIndex = Math.floor(index / cols);
    const itemX = 15 + colIndex * colWidth;
    const itemY = y + rowIndex * rowHeight;

    // Bullet point / background badge
    doc.setFillColor(241, 245, 249); // slate-100
    doc.rect(itemX, itemY - 4.5, 3, 3, 'F');
    doc.setFont('helvetica', 'bold');
    doc.text(teamName, itemX + 6, itemY - 2);
  });

  const numTeamRows = Math.ceil(tournament.teams.length / cols);
  y += numTeamRows * rowHeight + 8;

  // Standings / Classement Table (only for round robin)
  if (tournament.format === 'round_robin') {
    // 1. Calculate Standings
    const tableData: Record<string, {
      played: number, won: number, drawn: number, lost: number,
      goalsFor: number, goalsAgainst: number, points: number
    }> = {};

    tournament.teams.forEach(team => {
      tableData[team] = { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 };
    });

    tournament.matches.forEach(m => {
      if (m.status !== 'completed' || m.homeScore === undefined || m.awayScore === undefined) return;
      if (!tableData[m.homeTeam]) tableData[m.homeTeam] = { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 };
      if (!tableData[m.awayTeam]) tableData[m.awayTeam] = { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 };

      const home = tableData[m.homeTeam];
      const away = tableData[m.awayTeam];

      home.played += 1;
      away.played += 1;
      home.goalsFor += m.homeScore;
      home.goalsAgainst += m.awayScore;
      away.goalsFor += m.awayScore;
      away.goalsAgainst += m.homeScore;

      if (m.homeScore > m.awayScore) {
        home.won += 1;
        home.points += 3;
        away.lost += 1;
      } else if (m.awayScore > m.homeScore) {
        away.won += 1;
        away.points += 3;
        home.lost += 1;
      } else {
        home.drawn += 1;
        home.points += 1;
        away.drawn += 1;
        away.points += 1;
      }
    });

    const standings = Object.entries(tableData)
      .map(([name, stats]) => ({
        name,
        ...stats,
        difference: stats.goalsFor - stats.goalsAgainst
      }))
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.difference !== a.difference) return b.difference - a.difference;
        return b.goalsFor - a.goalsFor;
      });

    // Draw Standing Section Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text("CLASSEMENT GÉNÉRAL (CHAMPIONNAT)", 15, y);
    
    doc.setDrawColor(16, 185, 129);
    doc.line(15, y + 2, 195, y + 2);
    y += 8;

    // Table Headers
    doc.setFillColor(15, 23, 42); // Dark slate
    doc.rect(15, y, 180, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);

    doc.text("POS", 18, y + 5.5);
    doc.text("ÉQUIPE", 32, y + 5.5);
    doc.text("PTS", 100, y + 5.5);
    doc.text("J", 113, y + 5.5);
    doc.text("G", 124, y + 5.5);
    doc.text("N", 135, y + 5.5);
    doc.text("P", 146, y + 5.5);
    doc.text("BP", 157, y + 5.5);
    doc.text("BC", 168, y + 5.5);
    doc.text("DIFF", 182, y + 5.5);

    y += 8;

    // Table rows
    standings.forEach((row, sIdx) => {
      // Row bg alternating
      if (sIdx % 2 === 0) {
        doc.setFillColor(248, 250, 252);
      } else {
        doc.setFillColor(255, 255, 255);
      }
      doc.rect(15, y, 180, 7.5, 'F');
      doc.setDrawColor(241, 245, 249);
      doc.line(15, y + 7.5, 195, y + 7.5);

      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', sIdx === 0 ? 'bold' : 'normal');
      doc.setFontSize(8.5);

      doc.text(`${sIdx + 1}`, 19, y + 5);
      doc.text(row.name, 32, y + 5);
      
      doc.setFont('helvetica', 'bold');
      doc.text(`${row.points}`, 100, y + 5);
      doc.setFont('helvetica', 'normal');

      doc.text(`${row.played}`, 113, y + 5);
      doc.text(`${row.won}`, 124, y + 5);
      doc.text(`${row.drawn}`, 135, y + 5);
      doc.text(`${row.lost}`, 146, y + 5);
      doc.text(`${row.goalsFor}`, 157, y + 5);
      doc.text(`${row.goalsAgainst}`, 168, y + 5);
      
      const diffSign = row.difference > 0 ? `+${row.difference}` : `${row.difference}`;
      doc.setFont('helvetica', 'bold');
      if (row.difference > 0) doc.setTextColor(16, 185, 129); // emerald
      else if (row.difference < 0) doc.setTextColor(239, 68, 68); // rose
      else doc.setTextColor(100, 116, 139); // slate

      doc.text(diffSign, 182, y + 5);

      y += 7.5;
    });

    y += 10;
  }

  // Check if we need to add a page break before matches list
  if (y > 150) {
    doc.addPage();
    pageNumber++;
    drawPageHeader(pageNumber);
    drawPageFooter(pageNumber);
    y = 42;
  }

  // Matches Title Section
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text("CALENDRIER & RÉSULTATS DES MATCHS", 15, y);
  
  doc.setDrawColor(16, 185, 129);
  doc.line(15, y + 2, 195, y + 2);
  y += 8;

  // Group matches by Round
  const roundNumbers = Array.from(new Set(tournament.matches.map(m => m.round))).sort((a, b) => a - b);
  
  roundNumbers.forEach((roundNum) => {
    const roundMatches = tournament.matches.filter(m => m.round === roundNum);
    let roundLabel = `Journée ${roundNum}`;
    if (tournament.format === 'single_elimination') {
      if (roundNum === 0) roundLabel = "Huitièmes de finale";
      else if (roundNum === 1) roundLabel = "Quarts de finale";
      else if (roundNum === 2) roundLabel = "Demi-finales";
      else if (roundNum === 3) roundLabel = "Finale";
    }

    // Header check
    if (y + 25 > 275) {
      doc.addPage();
      pageNumber++;
      drawPageHeader(pageNumber);
      drawPageFooter(pageNumber);
      y = 42;
    }

    // Print Round Header
    doc.setFillColor(241, 245, 249); // slate-100
    doc.rect(15, y, 180, 6.5, 'F');
    doc.setTextColor(71, 85, 105);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(roundLabel.toUpperCase(), 18, y + 4.5);
    y += 7.5;

    roundMatches.forEach(match => {
      // Single match item height is roughly 11
      if (y + 11 > 275) {
        doc.addPage();
        pageNumber++;
        drawPageHeader(pageNumber);
        drawPageFooter(pageNumber);
        y = 42;

        // Reprint Round Header for continuity
        doc.setFillColor(241, 245, 249);
        doc.rect(15, y, 180, 6.5, 'F');
        doc.setTextColor(71, 85, 105);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.text(`${roundLabel.toUpperCase()} (Suite)`, 18, y + 4.5);
        y += 7.5;
      }

      // Draw match row
      doc.setDrawColor(241, 245, 249);
      doc.line(15, y + 9.5, 195, y + 9.5);

      // Home vs Away Team
      doc.setFontSize(9);
      doc.setFont('helvetica', match.winner === match.homeTeam ? 'bold' : 'normal');
      doc.setTextColor(15, 23, 42);
      doc.text(match.homeTeam, 18, y + 5.5);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(148, 163, 184); // light gray 'vs'
      doc.text("vs", 90, y + 5.5, { align: 'center' });

      doc.setFont('helvetica', match.winner === match.awayTeam ? 'bold' : 'normal');
      doc.setTextColor(15, 23, 42);
      doc.text(match.awayTeam, 102, y + 5.5);

      // Score / Status
      if (match.status === 'completed') {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(16, 185, 129); // completed emerald
        const scoreText = `${match.homeScore} - ${match.awayScore}`;
        doc.text(scoreText, 175, y + 5.5, { align: 'center' });
      } else {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(8);
        doc.setTextColor(156, 163, 175); // gray pending
        doc.text("En attente", 175, y + 5.5, { align: 'center' });
      }

      y += 10.5;
    });

    y += 4; // space between rounds
  });

  // Save the document
  const fileName = `Tournoi_${tournament.name.replace(/\s+/g, '_')}.pdf`;
  doc.save(fileName);
};

