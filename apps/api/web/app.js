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
void loadMatches();
