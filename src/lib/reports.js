export function buildReports({ systems, subjects, topics, questions, attempts }) {
  const latest = new Map();
  for (const a of attempts) {
    const prev = latest.get(a.question_id);
    if (!prev || `${a.answered_at || ''}/${a.id}` > `${prev.answered_at || ''}/${prev.id}`) latest.set(a.question_id,a);
  }
  const subjectMap = new Map(subjects.map(s=>[s.id,s]));
  const topicMap = new Map(topics.map(t=>[t.id,t]));
  const stats = qs => {
    const answered = qs.map(q=>latest.get(q.id)).filter(Boolean);
    const correct = answered.filter(a=>a.is_correct === true).length;
    const incorrect = answered.filter(a=>a.is_correct === false).length;
    return {total:qs.length,used:answered.length,correct,incorrect,omitted:answered.length-correct-incorrect,score:answered.length ? Math.round(correct/answered.length*100) : null};
  };
  const topicRows = (qs,subjectId) => {
    const grouped = new Map();
    for(const q of qs) {
      const key = q.topic_id || `legacy:${q.topic || 'Unassigned'}`;
      if(!grouped.has(key)) grouped.set(key,[]);
      grouped.get(key).push(q);
    }
    return [...grouped].map(([key,rows])=>({id:`${subjectId}:${key}`,name:topicMap.get(key)?.name || rows[0].topic || 'Unassigned',subjectId,...stats(rows),children:[]}));
  };
  const subjectRows = subjects.map(s=>{
    const qs=questions.filter(q=>q.subject_id===s.id);
    return {id:s.id,name:s.name,subjectId:s.id,...stats(qs),children:topicRows(qs,s.id)};
  });
  const systemRows = systems.map(s=>{
    const qs=questions.filter(q=>subjectMap.get(q.subject_id)?.system_id===s.id);
    return {id:s.id,name:s.name,...stats(qs),children:subjectRows.filter(row=>subjectMap.get(row.id)?.system_id===s.id)};
  });
  // Keep configured topics visible even before their questions are published.
  const allTopics = subjectRows.flatMap(s=>s.children.map(t=>({...t,subtitle:s.name})));
  for(const t of topics) if(!allTopics.some(r=>r.id===`${t.subject_id}:${t.id}`)) allTopics.push({id:`${t.subject_id}:${t.id}`,name:t.name,subjectId:t.subject_id,subtitle:subjectMap.get(t.subject_id)?.name || '',...stats([]),children:[]});
  return {subjects:subjectRows,systems:systemRows,topics:allTopics};
}
