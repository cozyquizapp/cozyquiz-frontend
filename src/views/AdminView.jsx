import { useEffect, useMemo, useRef, useState } from 'react';
import { clearOverlay } from '../utils/overlay';
import socket, { ensureConnected } from '../socket.v2';
import catKey from '../utils/catKey';
import { assetUrl } from '../utils/assetUrl';
// Ausgelagerte Lösungen / Runden-Definitionen
import { HASE_SOLUTIONS, KRANICH_ROUNDS, ROBBE_CORRECT, ROBBE_ROUNDS, EULE_SOLUTIONS, FUCHS_SOLUTIONS, BAER_ROUNDS } from './quizSolutions';

// Text Normalisierung + einfache Ähnlichkeitsfunktion (Levenshtein-basiert light)
function norm(str){
  if(!str || typeof str !== 'string') return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}+/gu,'')
    .replace(/[^a-z0-9äöüß ]+/g,' ')
    .replace(/\s+/g,' ')  // Mehrfachspaces
    .trim();
}

// Simple Levenshtein similarity in [0,1]
function sim(a, b) {
  const A = norm(a), B = norm(b);
  if (!A && !B) return 1;
  if (!A || !B) return 0;
  const m = A.length, n = B.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = A[i - 1] === B[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  const dist = dp[m][n];
  const maxLen = Math.max(m, n) || 1;
  return 1 - dist / maxLen;
}

// Small helpers used across panels
function List({ items = [] }){
  return (
    <ul style={{ margin: 0, paddingLeft: 18 }}>
      {items.map((x, i) => (
        <li key={i} style={{ lineHeight: 1.4 }}>{x}</li>
      ))}
    </ul>
  );
}

function Avatar({ src, size = 20 }){
  const url = src ? assetUrl(src) : '/avatars/otter.png';
  return (
    <img
      src={url}
      alt=""
      width={size}
      height={size}
      style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }}
    />
  );
}

function lab(s){
  return <span className="muted" style={{ marginRight: 6 }}>{s}: </span>;
}

// Renders the raw per-team submission data for the current category
function CategoryPanel({ cat, data }){
  switch (cat) {
    case 'Hase': {
      const arr = Array.isArray(data?.answers) ? data.answers : [];
      return <List items={arr.map((x, i) => `${i + 1}. ${x || '—'}`)} />;
    }
    case 'Kranich': {
      const ord = Array.isArray(data?.order) ? data.order : [];
      return (
        <div>
          <div style={{ marginBottom: 6 }}>{lab('Kategorie')}<b>{data?.category || '—'}</b></div>
          {ord.length ? (
            <table className="table" style={{ fontSize: '.9rem' }}>
              <tbody>
                {ord.map((v, i) => (
                  <tr key={i}><td style={{width:26}}>{i + 1}.</td><td>{v || '—'}</td></tr>
                ))}
              </tbody>
            </table>
          ) : <div className="muted">—</div>}
        </div>
      );
    }
    case 'Robbe': {
      const a = data?.perc?.a, b = data?.perc?.b, c = data?.perc?.c;
      return (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <span>{lab('A')}<b>{a ?? '—'}%</b></span>
          <span>{lab('B')}<b>{b ?? '—'}%</b></span>
          <span>{lab('C')}<b>{c ?? '—'}%</b></span>
        </div>
      );
    }
    case 'Eule': {
      const r1 = Array.isArray(data?.r1) ? data.r1 : [];
      const r3 = Array.isArray(data?.r3) ? data.r3 : [];
      const r4 = Array.isArray(data?.r4) ? data.r4 : [];
      return (
        <div style={{ display: 'grid', gap: 6 }}>
          {r1.length ? (<div><b>R1</b><List items={r1} /></div>) : null}
          {r3.length ? (<div><b>R3</b><List items={r3.map((x,i)=>`${i+1}. ${x}`)} /></div>) : null}
          {r4.length ? (<div><b>R4</b><List items={r4.map((x,i)=>`${i+1}. ${x}`)} /></div>) : null}
          {!r1.length && !r3.length && !r4.length && <div className="muted">—</div>}
        </div>
      );
    }
    case 'Fuchs': {
      return <div>{lab('Guess')}<b>{data?.guess || '—'}</b></div>;
    }
    case 'Bär': {
      return <div>{lab('Schätzung')}<b>{data?.estimate ?? '—'}</b></div>;
    }
    default:
      return <div className="muted">—</div>;
  }
}

// ---------- main component (restored) ----------
function AdminView() {
  const [st, setSt] = useState(null);
  const [teams, setTeams] = useState([]);
  const [cat, setCat] = useState('Hase');
  const [timerSec, setTimerSec] = useState(60);
  const categoryTopRef = useRef(null);
  const prevSubsRef = useRef({});
  const flashMapRef = useRef(new Set());
  const [, forceTick] = useState(0);
  const [collapsedSidebar, setCollapsedSidebar] = useState(()=>{
    try { return localStorage.getItem('admin.collapsedSidebar') === '1'; } catch { return false; }
  });
  const [showDetails, setShowDetails] = useState(()=>{
    try { return localStorage.getItem('admin.showDetails') !== '0'; } catch { return true; }
  });
  const [showAllTeams, setShowAllTeams] = useState(false);
  const [lightMode, setLightMode] = useState(()=>{
    try { return localStorage.getItem('admin.lightMode') === '1'; } catch { return false; }
  });
  const [selectedWinnerIds, setSelectedWinnerIds] = useState([]);
  // mini-status-bar entfernt

  // Scoreboard v2 controls
  // Scoreboard CountUp speed control removed – use default speed in Scoreboard
  const [sbActive, setSbActive] = useState(null); // 'ARM' | 'START' | 'FINAL'
  const buildScorePayload = () => {
    const activeTeams = [...teams].sort((a,b)=> a.joinedAt - b.joinedAt).slice(0, Math.max(2, Math.min(5, Number(st?.teamLimit)||3)));
    const fin = {};
    const rd = {};
    if (st?.finalScores && typeof st.finalScores === 'object') {
      activeTeams.forEach(t=>{ fin[t.id] = Math.max(0, Number(st.finalScores[t.id]||0)); });
    } else {
      activeTeams.forEach(t=>{ fin[t.id] = Math.max(0, Number(t.coins)||0); });
    }
    if (st?.roundDelta && typeof st.roundDelta === 'object') {
      activeTeams.forEach(t=>{ rd[t.id] = Math.max(0, Number(st.roundDelta[t.id]||0)); });
    } else {
      activeTeams.forEach(t=>{ rd[t.id] = Math.max(0, Number(t.coins)||0); }); // fallback
    }
    // If no per-round deltas, force a visible animation by using totals as delta
    const rdSum = Object.values(rd).reduce((a,v)=>a + Math.max(0, Number(v)||0), 0);
    if (rdSum === 0) {
      activeTeams.forEach(t=>{ rd[t.id] = fin[t.id] || 0; });
    }
    // Seed weglassen → Scoreboard nimmt automatisch Date.now()
  return { finalScores: fin, roundDelta: rd };
  };
  const sbArm = () => { setSbActive('ARM'); socket.emit('scoreboard:v2:arm'); socket.emit('admin:lobby:arm'); };
  const sbStart = () => { setSbActive('START'); socket.emit('scoreboard:v2:start', buildScorePayload()); };
  const sbFinal = () => { setSbActive('FINAL'); socket.emit('scoreboard:v2:mode', { mode: 'FINAL' }); };
  // CountUp & Replay entfernt – CountUp läuft automatisch nach dem Stacken

  // Tooltip dictionary (zentral)
  const TT = useMemo(()=>({
    Lobby: 'Zur Lobby wechseln',
    Hase: 'Kategorie Hase starten',
    Kranich: 'Kategorie Kranich starten',
    Robbe: 'Kategorie Robbe starten',
    Eule: 'Kategorie Eule starten',
    Fuchs: 'Kategorie Fuchs starten',
    Wal: 'Kategorie Wal starten',
    Elch: 'Kategorie Elch starten',
    Bär: 'Kategorie Bär starten',
    stakesLock: 'Einsätze sperren (keine Änderungen mehr)',
    roundPrev: 'Vorherige Runde',
    roundNext: 'Nächste Runde',
    finishCategory: 'Kategorie beenden & Auswertung',
    detailsToggleOn: 'Kategorie-Details ausblenden',
    detailsToggleOff: 'Kategorie-Details anzeigen',
    lightToggle: lightMode ? 'Dunklen Modus aktivieren' : 'Hellen Modus aktivieren',
    export: 'Spielstand (Teams + Status) als Datei exportieren',
  import: 'Spielstand aus Datei importieren',
  // mini-status-bar entfernt
    nextRoundQA: 'Direkt nächste Runde',
    finishCatQA: 'Kategorie jetzt beenden',
    lockStakesQA: 'Einsätze jetzt sperren',
    startTimerQA: 'Timer starten',
    stopTimerQA: 'Timer stoppen'
  }), [lightMode]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, []);

  const endsAt = st?.timerEndsAt || null;
  const duration = Math.max(0, Number(st?.timerDuration || 0));
  const remainingMs = endsAt ? Math.max(0, endsAt - now) : 0;
  const remainingSec = Math.ceil(remainingMs / 1000);
  const progress = endsAt && duration > 0 ? Math.max(0, Math.min(1, remainingMs / (duration * 1000))) : 0;

  // Pause
  const [pausedAt, setPausedAt] = useState(null);
  const pauseTimer = () => {
    if (st?.timerEndsAt && !pausedAt) {
      const remaining = Math.max(1, Math.ceil((st.timerEndsAt - now) / 1000));
      setPausedAt({ at: Date.now(), remaining });
      socket.emit('admin:timer:stop');
    }
  };
  const resumeTimer = () => {
    if (pausedAt && pausedAt.remaining > 0) {
      socket.emit('admin:timer:resume');
      setPausedAt(null);
    }
  };
  useEffect(() => {
    if (st?.timerEndsAt && st?.timerEndsAt > now) setPausedAt(null);
    if (st?.phase !== 'CATEGORY') setPausedAt(null);
  }, [st?.timerEndsAt, st?.phase, now]);

  // Timer start/stop (simplified – admin chooses duration via timerSec input)
  const startTimer = () => {
    const dur = Math.max(1, Math.min(999, Number(timerSec)||0));
    socket.emit('admin:timer:start', { seconds: dur });
  };
  const stopTimer = () => {
    socket.emit('admin:timer:stop');
  };

  // --- Admin actions (missing handlers) ---
  const lockStakes = () => { try { clearOverlay(); } catch {} socket.emit('admin:stakes:lock'); };
  const prevRound = () => socket.emit('admin:round:prev');
  const nextRound = () => socket.emit('admin:round:next');
  const finishCategory = () => socket.emit('admin:category:finish');
  // Team update -> backend expects: 'admin:team:update' with { id, coins?, quizJoker?, name?, avatar? }
  const patchTeam = (teamId, field, value) => socket.emit('admin:team:update', { id: teamId, [field]: value });
  const roundResolved = !!st?.roundResolved;
  // Resolve winner -> backend expects: 'admin:round:resolve' with { winnerId } (legacy) or { winnerIds } (array)
  const resolveFor = (teamIdOrNull) => {
    if (roundResolved) return;
    socket.emit('admin:round:resolve', { winnerId: teamIdOrNull });
    setSelectedWinnerIds([]);
  };
  const toggleWinnerSelection = (teamId) => {
    setSelectedWinnerIds((prev) => {
      if (prev.includes(teamId)) return prev.filter((id) => id !== teamId);
      return [...prev, teamId];
    });
  };
  const distributePot = () => {
    if (roundResolved || selectedWinnerIds.length === 0) return;
    socket.emit('admin:round:resolve', { winnerIds: selectedWinnerIds });
    setSelectedWinnerIds([]);
  };
  const liveCP = useMemo(()=> Math.max(0, Number(st?.categoryPot||0)), [st?.categoryPot]);

  // connect
  useEffect(() => {
    ensureConnected();
    const onState = (g) => setSt(g);
    const onTeams = (t) => setTeams(t);
    socket.on('state:update', onState);
    socket.on('teamsUpdated', onTeams);
    socket.emit('admin:resume');
    socket.emit('requestState');
    socket.emit('requestTeams');
    return () => {
      socket.off('state:update', onState);
      socket.off('teamsUpdated', onTeams);
    };
  }, []);

  const phase = st?.phase || 'LOBBY';
  const two = useMemo(() => [...teams].sort((a, b) => a.joinedAt - b.joinedAt).slice(0, 2), [teams]);
  // Aktive Teams nach konfigurierbarer Grenze (Default 3) – server liefert teamLimit
  const active = useMemo(()=>{
    const limit = Math.max(2, Math.min(5, Number(st?.teamLimit) || 3));
    return [...teams].sort((a,b)=> a.joinedAt - b.joinedAt).slice(0, limit);
  }, [teams, st?.teamLimit]);
  // Derived round index & top active teams (A,B,C) for category panels
  const roundIdx = Number(st?.roundIndex || 0);
  const A = active[0];
  const B = active[1];
  const C = active[2];
  useEffect(() => {
    setSelectedWinnerIds([]);
  }, [st?.roundIndex, st?.currentCategory]);
  useEffect(() => {
    if (!roundResolved) return;
    setSelectedWinnerIds([]);
  }, [roundResolved]);

  // ---- Submissions je Team ----
  const subA = A ? st?.submissions?.[A.id] : null;
  const subB = B ? st?.submissions?.[B.id] : null;
  const subC = C ? st?.submissions?.[C.id] : null;

  // Hase
  const haseSolution = (st?.currentCategory === 'Hase') ? (HASE_SOLUTIONS[roundIdx] || []) : [];
  // Fuzzy Matching für Hase (erkennt Teilnamen, Nicknames, leichte Tippfehler)
  const fuzzyMatch = (a = '', b = '') => {
    if (!a || !b) return false;
    const na = norm(a), nb = norm(b);
    if (!na || !nb) return false;
    if (na === nb) return true;
    // Levenshtein-Ähnlichkeit (sim() nutzt bereits normalisierte Strings)
    if (sim(na, nb) >= 0.78) return true; // etwas toleranter als 0.85
    // Token Overlap (ein identischer signifikanter Token >=3 Zeichen)
    const ta = na.split(' ').filter(t => t.length > 2);
    const tb = nb.split(' ').filter(t => t.length > 2);
    if (ta.some(t => tb.includes(t))) return true;
    // Nickname/Synonym Mapping (erweiterbar)
    const SYN = {
      'jogi': 'joachim',
      'löw': 'löw',
      'low': 'löw',
      'merkel': 'merkel',
      'angie': 'angela',
    };
    const expand = (tokens) => tokens.map(t => SYN[t] || t);
    const ea = new Set(expand(ta));
    const eb = new Set(expand(tb));
    if ([...ea].some(t => eb.has(t))) return true;
    return false;
  };
  const countHitsFuzzy = (answers = [], solution = []) => {
    let hits = 0;
    for (let i = 0; i < Math.min(answers.length, solution.length); i++) {
      if (fuzzyMatch(answers[i], solution[i])) hits++;
    }
    return hits;
  };
  const hitsA_Hase = (st?.currentCategory === 'Hase' && subA?.answers) ? countHitsFuzzy(subA.answers, haseSolution) : null;
  const hitsB_Hase = (st?.currentCategory === 'Hase' && subB?.answers) ? countHitsFuzzy(subB.answers, haseSolution) : null;
  const hitsC_Hase = (st?.currentCategory === 'Hase' && subC?.answers) ? countHitsFuzzy(subC.answers, haseSolution) : null;

  // Kranich
  const KR = KRANICH_ROUNDS[roundIdx] || KRANICH_ROUNDS[0];
  const krSolutionFor = (catId) => (KR.solutions?.[catId] || []);
  const krHits = (order = [], catId) => {
    const sol = krSolutionFor(catId).map(norm);
    const ans = (order || []).map(norm);
    let hits = 0;
    for (let i = 0; i < Math.min(ans.length, sol.length); i++) {
      if (ans[i] && sol[i] && ans[i] === sol[i]) hits++;
    }
    return hits;
  };
  const hitsA_Kran = (st?.currentCategory === 'Kranich' && subA?.order) ? krHits(subA.order, subA.category) : null;
  const hitsB_Kran = (st?.currentCategory === 'Kranich' && subB?.order) ? krHits(subB.order, subB.category) : null;
  const hitsC_Kran = (st?.currentCategory === 'Kranich' && subC?.order) ? krHits(subC.order, subC.category) : null;

  // Robbe – Prozentwerte für richtige Option
  const robbeCorrectKey = st?.currentCategory === 'Robbe' ? (ROBBE_CORRECT[roundIdx] || null) : null;
  const robbeRound = (st?.currentCategory === 'Robbe') ? (ROBBE_ROUNDS?.[roundIdx] || null) : null;
  const robbePercA = (st?.currentCategory === 'Robbe' && subA?.perc && robbeCorrectKey) ? subA.perc[robbeCorrectKey] : null;
  const robbePercB = (st?.currentCategory === 'Robbe' && subB?.perc && robbeCorrectKey) ? subB.perc[robbeCorrectKey] : null;
  const robbePercC = (st?.currentCategory === 'Robbe' && subC?.perc && robbeCorrectKey) ? subC.perc[robbeCorrectKey] : null;

  // Eule – Hilfsstrukturen (4 Runden: r1 unordered, r2 2 Morphs, r3 3 Poster, r4 4 Missing Items)
  const euleR1Set = useMemo(()=> new Set((EULE_SOLUTIONS.r1 || []).map(norm)), []);
  const euleR3 = (EULE_SOLUTIONS.r3 || []).map(norm);
  const euleR4 = (EULE_SOLUTIONS.r4 || []).map(norm);
  const countUnorderedUnique = (answers = []) => {
    const seen = new Set(); let hits = 0;
    for (const raw of (answers||[])) {
      const n = norm(raw);
      if (n && euleR1Set.has(n) && !seen.has(n)) { seen.add(n); hits++; }
    }
    return hits;
  };
  const countPosHits = (answers = [], solution = []) => {
    const normAns = (answers||[]).map(norm);
    let hits = 0;
    for (let i=0;i<Math.min(normAns.length, solution.length);i++) if (normAns[i] && solution[i] && normAns[i]===solution[i]) hits++;
    return hits;
  };
  const euleInfo = (() => {
    if (st?.currentCategory !== 'Eule') return null;
    // Runde 1 – viele Animationsfilme (unordered)
    if (roundIdx === 0) {
      return {
        title: 'Runde 1 – Animationsfilme (so viele wie möglich)',
        solutionList: EULE_SOLUTIONS.r1,
        aHits: Array.isArray(subA?.r1) ? countUnorderedUnique(subA.r1) : null,
        bHits: Array.isArray(subB?.r1) ? countUnorderedUnique(subB.r1) : null,
        cHits: Array.isArray(subC?.r1) ? countUnorderedUnique(subC.r1) : null,
        footnote: 'Reihenfolge egal – eindeutige Übereinstimmungen gezählt.'
      };
    }
    // Runde 2 – 2 Morph Cover (qualitativ, keine Positionswertung)
    if (roundIdx === 1) {
      return {
        title: 'Runde 2 – Gemorphte Cover',
        solutionList: EULE_SOLUTIONS.r2,
        aHits: null, bHits: null, cHits: null,
        footnote: 'Manuelle Bewertung – keine automatische Trefferzählung implementiert.'
      };
    }
    // Runde 3 – 3 Poster (positionsabhängig)
    if (roundIdx === 2) {
      return {
        title: 'Runde 3 – 3 Poster (positionsgenau)',
        solutionList: EULE_SOLUTIONS.r3.map((x,i)=> `${i+1}. ${x}`),
        aHits: Array.isArray(subA?.r3) ? countPosHits(subA.r3, euleR3) : null,
        bHits: Array.isArray(subB?.r3) ? countPosHits(subB.r3, euleR3) : null,
        cHits: Array.isArray(subC?.r3) ? countPosHits(subC.r3, euleR3) : null,
        footnote: 'Positionsgenaue Übereinstimmung.'
      };
    }
    // Runde 4 – 4 Poster (fehlende Dinge, positionsabhängig)
    if (roundIdx === 3) {
      return {
        title: 'Runde 4 – Was fehlt? (positionsgenau)',
        solutionList: EULE_SOLUTIONS.r4.map((x,i)=> `${i+1}. ${x}`),
        aHits: Array.isArray(subA?.r4) ? countPosHits(subA.r4, euleR4) : null,
        bHits: Array.isArray(subB?.r4) ? countPosHits(subB.r4, euleR4) : null,
        cHits: Array.isArray(subC?.r4) ? countPosHits(subC.r4, euleR4) : null,
        footnote: 'Positionsgenaue Übereinstimmung.'
      };
    }
    return null;
  })();

  // Fuchs
  const fuchsSolution = (st?.currentCategory === 'Fuchs') ? (FUCHS_SOLUTIONS[roundIdx] || '') : '';
  const hitsA_Fuchs = (st?.currentCategory === 'Fuchs' && subA?.guess)
    ? (sim(subA.guess, fuchsSolution) >= 0.85 ? 1 : 0)
    : null;
  const hitsB_Fuchs = (st?.currentCategory === 'Fuchs' && subB?.guess)
    ? (sim(subB.guess, fuchsSolution) >= 0.85 ? 1 : 0)
    : null;
  const hitsC_Fuchs = (st?.currentCategory === 'Fuchs' && subC?.guess)
    ? (sim(subC.guess, fuchsSolution) >= 0.85 ? 1 : 0)
    : null;
  // Fuchs Speed (erste richtige Antwort)
  const roundStartTs = st?.roundStartTs || null;
  const fuchsSpeed = (() => {
    if(st?.currentCategory !== 'Fuchs') return null;
    const entriesRaw = [ ['A', subA, hitsA_Fuchs, A], ['B', subB, hitsB_Fuchs, B], ['C', subC, hitsC_Fuchs, C] ].filter(x=>x[1]);
    if(!entriesRaw.length) return null;
    const firstTimes = entriesRaw.map(([,_sub])=>(_sub?.firstGuessTs || _sub?.ts)).filter(Boolean);
    const baseline = roundStartTs || (firstTimes.length ? Math.min(...firstTimes) : null);
    const enriched = entriesRaw.map(([label, sub, hit, team]) => {
      const firstTs = sub.firstGuessTs || sub.ts || null;
      const ms = (firstTs && baseline) ? Math.max(0, firstTs - baseline) : null;
      return { label, sub, hit, team, ms, firstTs };
    });
    const correct = enriched.filter(e=>e.hit===1 && e.firstTs);
    if(correct.length){
      correct.sort((a,b)=>a.firstTs - b.firstTs);
      const winner = correct[0];
      const tie = correct.filter(e=>e.firstTs===winner.firstTs);
      return { entries: enriched, winner, tie };
    }
    return { entries: enriched };
  })();

  // Bär – klassisch: nächster Abstand zur echten Lösung gewinnt
  const baerInfo = (() => {
    if (st?.currentCategory !== 'Bär') return null;
    const BR = BAER_ROUNDS[roundIdx] || BAER_ROUNDS[0];
    const sA = (subA && typeof subA.estimate === 'number') ? subA.estimate : null;
    const sB = (subB && typeof subB.estimate === 'number') ? subB.estimate : null;
    const sC = (subC && typeof subC.estimate === 'number') ? subC.estimate : null;
    const dA = (sA != null) ? Math.abs(sA - BR.solution) : null;
    const dB = (sB != null) ? Math.abs(sB - BR.solution) : null;
    const dC = (sC != null) ? Math.abs(sC - BR.solution) : null;
    let hint = '—';
    const deltas = [ ['A', dA, A], ['B', dB, B], ['C', dC, C] ].filter(x=>x[1]!=null);
    if (deltas.length > 1) {
      deltas.sort((a,b)=>a[1]-b[1]);
      const best = deltas[0];
      const ties = deltas.filter(x=>x[1]===best[1]);
      hint = ties.length>1 ? 'Gleichstand – Admin entscheidet.' : `Vorsprung: ${best[2]?.name}`;
    } else if (deltas.length === 1) {
      hint = `${deltas[0][2]?.name} hat eine gültige Schätzung.`;
    }
    const fmt = (v) => {
      if (v == null) return '—';
      if (BR.unit === 'h') return `${v.toFixed(2)} h`;
      if (BR.unit === 'm') return `${Math.round(v)} m`;
      return new Intl.NumberFormat('de-DE').format(v);
    };
    const fmtDelta = (v) => (v == null ? '—' : (BR.unit === 'h' ? `${v.toFixed(2)} h` : (BR.unit === 'm' ? `${Math.round(v)} m` : `${new Intl.NumberFormat('de-DE').format(Math.round(v))}`)));
    return { title: BR.title, question: BR.question, solutionLabel: BR.solutionLabel, unit: BR.unit, aVal: sA, bVal: sB, cVal: sC, aDelta: dA, bDelta: dB, cDelta: dC, fmt, fmtDelta, hint };
  })();

  // Inline solution block next to each team's input (supports 1-5 teams)
  function InlineSolution({ teamId }) {
    const sub = st?.submissions?.[teamId];
    switch (st?.currentCategory) {
      case 'Hase': {
        const hits = Array.isArray(sub?.answers) ? countHitsFuzzy(sub.answers, haseSolution) : null;
        if (!haseSolution?.length) return null;
        return (
          <div className="muted" style={{ marginTop: 8 }}>
            Treffer: <b>{hits ?? 0}</b> / {haseSolution.length}
          </div>
        );
      }
      case 'Kranich': {
  // Hinweis: Kranich-Lösung + Treffer werden bereits im großen Kranich-Block angezeigt.
  // Um doppelte Anzeige zu vermeiden, hier nichts zurückgeben.
  return null;
      }
      case 'Robbe': {
        const perc = (()=>{
          if (!sub || !robbeCorrectKey) return null;
          return sub.perc?.[robbeCorrectKey] ?? null;
        })();
        return (
          <div className="muted" style={{ marginTop: 8 }}>
            Richtige Option: <b>{robbeCorrectKey ? robbeCorrectKey.toUpperCase() : '–'}</b>
            {perc != null && <> · Prozent: <b>{perc}%</b></>}
          </div>
        );
      }
      case 'Eule': {
        if (!euleInfo || !sub) return null;
        let hits = null;
        if (roundIdx === 0 && Array.isArray(sub?.r1)) hits = countUnorderedUnique(sub.r1);
        if (roundIdx === 2 && Array.isArray(sub?.r3)) hits = countPosHits(sub.r3, euleR3);
        if (roundIdx === 3 && Array.isArray(sub?.r4)) hits = countPosHits(sub.r4, euleR4);
        return (
          <div className="muted" style={{ marginTop: 8 }}>
            {euleInfo.footnote ? <div>{euleInfo.footnote}</div> : null}
            {(hits != null) && <>Treffer: <b>{hits}</b></>}
          </div>
        );
      }
      case 'Fuchs': {
        const hit = (sub?.guess && fuchsSolution) ? (sim(sub.guess, fuchsSolution) >= 0.85 ? 1 : 0) : null;
        return (
          <div className="muted" style={{ marginTop: 8 }}>
            Lösung: <b>{fuchsSolution || '–'}</b>
            {(hit != null) && <> · Treffer: <b>{hit}</b>/1</>}
          </div>
        );
      }
      case 'Bär': {
        if (!baerInfo || !sub) return null;
        const delta = (typeof sub?.estimate === 'number') ? Math.abs(sub.estimate - (BAER_ROUNDS[roundIdx] || BAER_ROUNDS[0]).solution) : null;
        return (
          <div className="muted" style={{ marginTop: 8 }}>
            Richtig: <b>{baerInfo.solutionLabel}</b>
            {(delta != null) && <> · Abstand: <b>{baerInfo.fmtDelta(delta)}</b></>}
          </div>
        );
      }
      default:
        return null;
    }
  }

  // body theme class per category
  useEffect(() => {
    const cls = catKey(st?.currentCategory);
    const all = ['cat-baer','cat-eule','cat-elch','cat-fuchs','cat-hase','cat-kranich','cat-robbe','cat-wal'];
    document.body.classList.remove(...all);
    if (cls) document.body.classList.add(`cat-${cls}`);
    // Phase class for robust CSS targeting
    const phaseClasses = ['phase-LOBBY','phase-STAKE','phase-CATEGORY'];
    document.body.classList.remove(...phaseClasses);
    if (phase) document.body.classList.add(`phase-${phase}`);
    // Light mode toggle
    if (lightMode) document.body.classList.add('admin-light'); else document.body.classList.remove('admin-light');
    // Disable global aurora background on admin (removes big round field)
    document.body.classList.add('no-aurora');
    // Mark admin route globally
    document.body.classList.add('is-admin');
    return () => {
      try { clearOverlay(); } catch {}
      if (cls) document.body.classList.remove(`cat-${cls}`);
      document.body.classList.remove(...phaseClasses);
      document.body.classList.remove('no-aurora');
      document.body.classList.remove('is-admin');
    };
  }, [st?.currentCategory, lightMode, phase]);

  // Persist some prefs
  useEffect(()=>{ try { localStorage.setItem('admin.collapsedSidebar', collapsedSidebar ? '1':'0'); } catch {} }, [collapsedSidebar]);
  useEffect(()=>{ try { localStorage.setItem('admin.showDetails', showDetails ? '1':'0'); } catch {} }, [showDetails]);
  useEffect(()=>{ try { localStorage.setItem('admin.lightMode', lightMode ? '1':'0'); } catch {} }, [lightMode]);
  // mini-status-bar entfernt: keine Persistenz/Tracking mehr

  // mini-status-bar entfernt: kein Auto-Pin/Phase-Handling mehr

  // mini-status-bar entfernt: kein Scroll-Handling mehr

  const categoryButtons = (
    <>
      <div className="sidebar-topline">
        <button
          className="btn cat-btn"
          style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'8px 10px' }}
          title={TT.Lobby}
          aria-label={TT.Lobby}
          onClick={() => socket.emit('admin:lobby')}
        >
          <span style={{ fontWeight: 900 }}>Lobby</span>
        </button>
  {/* sidebar collapse toggle removed */}
      </div>
  {['Hase','Kranich','Robbe','Eule','Fuchs','Wal','Elch','Bär'].map((c) => {
        const k2 = catKey(c);
        const activeC = st?.currentCategory === c;
        return (
          <button
            key={c}
            className={`btn cat-btn ${activeC ? 'active' : ''}`}
            aria-current={activeC ? 'true' : 'false'}
            title={TT[c] || `Wechsel zu ${c}`}
            aria-label={TT[c] || c}
            onClick={() => socket.emit('admin:category:start', { category: c })}
          >
            <img className="category-icon" src={`/categories/${k2}.png`} alt={c}
              onError={(e)=>{ if(!e.currentTarget.dataset.fallback){ e.currentTarget.dataset.fallback='1'; e.currentTarget.src=`/categories/${k2}.svg`; }}} />
            <span className="cat-label">{c}</span>
          </button>
        );
      })}
    </>
  );

  // removed legacy race switcher – replaced by Scoreboard controls below

  return (
  <div className="admin-root horizontal-cats">
      <aside className={`admin-sidebar cat-sidebar ${collapsedSidebar ? 'collapsed':''}`} aria-label="Kategorien">
        {categoryButtons}
      </aside>
      <main className="admin-main">
  {/* Neon background handled via CSS ::before on .admin-layout; standalone div removed */}
        <div className={`admin-layout ${collapsedSidebar ? 'sidebar-collapsed':''}`}>
          <div className="admin-shell">
  <header className="admin-header category-header admin-header--compact admin-header--dense">
        <div style={{display:'flex', flexDirection:'column'}}>
          <h2>Admin</h2>
          <div className="admin-info-row" role="group" aria-label="Status & Kategorie">
            {st?.currentCategory && (() => { const k = catKey(st.currentCategory); return (
              <span className="chip-sm cat-chip">
                <img className="category-icon" src={`/categories/${k}.png`} alt={st.currentCategory} />
                <b>{st.currentCategory}</b>
              </span>
            ); })()}
            <span className="chip-sm phase-chip">Phase <b>{phase}</b></span>
            {phase === 'CATEGORY' && <span className="chip-sm round-chip">Runde <b>{roundIdx + 1}/3</b></span>}
            {phase === 'CATEGORY' && <span className="chip-sm carry-chip">Carry <b>{st?.carryRound ?? 0}</b></span>}
            <span className="chip-sm">Teams <b>{st?.teamLimit||3}</b></span>
            {phase === 'CATEGORY' && endsAt && endsAt > now && !pausedAt && (
              <span className="chip-sm timer-chip" title="Verbleibende Sekunden">⏱ <b>{remainingSec}s</b></span>
            )}
            {phase === 'CATEGORY' && pausedAt && (
              <span className="chip-sm timer-chip" title="Pausiert">⏸ <b>{Math.max(0, Number(pausedAt?.remaining)||0)}s</b></span>
            )}
          </div>
        </div>

  {/* Right side tools removed; scoreboard controls moved into toolbar below */}
  <div style={{ marginLeft: 'auto' }} />

  {/* watermark removed */}
      </header>

  {/* Timer */}
      {(endsAt && endsAt > now && !pausedAt) && (
        <div className="timer active">
          <div className="timer-bar" style={{ transform: `scaleX(${progress})` }} />
          <div className="timer-label">{remainingSec > 0 ? `${remainingSec}s` : '—'}</div>
        </div>
      )}
      {pausedAt && (
        <div className="timer active">
          <div
            className="timer-bar"
            style={{ transform: `scaleX(${Math.max(0, Math.min(1, (pausedAt.remaining / (duration || 1))))})` }}
          />
          <div className="timer-label">{pausedAt.remaining > 0 ? `${pausedAt.remaining}s` : '—'}</div>
        </div>
      )}

  {/* Controls */}
  <section className="card admin-controls full-span" aria-label="Steuerung">
  <div className="row wrap">

          {phase === 'STAKE' && <button className="btn" onClick={lockStakes} title={TT.stakesLock} aria-label={TT.stakesLock}>Einsätze sperren</button>}
          {phase === 'CATEGORY' && (
            <>
              <button className="btn" onClick={prevRound} title={TT.roundPrev} aria-label={TT.roundPrev}>{'\u2190'}</button>
              <button className="btn" onClick={nextRound} title={TT.roundNext} aria-label={TT.roundNext}>{'\u2192'}</button>
              <button className="btn btn-danger" onClick={finishCategory} title={TT.finishCategory} aria-label={TT.finishCategory}>Kategorie beenden</button>
            </>
          )}
          {phase === 'CATEGORY' && (
            <button
              className="btn"
              onClick={()=> setShowDetails(v=>!v)}
              title={showDetails ? TT.detailsToggleOn : TT.detailsToggleOff}
              aria-label={showDetails ? TT.detailsToggleOn : TT.detailsToggleOff}
            >{showDetails ? 'Details aus' : 'Details an'}</button>
          )}

          {/* Scoreboard Controls (merged here, right-aligned) */}
          <div style={{ marginLeft:'auto', display:'inline-flex', alignItems:'center', gap:8 }} role="group" aria-label="Scoreboard Steuerung">
            <a
              href="/scoreboard"
              target="_blank"
              rel="noopener noreferrer"
              className="btn"
              style={{padding:'0 12px', display:'inline-flex', alignItems:'center'}}
              title="Scoreboard (Coin Rain) öffnen"
              aria-label="Scoreboard öffnen"
            >Scoreboard</a>
            <div className="scoreboard-controls scoreboard-controls-group" style={{display:'inline-flex', alignItems:'center', gap:6}}>
              {/* CountUp-Speed Feld entfernt */}
              <button
                className={`btn ${sbActive==='ARM'?'sb-active':''}`}
                onClick={sbArm}
                title="ARM – Piles leeren & 0 anzeigen"
                aria-label="Arm"
                aria-pressed={sbActive==='ARM'}
              >Arm</button>
              <button
                className={`btn btn-primary ${sbActive==='START'?'sb-active':''}`}
                onClick={sbStart}
                title="Start Rain & Stacking"
                aria-label="Start"
                aria-pressed={sbActive==='START'}
              >Start</button>
              <button
                className={`btn ${sbActive==='FINAL'?'sb-active':''}`}
                onClick={sbFinal}
                title="Final anzeigen"
                aria-label="Final"
                aria-pressed={sbActive==='FINAL'}
              >Final</button>
            </div>
            <button
              className="btn btn-primary mode-toggle-btn"
              style={{padding:'0 14px'}}
              onClick={()=> setLightMode(v=>!v)}
              title={TT.lightToggle}
              aria-label={TT.lightToggle}
            >{lightMode ? '🌙' : '☀︎'}</button>
          </div>
        </div>

        {/* Timer Control */}
  <div className="row wrap" style={{ marginTop: 6 }}>
          <input className="input small" type="number" min="1" max="999" value={timerSec} onChange={e => setTimerSec(e.target.value)} />
          <button className="btn" onClick={startTimer}>⏱ Start</button>
          <button className="btn" onClick={stopTimer}>⏹ Stop</button>
          <span className="muted">Ohne Pause – klarer Start/Stop-Flow</span>
        </div>

  {/* Scoreboard v2 Controls entfernt; jetzt im Header */}

  {/* ELCH – Admin-Panel (erst nach Einsätze sperren, also in CATEGORY) */}
  {st?.currentCategory === 'Elch' && phase === 'CATEGORY' && (
          <div className="card" style={{ marginTop: 10, borderColor: '#3fa1ff55' }}>
            <h4>🏆 Sieger wählen</h4>
          {roundResolved && (
            <div className="muted">Runde bereits gewertet</div>
          )}
          <div className="row wrap" style={{ gap: 12 }}>
            {(active || []).slice(0,5).map(t => {
              const checked = selectedWinnerIds.includes(t.id);
              return (
                <div key={t.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.85rem' }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={roundResolved}
                      onChange={() => toggleWinnerSelection(t.id)}
                    />
                    nimmt am Pot teil?
                  </label>
                  <button className="btn btn-primary" disabled={roundResolved} onClick={() => resolveFor(t.id)}>
                    Sieger: {t.name}
                  </button>
                </div>
              );
            })}
          </div>
          <div className="row wrap" style={{ gap: 12, marginTop: 12 }}>
            <button className="btn btn-success" disabled={roundResolved || selectedWinnerIds.length === 0} onClick={distributePot}>
              Pot verteilen
            </button>
            <button className="btn" disabled={roundResolved} onClick={() => resolveFor(null)}>
              Keiner
            </button>
          </div>
          <div className="muted" style={{ marginTop: 6 }}>
            Payout/Runde: <b>{Math.floor((st?.categoryPot || 0) / 3)}</b> - Carry: <b>{st?.carryRound || 0}</b>
          </div>
          <div className="muted" style={{ fontSize: '.8rem' }}>
            Ohne Auswahl bleibt der Einzel-Sieger-Button aktiv.
          </div>
        </div>
      )}
    </section>
      {/* /admin-controls */}

      {/* Stakes */}
      {phase === 'STAKE' && (
        <section className="card admin-stakes side-col">
          <h4>💰 Einsätze</h4>
          <table className="stake-table">
            <thead>
              <tr>
                <th>Team</th>
                <th>Einsatz</th>
                <th>Jokerin</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(st?.stakes || {}).map(([tid, s]) => {
                const t = teams.find(x => x.id === tid);
                return (
                  <tr key={tid}>
                    <td>
                      <b>{t?.name}</b>
                      <span className="muted" style={{marginLeft:4}}>({tid.slice(0, 4)})</span>
                    </td>
                    <td style={{textAlign:'center'}}>{s.stake}</td>
                    <td style={{textAlign:'center', whiteSpace:'nowrap'}}>
                      {s.useJoker ? (<><span title="Jokerin aktiviert" className="icon joker" aria-hidden /> <b>Ja</b></>) : <span style={{opacity:.5}}>–</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="muted" style={{marginTop:8}}>CP: <b>{liveCP}</b> · Payout/Runde: <b>{Math.floor(liveCP / 3)}</b></div>
        </section>
      )}

  {/* Category display */}
  {phase === 'CATEGORY' && (
        <section ref={categoryTopRef} className={`card admin-category full-span ${showDetails ? '' : 'details-collapsed'}`} aria-label="Kategorie Eingaben">
          <h4>📝 Eingaben</h4>

          {/* Hase */}
          {showDetails && st?.currentCategory === 'Hase' && (
            <div className="card solution-card hase" style={{ marginTop: 8 }} data-active>
              <strong>🔎 Hase – Lösung · Runde {roundIdx + 1}</strong>
              <List items={haseSolution.map((x, i) => `${i + 1}. ${x}`)} />
              <div className="muted" style={{ marginTop: 8 }}>Treffer: {A?.name}: <b>{hitsA_Hase ?? 0}</b> · {B?.name}: <b>{hitsB_Hase ?? 0}</b>{C && <> · {C?.name}: <b>{hitsC_Hase ?? 0}</b></>}</div>
            </div>
          )}

          {showDetails && st?.currentCategory === 'Fuchs' && (
            <div className="card solution-card fuchs" style={{ marginTop: 8 }} data-active>
              <strong>🔎 Fuchs – richtige Lösung · Runde {roundIdx + 1}</strong>
              <div style={{ marginTop: 6 }}>Lösung: <b>{fuchsSolution || '—'}</b></div>
              {(() => {
                const arr = [ ['A', hitsA_Fuchs, A], ['B', hitsB_Fuchs, B], ['C', hitsC_Fuchs, C] ].filter(x=>x[1]!=null);
                if (arr.length < 2) return null;
                arr.sort((a,b)=>b[1]-a[1]);
                const best = arr[0];
                const ties = arr.filter(x=>x[1]===best[1]);
                const speedNote = (fuchsSpeed && fuchsSpeed.winner && fuchsSpeed.winner.hit===1)
                  ? `· Schnellste richtige Antwort: ${fuchsSpeed.winner.team?.name} (${(fuchsSpeed.winner.ms/1000).toFixed(2)}s)`
                  : '';
                if (ties.length>1 && fuchsSpeed && fuchsSpeed.winner && fuchsSpeed.winner.hit===1 && (!fuchsSpeed.tie || fuchsSpeed.tie.length===1)) {
                  return (
                    <div className="muted" style={{ marginTop: 6 }}>
                      Schnellste richtige Antwort: {fuchsSpeed.winner.team?.name} ({(fuchsSpeed.winner.ms/1000).toFixed(2)}s)
                    </div>
                  );
                }
                return <div className="muted" style={{ marginTop: 6 }}>{ties.length>1 ? 'Gleichstand – Admin entscheidet.' : `Vorsprung: ${best[2]?.name}`} {speedNote}</div>;
              })()}
              {fuchsSpeed?.entries?.length>0 && (
                <div className="muted" style={{ marginTop: 4, fontSize: '.8rem', lineHeight:1.4 }}>
                  Reihenfolge (Antwortzeit): {fuchsSpeed.entries
                    .filter(e=>typeof e.ms==='number')
                    .sort((a,b)=>a.ms-b.ms)
                    .map((e,i)=>{
                      const isWin = fuchsSpeed.winner && fuchsSpeed.winner.team?.id===e.team?.id && e.hit===1;
                      return (
                        <span key={e.team?.id||i} style={{marginRight:8}}>
                          {i>0 && '· '}
                          <b style={{color:isWin?'#5df9c9':'inherit'}}>{e.team?.name||'Team'}</b>
                          {e.hit===1? '✓':'✗'}
                          <span> {(e.ms/1000).toFixed(2)}s</span>
                        </span>
                      );
                    })}
                </div>
              )}
              {fuchsSpeed && fuchsSpeed.entries && !fuchsSpeed.winner && (
                <div className="muted" style={{ marginTop: 4 }}>
                  Noch keine richtige Antwort. {fuchsSpeed.entries.some(e=>e.ms!=null) && 'Antwortzeiten werden erfasst.'}
                </div>
              )}
            </div>
          )}

          {showDetails && st?.currentCategory === 'Kranich' && (
            <div className="card solution-card kranich" style={{ marginTop: 8 }} data-active>
              <strong>🔎 Kranich – Korrekte Ordnung · Runde {roundIdx + 1} · {KR.title}</strong>
              <div className="columns" style={{ marginTop: 8 }}>
                {[A,B,C].filter(Boolean).map((T,i)=>{
                  const sub = i===0?subA: i===1?subB: subC;
                  const hits = i===0?hitsA_Kran: i===1?hitsB_Kran: hitsC_Kran;
                  return (
                    <div className="col" key={T.id}>
                      <div style={{ marginBottom: 6 }} className="muted-strong">{T?.name}: <b>{sub?.category || '—'}</b></div>
                      <List items={(krSolutionFor(sub?.category) || []).map((x, j) => `${j + 1}. ${x}`)} />
                      {sub?.order && (
                        <>
                          <div className="muted" style={{ marginTop: 6 }}>Treffer: <b>{hits}</b>/4</div>
                          <table className="table" style={{ marginTop: 6 }}><tbody>
                            {Array.from({length:4},(_,k)=>k).map(k=>{
                              const ans = sub.order?.[k]||''; const sol = (krSolutionFor(sub.category)||[])[k]||'';
                              const ok = norm(ans)===norm(sol);
                              return (<tr key={k}><td>{k+1}.</td><td>{ans}</td><td style={{textAlign:'right'}}><span className={ok?'text-good':'text-muted-strong'}>{sol}</span></td></tr>);
                            })}
                          </tbody></table>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {showDetails && st?.currentCategory === 'Robbe' && (
            <div className="card solution-card robbe" style={{ marginTop: 8 }} data-active>
              <strong>🔎 Robbe – Richtige Option (Fake) · Runde {roundIdx + 1}</strong>
              <div style={{ marginTop: 6 }}>
                {robbeCorrectKey ? <>Richtig ist: <b>{robbeCorrectKey.toUpperCase()}</b></> : '—'}
              </div>
              {robbeRound && robbeRound.options && (
                <table className="table" style={{ marginTop: 10, fontSize: '.85rem' }}>
                  <tbody>
                    {['a','b','c'].map(k=>{
                      const opt = robbeRound.options[k];
                      if(!opt) return null;
                      const isFake = k === robbeRound.correct;
                      return (
                        <tr key={k}>
                          <td style={{whiteSpace:'nowrap'}}><b>{k.toUpperCase()}</b></td>
                          <td>
                            <div style={{fontWeight:600}}>{opt.text}</div>
                            <div className="muted" style={{marginTop:2}}>
                              {isFake ? '❌ Unwahr' : '✅ Wahr'} – {opt.explanation}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              <div className="columns" style={{ marginTop: 8 }}>
                {[A,B,C].filter(Boolean).map((T,i)=>{
                  const p = i===0?robbePercA: i===1?robbePercB: robbePercC;
                  return (
                    <div className="col" key={T.id}>
                      <div className="title"><Avatar src={T?.avatar} /> {T?.name}</div>
                      <div>Prozent auf {robbeCorrectKey?.toUpperCase()}: <b>{p ?? '—'}%</b></div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {showDetails && st?.currentCategory === 'Eule' && euleInfo && (
            <div className="card solution-card eule" style={{ marginTop: 8 }} data-active>
              <strong>🔎 Eule – {euleInfo.title}</strong>
              {euleInfo.solutionList?.length ? <List items={euleInfo.solutionList} /> : <div className="muted">—</div>}
              {(euleInfo.aHits != null || euleInfo.bHits != null || euleInfo.cHits != null) && (
                <div style={{ marginTop: 8 }} className="muted">
                  Treffer: {A?.name}: <b>{euleInfo.aHits ?? 0}</b> · {B?.name}: <b>{euleInfo.bHits ?? 0}</b>{C && <> · {C?.name}: <b>{euleInfo.cHits ?? 0}</b></>}
                  {euleInfo.footnote ? <div className="muted" style={{ marginTop: 4 }}>{euleInfo.footnote}</div> : null}
                </div>
              )}
            </div>
          )}

          {showDetails && st?.currentCategory === 'Bär' && baerInfo && (
            <div className="card solution-card baer" style={{ marginTop: 8 }} data-active>
              <strong>🔎 Bär – Runde {roundIdx + 1}: {baerInfo.title}</strong>
              <div style={{ marginTop: 6 }} className="muted">{baerInfo.question}</div>
              <div style={{ marginTop: 6 }}>Richtiger Wert: <b>{baerInfo.solutionLabel}</b></div>
              <div className="columns" style={{ marginTop: 10 }}>
                {[A,B,C].filter(Boolean).map((T,i)=>{
                  const val = i===0?baerInfo.aVal: i===1?baerInfo.bVal: baerInfo.cVal;
                  const d = i===0?baerInfo.aDelta: i===1?baerInfo.bDelta: baerInfo.cDelta;
                  return (
                    <div className="col" key={T.id}>
                      <div className="title"><Avatar src={T?.avatar} /> {T?.name}</div>
                      <div>Schätzung: <b>{baerInfo.fmt(val)}</b></div>
                      <div className="muted">Abstand: <b>{baerInfo.fmtDelta(d)}</b></div>
                    </div>
                  );
                })}
              </div>
              <div className="muted" style={{ marginTop: 8 }}>{baerInfo.hint}</div>
            </div>
          )}

          <div className="columns" style={{ marginTop: 10 }}>
            {active.slice(0,5).map((T)=>{
              const sub = st?.submissions?.[T.id] || null;
              const flash = flashMapRef.current.has(T.id);
              return (
                <div className={`col submission-block ${flash?'flash-update':''}`} key={T.id}>
                  <div className="title"><Avatar src={T?.avatar} /> {T?.name}</div>
                  <CategoryPanel cat={st?.currentCategory} data={sub} />
                  <InlineSolution teamId={T.id} />
                </div>
              );
            })}
          </div>
        </section>
      )}

  {/* Decide */}
  {phase === 'CATEGORY' && (
        <section className="card admin-decide full-span">
          <h4>🏆 Sieger wählen</h4>
          {roundResolved && (
            <div className="muted">Runde bereits gewertet</div>
          )}
          <div className="row wrap" style={{ gap: 12 }}>
            {(active || []).slice(0,5).map(t => {
              const checked = selectedWinnerIds.includes(t.id);
              return (
                <div key={t.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.85rem' }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={roundResolved}
                      onChange={() => toggleWinnerSelection(t.id)}
                    />
                    nimmt am Pot teil?
                  </label>
                  <button className="btn btn-primary" disabled={roundResolved} onClick={() => resolveFor(t.id)}>
                    Sieger: {t.name}
                  </button>
                </div>
              );
            })}
          </div>
          <div className="row wrap" style={{ gap: 12, marginTop: 12 }}>
            <button className="btn btn-success" disabled={roundResolved || selectedWinnerIds.length === 0} onClick={distributePot}>
              Pot verteilen
            </button>
            <button className="btn" disabled={roundResolved} onClick={() => resolveFor(null)}>
              Keiner
            </button>
          </div>
          <div className="muted" style={{ marginTop: 6 }}>
            Payout/Runde: <b>{Math.floor((st?.categoryPot || 0) / 3)}</b> - Carry: <b>{st?.carryRound || 0}</b>
          </div>
          <div className="muted" style={{ fontSize: '.8rem' }}>
            Ohne Auswahl bleibt der Einzel-Sieger-Button aktiv.
          </div>
        </section>
      )}

  {/* Teams */}
  <section className="card admin-teams full-span">
        <h4 style={{display:'flex',justifyContent:'space-between',alignItems:'center', gap:8, flexWrap:'wrap'}}>
          <span>👥 Teams</span>
          <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
            <button
              className="btn"
              style={{background:'#442',color:'#fdd'}}
              title="Alle Coins/Joker & Spielzustand zurücksetzen"
              onClick={()=>{ if(window.confirm('Kompletten Spielstand (Coins, Joker, Runden) wirklich zurücksetzen?')) socket.emit('admin:reset:all'); }}
            >Reset</button>
            <button
              className="btn"
              style={{height:46,minHeight:46}}
              title={TT.export}
              aria-label={TT.export}
              onClick={()=>{
                try {
                  const payload = {
                    ts: Date.now(),
                    phase: st?.phase,
                    teamLimit: st?.teamLimit,
                    roundIndex: st?.roundIndex,
                    currentCategory: st?.currentCategory,
                    raceMode: st?.raceMode,
                    carryRound: st?.carryRound,
                    categoryPot: st?.categoryPot,
                    stakes: st?.stakes,
                    teams: teams.map(t=>({ id:t.id, name:t.name, coins:t.coins, quizJoker:t.quizJoker })),
                  };
                  const blob = new Blob([JSON.stringify(payload,null,2)], { type:'application/json' });
                  const a = document.createElement('a');
                  a.href = URL.createObjectURL(blob);
                  a.download = 'spielstand.json';
                  document.body.appendChild(a); a.click(); a.remove();
                  setTimeout(()=>URL.revokeObjectURL(a.href), 2000);
                } catch(e){ console.error(e); }
              }}
            >Export</button>
            <button
              className="btn"
              style={{height:46,minHeight:46}}
              title={TT.import}
              aria-label={TT.import}
              onClick={()=>{
                const inp = document.createElement('input');
                inp.type='file'; inp.accept='.json,application/json';
                inp.onchange = ev => {
                  const file = ev.target.files?.[0]; if(!file) return;
                  const fr = new FileReader();
                  fr.onload = () => {
                    try {
                      const data = JSON.parse(fr.result || '{}');
                      if(!Array.isArray(data.teams)) { alert('Ungültiges Format'); return; }
                      if(!window.confirm('Import anwenden? Aktuelle Coins/Joker werden überschrieben.')) return;
                      if(data.teamLimit) socket.emit('admin:teamLimit:set', { limit: Math.max(2, Math.min(5, Number(data.teamLimit))) });
                      (data.teams||[]).forEach(tm=>{
                        if(tm && tm.id){
                          if(typeof tm.coins==='number') patchTeam(tm.id,'coins', tm.coins);
                          if(typeof tm.quizJoker==='number') patchTeam(tm.id,'quizJoker', tm.quizJoker);
                        }
                      });
                      alert('Import abgeschlossen (Coins/Joker aktualisiert).');
                    } catch(e){
                      console.error(e); alert('Fehler beim Import');
                    }
                  };
                  fr.readAsText(file);
                };
                inp.click();
              }}
            >Import</button>
          </div>
        </h4>
        {/* Team-Limit Steuerung */}
        <div style={{display:'flex', alignItems:'center', gap:12, flexWrap:'wrap', marginBottom:12}}>
          <label className="small-label" style={{fontWeight:700}}>Aktive Teams:</label>
          <div className="row" style={{gap:6}}>
            {[2,3,4,5].map(n => {
              const isSel = (Number(st?.teamLimit) || 3) === n;
              return (
                <button
                  key={n}
                  className="btn"
                  aria-pressed={isSel}
                  onClick={()=>socket.emit('admin:teamLimit:set', { limit: n })}
                  title={`Auf ${n} aktive Teams beschränken`}
                  style={isSel ? {
                    background:'#2ad18a',
                    color:'#0a0f18',
                    border:'1px solid #27c07f',
                    boxShadow:'0 0 0 2px rgba(42,209,138,.25) inset',
                    fontWeight:800
                  } : {}}
                >{n}</button>
              );
            })}
          </div>
          <span className="muted" style={{fontSize:'.8rem'}}>Nur die ersten N (Join-Reihenfolge) gelten für Kategorien & Race.</span>
          <span className="chip-sm chip-active" style={{marginLeft:6, borderRadius:12, padding:'4px 8px'}}>
            Ausgewählt: <b style={{color:'#2ad18a', marginLeft:4}}>{active.length}</b> / {teams.length}
          </span>
        </div>
        {/* Team Accordion */}
        {teams.length > active.length && (
          <div style={{marginBottom:12}}>
            <button
              className="btn"
              style={{height:40,minHeight:40,fontSize:'.8rem',padding:'0 12px'}}
              onClick={()=> setShowAllTeams(v=>!v)}
            >{showAllTeams ? 'Extra Teams verbergen' : `Weitere Teams anzeigen (${teams.length - active.length})`}</button>
          </div>
        )}
        <div className="teams-grid">
          {(showAllTeams ? teams : teams.slice(0, active.length)).map((t, i) => {
            const isActive = !showAllTeams || i < active.length;
            return (
              <div
                className={`team-card ${isActive ? 'is-active' : ''}`}
                key={t.id + (t.avatar || '')}
                style={isActive ? { borderColor:'#2ad18a55', boxShadow:'0 0 0 2px rgba(42,209,138,.25) inset' } : undefined}
              >
                <div className="team-line" style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:8}}>
                  <div><Avatar src={t.avatar} size={26} /> <b>{t.name}</b> <span className="muted">({t.id.slice(0, 4)})</span></div>
                  {isActive && (
                    <span title="Aktiv" aria-label="Aktives Team" className="chip-active" style={{display:'inline-flex', alignItems:'center', gap:6, borderRadius:999, padding:'2px 8px', fontWeight:700, fontSize:12}}>
                      ● Aktiv
                    </span>
                  )}
                </div>
                <div className="team-input-row">
                  <label className="small-label">Coins</label>
                  <input className="input small" type="number" value={t.coins} onChange={e => patchTeam(t.id, 'coins', Number(e.target.value))} />
                  <label className="small-label">Jokerin</label>
                  <input className="input small" type="number" value={t.quizJoker} onChange={e => patchTeam(t.id, 'quizJoker', Number(e.target.value))} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Debug */}
      {phase === 'CATEGORY' && (
        <details className="card">
          <summary>📦 Rohdaten</summary>
          <pre style={{ overflowX: 'auto' }}>{JSON.stringify(st?.submissions, null, 2)}</pre>
        </details>
      )}
          </div>{/* /.admin-shell */}
        </div>{/* /.admin-layout */}
      </main>
  {/* mini-status-bar entfernt */}
    </div>
  );
}

export default AdminView;





