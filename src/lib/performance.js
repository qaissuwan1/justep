// Historical score includes archived content; bank usage covers active questions only.
export function summarizePerformance(attempts, questionIds) {
  const correct = attempts.filter(a => a.is_correct === true).length;
  const incorrect = attempts.filter(a => a.is_correct === false).length;
  const omitted = attempts.length - correct - incorrect;
  const activeIds = new Set(questionIds);
  const used = new Set(attempts.filter(a => activeIds.has(a.question_id)).map(a => a.question_id)).size;
  const times = attempts.map(a => a.time_spent_seconds).filter(t => typeof t === 'number' && Number.isFinite(t) && t >= 0);
  return {
    correct, incorrect, omitted, attempts: attempts.length,
    score: attempts.length ? Math.round(correct / attempts.length * 100) : null,
    used, unused: activeIds.size - used, total: activeIds.size,
    usage: activeIds.size ? Math.round(used / activeIds.size * 100) : null,
    averageTime: times.length ? Math.round(times.reduce((a,b) => a+b,0) / times.length) : null,
    timedAttempts: times.length,
  };
}
