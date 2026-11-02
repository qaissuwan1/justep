import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { summarizePerformance } from '../lib/performance';
import './Performance.css';

async function allPages(query) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const {data, error} = await query().range(offset, offset + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) return rows;
  }
}

function Donut({ value, label, segments, description }) {
  const total = segments.reduce((sum,s) => sum+s.value,0);
  let cursor = 0;
  const stops = segments.map(s => {
    const start = cursor;
    cursor += total ? s.value / total * 100 : 0;
    return `${s.color} ${start}% ${cursor}%`;
  });
  return <div className="performance-donut" role="img" aria-label={description} style={{background:total ? `conic-gradient(${stops.join(',')})` : '#e5e7eb'}}>
    <div><strong>{value == null ? '—' : `${value}%`}</strong><span>{label}</span></div>
  </div>;
}

function Metrics({title, rows, note}) {
  return <section className="performance-metrics"><h2>{title}</h2><dl>{rows.map(([label,value,color])=><div key={label}><dt>{color && <i aria-hidden="true" style={{background:color}}/>}{label}</dt><dd>{value ?? '—'}</dd></div>)}</dl>{note && <p className="performance-note">{note}</p>}</section>;
}

export default function Performance() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(false);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    (async () => {
      setError(false); setStats(null);
      try {
        const {data:{user}, error:authError} = await supabase.auth.getUser();
        if (authError || !user) throw new Error('Sign in required');
        const [attempts, questions] = await Promise.all([
          allPages(() => supabase.from('user_progress').select('id,question_id,is_correct,time_spent_seconds').eq('user_id',user.id).order('id')),
          allPages(() => supabase.from('questions').select('id').eq('published',true).is('deleted_at',null).order('id')),
        ]);
        if (active) setStats(summarizePerformance(attempts, questions.map(q=>q.id)));
      } catch { if (active) setError(true); }
    })();
    return () => { active=false; };
  }, [version]);

  return <div className="performance-page">
    <header className="performance-header"><div><span className="performance-kicker">QBANK / PERFORMANCE</span><h1>Overall Performance</h1></div><Link to="/app/home">⌂ <span>Home</span></Link></header>
    <div className="performance-body">
      <nav className="performance-tabs" aria-label="Performance navigation"><span aria-current="page">Overall</span><Link to="/app/questions">Create Test ↗</Link><Link to="/app/subjects">Systems & Subjects ↗</Link></nav>
      <section className="performance-panel" aria-labelledby="stats-heading">
        <div className="performance-panel-heading"><h2 id="stats-heading">Statistics</h2><button onClick={()=>window.print()} disabled={!stats}>▤ Print</button></div>
        {error ? <div className="performance-empty" role="alert"><h2>Unable to load your performance</h2><p>Your history is safe. Please check your connection and try again.</p><button onClick={()=>setVersion(v=>v+1)}>Try again</button></div> : !stats ? <div className="performance-empty" role="status">Loading your performance…</div> : <>
          <p className="performance-context">Your score includes all saved attempts, including archived questions. QBank usage includes only currently published, active questions.</p>
          <div className="performance-row">
            <Donut value={stats.score} label="Correct" segments={[{value:stats.correct,color:'#7bc64e'},{value:stats.incorrect,color:'#f2a0a0'},{value:stats.omitted,color:'#cddaff'}]} description={`${stats.correct} correct, ${stats.incorrect} incorrect, ${stats.omitted} omitted attempts`}/>
            <Metrics title="Your Score" rows={[["Total Correct",stats.correct,'#7bc64e'],["Total Incorrect",stats.incorrect,'#ef9999'],["Total Omitted",stats.omitted,'#b8cbf8']]} note="Each saved attempt counts once, including repeat attempts."/>
            <Metrics title="Answer Changes" rows={[["Correct to Incorrect",null],["Incorrect to Correct",null],["Incorrect to Incorrect",null]]} note="Not tracked yet. Earlier answer selections were not recorded."/>
          </div>
          <div className="performance-row">
            <Donut value={stats.usage} label="Used" segments={[{value:stats.used,color:'#4285ef'},{value:stats.unused,color:'#e2e3e5'}]} description={`${stats.used} used of ${stats.total} active questions`}/>
            <Metrics title="QBank Usage" rows={[["Used Questions",stats.used],["Unused Questions",stats.unused],["Total Questions",stats.total]]} note={!stats.total ? 'The question bank is being prepared. New published questions will appear here.' : 'Unique questions in the current question bank.'}/>
            <Metrics title="Test Count" rows={[["Tests Created",null],["Tests Completed",null],["Suspended Tests",null]]} note="Not tracked yet. Existing answer history does not identify individual tests."/>
          </div>
          <div className="performance-bottom"><Metrics title="Time Spent" rows={[["Your Average Time (sec)",stats.averageTime],["Timed Attempts",stats.timedAttempts],["Total Saved Attempts",stats.attempts]]}/><section className="performance-comparison"><span className="performance-kicker">PEER COMPARISON</span><h2>Percentile Rank</h2><p>Not available yet. A reliable comparison needs a shared question set and enough student results.</p></section></div>
        </>}
      </section>
      <footer className="performance-footer">JUstep · University question bank</footer>
    </div>
  </div>;
}
