import { io } from "socket.io-client";

let TUNNEL = import.meta.env.VITE_SOCKET_URL?.trim();
// If VITE_SOCKET_URL points to a temporary trycloudflare preview hostname, ignore it.
if (TUNNEL && /trycloudflare\.com/i.test(TUNNEL)) {
  console.warn('[socket] ignoring preview VITE_SOCKET_URL from trycloudflare:', TUNNEL);
  TUNNEL = undefined;
}

function isLocal(h){
  try { h = String(h||''); } catch { h = ''; }
  return h === 'localhost' || h.startsWith('127.') || h.startsWith('192.168.') || h.endsWith('.local');
}

let API;
if (TUNNEL) {
  API = TUNNEL; // Production / named domain
} else if (isLocal(location.hostname)) {
  API = 'http://localhost:3001'; // Dev fallback
} else {
  // No TUNNEL set and not local -> assume production API host
  console.warn('[socket] VITE_SOCKET_URL fehlt – fall back to https://api.cozyquiz.app');
  API = 'https://api.cozyquiz.app';
}

// Lazy-initialized real socket instance
let _socket = null;
function createSocket(){
  if(_socket) return _socket;
  if(!API) return null;
  try{
    console.log('[socket] creating socket for', API);
    _socket = io(API, { transports: ['websocket'], autoConnect: false });
    _socket.on('connect', () => console.log('[socket] connected', _socket.id));
    _socket.on('connect_error', (err) => console.error('[socket] connect_error', err && err.message ? err.message : err));
    _socket.on('disconnect', (reason) => console.warn('[socket] disconnect', reason));
  }catch(e){
    console.error('[socket] createSocket error', e);
    _socket = null;
  }
  return _socket;
}

// Wrapper that forwards calls to the real socket, creating it on demand.
const socket = {
  on(...args){
    const s = createSocket();
    try{ s && s.on(...args); }catch(e){}
  },
  off(...args){ if(_socket){ try{ _socket.off(...args); }catch{} } },
  emit(...args){ const s = createSocket(); try{ return s && s.emit(...args); }catch{} },
  connect(){ const s = createSocket(); try{ return s && s.connect(); }catch{} },
  disconnect(){ if(_socket){ try{ return _socket.disconnect(); }catch{} } },
  get connected(){ return _socket ? Boolean(_socket.connected) : false; },
  get id(){ return _socket ? _socket.id : undefined; }
};

export default socket;

export const ensureConnected = () => {
  const s = createSocket();
  if(!s) return false;
  try{ if(!s.connected) s.connect(); }catch(e){}
  return Boolean(s && s.connected);
};

// Für TeamFixed: zuerst teamId setzen, dann verbinden
export function connectWithTeamId(teamId) {
  const s = createSocket();
  try{
    if(s && s.disconnect) s.disconnect();
  }catch(e){}
  if(s){ s.auth = { teamId }; try{ s.connect(); }catch(e){} }
  return s || socket;
}
