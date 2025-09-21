// frontend/src/views/TeamFixed.jsx
import { useEffect, useMemo, useRef, useState } from 'react';
import socket, { connectWithTeamId } from '../socket';
import catKey from '../utils/catKey';

// Zusätzliche erlaubte Hosts (WLAN-IP hinzugefügt)
const ALLOWED_CLIENT_HOSTS = [
  'localhost',
  '127.0.0.1',
  '192.168.5.117', // WLAN für Teilnehmer
];

// Einmaliges Debug-Logging (optional)
if (typeof window !== 'undefined') {
  const h = window.location.hostname;
  if (ALLOWED_CLIENT_HOSTS.includes('192.168.5.117') && h === '192.168.5.117') {
    // eslint-disable-next-line no-console
    console.log('[TeamFixed] Running via WLAN IP 192.168.5.117');
  }
}

function Avatar({ src, size = 64 }) {
  let finalSrc = null;
  if (typeof src === 'string') {
    // Ensure leading slash and png preference
    if (/^\//.test(src)) finalSrc = src; else if (/^avatars\//.test(src)) finalSrc = '/' + src; else finalSrc = src;
  }
  if (finalSrc && /\/avatars\//.test(finalSrc)) {
    return (
      <img
        src={finalSrc}
        alt="avatar"
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          background: 'transparent',
          boxShadow: '0 10px 22px rgba(0,0,0,0.38)',
          border: 'none'
        }}
        draggable={false}
      />
    );
  }
  return <span style={{ fontSize: size * 0.8 }}>{finalSrc || '?'}</span>;
}

/** KRANICH: 3 Runden (duell) */
const KRANICH_ROUNDS = [
  {
    title: 'Filmreihen',
    items: ['Harry Potter', 'Herr der Ringe', 'Star Wars', 'Die Tribute von Panem'],
    categories: [
      { id: 'startjahr', label: 'Startjahr' },
      { id: 'anzahl', label: 'Anzahl Filme' },
      { id: 'einspiel', label: 'Einspielergebnis' },
    ],
  },
  {
    title: 'Social Media',
    items: ['TikTok', 'Facebook', 'Instagram', 'Twitter (X)'],
    categories: [
      { id: 'gruendung', label: 'Gründungsjahr' },
      { id: 'posts', label: 'Posts pro Minute' },
      { id: 'maus', label: 'Monatlich aktive Nutzer' },
    ],
  },
  {
    title: 'Popstars',
    items: ['Taylor Swift', 'Ed Sheeran', 'Billie Eilish', 'TheWeeknd'],
    categories: [
      { id: 'geburtsjahr', label: 'Geburtsjahr' },
      { id: 'song', label: 'Meistgehörter Song (Spotify)'},
      { id: 'ig', label: 'Instagram-Follower' },
    ],
  },
];

export default function TeamFixed({ fixedId, defaultName, defaultAvatar }) {
  const [st, setSt] = useState(null);
  const [teams, setTeams] = useState([]);
  // Connection status
  const [isConnected, setIsConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [connError, setConnError] = useState(null);
  // Verhindere doppeltes Initial-Join
  const didInitJoinRef = useRef(false);
  // Re-Join Throttle (z. B. nach Admin-Reset)
  const lastJoinAtRef = useRef(0);

  const cat = st?.currentCategory;
  const roundIndex = Number(st?.roundIndex || 0);
  // Phase + RoundKey müssen vor erstem Gebrauch definiert sein (TDZ fix)
  const phase = st?.phase || 'LOBBY';
  const roundKey = `${st?.currentCategory || 'NONE'}#${st?.roundIndex || 0}#${st?.phase}`;

  // FEHLTE: State für das letzte Ergebnis und den Key
  const [lastResult, setLastResult] = useState(null);
  const lastResultKey = useRef('');

  // Einsätze
  const [stake, setStake] = useState(0);
  const [useJoker, setUseJoker] = useState(false);

  // Hase
  const [haseAns, setHaseAns] = useState(['', '', '', '']);

  // KRANICH
  const [kranichCategory, setKranichCategory] = useState('');
  const [kranichOrder, setKranichOrder] = useState(['', '', '', '']);
  // Mobile touch reorder helpers
  const [dragIdx, setDragIdx] = useState(null);
  const dragYRef = useRef(0);
  const onTouchStartRow = (i) => (e) => {
    try { if (e.touches && e.touches[0]) dragYRef.current = e.touches[0].clientY; } catch {}
    setDragIdx(i);
  };
  const onTouchMoveRow = (i) => (e) => {
    if (dragIdx == null) return;
    const y = (e.touches && e.touches[0]) ? e.touches[0].clientY : null;
    if (y == null) return;
    const dy = y - dragYRef.current;
    const TH = 36;
    if (dy <= -TH && dragIdx > 0) {
      const a = [...kranichOrder];
      [a[dragIdx - 1], a[dragIdx]] = [a[dragIdx], a[dragIdx - 1]];
      setKranichOrder(a);
      setDragIdx(dragIdx - 1);
      dragYRef.current = y;
      e.preventDefault();
    } else if (dy >= TH && dragIdx < kranichOrder.length - 1) {
      const a = [...kranichOrder];
      [a[dragIdx + 1], a[dragIdx]] = [a[dragIdx], a[dragIdx + 1]];
      setKranichOrder(a);
      setDragIdx(dragIdx + 1);
      dragYRef.current = y;
      e.preventDefault();
    }
  };
  const onTouchEndRow = () => setDragIdx(null);

  // Robbe
  const [robbe, setRobbe] = useState({ a: 40, b: 40, c: 20 });
  const robbeTotal = Math.max(0, Math.min(100, (robbe.a||0)+(robbe.b||0)+(robbe.c||0)));
  const setRobbeClamped = (key, raw) => {
  // Nur 5%-Schritte erlauben, um 33/34% Ausweich-Strategie zu verhindern
  let v = Math.max(0, Math.min(100, Number(raw) || 0));
  v = Math.round(v / 5) * 5; // auf Schritt 5 runden
  const otherKeys = ['a','b','c'].filter(k=>k!==key);
  const otherSum = otherKeys.reduce((s,k)=> s + (robbe[k]||0), 0);
  const maxForKey = Math.max(0, 100 - otherSum);
  let nv = Math.min(v, maxForKey);
  // Falls verbleibender Platz kein Vielfaches von 5 ist, auf unteren 5er-Schritt trimmen
  if (nv % 5 !== 0) nv = Math.floor(nv / 5) * 5;
  setRobbe({ ...robbe, [key]: nv });
  };

  // Eule (3 Runden: 0=r1, 1=r3, 2=r4)
  const [euleRound1, setEuleRound1] = useState(Array(15).fill(''));
  const [euleRound3, setEuleRound3] = useState(Array(3).fill(''));
  const [euleRound4, setEuleRound4] = useState(Array(4).fill(''));

  // Wal
  const [walBid, setWalBid] = useState(0);

  // Bär
  const [baer, setBaer] = useState('');

  // Fuchs
  const [fuchs, setFuchs] = useState('');

  // Submission lock + optional edit mode (per aktiver Kategorie/Runde)
  const [editMode, setEditMode] = useState(false);
  useEffect(()=>{ setEditMode(false); }, [roundKey]);

  // Erkennen ob schon etwas für aktuelle Kategorie abgegeben wurde
  const mySub = (st && st.submissions && typeof st.submissions === 'object') ? (st.submissions[fixedId] || {}) : {};
  const hasSubmitted = useMemo(()=>{
    if (phase !== 'CATEGORY') return false;
    switch(cat){
      case 'Hase':   return Array.isArray(mySub.answers) && mySub.answers.some(a=>a && a.trim());
      case 'Kranich':return Array.isArray(mySub.order) && mySub.order.some(a=>a && a.trim());
      case 'Robbe':  return mySub.perc && typeof mySub.perc === 'object';
      case 'Eule':
        if (roundIndex === 0) return Array.isArray(mySub.r1) && mySub.r1.some(a=>a && a.trim());
        if (roundIndex === 1) return Array.isArray(mySub.r3) && mySub.r3.some(a=>a && a.trim());
        if (roundIndex === 2) return Array.isArray(mySub.r4) && mySub.r4.some(a=>a && a.trim());
        return false;
      case 'Wal':    return typeof mySub.bid === 'number';
      case 'Bär':    return typeof mySub.estimate === 'number';
      case 'Fuchs':  return typeof mySub.guess === 'string' && mySub.guess.trim().length>0;
      default: return false;
    }
  }, [phase, cat, mySub, roundIndex]);
  const submissionLocked = hasSubmitted && !editMode; // UI sperren
  const sendLabel = editMode ? 'Aktualisieren' : (hasSubmitted ? 'Gesendet' : 'Senden');

  // Timer ? lokales Ticken
  // Ref für haptisches Feedback bei "Zu spät" (Buzz zu spät)
  const zuSpaetRef = useRef(false);
  // Haptisches Feedback bei "Zu spät" (locked, nicht myBuzz, nur Elch)
  useEffect(() => {
    if (st?.currentCategory === 'Elch') {
      const el = st?.elch;
      const locked = !!el?.buzzLocked;
      const myBuzz = Array.isArray(el?.buzzOrder) && el.buzzOrder.some(b => b.teamId === fixedId);
      if (locked && !myBuzz && !zuSpaetRef.current) {
        try { navigator.vibrate && navigator.vibrate([30]); } catch {}
        zuSpaetRef.current = true;
      }
      if (!locked) zuSpaetRef.current = false;
    } else {
      zuSpaetRef.current = false;
    }
  }, [st?.currentCategory, st?.elch?.buzzLocked, st?.elch?.buzzOrder, fixedId]);
  const [now, setNow] = useState(Date.now());
  const [timerWasActive, setTimerWasActive] = useState(false);
  // NEU: Pause-Status für Team-Ansicht
  const [pausedAt, setPausedAt] = useState(null);
  // Overlay for round result feedback (win/lose)
  const [showLoseOverlay, setShowLoseOverlay] = useState(false);
  const [showWinOverlay, setShowWinOverlay] = useState(false);
  const hideLoseTmo = useRef(null);
  const hideWinTmo = useRef(null);

  // Category intro overlay (smooth avatar pop when a new category begins)
  const [catIntro, setCatIntro] = useState(null); // { k: catKey, ts }
  const prevCatRef = useRef(null);
  const prevPhaseRef = useRef(null);

  // LOBBY: Fun facts overlay
  const FUN_FACTS = useRef([
    // 80er-Motto
    '80er-Style: Schulterpolster und Neonfarben - je knalliger, desto besser!',
    'Walkman-Zeit: Mixtapes to go ? Kopfhörer wurden zum Accessoire.',
    'Haar-Ikonen: Vokuhila und Föhnfrisuren ? Haarsprayverbrauch auf Rekordniveau.',
    'Aerobic-Look: Leggings, Stirnbänder und Trainingsanzüge prägten die Streetwear.',
    // Arendal & Umgebung
  { text: 'Arendal liegt an der Südküste Norwegens (Agder) am Skagerrak.', img: '/funfacts/arendal.jpg', alt: 'Blick auf Arendal an der Südküste Norwegens' },
  { text: 'Die Altstadt rund um den Hafen ?Pollen? ist für Holzhäuser und Cafés bekannt.', img: '/funfacts/Arendal_Pollen.jpg', alt: 'Holzhäuser und Cafés am Hafen Pollen in Arendal' },
  { text: 'Jeden August: ?Arendalsuka? ? Norwegens große Demokratie-/Politik-Woche.', img: '/funfacts/arendalsuka.jpg', alt: 'Menschen und Stände bei der Arendalsuka' },
  { text: 'Tromøy & Hisøy: Insel-Feeling ? Hove ist ein Top-Ausflugsziel.', img: '/funfacts/stranhove.jpg', alt: 'Strand Hove auf einer der Inseln bei Arendal' },
  { text: 'Arendal war im 19. Jh. ein wichtiges Zentrum für Segelschifffahrt.', img: '/funfacts/historic.jpeg', alt: 'Historisches Segelschiff / maritime Szene in Arendal' },
  { text: 'Der Fluss Nidelva mündet hier ins Meer ? perfekt für Kajak & SUP.', img: '/funfacts/sup.jpg', alt: 'SUP oder Kajak auf dem Nidelva vor Arendal' },
    // Spielerisch / Humor
    'Hier sagt man: Das Team mit dem besten Outfit holt den Style-Pokal. ??',
    'Johannes ist objektiv der beste Moderator ? steht so im Skript. ??',
    'Fun Fact: 100% der Gewinnerteams hatten heute bereits Wasser getrunken. ??',
    'Gerücht: Wer während der Pause tief durchatmet, erhöht die Punktzahl um +0 (aber fühlt sich besser).',
    'Studien sagen: High-Five erhöht kurzfristig die Team-Synchronität um 8%. ?',
    'Inoffizielle Regel: Wer zuerst ?Was war nochmal die Frage?? sagt, muss extra fokussieren.',
    'Kurze Pause = Gehirn-Refresh. Schon Blinzeln bringt Mini-Reboot.',
    'Der Wal liebt stille Strategen ? sagt die Legende.',
    'Der Fuchs bevorzugt elegante Antworten vor schnellen. Glaubt man.',
  'Micro-Pause: Schultern hoch ? halten ? loslassen. Mini-Reset.',
  'Wer summt, reguliert Stress. Summen zählt als Strategie. ??',
  'Fun Fact: Teams mit klaren Rollen spielen oft ruhiger.',
  '?Ich hab da eine Theorie?? ? berühmte letzte Worte vor Plot-Twist.',
  'Kaffeefakt: Geruch allein kann Aufmerksamkeit kurz steigern.',
  'Die meisten spontanen Ideen kommen Sekunden NACH einem kurzem Blick weg vom Screen.',
  'Rainbow-Trivia: In Norwegen sieht man häufig Doppelregenbögen ? extra Glück? ??',
  'Kurzer Tap-Wechsel kann visuelle Ermüdung reduzieren ? danach oft fokussierter.',
  'Wer laut gewinnt, gewinnt doppelt (gefühlt).',
  'Legend says: Saying ?Wal? zu ernst löst mystische Kräfte aus.',
  'Hase-Fact: Schnelles Notieren ? später Sortieren spart Zeit.',
  'Brain-Boost: Tief ein ? 4s halten ? 6s aus. Parasympathikus aktiviert.',
  'Wenn ihr diesen Fact nochmal seht: Gratulation, ihr habt das Loop-Ei gefunden.',
  // Beispiel mit Bild (füge eigene Dateien in /funfacts/ hinzu)
  { text: 'Arendal Hafen ? historische Holzfassaden und Segelgeschichte live.', img: '/funfacts/hafen.jpg', alt: 'Hafen von Arendal mit Booten' },
  { text: 'Typischer norwegischer Schärengarten bei Abendlicht ? ruhig & weit.', img: '/funfacts/schaereninsel.jpg', alt: 'Schäreninsel bei Abendlicht' },
  // Neue Bild-Facts (zusätzliche Einträge)
  { text: '80er-Style: Schulterpolster und Neonfarben - je knalliger, desto besser!', img: '/funfacts/80er-style.jpg', alt: '80er-Style mit Neonfarben und Schulterpolstern' },
  { text: 'Walkman-Zeit: Mixtapes to go - Kopfhörer wurden zum Accessoire.', img: '/funfacts/walkman.jpg', alt: 'Walkman und Kopfhörer als Accessoire' },
  { text: 'Haar-Ikonen: Vokuhila und Föhnfrisuren - Haarsprayverbrauch auf Rekordniveau.', img: '/funfacts/Frisuren.jpg', alt: '80er-Jahre Frisuren und Vokuhila' },
  { text: 'Aerobic-Look: Leggings, Stirnbänder und Trainingsanzüge prägten die Streetwear.', img: '/funfacts/aerobic.jpg', alt: 'Aerobic-Look mit Leggings und Stirnband' },
  { text: 'Kaffeefakt: Geruch allein kann Aufmerksamkeit kurz steigern.', img: '/funfacts/kaffee.jpeg', alt: 'Tasse Kaffee, Duft steigt auf' },
  { text: 'Rainbow-Trivia: In Norwegen sieht man häufig Doppelregenbögen - extra Glück?', img: '/funfacts/doppelregenbogen.jpg', alt: 'Doppelregenbogen am Himmel' },
  ]).current;
  const [showFacts, setShowFacts] = useState(true);
  const [factIdx, setFactIdx] = useState(0);
  const [categorySummary, setCategorySummary] = useState(null); // {category, earnings, pot, ...}
  // Auto-dismiss timer ref for category summary overlay
  const summaryTimerRef = useRef(null);

  // Wenn Kategorie-Zusammenfassung verschwindet und wir in der Lobby sind -> Fun Facts wieder anzeigen
  useEffect(() => {
    if (!categorySummary && st?.phase === 'LOBBY') {
      setShowFacts(true);
    }
  }, [categorySummary, st?.phase]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, []);

  // ?? Beep bei erstem Buzz im Spiel (akustisches Feedback)
  const lastBuzzCountRef = useRef(0);
  const beepRef = useRef(null);
  useEffect(() => {
    beepRef.current = () => {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'square';
        o.frequency.value = 880;
        o.connect(g);
        g.connect(ctx.destination);
        g.gain.setValueAtTime(0.0001, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.2);
        o.start();
        o.stop(ctx.currentTime + 0.22);
      } catch {}
      // Falls Team nachträglich fehlt (Reset): (Re)Join versuchen mit Session (leicht gedrosselt)
      const exists2 = Array.isArray(list) && list.some(t => t.id === fixedId);
      if (!exists2) {
        const now = Date.now();
        if (now - lastJoinAtRef.current > 2000) {
          lastJoinAtRef.current = now;
          let stored = null;
          try { stored = JSON.parse(localStorage.getItem('teamSession')||'null'); } catch {}
          if (stored && stored.id === fixedId) {
            s.emit('team:join', { name: stored.name, avatar: stored.avatar });
          } else {
            s.emit('team:join', { name: defaultName, avatar: defaultAvatar });
          }
        }
      }
    };
  }, []);
  useEffect(() => {
    if (!st || st.currentCategory !== 'Elch') { lastBuzzCountRef.current = 0; return; }
    const cnt = (st.elch?.buzzOrder || []).length;
    if (cnt === 1 && lastBuzzCountRef.current === 0) {
      beepRef.current && beepRef.current();
    }
    lastBuzzCountRef.current = cnt;
  }, [st?.elch?.buzzOrder?.length, st?.currentCategory]);

  // Connect + Join
  useEffect(() => {
    const s = connectWithTeamId(fixedId);
    setIsConnected(s.connected);
    setIsReconnecting(false);
    setConnError(null);
    const onState = (g) => {
      setSt(g);
      s.emit('requestTeams');
      // Ensure session stored (in case of page reload in Team view)
      try {
        if(g && g.teams){
          const me = g.teams.find(t=> t.id === fixedId);
          if(me){
            const existing = JSON.parse(localStorage.getItem('teamSession')||'null');
            if(!existing || existing.id !== me.id){
              localStorage.setItem('teamSession', JSON.stringify({ id: me.id, name: me.name, avatar: me.avatar }));
            }
          }
        }
      } catch {}
    };
    const onTeams = (list) => {
      setTeams(list);
      // Initial-Join nur ausführen, wenn Team noch nicht existiert (z. B. direkter Aufruf der Team-URL)
      if (!didInitJoinRef.current) {
        const exists = Array.isArray(list) && list.some(t => t.id === fixedId);
        if (!exists) {
          didInitJoinRef.current = true;
          // Versuche, gespeicherte Session zu nutzen (bewahrt gewählten Avatar/Name)
          let stored = null;
          try { stored = JSON.parse(localStorage.getItem('teamSession')||'null'); } catch {}
          if (stored && stored.id === fixedId) {
            s.emit('team:join', { name: stored.name, avatar: stored.avatar });
          } else {
            // Fallback auf Defaults
            s.emit('team:join', { name: defaultName, avatar: defaultAvatar });
          }
        }
      }
    };

    // Ergebnis direkt empfangen und in den State eintragen (robust für verschiedene Strukturen)
    const onResultAnnounce = (result) => {
      // Debug: Zeige das empfangene Ergebnisobjekt in der Konsole
      console.log('[result:announce]', result);

      setSt((prev) => {
        if (!prev) return prev;
        let newResults = prev.results ? { ...prev.results } : {};

        // Versuche, nach Kategorie zu sortieren
        const catKey = result.category || prev.currentCategory || 'unknown';
        if (!catKey) return prev;

        // Falls mehrere Runden pro Kategorie: als Array speichern
        if (!Array.isArray(newResults[catKey])) newResults[catKey] = [];
        if (typeof result.roundIndex === 'number') {
          newResults[catKey][result.roundIndex] = result;
        } else {
          newResults[catKey][0] = result;
        }

        return { ...prev, results: newResults };
      });

      // NEU: Ergebnis separat merken, solange Runde/Kategorie gleich bleibt
      setLastResult(result);
      lastResultKey.current = `${result.category}#${result.roundIndex}`;
    };

    const onCategorySummary = (summary) => {
      setCategorySummary(summary);
      setShowFacts(false);
      try { navigator.vibrate && navigator.vibrate([60,40,120]); } catch {}
      // Start / restart auto-dismiss (10s)
      if (summaryTimerRef.current) {
        clearTimeout(summaryTimerRef.current);
        summaryTimerRef.current = null;
      }
      summaryTimerRef.current = setTimeout(() => {
        setCategorySummary(null);
        summaryTimerRef.current = null;
      }, 10000); // 10 Sekunden sichtbar
    };

    s.on('state:update', onState);
    s.on('teamsUpdated', onTeams);
    s.on('result:announce', onResultAnnounce);
  s.on('category:summary', onCategorySummary);
    const onServerReset = () => {
      try { lastJoinAtRef.current = 0; } catch {}
      // Re-fetch; (re)join will be attempted in onTeams if missing
      s.emit('requestState');
      s.emit('requestTeams');
    };
    s.on('server:reset', onServerReset);
    const onConnect = () => { setIsConnected(true); setIsReconnecting(false); setConnError(null); };
    const onDisconnect = () => { setIsConnected(false); };
    const onReconnectAttempt = () => { setIsReconnecting(true); setConnError(null); };
    const onReconnect = () => { setIsConnected(true); setIsReconnecting(false); setConnError(null); };
    const onConnectError = (err) => { setIsConnected(false); setIsReconnecting(false); setConnError(err?.message || 'Verbindung fehlgeschlagen'); };
    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    s.io.on('reconnect_attempt', onReconnectAttempt);
    s.io.on('reconnect', onReconnect);
    s.on('connect_error', onConnectError);

    // Initialen State/Teams anfordern; Join wird (falls nötig) im onTeams-Handler erledigt
    s.emit('requestState');
    s.emit('requestTeams');

    return () => {
      s.off('state:update', onState);
      s.off('teamsUpdated', onTeams);
      s.off('result:announce', onResultAnnounce);
  s.off('category:summary', onCategorySummary);
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
      s.io.off('reconnect_attempt', onReconnectAttempt);
      s.io.off('reconnect', onReconnect);
      s.off('connect_error', onConnectError);
  if (summaryTimerRef.current) { clearTimeout(summaryTimerRef.current); summaryTimerRef.current = null; }
      s.off('server:reset', onServerReset);
    };
  }, [fixedId, defaultName, defaultAvatar]);

  // NEU: lastResult zurücksetzen, wenn Runde/Kategorie wechselt
  useEffect(() => {
    const key = `${cat}#${roundIndex}`;
    if (lastResultKey.current !== key) {
      setLastResult(null);
      setShowLoseOverlay(false);
      setShowWinOverlay(false);
      if (hideLoseTmo.current) { clearTimeout(hideLoseTmo.current); hideLoseTmo.current = null; }
      if (hideWinTmo.current) { clearTimeout(hideWinTmo.current); hideWinTmo.current = null; }
    }
  }, [cat, roundIndex]);

  const me = useMemo(() => teams.find((t) => t.id === fixedId), [teams, fixedId]);
  const myTeamId = String(fixedId);
  const teamsById = useMemo(() => {
    const map = new Map();
    (teams || []).forEach((team) => {
      if (!team || team.id == null) return;
      map.set(String(team.id), team);
    });
    return map;
  }, [teams]);
  // Fallback: falls Team noch nicht ?ber teamsUpdated da ist, versuche gespeicherten Namen
  let fallbackName = defaultName;
  if(!me){
    try {
      const stored = localStorage.getItem('teamName:'+fixedId);
      if(stored) fallbackName = stored;
    } catch {}
  }
  // Debug: Auflösung des Team-Namens beobachten
  useEffect(() => {
    try {
      console.debug('[TeamFixed] name resolve', { fixedId, meName: me?.name, fallbackName });
    } catch {}
  }, [me?.name, fallbackName, fixedId]);
  const coins = me?.coins ?? 0;
  const quizJoker = me?.quizJoker ?? 0;

  // Keep screen awake during game (Wake Lock API)
  const wakeLockRef = useRef(null);
  useEffect(() => {
    let released = false;
    async function requestWakeLock(){
      try {
        if ('wakeLock' in navigator) {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
          wakeLockRef.current.addEventListener?.('release', () => {});
        }
      } catch {}
    }
    requestWakeLock();
    const onVis = () => { if (document.visibilityState === 'visible') requestWakeLock(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      if (!released && wakeLockRef.current) { try { wakeLockRef.current.release(); } catch {} }
      released = true;
    };
  }, []);

  // Warn on accidental leave while game running
  useEffect(() => {
    const handler = (e) => {
      if (st?.phase === 'CATEGORY' || st?.phase === 'STAKE') {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [st?.phase]);

  // Inputs leeren & Kranich/Eule initialisieren beim Wechsel
  useEffect(() => {
    if (st?.phase === 'CATEGORY') {
      // Reset generisch
      setHaseAns(['', '', '', '']);
      setRobbe({ a: 40, b: 40, c: 20 });
      setWalBid(0);
      setBaer('');
      setFuchs('');

      // Kranich vorbereiten
      if (st?.currentCategory === 'Kranich') {
        const def = KRANICH_ROUNDS[roundIndex] || KRANICH_ROUNDS[0];
        setKranichCategory(def.categories[0]?.id || '');
        setKranichOrder(def.items.slice());
      } else {
        setKranichCategory('');
        setKranichOrder(['', '', '', '']);
      }

      // Eule leeren
      setEuleRound1(Array(15).fill(''));
      setEuleRound3(Array(3).fill(''));
      setEuleRound4(Array(4).fill(''));
    }
  }, [roundKey, roundIndex, st?.currentCategory, st?.phase]);

  // Stake senden
  const sendStake = () =>
    socket.emit('team:setStake', { stake: Number(stake) || 0, useJoker });

  // --- Ensure timer calc variables exist for render (they were already computed above in the file)
  const endsAt = st?.timerEndsAt || null;
  const duration = Math.max(0, Number(st?.timerDuration || 0));
  const pausedRemaining = Math.max(0, Number(st?.timerPausedRemaining || 0));
  const remainingMs = endsAt ? Math.max(0, endsAt - now) : 0;
  const remainingSec = Math.ceil(remainingMs / 1000);
  const progress = endsAt && duration > 0 ? Math.max(0, Math.min(1, remainingMs / (duration * 1000))) : 0;

  const displayCatName = (c) => {
    if (!c) return c;
    if (c === 'Bär' || c === 'Baer') return 'Bär';
    return c;
  };

  // category body class (dark base). We keep only cat-* for accents; no pastel bg.
  useEffect(() => {
    const cls = catKey(st?.currentCategory);
    const catAll = ['cat-baer','cat-eule','cat-elch','cat-fuchs','cat-hase','cat-kranich','cat-robbe','cat-wal'];
    // remove any previous category/pastel
    document.body.classList.remove(...catAll, 'bg-category', 'theme-lobby','theme-baer','theme-eule','theme-elch','theme-fuchs','theme-hase','theme-kranich','theme-robbe','theme-wal');
    if (cls) {
      document.body.classList.add(`cat-${cls}`);
    }
    return () => {
      if (cls) document.body.classList.remove(`cat-${cls}`);
    };
  }, [st?.currentCategory, st?.phase]);

  // NEU: Merker ob Timer je aktiv war
  useEffect(() => {
    if (endsAt && endsAt > now) setTimerWasActive(true);
    if (st?.phase !== 'CATEGORY') setTimerWasActive(false);
  }, [endsAt, now, st?.phase]);

  // Trigger intro when a new category starts (phase enters STAKE with a category)
  useEffect(() => {
    const catName = st?.currentCategory || null;
    const phaseNow = st?.phase || 'LOBBY';
    if (catName && phaseNow === 'STAKE') {
      if (prevCatRef.current !== catName || prevPhaseRef.current !== 'STAKE') {
        const k = catKey(catName);
        setCatIntro({ k, ts: Date.now(), name: catName });
        // auto hide after ~2.3s (longer, more readable on mobile)
        const t = setTimeout(() => setCatIntro(null), 2300);
        return () => clearTimeout(t);
      }
    }
    prevCatRef.current = catName;
    prevPhaseRef.current = phaseNow;
  }, [st?.currentCategory, st?.phase]);

  // NEU: Pause-Status synchronisieren (wenn Admin pausiert)
  useEffect(() => {
    // Wenn der Timer gestoppt wird, aber duration gesetzt bleibt, merken wir uns die Restzeit
    if (!endsAt && pausedRemaining > 0 && st?.phase === 'CATEGORY') {
      // Nur setzen, wenn nicht schon pausiert
      if (!pausedAt) {
        // Restzeit aus duration (falls AdminView pausiert hat)
        setPausedAt({ remaining: pausedRemaining });
      }
    } else {
      // Wenn Timer wieder läuft, Pause aufheben
      if (endsAt && endsAt > now && pausedAt) setPausedAt(null);
      // Wenn Phase wechselt, Pause aufheben
      if (st?.phase !== 'CATEGORY' && pausedAt) setPausedAt(null);
    }
  }, [endsAt, pausedRemaining, st?.phase, now, pausedAt]);

  // NEU: Eingabe gesperrt, wenn Timer gestoppt wurde (aber nur falls Timer je aktiv war)
  const inputLocked = st?.phase === 'CATEGORY' && timerWasActive && (!endsAt || endsAt < now);

  // KRANICH helpers
  const moveUp = (i) => {
    if (i <= 0) return;
    const a = [...kranichOrder];
    [a[i - 1], a[i]] = [a[i], a[i - 1]];
    setKranichOrder(a);
  };
  const moveDown = (i) => {
    if (i >= kranichOrder.length - 1) return;
    const a = [...kranichOrder];
    [a[i + 1], a[i]] = [a[i], a[i + 1]];
    setKranichOrder(a);
  };
  const kranichSubmit = () =>
    socket.emit('team:kranich:submit', {
      category: kranichCategory,
      order: kranichOrder,
    });

  // Eule submit ? Mapping: 0?r1, 1?r3, 2?r4
  const euleSubmit = () => {
    if (roundIndex === 0) {
      socket.emit('team:eule:submit', { r1: euleRound1 });
    } else if (roundIndex === 1) {
      socket.emit('team:eule:submit', { r3: euleRound3 });
    } else if (roundIndex === 2) {
      socket.emit('team:eule:submit', { r4: euleRound4 });
    } else {
      socket.emit('team:eule:submit', {}); // safety
    }
  };

  // Hilfsfunktion: Hole das Ergebnis-Objekt für die aktuelle Kategorie/Runde (robust für alle Strukturen)
  function getCurrentResult() {
    // Zuerst: lastResult, falls passend
    if (lastResult && lastResult.category === cat && lastResult.roundIndex === roundIndex) {
      return lastResult;
    }
    if (!st) return null;
    // 1. Suche nach st.results als Objekt mit Kategorie-Schlüssel
    if (st.results && typeof st.results === 'object' && cat && st.results[cat]) {
      if (Array.isArray(st.results[cat])) {
        return st.results[cat][roundIndex] || null;
      }
      // Falls nur ein Objekt pro Kategorie
      return st.results[cat];
    }
    // 2. Suche nach st.results als Array (legacy)
    if (Array.isArray(st.results) && typeof roundIndex === 'number') {
      const res = st.results[roundIndex];
      if (res && (res.category === cat || !res.category)) return res;
    }
    // 3. Suche nach st.result (Fallback)
    if (st.result && st.result.category === cat) return st.result;
    // 4. Fallback: Suche nach einem Ergebnisobjekt, das winnerId für mein Team enthält
    if (st.results && typeof st.results === 'object') {
      for (const key in st.results) {
        const entry = st.results[key];
        if (Array.isArray(entry)) {
          for (const r of entry) {
            if (r && r.winnerId && (r.category === cat || !r.category) && typeof r.roundIndex === 'number' && r.roundIndex === roundIndex) {
              return r;
            }
          }
        } else if (entry && entry.winnerId && (entry.category === cat || !entry.category)) {
          return entry;
        }
      }
    }
    return null;
  }

  // Hilfsfunktion: Meta-Infos zur aktuellen Runde (Gewinner, eigener Status, Auszahlungen)
  const resultMeta = useMemo(() => {
    const meta = { outcome: null, winners: [], myGain: null, others: [] };
    const res = getCurrentResult();
    if (!res) return meta;
    const winnerSet = new Set();
    if (Array.isArray(res.winnerIds)) {
      res.winnerIds.forEach((id) => {
        if (id === null || id === undefined) return;
        winnerSet.add(String(id));
      });
    }
    if (res.winnerId !== undefined && res.winnerId !== null) {
      winnerSet.add(String(res.winnerId));
    }
    meta.winners = Array.from(winnerSet);
    if (meta.winners.length) {
      if (meta.winners.includes(myTeamId)) {
        meta.outcome = meta.winners.length > 1 ? 'share' : 'win';
      } else {
        meta.outcome = 'lose';
      }
    }
    const distributed = Array.isArray(res.distributed) ? res.distributed : [];
    const myEntry = distributed.find((entry) => entry && String(entry.id) === myTeamId);
    if (myEntry && typeof myEntry.gain === 'number') {
      meta.myGain = myEntry.gain;
    }
    meta.others = meta.winners
      .filter((id) => id !== myTeamId)
      .map((id) => teamsById.get(id)?.name)
      .filter(Boolean);
    return meta;
  }, [cat, roundIndex, lastResult, myTeamId, teamsById, st?.roundResolved, st?.results]);

  const roundOutcome = resultMeta.outcome;

// Rückmeldungstexte für jede Kategorie
  const resultFeedback = useMemo(() => {
    if (!roundOutcome) return null;
    const isShare = roundOutcome === 'share';
    const isWin = roundOutcome === 'win';
    const isLose = roundOutcome === 'lose';
    const emoji = isShare ? '??' : (isWin ? '??' : '??');
    const catLabel = cat ? `${cat}-Runde` : 'Runde';
    const joinNames = (names = []) => {
      if (!names.length) return '';
      if (names.length === 1) return names[0];
      if (names.length === 2) return `${names[0]} und ${names[1]}`;
      return `${names.slice(0, -1).join(', ')} und ${names[names.length - 1]}`;
    };
    const others = resultMeta.others;
    let msg = '';
    if (isShare) {
      const withText = others.length ? ` zusammen mit ${joinNames(others)}` : '';
      msg = `Ihr teilt euch den Pot in der ${catLabel}${withText}!`;
    } else if (isWin) {
      switch (cat) {
        case 'Hase':
          msg = 'Glückwunsch! Ihr habt diese Hase-Runde gewonnen und den Punkt geholt.';
          break;
        case 'Kranich':
          msg = 'Super! Ihr habt die Kranich-Runde gewonnen und den Punkt erhalten.';
          break;
        case 'Robbe':
          msg = 'Stark! Ihr habt die Robbe-Runde gewonnen und den Punkt geholt.';
          break;
        case 'Eule':
          msg = 'Klasse! Ihr habt die Eule-Runde gewonnen und den Punkt erhalten.';
          break;
        case 'Wal':
          msg = 'Ihr habt die Wal-Runde gewonnen und den Punkt geholt!';
          break;
        case 'Elch':
          msg = 'Ihr wart beim Elch am schnellsten und habt den Punkt geholt!';
          break;
        case 'Bär':
          msg = 'Sehr gut! Ihr habt die Bär-Runde gewonnen und den Punkt erhalten.';
          break;
        case 'Fuchs':
          msg = 'Ihr habt die Fuchs-Runde gewonnen und den Punkt geholt!';
          break;
        default:
          msg = 'Ihr habt diese Runde gewonnen!';
      }
    } else if (isLose) {
      const sharedWin = resultMeta.winners.length > 1;
      if (sharedWin) {
        const shareTxt = others.length ? `${joinNames(others)} teilen sich den Pot.` : 'Andere Teams teilen sich den Pot.';
        msg = `${shareTxt} Ihr geht diesmal leer aus.`;
      } else {
        switch (cat) {
          case 'Hase':
            msg = 'Leider hat das andere Team diese Hase-Runde gewonnen.';
            break;
          case 'Kranich':
            msg = 'Schade, das andere Team war bei Kranich besser.';
            break;
          case 'Robbe':
            msg = 'Leider hat das andere Team die Robbe-Runde gewonnen.';
            break;
          case 'Eule':
            msg = 'Das andere Team war bei Eule erfolgreicher.';
            break;
          case 'Wal':
            msg = 'Das andere Team hat die Wal-Runde gewonnen.';
            break;
          case 'Elch':
            msg = 'Das andere Team war beim Elch schneller.';
            break;
          case 'Bär':
            msg = 'Das andere Team war bei Bär näher dran.';
            break;
          case 'Fuchs':
            msg = 'Das andere Team war bei Fuchs besser.';
            break;
          default:
            msg = 'Leider hat das andere Team diese Runde gewonnen.';
        }
      }
    }
    if (!msg) {
      msg = isWin ? 'Ihr habt diese Runde gewonnen!' : 'Leider hat das andere Team diese Runde gewonnen.';
    }
    const classes = ['result-feedback', isLose ? 'lose' : 'win'];
    if (isShare) classes.push('share');
    return (
      <div className={classes.join(' ')}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>{emoji}</div>
        <div>{msg}</div>
      </div>
    );
  }, [cat, roundOutcome, resultMeta]);

// Show foreground overlay for win/lose for 10s when a winner is announced
  useEffect(() => {
    if (!lastResult) return;
    const winners = [];
    if (Array.isArray(lastResult.winnerIds)) {
      lastResult.winnerIds.forEach((id) => {
        if (id === null || id === undefined) return;
        winners.push(String(id));
      });
    }
    if (lastResult.winnerId !== undefined && lastResult.winnerId !== null) {
      winners.push(String(lastResult.winnerId));
    }
    if (!winners.length) return;
    if (winners.includes(myTeamId)) {
      setShowWinOverlay(true);
      if (hideWinTmo.current) clearTimeout(hideWinTmo.current);
      hideWinTmo.current = setTimeout(() => {
        setShowWinOverlay(false);
        hideWinTmo.current = null;
      }, 5000);
    } else {
      setShowLoseOverlay(true);
      if (hideLoseTmo.current) clearTimeout(hideLoseTmo.current);
      hideLoseTmo.current = setTimeout(() => {
        setShowLoseOverlay(false);
        hideLoseTmo.current = null;
      }, 5000);
    }
  }, [lastResult, myTeamId]);

  // Rotate fun facts in LOBBY every 10s (randomized, avoid immediate repeat)
  // On mount (or when facts are enabled), pick a random starting fact
  useEffect(() => {
    if (st?.phase === 'LOBBY' && showFacts) {
      const len = (Array.isArray(FUN_FACTS) ? FUN_FACTS.length : 0) || 1;
      if (len > 1) {
        const n = Math.floor(Math.random() * len);
        setFactIdx(n);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showFacts, st?.phase]);
  useEffect(() => {
    if (st?.phase !== 'LOBBY' || !showFacts || factsPaused) return;
    const len = (Array.isArray(FUN_FACTS) ? FUN_FACTS.length : 0) || 1;
    const id = setInterval(() => {
      setFactIdx((prev) => {
        if (len <= 1) return 0;
        let n = Math.floor(Math.random() * len);
        if (n === prev) n = (n + 1) % len;
        try { navigator.vibrate && navigator.vibrate(10); } catch {}
        return n;
      });
    }, 10000);
    return () => clearInterval(id);
  }, [st?.phase, showFacts, factsPaused]);

  const nextFact = () => {
    const len = (Array.isArray(FUN_FACTS) ? FUN_FACTS.length : 0) || 1;
    if (len <= 1) return;
    setFactIdx((p) => (p + 1) % len);
    try { navigator.vibrate && navigator.vibrate(12); } catch {}
  };
  const prevFact = () => {
    const len = (Array.isArray(FUN_FACTS) ? FUN_FACTS.length : 0) || 1;
    if (len <= 1) return;
    setFactIdx((p) => (p - 1 + len) % len);
    try { navigator.vibrate && navigator.vibrate(12); } catch {}
  };
  const toggleFactsPaused = () => {
    setFactsPaused((v) => {
      const nv = !v;
      try { navigator.vibrate && navigator.vibrate(nv ? 6 : 8); } catch {}
      return nv;
    });
  };

  // -------- RENDER --------
  const [entered, setEntered] = useState(false);
  useEffect(()=>{ const id = requestAnimationFrame(()=> setEntered(true)); return ()=> cancelAnimationFrame(id); }, []);
  return (
    // add phase class + intro-on flag while category intro runs
    <div className={`app-shell team-fixed fade-in-transition phase-${(phase||'').toLowerCase()} ${catIntro ? 'intro-on' : ''} ${entered?'entered':''}`} style={{ paddingBottom: phase === 'STAKE' ? '96px' : undefined }}>
      {/* Soft blurred backgrounds: team avatar + category icon */}
      {me?.avatar && (
        <div className="team-bg-avatar" aria-hidden style={{ backgroundImage: `url(${me.avatar})` }} />
      )}
      {st?.currentCategory && (()=>{ const k = catKey(st.currentCategory); return (
        <div className="category-bg-icon" aria-hidden style={{ backgroundImage: `url(/categories/${k}.png)` }} />
      ); })()}
      {st?.currentCategory && (()=>{ const k = catKey(st.currentCategory); return (
        <div className="cat-badge" aria-hidden style={{ backgroundImage: `url(/categories/${k}.png)` }} />
      ); })()}
      {/* Header */}
      <header className="app-header category-header">
        <div className="left-head" style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
          <div
            className={`avatar-wrap ${isReconnecting ? 'status-reconnecting' : (isConnected ? 'status-ok' : 'status-down')}`}
            aria-label={isReconnecting ? 'Verbindung wird wiederhergestellt' : (isConnected ? 'Verbunden' : 'Getrennt')}
            title={isReconnecting ? 'Reconnecting' : (isConnected ? 'Online' : 'Offline')}
            role="status"
          >
            <Avatar src={assetUrl(me?.avatar ?? defaultAvatar)} className="team-header-avatar" />
          </div>
          <div className="team-meta" style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <div
              className={`team-name ${((me?.name || fallbackName)?.length > 10) ? 'two-line' : ''}`}
              style={{ fontSize: '1.24rem', fontWeight: 900 }}
            >
              {me?.name || fallbackName}
            </div>
            {(() => {
            const payout = Math.floor((st?.categoryPot || 0) / 3);
            const overlayGain = resultMeta.myGain ?? payout;
            const k = catKey(st?.currentCategory);
            const title = showWinOverlay
              ? (roundOutcome === 'share' ? 'Pot geteilt!' : 'Runde gewonnen!')
              : 'Runde verloren';
            return (
              <div className={`result-overlay__dialog round-result ${showWinOverlay ? 'win' : 'lose'} cat-${k || ''}`}>
                <CoinRain type={showWinOverlay ? 'win' : 'lose'} />
                {k && (
                  <img
                    className="category-icon lg"
                    src={`/categories/${k}.png`}
                    alt={cat || 'Kategorie'}
                    onError={(e)=>{ if(!e.currentTarget.dataset.fallbackSvg){ e.currentTarget.dataset.fallbackSvg='1'; e.currentTarget.onerror=null; e.currentTarget.src=`/categories/${k}.svg`; } }}
                  />
                )}
                {showWinOverlay && (
                  <div className="rr-badge">
                    <span className="icon coin coin-sm" aria-hidden />+{overlayGain}
                  </div>
                )}
                <h3 className="rr-title">{title}</h3>
                {showWinOverlay && roundOutcome === 'share' && (
                  <div className="rr-sub">Ihr teilt euch den Pot.</div>
                )}
                {!showWinOverlay && resultMeta.winners.length > 1 && (
                  <div className="rr-sub">Andere Teams teilen sich den Pot.</div>
                )}
              </div>
            );
          })()}
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <button
                className="btn btn-cta"
                onClick={() => { socket.emit('team:hase:submit', { answers: haseAns }); if(!editMode) setEditMode(false); }}
                disabled={inputLocked || submissionLocked}
              >{sendLabel}</button>
              {hasSubmitted && !inputLocked && !roundResolved && (
                <button className="btn" type="button" onClick={()=>setEditMode(e=>!e)}>
                  {editMode ? 'Fertig' : 'Bearbeiten'}
                </button>
              )}
            </div>
          </section>
        )}

        {/* Kranich */}
        {phase === 'CATEGORY' && cat === 'Kranich' && (
          <section className="card">
            <h3>Kranich ? {(KRANICH_ROUNDS[roundIndex] || KRANICH_ROUNDS[0]).title}</h3>
            {(endsAt && endsAt > now && !pausedAt && pausedRemaining===0) && (
              <div className={`timer active ${remainingSec<=10 ? 'low' : ''}`}>
                <div className="timer-bar" style={{ transform: `scaleX(${Math.max(0, Math.min(1, progress))})` }} />
                <div className="timer-label">{remainingSec > 0 ? `${remainingSec}s` : '-'}</div>
              </div>
            )}

            <label className="label" htmlFor="kranich-category">Sortierkategorie</label>
            <select
              id="kranich-category"
              name="kranich_category"
              className="select"
              value={kranichCategory}
              onChange={(e) => setKranichCategory(e.target.value)}
            >
              {(KRANICH_ROUNDS[roundIndex] || KRANICH_ROUNDS[0]).categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>

            <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
              {kranichOrder.map((v, i) => (
                <div
                  key={i}
                  className={`row drag-row ${dragIdx===i ? 'dragging' : ''}`}
                  style={{ justifyContent: 'space-between' }}
                  draggable
                  onDragStart={(e) => { e.dataTransfer.setData('text/plain', String(i)); }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const from = Number(e.dataTransfer.getData('text/plain'));
                    if (Number.isNaN(from) || from === i) return;
                    const a = [...kranichOrder];
                    const [item] = a.splice(from, 1);
                    a.splice(i, 0, item);
                    setKranichOrder(a);
                  }}
                  onTouchStart={onTouchStartRow(i)}
                  onTouchMove={onTouchMoveRow(i)}
                  onTouchEnd={onTouchEndRow}
                >
                  <div style={{ flex: 1, padding: '0 8px', fontWeight: 600 }}>{v || <span style={{ opacity:.4 }}>Element wählen / Reihenfolge anpassen</span>}</div>
                  <div className="row">
                    <button className="btn" disabled={i === 0} onClick={() => moveUp(i)}>
                      ?
                    </button>
                    <button
                      className="btn"
                      disabled={i === kranichOrder.length - 1}
                      onClick={() => moveDown(i)}
                    >
                      ?
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn btn-cta" onClick={kranichSubmit} disabled={inputLocked || submissionLocked}>{sendLabel}</button>
              {hasSubmitted && !inputLocked && !roundResolved && (
                <button className="btn" type="button" onClick={()=>setEditMode(e=>!e)}>{editMode ? 'Fertig':'Bearbeiten'}</button>
              )}
            </div>
          </section>
        )}

        {/* Robbe */}
    {phase === 'CATEGORY' && cat === 'Robbe' && (
          <section className="card">
      <h3>Robbe ? Runde {Number(roundIndex) + 1}</h3>
            {(endsAt && endsAt > now && !pausedAt && pausedRemaining===0) && (
              <div className={`timer active ${remainingSec<=10 ? 'low' : ''}`}>
                <div className="timer-bar" style={{ transform: `scaleX(${Math.max(0, Math.min(1, progress))})` }} />
                <div className="timer-label">{remainingSec > 0 ? `${remainingSec}s` : '-'}</div>
              </div>
            )}
    <div className="muted" style={{ marginTop: -6, marginBottom: 8 }}>Verteile maximal 100% (nur 5%-Schritte). Rest: <b>{Math.max(0, 100 - robbeTotal)}%</b></div>
            {['a', 'b', 'c'].map((k) => (
              <div key={k} className="row">
                <span className="pill">{k.toUpperCase()}</span>
                <input
                  type="number"
                  id={`robbe-${k}`}
                  name={`robbe_${k}`}
                  className="input"
                  inputMode="numeric"
      step={5}
      min={0}
      max={100}
                  aria-label={`Prozent Option ${k.toUpperCase()}`}
                  value={robbe[k]}
                  onChange={(e) => setRobbeClamped(k, e.target.value)}
                />
                <span>%</span>
              </div>
            ))}
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn btn-cta" onClick={() => socket.emit('team:robbe:submit', { perc: robbe })} disabled={inputLocked || submissionLocked}>{sendLabel}</button>
              {hasSubmitted && !inputLocked && !roundResolved && (
                <button className="btn" type="button" onClick={()=>setEditMode(e=>!e)}>{editMode ? 'Fertig':'Bearbeiten'}</button>
              )}
            </div>
          </section>
        )}

        {/* Eule */}
    {phase === 'CATEGORY' && cat === 'Eule' && (
          <section className="card">
      <h3>Eule ? Runde {Number(roundIndex) + 1}</h3>
            {(endsAt && endsAt > now && !pausedAt && pausedRemaining===0) && (
              <div className={`timer active ${remainingSec<=10 ? 'low' : ''}`}>
                <div className="timer-bar" style={{ transform: `scaleX(${Math.max(0, Math.min(1, progress))})` }} />
                <div className="timer-label">{remainingSec > 0 ? `${remainingSec}s` : '-'}</div>
              </div>
            )}

            {roundIndex === 0 && (
              <>
                <p className="muted" style={{ marginTop: -6 }}>
                  Nenne so viele Animationsfilme wie möglich (bis zu 15).
                </p>
                <div className="grid3">
                  {euleRound1.map((v, i) => (
                    <input
                      key={i}
                      id={`eule-r1-${i + 1}`}
                      name={`eule_r1_${i + 1}`}
                      className="input"
                      placeholder={`Film ${i + 1}`}
                      aria-label={`Film ${i + 1}`}
                      autoComplete="off"
                      value={v}
                      onChange={(e) => {
                        const arr = [...euleRound1];
                        arr[i] = e.target.value;
                        setEuleRound1(arr);
                      }}
                    />
                  ))}
                </div>
                <div className="row" style={{ marginTop: 12 }}>
                  <button className="btn btn-cta" onClick={euleSubmit} disabled={inputLocked || submissionLocked}>{sendLabel}</button>
                  {hasSubmitted && !inputLocked && !roundResolved && (
                    <button className="btn" type="button" onClick={()=>setEditMode(e=>!e)}>{editMode ? 'Fertig':'Bearbeiten'}</button>
                  )}
                </div>
              </>
            )}

            {roundIndex === 1 && (
              <>
                <p className="muted" style={{ marginTop: -6 }}>
                  Erkenne die 3 unkenntlichen Poster (links ? rechts).
                </p>
                <div className="grid3">
                  {euleRound3.map((v, i) => (
                    <input
                      key={i}
                      id={`eule-r3-${i + 1}`}
                      name={`eule_r3_${i + 1}`}
                      className="input"
                      placeholder={`Poster ${i + 1}`}
                      aria-label={`Poster ${i + 1}`}
                      autoComplete="off"
                      value={v}
                      onChange={(e) => {
                        const arr = [...euleRound3];
                        arr[i] = e.target.value;
                        setEuleRound3(arr);
                      }}
                    />
                  ))}
                </div>
                <div className="row" style={{ marginTop: 12 }}>
                  <button className="btn btn-cta" onClick={euleSubmit} disabled={inputLocked || submissionLocked}>{sendLabel}</button>
                  {hasSubmitted && !inputLocked && !roundResolved && (
                    <button className="btn" type="button" onClick={()=>setEditMode(e=>!e)}>{editMode ? 'Fertig':'Bearbeiten'}</button>
                  )}
                </div>
              </>
            )}

            {roundIndex === 2 && (
              <>
                <p className="muted" style={{ marginTop: -6 }}>
                  Erkenne, was auf den 4 Postern fehlt (links ? rechts).
                </p>
                <div className="grid2">
                  {euleRound4.map((v, i) => (
                    <input
                      key={i}
                      id={`eule-r4-${i + 1}`}
                      name={`eule_r4_${i + 1}`}
                      className="input"
                      placeholder={`Poster ${i + 1}`}
                      aria-label={`Poster ${i + 1}`}
                      autoComplete="off"
                      value={v}
                      onChange={(e) => {
                        const arr = [...euleRound4];
                        arr[i] = e.target.value;
                        setEuleRound4(arr);
                      }}
                    />
                  ))}
                </div>
                <div className="row" style={{ marginTop: 12 }}>
                  <button className="btn btn-cta" onClick={euleSubmit} disabled={inputLocked || submissionLocked}>{sendLabel}</button>
                  {hasSubmitted && !inputLocked && !roundResolved && (
                    <button className="btn" type="button" onClick={()=>setEditMode(e=>!e)}>{editMode ? 'Fertig':'Bearbeiten'}</button>
                  )}
                </div>
              </>
            )}
          </section>
        )}

        {/* Wal */}
    {phase === 'CATEGORY' && cat === 'Wal' && (
          <section className="card">
      <h3>Wal ? Runde {Number(roundIndex) + 1}</h3>
            {(endsAt && endsAt > now && !pausedAt && pausedRemaining===0) && (
              <div className={`timer active ${remainingSec<=10 ? 'low' : ''}`}>
                <div className="timer-bar" style={{ transform: `scaleX(${Math.max(0, Math.min(1, progress))})` }} />
                <div className="timer-label">{remainingSec > 0 ? `${remainingSec}s` : '-'}</div>
              </div>
            )}
            <label className="label" htmlFor="wal-bid">Gebot</label>
            <input
              type="number"
              id="wal-bid"
              name="wal_bid"
              className="input"
              inputMode="numeric"
              value={walBid}
              onChange={(e) => setWalBid(e.target.value)}
            />
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn btn-cta" onClick={() => socket.emit('team:wal:submit', { bid: Number(walBid) || 0 })} disabled={inputLocked || submissionLocked}>{sendLabel}</button>
              {hasSubmitted && !inputLocked && !roundResolved && (
                <button className="btn" type="button" onClick={()=>setEditMode(e=>!e)}>{editMode ? 'Fertig':'Bearbeiten'}</button>
              )}
            </div>
          </section>
        )}

        {/* --- ELCH --- */}
        {phase === 'CATEGORY' && cat === 'Elch' && (
          <>
    {/* Floating timer rendered via portal; only while running (hide on stop) */}
  {(endsAt && endsAt > now) && typeof document !== 'undefined' && createPortal(
              (
                <div
      className={`timer active floating ${(remainingSec <= 10) ? 'low' : ''}`}
                  style={{
                    position: 'fixed',
        top: 'max(74px, calc(env(safe-area-inset-top) + 68px))',
                    left: '50%',
                    transform: 'translateX(-50%)',
        width: 'min(520px, 92vw)',
                    zIndex: 2147483601,
                    pointerEvents: 'none',
                  }}
                  aria-live="polite"
                >
      <div className="timer-bar" style={{ transform: `scaleX(${Math.max(0, Math.min(1, progress))})` }} />
      <div className="timer-label">{remainingSec > 0 ? `${remainingSec}s` : '-'}</div>
                </div>
              ),
              document.body
            )}
            <section className="card" data-elch-panel style={{ position:'relative' }}>
              <h3>Elch ? Runde {Number(roundIndex) + 1}</h3>
              {(endsAt && endsAt > now && !pausedAt && pausedRemaining===0) && (
                <div className={`timer active ${remainingSec<=10 ? 'low' : ''}`}>
                  <div className="timer-bar" style={{ transform: `scaleX(${Math.max(0, Math.min(1, progress))})` }} />
                  <div className="timer-label">{remainingSec > 0 ? `${remainingSec}s` : '-'}</div>
                </div>
              )}
              {(st?.elch?.category || st?.elch?.exhausted) && (
                <div className="muted" style={{ marginTop: -6, textAlign:'center', width:'100%', fontSize:'1rem', fontWeight:700 }}>
                  {st?.elch?.category || '? Pool erschöpft ?'}
                </div>
              )}
              <div className="muted" style={{ marginTop: 12, textAlign:'center' }}>
                {st?.elch?.exhausted
                  ? 'Alle Sprachen verbraucht.'
                  : (!st?.elch?.category
                      ? 'Warten bis Sprache gezogen.' // Placeholder ohne "Admin" Wortlaut
                      : (() => {
                          const myBuzz = Array.isArray(st?.elch?.buzzOrder) && st.elch.buzzOrder.some(b => b.teamId === fixedId);
                          if (myBuzz) return 'Du hast gebuzzert ? warte auf Entscheidung.';
                          if (st?.elch?.buzzLocked) return 'Ein anderes Team war schneller.';
                          return 'Buzz ist frei.';
                        })()
                    )}
              </div>
            </section>
            {(() => {
            const payout = Math.floor((st?.categoryPot || 0) / 3);
            const overlayGain = resultMeta.myGain ?? payout;
            const k = catKey(st?.currentCategory);
            const title = showWinOverlay
              ? (roundOutcome === 'share' ? 'Pot geteilt!' : 'Runde gewonnen!')
              : 'Runde verloren';
            return (
              <div className={`result-overlay__dialog round-result ${showWinOverlay ? 'win' : 'lose'} cat-${k || ''}`}>
                <CoinRain type={showWinOverlay ? 'win' : 'lose'} />
                {k && (
                  <img
                    className="category-icon lg"
                    src={`/categories/${k}.png`}
                    alt={cat || 'Kategorie'}
                    onError={(e)=>{ if(!e.currentTarget.dataset.fallbackSvg){ e.currentTarget.dataset.fallbackSvg='1'; e.currentTarget.onerror=null; e.currentTarget.src=`/categories/${k}.svg`; } }}
                  />
                )}
                {showWinOverlay && (
                  <div className="rr-badge">
                    <span className="icon coin coin-sm" aria-hidden />+{overlayGain}
                  </div>
                )}
                <h3 className="rr-title">{title}</h3>
                {showWinOverlay && roundOutcome === 'share' && (
                  <div className="rr-sub">Ihr teilt euch den Pot.</div>
                )}
                {!showWinOverlay && resultMeta.winners.length > 1 && (
                  <div className="rr-sub">Andere Teams teilen sich den Pot.</div>
                )}
              </div>
            );
          })()}
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <button
                className="btn btn-cta"
                onClick={() => { socket.emit('team:hase:submit', { answers: haseAns }); if(!editMode) setEditMode(false); }}
                disabled={inputLocked || submissionLocked}
              >{sendLabel}</button>
              {hasSubmitted && !inputLocked && !roundResolved && (
                <button className="btn" type="button" onClick={()=>setEditMode(e=>!e)}>
                  {editMode ? 'Fertig' : 'Bearbeiten'}
                </button>
              )}
            </div>
          </section>
        )}

        {/* Kranich */}
        {phase === 'CATEGORY' && cat === 'Kranich' && (
          <section className="card">
            <h3>Kranich ? {(KRANICH_ROUNDS[roundIndex] || KRANICH_ROUNDS[0]).title}</h3>
            {(endsAt && endsAt > now && !pausedAt && pausedRemaining===0) && (
              <div className={`timer active ${remainingSec<=10 ? 'low' : ''}`}>
                <div className="timer-bar" style={{ transform: `scaleX(${Math.max(0, Math.min(1, progress))})` }} />
                <div className="timer-label">{remainingSec > 0 ? `${remainingSec}s` : '-'}</div>
              </div>
            )}

            <label className="label" htmlFor="kranich-category">Sortierkategorie</label>
            <select
              id="kranich-category"
              name="kranich_category"
              className="select"
              value={kranichCategory}
              onChange={(e) => setKranichCategory(e.target.value)}
            >
              {(KRANICH_ROUNDS[roundIndex] || KRANICH_ROUNDS[0]).categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>

            <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
              {kranichOrder.map((v, i) => (
                <div
                  key={i}
                  className={`row drag-row ${dragIdx===i ? 'dragging' : ''}`}
                  style={{ justifyContent: 'space-between' }}
                  draggable
                  onDragStart={(e) => { e.dataTransfer.setData('text/plain', String(i)); }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const from = Number(e.dataTransfer.getData('text/plain'));
                    if (Number.isNaN(from) || from === i) return;
                    const a = [...kranichOrder];
                    const [item] = a.splice(from, 1);
                    a.splice(i, 0, item);
                    setKranichOrder(a);
                  }}
                  onTouchStart={onTouchStartRow(i)}
                  onTouchMove={onTouchMoveRow(i)}
                  onTouchEnd={onTouchEndRow}
                >
                  <div style={{ flex: 1, padding: '0 8px', fontWeight: 600 }}>{v || <span style={{ opacity:.4 }}>Element wählen / Reihenfolge anpassen</span>}</div>
                  <div className="row">
                    <button className="btn" disabled={i === 0} onClick={() => moveUp(i)}>
                      ?
                    </button>
                    <button
                      className="btn"
                      disabled={i === kranichOrder.length - 1}
                      onClick={() => moveDown(i)}
                    >
                      ?
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn btn-cta" onClick={kranichSubmit} disabled={inputLocked || submissionLocked}>{sendLabel}</button>
              {hasSubmitted && !inputLocked && !roundResolved && (
                <button className="btn" type="button" onClick={()=>setEditMode(e=>!e)}>{editMode ? 'Fertig':'Bearbeiten'}</button>
              )}
            </div>
          </section>
        )}

        {/* Robbe */}
    {phase === 'CATEGORY' && cat === 'Robbe' && (
          <section className="card">
      <h3>Robbe ? Runde {Number(roundIndex) + 1}</h3>
            {(endsAt && endsAt > now && !pausedAt && pausedRemaining===0) && (
              <div className={`timer active ${remainingSec<=10 ? 'low' : ''}`}>
                <div className="timer-bar" style={{ transform: `scaleX(${Math.max(0, Math.min(1, progress))})` }} />
                <div className="timer-label">{remainingSec > 0 ? `${remainingSec}s` : '-'}</div>
              </div>
            )}
    <div className="muted" style={{ marginTop: -6, marginBottom: 8 }}>Verteile maximal 100% (nur 5%-Schritte). Rest: <b>{Math.max(0, 100 - robbeTotal)}%</b></div>
            {['a', 'b', 'c'].map((k) => (
              <div key={k} className="row">
                <span className="pill">{k.toUpperCase()}</span>
                <input
                  type="number"
                  id={`robbe-${k}`}
                  name={`robbe_${k}`}
                  className="input"
                  inputMode="numeric"
      step={5}
      min={0}
      max={100}
                  aria-label={`Prozent Option ${k.toUpperCase()}`}
                  value={robbe[k]}
                  onChange={(e) => setRobbeClamped(k, e.target.value)}
                />
                <span>%</span>
              </div>
            ))}
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn btn-cta" onClick={() => socket.emit('team:robbe:submit', { perc: robbe })} disabled={inputLocked || submissionLocked}>{sendLabel}</button>
              {hasSubmitted && !inputLocked && !roundResolved && (
                <button className="btn" type="button" onClick={()=>setEditMode(e=>!e)}>{editMode ? 'Fertig':'Bearbeiten'}</button>
              )}
            </div>
          </section>
        )}

        {/* Eule */}
    {phase === 'CATEGORY' && cat === 'Eule' && (
          <section className="card">
      <h3>Eule ? Runde {Number(roundIndex) + 1}</h3>
            {(endsAt && endsAt > now && !pausedAt && pausedRemaining===0) && (
              <div className={`timer active ${remainingSec<=10 ? 'low' : ''}`}>
                <div className="timer-bar" style={{ transform: `scaleX(${Math.max(0, Math.min(1, progress))})` }} />
                <div className="timer-label">{remainingSec > 0 ? `${remainingSec}s` : '-'}</div>
              </div>
            )}

            {roundIndex === 0 && (
              <>
                <p className="muted" style={{ marginTop: -6 }}>
                  Nenne so viele Animationsfilme wie möglich (bis zu 15).
                </p>
                <div className="grid3">
                  {euleRound1.map((v, i) => (
                    <input
                      key={i}
                      id={`eule-r1-${i + 1}`}
                      name={`eule_r1_${i + 1}`}
                      className="input"
                      placeholder={`Film ${i + 1}`}
                      aria-label={`Film ${i + 1}`}
                      autoComplete="off"
                      value={v}
                      onChange={(e) => {
                        const arr = [...euleRound1];
                        arr[i] = e.target.value;
                        setEuleRound1(arr);
                      }}
                    />
                  ))}
                </div>
                <div className="row" style={{ marginTop: 12 }}>
                  <button className="btn btn-cta" onClick={euleSubmit} disabled={inputLocked || submissionLocked}>{sendLabel}</button>
                  {hasSubmitted && !inputLocked && !roundResolved && (
                    <button className="btn" type="button" onClick={()=>setEditMode(e=>!e)}>{editMode ? 'Fertig':'Bearbeiten'}</button>
                  )}
                </div>
              </>
            )}

            {roundIndex === 1 && (
              <>
                <p className="muted" style={{ marginTop: -6 }}>
                  Erkenne die 3 unkenntlichen Poster (links ? rechts).
                </p>
                <div className="grid3">
                  {euleRound3.map((v, i) => (
                    <input
                      key={i}
                      id={`eule-r3-${i + 1}`}
                      name={`eule_r3_${i + 1}`}
                      className="input"
                      placeholder={`Poster ${i + 1}`}
                      aria-label={`Poster ${i + 1}`}
                      autoComplete="off"
                      value={v}
                      onChange={(e) => {
                        const arr = [...euleRound3];
                        arr[i] = e.target.value;
                        setEuleRound3(arr);
                      }}
                    />
                  ))}
                </div>
                <div className="row" style={{ marginTop: 12 }}>
                  <button className="btn btn-cta" onClick={euleSubmit} disabled={inputLocked || submissionLocked}>{sendLabel}</button>
                  {hasSubmitted && !inputLocked && !roundResolved && (
                    <button className="btn" type="button" onClick={()=>setEditMode(e=>!e)}>{editMode ? 'Fertig':'Bearbeiten'}</button>
                  )}
                </div>
              </>
            )}

            {roundIndex === 2 && (
              <>
                <p className="muted" style={{ marginTop: -6 }}>
                  Erkenne, was auf den 4 Postern fehlt (links ? rechts).
                </p>
                <div className="grid2">
                  {euleRound4.map((v, i) => (
                    <input
                      key={i}
                      id={`eule-r4-${i + 1}`}
                      name={`eule_r4_${i + 1}`}
                      className="input"
                      placeholder={`Poster ${i + 1}`}
                      aria-label={`Poster ${i + 1}`}
                      autoComplete="off"
                      value={v}
                      onChange={(e) => {
                        const arr = [...euleRound4];
                        arr[i] = e.target.value;
                        setEuleRound4(arr);
                      }}
                    />
                  ))}
                </div>
                <div className="row" style={{ marginTop: 12 }}>
                  <button className="btn btn-cta" onClick={euleSubmit} disabled={inputLocked || submissionLocked}>{sendLabel}</button>
                  {hasSubmitted && !inputLocked && !roundResolved && (
                    <button className="btn" type="button" onClick={()=>setEditMode(e=>!e)}>{editMode ? 'Fertig':'Bearbeiten'}</button>
                  )}
                </div>
              </>
            )}
          </section>
        )}

        {/* Wal */}
    {phase === 'CATEGORY' && cat === 'Wal' && (
          <section className="card">
      <h3>Wal ? Runde {Number(roundIndex) + 1}</h3>
            {(endsAt && endsAt > now && !pausedAt && pausedRemaining===0) && (
              <div className={`timer active ${remainingSec<=10 ? 'low' : ''}`}>
                <div className="timer-bar" style={{ transform: `scaleX(${Math.max(0, Math.min(1, progress))})` }} />
                <div className="timer-label">{remainingSec > 0 ? `${remainingSec}s` : '-'}</div>
              </div>
            )}
            <label className="label" htmlFor="wal-bid">Gebot</label>
            <input
              type="number"
              id="wal-bid"
              name="wal_bid"
              className="input"
              inputMode="numeric"
              value={walBid}
              onChange={(e) => setWalBid(e.target.value)}
            />
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn btn-cta" onClick={() => socket.emit('team:wal:submit', { bid: Number(walBid) || 0 })} disabled={inputLocked || submissionLocked}>{sendLabel}</button>
              {hasSubmitted && !inputLocked && !roundResolved && (
                <button className="btn" type="button" onClick={()=>setEditMode(e=>!e)}>{editMode ? 'Fertig':'Bearbeiten'}</button>
              )}
            </div>
          </section>
        )}

        {/* --- ELCH --- */}
        {phase === 'CATEGORY' && cat === 'Elch' && (
          <>
    {/* Floating timer rendered via portal; only while running (hide on stop) */}
  {(endsAt && endsAt > now) && typeof document !== 'undefined' && createPortal(
              (
                <div
      className={`timer active floating ${(remainingSec <= 10) ? 'low' : ''}`}
                  style={{
                    position: 'fixed',
        top: 'max(74px, calc(env(safe-area-inset-top) + 68px))',
                    left: '50%',
                    transform: 'translateX(-50%)',
        width: 'min(520px, 92vw)',
                    zIndex: 2147483601,
                    pointerEvents: 'none',
                  }}
                  aria-live="polite"
                >
      <div className="timer-bar" style={{ transform: `scaleX(${Math.max(0, Math.min(1, progress))})` }} />
      <div className="timer-label">{remainingSec > 0 ? `${remainingSec}s` : '-'}</div>
                </div>
              ),
              document.body
            )}
            <section className="card" data-elch-panel style={{ position:'relative' }}>
              <h3>Elch ? Runde {Number(roundIndex) + 1}</h3>
              {(endsAt && endsAt > now && !pausedAt && pausedRemaining===0) && (
                <div className={`timer active ${remainingSec<=10 ? 'low' : ''}`}>
                  <div className="timer-bar" style={{ transform: `scaleX(${Math.max(0, Math.min(1, progress))})` }} />
                  <div className="timer-label">{remainingSec > 0 ? `${remainingSec}s` : '-'}</div>
                </div>
              )}
              {(st?.elch?.category || st?.elch?.exhausted) && (
                <div className="muted" style={{ marginTop: -6, textAlign:'center', width:'100%', fontSize:'1rem', fontWeight:700 }}>
                  {st?.elch?.category || '? Pool erschöpft ?'}
                </div>
              )}
              <div className="muted" style={{ marginTop: 12, textAlign:'center' }}>
                {st?.elch?.exhausted
                  ? 'Alle Sprachen verbraucht.'
                  : (!st?.elch?.category
                      ? 'Warten bis Sprache gezogen.' // Placeholder ohne "Admin" Wortlaut
                      : (() => {
                          const myBuzz = Array.isArray(st?.elch?.buzzOrder) && st.elch.buzzOrder.some(b => b.teamId === fixedId);
                          if (myBuzz) return 'Du hast gebuzzert ? warte auf Entscheidung.';
                          if (st?.elch?.buzzLocked) return 'Ein anderes Team war schneller.';
                          return 'Buzz ist frei.';
                        })()
                    )}
              </div>
            </section>
            {(() => {
            const payout = Math.floor((st?.categoryPot || 0) / 3);
            const overlayGain = resultMeta.myGain ?? payout;
            const k = catKey(st?.currentCategory);
            const title = showWinOverlay
              ? (roundOutcome === 'share' ? 'Pot geteilt!' : 'Runde gewonnen!')
              : 'Runde verloren';
            return (
              <div className={`result-overlay__dialog round-result ${showWinOverlay ? 'win' : 'lose'} cat-${k || ''}`}>
                <CoinRain type={showWinOverlay ? 'win' : 'lose'} />
                {k && (
                  <img
                    className="category-icon lg"
                    src={`/categories/${k}.png`}
                    alt={cat || 'Kategorie'}
                    onError={(e)=>{ if(!e.currentTarget.dataset.fallbackSvg){ e.currentTarget.dataset.fallbackSvg='1'; e.currentTarget.onerror=null; e.currentTarget.src=`/categories/${k}.svg`; } }}
                  />
                )}
                {showWinOverlay && (
                  <div className="rr-badge">
                    <span className="icon coin coin-sm" aria-hidden />+{overlayGain}
                  </div>
                )}
                <h3 className="rr-title">{title}</h3>
                {showWinOverlay && roundOutcome === 'share' && (
                  <div className="rr-sub">Ihr teilt euch den Pot.</div>
                )}
                {!showWinOverlay && resultMeta.winners.length > 1 && (
                  <div className="rr-sub">Andere Teams teilen sich den Pot.</div>
                )}
              </div>
            );
          })()}
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <button
                className="btn btn-cta"
                onClick={() => { socket.emit('team:hase:submit', { answers: haseAns }); if(!editMode) setEditMode(false); }}
                disabled={inputLocked || submissionLocked}
              >{sendLabel}</button>
              {hasSubmitted && !inputLocked && !roundResolved && (
                <button className="btn" type="button" onClick={()=>setEditMode(e=>!e)}>
                  {editMode ? 'Fertig' : 'Bearbeiten'}
                </button>
              )}
            </div>
          </section>
        )}

        {/* Kranich */}
        {phase === 'CATEGORY' && cat === 'Kranich' && (
          <section className="card">
            <h3>Kranich ? {(KRANICH_ROUNDS[roundIndex] || KRANICH_ROUNDS[0]).title}</h3>
            {(endsAt && endsAt > now && !pausedAt && pausedRemaining===0) && (
              <div className={`timer active ${remainingSec<=10 ? 'low' : ''}`}>
                <div className="timer-bar" style={{ transform: `scaleX(${Math.max(0, Math.min(1, progress))})` }} />
                <div className="timer-label">{remainingSec > 0 ? `${remainingSec}s` : '-'}</div>
              </div>
            )}

            <label className="label" htmlFor="kranich-category">Sortierkategorie</label>
            <select
              id="kranich-category"
              name="kranich_category"
              className="select"
              value={kranichCategory}
              onChange={(e) => setKranichCategory(e.target.value)}
            >
              {(KRANICH_ROUNDS[roundIndex] || KRANICH_ROUNDS[0]).categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>

            <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
              {kranichOrder.map((v, i) => (
                <div
                  key={i}
                  className={`row drag-row ${dragIdx===i ? 'dragging' : ''}`}
                  style={{ justifyContent: 'space-between' }}
                  draggable
                  onDragStart={(e) => { e.dataTransfer.setData('text/plain', String(i)); }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const from = Number(e.dataTransfer.getData('text/plain'));
                    if (Number.isNaN(from) || from === i) return;
                    const a = [...kranichOrder];
                    const [item] = a.splice(from, 1);
                    a.splice(i, 0, item);
                    setKranichOrder(a);
                  }}
                  onTouchStart={onTouchStartRow(i)}
                  onTouchMove={onTouchMoveRow(i)}
                  onTouchEnd={onTouchEndRow}
                >
                  <div style={{ flex: 1, padding: '0 8px', fontWeight: 600 }}>{v || <span style={{ opacity:.4 }}>Element wählen / Reihenfolge anpassen</span>}</div>
                  <div className="row">
                    <button className="btn" disabled={i === 0} onClick={() => moveUp(i)}>
                      ?
                    </button>
                    <button
                      className="btn"
                      disabled={i === kranichOrder.length - 1}
                      onClick={() => moveDown(i)}
                    >
                      ?
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn btn-cta" onClick={kranichSubmit} disabled={inputLocked || submissionLocked}>{sendLabel}</button>
              {hasSubmitted && !inputLocked && !roundResolved && (
                <button className="btn" type="button" onClick={()=>setEditMode(e=>!e)}>{editMode ? 'Fertig':'Bearbeiten'}</button>
              )}
            </div>
          </section>
        )}

        {/* Robbe */}
    {phase === 'CATEGORY' && cat === 'Robbe' && (
          <section className="card">
      <h3>Robbe ? Runde {Number(roundIndex) + 1}</h3>
            {(endsAt && endsAt > now && !pausedAt && pausedRemaining===0) && (
              <div className={`timer active ${remainingSec<=10 ? 'low' : ''}`}>
                <div className="timer-bar" style={{ transform: `scaleX(${Math.max(0, Math.min(1, progress))})` }} />
                <div className="timer-label">{remainingSec > 0 ? `${remainingSec}s` : '-'}</div>
              </div>
            )}
    <div className="muted" style={{ marginTop: -6, marginBottom: 8 }}>Verteile maximal 100% (nur 5%-Schritte). Rest: <b>{Math.max(0, 100 - robbeTotal)}%</b></div>
            {['a', 'b', 'c'].map((k) => (
              <div key={k} className="row">
                <span className="pill">{k.toUpperCase()}</span>
                <input
                  type="number"
                  id={`robbe-${k}`}
                  name={`robbe_${k}`}
                  className="input"
                  inputMode="numeric"
      step={5}
      min={0}
      max={100}
                  aria-label={`Prozent Option ${k.toUpperCase()}`}
                  value={robbe[k]}
                  onChange={(e) => setRobbeClamped(k, e.target.value)}
                />
                <span>%</span>
              </div>
            ))}
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn btn-cta" onClick={() => socket.emit('team:robbe:submit', { perc: robbe })} disabled={inputLocked || submissionLocked}>{sendLabel}</button>
              {hasSubmitted && !inputLocked && !roundResolved && (
                <button className="btn" type="button" onClick={()=>setEditMode(e=>!e)}>{editMode ? 'Fertig':'Bearbeiten'}</button>
              )}
            </div>
          </section>
        )}

        {/* Eule */}
    {phase === 'CATEGORY' && cat === 'Eule' && (
          <section className="card">
      <h3>Eule ? Runde {Number(roundIndex) + 1}</h3>
            {(endsAt && endsAt > now && !pausedAt && pausedRemaining===0) && (
              <div className={`timer active ${remainingSec<=10 ? 'low' : ''}`}>
                <div className="timer-bar" style={{ transform: `scaleX(${Math.max(0, Math.min(1, progress))})` }} />
                <div className="timer-label">{remainingSec > 0 ? `${remainingSec}s` : '-'}</div>
              </div>
            )}

            {roundIndex === 0 && (
              <>
                <p className="muted" style={{ marginTop: -6 }}>
                  Nenne so viele Animationsfilme wie möglich (bis zu 15).
                </p>
                <div className="grid3">
                  {euleRound1.map((v, i) => (
                    <input
                      key={i}
                      id={`eule-r1-${i + 1}`}
                      name={`eule_r1_${i + 1}`}
                      className="input"
                      placeholder={`Film ${i + 1}`}
                      aria-label={`Film ${i + 1}`}
                      autoComplete="off"
                      value={v}
                      onChange={(e) => {
                        const arr = [...euleRound1];
                        arr[i] = e.target.value;
                        setEuleRound1(arr);
                      }}
                    />
                  ))}
                </div>
                <div className="row" style={{ marginTop: 12 }}>
                  <button className="btn btn-cta" onClick={euleSubmit} disabled={inputLocked || submissionLocked}>{sendLabel}</button>
                  {hasSubmitted && !inputLocked && !roundResolved && (
                    <button className="btn" type="button" onClick={()=>setEditMode(e=>!e)}>{editMode ? 'Fertig':'Bearbeiten'}</button>
                  )}
                </div>
              </>
            )}

            {roundIndex === 1 && (
              <>
                <p className="muted" style={{ marginTop: -6 }}>
                  Erkenne die 3 unkenntlichen Poster (links ? rechts).
                </p>
                <div className="grid3">
                  {euleRound3.map((v, i) => (
                    <input
                      key={i}
                      id={`eule-r3-${i + 1}`}
                      name={`eule_r3_${i + 1}`}
                      className="input"
                      placeholder={`Poster ${i + 1}`}
                      aria-label={`Poster ${i + 1}`}
                      autoComplete="off"
                      value={v}
                      onChange={(e) => {
                        const arr = [...euleRound3];
                        arr[i] = e.target.value;
                        setEuleRound3(arr);
                      }}
                    />
                  ))}
                </div>
                <div className="row" style={{ marginTop: 12 }}>
                  <button className="btn btn-cta" onClick={euleSubmit} disabled={inputLocked || submissionLocked}>{sendLabel}</button>
                  {hasSubmitted && !inputLocked && !roundResolved && (
                    <button className="btn" type="button" onClick={()=>setEditMode(e=>!e)}>{editMode ? 'Fertig':'Bearbeiten'}</button>
                  )}
                </div>
              </>
            )}

            {roundIndex === 2 && (
              <>
                <p className="muted" style={{ marginTop: -6 }}>
                  Erkenne, was auf den 4 Postern fehlt (links ? rechts).
                </p>
                <div className="grid2">
                  {euleRound4.map((v, i) => (
                    <input
                      key={i}
                      id={`eule-r4-${i + 1}`}
                      name={`eule_r4_${i + 1}`}
                      className="input"
                      placeholder={`Poster ${i + 1}`}
                      aria-label={`Poster ${i + 1}`}
                      autoComplete="off"
                      value={v}
                      onChange={(e) => {
                        const arr = [...euleRound4];
                        arr[i] = e.target.value;
                        setEuleRound4(arr);
                      }}
                    />
                  ))}
                </div>
                <div className="row" style={{ marginTop: 12 }}>
                  <button className="btn btn-cta" onClick={euleSubmit} disabled={inputLocked || submissionLocked}>{sendLabel}</button>
                  {hasSubmitted && !inputLocked && !roundResolved && (
                    <button className="btn" type="button" onClick={()=>setEditMode(e=>!e)}>{editMode ? 'Fertig':'Bearbeiten'}</button>
                  )}
                </div>
              </>
            )}
          </section>
        )}

        {/* Wal */}
    {phase === 'CATEGORY' && cat === 'Wal' && (
          <section className="card">
      <h3>Wal ? Runde {Number(roundIndex) + 1}</h3>
            {(endsAt && endsAt > now && !pausedAt && pausedRemaining===0) && (
              <div className={`timer active ${remainingSec<=10 ? 'low' : ''}`}>
                <div className="timer-bar" style={{ transform: `scaleX(${Math.max(0, Math.min(1, progress))})` }} />
                <div className="timer-label">{remainingSec > 0 ? `${remainingSec}s` : '-'}</div>
              </div>
            )}
            <label className="label" htmlFor="wal-bid">Gebot</label>
            <input
              type="number"
              id="wal-bid"
              name="wal_bid"
              className="input"
              inputMode="numeric"
              value={walBid}
              onChange={(e) => setWalBid(e.target.value)}
            />
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn btn-cta" onClick={() => socket.emit('team:wal:submit', { bid: Number(walBid) || 0 })} disabled={inputLocked || submissionLocked}>{sendLabel}</button>
              {hasSubmitted && !inputLocked && !roundResolved && (
                <button className="btn" type="button" onClick={()=>setEditMode(e=>!e)}>{editMode ? 'Fertig':'Bearbeiten'}</button>
              )}
            </div>
          </section>
        )}

        {/* --- ELCH --- */}
        {phase === 'CATEGORY' && cat === 'Elch' && (
          <>
    {/* Floating timer rendered via portal; only while running (hide on stop) */}
  {(endsAt && endsAt > now) && typeof document !== 'undefined' && createPortal(
              (
                <div
      className={`timer active floating ${(remainingSec <= 10) ? 'low' : ''}`}
                  style={{
                    position: 'fixed',
        top: 'max(74px, calc(env(safe-area-inset-top) + 68px))',
                    left: '50%',
                    transform: 'translateX(-50%)',
        width: 'min(520px, 92vw)',
                    zIndex: 2147483601,
                    pointerEvents: 'none',
                  }}
                  aria-live="polite"
                >
      <div className="timer-bar" style={{ transform: `scaleX(${Math.max(0, Math.min(1, progress))})` }} />
      <div className="timer-label">{remainingSec > 0 ? `${remainingSec}s` : '-'}</div>
                </div>
              ),
              document.body
            )}
            <section className="card" data-elch-panel style={{ position:'relative' }}>
              <h3>Elch ? Runde {Number(roundIndex) + 1}</h3>
              {(endsAt && endsAt > now && !pausedAt && pausedRemaining===0) && (
                <div className={`timer active ${remainingSec<=10 ? 'low' : ''}`}>
                  <div className="timer-bar" style={{ transform: `scaleX(${Math.max(0, Math.min(1, progress))})` }} />
                  <div className="timer-label">{remainingSec > 0 ? `${remainingSec}s` : '-'}</div>
                </div>
              )}
              {(st?.elch?.category || st?.elch?.exhausted) && (
                <div className="muted" style={{ marginTop: -6, textAlign:'center', width:'100%', fontSize:'1rem', fontWeight:700 }}>
                  {st?.elch?.category || '? Pool erschöpft ?'}
                </div>
              )}
              <div className="muted" style={{ marginTop: 12, textAlign:'center' }}>
                {st?.elch?.exhausted
                  ? 'Alle Sprachen verbraucht.'
                  : (!st?.elch?.category
                      ? 'Warten bis Sprache gezogen.' // Placeholder ohne "Admin" Wortlaut
                      : (() => {
                          const myBuzz = Array.isArray(st?.elch?.buzzOrder) && st.elch.buzzOrder.some(b => b.teamId === fixedId);
                          if (myBuzz) return 'Du hast gebuzzert ? warte auf Entscheidung.';
                          if (st?.elch?.buzzLocked) return 'Ein anderes Team war schneller.';
                          return 'Buzz ist frei.';
                        })()
                    )}
              </div>
            </section>
            {(() => {
            const payout = Math.floor((st?.categoryPot || 0) / 3);
            const overlayGain = resultMeta.myGain ?? payout;
            const k = catKey(st?.currentCategory);
            const title = showWinOverlay
              ? (roundOutcome === 'share' ? 'Pot geteilt!' : 'Runde gewonnen!')
              : 'Runde verloren';
            return (
              <div className={`result-overlay__dialog round-result ${showWinOverlay ? 'win' : 'lose'} cat-${k || ''}`}>
                <CoinRain type={showWinOverlay ? 'win' : 'lose'} />
                {k && (
                  <img
                    className="category-icon lg"
                    src={`/categories/${k}.png`}
                    alt={cat || 'Kategorie'}
                    onError={(e)=>{ if(!e.currentTarget.dataset.fallbackSvg){ e.currentTarget.dataset.fallbackSvg='1'; e.currentTarget.onerror=null; e.currentTarget.src=`/categories/${k}.svg`; } }}
                  />
                )}
                {showWinOverlay && (
                  <div className="rr-badge">
                    <span className="icon coin coin-sm" aria-hidden />+{overlayGain}
                  </div>
                )}
                <h3 className="rr-title">{title}</h3>
                {showWinOverlay && roundOutcome === 'share' && (
                  <div className="rr-sub">Ihr teilt euch den Pot.</div>
                )}
                {!showWinOverlay && resultMeta.winners.length > 1 && (
                  <div className="rr-sub">Andere Teams teilen sich den Pot.</div>
                )}
              </div>
            );
          })()}
      {/* Bottom-centered language label visible during buzz + small icon above */}
  {st?.elch?.category && (
        <div
                className="elch-language-footer"
                style={{
                  position: 'fixed',
                  left: '50%',
                  bottom: 12,
                  transform: 'translateX(-50%)',
      zIndex: 3000,
                  pointerEvents: 'none',
                  fontWeight: 900,
                  fontSize: '1.05rem',
                  textAlign: 'center',
                  padding: '6px 12px',
                  borderRadius: 12,
                  background: 'rgba(0,0,0,0.35)',
                  color: 'white',
                  boxShadow: '0 8px 22px rgba(0,0,0,0.35)'
                }}
                aria-live="polite"
              >
                {st.elch.category}
              </div>
            )}
          </>
        )}

        {/* Bär */}
  {phase === 'CATEGORY' && cat === 'Bär' && (
          <section className="card">
            <h3>Bär ? Runde {Number(roundIndex) + 1}</h3>
            {(endsAt && endsAt > now && !pausedAt && pausedRemaining===0) && (
              <div className={`timer active ${remainingSec<=10 ? 'low' : ''}`}>
                <div className="timer-bar" style={{ transform: `scaleX(${Math.max(0, Math.min(1, progress))})` }} />
                <div className="timer-label">{remainingSec > 0 ? `${remainingSec}s` : '-'}</div>
              </div>
            )}

            {/* Runden-Hinweis */}
            {roundIndex === 0 && (
              <p className="muted" style={{ marginTop: -6 }}>
                Schätze die Flugdauer in <b>Stunden (Dezimal)</b>.
              </p>
            )}
            {roundIndex === 1 && (
              <p className="muted" style={{ marginTop: -6 }}>
                Schätze die Anzahl Kitas in Deutschland.
              </p>
            )}
            {roundIndex === 2 && (
              <p className="muted" style={{ marginTop: -6 }}>
                Schätze die Höhe des höchsten Wolkenkratzers in <b>Metern</b>.
              </p>
            )}

            <label className="label">Deine Schätzung</label>
            <input
              className="input"
              inputMode={roundIndex === 0 ? 'decimal' : 'numeric'}
              step={roundIndex === 0 ? '0.01' : '1'}
              placeholder={
                roundIndex === 0 ? 'z. B. 10.0'
                : roundIndex === 1 ? 'z. B. 20 000'
                : 'z. B. 500'
              }
              value={baer}
              onChange={(e) => setBaer(e.target.value)}
            />

            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn btn-cta" onClick={() => socket.emit('team:baer:submit', { estimate: Number(baer) })} disabled={inputLocked || submissionLocked}>{sendLabel}</button>
              {hasSubmitted && !inputLocked && !roundResolved && (
                <button className="btn" type="button" onClick={()=>setEditMode(e=>!e)}>{editMode ? 'Fertig':'Bearbeiten'}</button>
              )}
            </div>
          </section>
        )}

        {/* Fuchs */}
    {phase === 'CATEGORY' && cat === 'Fuchs' && (
          <section className="card">
      <h3>Fuchs ? Runde {Number(roundIndex) + 1}</h3>
            {(endsAt && endsAt > now && !pausedAt && pausedRemaining===0) && (
              <div className={`timer active ${remainingSec<=10 ? 'low' : ''}`}>
                <div className="timer-bar" style={{ transform: `scaleX(${Math.max(0, Math.min(1, progress))})` }} />
                <div className="timer-label">{remainingSec > 0 ? `${remainingSec}s` : '-'}</div>
              </div>
            )}
            <label className="label">Dein Tipp</label>
            <input className="input" value={fuchs} onChange={(e) => setFuchs(e.target.value)} />
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn btn-cta" onClick={() => socket.emit('team:fuchs:submit', { guess: fuchs })} disabled={inputLocked || submissionLocked}>{sendLabel}</button>
              {hasSubmitted && !inputLocked && !roundResolved && (
                <button className="btn" type="button" onClick={()=>setEditMode(e=>!e)}>{editMode ? 'Fertig':'Bearbeiten'}</button>
              )}
            </div>
          </section>
        )}
      </main>

      {/* Connection banner */}
      {(!isConnected || isReconnecting || connError) && (
        <div className={`conn-banner ${isConnected ? '' : 'down'}`} role="status" aria-live="polite">
          <div className="conn-banner__dot" aria-hidden />
          <div className="conn-banner__text">
            {isReconnecting ? 'Verbindung wird wiederhergestellt?' : (!isConnected ? 'Getrennt. Versuche neu zu verbinden?' : (connError ? `Fehler: ${connError}` : ''))}
          </div>
          <button className="btn" onClick={() => socket.connect()} disabled={isReconnecting}>
            Neu verbinden
          </button>
        </div>
      )}

      {/* Foreground result overlay (win/lose) */}
      {(showLoseOverlay || showWinOverlay) && (
        <div className="result-overlay" role="alertdialog" aria-live="assertive">
          <div className="result-overlay__backdrop" />
          {(() => {
            const payout = Math.floor((st?.categoryPot || 0) / 3);
            const k = catKey(st?.currentCategory);
            return (
              <div className={`result-overlay__dialog round-result ${showWinOverlay ? 'win' : 'lose'} cat-${k || ''}`}>
                <CoinRain type={showWinOverlay ? 'win' : 'lose'} />
                {k && (
                  <img
                    className="category-icon lg"
                    src={`/categories/${k}.png`}
                    alt={cat || 'Kategorie'}
                    onError={(e)=>{ if(!e.currentTarget.dataset.fallbackSvg){ e.currentTarget.dataset.fallbackSvg='1'; e.currentTarget.onerror=null; e.currentTarget.src=`/categories/${k}.svg`; } }}
                  />
                )}
                {showWinOverlay && (
                  <div className="rr-badge">
                    <span className="icon coin coin-sm" aria-hidden />+{payout}
                  </div>
                )}
                <h3 className="rr-title">{showWinOverlay ? 'Runde gewonnen!' : 'Runde verloren'}</h3>
              </div>
            );
          })()}
        </div>
      )}

      {/* Centered Fun Facts (leichtgewichtiger, Header bleibt sichtbar) */}
      {phase === 'LOBBY' && showFacts && (()=>{
        const f = FUN_FACTS[factIdx];
        const isObj = typeof f === 'object' && f && 'text' in f;
        const text = isObj ? f.text : f;
        // Falls es zu einem reinen Text einen separaten Bild-Eintrag gibt, benutze diesen als Bild.
        // Tolerant: vergleiche normalisiert (kleinbuchstaben, trims, mehrfach-spaces, Emojis/Sonderzeichen ignoriert)
        const norm = (s)=> (s||'').toString().toLowerCase().replace(/\s+/g,' ').trim().replace(/[\p{P}\p{S}]/gu,'').replace(/\s+/g,' ');
        const paired = !isObj ? FUN_FACTS.find(x => {
          if (!(x && typeof x === 'object' && 'text' in x)) return false;
          const a = norm(x.text), b = norm(text);
          return a===b || a.startsWith(b) || b.startsWith(a);
        }) : null;
        const imgSrc = isObj ? f.img : (paired && paired.img);
        return (
          <div className="facts-center" aria-live="polite" role="dialog">
            <div className={`facts-center__card ${(imgSrc?'with-image':'')}`} key={factIdx}>
              {imgSrc && (
                <figure className="fact-figure">
                  <img src={imgSrc} alt={(isObj? f.alt : (paired && paired.alt)) || 'Abbildung zum Fun Fact'} loading="lazy"
                    onError={(e)=>{ e.currentTarget.style.display='none'; }} />
                </figure>
              )}
              <div className="fact-text">{text}</div>\r\n              <footer className="fact-footer" aria-live="polite">Gleich geht's weiter</footer>
            </div>
          </div>
        );
      })()}

      {categorySummary && (()=>{
        const k = catKey(categorySummary.category);
        const earnEntries = Object.entries(categorySummary.earnings||{}).sort((a,b)=> (b[1]||0)-(a[1]||0));
        return (
          <div className={`category-summary-overlay cat-${k}`} role="dialog" aria-modal="true" aria-label="Kategorie Zusammenfassung">
            <div className="category-summary__backdrop" />
            <div className="category-summary__dialog">
              <div className="category-summary__header">
                <div className="cat-icon-wrap">
                  <img className="category-icon lg" src={`/categories/${k}.png`} alt={categorySummary.category}
                    onError={(e)=>{ if(!e.currentTarget.dataset.fallbackSvg){ e.currentTarget.dataset.fallbackSvg='1'; e.currentTarget.onerror=null; e.currentTarget.src=`/categories/${k}.svg`; }}} />
                </div>
                <h2 className="category-summary__title">{categorySummary.category}</h2>
                <div className="category-summary__meta">Pot: <span className="icon coin coin-sm" aria-hidden />{categorySummary.pot} ? Runden: {categorySummary.roundsPlayed}</div>
              </div>
              <ul className="category-summary__list">
                {earnEntries.map(([tid,coinsEarned],idx)=>{
                  const t = teams.find(tt=>tt.id===tid);
                  const place = idx+1;
                  return (
                    <li key={tid} className={`place-${place}`}>
                      <div className="row" style={{justifyContent:'space-between', width:'100%'}}>
                        <div style={{display:'flex',alignItems:'center',gap:14}}>
                          <img src={t?.avatar||'/avatars/capybara.png'} alt="avatar" className="team-avatar-sm" />
                          <span className="team-name-inline">{t?.name||tid}</span>
                        </div>
                        <div className="coins-earned"><span className="icon coin coin-sm" aria-hidden />+{coinsEarned||0}</div>
                      </div>
                    </li>
                  );
                })}
                {earnEntries.length===0 && <li className="empty">Keine Gewinne diese Kategorie</li>}
              </ul>
            </div>
          </div>
        );
      })()}

      {/* Elch: Show animated draw when new language appears */}
      {phase === 'CATEGORY' && cat === 'Elch' && st?.elch?.category && (
        <>
          <ElchDrawFlash key={st.elch.category} text={st.elch.category} />
          {/* ARIA-Live-Region für Screenreader: sagt gezogene Sprache an */}
          <div style={{position:'absolute',left:'-9999px',height:'1px',width:'1px',overflow:'hidden'}} aria-live="polite" aria-atomic="true">
            {st.elch.category}
          </div>
        </>
      )}
    </div>
  );
}

// Kleine Coin-Konfetti Animation bei Sieg
function CoinRain({ type='win' }){
  const items = useMemo(()=> {
    const isWin = type==='win';
    const count = isWin ? 18 : 14;
    return Array.from({length:count}, (_,i)=>({
      id: i+1,
      left: Math.random()*100,
      delay: Math.random()*1.1,
      dur: (isWin?3.1:3.8) + Math.random()*1.6,
      drift: (Math.random()*80-40),
      scale: (isWin?0.5:0.4) + Math.random()*(isWin?0.7:0.5),
    }));
  }, [type]);
  return (
    <div className={`coin-rain ${type==='lose'?'tears':''}`} aria-hidden>
      {items.map(it=> (
        <span
          key={it.id}
          className={type==='win'? 'coin-drop':'tear-drop'}
          style={{
            left: `${it.left}%`,
            animationDelay: `${it.delay}s`,
            animationDuration: `${it.dur}s`,
            '--drift': `${it.drift}px`,
            '--s': it.scale,
          }}
        />
      ))}
    </div>
  );
}

// Small animated overlay for Elch draw
function ElchDrawFlash({ text }){
  const [show, setShow] = useState(true);
  useEffect(() => { const t = setTimeout(()=>setShow(false), 2200); return ()=>clearTimeout(t); }, [text]);
  if (!show) return null;
  return (
    <div className="result-overlay" aria-hidden>
      <div className="result-overlay__backdrop" />
      <div className="result-overlay__dialog elch-draw-modal">
        <div className="elch-draw-text">{text}</div>
      </div>
    </div>
  );
}

// Smooth pop-in of the category avatar when category begins (STAKE)
function CategoryIntro({ k, name }){
  if (!k) return null;
  const LINE = (() => {
    const map = {
      hase: 'Schau mir in die Augen',
      kranich: 'Ordnung muss sein',
      robbe: 'Ich wei? was, was du nicht weißt',
      eule: 'Augen auf bei der Filmwahl',
      fuchs: 'Very Important Silhouette',
      wal: 'Einer geht noch!',
      elch: 'Buchstabier? das Ereignis mir',
      baer: 'Schätz? me if you can',
    };
    return map[k] || (name || '');
  })();
  const iconRef = useRef(null);
  const textRef = useRef(null);
  useEffect(() => {
    const icon = iconRef.current;
    if (!icon) return;
    const wm = document.querySelector('.stake-section .stake-watermark');
    // Allow one frame to layout the intro at final center size
    const id = requestAnimationFrame(() => {
      try {
        const b = icon.getBoundingClientRect();
        const a = wm ? wm.getBoundingClientRect() : null;
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        let from = { dx: 0, dy: 0, s: 0.86 };
        if (a) {
          from = {
            dx: (a.left + a.width / 2) - centerX,
            dy: (a.top + a.height / 2) - centerY,
            s: a.width / Math.max(1, b.width)
          };
        }
        icon.animate([
          { transform: `translate(${from.dx}px, ${from.dy}px) scale(${from.s})`, opacity: 0.001, filter: 'blur(1px) saturate(120%)' },
          { transform: 'translate(0,0) scale(1)', opacity: 1, filter: 'blur(0) saturate(130%)' }
        ], { duration: 1000, easing: 'cubic-bezier(.22,.9,.25,1)', fill: 'both' });
        if (textRef.current) {
          textRef.current.animate([
            { opacity: 0, transform: 'translateY(12px)' },
            { opacity: 1, transform: 'translateY(0)' }
          ], { duration: 520, delay: 520, easing: 'cubic-bezier(.22,.9,.25,1)', fill: 'both' });
        }
        const blur = document.querySelector('.cat-intro-blur');
        if (blur) {
          blur.animate([{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }], { duration: 1400, easing: 'ease', fill: 'both' });
        }
      } catch {}
    });
    return () => cancelAnimationFrame(id);
  }, [k]);

  return (
    <div className="cat-intro-overlay min" aria-hidden>
      <div className="cat-intro-blur" />
      <div className="cat-intro-wrap">
        <img
          ref={iconRef}
          className="cat-intro-icon"
          src={`/categories/${k}.png`}
          alt=""
          onError={(e)=>{ if(!e.currentTarget.dataset.fallbackSvg){ e.currentTarget.dataset.fallbackSvg='1'; e.currentTarget.onerror=null; e.currentTarget.src=`/categories/${k}.svg`; } }}
        />
        {LINE && <div ref={textRef} className="cat-intro-text">{LINE}</div>}
      </div>
    </div>
  );
}


