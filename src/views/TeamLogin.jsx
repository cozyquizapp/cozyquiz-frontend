import { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import socket, { ensureConnected } from '../socket.v2';
import assetUrl from '../utils/assetUrl';
import { motionClass, prefersReducedMotion } from '../utils/motionPresets';
import '../styles/loginRevamp.css';
// Minimalist Login: catKey nicht mehr benoetigt - Entfernt

// Aktive PNG Avatare (Minimalist Grid)
const AVATARS = [
  '/avatars/seekuh.png',
  '/avatars/waschbaer.png',
  '/avatars/roter_panda.png',
  '/avatars/igel.png',
  '/avatars/faultier.png',
  '/avatars/einhorn.png',
  '/avatars/eichhoernchen.png',
  '/avatars/capybara.png',
  '/avatars/wombat.png',
  '/avatars/koala.png',
  '/avatars/alpaka.png',
  '/avatars/pinguin.png',
  '/avatars/otter.png',
  '/avatars/giraffe.png',
  '/avatars/eisbaer.png',
  '/avatars/drache.png',
  '/avatars/katze.png',
  '/avatars/hund.png',
  '/avatars/teamjenny.png',
  '/avatars/teamjana.png',
  '/avatars/teammartin.png'
];

function TeamLogin(){
  const nav = useNavigate();
  const [teams, setTeams] = useState([]);
  const [st, setSt] = useState(null);
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState(AVATARS[0]);
  const [idx, setIdx] = useState(0); // index for swipe carousel (mobile)
  const [joining, setJoining] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [charMax] = useState(28);
  const [isMobile, setIsMobile] = useState(()=> (typeof window!=='undefined' ? window.innerWidth <= 640 : false));
  const [reduceMotion, setReduceMotion] = useState(() => prefersReducedMotion());

  useEffect(()=>{
    const onR = ()=> setIsMobile(window.innerWidth <= 640);
    window.addEventListener('resize', onR); return ()=> window.removeEventListener('resize', onR);
  }, []);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduceMotion(media.matches);
    update();
    try {
      if (typeof media.addEventListener === 'function') {
        media.addEventListener('change', update);
      } else if (typeof media.addListener === 'function') {
        media.addListener(update);
      }
    } catch (err) {
      console.warn('[TeamLogin] reduce-motion listener failed', err);
    }
    return () => {
      try {
        if (typeof media.removeEventListener === 'function') {
          media.removeEventListener('change', update);
        } else if (typeof media.removeListener === 'function') {
          media.removeListener(update);
        }
      } catch {}
    };
  }, []);
  const limit = Math.max(2, Math.min(5, st?.teamLimit || 3));

  useEffect(()=>{
    ensureConnected();
    const onTeams = (t)=> setTeams(Array.isArray(t)?t:[]);
    const onState = (s)=> setSt(s);
    const onServerReset = ()=>{
      setSt(null);
      setTeams([]);
      try { /* keep stored session */ } catch {}
      socket.emit('requestTeams');
      socket.emit('requestState');
    };
    socket.on('teamsUpdated', onTeams);
    socket.on('state:update', onState);
    socket.on('server:reset', onServerReset);
    socket.emit('requestTeams');
    socket.emit('requestState');
    return ()=>{ socket.off('teamsUpdated', onTeams); socket.off('state:update', onState); socket.off('server:reset', onServerReset); };
  },[]);

  // Session Restore: gespeicherte Team-Session (id, name, avatar) automatisch erkennen
  const storedSessionRef = useRef(null);
  const autoNavigatedRef = useRef(false);
  useEffect(()=>{
    try {
      const raw = localStorage.getItem('teamSession');
      if(raw){
        const parsed = JSON.parse(raw);
        if(parsed && parsed.id && typeof parsed.id === 'string'){
          storedSessionRef.current = parsed;
        }
      }
    } catch {}
  },[]);

  // Wenn das gespeicherte Team bereits im Backend existiert -> automatisch weiterleiten
  useEffect(()=>{
    if(autoNavigatedRef.current) return;
    const sess = storedSessionRef.current;
    if(!sess) return;
    const exists = teams.some(t=> t.id === sess.id);
    if(exists){
      autoNavigatedRef.current = true;
      nav(`/team/${sess.id}`);
    }
  }, [teams, nav]);

  // Manuelles Wiederherstellen falls Team nicht mehr aktiv ist (erneut joinen mit gleicher ID)
  function handleRestore(){
    const sess = storedSessionRef.current;
    if(!sess || restoring) return;
    setRestoring(true);
    const { id: tid, name: storedName, avatar: storedAvatar } = sess;
    try { if (socket.connected) socket.disconnect(); } catch {}
    socket.auth = { teamId: tid };
    const cleanName = (storedName||'Team').trim() || 'Team';
    const onWelcome = (p)=>{
      if(p?.teamId === tid){
        socket.off('team:welcome', onWelcome);
        nav(`/team/${tid}`);
      }
    };
    socket.once('connect', ()=>{
      socket.emit('team:join', { name: cleanName, avatar: storedAvatar || avatar });
      try { localStorage.setItem('teamName:'+tid, cleanName); } catch {}
    });
    socket.on('team:welcome', onWelcome);
    socket.connect();
  }

  // Kein Snippet Rotator mehr - minimalistisches Layout

  const activeTeams = [...teams].sort((a,b)=> (a.joinedAt||0)-(b.joinedAt||0)).slice(0, limit);
  const usedAvatarSet = useMemo(()=> new Set(activeTeams.map(t=>t.avatar).filter(Boolean)), [activeTeams]);
  const filled = activeTeams.length;
  const slotsLeft = Math.max(0, limit - filled);

  function randomId(){
    // allow non numeric team ids (uuid-lite)
    return 'team-' + Math.random().toString(36).slice(2,8);
  }

  function handleJoin(e){
    e.preventDefault();
    if(!name.trim()) return;
    setJoining(true);
    const tid = randomId();
    // Neu: Verbindung mit neuem teamId Handshake erzwingen, damit Backend ensureTeam() dieses id nutzt
    try {
      if (socket.connected) socket.disconnect();
    } catch {}
    socket.auth = { teamId: tid };
  const onWelcome = (p)=>{
      if(p?.teamId === tid){
        socket.off('team:welcome', onWelcome);
        nav(`/team/${tid}`);
      }
    };
    const cleanName = name.trim();
    socket.once('connect', () => {
      socket.emit('team:join', { name: cleanName, avatar });
      try {
        localStorage.setItem('teamName:'+tid, cleanName);
        localStorage.setItem('teamSession', JSON.stringify({ id: tid, name: cleanName, avatar }));
      } catch {}
    });
    // Optimistisch sofort anzeigen
    setTeams(prev => [...prev, { id: tid, name: cleanName || 'Team', avatar, coins:24, quizJoker:1 }]);
    socket.on('team:welcome', onWelcome);
    socket.connect();
  }

  const remaining = charMax - name.length;
  // Sync avatar with index (mobile)
  useEffect(()=>{ if(isMobile){ setAvatar(AVATARS[idx]); } }, [idx,isMobile]);
  // If selected becomes used and user swipes, skip to next free when possible
  useEffect(()=>{
    if(!isMobile) return;
    const current = AVATARS[idx];
    if(usedAvatarSet.has(current)){
      // find next unused
      const next = AVATARS.findIndex(a=> !usedAvatarSet.has(a));
      if(next>=0) { setIdx(next); }
    }
  }, [usedAvatarSet, idx, isMobile]);

  // Swipe handlers (mobile)
  const touchRef = useRef({x:0, t:0});
  // Preload a small window of avatars around current index for smoother swipes
  const preloadRef = useRef(new Set());
  useEffect(() => {
    if (!isMobile) return;
    const win = 2; // how many neighbors to preload on each side
    const toPreload = new Set();
    for (let d = -win; d <= win; d++) {
      const i = (idx + d + AVATARS.length) % AVATARS.length;
      toPreload.add(AVATARS[i]);
    }
    toPreload.forEach((url) => {
      try {
        const u = assetUrl(url);
        if (!preloadRef.current.has(u)) {
          const img = new Image();
          img.decoding = 'async';
          img.src = u;
          preloadRef.current.add(u);
        }
      } catch {}
    });
  }, [idx, isMobile]);
  function onTouchStart(e){
    const x = e.touches?.[0]?.clientX || 0; touchRef.current={x,t:Date.now()};
  }
  function onTouchEnd(e){
    const x2 = e.changedTouches?.[0]?.clientX || 0; const dx = x2 - touchRef.current.x; const dt = Date.now()-touchRef.current.t;
    const TH = 40; // swipe threshold
    if(Math.abs(dx) > TH && dt < 800){
      if(dx < 0) move(1); else move(-1);
    }
  }
  function move(dir){
    setIdx(i=>{
      let ni = (i + dir + AVATARS.length) % AVATARS.length;
      // if target used, keep searching (avoid infinite loop if all used)
      let loops=0;
      while(usedAvatarSet.has(AVATARS[ni]) && loops < AVATARS.length){ ni = (ni + dir + AVATARS.length) % AVATARS.length; loops++; }
      return ni;
    });
  }

  const storedSess = storedSessionRef.current;
  const canRestore = !!storedSess && teams.some(t=>t.id === storedSess.id) === false; // nur zeigen, wenn vorhanden aber nicht aktiv

  const nameInputId = 'team-name-input';
  const charMeterId = 'team-name-counter';
  const slotsMessageId = 'team-slots-message';
  const nameDescribedBy = [charMeterId, slotsLeft === 0 ? slotsMessageId : null].filter(Boolean).join(' ');
  const panelClass = ['login-panel', 'login-form', 'minimal', motionClass('glassIn', 'scaleIn')].filter(Boolean).join(' ');
  const joinButtonClass = ['btn', 'btn-cta', 'join-btn', motionClass('hoverGlow', reduceMotion ? null : 'pulse')].filter(Boolean).join(' ');
  const restoreButtonClass = ['btn', 'btn-cta', 'restore-btn', motionClass('hoverGlow', reduceMotion ? null : 'pulse')].filter(Boolean).join(' ');
  const avatarFrameClass = 'avatar-frame';
  const avatarImgClass = motionClass('avatarBreath');

  const shellRef = useRef(null);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell || reduceMotion) {
      if (shell) shell.style.setProperty('--glow-opacity', '0');
      return;
    }
    const pointerFine = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: fine)').matches;
    if (!pointerFine) {
      shell.style.setProperty('--glow-opacity', '0');
      return;
    }
    shell.dataset.glowActive = '0';
    shell.style.setProperty('--glow-x', '50%');
    shell.style.setProperty('--glow-y', '55%');
    shell.style.setProperty('--glow-opacity', '0');

    const pos = { currentX: 50, currentY: 55, targetX: 50, targetY: 55, opacity: 0 };
    let raf = 0;

    const animate = () => {
      pos.currentX += (pos.targetX - pos.currentX) * 0.12;
      pos.currentY += (pos.targetY - pos.currentY) * 0.12;
      shell.style.setProperty('--glow-x', `${pos.currentX}%`);
      shell.style.setProperty('--glow-y', `${pos.currentY}%`);
      const desiredOpacity = shell.dataset.glowActive === '1' ? 0.7 : 0;
      pos.opacity += (desiredOpacity - pos.opacity) * 0.08;
      shell.style.setProperty('--glow-opacity', pos.opacity.toFixed(3));
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);

    const updateTarget = (clientX, clientY) => {
      const rect = shell.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * 100;
      const y = ((clientY - rect.top) / rect.height) * 100;
      pos.targetX = Math.min(100, Math.max(0, x));
      pos.targetY = Math.min(100, Math.max(0, y));
    };

    const handlePointerMove = (e) => {
      updateTarget(e.clientX, e.clientY);
      shell.dataset.glowActive = '1';
    };
    const handlePointerDown = (e) => {
      updateTarget(e.clientX, e.clientY);
      shell.dataset.glowActive = '1';
    };
    const handlePointerLeave = () => {
      shell.dataset.glowActive = '0';
    };

    shell.addEventListener('pointermove', handlePointerMove);
    shell.addEventListener('pointerdown', handlePointerDown);
    shell.addEventListener('pointerup', handlePointerDown);
    shell.addEventListener('pointerleave', handlePointerLeave);

    return () => {
      cancelAnimationFrame(raf);
      shell.removeEventListener('pointermove', handlePointerMove);
      shell.removeEventListener('pointerdown', handlePointerDown);
      shell.removeEventListener('pointerup', handlePointerDown);
      shell.removeEventListener('pointerleave', handlePointerLeave);
      shell.style.setProperty('--glow-opacity', '0');
      shell.dataset.glowActive = '0';
    };
  }, [reduceMotion]);

  return (
    <div className="login-shell minimal" ref={shellRef}>
      <div className="login-follow-glow" aria-hidden />
      <div className="login-sparkles" aria-hidden />
      <div className="login-aurora" aria-hidden>
        <span className="aurora a1" />
        <span className="aurora a2" />
        <span className="aurora a3" />
      </div>
      <div className="minimal-inner">
        <form onSubmit={handleJoin} className={panelClass}>
          <h1 className="sr-only">Team Beitritt</h1>
          <div className={`input-wrapper ${motionClass('fadeInUp')}`}>
            <input
              id={nameInputId}
              className="input big name-input"
              maxLength={charMax}
              disabled={slotsLeft === 0 || joining}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Teamname"
              aria-label="Teamname eingeben"
              aria-describedby={nameDescribedBy}
            />
            <span id={charMeterId} className="input-metrics" aria-live="polite">
              {remaining}
            </span>
          </div>
          {!isMobile && (
            <div className={`avatar-grid ${motionClass('fadeInUp')}`} role="list" aria-label="Avatare">
              {AVATARS.map((a, i) => {
                const used = usedAvatarSet.has(a);
                const isSelected = avatar === a;
                const disabled = used && !isSelected;
                return (
                  <button
                    key={a}
                    type="button"
                    role="listitem"
                    className={`avatar-btn ${isSelected ? 'selected' : ''} ${disabled ? 'used' : ''}`}
                    disabled={disabled || slotsLeft === 0 || joining}
                    onClick={() => { if (!disabled) { setAvatar(a); setIdx(i); } }}
                    aria-label={disabled ? 'Avatar belegt' : 'Avatar waehlen'}
                    aria-pressed={isSelected}
                  >
                    <span className={avatarFrameClass}>
                      <img className={avatarImgClass} src={assetUrl(a)} alt="avatar" draggable={false} loading="lazy" />
                    </span>
                    {disabled && <span className="lock" aria-hidden>LOCK</span>}
                  </button>
                );
              })}
            </div>
          )}
          {isMobile && (
            <div
              className={`swipe-wrapper ${motionClass('fadeInUp')}`}
              aria-label="Avatare"
              onTouchStart={onTouchStart}
              onTouchEnd={onTouchEnd}
            >
              <div className="swipe-bg" aria-hidden />
              <div className="swipe-track">
                {AVATARS.map((a, i) => {
                  const used = usedAvatarSet.has(a);
                  const offset = i - idx;
                  if (Math.abs(offset) > 2 && !(offset === AVATARS.length - 1 && idx === 0) && !(offset === -AVATARS.length + 1 && idx === AVATARS.length - 1)) return null;
                  const isSel = i === idx;
                  return (
                    <div key={a} className={`swipe-item ${isSel ? 'sel' : ''} ${used ? 'used' : ''}`} style={{ '--o': offset }}>
                      <span className={avatarFrameClass}>
                        <img
                          className={avatarImgClass}
                          src={assetUrl(a)}
                          alt="avatar"
                          loading={isSel ? 'eager' : 'lazy'}
                          fetchPriority={isSel ? 'high' : 'low'}
                          decoding="async"
                        />
                      </span>
                      {used && <span className="lock" aria-hidden>LOCK</span>}
                    </div>
                  );
                })}
              </div>
              <div className="swipe-hint" aria-hidden>Swipe &lt; &gt;</div>
              <div className="swipe-arrows">
                <button type="button" className="sw-btn left" onClick={() => move(-1)} aria-label="Vorheriger Avatar">&lt;</button>
                <button type="button" className="sw-btn right" onClick={() => move(1)} aria-label="Naechster Avatar">&gt;</button>
              </div>
            </div>
          )}
          {slotsLeft === 0 && (
            <div id={slotsMessageId} className={`slots-full-msg ${motionClass('fadeIn')}`} role="alert">
              Alle Slots belegt. Bitte warten...
            </div>
          )}
          <button
            className={joinButtonClass}
            disabled={slotsLeft === 0 || joining || !name.trim() || usedAvatarSet.has(avatar)}
          >
            {joining ? 'Verbinde...' : 'Beitreten'}
          </button>
          <div className={`active-teams-inline ${motionClass('fadeIn')}`} aria-live="polite">
            {activeTeams.map((t) => (
              <div key={t.id} className="team-chip">
                <img src={assetUrl(t.avatar || '/avatars/capybara.png')} alt="avatar" />
                {t.name}
              </div>
            ))}
            {activeTeams.length === 0 && <div className="muted" style={{ textAlign: 'center', width: '100%' }}>Noch keine Teams.</div>}
          </div>
          {storedSess && !canRestore && !joining && (
            <div className={`restore-hint ${motionClass('fadeIn')}`}>
              Vorherige Session erkannt -
              <button type="button" className="link-btn" onClick={() => nav(`/team/${storedSess.id}`)}>
                hier fortsetzen
              </button>
            </div>
          )}
          {canRestore && (
            <div className={`restore-box ${motionClass('fadeIn')}`}>
              <p>Altes Team wiederherstellen?</p>
              <button
                type="button"
                className={restoreButtonClass}
                onClick={handleRestore}
                disabled={restoring}
                aria-label={restoring ? 'Verbinde...' : `Team ${storedSess?.name ?? 'wiederherstellen'}`}
              >
                {restoring ? 'Verbinde...' : (storedSess?.name ? `Team ${storedSess.name}` : 'Altes Team wiederherstellen')}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

// Debug: ensure module evaluated & default export present
console.debug('[TeamLogin] module evaluated, exporting default');
export default TeamLogin;


