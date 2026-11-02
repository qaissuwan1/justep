import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizePerformance } from './performance.js';

test('empty banks and histories have no invented percentages', () => {
  const stats = summarizePerformance([], []);
  assert.equal(stats.score, null);
  assert.equal(stats.usage, null);
  assert.equal(stats.averageTime, null);
  assert.equal(stats.unused, 0);
});

test('keeps archived attempts in history while deduplicating current bank usage', () => {
  const stats = summarizePerformance([
    {question_id:'archived',is_correct:true,time_spent_seconds:10},
    {question_id:'active',is_correct:false,time_spent_seconds:30},
    {question_id:'active',is_correct:true,time_spent_seconds:null},
    {question_id:'omitted',is_correct:null,time_spent_seconds:null},
  ], ['active', 'unused']);
  assert.deepEqual([stats.correct,stats.incorrect,stats.omitted,stats.score],[2,1,1,50]);
  assert.deepEqual([stats.used,stats.unused,stats.total,stats.usage],[1,1,2,50]);
  assert.equal(stats.averageTime,20);
  assert.equal(stats.timedAttempts,2);
});
