// Shared design tokens + mock data for the JUstep platform.
// Navy blue + teal palette, matching the original dashboard style.

export const colors = {
  navy: "#1E2A4A",
  navy2: "#2D4070",
  bg: "#F0F4FF",
  card: "#FFFFFF",
  // teal / blue accents
  blue: "#4F8EF7",
  teal: "#38BDF8",
  tealDeep: "#14B8A6",
  // semantic
  green: "#10B981",
  amber: "#F59E0B",
  red: "#EF4444",
  orange: "#F97316",
  purple: "#8B5CF6",
  // text
  text: "#1E2A4A",
  textSoft: "#64748B",
  textMuted: "#94A3B8",
  line: "#E8EEFF",
};

export const gradients = {
  accent: "linear-gradient(135deg, #4F8EF7, #38BDF8)",
  accentV: "linear-gradient(180deg, #4F8EF7, #38BDF8)",
  navy: "linear-gradient(135deg, #1E2A4A 0%, #2D4070 100%)",
  teal: "linear-gradient(135deg, #14B8A6, #38BDF8)",
};

export const font = "'Inter', -apple-system, sans-serif";

export const card = {
  background: colors.card,
  borderRadius: 16,
  padding: "22px 24px",
  boxShadow: "0 1px 6px rgba(0,0,0,0.05)",
};

export const labelStyle = {
  fontSize: 12,
  color: colors.textMuted,
  fontWeight: 500,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

export const primaryBtn = {
  background: gradients.accent,
  color: "#fff",
  border: "none",
  borderRadius: 12,
  padding: "13px 28px",
  fontSize: 15,
  fontWeight: 700,
  cursor: "pointer",
  letterSpacing: "0.02em",
  boxShadow: "0 4px 16px rgba(79,142,247,0.35)",
  transition: "transform 0.15s, box-shadow 0.15s",
  fontFamily: font,
};

export const ghostBtn = {
  background: "#fff",
  color: colors.navy,
  border: `1.5px solid ${colors.line}`,
  borderRadius: 12,
  padding: "13px 28px",
  fontSize: 15,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: font,
};

// ---- Shared mock data -------------------------------------------------------

export const currentUser = {
  name: "Qais",
  initial: "Q",
  year: "2nd Year",
  university: "University of Jordan",
  email: "qais@ju.edu.jo",
  role: "student",
};

export const mockData = {
  user: currentUser,
  streak: 7,
  bestStreak: 12,
  todayGoal: { done: 12, total: 20 },
  weeklyScore: [65, 70, 58, 80, 75, 88, 72],
  subjects: [
    { name: "Pathology", progress: 68, color: "#3B82F6", questions: 240, cards: 120, mastered: 82 },
    { name: "Pharmacology", progress: 45, color: "#14B8A6", questions: 180, cards: 95, mastered: 41 },
    { name: "Anatomy", progress: 82, color: "#8B5CF6", questions: 310, cards: 200, mastered: 164 },
    { name: "Physiology", progress: 30, color: "#F59E0B", questions: 150, cards: 88, mastered: 26 },
    { name: "Microbiology", progress: 54, color: "#38BDF8", questions: 210, cards: 140, mastered: 76 },
    { name: "Biochemistry", progress: 61, color: "#EF4444", questions: 175, cards: 110, mastered: 67 },
  ],
  recentTopics: [
    { name: "Liver Pathology", subject: "Pathology", score: 85, questions: 20, date: "Today" },
    { name: "Beta Blockers", subject: "Pharmacology", score: 70, questions: 15, date: "Yesterday" },
    { name: "Brachial Plexus", subject: "Anatomy", score: 92, questions: 18, date: "2 days ago" },
  ],
  upcomingTopics: [
    { name: "Renal Pathology", subject: "Pathology", questions: 25 },
    { name: "Diuretics", subject: "Pharmacology", questions: 20 },
    { name: "Cranial Nerves", subject: "Anatomy", questions: 30 },
  ],
};

export const days = ["M", "T", "W", "T", "F", "S", "S"];

// QBank sample questions
export const questionBank = [
  {
    id: 1,
    subject: "Pharmacology",
    topic: "Beta Blockers",
    difficulty: "Medium",
    stem: "A 58-year-old man with stable angina is started on a new medication. He later reports cold extremities and fatigue. The drug most likely acts by which mechanism?",
    options: [
      "Blockade of β1-adrenergic receptors",
      "Activation of α2-adrenergic receptors",
      "Inhibition of ACE",
      "Blockade of L-type calcium channels",
    ],
    answer: 0,
    explanation:
      "Non-selective and β1-selective beta blockers reduce heart rate and contractility. Peripheral vasoconstriction (cold extremities) and fatigue are classic side effects from reduced cardiac output and β2 effects.",
  },
  {
    id: 2,
    subject: "Pathology",
    topic: "Liver Pathology",
    difficulty: "Hard",
    stem: "A liver biopsy from a chronic alcoholic shows eosinophilic intracytoplasmic inclusions composed of damaged intermediate filaments. These are known as:",
    options: ["Councilman bodies", "Mallory-Denk bodies", "Russell bodies", "Psammoma bodies"],
    answer: 1,
    explanation:
      "Mallory-Denk bodies are aggregates of damaged keratin intermediate filaments, characteristic of alcoholic hepatitis.",
  },
  {
    id: 3,
    subject: "Anatomy",
    topic: "Brachial Plexus",
    difficulty: "Medium",
    stem: "Injury to the posterior cord of the brachial plexus would most likely result in weakness of which movement?",
    options: ["Forearm flexion", "Wrist extension", "Finger abduction", "Shoulder adduction"],
    answer: 1,
    explanation:
      "The posterior cord gives rise to the radial nerve, which innervates the extensor compartment. Injury causes wrist drop (loss of wrist extension).",
  },
  {
    id: 4,
    subject: "Physiology",
    topic: "Renal Physiology",
    difficulty: "Easy",
    stem: "Which segment of the nephron is impermeable to water but actively reabsorbs Na+, K+, and Cl-?",
    options: [
      "Proximal convoluted tubule",
      "Thin descending limb",
      "Thick ascending limb of Henle",
      "Collecting duct",
    ],
    answer: 2,
    explanation:
      "The thick ascending limb actively reabsorbs Na+/K+/2Cl- via the NKCC2 cotransporter and is impermeable to water, generating dilute urine.",
  },
  {
    id: 5,
    subject: "Microbiology",
    topic: "Gram Positive Cocci",
    difficulty: "Medium",
    stem: "A catalase-positive, coagulase-positive gram-positive coccus is isolated from a wound. The organism is most likely:",
    options: ["Streptococcus pyogenes", "Staphylococcus aureus", "Enterococcus faecalis", "Staphylococcus epidermidis"],
    answer: 1,
    explanation:
      "Staphylococcus aureus is catalase-positive (distinguishes from strep) and coagulase-positive (distinguishes from other staph).",
  },
];

// Flashcards sample deck
export const flashcards = [
  { id: 1, subject: "Pharmacology", front: "Mechanism of action of warfarin?", back: "Inhibits vitamin K epoxide reductase, reducing synthesis of clotting factors II, VII, IX, X." },
  { id: 2, subject: "Pathology", front: "Most common type of renal stone?", back: "Calcium oxalate stones (~75-80% of cases). Radiopaque on X-ray." },
  { id: 3, subject: "Anatomy", front: "Which nerve innervates the diaphragm?", back: "The phrenic nerve (C3, C4, C5 — 'C3,4,5 keeps the diaphragm alive')." },
  { id: 4, subject: "Physiology", front: "Normal range for arterial blood pH?", back: "7.35 – 7.45. Below is acidemia, above is alkalemia." },
  { id: 5, subject: "Biochemistry", front: "Rate-limiting enzyme of glycolysis?", back: "Phosphofructokinase-1 (PFK-1), activated by AMP/F2,6BP, inhibited by ATP/citrate." },
  { id: 6, subject: "Microbiology", front: "Classic triad of congenital rubella?", back: "Sensorineural deafness, cataracts, and patent ductus arteriosus (PDA)." },
];

export const leaderboard = [
  { rank: 1, name: "Layla Hamdan", university: "JU", points: 9840, accuracy: 91, streak: 24, you: false },
  { rank: 2, name: "Omar Khalil", university: "JUST", points: 9210, accuracy: 88, streak: 19, you: false },
  { rank: 3, name: "Sara Najjar", university: "Hashemite", points: 8765, accuracy: 87, streak: 15, you: false },
  { rank: 4, name: "Qais Suwan", university: "JU", points: 8120, accuracy: 84, streak: 7, you: true },
  { rank: 5, name: "Yousef Ali", university: "Mutah", points: 7990, accuracy: 83, streak: 11, you: false },
  { rank: 6, name: "Maya Saleh", university: "JU", points: 7640, accuracy: 85, streak: 9, you: false },
  { rank: 7, name: "Hadi Mansour", university: "JUST", points: 7310, accuracy: 80, streak: 5, you: false },
  { rank: 8, name: "Nour Fares", university: "Yarmouk", points: 7050, accuracy: 79, streak: 13, you: false },
];

// Admin overview
export const adminStats = {
  totalUsers: 2847,
  activeToday: 612,
  totalQuestions: 1265,
  totalFlashcards: 753,
  pendingReports: 9,
};

export const adminUsers = [
  { id: 1, name: "Layla Hamdan", email: "layla@ju.edu.jo", role: "student", status: "active", joined: "Jan 2026" },
  { id: 2, name: "Omar Khalil", email: "omar@just.edu.jo", role: "student", status: "active", joined: "Feb 2026" },
  { id: 3, name: "Dr. Amjad Raie", email: "amjad@ju.edu.jo", role: "instructor", status: "active", joined: "Dec 2025" },
  { id: 4, name: "Sara Najjar", email: "sara@hu.edu.jo", role: "student", status: "suspended", joined: "Mar 2026" },
  { id: 5, name: "Qais Suwan", email: "qais@ju.edu.jo", role: "admin", status: "active", joined: "Nov 2025" },
];
