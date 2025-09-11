import React, { useEffect, useMemo, useRef, useState } from 'react';
// Join QR removed per request (QR handled in presentation)
import socket, { ensureConnected } from '../socket.v2';
import catKey from '../utils/catKey';
import './Scoreboard.css';
import { assetUrl } from '../utils/assetUrl';
// overlay removed in scoreboard to avoid dark vignette in ARMED

// Asset (stacked coin image)
const STACK_SRC = '/coin1.png';
const ENABLE_MICRO_DROP = false; // prevent incidental stacking when not in a run

// --- Animation: slow rising coins (flight phase removed) ---
// Increase duration for a calmer build-up; keep easing for a gentle snap.
const COIN_RISE_OFFSET_PX = 18;      // shorter travel for faster feel
const COIN_RISE_SCALE_FROM = 0.6;    // initial scale (higher to avoid tiny "jump")
const COIN_RISE_SCALE_TO = 1.0;      // target scale
const COIN_RISE_MS = 520;            // even faster rise
const COIN_RISE_EASE = 'cubic-bezier(.25,.9,.35,1)';

// Modes: LOCKED -> ARMED -> RAIN -> PAUSE -> COUNTUP -> FINAL
const MODES = { LOCKED:'LOCKED', ARMED:'ARMED', RAIN:'RAIN', PAUSE:'PAUSE', COUNTUP:'COUNTUP', FINAL:'FINAL' };

// Deterministic RNG (mulberry32)
function mulberry32(seed) {
  let t = seed >>> 0;
  return function() {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export default function ScoreboardV2(){
  const [teamsRaw, setTeamsRaw] = useState([]);
  const [mode, setMode] = useState(MODES.LOCKED);
  const [gameState, setGameState] = useState(null); // currentCategory, roundIndex, phase, pot/carry
  const [displayCoins, setDisplayCoins] = useState({});
  const [finalCoins, setFinalCoins] = useState({});
  const [roundDelta, setRoundDelta] = useState({});
  const [perPointMs, setPerPointMs] = useState(60); // slower default for more suspense
  const [dryNote, setDryNote] = useState(null);
  const [finalFlash, setFinalFlash] = useState(false);
  const [finalAnimKey, setFinalAnimKey] = useState(0);
  const [teamLimit, setTeamLimit] = useState(5); // up to 5 teams on scoreboard
  const [categorySummary, setCategorySummary] = useState(null);
  const summaryTimerRef = useRef(null);
  const [showLabels, setShowLabels] = useState(false);
  const labelTimerRef = useRef(null);

  const seedRef = useRef(1234);
  const rngRef = useRef(()=>Math.random());
  const lastPayloadRef = useRef(null);
  const pendingRunRef = useRef(false);
  const modeRef = useRef(mode);
  const teamsRef = useRef([]);
  const pileRefs = useRef({}); // teamId -> pile element
  const placedRef = useRef({});
  const intervalRef = useRef(null);
  const stageRef = useRef(null); // sb2-stage root for stacked coins
  const rowsRef = useRef({}); // teamId -> next row index (1-column tower)
  const gridRef = useRef({}); // occupancy (for rebuild)
  const coinRefs = useRef({}); // teamId -> [{el, x, y}] absolute stage coords
  const swayRafRef = useRef(null);
  const swayStartRef = useRef(0);
  const swayActiveRef = useRef(false);
  const teamPhaseRef = useRef({}); // per-team phase offsets
  const hasStackedRef = useRef(false); // true after at least one coin spawned in a run
  const swayDelayTimerRef = useRef(null); // delayed wobble starter
  const stackingStartedRef = useRef(false); // first coin wave launched
  const stackingSafetyTimerRef = useRef(null); // fallback ensure stacking
  const stackingRestartTimerRef = useRef(null); // secondary restart if still no coins

  const SWAY = { ampPx: 8, ampDeg: 3.0, periodMs: 4200, gustMs: 10000, gustAmp: 0.6, gustBase: 0.7 };
  const ENABLE_SWAY = true; // re-enable wobble with throttled updates for smoothness
  const ENABLE_BOX_WOBBLE = false; // disable per-coin team-box wobble during stacking

  // Vertical baseline factor for stacking (closer to 1 => lower / nearer bottom of pile box)
  // Adjusted from 0.60 to 0.78 to place coin stack more centrally over avatars (less high offset)
  const PILE_BASELINE_FACTOR = 0.78;

  // Debug instrumentation (gated by ?debug)
  if (typeof window !== 'undefined') {
    if (window.SBV2_DEBUG == null) {
      let dbg = false;
      try { const p = new URLSearchParams(window.location.search||''); dbg = p.has('debug'); } catch {}
      window.SBV2_DEBUG = dbg;
    }
    if (window.SBV2_DEBUG) {
      if (!Number.isFinite(window.SBV2_PREFLIGHT_MS)) window.SBV2_PREFLIGHT_MS = 40;
    } else {
      if (!Number.isFinite(window.SBV2_PREFLIGHT_MS)) window.SBV2_PREFLIGHT_MS = 0;
    }
  }

  // socket wiring
  useEffect(()=>{
    ensureConnected?.();

    const onTeams = (list)=>{
      const arr = Array.isArray(list) ? list : [];
      // micro-drop detection when idle (disabled by default)
      try{
        if(window.SBV2_DEBUG && !didInitTeamsRef.current){
          // first payload: baseline only
        } else if(ENABLE_MICRO_DROP) {
          if(
            didInitTeamsRef.current &&
            modeRef.current!==MODES.RAIN &&
            modeRef.current!==MODES.PAUSE &&
            modeRef.current!==MODES.COUNTUP &&
            modeRef.current!==MODES.ARMED &&
            modeRef.current!==MODES.LOCKED
          ){
            const last = lastCoinsRef.current || {};
            for(const t of arr){
              const prev = Number(last[t.id]||0);
              const cur = Math.max(0, Number(t.coins)||0);
              if(cur>prev){ microDropCoins(t.id, cur - prev); }
            }
          }
        }
      }catch{}
      try{ lastCoinsRef.current = Object.fromEntries(arr.map(t=>[t.id, Math.max(0, Number(t.coins)||0)])); }catch{}
      didInitTeamsRef.current = true;
      setTeamsRaw(arr);
    };

    socket.on('teamsUpdated', onTeams);
    socket.emit('requestTeams');

    const onRun = (payload)=> beginSequence(payload);
    const onMode = (p)=>{ if(p && MODES[p.mode]) setMode(MODES[p.mode]); };

    // ARMED/start wiring for spoiler-safe reveal
    const armReveal = ()=>{
      const zeros = Object.fromEntries((teamsRef.current||[]).map(t=> [t.id, 0]));
      setDisplayCoins(zeros);
      clearStage();
      setMode(MODES.ARMED);
      setDryNote(null);
    };
    const onArm = ()=> armReveal();
    // Robust Start handling: always trigger a run, even after reload & slow team payload
    const onStart = (payload)=>{
      if(modeRef.current!==MODES.ARMED) armReveal();
      ensureRun(payload);
    };

    socket.on('scoreboard:v2:run', onRun);
    socket.on('scoreboard:v2:mode', onMode);
    socket.on('scoreboard:v2:arm', onArm);
    socket.on('scoreboard:v2:start', onStart);

  // lastRun fetch via socket not supported on backend; rely on localStorage-based auto-replay

    const onState = (g)=>{
      if(g && Number.isFinite(g.teamLimit)) setTeamLimit(Math.max(2, Math.min(5, Number(g.teamLimit)||3)));
      setGameState(g || null);
    };
    socket.on('state:update', onState);

    const onCategorySummary = (summary)=>{
      setCategorySummary(summary);
      try { if(summaryTimerRef.current){ clearTimeout(summaryTimerRef.current); summaryTimerRef.current=null; } } catch{}
      summaryTimerRef.current = setTimeout(()=>{ setCategorySummary(null); summaryTimerRef.current=null; }, 10000);
    };
    socket.on('category:summary', onCategorySummary);
    socket.emit('requestState');

    return ()=>{
      socket.off('teamsUpdated', onTeams);
      socket.off('scoreboard:v2:run', onRun);
      socket.off('scoreboard:v2:mode', onMode);
      socket.off('scoreboard:v2:arm', onArm);
      socket.off('scoreboard:v2:start', onStart);
  // no lastRun listener to remove
      socket.off('state:update', onState);
      socket.off('category:summary', onCategorySummary);
      if(summaryTimerRef.current){ clearTimeout(summaryTimerRef.current); summaryTimerRef.current=null; }
    };
  },[]);

  // keep synchronous mirror of mode
  useEffect(()=>{ modeRef.current = mode; }, [mode]);

  // Delayed label reveal after stacks are built
  useEffect(()=>{
    if(labelTimerRef.current){ clearTimeout(labelTimerRef.current); labelTimerRef.current=null; }
    if(mode===MODES.ARMED){
      setShowLabels(false);
      return;
    }
    if(mode===MODES.RAIN){
      // Show live stacking amounts during RAIN per request
      setShowLabels(true);
      return;
    }
    if(mode===MODES.PAUSE){
      labelTimerRef.current = setTimeout(()=>{ setShowLabels(true); labelTimerRef.current=null; }, 500);
      return ()=>{ if(labelTimerRef.current){ clearTimeout(labelTimerRef.current); labelTimerRef.current=null; } };
    }
    if(mode===MODES.COUNTUP || mode===MODES.FINAL){
      setShowLabels(true);
    }
  }, [mode]);

  // preload assets
  useEffect(()=>{ ['/coin1.png','/coin2.png','/coin.png'].forEach(src=>{ const im=new Image(); im.src=src; }); },[]);

  // FINAL entry flash
  useEffect(()=>{
    if(mode===MODES.FINAL){
      setFinalFlash(true);
      const to = setTimeout(()=> setFinalFlash(false), 900);
      setFinalAnimKey(k=>k+1);
      return ()=> clearTimeout(to);
    }
    if(mode===MODES.ARMED){
      const tms = teamsRef.current || [];
      const zero = {}; tms.forEach(t=> zero[t.id]=0);
      setDisplayCoins(zero);
      clearStage();
      stopSway();
      setDryNote(null);
    }
  }, [mode]);

  // choose active teams by join order, limited by teamLimit
  const teams = useMemo(()=>{
    if(!teamsRaw?.length) return [];
    const fixed = [...teamsRaw].sort((a,b)=>(a.joinedAt||0)-(b.joinedAt||0));
    const effective = Number.isFinite(Number(teamLimit)) ? Math.max(2, Math.min(5, Number(teamLimit)||5)) : Math.min(5, fixed.length);
    return fixed.slice(0, effective);
  }, [teamsRaw, teamLimit]);

  // keep latest teams in ref
  useEffect(()=>{ teamsRef.current = teams; }, [teams]);

  // last-coin memory for micro-drops
  const lastCoinsRef = useRef({});
  const didInitTeamsRef = useRef(false);

  // when teams change: sync final, show zeros, prepare
  useEffect(()=>{
    if(!teams.length) return;
    const fin = {}; teams.forEach(t=> fin[t.id] = Math.max(0, Number(t.coins)||0));
    setFinalCoins(fin);

    const zero = {}; teams.forEach(t=> zero[t.id]=0);
    setDisplayCoins(zero);
    placedRef.current = {...zero};
    rowsRef.current = {...zero};
    setMode(MODES.ARMED);

  // If a Start payload arrived before teams were ready, start now once teams exist
  if(pendingRunRef.current && lastPayloadRef.current){
      // Let the current render settle
      setTimeout(()=>{ beginSequence(lastPayloadRef.current); }, 0);
      pendingRunRef.current = false;
  }

  // Default to ARMED on load
  if(modeRef.current!==MODES.RAIN && modeRef.current!==MODES.PAUSE){
      setMode(MODES.ARMED);
      rebuildPilesFromState();
    }
  }, [teams]);

  // begin a deterministic run
  async function beginSequence(payload){
    const activeTeams = teamsRef.current || [];
    if(activeTeams.length===0){
      lastPayloadRef.current = payload || null;
      pendingRunRef.current = true;
      setDryNote('Warte auf Teams…');
      return;
    }
    const { seed = Date.now(), roundDelta: rd, finalScores, perPointMs: ppm } = payload || {};
    seedRef.current = Number.isFinite(seed) ? seed : Date.now();
    lastPayloadRef.current = { ...(payload||{}), seed: seedRef.current };
    try { localStorage.setItem('sbv2:lastRun', JSON.stringify({ ts: Date.now(), payload: lastPayloadRef.current })); } catch {}

    rngRef.current = mulberry32(seedRef.current >>> 0);
    if(typeof ppm === 'number') setPerPointMs(Math.max(5, Math.min(60, ppm)));

    const tms = teamsRef.current || [];
    const fin = {}; tms.forEach(t=> fin[t.id] = Math.max(0, Math.floor((finalScores?.[t.id] ?? t.coins) || 0)));

    let rdMap = rd && typeof rd === 'object' ? Object.fromEntries(Object.entries(rd).map(([k,v])=>[k, Math.max(0, Math.floor(v||0))])) : { ...fin };
    let allZero = Object.values(rdMap).every(v => (v||0) === 0);
    const anyFinal = Object.values(fin).some(v => (v||0) > 0);
    if (allZero && anyFinal) { rdMap = { ...fin }; allZero = false; }

    setFinalCoins(fin);
    setRoundDelta(rdMap);

    const zero = {}; tms.forEach(t=> zero[t.id]=0);
    clearStage();
    tms.forEach(t=>{ rowsRef.current[t.id] = 0; });
    coinRefs.current = {};
    stopSway();
    placedRef.current = {...zero};
  hasStackedRef.current = false;
  stackingStartedRef.current = false;
  if(stackingSafetyTimerRef.current){ clearTimeout(stackingSafetyTimerRef.current); stackingSafetyTimerRef.current=null; }
    setDryNote(allZero ? 'Keine Punkte in dieser Runde' : null);

    // Wait for layout to stabilize (avatars/images and stage sizes) before computing positions
    await waitForLayoutReady();
    modeRef.current = MODES.RAIN;
    setMode(MODES.RAIN);
    setDisplayCoins(zero);
    if(allZero){ setMode(MODES.COUNTUP); return; }
  startStacking(rdMap, fin);
    // Secondary guard: if after 900ms no coin appeared, try starting again (covers rare race conditions)
    if(stackingRestartTimerRef.current){ clearTimeout(stackingRestartTimerRef.current); }
    stackingRestartTimerRef.current = setTimeout(()=>{
      if(!hasStackedRef.current && modeRef.current===MODES.RAIN){
        try { startStacking(rdMap, fin); } catch {}
      }
    }, 900);
  }

  // Ensure we have teams & payload; synthesize if backend did not send one
  function ensureRun(payload){
    let data = payload;
    if(!data){
      data = lastPayloadRef.current;
    }
    // Synthesize payload if still missing
    if(!data){
      const tms = teamsRef.current || [];
      if(tms.length){
        const finScores = Object.fromEntries(tms.map(t=> [t.id, Math.max(0, Number(t.coins)||0)]));
        data = { seed: Date.now(), finalScores: finScores, roundDelta: finScores };
      }
    }
    if(!(teamsRef.current||[]).length){
      // Queue until teams arrive
      pendingRunRef.current = true;
      if(data) lastPayloadRef.current = data;
      setDryNote('Warte auf Teams…');
      setTimeout(()=>{ ensureRun(data); }, 150);
      return;
    }
    if(!data){
      setDryNote('Keine Startdaten verfügbar');
      return;
    }
    beginSequence(data);
  }

  // Wait until stage and piles have non-zero size and are stable across a few frames
  function waitForLayoutReady(maxMs = 800){
    return new Promise(resolve => {
      const start = performance.now();
      let lastSig = '';
      const tick = () => {
        const stage = stageRef.current;
        if(!stage){ return resolve(); }
        const sRect = stage.getBoundingClientRect();
        let sig = `${Math.round(sRect.width)}x${Math.round(sRect.height)}`;
        let ok = sRect.width > 0 && sRect.height > 0;
        const tms = teamsRef.current || [];
        for(const t of tms){
          const pile = pileRefs.current[t.id];
          if(!pile){ ok = false; break; }
          const r = pile.getBoundingClientRect();
          sig += `|${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)}x${Math.round(r.height)}`;
          if(r.width<=0 || r.height<=0) { ok = false; }
        }
        const stable = ok && sig === lastSig;
        lastSig = sig;
        if(stable || (performance.now()-start) > maxMs){
          // Also wait a moment for avatars to decode to avoid last-moment reflow
          try{
            const imgs = Array.from(document.querySelectorAll('.sb2-teams img.avatar'));
            const promises = imgs.map(im=> (im.decode ? im.decode().catch(()=>{}) : (im.complete? Promise.resolve(): Promise.resolve())));
            Promise.race([
              Promise.all(promises),
              new Promise(r=> setTimeout(r, 300))
            ]).finally(()=> resolve());
          }catch{
            resolve();
          }
        }
        else { requestAnimationFrame(tick); }
      };
      requestAnimationFrame(tick);
    });
  }

  // Clear stage elements and reset grid/piles
  function clearStage(){
    const stage = stageRef.current;
  // Remove only stacked coins; legacy flight/spark elements removed from implementation
  try { stage?.querySelectorAll('.sb2-coin').forEach(el=> el.remove()); } catch {}
    try { Object.values(pileRefs.current||{}).forEach(h=>{ if(h) h.innerHTML=''; h?.classList?.remove('sway'); }); } catch {}
    gridRef.current = {};
  }

  // micro-drop outside full run
  function microDropCoins(teamId, count){
    const n = Math.max(0, Math.floor(count||0));
    if(n<=0) return;
    const prevMode = modeRef.current;
    if(prevMode===MODES.RAIN || prevMode===MODES.PAUSE) return;
    modeRef.current = MODES.RAIN; // temporary guard to avoid rebuild jitter

    const base = Math.max(0, Number(rowsRef.current[teamId]||0));
    const currentDisplayed = Math.max(0, Number(displayCoins[teamId]||0));
    let placedLocal = 0;
    const doOne = (i)=>{
      const row = base + i;
      const targetLocal = getTowerLocalXY(teamId, row);
      spawnCoin(teamId, targetLocal);
      rowsRef.current[teamId] = row + 1;
      placedLocal++;
      setDisplayCoins(s=> ({...s, [teamId]: Math.max(currentDisplayed + placedLocal, s[teamId]||0)}));
    };
    for(let i=0;i<n;i++){
      const delay = 140 + Math.floor((rngRef.current?.()||Math.random())*140);
      setTimeout(()=> doOne(i), i*delay);
    }
    const tail = 1400 + n*140;
    setTimeout(()=>{ modeRef.current = prevMode; }, tail);
  }

  // coin metrics
  function coinPx(){ return Math.round(Math.min(54, Math.max(44, window.innerHeight * 0.05))); }
  function slotW(){ return coinPx() * 0.86; }
  function slotH(){ return coinPx() * 0.18; }

  // keep CSS var --coin in sync (always update; coins use explicit width below for consistency)
  useEffect(()=>{
    const apply = ()=>{
      const px = coinPx(); if(stageRef.current){ stageRef.current.style.setProperty('--coin', px + 'px'); }
    };
    apply();
    window.addEventListener('resize', apply);
    return ()=> window.removeEventListener('resize', apply);
  },[]);

  // rebuild piles when display changes (but not during RAIN/PAUSE)
  useEffect(()=>{ if(modeRef.current!==MODES.RAIN && modeRef.current!==MODES.PAUSE) rebuildPilesFromState(); }, [displayCoins, mode]);

  // compute local single-column slot
  function getTowerLocalXY(teamId, row){ return { x: 0, y: -row * slotH() }; }

  // Convert pile-local (x,y) to absolute stage coords (X,Y)
  function localToStage(teamId, x, y){
    const stage = stageRef.current; if(!stage) return { X:0, Y:0 };
    const pile = pileRefs.current[teamId]; if(!pile) return { X:0, Y:0 };
    const stageRect = stage.getBoundingClientRect();
    const pileRect = pile.getBoundingClientRect();
    // We treat pile center as origin for x, and the visual baseline slightly above pile bottom
    const centerX = pileRect.left + pileRect.width/2 - stageRect.left;
  const baseY = pileRect.top + (pileRect.height*PILE_BASELINE_FACTOR) - stageRect.top; // tuned baseline
  // Center coin horizontally: subtract half coin width so stack aligns with box center
  const X = Math.round(centerX - (coinPx()/2) + x);
    const Y = Math.round(baseY + y);
    return { X, Y };
  }

  // Create a coin image at target and animate simple rise-in
  function spawnCoin(teamId, targetLocal){
    const stage = stageRef.current; if(!stage) return;
    const { X, Y } = localToStage(teamId, targetLocal?.x||0, targetLocal?.y||0);
    const img = document.createElement('img');
    img.className = 'sb2-coin';
    img.src = STACK_SRC; img.onerror = ()=>{ img.onerror=null; img.src='/coin.png'; };
    img.style.position='absolute'; img.style.left='0'; img.style.top='0';
  img.style.willChange='transform, opacity';
  // Explicit width ensures centering math (coinPx/2) aligns with actual rendered width
  img.style.width = coinPx() + 'px';
  img.style.height = 'auto';
  img.style.pointerEvents = 'none';

    // initial transform below target, scaled down
  const toTransform = (y, scale=1)=>`translate3d(${X}px, ${y}px, 0) rotateX(24deg) skewY(6deg) scale(${scale}) scaleY(0.52)`;
    const startY = Y + COIN_RISE_OFFSET_PX;
    img.style.transform = toTransform(startY, COIN_RISE_SCALE_FROM);
    stage.appendChild(img);

    (coinRefs.current[teamId] ||= []).push({ el: img, x: X, y: Y });
  if(!stackingStartedRef.current) stackingStartedRef.current = true;

    // Reduce motion respect
    const reduce = (()=>{ try { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } })();
    if(reduce){ img.style.transform = toTransform(Y, 1); return; }

    requestAnimationFrame(()=>{
      const keyframes = [
        { transform: toTransform(startY, COIN_RISE_SCALE_FROM), offset:0 },
        { transform: toTransform(Y, COIN_RISE_SCALE_TO), offset:1, easing: COIN_RISE_EASE }
      ];
      try {
        const anim = img.animate(keyframes, { duration: COIN_RISE_MS, easing:'linear', fill:'forwards' });
        anim.onfinish = ()=>{ img.style.transform = toTransform(Y, 1); };
      } catch {
        img.style.transform = toTransform(Y, 1);
      }
      if(ENABLE_BOX_WOBBLE){
        const box = pileRefs.current[teamId]?.closest('.team-box');
        if(box){ box.classList.add('wobble'); setTimeout(()=> box.classList.remove('wobble'), 140); }
      }
    });
  }

  // Rebuild stacked coins from current display/state (skips during RAIN/PAUSE)
  function rebuildPilesFromState(){
    if(modeRef.current===MODES.RAIN || modeRef.current===MODES.PAUSE) return;
    const tms = teamsRef.current || [];
    const stage = stageRef.current; if(!stage) return;
    stage.querySelectorAll('.sb2-coin').forEach(n => n.remove());
    tms.forEach(t=>{
      if(!gridRef.current[t.id]) gridRef.current[t.id] = { occ: new Set() }; else gridRef.current[t.id].occ.clear();
      coinRefs.current[t.id] = [];
      const count = modeRef.current===MODES.ARMED ? 0 : (displayCoins[t.id]||0);
      for(let i=0;i<count;i++){
        const { x, y } = getTowerLocalXY(t.id, i);
        const { X, Y } = localToStage(t.id, x, y);
        const img = document.createElement('img');
        img.className = 'sb2-coin';
        img.src = STACK_SRC; img.onerror = ()=>{ img.onerror=null; img.src='/coin.png'; };
        img.style.position='absolute'; img.style.left='0'; img.style.top='0';
  img.style.willChange = 'transform, opacity';
  img.style.width = coinPx() + 'px';
  img.style.height = 'auto';
  img.style.pointerEvents = 'none';
  img.style.transform = `translate3d(${X}px, ${Y}px, 0) rotateX(24deg) skewY(6deg) scaleY(0.52)`;
        stage.appendChild(img);
        gridRef.current[t.id].occ.add(i);
        coinRefs.current[t.id].push({ el: img, x: X, y: Y });
      }
      updateShadow(t.id, count, count);
    });
  }

  // Try auto-replay after refresh using last saved payload (if fresh)
  function tryAutoReplay(){
    const MAX_AGE = 5 * 60 * 1000; // 5 minutes
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem('sbv2:lastRun') || 'null'); } catch {}
    if(!saved || !saved.payload) return;
    const isFresh = (Date.now() - (saved.ts||0)) < MAX_AGE;
    let force = false; try { const p = new URLSearchParams(window.location.search||''); force = p.has('replay') || p.has('reveal'); } catch {}
    if(!isFresh && !force) return;
    beginSequence(saved.payload);
  }

  // small label gratification
  function bumpCoinsLabel(teamId){
    try{
      const box = pileRefs.current[teamId]?.closest('.team-box'); if(!box) return;
      const label = box.querySelector('.t-coins'); if(!label) return;
      label.classList.add('bump');
      setTimeout(()=> label.classList.remove('bump'), 220);
    }catch{/* ignore */}
  }

  // stacking engine: one coin per wave across teams
  function startStacking(targets){
    stopStacking();
    const r = rngRef.current;
    const rem = Object.fromEntries(teams.map(t=> [t.id, Math.max(0, Math.floor(targets[t.id]||0))]));
    const placed = Object.fromEntries(teams.map(t=> [t.id, 0]));
    placedRef.current = {...placed};
    const visibleCap = 200;

    const wave = ()=>{
      if(modeRef.current!==MODES.RAIN){ stopStacking(); return; }
      let any = false;
      for(const t of teams){
        const id = t.id;
        if(rem[id] > 0){
          any = true;
          const row = rowsRef.current[id] || 0;
          const targetLocal = getTowerLocalXY(id, row);
          if(row < visibleCap){ spawnCoin(id, targetLocal); }
          if(!hasStackedRef.current) hasStackedRef.current = true;
          rem[id] -= 1;
          placed[id] = (placed[id]||0) + 1;
          rowsRef.current[id] = row + 1;
          placedRef.current = {...placed};
          setDisplayCoins(s=> ({...s, [id]: Math.min(placed[id], visibleCap)}));
          bumpCoinsLabel(id);
          updateShadow(id, Math.min(placed[id], visibleCap), targets[id]);
        }
      }
      if(!any){
        const pause = 420 + Math.floor(r()*160); // shorter pause
        intervalRef.current = setTimeout(()=> setMode(MODES.PAUSE), pause);
        return;
      }
      const delay = 240; // constant cadence for synchronous tower growth
      intervalRef.current = setTimeout(wave, delay);
    };
    const firstDelay = 180; // uniform start
    intervalRef.current = setTimeout(wave, firstDelay);

    // Safety net: if after 450ms no coin spawned (stackingStartedRef false) but we have targets, force-spawn 1 coin per team with remaining >0 then continue
    stackingSafetyTimerRef.current = setTimeout(()=>{
      if(!stackingStartedRef.current){
        try{
          const tms = teamsRef.current || [];
          tms.forEach(t=>{
            const id = t.id;
            if(rem[id] > 0){
              const row = rowsRef.current[id] || 0;
              const targetLocal = getTowerLocalXY(id, row);
              spawnCoin(id, targetLocal);
              rem[id] -= 1;
              rowsRef.current[id] = row + 1;
              placed[id] = (placed[id]||0) + 1;
              placedRef.current = {...placed};
              setDisplayCoins(s=> ({...s, [id]: Math.min(placed[id], visibleCap)}));
              updateShadow(id, Math.min(placed[id], visibleCap), targets[id]);
            }
          });
          stackingStartedRef.current = true;
        }catch{}
      }
    }, 450);
  }

  function updateShadow(teamId, placed, target){
    const box = pileRefs.current[teamId]?.closest('.team-box'); if(!box) return;
    const sh = box.querySelector('.sb2-shadow'); if(!sh) return;
    const ratio = Math.max(0, Math.min(1, target ? placed/target : 0));
    const w = 70 + Math.round(70 * ratio);
    const op = 0.18 + 0.14 * ratio;
    sh.style.width = `${w}px`;
    sh.style.opacity = `${op.toFixed(2)}`;
  }

  function stopStacking(){ if(intervalRef.current){ clearTimeout(intervalRef.current); intervalRef.current = null; } }

  // mode transitions: pause -> countup
  useEffect(()=>{
    if(mode===MODES.PAUSE){
      const r = rngRef.current || Math.random; const wait = 900 + Math.floor(r()*500);
      const id = setTimeout(()=> setMode(MODES.COUNTUP), wait);
      return ()=> clearTimeout(id);
    }
    if(mode===MODES.COUNTUP){
      const base = {...displayCoins};
      const tms = teamsRef.current || [];
      const maxDelta = tms.reduce((m,t)=> Math.max(m, Math.abs((finalCoins[t.id]||0) - (base[t.id]||0))), 0);
  const dur = Math.min(6000, Math.max(1200, maxDelta * Math.max(8, Math.min(150, perPointMs||20))));
      let raf;
      const start = performance.now();
      const step = (now)=>{
        const t = Math.min(1, (now-start)/dur);
        const eased = 1 - Math.pow(1-t, 3);
        const next = {};
        tms.forEach(tm=>{
          const from = base[tm.id]||0, to = finalCoins[tm.id]||0;
          next[tm.id] = Math.round(from + (to-from)*eased);
        });
        setDisplayCoins(next);
        if(t < 1){ raf = requestAnimationFrame(step); }
      };
      raf = requestAnimationFrame(step);
      return ()=>{ if(raf) cancelAnimationFrame(raf); };
    }
  }, [mode]);

  // Sway animation of stacked coins (post-rain)
  function startSway(){
    if(!ENABLE_SWAY) return;
    if(!hasStackedRef.current) return; // only wobble if something was stacked
    if(!(modeRef.current===MODES.PAUSE || modeRef.current===MODES.COUNTUP || modeRef.current===MODES.FINAL)) return;
    if(swayActiveRef.current) return;
    swayActiveRef.current = true;
    swayStartRef.current = performance.now();
    const r = rngRef.current || Math.random;
    teamPhaseRef.current = {};
    (teamsRef.current||[]).forEach(t=>{ teamPhaseRef.current[t.id] = r() * Math.PI * 2; });
    let last = 0;
    const frameMs = 50; // ~20fps throttle for smoothness
    const tick = (now)=>{
      if(!swayActiveRef.current){ swayRafRef.current = null; return; }
      if(now - last < frameMs){ swayRafRef.current = requestAnimationFrame(tick); return; }
      last = now;
      const phase = ((now - swayStartRef.current) % SWAY.periodMs) / SWAY.periodMs;
      const gust = SWAY.gustBase + SWAY.gustAmp * Math.sin(((now - swayStartRef.current) % (SWAY.gustMs||9000)) / (SWAY.gustMs||9000) * Math.PI * 2);
      // Dynamic amplitude: softer in COUNTUP, full in FINAL, medium in PAUSE
      let ampFactor = 0.7; // PAUSE baseline
      if(modeRef.current===MODES.COUNTUP) ampFactor = 0.45;
      else if(modeRef.current===MODES.FINAL) ampFactor = 1.0;
      // Ease-in ramp to avoid initial "mini shake" – ramp amplitude over first 900ms
      const rampT = Math.min(1, (now - swayStartRef.current)/900);
      (teamsRef.current||[]).forEach(t=>{
        const arr = coinRefs.current[t.id] || [];
        if(!arr.length) return;
        const sTeam = Math.sin(phase * Math.PI * 2 + (teamPhaseRef.current[t.id]||0));
        const n = arr.length;
        for(let i=0;i<n;i++){
          const c = arr[i];
          const f = n>1 ? (i/(n-1)) : 1;
          const ease = Math.pow(f, 1.25);
          const dx = (SWAY.ampPx * ampFactor * gust * rampT) * sTeam * ease;
          const rz = (SWAY.ampDeg * ampFactor * gust * rampT) * sTeam * ease;
          c.el.style.transition = 'transform 0ms linear';
          c.el.style.transform = `translate3d(${(c.x + dx).toFixed(2)}px, ${c.y.toFixed(2)}px,0) rotate(${rz.toFixed(3)}deg) rotateX(24deg) skewY(6deg) scaleY(0.52)`;
        }
      });
      swayRafRef.current = requestAnimationFrame(tick);
    };
    swayRafRef.current = requestAnimationFrame(tick);
  }

  function stopSway(){
  swayActiveRef.current = false;
  if(swayRafRef.current){ cancelAnimationFrame(swayRafRef.current); swayRafRef.current = null; }
  }

  // Entering PAUSE/COUNTUP/FINAL after RAIN: (re)start sway; otherwise stop it
  useEffect(()=>{
    if(swayDelayTimerRef.current){ clearTimeout(swayDelayTimerRef.current); swayDelayTimerRef.current = null; }
    if(mode===MODES.PAUSE || mode===MODES.COUNTUP || mode===MODES.FINAL){
      // Start wobble after a short delay so it feels intentional
      swayDelayTimerRef.current = setTimeout(()=>{
        // If stacking didn’t run (reload bug), still allow wobble when coins exist
        try{
          const anyCoins = Object.values(coinRefs.current||{}).some(arr => (arr&&arr.length)>0)
            || Object.values(displayCoins||{}).some(v => (v||0)>0);
          if(anyCoins) hasStackedRef.current = true;
        }catch{}
        startSway();
      }, 1000);
    } else {
      stopSway();
    }
  }, [mode]);

  // Debug helpers
  useEffect(()=>{
    if(typeof window === 'undefined' || !window.SBV2_DEBUG) return;
    window.SBV2_arm = function(){
      try {
        const tms = teamsRef.current || [];
        const zero = Object.fromEntries(tms.map(t=>[t.id,0]));
        clearStage();
        setDisplayCoins(zero);
        setMode(MODES.ARMED);
      } catch(e){ console.warn('[SBV2][arm] failed', e); }
    };
    window.SBV2_fakeRun = function(delta=12){
      try {
        const tms = teamsRef.current || [];
        const rd = Object.fromEntries(tms.map(t=>[t.id, delta]));
        const finMap = Object.fromEntries(tms.map(t=>[t.id, (finalCoins[t.id]||0) + delta]));
        const seed = Date.now() & 0xffffffff;
        beginSequence({ seed, roundDelta: rd, finalScores: finMap, perPointMs: 18 });
        return { ok:true, delta, seed };
      } catch(e){ console.error('[SBV2][fakeRun] Fehler', e); return { ok:false, error: String(e) }; }
    };
    window.SBV = {
      arm: ()=>{ window.SBV2_arm(); return { mode: modeRef.current }; },
      fakeRun: (d=12)=>{ window.SBV2_fakeRun(d); return { mode: modeRef.current, delta: d }; },
      mode: ()=> modeRef.current,
      help: ()=> 'SBV.arm(), SBV.fakeRun(n), SBV.mode()'
    };
    try { const params = new URLSearchParams(window.location.search||''); if(params.has('autorain') && teamsRef.current?.length){ setTimeout(()=>{ window.SBV2_fakeRun?.(12); }, 800); } } catch{}
    return ()=>{ try { delete window.SBV2_arm; delete window.SBV2_fakeRun; delete window.SBV; } catch{} };
  }, [teams, finalCoins]);

  // Ranking
  const ranking = useMemo(()=>{
    const arr = [...teams];
    arr.sort((a,b)=> (displayCoins[b.id]||0) - (displayCoins[a.id]||0));
    return arr;
  }, [teams, displayCoins]);

  const leaderId = (mode===MODES.FINAL && ranking[0]) ? ranking[0].id : null;
  const topScore = ranking.length ? (displayCoins[ranking[0].id]||0) : 0;
  const exAequo = ranking.length>1 && ranking.filter(t=> (displayCoins[t.id]||0)===topScore).length>1;

  function avatarSrc(t){
    let p = '/avatars/capybara.png';
    if (typeof t?.avatar === 'string'){
      if(t.avatar.startsWith('/')) p = t.avatar;
      else if(/^avatars\//.test(t.avatar)) p = '/' + t.avatar;
    }
    return assetUrl(p);
  }

  return (
    <div className="scoreboard-shell minimal">
      {/* Category Overview */}
      {gameState?.currentCategory && (
        <div className="sb2-catbar" role="status" aria-live="polite">
          {(() => {
            const k = catKey(gameState.currentCategory);
            const r = Number(gameState.roundIndex || 0) + 1;
            const pot = Math.max(0, Number(gameState.categoryPot || 0));
            const payout = Math.floor(pot / 3);
            const carry = Math.max(0, Number(gameState.carryRound || 0));
            return (
              <div className="sb2-catbar__inner">
                <div className="sb2-catbar__left">
                  <img
                    className="category-icon"
                    src={`/categories/${k}.png`}
                    alt={gameState.currentCategory}
                    onError={(e)=>{ if(!e.currentTarget.dataset.fallback){ e.currentTarget.dataset.fallback='1'; e.currentTarget.src=`/categories/${k}.svg`; } }}
                  />
                  <div className="sb2-catbar__title">
                    <div className="line1">{gameState.currentCategory}</div>
                    {gameState.phase === 'CATEGORY' && <div className="line2">Runde {r}/3</div>}
                  </div>
                </div>
                <div className="sb2-catbar__chips">
                  <span className="chip"><span className="icon coin" aria-hidden />Pot <strong>{pot}</strong></span>
                  <span className="chip">Payout <strong>{payout}</strong></span>
                  {gameState.phase === 'CATEGORY' && <span className="chip">Carry <strong>{carry}</strong></span>}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      <div className="sb2-stage" ref={stageRef}>
        <div className="sb2-teams">
          {teams.map(t=> (
            <div className={`team-box ${leaderId===t.id && mode===MODES.FINAL ? 'leader' : ''}`} key={t.id} data-team-box={t.id}>
              <img className="avatar" src={avatarSrc(t)} alt={t.name||'Team'} />
              <div className="sb2-pile" ref={el=>{ if(el) (pileRefs.current[t.id]=el); }} />
              <div className="sb2-shadow" />
              <div className="t-name">{t.name||'Team'}</div>
              <div className="t-coins"><span className="icon coin" aria-hidden />{showLabels ? (displayCoins[t.id]||0) : 0}</div>
            </div>
          ))}
        </div>
        {dryNote && mode!==MODES.COUNTUP && mode!==MODES.FINAL && (
          <div className="dry-note" role="status">{dryNote}</div>
        )}
  {/* Ex-aequo note removed per request */}
      </div>

      {mode===MODES.FINAL && (
        <>
          <WinnerOverlay teams={ranking} animKey={finalAnimKey} values={displayCoins} />
          <ConfettiOverlay front />
        </>
      )}
      {finalFlash && <div className="final-flash" aria-hidden="true" />}

      {/* Category summary overlay */}
      {categorySummary && (()=>{
        const k = catKey(categorySummary.category);
        const earnEntries = Object.entries(categorySummary.earnings||{})
          .sort((a,b)=> (b[1]||0)-(a[1]||0));
        return (
          <div className={`category-summary-overlay cat-${k}`} role="dialog" aria-modal="true" aria-label="Kategorie Zusammenfassung">
            <div className="cat-intro-blur" aria-hidden />
            <div className="category-summary__dialog">
              <div className="category-summary__header">
                <div className="cat-icon-wrap">
                  <img className="category-icon lg" src={`/categories/${k}.png`} alt={categorySummary.category}
                    onError={(e)=>{ if(!e.currentTarget.dataset.fallbackSvg){ e.currentTarget.dataset.fallbackSvg='1'; e.currentTarget.onerror=null; e.currentTarget.src=`/categories/${k}.svg`; } }} />
                </div>
                <h2 className="category-summary__title">{categorySummary.category}</h2>
                <div className="category-summary__meta">Pot: <span className="icon coin coin-sm" aria-hidden />{categorySummary.pot} · Runden: {categorySummary.roundsPlayed}</div>
              </div>
              <ul className="category-summary__list">
                {earnEntries.map(([tid,coinsEarned],idx)=>{
                  const t = (teamsRef.current||[]).find(tt=>tt.id===tid);
                  const place = idx+1;
                  return (
                    <li key={tid} className={`place-${place}`}>
                      <div className="row" style={{justifyContent:'space-between', width:'100%'}}>
                        <div style={{display:'flex',alignItems:'center',gap:14}}>
                          <img src={avatarSrc(t)} alt="avatar" className="team-avatar-sm" />
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
    </div>
  );
}

// --- helper subcomponents ---

function WinnerOverlay({teams, animKey, values}){
  if(!teams?.length) return null;
  const [first, second, third] = teams;
  const avatar = (t)=> {
    let p = '/avatars/capybara.png';
    if (typeof t?.avatar === 'string') {
      if (t.avatar.startsWith('/')) p = t.avatar;
      else if (/^avatars\//.test(t.avatar)) p = '/' + t.avatar;
    }
    return assetUrl(p);
  };
  const coins = (t)=> (values?.[t.id] ?? t.coins ?? 0);
  return (
    <div className="winner-overlay" aria-live="polite">
      <h2 className="w-heading main-title global" key={animKey}>Sieger der 1. Arendalympiade</h2>
      <div className="winner-card podium" key={animKey+ '-card'}>
        <div className="fx-layer fx-glitter" />
        <div className="fx-layer fx-shine" />
        <div className="podium-grid">
          {second && (
            <div className="podium-slot silver">
              <div className="p-rank">2</div>
              <img src={avatar(second)} alt={second.name||'Team'} />
              <div className="p-name">{second.name}</div>
              <div className="p-coins"><span className="icon coin" aria-hidden />{coins(second)}</div>
              {/* medal/coins line entfernt */}
            </div>
          )}
          {first && (
            <div className="podium-slot gold">
              <div className="p-rank">1</div>
              <img src={avatar(first)} className="winner-big enter-bounce" alt={first.name||'Team'} />
              <div className="p-name main">{first.name}</div>
              <div className="p-coins main"><span className="icon coin" aria-hidden />{coins(first)}</div>
              {/* medal/coins line entfernt */}
            </div>
          )}
          {third && (
            <div className="podium-slot bronze">
              <div className="p-rank">3</div>
              <img src={avatar(third)} alt={third.name||'Team'} />
              <div className="p-name">{third.name}</div>
              <div className="p-coins"><span className="icon coin" aria-hidden />{coins(third)}</div>
              {/* medal/coins line entfernt */}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ConfettiOverlay({front}){
  const ref = React.useRef(null);
  useEffect(()=>{
    const canvas = ref.current; if(!canvas) return;
    const ctx = canvas.getContext('2d');
    function resize(){ canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
    resize();
    let w = canvas.width, h = canvas.height;
    const parts = Array.from({length: 160}, () => ({
      x: (w*0.5) + (Math.random()-0.5)*w*0.6,
      y: -Math.random()*h*0.2,
      r: 4+Math.random()*6,
      c: `hsl(${Math.random()*360},80%,60%)`,
      vy: 60+Math.random()*90,
      vx: -80+Math.random()*160,
      rot: Math.random()*Math.PI,
      vr: (-1+Math.random()*2)*0.15,
    }));
    let prev = performance.now();
    let running = true;
    function tick(now){
      if(!running) return;
      const dt = (now-prev)/1000; prev = now;
      ctx.clearRect(0,0,w,h);
      parts.forEach(p=>{
        p.x += p.vx*dt;
        p.y += p.vy*dt;
        p.rot += p.vr;
        if(p.y > h+40) { p.y = -20; p.x = (w*0.5) + (Math.random()-0.5)*w*0.6; }
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.r/2, -p.r/2, p.r, p.r*0.6);
        ctx.restore();
      });
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
    const onResize = () => { resize(); w=canvas.width; h=canvas.height; };
    window.addEventListener('resize', onResize);
    return ()=>{ running=false; window.removeEventListener('resize', onResize); };
  },[]);
  return <canvas ref={ref} className="confetti-canvas" style={{position:'fixed', inset:0, pointerEvents:'none', zIndex: front? 200 : 5}} />;
}

// EOF
