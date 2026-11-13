// Offline comparison of two ranking strategies using aggregate, randomized cohorts.
// No member ratings, gym membership records, or production switch live here.
const START = 1500;
const MIN_K = 8;
const MAX_K = 24;

function compareStrategies({controlRating = START, candidateRating = START, capacity, eligibleMembers,
  optedInMembers, uniqueParticipants, controlTrials, candidateTrials, controlSuccesses, candidateSuccesses} = {}) {
  const counts = [capacity,eligibleMembers,optedInMembers,uniqueParticipants,controlTrials,candidateTrials,controlSuccesses,candidateSuccesses];
  if (!counts.every(value => Number.isSafeInteger(value) && value >= 0) ||
      ![controlRating,candidateRating].every(value=>Number.isFinite(value)&&value>=1000&&value<=2000) ||
      optedInMembers > eligibleMembers || uniqueParticipants > optedInMembers ||
      uniqueParticipants > controlTrials+candidateTrials || controlSuccesses > controlTrials || candidateSuccesses > candidateTrials) {
    throw new RangeError('Invalid aggregate experiment inputs');
  }
  const pool = Math.min(capacity, eligibleMembers, optedInMembers);
  if (pool < 50 || uniqueParticipants < 40 || Math.min(controlTrials,candidateTrials) < 30) {
    return {eligible:false,controlRating,candidateRating,reason:'insufficient_cohort'};
  }
  const expected = 1/(1+10**((controlRating-candidateRating)/400));
  const observed = 0.5+(candidateSuccesses/candidateTrials-controlSuccesses/controlTrials)/2;
  const k = Math.min(MAX_K,MIN_K+Math.floor(pool/25));
  const ceiling = Math.min(2000-candidateRating,controlRating-1000);
  const floor = Math.max(1000-candidateRating,controlRating-2000);
  const delta = Math.max(floor,Math.min(ceiling,k*(observed-expected)));
  return {eligible:true,controlRating:controlRating-delta,candidateRating:candidateRating+delta,delta};
}

export {compareStrategies};
