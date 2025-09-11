import { useEffect, useRef } from 'react';
import QR from 'qrcode';

export default function JoinQR({ code, size = 360 }){
  const base = import.meta.env.VITE_PLAY_BASE_URL?.trim() || window.location.origin;
  const url = `${base}/join?code=${encodeURIComponent(code||'')}`;
  const canvasRef = useRef(null);
  useEffect(()=>{
    const c = canvasRef.current; if(!c) return;
    QR.toCanvas(c, url, { errorCorrectionLevel:'M', width: size, margin: 2 }).catch(console.error);
  }, [url, size]);
  return (
    <div className="qr-wrap" style={{textAlign:'center'}}>
      <canvas ref={canvasRef} width={size} height={size} style={{width:size, height:size}} />
      <div className="qr-caption" style={{marginTop:8,opacity:.85,fontSize:14,wordBreak:'break-all'}}>{url}</div>
    </div>
  );
}
