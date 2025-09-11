import { Routes, Route, Navigate } from 'react-router-dom';
import React from 'react';
import AdminView from './views/AdminView.jsx';
import ScoreboardV2 from './views/ScoreboardV2.jsx';
import TeamFixed from './views/TeamFixed.jsx';
import TeamLogin from './views/TeamLogin.jsx';
import { useParams } from 'react-router-dom';
import JoinPage from './routes/Join.jsx';
import './styles.css';

class ErrorBoundary extends React.Component {
  constructor(p){ super(p); this.state={err:null}; }
  static getDerivedStateFromError(error){ return { err:error }; }
  componentDidCatch(error, info){ console.error('[ErrorBoundary]', error, info); }
  render(){
    if(this.state.err){
      return <div style={{padding:40,fontFamily:'system-ui'}}>
        <h2>⚠️ Fehler in der Ansicht</h2>
        <p>{String(this.state.err?.message||this.state.err)}</p>
        <button onClick={()=>this.setState({err:null})}>Nochmal versuchen</button>
      </div>;
    }
    return this.props.children;
  }
}

function TeamDynamicWrapper(){
  const { teamId } = useParams();
  // allow both legacy ids (team-1..) and arbitrary new ids
  return (
    <TeamFixed
      fixedId={teamId}
      defaultName={teamId?.replace(/^team[-_]?/,'Team ') || 'Team'}
  defaultAvatar="/avatars/capybara.png"
    />
  );
}

export default function App() {
  return (
    <ErrorBoundary>
    <Routes>
  <Route path="/" element={<Navigate to="/login" replace />} />
  <Route path="/login" element={<TeamLogin />} />
  <Route path="/join" element={<JoinPage />} />

      {/* Feste Teams */}
      <Route
        path="/team/1"
        element={
          <TeamFixed
            fixedId="team-1"
            defaultName="Team Capybara"
            defaultAvatar="/avatars/capybara.png"
          />
        }
      />
      <Route
        path="/team/2"
        element={
          <TeamFixed
            fixedId="team-2"
            defaultName="Team Wombat"
            defaultAvatar="/avatars/wombat.png"
          />
        }
      />
      <Route
        path="/team/3"
        element={
          <TeamFixed
            fixedId="team-3"
            defaultName="Team Koala"
            defaultAvatar="/avatars/koala.png"
          />
        }
      />

      <Route path="/admin" element={<AdminView />} />
  <Route path="/scoreboard" element={<ScoreboardV2 />} />
  {/* Dynamic new team route */}
  <Route path="/team/:teamId" element={<TeamDynamicWrapper />} />
    </Routes>
    </ErrorBoundary>
  );
}
