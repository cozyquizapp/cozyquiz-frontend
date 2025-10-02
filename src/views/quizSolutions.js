// Zentrale Sammlung der Quiz-LÃ¶sungen & Runden-Definitionen
// Aus AdminView.jsx extrahiert, damit die View schlanker wird und LÃ¶sungen ggf. leichter
// ersetzt / variiert werden kÃ¶nnen.

// Hase â€“ LÃ¶sungen (3 Runden)
export const HASE_SOLUTIONS = [
  ['Marilyn Monroe', 'Barack Obama', 'Angela Merkel', 'Joachim LÃ¶w'],
  ['Jackie Chan', 'Helene Fischer', 'Pedro Pascal', 'Lily Collins'],
  ['Rihanna', 'Albert Einstein', 'Walentina Doronina', 'Bill Kaulitz'],
];

// Kranich â€“ 3 Runden (mit LÃ¶sungen)
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
      { id: 'gruendung', label: 'GrÃ¼ndungsjahr' },
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
      { id: 'song', label: 'MeistgehÃ¶rter Song (Spotify)' },
      { id: 'ig', label: 'Instagram-Follower' },
    ],
    solutions: {
      geburtsjahr: ['Taylor Swift', 'TheWeeknd', 'Ed Sheeran', 'Billie Eilish'],
      song: ['Taylor Swift (Cruel Summer)', 'Billie Eilish (Lovely)', 'Ed Sheeran (Shape of you)', 'TheWeeknd (Blinding Lights)'],
      ig: ['Ed Sheeran', 'TheWeeknd', 'Billie Eilish', 'Taylor Swift'],
    },
  },
];

// Robbe â€“ richtige Option je Runde
export const ROBBE_CORRECT = ['c', 'c', 'a'];

// Robbe â€“ Detailrunden (Find the Fake). Jede Runde: drei Aussagen (a,b,c) + welche unwahr ist.
// truth: true = wahr, false = unwahr (Fake). 'correct' markiert den Buchstaben der unwahren Aussage.
export const ROBBE_ROUNDS = [
  {
    options: {
      a: {
        text: 'Ã„pfel gehÃ¶ren zur Familie der RosengewÃ¤chse',
        truth: true,
        explanation: 'Der Apfelbaum (Malus domestica) gehÃ¶rt zur Familie Rosaceae â€“ wie Birnen, Kirschen, Pflaumen.'
      },
      b: {
        text: 'Die Perlen im Bubble Tea werden aus Wurzeln gewonnen',
        truth: true,
        explanation: 'Tapioka-Perlen bestehen aus TapiokastÃ¤rke; diese stammt aus der Maniokwurzel.'
      },
      c: {
        text: 'Kamele speichern Wasser in ihren HÃ¶ckern',
        truth: false,
        explanation: 'HÃ¶cker bestehen aus Fettgewebe (Energiereserve); Wasser wird nicht im HÃ¶cker gespeichert.'
      }
    },
    correct: 'c'
  },
  {
    options: {
      a: {
        text: 'Hummeln sind auch Bienen',
        truth: true,
        explanation: 'Hummeln gehÃ¶ren zur Familie der Echten Bienen (Apidae) â€“ Gattung Bombus.'
      },
      b: {
        text: 'Auberginen enthalten Nikotin',
        truth: true,
        explanation: 'NachtschattengewÃ¤chse enthalten Spuren Nikotin â€“ Mengen sind jedoch verschwindend gering.'
      },
      c: {
        text: 'Der Mount Everest schrumpft',
        truth: false,
        explanation: 'Im Mittel wÃ¤chst der Everest einige mm pro Jahr; Beben kÃ¶nnen kurzfristig beeinflussen.'
      }
    },
    correct: 'c'
  },
  {
    options: {
      a: {
        text: 'Die Sahara ist die grÃ¶ÃŸte WÃ¼ste der Erde',
        truth: false,
        explanation: 'GrÃ¶ÃŸte WÃ¼ste insgesamt ist die Antarktis (dann Arktis); Sahara ist grÃ¶ÃŸte heiÃŸe WÃ¼ste.'
      },
      b: {
        text: 'Volvic ist nach einem Ort in Frankreich benannt',
        truth: true,
        explanation: 'Volvic stammt aus dem gleichnamigen Ort in der Auvergne.'
      },
      c: {
        text: 'Spinnen kÃ¶nnen fliegen',
        truth: true,
        explanation: 'Ballooning: Spinnen lassen FÃ¤den vom Wind tragen und â€žsegelnâ€œ durch die Luft.'
      }
    },
    correct: 'a'
  }
];

// Eule â€“ LÃ¶sungen (Mapping: roundIdx 0â†’r1, 1â†’r3, 2â†’r4)
export const EULE_SOLUTIONS = {
  r1: [
    'Die EiskÃ¶nigin', 'Lilo & Stitch', 'Soul', 'Drachen zÃ¤hmen leicht gemacht', 'Oben',
    'Ice Age', 'Monster AG', 'Minions', 'Alles steht Kopf', 'Findet Dorie',
    'Kung Fu Panda', 'Toy Story', 'Wall-E', 'Madagaskar', 'Ratatouille'
  ],
  r3: ['Sixth Sense', 'Oppenheimer', 'Bohemian Rhapsody'],
  r4: ['Ansteckrose', 'Tiger', 'Ohren', 'Latzhosen'],
};

// Fuchs â€“ richtige Antworten (3-Runden-Mapping: 0â†’R1, 1â†’R2, 2â†’R4)
export const FUCHS_SOLUTIONS = ['Justin Bieber', 'Rihanna', 'Heidi Klum'];

// BÃ¤r â€“ Fragen + richtige Werte (pro Runde)
export const BAER_ROUNDS = [
  {
    title: 'LÃ¤ngster Nonstop-Passagierflug der Welt',
    question: 'Wie viele Stunden dauert der aktuell lÃ¤ngste Nonstop-Passagierflug der Welt?',
    solution: 18 + 50 / 60, // 18 h 50 min
    unit: 'h',
    solutionLabel: 'â‰ˆ 18,8 h (18 h 50 min Â· Singapore Airlines Â· SINâ€“JFK)',
  },
  {
    title: 'Anzahl KindertagesstÃ¤tten in Deutschland',
    question: 'Wie viele KindertagesstÃ¤tten (Kitas) gibt es in Deutschland?',
    solution: 58500,
    unit: '',
    solutionLabel: 'â‰ˆ 58 500 (Stand 2023)',
  },
  {
    title: 'HÃ¶chster Wolkenkratzer der Welt',
    question: 'Wie hoch ist der aktuell hÃ¶chste Wolkenkratzer der Welt?',
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

