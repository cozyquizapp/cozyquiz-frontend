// Zentrale Sammlung der Quiz-Lösungen & Runden-Definitionen
// Aus AdminView.jsx extrahiert, damit die View schlanker wird und Lösungen ggf. leichter
// ersetzt / variiert werden können.

// Hase – Lösungen (3 Runden)
export const HASE_SOLUTIONS = [
  ['Marilyn Monroe', 'Barack Obama', 'Angela Merkel', 'Joachim Löw'],
  ['Jackie Chan', 'Helene Fischer', 'Pedro Pascal', 'Lily Collins'],
  ['Rihanna', 'Albert Einstein', 'Walentina Doronina', 'Bill Kaulitz'],
];

// Kranich – 3 Runden (mit Lösungen)
export const KRANICH_ROUNDS = [
  {
    title: 'Filmreihen',
    categories: [
      { id: 'startjahr', label: 'Startjahr' },
      { id: 'anzahl', label: 'Anzahl Filme' },
      { id: 'einspiel', label: 'Einspielergebnis' },
    ],
    solutions: {
      startjahr: ['Star Wars', 'Harry Potter', 'Herr der Ringe', 'Die Tribute von Panem'],
      anzahl: ['Herr der Ringe', 'Die Tribute von Panem', 'Harry Potter', 'Star Wars'],
      einspiel: ['Die Tribute von Panem', 'Herr der Ringe', 'Harry Potter', 'Star Wars'],
    },
  },
  {
    title: 'Social Media',
    categories: [
      { id: 'gruendung', label: 'Gründungsjahr' },
      { id: 'posts', label: 'Posts pro Minute' },
      { id: 'maus', label: 'Monatlich aktive Nutzer' },
    ],
    solutions: {
      gruendung: ['Facebook', 'Twitter (X)', 'Instagram', 'TikTok'],
      posts: ['TikTok', 'Twitter (X)', 'Facebook', 'Instagram'],
      maus: ['Twitter (X)', 'TikTok', 'Instagram', 'Facebook'],
    },
  },
  {
    title: 'Popstars',
    categories: [
      { id: 'geburtsjahr', label: 'Geburtsjahr' },
      { id: 'song', label: 'Meistgehörter Song (Spotify)' },
      { id: 'ig', label: 'Instagram-Follower' },
    ],
    solutions: {
      geburtsjahr: ['Taylor Swift', 'TheWeeknd', 'Ed Sheeran', 'Billie Eilish'],
      song: ['Taylor Swift (Cruel Summer)', 'Billie Eilish (Lovely)', 'Ed Sheeran (Shape of you)', 'TheWeeknd (Blinding Lights)'],
      ig: ['Ed Sheeran', 'TheWeeknd', 'Billie Eilish', 'Taylor Swift'],
    },
  },
];

// Robbe – richtige Option je Runde
export const ROBBE_CORRECT = ['c', 'c', 'a'];

// Robbe – Detailrunden (Find the Fake). Jede Runde: drei Aussagen (a,b,c) + welche unwahr ist.
// truth: true = wahr, false = unwahr (Fake). 'correct' markiert den Buchstaben der unwahren Aussage.
export const ROBBE_ROUNDS = [
  {
    options: {
      a: {
        text: 'Äpfel gehören zur Familie der Rosengewächse',
        truth: true,
        explanation: 'Der Apfelbaum (Malus domestica) gehört zur Familie Rosaceae – wie Birnen, Kirschen, Pflaumen.'
      },
      b: {
        text: 'Die Perlen im Bubble Tea werden aus Wurzeln gewonnen',
        truth: true,
        explanation: 'Tapioka-Perlen bestehen aus Tapiokastärke; diese stammt aus der Maniokwurzel.'
      },
      c: {
        text: 'Kamele speichern Wasser in ihren Höckern',
        truth: false,
        explanation: 'Höcker bestehen aus Fettgewebe (Energiereserve); Wasser wird nicht im Höcker gespeichert.'
      }
    },
    correct: 'c'
  },
  {
    options: {
      a: {
        text: 'Hummeln sind auch Bienen',
        truth: true,
        explanation: 'Hummeln gehören zur Familie der Echten Bienen (Apidae) – Gattung Bombus.'
      },
      b: {
        text: 'Auberginen enthalten Nikotin',
        truth: true,
        explanation: 'Nachtschattengewächse enthalten Spuren Nikotin – Mengen sind jedoch verschwindend gering.'
      },
      c: {
        text: 'Der Mount Everest schrumpft',
        truth: false,
        explanation: 'Im Mittel wächst der Everest einige mm pro Jahr; Beben können kurzfristig beeinflussen.'
      }
    },
    correct: 'c'
  },
  {
    options: {
      a: {
        text: 'Die Sahara ist die größte Wüste der Erde',
        truth: false,
        explanation: 'Größte Wüste insgesamt ist die Antarktis (dann Arktis); Sahara ist größte heiße Wüste.'
      },
      b: {
        text: 'Volvic ist nach einem Ort in Frankreich benannt',
        truth: true,
        explanation: 'Volvic stammt aus dem gleichnamigen Ort in der Auvergne.'
      },
      c: {
        text: 'Spinnen können fliegen',
        truth: true,
        explanation: 'Ballooning: Spinnen lassen Fäden vom Wind tragen und „segeln“ durch die Luft.'
      }
    },
    correct: 'a'
  }
];

// Eule – Lösungen (Mapping: roundIdx 0→r1, 1→r3, 2→r4)
export const EULE_SOLUTIONS = {
  r1: [
    'Die Eiskönigin', 'Lilo & Stitch', 'Soul', 'Drachen zähmen leicht gemacht', 'Oben',
    'Ice Age', 'Monster AG', 'Minions', 'Alles steht Kopf', 'Findet Dorie',
    'Kung Fu Panda', 'Toy Story', 'Wall-E', 'Madagaskar', 'Ratatouille'
  ],
  r3: ['Sixth Sense', 'Oppenheimer', 'Bohemian Rhapsody'],
  r4: ['Ansteckrose', 'Tiger', 'Ohren', 'Latzhosen'],
};

// Fuchs – richtige Antworten (3-Runden-Mapping: 0→R1, 1→R2, 2→R4)
export const FUCHS_SOLUTIONS = ['Justin Bieber', 'Rihanna', 'Heidi Klum'];

// Bär – Fragen + richtige Werte (pro Runde)
export const BAER_ROUNDS = [
  {
    title: 'Längster Nonstop-Passagierflug der Welt',
    question: 'Wie viele Stunden dauert der aktuell längste Nonstop-Passagierflug der Welt?',
    solution: 18 + 50 / 60, // 18 h 50 min
    unit: 'h',
    solutionLabel: '≈ 18,8 h (18 h 50 min · Singapore Airlines · SIN–JFK)',
  },
  {
    title: 'Anzahl Kindertagesstätten in Deutschland',
    question: 'Wie viele Kindertagesstätten (Kitas) gibt es in Deutschland?',
    solution: 58500,
    unit: '',
    solutionLabel: '≈ 58 500 (Stand 2023)',
  },
  {
    title: 'Höchster Wolkenkratzer der Welt',
    question: 'Wie hoch ist der aktuell höchste Wolkenkratzer der Welt?',
    solution: 828,
    unit: 'm',
    solutionLabel: '828 m (Burj Khalifa, Dubai)',
  },
];

export default {
  HASE_SOLUTIONS,
  KRANICH_ROUNDS,
  ROBBE_CORRECT,
  EULE_SOLUTIONS,
  FUCHS_SOLUTIONS,
  BAER_ROUNDS,
};

