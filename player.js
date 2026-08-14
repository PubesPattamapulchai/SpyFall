import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { getDatabase, ref, get, set, update, onValue, onDisconnect } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js';
import { firebaseConfig, isFirebaseConfigured } from './firebase-config.js';
import { LOCATIONS, escapeHtml } from './game-core.js';

const $ = id => document.getElementById(id);
let db, auth, uid = '', room = '', name = '', players = {}, pub = {}, mine = {}, timerId = null;
let voteChoice = '', guess = '';
const path = (p = '') => `rooms/${room}${p ? '/' + p : ''}`;

function fmt(ms) { const s = Math.max(0, Math.ceil(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`; }

function renderPlayers() {
  $('playerList').innerHTML = Object.entries(players)
    .sort((a,b) => (a[1].joinedAt || 0) - (b[1].joinedAt || 0))
    .map(([id,p]) => `<div class="player"><span><span class="dot ${p.connected === false ? 'off' : ''}"></span>${escapeHtml(p.name)}${id === uid ? ' • คุณ' : ''}</span></div>`).join('') || '<div class="muted">ยังไม่มีผู้เล่น</div>';
}

function renderSecret() {
  const ok = Boolean(mine?.roundId);
  $('secretArea').classList.toggle('hidden', !ok);
  if (!ok) return;
  const card = $('secretCard');
  card.classList.toggle('spy', Boolean(mine.isSpy));
  card.innerHTML = mine.isSpy
    ? '<div class="secret-title">บทบาทลับ</div><div class="secret-main">🕵️ SPY</div><div class="secret-sub">คุณไม่รู้สถานที่ • ฟังคำตอบและหาจังหวะเดาสถานที่</div>'
    : `<div class="secret-title">สถานที่</div><div class="secret-main">${escapeHtml(mine.location)}</div><div class="secret-sub">บทบาทของคุณ: <b>${escapeHtml(mine.role)}</b></div>`;
}

function startTimer() {
  clearInterval(timerId);
  const tick = () => {
    if (pub.state !== 'playing' || !pub.endsAt) return;
    const left = pub.endsAt - Date.now();
    $('timer').textContent = fmt(left);
    $('timer').classList.toggle('low', left <= 60000);
  };
  tick();
  timerId = setInterval(tick, 250);
}

function renderVote() {
  const accusation = pub.state === 'accusation';
  const isSuspect = accusation && pub.suspectUid === uid;
  const active = accusation && !isSuspect;
  $('voteBox').classList.toggle('hidden', !active);
  $('suspectStatus').classList.toggle('hidden', !isSuspect);
  if (isSuspect) $('suspectStatus').textContent = 'คุณถูกกล่าวหาว่าเป็น Spy • คุณไม่มีสิทธิ์โหวตในข้อกล่าวหานี้ รอ Host เปิดผล';
  if (!active) return;
  const suspect = players?.[pub.suspectUid]?.name || 'ผู้เล่น';
  $('voteQuestion').textContent = `${suspect} เป็น Spy หรือไม่?`;
  const locked = Boolean(pub.accusationId && mine.voteLocks?.[pub.accusationId]);
  $('yesBtn').disabled = locked;
  $('noBtn').disabled = locked;
  $('submitVoteBtn').classList.toggle('hidden', locked);
  $('submitVoteBtn').disabled = locked || !voteChoice;
  $('yesBtn').classList.toggle('selected', voteChoice === 'yes' && !locked);
  $('noBtn').classList.toggle('selected', voteChoice === 'no' && !locked);
  $('voteStatus').textContent = locked ? 'ล็อกคะแนนแล้ว ✓' : 'เลือกคำตอบแล้วกดล็อกคะแนน';
}

function renderSpyGuess() {
  const show = Boolean(pub.state === 'playing' && mine?.isSpy && mine.roundId === pub.roundId);
  $('spyGuessBox').classList.toggle('hidden', !show);
  if (!show) return;
  if (!$('locationGrid').children.length) {
    $('locationGrid').innerHTML = LOCATIONS.map(x => `<button class="location-btn" data-loc="${escapeHtml(x.name)}">${escapeHtml(x.name)}</button>`).join('');
    $('locationGrid').querySelectorAll('[data-loc]').forEach(button => button.onclick = () => {
      guess = button.dataset.loc;
      $('locationGrid').querySelectorAll('[data-loc]').forEach(x => x.classList.toggle('selected', x.dataset.loc === guess));
      $('submitGuessBtn').disabled = false;
    });
  }
}

function renderPhase() {
  const playing = pub.state === 'playing';
  const result = pub.state === 'result';
  $('waiting').classList.toggle('hidden', Boolean(mine?.roundId));
  $('timerBox').classList.toggle('hidden', !playing);
  $('resultBox').classList.toggle('hidden', !result);
  if (playing) startTimer(); else clearInterval(timerId);
  renderVote();
  renderSpyGuess();
  if (result) $('resultText').textContent = pub.resultText || 'จบรอบ';
}

function render() { renderPlayers(); renderSecret(); renderPhase(); }

function attach() {
  onValue(ref(db, path('players')), s => { players = s.val() || {}; render(); });
  onValue(ref(db, path('public')), s => {
    const previousAccusation = pub.accusationId;
    const previousRound = pub.roundId;
    pub = s.val() || {};
    if (pub.accusationId !== previousAccusation) voteChoice = '';
    if (pub.roundId !== previousRound) { guess = ''; $('submitGuessBtn').disabled = true; }
    render();
  });
  onValue(ref(db, path(`private/${uid}`)), s => { mine = s.val() || {}; render(); });
}

async function join() {
  const code = $('roomInput').value.trim().toUpperCase();
  const playerName = $('nameInput').value.trim();
  if (!code || code.length !== 6 || !code.startsWith('S')) return alert('Room Code ต้องมี 6 ตัวและขึ้นต้นด้วย S');
  if (!playerName) return alert('กรุณาใส่ชื่อ');
  const host = await get(ref(db, `rooms/${code}/hostUid`));
  if (!host.exists()) return alert('ไม่พบห้องนี้');
  room = code;
  name = playerName;
  const old = await get(ref(db, path(`players/${uid}`)));
  const data = { name, connected: true };
  if (!old.exists()) data.joinedAt = Date.now();
  await update(ref(db, path(`players/${uid}`)), data);
  try { await onDisconnect(ref(db, path(`players/${uid}/connected`))).set(false); } catch {}
  localStorage.setItem('spyfall_player_room', room);
  localStorage.setItem('spyfall_player_name', name);
  $('roomText').textContent = room;
  $('meText').textContent = name;
  $('joinView').classList.add('hidden');
  $('gameView').classList.remove('hidden');
  attach();
}

async function submitVote() {
  if (pub.state !== 'accusation' || !pub.accusationId || pub.suspectUid === uid || !voteChoice) return;
  try {
    await set(ref(db, path(`spyVotes/${pub.accusationId}/${uid}`)), { choice: voteChoice, submittedAt: Date.now() });
    await update(ref(db, path(`private/${uid}/voteLocks`)), { [pub.accusationId]: true });
  } catch (error) {
    console.error(error);
    alert('ส่งคะแนนไม่สำเร็จ หรือคะแนนรอบนี้ถูกล็อกแล้ว');
  }
  renderVote();
}

async function submitGuess() {
  if (!mine?.isSpy || pub.state !== 'playing' || !guess) return;
  if (!confirm(`ยืนยันว่าเดาสถานที่เป็น “${guess}” ?`)) return;
  try {
    await set(ref(db, path('spyGuess')), { uid, location: guess, roundId: pub.roundId, submittedAt: Date.now() });
    $('submitGuessBtn').disabled = true;
  } catch (error) {
    console.error(error);
    alert('ส่งคำตอบไม่สำเร็จ หรือรอบนี้เดาไปแล้ว');
  }
}

$('joinBtn').onclick = join;
$('revealBtn').onclick = () => {
  const card = $('secretCard');
  const hide = !card.classList.contains('hidden');
  card.classList.toggle('hidden', hide);
  $('revealBtn').textContent = hide ? '🔒 แตะเพื่อดูการ์ดลับ' : '🙈 ซ่อนการ์ด';
};
$('yesBtn').onclick = () => { voteChoice = 'yes'; renderVote(); };
$('noBtn').onclick = () => { voteChoice = 'no'; renderVote(); };
$('submitVoteBtn').onclick = submitVote;
$('submitGuessBtn').onclick = submitGuess;
$('roomInput').oninput = event => event.target.value = event.target.value.toUpperCase().replace(/[^A-Z2-9]/g,'').slice(0,6);

(async () => {
  const query = new URLSearchParams(location.search);
  $('roomInput').value = (query.get('room') || localStorage.getItem('spyfall_player_room') || '').toUpperCase();
  $('nameInput').value = localStorage.getItem('spyfall_player_name') || '';
  try {
    if (!isFirebaseConfigured()) throw new Error('Firebase config ไม่ครบ');
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getDatabase(app);
    uid = (await signInAnonymously(auth)).user.uid;
    $('connection').textContent = 'ออนไลน์ ✓';
  } catch (error) {
    console.error(error);
    $('connection').textContent = 'เชื่อม Firebase ไม่สำเร็จ';
    $('joinBtn').disabled = true;
  }
})();
