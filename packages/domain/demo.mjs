const cities = ['Toronto', 'Mississauga', 'Hamilton', 'Kitchener', 'Waterloo', 'Cambridge', 'Barrie'];
const workouts = ['Upper / lower', 'Push / pull / legs', 'Full body', 'Other'];
const audiences = ['private', 'matches', 'discovery'];
const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const gyms = cities.map((city, index) => ({id:`gym-${index}`, name:`${city} Sample Training Club`, city, address:'Fictional listing for local testing'}));
const ids = ['alex', 'maya', 'jordan', 'sam'];
const key = (a, b) => [a, b].sort().join(':');
const fail = message => { throw new Error(message); };
const short = (value, limit) => String(value ?? '').trim().slice(0, limit);
const canSee = (visibility, matched) => visibility === 'discovery' || (visibility === 'matches' && matched);

function createDemo() {
  const profiles = {
    alex: {name:'Alex', age:28, city:'Kitchener', bio:'I lift four days a week and spend weekends on the trails. Always up for a post-workout coffee.', split:'Upper / lower', days:['Mon','Tue','Thu','Sat'], gymIds:['gym-3','gym-4']},
    maya: {name:'Maya', age:27, city:'Waterloo', bio:'Happiest after a run or a good group class. Currently looking for the best ramen in Waterloo.', split:'Full body', days:['Mon','Wed','Fri'], gymIds:['gym-4']},
    jordan: {name:'Jordan', age:30, city:'Cambridge', bio:'Getting back into lifting and looking for someone to explore new trails with.', split:'Push / pull / legs', days:['Tue','Thu','Sun'], gymIds:['gym-5']},
    sam: {name:'Sam', age:29, city:'Hamilton', bio:'Weekend hiking, early workouts, and a soft spot for terrible gym puns.', split:'Full body', days:['Tue','Sat'], gymIds:['gym-2']}
  };
  for (const id of ids) Object.assign(profiles[id], {id, intent:'Long-term relationship', interests:['Fitness','Outdoors'], gymVisibility:'private', dayVisibility:'private', paused:false, photos: id === 'alex' ? 6 : 3});
  profiles.alex.gymVisibility = 'discovery';
  profiles.alex.dayVisibility = 'discovery';
  return {version:1, profiles, preferences:{}, decisions:{}, matches:{}, excluded:{}, suggestions:[], reports:[]};
}

function project(state, viewer, subject) {
  const profile = state.profiles[subject];
  if (!profile || !state.profiles[viewer] || state.excluded[key(viewer, subject)]) return null;
  const matched = Boolean(state.matches[key(viewer, subject)]);
  if (viewer !== subject && profile.paused && !matched) return null;
  const {id,name,age,city,bio,split,intent,interests,photos,days,gymIds} = profile;
  return {id,name,age,city,bio,split,intent,interests:[...interests],photos,frequency:days.length,
    days: viewer === subject || canSee(profile.dayVisibility, matched) ? [...days] : [],
    gyms: viewer === subject || canSee(profile.gymVisibility, matched) ? gyms.filter(gym => gymIds.includes(gym.id)).map(({id,name,city})=>({id,name,city})) : []};
}

function deck(state, viewer) {
  if (!state.profiles[viewer] || state.profiles[viewer].paused) return [];
  const filter = state.preferences[viewer];
  return ids.filter(id => id !== viewer && !state.decisions[`${viewer}:${id}`] && !state.matches[key(viewer,id)])
    .map(id => project(state, viewer, id)).filter(profile => profile && (!filter || profile.city === filter));
}

function update(state, viewer, action) {
  if (!state.profiles[viewer]) fail('Choose a sample account.');
  const draft = structuredClone(state);
  const profile = draft.profiles[viewer];
  const target = action.target;
  const pair = key(viewer, target);
  let event = '';
  switch (action.type) {
    case 'profile': {
      const value = action.value;
      const name = short(value.name, 40);
      if (name.length < 2 || !cities.includes(value.city) || !workouts.includes(value.split)) fail('Enter a name, city and workout split.');
      if (!audiences.includes(value.gymVisibility) || !audiences.includes(value.dayVisibility)) fail('Choose who can see your training details.');
      const gymIds = [...new Set(value.gymIds)];
      if (gymIds.length > 10 || gymIds.some(id => !gyms.some(gym => gym.id === id))) fail('Select up to ten approved gyms.');
      Object.assign(profile, {name, city:value.city, split:value.split, bio:short(value.bio,500), intent:short(value.intent,80),
        interests:[...new Set(value.interests.map(item => short(item,32)).filter(Boolean))].slice(0,6),
        gymIds, days:weekdays.filter(day=>value.days.includes(day)), gymVisibility:value.gymVisibility,
        dayVisibility:value.dayVisibility, paused:Boolean(value.paused)});
      event = 'Profile saved.';
      break;
    }
    case 'filter':
      if (action.city && !cities.includes(action.city)) fail('Choose a supported city.');
      draft.preferences[viewer] = action.city || '';
      break;
    case 'decision': {
      if (!['like','pass'].includes(action.decision)) fail('Choose Like or Pass.');
      const decisionKey = `${viewer}:${target}`;
      if (!draft.decisions[decisionKey]) {
        if (!deck(state,viewer).some(candidate => candidate.id === target)) fail('This profile is no longer in your deck.');
        draft.decisions[decisionKey] = action.decision;
        if (action.decision === 'like' && draft.decisions[`${target}:${viewer}`] === 'like') {
          draft.matches[pair] = {members:[viewer,target], messages:[]};
          event = `You matched with ${draft.profiles[target].name}. Open Matches to say hello.`;
        }
      }
      break;
    }
    case 'message': {
      const match = draft.matches[pair];
      if (!match || draft.excluded[pair]) fail('This conversation is unavailable.');
      const body = short(action.body, 2000);
      if (!body || !action.id) fail('Enter a message.');
      if (!match.messages.some(message => message.sender === viewer && message.id === action.id)) {
        match.messages.push({id:action.id,sender:viewer,body,createdAt:action.createdAt});
      }
      break;
    }
    case 'unmatch':
    case 'block':
      if (target === viewer || !draft.profiles[target]) fail('Choose an available profile.');
      if (action.type === 'unmatch' && !draft.matches[pair]) fail('This match is unavailable.');
      draft.excluded[pair] = true;
      delete draft.matches[pair];
      event = action.type === 'block' ? 'Profile blocked.' : 'Match removed.';
      break;
    case 'suggest': {
      const name = short(action.name,80);
      const address = short(action.address,160);
      if (!name || !address || !cities.includes(action.city)) fail('Enter a gym name, address and city.');
      const signature = value => [value.name,value.address,value.city].map(part => part.toLowerCase().replace(/\s+/g,' ')).join('|');
      const candidate = {name,address,city:action.city,owner:viewer,status:'pending'};
      if (draft.suggestions.some(item => item.owner === viewer && signature(item) === signature(candidate))) fail('You already suggested that gym.');
      draft.suggestions.push(candidate);
      event = 'Gym suggestion saved for review.';
      break;
    }
    case 'report': {
      const reason = short(action.reason,500);
      if (viewer === target || !project(state,viewer,target) || !reason) fail('Enter a reason to report this profile.');
      draft.reports.push({reporter:viewer,subject:target,reason});
      event = 'Report saved in this demo.';
      break;
    }
    default: fail('Unknown action.');
  }
  return {state:draft,event};
}

export {cities, workouts, audiences, weekdays, gyms, ids, key, createDemo, project, deck, update};
