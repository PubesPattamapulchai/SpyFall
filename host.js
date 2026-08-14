import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { getDatabase, ref, set, get, update, onValue, onDisconnect } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js';
import { firebaseConfig, isFirebaseConfigured } from './firebase-config.js';
import { GAME_TYPE, LOCATIONS, randomRoomCode, pickLocation, assignRound, escapeHtml } from './game-core.js';

const $ = id => document.getElementById(id);
let db, auth, uid = '', room = '', players = {}, pub = {}, mine = {}, truth = {}, allVotes = {};
let timerId = null, hostVote = '';
const path = (p = '') => `rooms/${room}${p ? '/' + p : ''}`;
const entries = () => Object.entries(players).sort((a,b) => (a[1].joinedAt || 0) - (b[1].joinedAt || 0));

function setConnection(text) { $('connection').textContent = text; }
function fmt(ms) { const s = Math.max(0, Math.ceil(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`; }

function isPermissionError(error) {
  const text = `${error?.code || ''} ${error?.message || ''}`.toLowerCase();
  return text.includes('permission') || text.includes('denied');
}

function showFirebaseWriteError(error, action = 'ทำรายการ') {
  console.error(error);
  if (isPermissionError(error)) {
    setConnection('Firebase Rules ยังไม่พร้อม');
    alert(`${action}ไม่สำเร็จ เพราะ Firebase Realtime Database Rules ไม่อนุญาต\n\nวิธีแก้:\n1. เปิด Firebase Console\n2. Realtime Database → Rules\n3. นำไฟล์ firebase.rules.json จาก ZIP นี้ไปวาง\n4. กด Publish\n5. Refresh หน้า Host แล้วลองใหม่`);
    return;
  }
  alert(`${action}ไม่สำเร็จ: ${error?.message || error}`);
}

async function verifySpyfallRules() {
  if (!room) return false;
  try {
    // hostSecret is intentionally Host-only. A read here is a cheap pre-flight
    // that distinguishes "Auth works" from "Spyfall database rules are published".
    await get(ref(db, path('hostSecret')));
    setConnection('Firebase + Rules พร้อม');
    return true;
  } catch (error) {
    showFirebaseWriteError(error, 'เริ่มเกม');
    return false;
  }
}

async function markHostOnline() {
  if (!room || !uid) return;
  try {
    await update(ref(db, path(`players/${uid}`)), { connected: true });
    await onDisconnect(ref(db, path(`players/${uid}/connected`))).set(false);
  } catch (error) {
    console.error('markHostOnline', error);
  }
}

function renderPlayers() {
  const list = entries();
  $('playerCount').textContent = `${list.length} คน`;
  $('playerList').innerHTML = list.length ? list.map(([id,p]) => `
    <div class="player"><span><span class="dot ${p.connected === false ? 'off' : ''}"></span>${escapeHtml(p.name)}${id === uid ? ' • คุณ' : ''}</span><span class="muted">${p.assigned ? 'พร้อม' : 'รอ'}</span></div>
  `).join('') : '<div class="muted">ยังไม่มีผู้เล่น</div>';
  $('startBtn').disabled = list.length < 3 || ['playing','accusation'].includes(pub.state);
}

function secretHtml(data) {
  if (!data?.roundId) return '';
  if (data.isSpy) return '<div class="secret-title">บทบาทลับ</div><div class="secret-main">🕵️ SPY</div><div class="secret-sub">คุณไม่รู้สถานที่ • ฟังคำตอบและพยายามเดาให้ได้</div>';
  return `<div class="secret-title">สถานที่</div><div class="secret-main">${escapeHtml(data.location)}</div><div class="secret-sub">บทบาทของคุณ: <b>${escapeHtml(data.role)}</b></div>`;
}

function renderSecret() {
  const ok = Boolean(mine?.roundId);
  $('hostSecret').classList.toggle('hidden', !ok);
  if (!ok) return;
  $('secretCard').innerHTML = secretHtml(mine);
  $('secretCard').classList.toggle('spy', Boolean(mine.isSpy));
  renderHostSpyGuess();
}

function startTimer() {
  clearInterval(timerId);
  const tick = async () => {
    if (pub.state !== 'playing' || !pub.endsAt) return;
    const left = pub.endsAt - Date.now();
    $('timer').textContent = fmt(left);
    $('timer').classList.toggle('low', left <= 60000);
    if (left <= 0) {
      clearInterval(timerId);
      await finishRound('spy', `หมดเวลา — Spy ชนะ • Spy คือ ${players[truth.spyUid]?.name || 'ผู้เล่น'} • สถานที่: ${truth.location || '—'}`);
    }
  };
  tick();
  timerId = setInterval(tick, 250);
}

function eligibleVoters() { return entries().filter(([id]) => id !== pub.suspectUid).map(([id]) => id); }

function renderHostVote() {
  const old = $('hostVoteBox');
  if (pub.state !== 'accusation' || pub.suspectUid === uid) {
    old?.classList.add('hidden');
    return;
  }
  let box = old;
  if (!box) {
    box = document.createElement('div');
    box.id = 'hostVoteBox';
    box.className = 'stack';
    box.innerHTML = '<div class="vote-options"><button id="hostYes" class="btn danger">ใช่ เป็น Spy</button><button id="hostNo" class="btn safe">ไม่ใช่</button></div><button id="hostVoteSubmit" class="btn primary" disabled>ล็อกคะแนนของฉัน</button>';
    $('voteBox').insertBefore(box, $('closeVoteBtn'));
    $('hostYes').onclick = () => chooseHostVote('yes');
    $('hostNo').onclick = () => chooseHostVote('no');
    $('hostVoteSubmit').onclick = submitHostVote;
  }
  box.classList.remove('hidden');
  const locked = Boolean(allVotes?.[pub.accusationId]?.[uid]);
  $('hostYes').disabled = locked;
  $('hostNo').disabled = locked;
  $('hostVoteSubmit').disabled = locked || !hostVote;
  $('hostVoteSubmit').textContent = locked ? 'ล็อกคะแนนแล้ว ✓' : 'ล็อกคะแนนของฉัน';
  $('hostYes').classList.toggle('selected', hostVote === 'yes' && !locked);
  $('hostNo').classList.toggle('selected', hostVote === 'no' && !locked);
}

function chooseHostVote(choice) {
  hostVote = choice;
  renderHostVote();
}

async function submitHostVote() {
  if (!hostVote || !pub.accusationId || pub.suspectUid === uid) return;
  try {
    await set(ref(db, path(`spyVotes/${pub.accusationId}/${uid}`)), { choice: hostVote, submittedAt: Date.now() });
  } catch (error) {
    console.error(error);
    alert('ส่งคะแนนไม่สำเร็จ หรือคะแนนถูกล็อกแล้ว');
  }
}

function renderVoteProgress() {
  if (pub.state !== 'accusation') return;
  const suspect = players?.[pub.suspectUid]?.name || 'ผู้เล่น';
  const eligible = eligibleVoters();
  const votes = allVotes?.[pub.accusationId] || {};
  const sent = eligible.filter(id => votes[id]).length;
  $('voteProgress').textContent = `กำลังโหวต: ${suspect} • ส่งแล้ว ${sent}/${eligible.length} คน`;
}

function renderPhase() {
  const playing = pub.state === 'playing';
  const accusation = pub.state === 'accusation';
  const result = pub.state === 'result';
  $('timerBox').classList.toggle('hidden', !playing);
  $('accuseBox').classList.add('hidden');
  $('voteBox').classList.toggle('hidden', !accusation);
  $('resultBox').classList.toggle('hidden', !result);
  if (playing) startTimer(); else clearInterval(timerId);
  if (accusation) {
    renderVoteProgress();
    renderHostVote();
  } else {
    $('hostVoteBox')?.classList.add('hidden');
  }
  if (result) $('resultText').textContent = pub.resultText || 'จบรอบ';
  renderHostSpyGuess();
}

function render() {
  const created = Boolean(room);
  $('createView').classList.toggle('hidden', created);
  $('roomView').classList.toggle('hidden', !created);
  if (created) $('roomCode').textContent = room;
  renderPlayers();
  renderSecret();
  renderPhase();
}

function attach() {
  onValue(ref(db, path('players')), s => { players = s.val() || {}; render(); });
  onValue(ref(db, path('public')), s => {
    const previousAccusation = pub.accusationId;
    pub = s.val() || {};
    if (pub.accusationId !== previousAccusation) hostVote = '';
    render();
  });
  onValue(ref(db, path(`private/${uid}`)), s => { mine = s.val() || {}; render(); });
  onValue(ref(db, path('hostSecret')), s => { truth = s.val() || {}; }, error => { console.error('hostSecret read', error); setConnection('Firebase Rules ยังไม่พร้อม'); });
  onValue(ref(db, path('spyVotes')), s => { allVotes = s.val() || {}; renderVoteProgress(); renderHostVote(); });
  onValue(ref(db, path('spyGuess')), async s => {
    const guess = s.val();
    if (!guess || pub.state !== 'playing' || !truth?.location || guess.roundId !== pub.roundId) return;
    const correct = guess.location === truth.location;
    await finishRound(correct ? 'spy' : 'citizens', correct
      ? `Spy เดาถูก: ${truth.location} — Spy ชนะ`
      : `Spy เดาผิด (${guess.location}) • สถานที่คือ ${truth.location} — ฝ่ายผู้เล่นชนะ`);
  });
}

async function createRoom() {
  const name = $('hostName').value.trim();
  if (!name) return alert('กรุณาใส่ชื่อ');
  let code = '';
  for (let i = 0; i < 10; i++) {
    const candidate = randomRoomCode();
    if (!(await get(ref(db, `rooms/${candidate}/hostUid`))).exists()) { code = candidate; break; }
  }
  if (!code) return alert('สร้างห้องไม่สำเร็จ');
  room = code;
  localStorage.setItem('spyfall_host_room', room);
  localStorage.setItem('spyfall_host_name', name);
  try {
    await set(ref(db, path('hostUid')), uid);
    await set(ref(db, path('public')), { gameType: GAME_TYPE, state: 'lobby', roundNumber: 0, duration: Number($('duration').value), createdAt: Date.now() });
    await update(ref(db, path(`players/${uid}`)), { name, isHost: true, connected: true, joinedAt: Date.now(), assigned: false });
    try { await onDisconnect(ref(db, path(`players/${uid}/connected`))).set(false); } catch {}
    attach();
    render();
    // Do not block room creation, but make the rules status explicit.
    verifySpyfallRules();
  } catch (error) {
    showFirebaseWriteError(error, 'สร้างห้อง');
  }
}

async function startRound() {
  const list = entries();
  if (list.length < 3) return alert('ต้องมีผู้เล่นอย่างน้อย 3 คน');
  if (!(await verifySpyfallRules())) return;
  $('startBtn').disabled = true;
  $('startBtn').textContent = 'กำลังเริ่มรอบ…';
  try {
    const location = pickLocation();
  const { spyUid, assignments } = assignRound(list, location);
  const roundNumber = Number(pub.roundNumber || 0) + 1;
  const roundId = `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,6)}`;
  const duration = Number(pub.duration || $('duration').value || 480);
  const updates = {};
  for (const [id] of list) {
    updates[`private/${id}`] = { ...assignments[id], roundId, roundNumber };
    updates[`players/${id}/assigned`] = true;
  }
  updates.hostSecret = { roundId, spyUid, location: location.name };
  updates.spyGuess = null;
  updates.spyVotes = null;
  updates.public = { gameType: GAME_TYPE, state: 'playing', roundId, roundNumber, duration, endsAt: Date.now() + duration * 1000, startedAt: Date.now() };
    await update(ref(db, path()), updates);
    $('secretCard').classList.add('hidden');
    $('revealBtn').textContent = '🔒 แตะเพื่อดูการ์ดของฉัน';
    hostVote = '';
  } catch (error) {
    showFirebaseWriteError(error, 'เริ่มรอบ');
  } finally {
    $('startBtn').textContent = 'เริ่มรอบ';
    renderPlayers();
  }
}

function fillSuspects() {
  $('suspectSelect').innerHTML = entries().map(([id,p]) => `<option value="${id}">${escapeHtml(p.name)}</option>`).join('');
}

function openAccusation() {
  if (pub.state !== 'playing') return;
  fillSuspects();
  $('accuseBox').classList.remove('hidden');
}

async function beginVote() {
  const suspectUid = $('suspectSelect').value;
  if (!suspectUid) return;
  const accusationId = `a_${Date.now().toString(36)}`;
  hostVote = '';
  await update(ref(db, path()), {
    spyVotes: null,
    'public/state': 'accusation',
    'public/accusationId': accusationId,
    'public/suspectUid': suspectUid,
    'public/accusedAt': Date.now()
  });
}

async function closeVote() {
  const votes = allVotes?.[pub.accusationId] || {};
  const eligible = eligibleVoters();
  const missing = eligible.filter(id => !votes[id]);
  if (missing.length && !confirm(`ยังขาด ${missing.length} คะแนน ปิดโหวตหรือไม่?`)) return;
  const yes = eligible.filter(id => votes[id]?.choice === 'yes').length;
  const no = eligible.filter(id => votes[id]?.choice === 'no').length;
  if (yes === eligible.length && eligible.length > 0) {
    if (pub.suspectUid === truth.spyUid) {
      await finishRound('citizens', `จับ Spy สำเร็จ • ${players[pub.suspectUid]?.name || 'Spy'} คือ Spy • สถานที่: ${truth.location}`);
    } else {
      await finishRound('spy', `กล่าวหาผิดคน • Spy ชนะ • Spy คือ ${players[truth.spyUid]?.name || 'ผู้เล่น'} • สถานที่: ${truth.location}`);
    }
  } else {
    await update(ref(db, path()), {
      'public/state': 'playing',
      'public/accusationId': null,
      'public/suspectUid': null,
      'public/voteSummary': { yes, no },
      spyVotes: null
    });
    alert(`ข้อกล่าวหาไม่ผ่าน • ใช่ ${yes} / ไม่ใช่ ${no}`);
  }
}

async function finishRound(winner, text) {
  if (pub.state === 'result') return;
  await update(ref(db, path()), { 'public/state': 'result', 'public/winner': winner, 'public/resultText': text, 'public/endedAt': Date.now() });
}

function renderHostSpyGuess() {
  let box = $('hostSpyGuess');
  const show = Boolean(mine?.isSpy && pub.state === 'playing' && mine.roundId === pub.roundId);
  if (!show) { box?.classList.add('hidden'); return; }
  if (!box) {
    box = document.createElement('div');
    box.id = 'hostSpyGuess';
    box.className = 'panel stack';
    box.style.marginTop = '14px';
    box.innerHTML = '<h3>คุณเป็น Spy — เดาสถานที่</h3><select id="hostLocationGuess"></select><button id="hostGuessBtn" class="btn danger">ยืนยันคำตอบ</button>';
    document.querySelector('.wrap').appendChild(box);
    $('hostLocationGuess').innerHTML = LOCATIONS.map(x => `<option>${escapeHtml(x.name)}</option>`).join('');
    $('hostGuessBtn').onclick = async () => {
      if (!confirm('ยืนยันการเดาสถานที่?')) return;
      try {
        await set(ref(db, path('spyGuess')), { uid, location: $('hostLocationGuess').value, roundId: pub.roundId, submittedAt: Date.now() });
        $('hostGuessBtn').disabled = true;
      } catch (error) {
        console.error(error);
        alert('ส่งคำตอบไม่สำเร็จ หรือรอบนี้เดาไปแล้ว');
      }
    };
  }
  box.classList.remove('hidden');
  $('hostGuessBtn').disabled = false;
}

async function copyLink() {
  const url = new URL('./player.html', location.href);
  url.searchParams.set('room', room);
  try {
    await navigator.clipboard.writeText(url.toString());
    $('copyBtn').textContent = 'คัดลอกแล้ว ✓';
    setTimeout(() => $('copyBtn').textContent = 'คัดลอกลิงก์ผู้เล่น', 1200);
  } catch { prompt('คัดลอกลิงก์', url.toString()); }
}

$('createBtn').onclick = createRoom;
$('startBtn').onclick = startRound;
$('copyBtn').onclick = copyLink;
$('revealBtn').onclick = () => {
  const card = $('secretCard');
  const hide = !card.classList.contains('hidden');
  card.classList.toggle('hidden', hide);
  $('revealBtn').textContent = hide ? '🔒 แตะเพื่อดูการ์ดของฉัน' : '🙈 ซ่อนการ์ด';
};
$('accuseBtn').onclick = openAccusation;
$('openVoteBtn').onclick = beginVote;
$('closeVoteBtn').onclick = closeVote;
$('endBtn').onclick = () => finishRound('spy', `Host จบรอบ • Spy คือ ${players[truth.spyUid]?.name || 'ผู้เล่น'} • สถานที่: ${truth.location || '—'}`);
$('nextBtn').onclick = startRound;

(async () => {
  try {
    if (!isFirebaseConfigured()) throw new Error('Firebase config ไม่ครบ');
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getDatabase(app);
    uid = (await signInAnonymously(auth)).user.uid;
    $('hostName').value = localStorage.getItem('spyfall_host_name') || '';
    setConnection('Firebase พร้อม');
    const saved = localStorage.getItem('spyfall_host_room');
    if (saved) {
      const snap = await get(ref(db, `rooms/${saved}/hostUid`));
      if (snap.val() === uid) {
        room = saved;
        await markHostOnline();
        attach();
        render();
        verifySpyfallRules();
      }
    }
  } catch (error) {
    console.error(error);
    setConnection('เชื่อม Firebase ไม่สำเร็จ');
    $('createBtn').disabled = true;
  }
})();
