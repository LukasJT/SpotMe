import assert from 'node:assert/strict';
import {test} from 'node:test';
import {compareStrategies} from './elo.mjs';
const sample={capacity:500,eligibleMembers:180,optedInMembers:120,uniqueParticipants:100,
  controlTrials:50,candidateTrials:50,controlSuccesses:15,candidateSuccesses:25};
test('small gyms, sparse opt-in and low sample sizes cannot update ratings',()=>{
  for (const input of [{capacity:49},{eligibleMembers:45,optedInMembers:44,uniqueParticipants:40},{uniqueParticipants:39},{candidateTrials:29,uniqueParticipants:70}]) {
    assert.deepEqual(compareStrategies({...sample,...input}),{eligible:false,controlRating:1500,candidateRating:1500,reason:'insufficient_cohort'});
  }
});
test('a stronger candidate gains a bounded score and reversing the outcome reverses the update',()=>{
  const result=compareStrategies(sample);
  assert.ok(result.delta>0 && result.delta<=24);
  assert.ok(Math.abs(result.controlRating+result.candidateRating-3000)<1e-8);
  assert.ok(compareStrategies({...sample,controlSuccesses:25,candidateSuccesses:15}).delta<0);
  assert.throws(()=>compareStrategies({...sample,uniqueParticipants:101}),RangeError);
});
