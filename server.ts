import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Middleware
  app.use(express.json());

  // Initialize Gemini client (Lazy initialized if key exists)
  let ai: GoogleGenAI | null = null;
  const apiKey = process.env.GEMINI_API_KEY;

  if (apiKey && apiKey !== 'MY_GEMINI_API_KEY' && apiKey.trim() !== '') {
    const startsWithAIza = apiKey.trim().startsWith('AIza');
    const startsWithYa29 = apiKey.trim().startsWith('ya29');
    console.log(`[Diagnostic] GEMINI_API_KEY is present. Length: ${apiKey.length}. Starts with AIza: ${startsWithAIza}. Starts with ya29: ${startsWithYa29}.`);
    try {
      ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });
      console.log("Gemini API client initialized successfully.");
    } catch (err) {
      console.error("Failed to initialize Gemini API client:", err);
    }
  } else {
    console.warn("GEMINI_API_KEY is missing or set to placeholder. Server-side AI will use expert fallback engines.");
  }

  // --- API ROUTES ---

  // 1. Healthcheck / Status
  app.get('/api/health', (req, res) => {
    const startsWithAIza = apiKey?.trim().startsWith('AIza') ?? false;
    const startsWithYa29 = apiKey?.trim().startsWith('ya29') ?? false;
    const trimmed = apiKey?.trim() ?? '';
    const firstFive = trimmed.substring(0, 5);
    const lastFive = trimmed.substring(trimmed.length - 5);
    res.json({ 
      status: 'ok', 
      hasAI: !!ai,
      keyLength: apiKey?.length ?? 0,
      startsWithAIza,
      startsWithYa29,
      firstFive,
      lastFive
    });
  });

  // 2. SWOT & KPIs Strategic analysis
  app.post('/api/ai/swot', async (req, res) => {
    const { 
      clubName, sport, membersCount, playersCount, coachesCount, 
      totalIncome, totalExpenses, complianceRate, avgAttendanceRate 
    } = req.body;

    const prompt = `Génère une analyse SWOT complète, stratégique et de niveau professionnel pour l'association sportive suivante :
    - Nom du Club : ${clubName}
    - Sport : ${sport}
    - Nombre de membres : ${membersCount} (${playersCount} joueurs, ${coachesCount} entraîneurs)
    - Finances : Recettes récoltées = ${totalIncome} €, Dépenses enregistrées = ${totalExpenses} €
    - Taux de conformité administrative (pièces d'inscription validées) : ${complianceRate}%
    - Taux de présence moyen aux entraînements/matchs : ${avgAttendanceRate}%

    Tu dois structurer ta réponse au format JSON valide avec les clés suivantes :
    - "strengths": tableau de 3-4 forces concrètes déduites des chiffres ou du contexte.
    - "weaknesses": tableau de 3-4 faiblesses concrètes liées aux finances, à l'administration ou aux présences.
    - "opportunities": tableau de 3-4 opportunités de croissance, subventions, partenariats locaux.
    - "threats": tableau de 3-4 menaces (baisse de subventions, blessures, non-conformité d'assurances).
    - "kpis": tableau de 3 recommandations d'indicateurs clés de performance à suivre.
    - "strategy": un paragraphe synthétique de recommandations stratégiques rédigé par un expert en management sportif.

    Ta réponse doit être exclusivement en français et être un objet JSON valide (sans fioriture de markdown type \`\`\`json, renvoie uniquement l'objet JSON brut).`;

    if (ai) {
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3.5-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json'
          }
        });

        const rawText = response.text || '';
        try {
          const parsed = JSON.parse(rawText.trim());
          return res.json(parsed);
        } catch (parseErr) {
          console.warn("Failed to parse Gemini SWOT response:", rawText, parseErr);
          // Fall through to fallback engine if parsing failed
        }
      } catch (geminiErr: any) {
        console.warn("Gemini SWOT generation failed, falling back to expert local engine:", geminiErr?.message || geminiErr);
        if (geminiErr?.status === 401 || geminiErr?.message?.includes('401') || geminiErr?.message?.includes('UNAUTHENTICATED') || geminiErr?.message?.includes('authentication')) {
          console.warn("Disabling Gemini client due to unauthenticated/invalid credentials.");
          ai = null;
        }
        // Fall through to fallback engine
      }
    }

    // Expert Fallback Engine when Gemini is not active or fails
    // Generates a tailored analysis based on the metrics to ensure a perfect premium user experience
    const netFinance = totalIncome - totalExpenses;
    const strengths = [
      `Structure associative active avec ${membersCount} membres passionnés de ${sport}.`,
      coachesCount > 0 ? `Encadrement technique assuré par ${coachesCount} entraîneurs dévoués.` : `Indépendance d'organisation sportive au sein du club.`,
      avgAttendanceRate > 75 ? `Taux de présence élevé aux séances (${avgAttendanceRate}%), signe d'un fort engagement.` : `Motivation constante des licenciés lors des rassemblements.`
    ];

    const weaknesses = [
      complianceRate < 80 ? `Risque de responsabilité civile élevé : ${100 - complianceRate}% des membres n'ont pas un dossier d'inscription 100% conforme.` : `Amélioration continue nécessaire pour maintenir 100% de conformité administrative.`,
      netFinance < 0 ? `Déficit budgétaire de ${Math.abs(netFinance)} € mettant sous pression la trésorerie du club.` : `Dépendance vis-à-vis des cotisations pour financer l'activité (Excédent de ${netFinance} €).`,
      avgAttendanceRate < 70 ? `Taux d'assiduité perfectible (${avgAttendanceRate}%) nécessitant un suivi des absences.` : `Besoin de régularité pour pérenniser la cohésion des équipes.`
    ];

    const opportunities = [
      `Développement d'offres de sponsoring local pour compenser les dépenses d'équipements de ${sport}.`,
      `Mise en place de stages vacances payants pour diversifier les sources de financement du club.`,
      `Digitalisation complète des relances de cotisations et fiches de présences pour gagner 4 heures par semaine.`
    ];

    const threats = [
      complianceRate < 90 ? `Suspension d'assurance de licenciés en cas d'accident corporel dû aux pièces justificatives manquantes.` : `Réglementation fédérale de plus en plus stricte concernant les licences sportives.`,
      netFinance < 0 ? `Érosion des réserves financières limitant l'achat de matériel pédagogique pour la saison prochaine.` : `Inflation sur le coût des transports et frais de déplacement lors des matchs.`,
      `Concurrence d'autres activités de loisirs diminuant le taux d'engagement des jeunes adhérents.`
    ];

    const kpis = [
      `Taux de conformité réglementaire (Objectif : > 95% avant le premier match officiel).`,
      `Marge de trésorerie nette (Rapport Recettes / Dépenses, Objectif : > 1.1).`,
      `Indice d'assiduité par catégorie (Cible : 80% de présence minimum par joueur).`
    ];

    const strategy = `En tant que dirigeant de ${clubName}, votre priorité absolue doit être de régulariser la conformité administrative (${complianceRate}% actuel) pour couvrir légalement le club. Sur le plan financier, l'écart de ${netFinance} € suggère d'optimiser les collectes de cotisations en retard ou de lancer des partenariats locaux. Maintenez le fort dynamisme sportif en pérennisant les séances d'entraînement régulières.`;

    return res.json({
      strengths,
      weaknesses,
      opportunities,
      threats,
      kpis,
      strategy
    });
  });

  // 3. Conversational AI Assistant
  app.post('/api/ai/chat', async (req, res) => {
    const { messages, clubContext } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "Messages array is required." });
    }

    const systemInstruction = `Tu es l'Assistant IA Dirigeant de HouraSports. Ton rôle est de conseiller les secrétaires, présidents, entraîneurs et bénévoles de clubs sportifs amateurs pour les aider à gérer au mieux leur association.
    Voici le contexte actuel du club de l'utilisateur :
    - Nom du Club : ${clubContext.name}
    - Sport : ${clubContext.sport}
    - Effectif : ${clubContext.membersCount} membres (${clubContext.playersCount} joueurs, ${clubContext.coachesCount} entraîneurs)
    - Finances : Recettes = ${clubContext.totalIncome} €, Dépenses = ${clubContext.totalExpenses} €
    - Administratif : ${clubContext.complianceRate}% de dossiers d'inscription conformes.

    Sois extrêmement pragmatique, chaleureux mais professionnel, et donne des conseils directement applicables (ex: plans d'action pour collecter les cotisations, préparer une assemblée générale, améliorer l'assiduité, gérer le sponsoring ou acheter du matériel de ${clubContext.sport}). Réponds en français de manière claire et bien formatée.`;

    if (ai) {
      try {
        // Build chat history formatted for @google/genai chats
        const formattedContents = messages.map(msg => ({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }]
        }));

        const lastMessage = formattedContents.pop();

        const chat = ai.chats.create({
          model: 'gemini-3.5-flash',
          history: formattedContents,
          config: {
            systemInstruction
          }
        });

        const response = await chat.sendMessage({
          message: lastMessage ? lastMessage.parts[0].text : 'Bonjour !'
        });

        return res.json({ text: response.text });
      } catch (geminiErr: any) {
        console.warn("Gemini Chat failed, falling back to expert local engine:", geminiErr?.message || geminiErr);
        if (geminiErr?.status === 401 || geminiErr?.message?.includes('401') || geminiErr?.message?.includes('UNAUTHENTICATED') || geminiErr?.message?.includes('authentication')) {
          console.warn("Disabling Gemini client due to unauthenticated/invalid credentials.");
          ai = null;
        }
        // Fall through to fallback engine response
      }
    }

    // Expert Fallback chatbot when Gemini is offline
    const lastUserMsg = messages[messages.length - 1]?.content?.toLowerCase() || '';
    let responseText = `Bonjour ! Je suis l'Assistant Décisions de HouraSports. Pour vous aider au mieux à piloter ${clubContext.name}, voici quelques recommandations spécifiques : \n\n`;

    if (lastUserMsg.includes('cotis') || lastUserMsg.includes('argent') || lastUserMsg.includes('financ') || lastUserMsg.includes('budget')) {
      responseText += `**Conseils financiers pour ${clubContext.name}** :\n\n` +
        `1. **Activez les relances de cotisations** : Nous constatons que vous avez collecté ${clubContext.totalIncome} € à ce jour. Utilisez l'onglet Finances pour relancer automatiquement les membres 'En attente'.\n` +
        `2. **Diversifiez vos revenus** : Contactez les commerces locaux pour du sponsoring (maillots, panneaux de stade). C'est parfait pour amortir les dépenses actuelles de ${clubContext.totalExpenses} €.\n` +
        `3. **Facilités de paiement** : Proposez des règlements en 3 fois sans frais pour aider les familles en début de saison.`;
    } else if (lastUserMsg.includes('confor') || lastUserMsg.includes('dossier') || lastUserMsg.includes('relance') || lastUserMsg.includes('administratif')) {
      responseText += `**Optimisation administrative pour ${clubContext.name}** :\n\n` +
        `Votre taux de conformité est actuellement de **${clubContext.complianceRate}%**. C'est un bon début, mais il faut viser la conformité totale pour être couvert par l'assurance fédérale.\n\n` +
        `*   **Plan d'action de 48 heures** : Utilisez l'outil de Relances Automatiques que nous venons de déployer dans l'espace Membres. Il génère un texte personnalisé (ton urgent) que vous pouvez envoyer par mail ou SMS en un clic.\n` +
        `*   **Fiches pré-remplies** : Téléchargez les formulaires d'inscription et certificats pré-remplis générés par l'app et distribuez-les aux retardataires aux prochains entraînements.`;
    } else if (lastUserMsg.includes('entrain') || lastUserMsg.includes('presence') || lastUserMsg.includes('absent') || lastUserMsg.includes('match')) {
      responseText += `**Engagement et assiduité sportive** :\n\n` +
        `Le suivi des présences montre que l'assiduité est un enjeu clé. Pour stimuler la présence de vos licenciés de ${clubContext.sport} :\n\n` +
        `*   **Responsabilisez les joueurs** : Demandez aux joueurs de renseigner leur présence sur l'application 48h à l'avance pour faciliter la planification de vos coachs.\n` +
        `*   **Donnez du feedback régulier** : Utilisez l'onglet 'Classements & Trophées' du calendrier de l'app pour célébrer l'assiduité et motiver vos troupes de manière ludique !`;
    } else {
      responseText += `Je suis prêt à vous guider ! Posez-moi des questions spécifiques sur :\n` +
        `- La gestion de vos cotisations et de votre budget (${clubContext.totalIncome} € encaissés).\n` +
        `- La relance des dossiers d'inscription incomplets (${100 - clubContext.complianceRate}% de retardataires).\n` +
        `- L'organisation de vos entraînements et l'augmentation de la fidélité de vos ${clubContext.membersCount} licenciés.`;
    }

    return res.json({ text: responseText });
  });

  // --- VITE DEV SERVER OR STATIC SERVING ---

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log("Mounted Vite development middleware.");
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
    console.log(`Serving static files from ${distPath}`);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[HouraSports Server] Running at http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error("Critical error starting Express fullstack server:", err);
});
