import { io } from "socket.io-client";

// Marker to help confirm this file is served
console.warn('[socket-v2] loaded');

let TUNNEL = import.meta.env.VITE_SOCKET_URL?.trim();

const DEFAULT_SOCKET_PORT = Number(import.meta.env.VITE_SOCKET_PORT || 3001);

function isLocal(h){
  try { h = String(h||''); } catch { h = ''; }
  return h === 'localhost' || h.startsWith('127.') || h.startsWith('192.168.') || h.endsWith('.local');
}

// Legacy heuristic removed â€“ we accept almost any provided absolute URL.
function looksLikeBackend(){ return true; }

function isTryCloudflare(urlStr){
  try{ const u = new URL(urlStr); return /trycloudflare\.com$/i.test(u.hostname); }catch{ return false; }
}

function sameOrigin(urlStr){
  try{ const u = new URL(urlStr, location.origin); return u.origin === location.origin; }catch{ return false; }
}
function localBackendUrl(){
  try {
    if (typeof window === 'undefined') throw new Error('no window');
    const { protocol, hostname } = window.location || {};
    const base = protocol === 'https:' ? 'https:' : 'http:';
    const targetHost = hostname && hostname !== '' ? hostname : 'localhost';
    const url = new URL(`${base}//${targetHost}`);
    url.port = String(DEFAULT_SOCKET_PORT);
    url.pathname = '';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return `http://127.0.0.1:${DEFAULT_SOCKET_PORT}`;
  }
}

let API;
if (TUNNEL) {
  try {
    // Guard only against same-origin or trycloudflare preview
    if (isTryCloudflare(TUNNEL) || sameOrigin(TUNNEL)) {
      console.warn('[socket-v2] Ignoring preview/front URL for sockets:', TUNNEL);
      TUNNEL = '';
    }
  } catch {}
}

if (TUNNEL) {
  API = TUNNEL;
} else if (typeof window !== 'undefined' && window.location && isLocal(window.location.hostname)) {
  API = localBackendUrl();
} else {
  console.warn('[socket-v2] VITE_SOCKET_URL missing/ignored â€“ falling back to https://api.cozyquiz.app');
  API = 'https://api.cozyquiz.app';
}

console.log('[socket-v2] final API endpoint:', API);

let _socket = null;
let _auth = null;
function createSocket(){
  if(_socket) return _socket;
  if(!API) return null;
  try{
    console.log('[socket-v2] creating socket for', API);
  _socket = io(API, {
    transports: ['websocket', 'polling'],
    rememberUpgrade: true,
    autoConnect: false,
    timeout: 6000,
    reconnection: true,
    reconnectionAttempts: 6,
    reconnectionDelay: 800,
    reconnectionDelayMax: 4000,
    auth: _auth
  });
    _socket.on('connect', () => console.log('[socket-v2] connected', _socket.id));
    _socket.on('connect_error', (err) => console.error('[socket-v2] connect_error', err && err.message ? err.message : err));
    _socket.on('disconnect', (reason) => console.warn('[socket-v2] disconnect', reason));
  }catch(e){
    console.error('[socket-v2] createSocket error', e);
    _socket = null;
  }
  return _socket;
}

const socket = {
  on(...args){ const s = createSocket(); try{ s && s.on(...args); }catch(e){} },
  once(...args){ const s = createSocket(); try{ s && s.once(...args); }catch(e){} },
  off(...args){ if(_socket){ try{ _socket.off(...args); }catch{} } },
  emit(...args){ const s = createSocket(); try{ return s && s.emit(...args); }catch{} },
  connect(){ const s = createSocket(); try{ return s && s.connect(); }catch{} },
  disconnect(){ if(_socket){ try{ _socket.disconnect(); }catch{} finally{ _socket = null; } } },
  onAny(...args){ const s = createSocket(); try{ s && s.onAny && s.onAny(...args); }catch(e){} },
  offAny(...args){ if(_socket && _socket.offAny){ try{ _socket.offAny(...args); }catch{} } },
  get connected(){ return _socket ? Boolean(_socket.connected) : false; },
  get id(){ return _socket ? _socket.id : undefined; }
};

Object.defineProperty(socket, 'auth', {
  get(){ return _auth; },
  set(v){ _auth = v; try{ if(_socket) _socket.auth = v; }catch{} }
});

export default socket;

export const ensureConnected = () => {
  const s = createSocket();
  if(!s) return false;
  try{ if(!s.connected) s.connect(); }catch(e){}
  return Boolean(s && s.connected);
};

export function connectWithTeamId(teamId) {
  const s = createSocket();
  try{ if(s && s.disconnect) s.disconnect(); }catch(e){}
  if(s){ s.auth = { teamId }; try{ s.connect(); }catch(e){} }
  return s || socket;
}








