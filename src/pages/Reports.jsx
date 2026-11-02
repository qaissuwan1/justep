import { Fragment, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { buildReports } from '../lib/reports';
import './Performance.css';
import './Reports.css';

async function allRows(query) {
  const rows=[];
  for(let offset=0;;offset+=1000) {
    const {data,error}=await query().range(offset,offset+999);
    if(error) throw error;
    rows.push(...(data||[]));
    if(!data || data.length<1000) return rows;
  }
}
const tabs=[['subjects','Subjects'],['systems','Systems'],['topics','Topics'],['recommendations','Study Recommendations']];
const pct=(n,total)=>total ? Math.round(n/total*100) : 0;

export default function Reports() {
  const [params,setParams]=useSearchParams();
  const tab=tabs.some(([id])=>id===params.get('tab')) ? params.get('tab') : 'subjects';
  const [report,setReport]=useState(null),[error,setError]=useState(false),[version,setVersion]=useState(0);
  const [search,setSearch]=useState(''),[show,setShow]=useState('score'),[outcome,setOutcome]=useState('correct');
  const [expanded,setExpanded]=useState(new Set()),[sort,setSort]=useState({key:'name',asc:true});
  useEffect(()=>{
    let active=true;
    (async()=>{
      setReport(null);setError(false);
      try {
        const {data:{user},error:authError}=await supabase.auth.getUser();
        if(authError || !user) throw new Error('Sign in required');
        const [systems,subjects,topics,questions,attempts]=await Promise.all([
          allRows(()=>supabase.from('systems').select('id,name').is('deleted_at',null).order('id')),
          allRows(()=>supabase.from('subjects').select('id,name,system_id').is('deleted_at',null).order('id')),
          allRows(()=>supabase.from('topics').select('id,name,subject_id').is('deleted_at',null).order('id')),
          allRows(()=>supabase.from('questions').select('id,subject_id,topic_id,topic').is('deleted_at',null).eq('published',true).order('id')),
          allRows(()=>supabase.from('user_progress').select('id,question_id,is_correct,answered_at').eq('user_id',user.id).order('id')),
        ]);
        if(active) setReport(buildReports({systems,subjects,topics,questions,attempts}));
      } catch {if(active) setError(true);}
    })();
    return ()=>{active=false;};
  },[version]);
  const source=report?.[tab==='recommendations'?'topics':tab] || [];
  const filtered=source.filter(r=>`${r.name} ${r.subtitle||''}`.toLowerCase().includes(search.toLowerCase()));
  const rows=[...filtered].sort((a,b)=>{
    const value=sort.key==='name' ? a.name.localeCompare(b.name) : (a[sort.key]??-1)-(b[sort.key]??-1);
    return sort.asc?value:-value;
  });
  const expandable=rows.filter(r=>r.children.length);
  const allExpanded=expandable.length>0 && expandable.every(r=>expanded.has(r.id));
  const toggle=id=>setExpanded(old=>{const next=new Set(old);next.has(id)?next.delete(id):next.add(id);return next;});
  const sortBy=key=>setSort(old=>({key,asc:old.key===key?!old.asc:true}));
  const recommendations=filtered.filter(r=>r.total>0 && (r.used===0 || (r.used>=5 && r.score<70))).sort((a,b)=>(a.score??-1)-(b.score??-1));
  function renderRow(row,child=false) {
    const value=show==='usage'?pct(row.used,row.total):pct(row[outcome],row.used);
    return <tr key={row.id} className={child?'report-child':''}><td><div className="report-name">{!child && row.children.length ? <button className="report-expand" onClick={()=>toggle(row.id)} aria-expanded={expanded.has(row.id)} aria-label={`${expanded.has(row.id)?'Collapse':'Expand'} ${row.name}`}>{expanded.has(row.id)?'−':'+'}</button>:<span className="report-expand-spacer"/>}<div><strong>{row.name}</strong>{row.subtitle && <small>{row.subtitle}</small>}<div className="report-bar" role="img" aria-label={`${show==='usage'?'Usage':outcome}: ${value}%`}><span style={{width:`${value}%`,background:show==='usage'?'#4285ef':outcome==='correct'?'#7bc64e':outcome==='incorrect'?'#e79090':'#aec1ed'}}/></div></div></div></td><td>{row.used}/{row.total}</td>{['correct','incorrect','omitted'].map(key=><td key={key}>{row[key]} <span className="report-percent">({row.used?pct(row[key],row.used)+'%':'—'})</span></td>)}<td title="Peer percentile ranks are not available yet">—</td></tr>;
  }
  return <div className="performance-page"><header className="performance-header"><div><span className="performance-kicker">QBANK / PERFORMANCE</span><h1>Reports</h1></div><Link to="/app/home">⌂ Home</Link></header><div className="performance-body">
    <nav className="performance-tabs" aria-label="Performance navigation"><Link to="/app/performance">Overall</Link><span aria-current="page">Reports</span></nav>
    <section className="performance-panel reports-panel"><div className="reports-tabs"><nav aria-label="Report categories">{tabs.map(([id,label])=><button key={id} aria-pressed={tab===id} className={tab===id?'selected':''} onClick={()=>{setParams({tab:id});setExpanded(new Set());setSearch('');}}>{label}</button>)}</nav><button onClick={()=>window.print()} disabled={!report}>▤ Print</button></div>
      <div className="reports-filters"><label>Show <select value={show} onChange={e=>setShow(e.target.value)}><option value="score">Score</option><option value="usage">Usage</option></select></label><label>Score breakdown<select value={outcome} disabled={show==='usage'} onChange={e=>setOutcome(e.target.value)}><option value="correct">Correct Only</option><option value="incorrect">Incorrect Only</option><option value="omitted">Omitted Only</option></select></label><label className="reports-search">Search<input type="search" placeholder="Search" value={search} onChange={e=>setSearch(e.target.value)}/></label></div>
      <p className="performance-context">Current published question bank · Latest saved attempt per question. Archived content is excluded. P-rank is unavailable until peer comparisons are supported.</p>
      {error?<div className="performance-empty" role="alert">Could not load reports. <button onClick={()=>setVersion(v=>v+1)}>Try again</button></div>:!report?<div className="performance-empty" role="status">Loading your reports…</div>:tab==='recommendations'?<div className="report-recommendations"><p>Topics with at least 5 used questions and less than 70% correct are suggested for review. Unstarted topics are suggested for practice.</p>{recommendations.length?recommendations.map(r=><article key={r.id}><div><h2>{r.name}</h2><p>{r.subtitle} · {r.used?`${r.score}% correct across ${r.used} used questions`:`${r.total} questions ready to practice`}</p></div><Link to={`/app/subjects?subject=${encodeURIComponent(r.subjectId)}`}>Review subject →</Link></article>):<div className="performance-empty">No study recommendations yet. They will appear as you practice questions in the current bank.</div>}</div>:<div className="report-table-wrap"><table className="report-table"><thead><tr><th aria-sort={sort.key==='name'?(sort.asc?'ascending':'descending'):'none'}><button disabled={!expandable.length} onClick={()=>setExpanded(allExpanded?new Set():new Set(expandable.map(r=>r.id)))} aria-label={allExpanded?'Collapse all':'Expand all'}>{allExpanded?'−':'+'}</button><button onClick={()=>sortBy('name')}>Name ↕</button></th>{[['used','Usage'],['correct','Correct Q'],['incorrect','Incorrect Q'],['omitted','Omitted Q']].map(([key,label])=><th key={key} aria-sort={sort.key===key?(sort.asc?'ascending':'descending'):'none'}><button onClick={()=>sortBy(key)}>{label} ↕</button></th>)}<th>P-rank</th></tr></thead><tbody>{rows.map(row=><Fragment key={row.id}>{renderRow(row)}{expanded.has(row.id)&&row.children.map(child=>renderRow(child,true))}</Fragment>)}{!rows.length&&<tr><td colSpan={6} className="report-no-results">{search?'No results match your search.':'No categories available yet.'}</td></tr>}</tbody></table></div>}
    </section><footer className="performance-footer">JUstep · University question bank</footer></div></div>;
}
