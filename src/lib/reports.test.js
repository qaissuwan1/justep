import test from 'node:test';
import assert from 'node:assert/strict';
import {buildReports} from './reports.js';
const curriculum={systems:[{id:'s',name:'System'}],subjects:[{id:'sub',name:'Subject',system_id:'s'}],topics:[{id:'t',name:'Topic',subject_id:'sub'}]};
test('empty bank retains curriculum without counting archived attempts',()=>{
  const r=buildReports({...curriculum,questions:[],attempts:[{id:'1',question_id:'archived',is_correct:true}]});
  assert.equal(r.systems[0].total,0);assert.equal(r.subjects[0].used,0);assert.equal(r.topics[0].score,null);
});
test('latest attempt wins and unattempted questions are not omitted',()=>{
  const questions=[{id:'q',subject_id:'sub',topic_id:'t'},{id:'unseen',subject_id:'sub',topic_id:'t'},{id:'skip',subject_id:'sub',topic:'Legacy'}];
  const attempts=[{id:'1',question_id:'q',is_correct:false,answered_at:'2026-01-01'},{id:'2',question_id:'q',is_correct:true,answered_at:'2026-01-02'},{id:'3',question_id:'skip',is_correct:null,answered_at:'2026-01-02'}];
  const r=buildReports({...curriculum,questions,attempts});
  assert.equal(r.systems[0].total,3);assert.equal(r.subjects[0].used,2);assert.equal(r.subjects[0].correct,1);assert.equal(r.subjects[0].incorrect,0);assert.equal(r.subjects[0].omitted,1);assert.equal(r.subjects[0].score,50);assert.equal(r.subjects[0].children.length,2);
});
