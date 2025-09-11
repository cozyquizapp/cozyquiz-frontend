import { useSearchParams } from 'react-router-dom';
import { useEffect } from 'react';
import socket from '../socket.v2';

export default function JoinPage(){
  const [sp] = useSearchParams();
  const code = sp.get('code') || '';
  useEffect(()=>{ /* could prefill UI or validate code via API */ }, [code]);
  return (
    <div style={{display:'grid', placeItems:'center', minHeight:'100vh'}}>
      <div style={{padding:24, textAlign:'center'}}>
        <h2>Mitspielen</h2>
        <p>Code erkannt: <b>{code || '—'}</b></p>
        <p>Bitte gehe zur Login-Seite und tritt dem Spiel bei.</p>
        <a className="btn" href="/login">Weiter zum Login</a>
      </div>
    </div>
  );
}
