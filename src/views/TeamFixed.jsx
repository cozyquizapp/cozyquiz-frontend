// frontend/src/views/TeamFixed.jsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { clearOverlay, setOverlay } from '../utils/overlay';
import { createPortal } from 'react-dom';
import socket, { connectWithTeamId } from '../socket.v2';
import assetUrl from '../utils/assetUrl';
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
          width: size + 10,
          height: size + 10,
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
  const [stakeSent, setStakeSent] = useState(false);
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
  // Reset timer state when round/category key changes
  useEffect(()=>{
    if(timerRoundKeyRef.current !== roundKey){
      timerRoundKeyRef.current = roundKey;
      setTimerWasActive(false);
      setPausedAt(null);
    }
  }, [roundKey]);

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

  // Timer – lokales Ticken
  // Ref für haptisches Feedback bei "Zu spät" (Buzz zu spät)
  const zuSpaetRef = useRef(false);
  // Debounce multiple buzz emits on mobile
  const buzzLockRef = useRef(false);
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
  const timerRoundKeyRef = useRef('');
  // NEU: Pause-Status für Team-Ansicht
  const [pausedAt, setPausedAt] = useState(null);
  // Header elevation on scroll
  useEffect(() => {
    const onScroll = () => {
      try {
        if (window.scrollY > 6) document.body.classList.add('scrolled');
        else document.body.classList.remove('scrolled');
      } catch {}
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
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
    'Walkman-Zeit: Mixtapes to go – Kopfhörer wurden zum Accessoire.',
    'Haar-Ikonen: Vokuhila und Föhnfrisuren – Haarsprayverbrauch auf Rekordniveau.',
    'Aerobic-Look: Leggings, Stirnbänder und Trainingsanzüge prägten die Streetwear.',
    // Arendal & Umgebung
  { text: 'Arendal liegt an der Südküste Norwegens (Agder) am Skagerrak.', img: '/funfacts/arendal.jpg', alt: 'Blick auf Arendal an der Südküste Norwegens' },
  { text: 'Die Altstadt rund um den Hafen „Pollen“ ist für Holzhäuser und Cafés bekannt.', img: '/funfacts/Arendal_Pollen.png', alt: 'Holzhäuser und Cafés am Hafen Pollen in Arendal' },
  { text: 'Jeden August: „Arendalsuka“ – Norwegens große Demokratie-/Politik-Woche.', img: '/funfacts/arendalsuka.jpg', alt: 'Menschen und Stände bei der Arendalsuka' },
  { text: 'Tromøy & Hisøy: Insel-Feeling – Hove ist ein Top-Ausflugsziel.', img: '/funfacts/stranhove.jpg', alt: 'Strand Hove auf einer der Inseln bei Arendal' },
  { text: 'Arendal war im 19. Jh. ein wichtiges Zentrum für Segelschifffahrt.', img: '/funfacts/historic.png', alt: 'Historisches Segelschiff / maritime Szene in Arendal' },
  { text: 'Der Fluss Nidelva mündet hier ins Meer – perfekt für Kajak & SUP.', img: '/funfacts/sup.png', alt: 'SUP oder Kajak auf dem Nidelva vor Arendal' },
    // Spielerisch / Humor
    'Hier sagt man: Das Team mit dem besten Outfit holt den Style-Pokal. ??',
    'Johannes ist objektiv der beste Moderator – steht so im Skript. ??',
    'Fun Fact: 100% der Gewinnerteams hatten heute bereits Wasser getrunken. ??',
    'Gerücht: Wer während der Pause tief durchatmet, erhöht die Punktzahl um +0 (aber fühlt sich besser).',
    'Studien sagen: High-Five erhöht kurzfristig die Team-Synchronität um 8%. ?',
    'Kurze Pause = Gehirn-Refresh. Schon Blinzeln bringt Mini-Reboot.',
  // animal-related facts removed (Wal, Fuchs)
  'Micro-Pause: Schultern hoch – halten – loslassen. Mini-Reset.',
  'Wer summt, reguliert Stress. Summen zählt als Strategie. ??',
  'Fun Fact: Teams mit klaren Rollen spielen oft ruhiger.',
  '„Ich hab da eine Theorie…“ – berühmte letzte Worte vor Plot-Twist.',
  'Die meisten spontanen Ideen kommen Sekunden NACH einem kurzem Blick weg vom Screen.',
  'Rainbow-Trivia: In Norwegen sieht man häufig Doppelregenbögen – extra Glück? ??',
  'Wer laut gewinnt, gewinnt doppelt (gefühlt).',
  // removed: 'Legend says: Saying "Wal" zu ernst löst mystische Kräfte aus.'
  'Brain-Boost: Tief ein – 4s halten – 6s aus. Parasympathikus aktiviert.',
  'Wenn ihr diesen Fact nochmal seht: Gratulation, ihr habt das Loop-Ei gefunden.',
  // Beispiel mit Bild (füge eigene Dateien in /funfacts/ hinzu)
  { text: 'Arendal Hafen – historische Holzfassaden und Segelgeschichte live.', img: '/funfacts/hafen.jpg', alt: 'Hafen von Arendal mit Booten' },
  { text: 'Typischer norwegischer Schärengarten bei Abendlicht – ruhig & weit.', img: '/funfacts/schaereninsel.jpg', alt: 'Schäreninsel bei Abendlicht' },
  // Neue Bild-Facts (zusätzliche Einträge)
  { text: '80er-Style: Schulterpolster und Neonfarben - je knalliger, desto besser!', img: '/funfacts/80er-style.jpg', alt: '80er-Style mit Neonfarben und Schulterpolstern' },
  { text: 'Walkman-Zeit: Mixtapes to go - Kopfhörer wurden zum Accessoire.', img: '/funfacts/walkman.jpg', alt: 'Walkman und Kopfhörer als Accessoire' },
  { text: 'Haar-Ikonen: Vokuhila und Föhnfrisuren - Haarsprayverbrauch auf Rekordniveau.', img: '/funfacts/Frisuren.png', alt: '80er-Jahre Frisuren und Vokuhila' },
  { text: 'Aerobic-Look: Leggings, Stirnbänder und Trainingsanzüge prägten die Streetwear.', img: '/funfacts/aerobic.png', alt: 'Aerobic-Look mit Leggings und Stirnband' },
  { text: 'Kaffeefakt: Geruch allein kann Aufmerksamkeit kurz steigern.', img: '/funfacts/kaffee.png', webp: '/funfacts/kaffee.webp', avif: '/funfacts/kaffee.avif', alt: 'Tasse Kaffee, Duft steigt auf' },
  { text: 'Rainbow-Trivia: In Norwegen sieht man häufig Doppelregenbögen - extra Glück?', img: '/funfacts/doppelregenbogen.jpg', alt: 'Doppelregenbogen am Himmel' },
  // Drei kleine Witze als Fun-Facts (auf Wunsch, mit Quelle)
  'Witz: Warum können Geister so schlecht lügen? Weil man durch sie hindurchsieht. - ChatGPT',
  'Witz: Ich habe einen Witz über Zeitreisen, aber du mochtest ihn gestern schon. - ChatGPT',
  'Witz: Warum hat der Computer eine Brille? Weil er seine Windows nicht schließen kann. - ChatGPT',
  ]).current;
  const [showFacts, setShowFacts] = useState(true);
  const [factIdx, setFactIdx] = useState(0);
  const [factsPaused, setFactsPaused] = useState(false);
  // Preload Fun Fact images (including heavy coffee image) to avoid blank first render on slow networks / iOS
  const [factImgStatus, setFactImgStatus] = useState({}); // src -> true (loaded) | false (error)
  const funFactImageList = useMemo(() => {
    const set = new Set();
    for (const f of FUN_FACTS) {
      if (f && typeof f === 'object' && f.img && typeof f.img === 'string') set.add(f.img);
    }
    return Array.from(set);
  }, [FUN_FACTS]);
  useEffect(() => {
    funFactImageList.forEach(src => {
      if (factImgStatus[src] !== undefined) return; // already attempted
      const img = new Image();
      img.onload = () => setFactImgStatus(prev => ({ ...prev, [src]: true }));
      img.onerror = () => setFactImgStatus(prev => ({ ...prev, [src]: false }));
      // Slight delay batching to prevent main thread jank when many images
      setTimeout(() => { img.src = src; }, 30);
    });
  }, [funFactImageList, factImgStatus]);
  const factTouchStartXRef = useRef(null);
  const factTouchStartYRef = useRef(null);
  const factTouchStartTRef = useRef(null);
  const factSwipeUsedRef = useRef(false);
  const [categorySummary, setCategorySummary] = useState(null); // {category, earnings, pot, ...}
  // Auto-dismiss timer ref for category summary overlay
  const summaryTimerRef = useRef(null);

  // Wenn Kategorie-Zusammenfassung verschwindet und wir in der Lobby sind -> Fun Facts automatisch aktivieren
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
  // Fallback: falls Team noch nicht über teamsUpdated da ist, versuche gespeicherten Namen
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
  const sendStake = () => {
    try { clearOverlay(); } catch {}
    socket.emit('team:setStake', { stake: Number(stake) || 0, useJoker });
    try { navigator.vibrate && navigator.vibrate([12]); } catch {}
    setStakeSent(true);
  };

  // Reset stake feedback on category/round change or leaving STAKE; sync with server
  useEffect(() => {
    if (st?.phase !== 'STAKE') { setStakeSent(false); return; }
    const already = !!(st?.stakes && st.stakes[fixedId]);
    setStakeSent(already);
  }, [st?.currentCategory, st?.roundIndex, st?.phase, st?.stakes, fixedId]);

  // --- Ensure timer calc variables exist for render (they were already computed above in the file)
  const endsAt = st?.timerEndsAt || null;
  const duration = Math.max(0, Number(st?.timerDuration || 0));
  const pausedRemaining = Math.max(0, Number(st?.timerPausedRemaining || 0));
  const remainingMs = endsAt ? Math.max(0, endsAt - now) : 0;
  const remainingSec = Math.ceil(remainingMs / 1000);
  const progress = endsAt && duration > 0 ? Math.max(0, Math.min(1, remainingMs / (duration * 1000))) : 0;

  const displayCatName = (c) => {
    if (!c) return c;
    if (c === 'B??r' || c === 'Baer') return 'Bär';
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
        // Ensure any global overlay is disabled when entering stake input phase
        try { clearOverlay(); } catch {}
        // auto hide after ~1.2s so Stake panel can fade in
        const t = setTimeout(() => setCatIntro(null), 1200);
        return () => clearTimeout(t);
      }
    }
    prevCatRef.current = catName;
    prevPhaseRef.current = phaseNow;
  }, [st?.currentCategory, st?.phase]);

  // Safety: if phase changes away from STAKE, ensure intro overlay is hidden
  useEffect(() => {
    if (st?.phase && st.phase !== 'STAKE' && catIntro) {
      setCatIntro(null);
    }
    // Always clear any lingering global overlay when leaving STAKE
    if (st?.phase && st.phase !== 'STAKE') { try { clearOverlay(); } catch {} }
  }, [st?.phase, catIntro]);

  // Cleanup on unmount: ensure overlay is cleared
  useEffect(() => {
    return () => { try { clearOverlay(); } catch {} };
  }, []);

  // NEU: Pause-Status synchronisieren (wenn Admin pausiert)
  useEffect(() => {
    // Wenn der Timer gestoppt wird, aber duration gesetzt bleibt, merken wir uns die Restzeit
    if (!endsAt && pausedRemaining > 0 && st?.phase === 'CATEGORY' && timerWasActive) {
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
  }, [endsAt, pausedRemaining, st?.phase, now, pausedAt, timerWasActive]);

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

  // Eule submit – Mapping: 0?r1, 1?r3, 2?r4
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

  // Hilfsfunktion: Hat mein Team die Runde gewonnen?
  const didMyTeamWin = (() => {
    const res = getCurrentResult();
    if (!res) return null;
    if ('winnerId' in res) {
      if (res.winnerId === fixedId) return true;
      if (res.winnerId) return false;
    }
    // Fallback: falls Struktur anders, ggf. anpassen
    return null;
  })();

  // Rückmeldungstexte für jede Kategorie
  const resultFeedback = useMemo(() => {
    // Zeige Feedback, sobald ein Gewinner existiert (unabhängig von phase)
    if (didMyTeamWin == null) return null;
    let msg = '';
    let emoji = didMyTeamWin ? '??' : '??';
    switch (cat) {
      case 'Hase':
        msg = didMyTeamWin
          ? 'Glückwunsch! Ihr habt diese Hase-Runde gewonnen und den Punkt geholt.'
          : 'Leider hat das andere Team diese Hase-Runde gewonnen.';
        break;
      case 'Kranich':
        msg = didMyTeamWin
          ? 'Super! Ihr habt die Kranich-Runde gewonnen und den Punkt erhalten.'
          : 'Schade, das andere Team war bei Kranich besser.';
        break;
      case 'Robbe':
        msg = didMyTeamWin
          ? 'Stark! Ihr habt die Robbe-Runde gewonnen und den Punkt geholt.'
          : 'Leider hat das andere Team die Robbe-Runde gewonnen.';
        break;
      case 'Eule':
        msg = didMyTeamWin
          ? 'Klasse! Ihr habt die Eule-Runde gewonnen und den Punkt erhalten.'
          : 'Das andere Team war bei Eule erfolgreicher.';
        break;
      case 'Wal':
        msg = didMyTeamWin
          ? 'Ihr habt die Wal-Runde gewonnen und den Punkt geholt!'
          : 'Das andere Team hat die Wal-Runde gewonnen.';
        break;
      case 'Elch':
        msg = didMyTeamWin
          ? 'Ihr wart beim Elch am schnellsten und habt den Punkt geholt!'
          : 'Das andere Team war beim Elch schneller.';
        break;
      case 'Bär':
        msg = didMyTeamWin
          ? 'Sehr gut! Ihr habt die Bär-Runde gewonnen und den Punkt erhalten.'
          : 'Das andere Team war bei Bär näher dran.';
        break;
      case 'Fuchs':
        msg = didMyTeamWin
          ? 'Ihr habt die Fuchs-Runde gewonnen und den Punkt geholt!'
          : 'Das andere Team hat bei Fuchs besser.';
        break;
      default:
        msg = didMyTeamWin
          ? 'Ihr habt diese Runde gewonnen!'
          : 'Leider hat das andere Team diese Runde gewonnen.';
    }
    return (
      <div className={`result-feedback ${didMyTeamWin ? 'win' : 'lose'}`}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>{emoji}</div>
        <div>{msg}</div>
      </div>
    );
  }, [cat, didMyTeamWin]);

  // Show foreground overlay for win/lose for 10s when a winner is announced
  useEffect(() => {
    if (!lastResult) return;
    if (lastResult.winnerId) {
      if (lastResult.winnerId === fixedId) {
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
    }
  }, [lastResult, fixedId]);

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

  // ————— RENDER —————
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
            <Avatar src={assetUrl(me?.avatar ?? defaultAvatar)} />
          </div>
          <div className="team-meta" style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <div
              className={`team-name ${((me?.name || fallbackName)?.length > 10) ? 'two-line' : ''}`}
              style={{ fontSize: '1.24rem', fontWeight: 900 }}
            >
              {me?.name || fallbackName}
            </div>
            {(() => {
              const p = st?.phase || 'LOBBY';
              const catName = st?.currentCategory ? displayCatName(st.currentCategory) : null;
              let line = '';
              if (p === 'LOBBY') {
                line = 'Lobby';
              } else if (p === 'CATEGORY') {
                const r = Number(st?.roundIndex || 0) + 1;
                line = `${catName || ''} · Runde ${r}/3`;
              } else if (p === 'STAKE') {
                line = catName || '';
              }
              return line ? (
                <div className="phase-crumb" aria-hidden>
                  <span>{line}</span>
                </div>
              ) : null;
            })()}
          </div>
          {/* Phase badge hidden for team to avoid overflow */}
          {false && st?.currentCategory && (() => {
            const k = catKey(st.currentCategory);
            return (
              <>
                <img
                  className="category-icon"
                  key={k}
                  src={`/categories/${k}.png`}
                  alt={`${st.currentCategory} icon`}
                  onError={(e) => {
                    // PNG zuerst versuchen, dann auf SVG zurückfallen
                    if (!e.currentTarget.dataset.fallbackSvg) {
                      e.currentTarget.dataset.fallbackSvg = '1';
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = `/categories/${k}.svg`;
                    }
                  }}
                />
                <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
                  <span className="badge badge-alt" style={{ padding: '6px 10px' }}>{displayCatName(st.currentCategory)}</span>
                  {st.phase === 'CATEGORY' && (
                    <span className="round-info">Runde {Number(st.roundIndex) + 1}/3</span>
                  )}
                </div>
              </>
            );
          })()}
        </div>
        <div className="header-right">
          <div className="bank">
            <div className="stat" aria-label={`${coins} Coins`} aria-live="polite">
              <span
                className="icon coin lg header-coin"
                aria-hidden
                style={{
                  // Randomize once per mount (stable) to desync gleam across clients
                  ...(useMemo(()=>{ const d=Math.random()*1; const dur=6.4 + Math.random()*1.4; return { '--hc-delay': `${d.toFixed(2)}s`, '--hc-dur': `${dur.toFixed(2)}s` }; }, []) )
                }}
              />
              <div className="stat-num">{coins}</div>
            </div>
            <div className="stat" aria-label={`${quizJoker} Jokerin`} aria-live="polite"><span className="icon joker lg" aria-hidden /> <div className="stat-num">{quizJoker}</div></div>
          </div>
        </div>
  </header>
      {/* Category Intro Overlay */}
      {catIntro && (
        <CategoryIntro key={catIntro.ts} k={catIntro.k} name={catIntro.name} />
      )}
 
      {/* Timer: only show when active; for Elch render a floating version above the buzz overlay */}
  {/* Inline timers are rendered inside each category card under its heading */}
      {/* Hide paused timer on stop per request */}

      {/* Content */}
      <main className="content">

        {/* LOBBY: Satisfying wait + fun facts */}
        {/* (Kurze Pause) Hinweis jetzt als Footer fixed statt Card */}
        {phase === 'LOBBY' && (
          <></>
        )}

        {/* Stake */}
        {phase === 'STAKE' && (
          <section className={`card stake-section ${stakeSent ? 'sent' : ''}`}>
            <div className="stake-content">
              <h3 className="stake-title">Einsatz wählen</h3>
              <div className="stake-grid">
                <button
                  className={`btn stake-btn ${stake === 3 ? 'btn-primary selected' : ''}`}
                  disabled={coins < 3 || stakeSent}
                  onClick={() => setStake(3)}
                  title="Setze 3 Coins"
                aria-label="Einsatz 3 Coins"
              >
                <span className="stake-amt" aria-hidden><b>3</b><span className="icon coin coin-sm" /></span>
              </button>
              <button
                className={`btn stake-btn ${stake === 6 ? 'btn-primary selected' : ''}`}
                disabled={coins < 6 || stakeSent}
                onClick={() => setStake(6)}
                title="Setze 6 Coins"
                aria-label="Einsatz 6 Coins"
              >
                <span className="stake-amt" aria-hidden><b>6</b><span className="icon coin coin-sm" /></span>
              </button>
              {st?.teamLimit>2 && (
                <button
                  className={`btn stake-btn ${stake === 9 ? 'btn-primary selected' : ''}`}
                  disabled={coins < 9 || stakeSent}
                  onClick={() => setStake(9)}
                  title="Setze 9 Coins"
                  aria-label="Einsatz 9 Coins"
                >
                  <span className="stake-amt" aria-hidden><b>9</b><span className="icon coin coin-sm" /></span>
                </button>
              )}
              {coins === 0 && (
                <button
                  className={`btn stake-btn ${stake === 0 ? 'btn-primary selected' : ''}`}
                  onClick={() => setStake(0)}
                  title="Setze 0"
                >
                  <span className="stake-amt" aria-hidden><b>0</b><span className="icon coin coin-sm" /></span>
                </button>
              )}
              </div>
            {stake > 0 && (
              <div className="stake-joker-wrap" style={{ marginTop: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <button
                  type="button"
                  className={`joker-toggle ${useJoker ? 'active' : ''} ${quizJoker > 0 ? '' : 'disabled'}`}
                  onClick={() => { if (quizJoker > 0 && !inputLocked && !stakeSent) setUseJoker(v => !v); }}
                  aria-pressed={useJoker}
                  aria-label={useJoker ? 'Jokerin aktiviert' : 'Jokerin einsetzen'}
                  disabled={quizJoker === 0 || inputLocked || stakeSent}
                >
                  <img src="/jokerin.png" alt="Jokerin" />
                </button>
                <div className="muted stake-joker-hint" style={{ fontSize: '.95rem', fontWeight: 700, textAlign:'center' }}>
                  {quizJoker > 0
                    ? (useJoker ? 'Jokerin aktiviert' : 'Jokerin verfügbar – tippe zum Aktivieren')
                    : 'Keine Jokerin verfügbar'}
                </div>
              </div>
            )}
            <button className="btn btn-cta stake-submit" onClick={sendStake} disabled={inputLocked || stakeSent || !((coins === 0 ? stake === 0 : (stake === 3 || stake === 6 || stake === 9)))} style={{ marginTop: 16, width:'100%' }}>
              {stakeSent ? 'Gesendet ✓' : 'Einsatz senden'}
            </button>            </div>
          </section>
        )}

        {/* Hase */}
    {phase === 'CATEGORY' && cat === 'Hase' && (
          <section className="card">
      <h3>Hase – Runde {Number(roundIndex) + 1}</h3>
            {(endsAt && endsAt > now && !pausedAt && pausedRemaining===0) && (
              <div className={`timer active ${remainingSec<=10 ? 'low' : ''}`}>
                <div className="timer-bar" style={{ transform: `scaleX(${Math.max(0, Math.min(1, progress))})` }} />
                <div className="timer-label">{remainingSec > 0 ? `${remainingSec}s` : '-'}</div>
              </div>
            )}
            <div style={{ display:'flex', flexDirection:'column', gap:10, marginTop:4 }}>
              {haseAns.map((v, i) => (
                <div key={i} className="row" style={{ alignItems:'center', gap:12 }}>
                  <span className="pill" style={{ minWidth:42, textAlign:'center' }}>{i + 1}</span>
                  <input
                    id={`hase-name-${i + 1}`}
                    name={`hase_name_${i + 1}`}
                    className="input"
                    placeholder={`Name ${i + 1}`}
                    aria-label={`Name ${i + 1}`}
                    autoComplete="off"
                    value={v}
                    onChange={(e) => {
                      const a = [...haseAns];
                      a[i] = e.target.value;
                      setHaseAns(a);
                    }}
                    style={{ flex:1 }}
                  />
                </div>
              ))}
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <button
                className="btn btn-cta"
                onClick={() => { socket.emit('team:hase:submit', { answers: haseAns }); if(!editMode) setEditMode(false); }}
                disabled={inputLocked || submissionLocked}
              >{sendLabel}</button>
              {hasSubmitted && !inputLocked && (
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
            <h3>Kranich – {(KRANICH_ROUNDS[roundIndex] || KRANICH_ROUNDS[0]).title}</h3>
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
              {hasSubmitted && !inputLocked && (
                <button className="btn" type="button" onClick={()=>setEditMode(e=>!e)}>{editMode ? 'Fertig':'Bearbeiten'}</button>
              )}
            </div>
          </section>
        )}

        {/* Robbe */}
    {phase === 'CATEGORY' && cat === 'Robbe' && (
          <section className="card">
      <h3>Robbe – Runde {Number(roundIndex) + 1}</h3>
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
              {hasSubmitted && !inputLocked && (
                <button className="btn" type="button" onClick={()=>setEditMode(e=>!e)}>{editMode ? 'Fertig':'Bearbeiten'}</button>
              )}
            </div>
          </section>
        )}

        {/* Eule */}
    {phase === 'CATEGORY' && cat === 'Eule' && (
          <section className="card">
      <h3>Eule – Runde {Number(roundIndex) + 1}</h3>
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
                  {hasSubmitted && !inputLocked && (
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
                  {hasSubmitted && !inputLocked && (
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
                  {hasSubmitted && !inputLocked && (
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
      <h3>Wal – Runde {Number(roundIndex) + 1}</h3>
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
              {hasSubmitted && !inputLocked && (
                <button className="btn" type="button" onClick={()=>setEditMode(e=>!e)}>{editMode ? 'Fertig':'Bearbeiten'}</button>
              )}
            </div>
          </section>
        )}

        {/* ——— ELCH ——— */}
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
              <h3>Elch – Runde {Number(roundIndex) + 1}</h3>
              {(endsAt && endsAt > now && !pausedAt && pausedRemaining===0) && (
                <div className={`timer active ${remainingSec<=10 ? 'low' : ''}`}>
                  <div className="timer-bar" style={{ transform: `scaleX(${Math.max(0, Math.min(1, progress))})` }} />
                  <div className="timer-label">{remainingSec > 0 ? `${remainingSec}s` : '-'}</div>
                </div>
              )}
              {(st?.elch?.category || st?.elch?.exhausted) && (
                <div className="muted" style={{ marginTop: -6, textAlign:'center', width:'100%', fontSize:'1rem', fontWeight:700 }}>
                  {st?.elch?.category || '— Pool erschöpft —'}
                </div>
              )}
              <div className="muted" style={{ marginTop: 12, textAlign:'center' }}>
                {st?.elch?.exhausted
                  ? 'Alle Sprachen verbraucht.'
                  : (!st?.elch?.category
                      ? 'Warten bis Sprache gezogen.' // Placeholder ohne "Admin" Wortlaut
                      : (() => {
                          const myBuzz = Array.isArray(st?.elch?.buzzOrder) && st.elch.buzzOrder.some(b => b.teamId === fixedId);
                          if (myBuzz) return 'Du hast gebuzzert – warte auf Entscheidung.';
                          if (st?.elch?.buzzLocked) return 'Ein anderes Team war schneller.';
                          return 'Buzz ist frei.';
                        })()
                    )}
              </div>
            </section>
            {(() => {
              const el = st?.elch;
              const hasCat = !!el?.category;
              if (!hasCat) return null;
              const locked = !!el?.buzzLocked;
              const myBuzz = Array.isArray(el?.buzzOrder) && el.buzzOrder.some(b => b.teamId === fixedId);
              const cls = `buzz-overlay ${locked ? 'buzz-locked' : 'buzz-free'}${myBuzz ? ' buzz-own' : ''}`;
              // Kompakte, kleingeschriebene Labels direkt unter dem Buzz-Icon
              const label = !locked ? 'buzz' : (myBuzz ? 'dran' : 'zu spät');
              // Buzzer soll unabhängig vom allgemeinen Eingabe-Lock funktionieren
              // (z. B. wenn in derselben Runde erneut eine Sprache gezogen wird)
              const canBuzz = !locked && !myBuzz;
              return (
                <div
                  className={cls}
                  role="button"
                  aria-label={canBuzz ? 'Buzz drücken' : 'Buzz gesperrt'}
                  tabIndex={0}
                  onPointerDown={(e) => {
                    // Prefer immediate pointer reaction on mobile
                    if (canBuzz && !buzzLockRef.current) {
                      buzzLockRef.current = true;
                      try { e.preventDefault(); e.stopPropagation(); } catch {}
                      try { navigator.vibrate && navigator.vibrate([15, 40, 25]); } catch {}
                      socket.emit('team:elch:buzz');
                      setTimeout(()=>{ buzzLockRef.current = false; }, 600);
                    }
                  }}
                  onTouchStart={(e) => {
                    // iOS/Safari fallback – ensure touch triggers buzz
                    if (canBuzz && !buzzLockRef.current) {
                      buzzLockRef.current = true;
                      try { e.preventDefault(); e.stopPropagation(); } catch {}
                      try { navigator.vibrate && navigator.vibrate([15, 40, 25]); } catch {}
                      socket.emit('team:elch:buzz');
                      setTimeout(()=>{ buzzLockRef.current = false; }, 600);
                    }
                  }}
                  onClick={() => {
                    if (canBuzz && !buzzLockRef.current) {
                      buzzLockRef.current = true;
                      // Vibrationsfeedback (falls unterstützt)
                      try { navigator.vibrate && navigator.vibrate([15, 40, 25]); } catch {}
                      socket.emit('team:elch:buzz');
                      setTimeout(()=>{ buzzLockRef.current = false; }, 600);
                    }
                  }}
                  onKeyDown={e => {
                    if ((e.key === 'Enter' || e.key === ' ') && canBuzz && !buzzLockRef.current) {
                      buzzLockRef.current = true;
                      try { navigator.vibrate && navigator.vibrate([15, 40, 25]); } catch {}
                      socket.emit('team:elch:buzz');
                      setTimeout(()=>{ buzzLockRef.current = false; }, 600);
                    }
                  }}
                  style={{outline:'none'}}
                >
                  <span className="buzz-label" aria-live="polite">{label}</span>
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
            <h3>Bär – Runde {Number(roundIndex) + 1}</h3>
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
              {hasSubmitted && !inputLocked && (
                <button className="btn" type="button" onClick={()=>setEditMode(e=>!e)}>{editMode ? 'Fertig':'Bearbeiten'}</button>
              )}
            </div>
          </section>
        )}

        {/* Fuchs */}
    {phase === 'CATEGORY' && cat === 'Fuchs' && (
          <section className="card">
      <h3>Fuchs – Runde {Number(roundIndex) + 1}</h3>
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
              {hasSubmitted && !inputLocked && (
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
            {isReconnecting ? 'Verbindung wird wiederhergestellt…' : (!isConnected ? 'Getrennt. Versuche neu zu verbinden…' : (connError ? `Fehler: ${connError}` : ''))}
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
        const rawText = isObj ? f.text : f;
        const clean = (s)=> (s||'')
          .replace(/[\uFFFD]/g,'')
          .replace(/[\u{1F300}-\u{1FAFF}]/gu,'')
          .replace(/[\u{2600}-\u{27BF}]/gu,'')
          .replace(/\?{2,}/g,'');
        const text = clean(rawText);
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
            <div
              className={`facts-center__card ${(imgSrc?'with-image':'')} ${factsPaused ? 'paused' : ''}`}
              key={factIdx}
              onClick={toggleFactsPaused}
              onTouchStart={(e)=>{
                if(!e.touches || !e.touches[0]) return;
                const t = e.touches[0];
                factTouchStartXRef.current = t.clientX;
                factTouchStartYRef.current = t.clientY;
                factTouchStartTRef.current = Date.now();
                factSwipeUsedRef.current = false;
              }}
              onTouchMove={(e)=>{
                if(!e.touches || !e.touches[0]) return;
                const t = e.touches[0];
                const sx = factTouchStartXRef.current;
                const sy = factTouchStartYRef.current;
                if(sx==null || sy==null) return;
                const dx = t.clientX - sx;
                const dy = t.clientY - sy;
                if(Math.abs(dx) > 36 && Math.abs(dx) > Math.abs(dy)){
                  // prevent scroll when swipe gesture recognized
                  try { e.preventDefault(); } catch {}
                }
              }}
              onTouchEnd={(e)=>{
                const sx = factTouchStartXRef.current;
                const sy = factTouchStartYRef.current;
                if(sx==null || sy==null) return;
                const t = (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0] : null;
                const dx = t ? (t.clientX - sx) : 0;
                const dy = t ? (t.clientY - sy) : 0;
                const dt = (Date.now() - (factTouchStartTRef.current || 0));
                const isSwipe = Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy);
                if(isSwipe){
                  if(dx < 0) nextFact(); else prevFact();
                  factSwipeUsedRef.current = true;
                } else if (dt < 300) {
                  // treat as tap
                  toggleFactsPaused();
                }
                factTouchStartXRef.current = null;
                factTouchStartYRef.current = null;
                factTouchStartTRef.current = null;
              }}
            >
              {imgSrc && (
                <figure className="fact-figure" style={{ position:'relative', minHeight: factImgStatus[imgSrc] ? 'auto' : '160px', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  {!factImgStatus[imgSrc] && factImgStatus[imgSrc] !== false && (
                    <div style={{
                      position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center',
                      fontSize:'0.8rem', fontWeight:700, letterSpacing:'.05em', color:'#d0dae8', opacity:.55
                    }} aria-hidden>
                      Lädt…
                    </div>
                  )}
                  {factImgStatus[imgSrc] === false && (
                    <div style={{
                      position:'absolute', inset:0, display:'flex', flexDirection:'column', gap:6, alignItems:'center', justifyContent:'center',
                      fontSize:'0.7rem', fontWeight:700, color:'#ffb0b0', textAlign:'center', padding:'12px'
                    }}>
                      <span>Bildfehler</span>
                      <button type="button" className="btn small" style={{minHeight:0,padding:'6px 10px'}} onClick={()=>{
                        setFactImgStatus(p=>{ const cp={...p}; delete cp[imgSrc]; return cp; });
                      }}>Nochmal laden</button>
                    </div>
                  )}
                  {(() => {
                    const factObj = isObj ? f : (paired && typeof paired === 'object' ? paired : null);
                    const avif = factObj?.avif;
                    const webp = factObj?.webp;
                    return (
                      <picture style={{ width:'100%' }}>
                        {avif && <source srcSet={avif} type="image/avif" />}
                        {webp && <source srcSet={webp} type="image/webp" />}
                        <img
                          src={imgSrc}
                          alt={(isObj? f.alt : (paired && paired.alt)) || 'Abbildung zum Fun Fact'}
                          loading="lazy"
                          decoding="async"
                          style={factImgStatus[imgSrc] === false ? { opacity:0 } : {}}
                          onLoad={() => {
                            setFactImgStatus(prev => ({ ...prev, [imgSrc]: true }));
                          }}
                          onError={(e)=>{
                            try {
                              console.warn('[FunFact image failed]', imgSrc);
                              setFactImgStatus(prev => ({ ...prev, [imgSrc]: false }));
                              e.currentTarget.removeAttribute('src');
                            } catch {}
                          }}
                        />
                      </picture>
                    );
                  })()}
                </figure>
              )}
              <div className="fact-text">{text}</div>
            </div>
          </div>
        );
      })()}

  {/* Kurze Pause Footer (fixiert unten in Lobby) */}
  <LobbyPauseFooter visible={phase === 'LOBBY'} />

  {categorySummary && (()=>{
        const k = catKey(categorySummary.category);
        const earnEntries = Object.entries(categorySummary.earnings||{}).sort((a,b)=> (b[1]||0)-(a[1]||0));
        return (
          <div className={`category-summary-overlay cat-${k}`} role="dialog" aria-modal="true" aria-label="Kategorie Zusammenfassung">
    {/* Reuse the exact intro background for a consistent look */}
    <div className="cat-intro-blur" aria-hidden />
            <div className="category-summary__dialog">
              <div className="category-summary__header">
                <div className="cat-icon-wrap">
                  <img className="category-icon lg" src={`/categories/${k}.png`} alt={categorySummary.category}
                    onError={(e)=>{ if(!e.currentTarget.dataset.fallbackSvg){ e.currentTarget.dataset.fallbackSvg='1'; e.currentTarget.onerror=null; e.currentTarget.src=`/categories/${k}.svg`; }}} />
                </div>
                <h2 className="category-summary__title">{categorySummary.category}</h2>
                <div className="category-summary__meta">Pot: <span className="icon coin coin-sm" aria-hidden />{categorySummary.pot} · Runden: {categorySummary.roundsPlayed}</div>
              </div>
              <ul className="category-summary__list">
                {earnEntries.map(([tid,coinsEarned],idx)=>{
                  const t = teams.find(tt=>tt.id===tid);
                  const place = idx+1;
                  return (
                    <li key={tid} className={`place-${place}`}>
                      <div className="row" style={{justifyContent:'space-between', width:'100%'}}>
                        <div style={{display:'flex',alignItems:'center',gap:14}}>
                          <img src={assetUrl(t?.avatar||'/avatars/capybara.png')} alt="avatar" className="team-avatar-sm" />
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
          <ElchSlotDraw key={st.elch.category} text={st.elch.category} />
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
    <ElchSlotDraw text={text} />
  );
}

// Slot-style draw overlay for Elch language
function ElchSlotDraw({ text, used=[] }){
  const [show, setShow] = useState(true);
  const reelRef = useRef(null);
  // Auto-hide after short reveal
  useEffect(() => { const t = setTimeout(()=>setShow(false), 2400); return ()=>clearTimeout(t); }, [text]);
  // Toggle body class only while visible so Buzzer is not hidden afterwards
  useEffect(()=>{
    if (show) document.body.classList.add('elch-slot-active');
    else document.body.classList.remove('elch-slot-active');
    return () => { document.body.classList.remove('elch-slot-active'); };
  }, [show]);
  useEffect(()=>{
    const el = reelRef.current; if(!el) return;
    const clickSound = () => {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'triangle'; o.frequency.value = 420;
        o.connect(g); g.connect(ctx.destination);
        g.gain.setValueAtTime(0.0001, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.08);
        o.start(); o.stop(ctx.currentTime + 0.09);
      } catch {}
    };
    const item = el.querySelector('.slot-item'); if(!item) return;
    const h = item.getBoundingClientRect().height || 58;
    const n = el.children.length; const dist = h * (n-1);
    el.style.transform = 'translateY(0px)';
    requestAnimationFrame(()=>{
      el.style.transition = `transform 1300ms cubic-bezier(.2,.9,.2,1)`;
      el.style.transform = `translateY(-${dist}px)`;
    });
    const onEnd = () => {
      try { navigator.vibrate && navigator.vibrate([15]); } catch {}
      clickSound();
      try { const reel = el.closest('.reel'); reel && reel.classList.add('settled'); } catch {}
      el.removeEventListener('transitionend', onEnd);
    };
    el.addEventListener('transitionend', onEnd);
  }, [text]);
  if(!show) return null;

  const pool = Array.isArray(used) ? used.filter(x=>x && typeof x==='string') : [];
  const base = pool.length ? pool : ['Buchstaben', 'Tiere', 'Essen', 'Sport', 'Musik', 'Filme'];
  const makeStrip = () => {
    const tmp = [...base]; if(!tmp.includes(text)) tmp.push(text);
    const shuffled = tmp.sort(()=>Math.random()-0.5).slice(0,8);
    shuffled.push(text); // final item is the drawn language
    return shuffled;
  };
  const s = makeStrip();

  return (
    <div className="result-overlay elch-slot-overlay" aria-hidden>
      <div className="result-overlay__backdrop" />
      <div className="result-overlay__dialog elch-slot-modal">
        <div className="slot-machine single" aria-hidden>
          <div className="reel center"><div className="strip" ref={reelRef}>{s.map((t,i)=>(<div className="slot-item" key={i}>{t}</div>))}</div></div>
        </div>
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
      robbe: 'Ich weiß was, was du nicht weißt',
      eule: 'Augen auf bei der Filmwahl',
      fuchs: 'Very Important Silhouette',
      wal: 'Einer geht noch!',
      elch: 'Buchstabier’ das Ereignis mir',
      baer: 'Schätz’ me if you can',
    };
    return map[k] || (name || '');
  })();
  const textRef = useRef(null);
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      try {
        const reduce = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (textRef.current) {
          if (reduce) {
            textRef.current.style.opacity = '1';
            textRef.current.style.transform = 'translate(-50%, 0)';
          } else {
            textRef.current.animate([
              { opacity: 0, transform: 'translate(-50%, 10px)' },
              { opacity: 1, transform: 'translate(-50%, 0)' }
            ], { duration: 520, easing: 'cubic-bezier(.22,.9,.25,1)', fill: 'both' });
          }
        }
        const blur = document.querySelector('.cat-intro-blur');
        if (blur) {
          if (reduce) {
            blur.style.opacity = '1';
          } else {
            blur.animate([{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }], { duration: 1200, easing: 'ease', fill: 'both' });
          }
        }
      } catch {}
    });
    return () => cancelAnimationFrame(id);
  }, [k]);

  return (
    <div className="cat-intro-overlay min" aria-hidden>
      <div className="cat-intro-blur" />
      <div className="cat-intro-wrap">
        {LINE && <div ref={textRef} className="cat-intro-text below-bg">{LINE}</div>}
      </div>
    </div>
  );
}

// Fixes Footer für Lobby: "Kurze Pause" animiert (wiederhergestellt)
// Wird außerhalb des main-Content gerendert, damit Fun-Facts Overlay nicht verschoben wird.
// Re-Use der bestehenden .lobby-title + .k-letter Animation.
export function LobbyPauseFooter({ visible }) {
  if (!visible) return null;
  // Mit Ellipsen vorne & hinten (Punkte ebenfalls animiert)
  const text = '... kurze Pause ...';
  const chars = text.split('');
  return (
    <footer className="pause-footer" aria-label="Kurze Pause" role="contentinfo">
  <h3 className="lobby-title" aria-hidden>
        {chars.map((ch, i) => (
          ch === ' '
            ? <span className="k-space" aria-hidden key={`s-${i}`}>&nbsp;</span>
            : <span className="k-letter" style={{ '--i': i }} key={i}>{ch}</span>
        ))}
      </h3>
    </footer>
  );
}











