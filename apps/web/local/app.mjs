import {cities, workouts, audiences, weekdays, gyms, ids, key, createDemo, project, deck, update} from '../../../packages/domain/demo.mjs';

const storageKey = 'spotme-local-demo-v1';
const screen = document.querySelector('#screen');
const notice = document.querySelector('#notice');
const account = document.querySelector('#account');
const navigation = document.querySelector('#navigation');
let state = createDemo();
let viewer = 'alex';
let page = 'Discover';
let conversation = '';
let gymCity = '';
let persistent = true;
try {
  const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
  if (saved?.state?.version === 1 && ids.every(id => saved.state.profiles?.[id])) {
    state = saved.state;
    if (ids.includes(saved.viewer)) viewer = saved.viewer;
  }
} catch { persistent = false; }

function element(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name,value] of Object.entries(attrs)) {
    if (name.startsWith('on')) node.addEventListener(name.slice(2), value);
    else if (value === true) node.setAttribute(name,'');
    else if (value !== false && value != null) node.setAttribute(name,String(value));
  }
  node.append(...children.filter(child => child != null));
  return node;
}
const button = (label, onclick, className = '') => element('button',{type:'button',onclick,class:className},label);
const text = (label, className = '') => element('p',{class:className},label);
const panel = (...children) => element('div',{class:'panel stack'},...children);
const title = (label, extra) => element('div',{class:'title-row'},element('h1',{},label),extra);
const labels = {private:'Only me',matches:'My matches',discovery:'People in Discover'};
const select = (name, values, selected, label = value => value) => element('select',{name},...values.map(value => element('option',{value,selected:value === selected},label(value))));
const field = (label, input) => element('label',{class:'field'},label,input);
const check = (label, name, value, checked) => element('label',{class:'choice'},element('input',{type:'checkbox',name,value,checked}),element('span',{},label));
const submit = label => element('button',{type:'submit',class:'primary'},label);
const form = (handler, ...children) => element('form',{class:'stack',onsubmit:event => {event.preventDefault();handler(new FormData(event.currentTarget));}},...children);

function announce(message, error = false) {
  notice.hidden = !message;
  notice.classList.toggle('error',error);
  notice.textContent = message;
}
function save() {
  try {
    localStorage.setItem(storageKey,JSON.stringify({state,viewer}));
    persistent = true;
  } catch { persistent = false; }
  document.querySelector('.demo-note').textContent = `Local demo · Fictional profiles and gyms · ${persistent ? 'Saved in this browser' : 'Changes last until reload'}`;
}
function act(action, {rerender = true, focus, fallback = ''} = {}) {
  try {
    const result = update(state,viewer,action);
    state = result.state;
    save();
    if (rerender) render(focus);
    announce([result.event || fallback,!persistent ? 'Browser storage is unavailable.' : ''].filter(Boolean).join(' '));
    return true;
  } catch (error) { announce(error.message,true); return false; }
}
function navigate(next) {
  page = next;
  conversation = '';
  announce('');
  render('h1');
}
function render(focus) {
  account.replaceChildren(...ids.map(id => element('option',{value:id,selected:id === viewer},state.profiles[id].name)));
  navigation.replaceChildren(...['Discover','Matches','My profile','Gyms'].map(label => {
    const item = button(label,() => navigate(label));
    if (label === page) item.setAttribute('aria-current','page');
    return item;
  }));
  const view = {Discover:showDiscover,Matches:showMatches,'My profile':showProfile,Gyms:showGyms}[page]();
  screen.replaceChildren(view);
  if (focus) {
    const target = screen.querySelector(focus) ?? screen.querySelector('h1');
    if (target && !target.matches('button,input,select,textarea,[tabindex]')) target.setAttribute('tabindex','-1');
    target?.focus({preventScroll:true});
  }
}

function cardSection(label, description, chips = []) {
  return element('section',{class:'card-section'},element('h3',{},label),description ? text(description) : null,
    chips.length ? element('div',{class:'chips'},...chips.map(item => element('span',{},item))) : null);
}
function safety(target, inMatch = false) {
  const report = form(data => act({type:'report',target,reason:data.get('reason')},{focus:'h1'}),
    field('Report reason',element('textarea',{name:'reason',required:true,maxlength:500})),submit('Save report'));
  return element('details',{class:'card-section'},element('summary',{},'Report or block'),report,
    element('div',{class:'row'},inMatch ? button('Unmatch',() => act({type:'unmatch',target},{focus:'h1'}),'danger') : null,
      button('Block profile',() => act({type:'block',target},{focus:'h1'}),'danger')));
}
function showDiscover() {
  const city = state.preferences[viewer] ?? '';
  const filter = select('city',['',...cities],city,value => value || 'All sample cities');
  filter.addEventListener('change',() => act({type:'filter',city:filter.value},{focus:'select[name=city]'}));
  const header = title('Discover',field('City',filter));
  const candidate = deck(state,viewer)[0];
  if (!candidate) return element('div',{class:'screen discover'},header,panel(element('h2',{},state.profiles[viewer].paused ? 'Discovery is paused' : 'No new profiles'),text(state.profiles[viewer].paused ? 'Resume discovery in My profile to see the deck.' : 'Try another city or switch sample accounts.')));

  const decide = decision => act({type:'decision',target:candidate.id,decision},{focus:'.card-body',fallback:`${decision === 'like' ? 'Liked' : 'Passed on'} ${candidate.name}.`});
  const initials = candidate.name.split(/\s+/).slice(0,2).map(word=>word[0]).join('').toUpperCase();
  const label = element('span',{class:'photo-label','aria-live':'polite'});
  const palette = ['#e6eef9','#e9eef3','#e9f1ef','#f1ebf6','#f2ede7','#e8eff5'];
  let index = 0;
  const previous = button('‹',() => setPhoto(index-1),'prev');
  previous.setAttribute('aria-label','Previous photo');
  const next = button('›',() => setPhoto(index+1),'next');
  next.setAttribute('aria-label','Next photo');
  const portrait = element('div',{class:'portrait'},element('strong',{'aria-hidden':'true'},initials),previous,next,label);
  function setPhoto(position) {
    index = Math.max(0,Math.min(candidate.photos-1,position));
    portrait.style.backgroundColor = palette[index];
    label.textContent = `Photo placeholder ${index+1} of ${candidate.photos}`;
    previous.disabled = index === 0;
    next.disabled = index === candidate.photos-1;
  }
  setPhoto(0);
  const body = element('article',{class:'card-body',tabindex:0,'aria-label':`${candidate.name}’s scrollable profile`},portrait,
    element('section',{class:'card-section'},element('h2',{},`${candidate.name}, ${candidate.age}`),text(candidate.city,'quiet')),
    cardSection('About me',candidate.bio),cardSection('Looking for',candidate.intent),
    cardSection('Training split',`${candidate.split} · ${candidate.frequency} days a week`),
    candidate.days.length ? cardSection('Typical week','',candidate.days) : null,
    candidate.gyms.length ? cardSection('Where I train','',candidate.gyms.map(gym=>gym.name)) : null,
    cardSection('Interests','',candidate.interests),safety(candidate.id));
  wireSwipe(body,decide);
  return element('div',{class:'screen discover'},header,element('div',{class:'card'},body,
    element('div',{class:'actions'},button('Pass',()=>decide('pass')),button('Like',()=>decide('like'),'primary'))));
}

function wireSwipe(body, decide) {
  let gesture;
  body.addEventListener('pointerdown',event => {
    if (!event.isPrimary || event.button !== 0 || event.target.closest('button,input,select,textarea,summary,label,a')) return;
    gesture = {id:event.pointerId,x:event.clientX,y:event.clientY,direction:''};
  });
  body.addEventListener('pointermove',event => {
    if (!gesture || gesture.id !== event.pointerId || gesture.direction) return;
    const x = Math.abs(event.clientX-gesture.x), y = Math.abs(event.clientY-gesture.y);
    if (Math.max(x,y) >= 12) gesture.direction = x > 1.6*y ? 'horizontal' : 'vertical';
  });
  body.addEventListener('pointerup',event => {
    if (!gesture || gesture.id !== event.pointerId) return;
    const {x,y,direction} = gesture;
    gesture = undefined;
    const distance = event.clientX-x;
    if (direction === 'horizontal' && Math.abs(distance) >= 70 && Math.abs(distance) > 1.6*Math.abs(event.clientY-y) && !window.getSelection()?.toString()) decide(distance > 0 ? 'like' : 'pass');
  });
  body.addEventListener('pointercancel',()=>{gesture = undefined;});
  body.addEventListener('pointerleave',event=>{if (event.pointerType === 'mouse') gesture = undefined;});
}

function showProfile() {
  const p = state.profiles[viewer];
  const profileForm = form(data => act({type:'profile',value:{
    name:data.get('name'),city:data.get('city'),bio:data.get('bio'),intent:data.get('intent'),split:data.get('split'),
    interests:data.get('interests').split(','),days:data.getAll('days'),gymIds:p.gymIds,
    gymVisibility:data.get('gymVisibility'),dayVisibility:data.get('dayVisibility'),paused:data.has('paused')
  }},{focus:'h1'}),
    element('div',{class:'two'},field('Display name',element('input',{name:'name',value:p.name,required:true,minlength:2,maxlength:40})),field('City',select('city',cities,p.city))),
    field('Bio',element('textarea',{name:'bio',maxlength:500},p.bio)),field('Looking for',element('input',{name:'intent',value:p.intent,maxlength:80})),
    field('Interests, separated by commas',element('input',{name:'interests',value:p.interests.join(', '),maxlength:198})),
    field('Workout split',select('split',workouts,p.split)),
    element('fieldset',{},element('legend',{},'Typical training days'),element('div',{class:'row'},...weekdays.map(day=>check(day,'days',day,p.days.includes(day))))),
    element('div',{class:'two'},field('Who sees training days',select('dayVisibility',audiences,p.dayVisibility,value=>labels[value])),field('Who sees gyms',select('gymVisibility',audiences,p.gymVisibility,value=>labels[value]))),
    check('Pause discovery','paused','yes',p.paused),submit('Save profile'));
  return element('div',{class:'screen'},title('My profile'),panel(profileForm));
}

function showGyms() {
  const p = state.profiles[viewer];
  const chosen = new Set(p.gymIds);
  const city = select('city',['',...cities],gymCity,value=>value || 'All sample cities');
  const list = element('div',{});
  const picked = element('p',{class:'quiet'});
  function showOptions() {
    picked.textContent = `${chosen.size} selected across all cities`;
    list.replaceChildren(...gyms.filter(gym=>!city.value || gym.city === city.value).map(gym=>{
      const option = check(`${gym.name} · ${gym.city}`,'gyms',gym.id,chosen.has(gym.id));
      option.querySelector('input').addEventListener('change',event=>{
        if (event.target.checked) chosen.add(gym.id); else chosen.delete(gym.id);
        picked.textContent = `${chosen.size} selected across all cities`;
      });
      return option;
    }));
  }
  city.addEventListener('change',()=>{gymCity = city.value;showOptions();});
  showOptions();
  const selections = form(()=>act({type:'profile',value:{...p,gymIds:[...chosen]}},{focus:'h1'}),field('Browse by city',city),list,picked,submit('Save gyms'));
  const suggestion = form(data=>act({type:'suggest',name:data.get('name'),address:data.get('address'),city:data.get('city')},{focus:'h1'}),
    field('Gym name',element('input',{name:'name',required:true,maxlength:80})),field('Street address',element('input',{name:'address',required:true,maxlength:160})),
    field('City',select('city',cities,p.city)),submit('Suggest gym'));
  const pending = state.suggestions.filter(item=>item.owner === viewer);
  return element('div',{class:'screen stack'},title('Gyms'),panel(selections),panel(element('h2',{},'Suggest a missing gym'),suggestion,
    ...pending.map(item=>text(`${item.name} · ${item.city} · Pending review`,'quiet'))));
}

function showMatches() {
  const entries = Object.values(state.matches).filter(match=>match.members.includes(viewer));
  const match = state.matches[key(viewer,conversation)];
  const other = match && project(state,viewer,conversation);
  if (!other) {
    const cards = entries.map(item=>{
      const target = item.members.find(id=>id !== viewer);
      const person = project(state,viewer,target);
      return element('div',{class:'person-row'},element('strong',{},person.name),button(`Message ${person.name}`,()=>{conversation = target;render('h1');}));
    });
    return element('div',{class:'screen stack'},title('Matches'),...(cards.length ? cards : [panel(text('When two people like each other, their match appears here.'))]));
  }
  const history = element('div',{class:'messages','aria-label':'Message history'},...match.messages.map(message=>element('p',{class:`bubble${message.sender === viewer ? ' own' : ''}`},`${state.profiles[message.sender].name}: ${message.body}`)));
  if (!match.messages.length) history.append(text('Say hello to start the conversation.','quiet'));
  const messageForm = form(data=>act({type:'message',target:conversation,body:data.get('message'),id:crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,createdAt:new Date().toISOString()},{focus:'textarea[name=message]',fallback:'Message sent.'}),
    field('Message',element('textarea',{name:'message',required:true,maxlength:2000})),submit('Send message'));
  const shared = other.days.length || other.gyms.length ? panel(
    element('h2',{},'Shared training details'),other.days.length ? text(`Training days: ${other.days.join(', ')}`) : null,
    other.gyms.length ? text(`Gyms: ${other.gyms.map(gym=>gym.name).join(', ')}`) : null) : null;
  return element('div',{class:'screen stack'},title(other.name,button('All matches',()=>{conversation = '';render('h1');})),shared,panel(history,messageForm),panel(safety(conversation,true)));
}

account.addEventListener('change',()=>{
  viewer = account.value;
  gymCity = '';
  save();
  navigate('Discover');
});
window.addEventListener('storage',event=>{
  if (event.key !== storageKey || !event.newValue) return;
  try {
    const saved = JSON.parse(event.newValue);
    if (saved.state?.version !== 1) return;
    state = saved.state;
    render();
    announce('Demo data updated from another tab.');
  } catch { /* Ignore malformed storage from another page. */ }
});
render();
