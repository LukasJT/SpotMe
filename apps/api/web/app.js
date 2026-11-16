'use strict';
const $ = id => document.getElementById(id);
const signIn = $('credentials');
const compose = $('compose');
let matchCursor = '', messageCursor = '0', current = null, retry = null;
let sessionVersion = 0, matchVersion = 0, chatVersion = 0;
let closing = false;

function status(message = '', error = false) {
  $('notice').textContent = message;
  $('notice').classList.toggle('error',error);
}

async function api(path, {method = 'GET', data} = {}) {
  const options = {method,cache:'no-store',credentials:'same-origin'};
  if (data !== undefined) {
    options.headers = {'content-type':'application/json'};
    options.body = JSON.stringify(data);
  }
  let response;
  try { response = await fetch(path,options); }
  catch { throw new Error('Could not reach SpotMe. Try again.'); }
  if (!response.ok) {
    const error = new Error({401:'Sign in to continue.',404:'This conversation is no longer available.',
      422:'Check your message and try again.',429:'Too many attempts. Try again in a minute.',
      503:'SpotMe is temporarily unavailable. Try again.'}[response.status] ?? 'Something went wrong. Try again.');
    error.status = response.status;
    try { error.code = (await response.json()).error; } catch {}
    throw error;
  }
  return response.status === 204 ? null : response.json();
}

function hideConfirmation() {
  $('confirm').hidden = true;
  $('confirm-action').onclick = null;
}
function clearConversation() {
  chatVersion++;
  current = null;
  retry = null;
  compose.reset();
  $('conversation').hidden = true;
  $('conversation-title').textContent = '';
  $('messages').replaceChildren();
  $('conversation-report').replaceChildren();
  messageCursor = '0';
  $('more-messages').hidden = true;
  $('conversation').querySelector('details').open = false;
  hideConfirmation();
}
function showAuth(message = '') {
  sessionVersion++;
  clearConversation();
  $('matches').replaceChildren();
  $('more-matches').hidden = true;
  $('workspace').hidden = true;
  $('sign-out').hidden = true;
  $('auth').hidden = false;
  activeTab='matches';
  memberVersion++;
  gymVersion++;
  deckVersion++;
  candidates=[];
  selectedGyms.clear();
  editor.reset();
  $('register-form').reset();
  $('confirm-email-form').reset();
  $('suggest-gym').reset();
  for(const id of ['selected-gyms','gym-results','live-card','profile-state']) $(id).replaceChildren();
  $('member-profile').hidden=true;
  $('discovery').hidden=true;
  $('match-panel').hidden=false;
  $('premium').hidden=true;
  resetPremium();
  for(const tab of ['discover','profile','matches','premium']) $('tab-'+tab).setAttribute('aria-current',String(tab==='matches'));
  status(message);
}
function showWorkspace() {
  $('auth').hidden = true;
  $('workspace').hidden = false;
  $('sign-out').hidden = false;
}
function requestFailed(error) {
  if (error.status === 401) showAuth(error.message);
  else status(error.message,true);
}

async function loadMatches(more = false) {
  const version = ++matchVersion;
  const session = sessionVersion;
  const list = $('matches');
  try {
    const query = more ? `?after=${encodeURIComponent(matchCursor)}` : '';
    const {matches} = await api(`/v1/matches${query}`);
    if (version !== matchVersion || session !== sessionVersion) return;
    showWorkspace();
    if (!returnHandled&&['returned','cancelled'].includes(premiumReturn)&&activeTab==='matches') openTab('premium');
    if (!more) {
      list.replaceChildren();
      matchCursor = '';
      if (!matches.length) {
        const empty = document.createElement('p');
        empty.className = 'subtle';
        empty.textContent = 'Your matches will appear here.';
        list.append(empty);
      }
    }
    for (const match of matches) {
      const item = document.createElement('button');
      item.textContent = match.display_name;
      item.dataset.peer = match.peer_id;
      item.setAttribute('aria-current',String(current?.peer_id === match.peer_id));
      item.addEventListener('click',()=>openConversation(match));
      list.append(item);
      matchCursor = match.peer_id;
    }
    $('more-matches').hidden = matches.length !== 30;
  } catch (error) {
    if (version === matchVersion && session === sessionVersion) requestFailed(error);
  }
}

function messagesPath(peer = current.peer_id) {
  return `/v1/matches/${encodeURIComponent(peer)}/messages`;
}

async function loadMessages() {
  if (!current) return;
  const version = ++chatVersion;
  try {
    const {messages} = await api(`${messagesPath()}?after=${messageCursor}`);
    if (version !== chatVersion || !current) return;
    const list = $('messages');
    for (const message of messages) {
      const item = document.createElement('p');
      item.className = 'message';
      const sender = document.createElement('strong');
      sender.textContent = message.sender_id === current.peer_id ? current.display_name : 'You';
      item.append(sender,document.createElement('br'),document.createTextNode(message.body));
      list.append(item);
      messageCursor = message.id;
    }
    if (messages.length) list.scrollTop = list.scrollHeight;
    $('more-messages').hidden = messages.length !== 30;
  } catch (error) {
    if (version !== chatVersion) return;
    if (error.status === 404) {
      clearConversation();
      void loadMatches();
    }
    requestFailed(error);
  }
}
function openConversation(match) {
  if (closing) return;
  if (current?.peer_id === match.peer_id) { void loadMessages(); return; }
  clearConversation();
  current = match;
  for (const item of $('matches').querySelectorAll('button')) item.setAttribute('aria-current',String(item.dataset.peer === match.peer_id));
  $('conversation').hidden = false;
  $('conversation-title').textContent = match.display_name;
  $('conversation-report').append(reportForm(match.peer_id));
  $('conversation-title').focus();
  status('');
  void loadMessages();
}

signIn.addEventListener('submit',async event => {
  event.preventDefault();
  const button = signIn.querySelector('button');
  if (button.disabled) return;
  const data = new FormData(signIn);
  button.disabled = true;
  status('Signing in…');
  try {
    await api('/browser/sign-in',{method:'POST',data:{email:data.get('email'),password:data.get('password')}});
    signIn.reset();
    status();
    await loadMatches();
  } catch (error) {
    signIn.elements.password.value = '';
    status(error.status === 401 ? 'Could not sign in. Check your email and password.' : error.message,true);
  } finally { button.disabled = false; }
});

for (const [id,path] of [['register-form','sign-up'],['confirm-email-form','confirm-email']]) {
  const form=$(id);
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    const button=form.querySelector('button');
    if (button.disabled) return;
    const data=Object.fromEntries(new FormData(form));
    button.disabled=true;
    try {
      await api('/browser/'+path,{method:'POST',data});
      form.reset();
      if (path==='sign-up') {
        $('confirm-email-panel').open=true;
        $('confirm-email-form').elements.email.value=data.email;
        $('confirm-email-form').elements.code.focus();
        status('If this address can register, check your inbox for a confirmation code.');
      } else {
        $('confirm-email-panel').open=false;
        signIn.elements.email.value=data.email;
        signIn.elements.password.focus();
        status('Email confirmed. Sign in to set up your profile.');
      }
    } catch (error) {
      const message=error.status===422 ? (path==='sign-up' ? 'Check your email and choose a password that meets the requirements.' : 'That code could not be verified. Check your email and code.') : error.message;
      status(message,true);
    } finally {
      if (path==='sign-up') form.elements.password.value='';
      button.disabled=false;
    }
  });
}

$('sign-out').addEventListener('click',async () => {
  $('sign-out').disabled = true;
  try { await api('/browser/sign-out',{method:'POST'}); showAuth(); }
  catch (error) { requestFailed(error); }
  finally { $('sign-out').disabled = false; }
});

compose.addEventListener('submit',async event => {
  event.preventDefault();
  const button = compose.querySelector('button');
  if (!current || closing || button.disabled) return;
  const peer = current.peer_id;
  const session = sessionVersion;
  const input = compose.elements.body;
  const body = input.value.trim();
  if (!body) { status('Enter a message.',true); return; }
  if (retry?.peer !== peer || retry.body !== body) retry = {peer,body,id:crypto.randomUUID()};
  button.disabled = true;
  input.disabled = true;
  try {
    await api(messagesPath(peer),{method:'POST',data:{body,client_message_id:retry.id}});
    if (current?.peer_id === peer && session === sessionVersion) {
      compose.reset();
      retry = null;
      status('Message sent.');
      await loadMessages();
    }
  } catch (error) {
    if (session !== sessionVersion) return;
    if (error.status === 404 && current?.peer_id === peer) { clearConversation(); void loadMatches(); }
    requestFailed(error);
  } finally { button.disabled = false; input.disabled = false; }
});

function confirmClose(block) {
  if (!current || closing) return;
  const {peer_id:peer,display_name:name} = current;
  const action = block ? 'Block' : 'Unmatch';
  $('confirm-text').textContent = block ? `Block ${name}? This will close your conversation.` : `Unmatch with ${name}? This will close your conversation.`;
  $('confirm').hidden = false;
  const button = $('confirm-action');
  button.textContent = action;
  button.focus();
  button.onclick = async () => {
    if (closing || current?.peer_id !== peer) return;
    closing = true;
    button.disabled = true;
    const path = block ? `/v1/blocks/${encodeURIComponent(peer)}` : `/v1/matches/${encodeURIComponent(peer)}/unmatch`;
    try {
      await api(path,{method:'POST'});
      clearConversation();
      status(block ? 'Profile blocked.' : 'Match removed.');
      await loadMatches();
    } catch (error) { requestFailed(error); }
    finally { closing = false; button.disabled = false; }
  };
}

$('refresh-matches').addEventListener('click',()=>loadMatches());
$('more-matches').addEventListener('click',()=>loadMatches(true));
$('refresh-chat').addEventListener('click',()=>loadMessages());
$('more-messages').addEventListener('click',()=>loadMessages());
$('block').addEventListener('click',()=>confirmClose(true));
$('unmatch').addEventListener('click',()=>confirmClose(false));
$('cancel').addEventListener('click',hideConfirmation);
const dayLabels = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const genders = {woman:'Women',man:'Men',nonbinary:'Nonbinary people',another_identity:'Another identity'};
const visibility = {private:'Only me',matches:'My matches',discovery:'People in Discover'};
const editor = $('profile-form');
const selectedGyms = new Map();
let activeTab = 'matches', memberVersion = 0, gymVersion = 0, deckVersion = 0;
let gymAfter = '', gymQuery = null, candidates = [], deckAfter = '', lastPage = true, swipeBusy = false;

function option(value,label) {
  const item=document.createElement('option');
  item.value=value;
  item.textContent=label;
  return item;
}
function control(label,fn) {
  const item=document.createElement('button');
  item.type='button';
  item.textContent=label;
  item.addEventListener('click',fn);
  return item;
}
function setupChoices(id,name,entries) {
  for (const [value,title] of entries) {
    const label=document.createElement('label');
    label.className='choice';
    const input=document.createElement('input');
    input.type='checkbox';
    input.name=name;
    input.value=value;
    label.append(input,document.createTextNode(title));
    $(id).append(label);
  }
}
setupChoices('weekdays','days',dayLabels.map((day,index)=>[index+1,day]));
setupChoices('seeking','seeking',Object.entries(genders));

function openTab(tab) {
  memberVersion++;
  gymVersion++;
  deckVersion++;
  activeTab=tab;
  clearConversation();
  for (const item of ['discover','profile','matches','premium']) $('tab-'+item).setAttribute('aria-current',String(item===tab));
  $('match-panel').hidden=tab!=='matches';
  $('member-profile').hidden=tab!=='profile';
  $('discovery').hidden=tab!=='discover';
  $('premium').hidden=tab!=='premium';
  if (tab==='premium') void refreshPremium();
  status('');
  if (tab==='profile') void loadEditor();
  if (tab==='discover') void refreshDeck();
  if (tab==='matches') void loadMatches();
}

function renderGyms() {
  const list=$('selected-gyms');
  list.replaceChildren();
  if (!selectedGyms.size) list.textContent='No gyms selected.';
  for (const gym of selectedGyms.values()) {
    const row=document.createElement('div');
    row.className='selected-gym';
    const label=document.createElement('label');
    label.append(document.createTextNode(gym.name));
    const select=document.createElement('select');
    select.replaceChildren(...Object.entries(visibility).map(([value,name])=>option(value,name)));
    select.value=gym.audience;
    select.addEventListener('change',()=>{gym.audience=select.value;});
    label.append(select);
    row.append(label,control('Remove '+gym.name,()=>{selectedGyms.delete(gym.id);renderGyms();}));
    list.append(row);
  }
}
async function loadEditor() {
  const version=++memberVersion, session=sessionVersion;
  editor.hidden=true;
  $('profile-state').textContent='Loading profile…';
  try {
    const [{profile},{cities}]=await Promise.all([api('/v1/me/profile'),api('/v1/cities')]);
    if (version!==memberVersion || session!==sessionVersion) return;
    editor.reset();
    selectedGyms.clear();
    $('gym-results').replaceChildren();
    $('more-gyms').hidden=true;
    const cityOptions=()=>cities.map(city=>option(city.id,`${city.name}, ${city.province}`));
    editor.elements.city_id.replaceChildren(option('','Choose a city'),...cityOptions());
    $('gym-city').replaceChildren(option('','Choose a city'),...cityOptions());
    $('suggest-gym').elements.city_id.replaceChildren(option('','Choose a city'),...cityOptions());
    editor.elements.date_of_birth.readOnly=Boolean(profile);
    if (profile) {
      for (const key of ['name','date_of_birth','city_id','bio','intent','split','days_audience','gender','minimum_age','maximum_age']) {
        if (profile[key]!==null) editor.elements[key].value=profile[key];
      }
      for (const input of editor.querySelectorAll('input[name="days"], input[name="seeking"]')) {
        input.checked=input.name==='days'?profile.days.includes(Number(input.value)):profile.seeking.includes(input.value);
      }
      editor.elements.paused.checked=profile.status==='paused';
      $('gym-city').value=profile.city_id??'';
      $('suggest-gym').elements.city_id.value=profile.city_id??'';
      for (const gym of profile.gyms) selectedGyms.set(gym.id,gym);
    }
    $('profile-state').textContent=profile?.status==='active'?'Your profile is active.':profile?.status==='paused'?'Discovery is paused.':
      profile?.status==='suspended'||profile?.status==='deletion_pending'?'Your profile is unavailable.':'Save your profile to finish this step. Discovery opens after approval.';
    renderGyms();
    editor.hidden=false;
    const visible=$('gym-search-visible');
    visible.disabled=true;
    if (profile) {
      const visibility=await api('/v1/me/gym-search');
      if (version!==memberVersion || session!==sessionVersion) return;
      visible.checked=visibility.visible;
      visible.disabled=false;
    }
  } catch (error) { if (version===memberVersion && session===sessionVersion) requestFailed(error); }
}

editor.addEventListener('submit',async event=>{
  event.preventDefault();
  const button=editor.querySelector('button[type="submit"]');
  if (button.disabled) return;
  const session=sessionVersion;
  const data=new FormData(editor);
  const value=Object.fromEntries(['name','date_of_birth','city_id','bio','intent','split','days_audience','gender'].map(key=>[key,data.get(key)]));
  Object.assign(value,{days:data.getAll('days').map(Number),seeking:data.getAll('seeking'),minimum_age:Number(data.get('minimum_age')),
    maximum_age:Number(data.get('maximum_age')),paused:data.has('paused'),gyms:[...selectedGyms.values()].map(({id,audience})=>({id,audience}))});
  button.disabled=true;
  try {
    await api('/v1/me/profile',{method:'PUT',data:value});
    if (session===sessionVersion && activeTab==='profile') {status('Profile saved.');await loadEditor();}
  } catch (error) { if(session===sessionVersion) requestFailed(error); }
  finally {button.disabled=false;}
});

async function findGyms(more=false) {
  const version=++gymVersion, session=sessionVersion;
  if (!more) {
    gymAfter='';
    gymQuery={city:$('gym-city').value,q:$('gym-search').value.trim()};
    $('gym-results').replaceChildren();
  }
  if (!gymQuery?.city) {status('Choose a gym city.',true);return;}
  const query=new URLSearchParams(gymQuery);
  if (gymAfter) query.set('after',gymAfter);
  try {
    const {gyms}=await api(`/v1/gyms?${query}`);
    if (version!==gymVersion || session!==sessionVersion) return;
    if (!gyms.length && !more) $('gym-results').textContent='No gyms found.';
    for (const gym of gyms) {
      const row=control(`${gym.name} · ${gym.street_address}`,()=>{
        if (selectedGyms.size>=10 && !selectedGyms.has(gym.id)) {status('Select up to ten gyms.',true);return;}
        if (!selectedGyms.has(gym.id)) selectedGyms.set(gym.id,{id:gym.id,name:gym.name,audience:'private'});
        renderGyms();status('Gym selected. Save your profile to keep it.');
      });
      $('gym-results').append(row);
      gymAfter=gym.id;
    }
    $('more-gyms').hidden=gyms.length!==30;
  } catch (error) { if (version===gymVersion && session===sessionVersion) requestFailed(error); }
}
$('find-gyms').addEventListener('click',()=>findGyms());
$('more-gyms').addEventListener('click',()=>findGyms(true));
$('suggest-gym').addEventListener('submit',async event=>{
  event.preventDefault();
  const form=event.currentTarget, button=form.querySelector('button');
  if (button.disabled) return;
  const session=sessionVersion;
  button.disabled=true;
  try {
    await api('/v1/gym-submissions',{method:'POST',data:Object.fromEntries(new FormData(form))});
    if (session===sessionVersion) {form.reset();status('Gym suggestion submitted for review.');}
  } catch (error) { if (session===sessionVersion) requestFailed(error); }
  finally {button.disabled=false;}
});

function cardText(target,heading,copy) {
  if (!copy) return;
  const part=document.createElement('section'), title=document.createElement('h3'), text=document.createElement('p');
  title.textContent=heading;
  text.textContent=copy;
  part.append(title,text);
  target.append(part);
}
function reportForm(peer) {
  const details=document.createElement('details'), summary=document.createElement('summary'), form=document.createElement('form');
  summary.textContent='Report profile';
  const reasonLabel=document.createElement('label'), reason=document.createElement('select');
  reasonLabel.append(document.createTextNode('Reason'),reason);
  reason.replaceChildren(...Object.entries({harassment:'Harassment',impersonation:'Impersonation',underage:'Suspected underage',spam:'Spam',other:'Other'}).map(([key,label])=>option(key,label)));
  const textLabel=document.createElement('label'), input=document.createElement('textarea');
  input.maxLength=500;
  input.rows=2;
  textLabel.append(document.createTextNode('Details (optional)'),input);
  const send=document.createElement('button');
  send.textContent='Submit report';
  form.append(reasonLabel,textLabel,send);
  details.append(summary,form);
  let pending;
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(send.disabled)return;
    const session=sessionVersion, content=input.value.trim();
    if(pending?.reason!==reason.value||pending?.details!==content) pending={peer_id:peer,reason:reason.value,details:content,client_report_id:crypto.randomUUID()};
    send.disabled=true;
    try {
      await api('/v1/reports',{method:'POST',data:pending});
      if(session===sessionVersion&&form.isConnected){pending=null;form.reset();details.open=false;status('Report submitted.');}
    } catch(error) {if(session===sessionVersion&&form.isConnected)requestFailed(error);}
    finally {send.disabled=false;}
  });
  return details;
}
function renderCard() {
  const area=$('live-card'), card=candidates[0];
  area.replaceChildren();
  $('swipe-actions').hidden=!card;
  if (!card) {area.textContent='No more profiles here right now.';return;}
  const photo=document.createElement('div');
  photo.className='portrait';
  photo.setAttribute('aria-hidden','true');
  photo.textContent=card.name.split(/\s+/).slice(0,2).map(word=>[...word][0]).join('').toUpperCase();
  area.append(photo);
  cardText(area,`${card.name}, ${card.age}`,card.city);
  cardText(area,'About me',card.bio);
  cardText(area,'Looking for',card.intent);
  cardText(area,'Training',[card.split,card.frequency==null?'':`${card.frequency} days a week`].filter(Boolean).join(' · '));
  cardText(area,'Typical week',card.days.map(day=>dayLabels[day-1]).join(', '));
  cardText(area,'Where I train',card.gyms.join(', '));
  const safety=document.createElement('details'),summary=document.createElement('summary');
  summary.textContent='Safety';
  const block=control('Block '+card.name,()=>{
    block.replaceWith(control('Confirm block',()=>void decideCard('block')));
  });
  safety.append(summary,reportForm(card.id),block);
  area.append(safety);
  area.scrollTop=0;
}
async function refreshDeck(continuePage=false) {
  const version=++deckVersion, session=sessionVersion;
  if (!continuePage) {candidates=[];deckAfter='';lastPage=false;}
  $('swipe-actions').hidden=true;
  $('live-card').textContent='Loading profiles…';
  try {
    const {cards}=await api('/v1/discovery'+(deckAfter?`?after=${encodeURIComponent(deckAfter)}`:''));
    if(version!==deckVersion||session!==sessionVersion)return;
    candidates=cards;
    deckAfter=cards.at(-1)?.id??deckAfter;
    lastPage=cards.length!==20;
    renderCard();
  } catch(error){if(version===deckVersion&&session===sessionVersion){$('live-card').textContent='Could not load profiles.';requestFailed(error);}}
}
async function decideCard(decision) {
  if(swipeBusy||!candidates[0])return;
  const version=deckVersion,session=sessionVersion,peer=candidates[0].id;
  swipeBusy=true;
  $('pass').disabled=$('like').disabled=$('refresh-deck').disabled=true;
  try {
    const result=decision==='block' ? await api(`/v1/blocks/${encodeURIComponent(peer)}`,{method:'POST'}) :
      await api('/v1/swipes',{method:'POST',data:{peer_id:peer,decision}});
    if(version!==deckVersion||session!==sessionVersion)return;
    candidates.shift();
    status(result?.matched?'You matched! Open Matches to say hello.':decision==='block'?'Profile blocked.':'');
    if(!candidates.length&&!lastPage)await refreshDeck(true);
    else renderCard();
    $('live-card').focus({preventScroll:true});
  } catch(error){if(version===deckVersion&&session===sessionVersion){requestFailed(error);}}
  finally {swipeBusy=false;$('pass').disabled=$('like').disabled=$('refresh-deck').disabled=false;}
}
$('refresh-deck').addEventListener('click',()=>refreshDeck());
$('pass').addEventListener('click',()=>decideCard('pass'));
$('like').addEventListener('click',()=>decideCard('like'));
for(const tab of ['discover','profile','matches','premium']) $('tab-'+tab).addEventListener('click',()=>openTab(tab));
$('tab-matches').setAttribute('aria-current','true');

let liveGesture;
const liveCard=$('live-card');
liveCard.addEventListener('pointerdown',event=>{
  if(!event.isPrimary||event.button!==0||event.target.closest('button,details,summary,a,input'))return;
  liveGesture={id:event.pointerId,x:event.clientX,y:event.clientY,direction:''};
});
liveCard.addEventListener('pointermove',event=>{
  if(!liveGesture||event.pointerId!==liveGesture.id||liveGesture.direction)return;
  const x=Math.abs(event.clientX-liveGesture.x),y=Math.abs(event.clientY-liveGesture.y);
  if(Math.max(x,y)>=12)liveGesture.direction=x>1.6*y?'horizontal':'vertical';
});
liveCard.addEventListener('pointerup',event=>{
  if(!liveGesture||event.pointerId!==liveGesture.id)return;
  const {x,y,direction}=liveGesture;
  liveGesture=undefined;
  const dx=event.clientX-x;
  if(direction==='horizontal'&&Math.abs(dx)>=70&&Math.abs(dx)>1.6*Math.abs(event.clientY-y)&&!window.getSelection()?.toString())void decideCard(dx>0?'like':'pass');
});
liveCard.addEventListener('pointercancel',()=>{liveGesture=undefined;});
liveCard.addEventListener('pointerleave',event=>{if(event.pointerType==='mouse')liveGesture=undefined;});
$('gym-search-visible').addEventListener('change',async event=>{
  const input=event.target, visible=input.checked, version=memberVersion, session=sessionVersion;
  input.disabled=true;
  try {
    await api('/v1/me/gym-search',{method:'PUT',data:{visible}});
    if(version===memberVersion&&session===sessionVersion) status('Gym search visibility updated.');
  } catch(error) {
    if(version===memberVersion&&session===sessionVersion){input.checked=!visible;requestFailed(error);}
  } finally {if(version===memberVersion&&session===sessionVersion)input.disabled=false;}
});

const premiumReturn=new URLSearchParams(location.search).get('premium');
let returnHandled=false, premiumVersion=0, directoryVersion=0, cardsVersion=0;
let premiumGym='', premiumDirectory, gymFilters, premiumDirectoryAfter='', premiumCardAfter='';
const premiumCurrent=session=>session===sessionVersion&&activeTab==='premium';
function resetPremium() {
  premiumVersion++;directoryVersion++;cardsVersion++;
  premiumGym='';premiumDirectory=null;gymFilters=null;premiumDirectoryAfter='';premiumCardAfter='';
  for(const id of ['premium-gyms','premium-cards','premium-gym-name','premium-state','premium-directory-state']) $(id).replaceChildren();
  for(const id of ['premium-browser','premium-more-gyms','premium-filter','premium-more-cards','premium-plans','premium-terms','premium-manage','premium-cancel']) $(id).hidden=true;
  $('premium-directory').reset();
  $('premium-filter').reset();
}
async function refreshPremium(attempt=0) {
  const session=sessionVersion,version=++premiumVersion;
  const current=()=>premiumCurrent(session)&&version===premiumVersion;
  try {
    const {active,webCheckout,webCustomer}=await api('/v1/me/premium');
    if(!current())return;
    $('premium-plans').hidden=active||!webCheckout;
    $('premium-terms').hidden=active||!webCheckout;
    $('premium-manage').hidden=!webCustomer;
    $('premium-cancel').hidden=active||!webCustomer;
    $('premium-browser').hidden=!active;
    const waiting=premiumReturn==='returned'&&!returnHandled&&!active;
    $('premium-state').textContent=active?'Premium is active on your SpotMe account.':waiting?'Waiting for payment confirmation. You can refresh access at any time.':
      webCheckout?'Choose a subscription to unlock gym search.':'Web checkout isn’t available right now.';
    if (waiting&&attempt<5) {
      setTimeout(()=>{if(current())void refreshPremium(attempt+1);},2000);
    } else if (!returnHandled&&['returned','cancelled'].includes(premiumReturn)) {
      returnHandled=true;
      history.replaceState(null,'',location.pathname);
      if (premiumReturn==='cancelled'&&!active) $('premium-state').textContent='Checkout closed. You can resume it or cancel it below.';
    }
    if(active) {
      const {cities}=await api('/v1/cities');
      if(!current())return;
      const menu=$('premium-directory').elements.city,value=menu.value;
      menu.replaceChildren(option('','Choose a city'),...cities.map(city=>option(city.id,`${city.name}, ${city.province}`)));
      if(cities.some(city=>String(city.id)===value))menu.value=value;
    } else {
      directoryVersion++;cardsVersion++;
      premiumGym='';premiumDirectory=null;gymFilters=null;
      $('premium-gyms').replaceChildren();$('premium-cards').replaceChildren();
      $('premium-filter').hidden=$('premium-more-gyms').hidden=$('premium-more-cards').hidden=true;
    }
  } catch(error){if(current())requestFailed(error);}
}

let checkoutBusy=false;
async function paymentAction(action, plan) {
  if(checkoutBusy)return;
  const session=sessionVersion;
  checkoutBusy=true;
  const buttons=['buy-weekly','buy-monthly','premium-manage','premium-cancel'].map($);
  for(const button of buttons)button.disabled=true;
  try {
    const result=await api(`/v1/me/stripe-${action}`,{method:'POST',data:plan?{plan}:undefined});
    if(!premiumCurrent(session))return;
    if(!result){status('Unfinished checkout canceled.');return;}
    const target=new URL(result.url);
    const host=action==='portal'?'billing.stripe.com':'checkout.stripe.com';
    if(target.protocol!=='https:'||target.hostname!==host||target.port||target.username||target.password)throw new Error('Could not open Stripe checkout.');
    location.assign(target.href);
  } catch(error) {
    if(!premiumCurrent(session))return;
    const message={checkout_plan_pending:'Cancel your unfinished checkout before choosing a different plan.',
      stripe_subscription_exists:'Manage your existing web subscription.',
      premium_already_active:'Premium is already active on your account.',
      stripe_customer_missing:'This account has no web subscription.'}[error.code];
    if(message){await refreshPremium();if(premiumCurrent(session))status(message,true);}else requestFailed(error);
  } finally {checkoutBusy=false;for(const button of buttons)button.disabled=false;}
}
$('buy-weekly').onclick=()=>paymentAction('checkout','weekly');
$('buy-monthly').onclick=()=>paymentAction('checkout','monthly');
$('premium-manage').onclick=()=>paymentAction('portal');
$('premium-cancel').onclick=()=>paymentAction('cancel-checkout');
$('premium-refresh').onclick=()=>refreshPremium();

async function premiumGyms(more=false) {
  const session=sessionVersion, version=++directoryVersion;
  if(!more) {
    premiumDirectory=new URLSearchParams(new FormData($('premium-directory')));
    premiumDirectoryAfter='';premiumGym='';gymFilters=null;cardsVersion++;
    $('premium-gyms').replaceChildren();$('premium-cards').replaceChildren();
    $('premium-filter').hidden=$('premium-more-cards').hidden=true;
  }
  if(!premiumDirectory)return;
  const query=new URLSearchParams(premiumDirectory);
  if(premiumDirectoryAfter)query.set('after',premiumDirectoryAfter);
  $('premium-more-gyms').hidden=true;
  $('premium-directory-state').textContent='Finding gyms…';
  try {
    const {gyms}=await api(`/v1/gyms?${query}`);
    if(!premiumCurrent(session)||version!==directoryVersion)return;
    $('premium-directory-state').textContent=gyms.length?'':'No more gyms found.';
    for(const gym of gyms) $('premium-gyms').append(control(`${gym.name} · ${gym.street_address}`,()=>{
      premiumGym=gym.id; cardsVersion++;gymFilters=null;
      $('premium-filter').hidden=false;
      $('premium-gym-name').textContent=gym.name;
      $('premium-cards').replaceChildren();
      $('premium-more-cards').hidden=true;
      $('premium-filter').elements.min_age.focus();
    }));
    premiumDirectoryAfter=gyms.at(-1)?.id??premiumDirectoryAfter;
    $('premium-more-gyms').hidden=gyms.length!==30;
  } catch(error){
    if(premiumCurrent(session)&&version===directoryVersion){$('premium-directory-state').textContent='';$('premium-more-gyms').hidden=!more;requestFailed(error);}
  }
}
async function premiumCards(more=false) {
  const session=sessionVersion,version=++cardsVersion,area=$('premium-cards');
  if(!more) {
    gymFilters=new URLSearchParams(new FormData($('premium-filter')));
    if(Number(gymFilters.get('min_age'))>Number(gymFilters.get('max_age'))){status('Minimum age must be below or equal to maximum age.',true);return;}
    gymFilters.set('gym',premiumGym);premiumCardAfter='';area.replaceChildren();status('');
  }
  if(!gymFilters)return;
  const query=new URLSearchParams(gymFilters);
  if(premiumCardAfter)query.set('after',premiumCardAfter);
  $('premium-more-cards').hidden=true;
  try {
    const {cards}=await api(`/v1/premium/gym-cards?${query}`);
    if(!premiumCurrent(session)||version!==cardsVersion)return;
    if(!cards.length&&!more)area.textContent='No eligible profiles match these filters right now.';
    for(const card of cards) {
      const article=document.createElement('article');
      cardText(article,`${card.name}, ${card.age}`,card.city);
      cardText(article,'About me',card.bio);
      cardText(article,'Looking for',card.intent);
      cardText(article,'Training',[card.split,card.frequency==null?'':`${card.frequency} days a week`].filter(Boolean).join(' · '));
      cardText(article,'Typical week',(card.days??[]).map(day=>dayLabels[day-1]).join(', '));
      const actions=document.createElement('div');
      actions.className='actions';
      const act=async decision=>{
        for(const button of actions.querySelectorAll('button'))button.disabled=true;
        try {
          const result=decision==='block' ? await api(`/v1/blocks/${encodeURIComponent(card.id)}`,{method:'POST'}) :
            await api('/v1/swipes',{method:'POST',data:{peer_id:card.id,decision}});
          if(!premiumCurrent(session)||!article.isConnected)return;
          article.remove();
          status(result?.matched?'You matched! Open Matches to say hello.':decision==='block'?'Profile blocked.':'');
        } catch(error){if(premiumCurrent(session)&&article.isConnected)requestFailed(error);}
        finally {for(const button of actions.querySelectorAll('button'))button.disabled=false;}
      };
      const like=control('Like',()=>act('like'));like.className='primary';
      actions.append(control('Pass',()=>act('pass')),like);
      const safety=document.createElement('details'), label=document.createElement('summary');
      label.textContent='Safety';
      const block=control('Block '+card.name,()=>block.replaceWith(control('Confirm block',()=>act('block'))));
      safety.append(label,reportForm(card.id),block);
      article.append(actions,safety);
      area.append(article);
    }
    premiumCardAfter=cards.at(-1)?.id??premiumCardAfter;
    $('premium-more-cards').hidden=cards.length!==20;
  }catch(error){
    if(premiumCurrent(session)&&version===cardsVersion){
      if(error.code==='premium_required')void refreshPremium();
      $('premium-more-cards').hidden=!more;requestFailed(error);
    }
  }
}
$('premium-directory').onsubmit=event=>{event.preventDefault();void premiumGyms();};
$('premium-more-gyms').onclick=()=>premiumGyms(true);
$('premium-filter').onsubmit=event=>{event.preventDefault();void premiumCards();};
$('premium-more-cards').onclick=()=>premiumCards(true);
void api('/browser/options').then(options=>{$('registration').hidden=!options.registration;}).catch(()=>{});
void loadMatches();
