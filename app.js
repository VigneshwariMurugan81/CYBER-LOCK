(function(){
"use strict";

/* ============================================================
   CONFIG
   ============================================================ */
var TOTAL_STAGES = 5;
var DURATION_MS = 30 * 60 * 1000; // 30 minutes
var SYNC_ENDPOINT = '/.netlify/functions/sync';
var LS_PREFIX = 'cyberlock:v2:';
var LS_CURRENT = 'cyberlock:v2:current';
var LS_REGISTRY = 'cyberlock:v2:registry';

/* ============================================================
   CIPHER MECHANICS
   ============================================================ */
var MORSE_MAP = {A:'.-',B:'-...',C:'-.-.',D:'-..',E:'.',F:'..-.',G:'--.',H:'....',I:'..',J:'.---',
  K:'-.-',L:'.-..',M:'--',N:'-.',O:'---',P:'.--.',Q:'--.-',R:'.-.',S:'...',T:'-',U:'..-',V:'...-',
  W:'.--',X:'-..-',Y:'-.--',Z:'--..'};
var T9_GROUPS = ['ABC','DEF','GHI','JKL','MNO','PQRS','TUV','WXYZ'];
var T9_DIGITS = ['2','3','4','5','6','7','8','9'];
var LEET_MAP = {A:'4',E:'3',I:'1',O:'0',S:'5',T:'7',B:'8'};
var POLY_GRID = ['ABCDE','FGHIK','LMNOP','QRSTU','VWXYZ'];
var VIG_KEYS = ['RAVEN','GHOST','NIGHT','ECHO','ONYX','WOLFPACK','CIPHER','ORBIT','STORM','FLARE','HAWK','ZERODAY'];

function caesarEncode(w,shift){
  return w.split('').map(function(c){
    return String.fromCharCode(((c.charCodeAt(0)-65+shift)%26+26)%26+65);
  }).join('');
}
function atbashEncode(w){
  return w.split('').map(function(c){ return String.fromCharCode(90-(c.charCodeAt(0)-65)); }).join('');
}
function morseEncode(w){ return w.split('').map(function(c){ return MORSE_MAP[c]||c; }).join(' '); }
function binaryEncode(w){
  return w.split('').map(function(c){ return c.charCodeAt(0).toString(2).padStart(8,'0'); }).join(' ');
}
function hexEncode(w){
  return w.split('').map(function(c){ return c.charCodeAt(0).toString(16).toUpperCase().padStart(2,'0'); }).join(' ');
}
function leetEncode(w){ return w.split('').map(function(c){ return LEET_MAP[c]||c; }).join(''); }
function a1z26Encode(w){ return w.split('').map(function(c){ return String(c.charCodeAt(0)-64); }).join('-'); }
function vigenereEncode(w,key){
  var out='';
  for(var i=0;i<w.length;i++){
    var c=w.charCodeAt(i)-65, k=key.charCodeAt(i%key.length)-65;
    out+=String.fromCharCode(((c+k)%26+26)%26+65);
  }
  return out;
}
function railFenceEncode(w,rails){
  if(rails<2) return w;
  var fence=[]; for(var i=0;i<rails;i++) fence.push([]);
  var row=0, dir=1;
  for(var j=0;j<w.length;j++){
    fence[row].push(w[j]);
    if(row===0) dir=1; else if(row===rails-1) dir=-1;
    row+=dir;
  }
  return fence.map(function(r){return r.join('');}).join('');
}
function t9Encode(w){
  return w.split('').map(function(ch){
    for(var i=0;i<T9_GROUPS.length;i++){
      var idx = T9_GROUPS[i].indexOf(ch);
      if(idx>=0) return T9_DIGITS[i].repeat(idx+1);
    }
    return ch;
  }).join('-');
}
function reverseEncode(w){ return w.split('').reverse().join(''); }
var EMOJI_ALPHABET = {
  A:'\uD83C\uDF4E',B:'\uD83D\uDC1D',C:'\uD83D\uDC31',D:'\uD83D\uDC36',E:'\uD83E\uDD5A',
  F:'\uD83D\uDC1F',G:'\uD83C\uDF47',H:'\uD83C\uDFE0',I:'\uD83C\uDF66',J:'\uD83E\uDDC3',
  K:'\uD83D\uDD11',L:'\uD83C\uDF4B',M:'\uD83C\uDF19',N:'\uD83E\uDD5C',O:'\uD83D\uDC19',
  P:'\uD83C\uDF55',Q:'\uD83D\uDC78',R:'\uD83C\uDF08',S:'\u2600\uFE0F',T:'\uD83C\uDF33',
  U:'\u2602\uFE0F',V:'\uD83C\uDFBB',W:'\uD83C\uDF49',X:'\u274C',Y:'\uD83E\uDDF6',Z:'\uD83E\uDD93'
};
var EMOJI_WORDS = {A:'Apple',B:'Bee',C:'Cat',D:'Dog',E:'Egg',F:'Fish',G:'Grapes',H:'House',
  I:'Ice cream',J:'Juice',K:'Key',L:'Lemon',M:'Moon',N:'Nut',O:'Octopus',P:'Pizza',Q:'Queen',
  R:'Rainbow',S:'Sun',T:'Tree',U:'Umbrella',V:'Violin',W:'Watermelon',X:'X-mark',Y:'Yarn',Z:'Zebra'};
function emojiEncode(w){ return w.split('').map(function(c){ return EMOJI_ALPHABET[c]||c; }).join(' '); }
function emojiLegend(){
  return Object.keys(EMOJI_ALPHABET).map(function(k){ return EMOJI_ALPHABET[k]+'='+k; }).join('  ');
}
function anagramEncode(w){
  var rng = mulberry32(hashStr(w)+11);
  var arr = w.split(''), attempts=0;
  do{
    for(var i=arr.length-1;i>0;i--){
      var j = Math.floor(rng()*(i+1));
      var tmp=arr[i]; arr[i]=arr[j]; arr[j]=tmp;
    }
    attempts++;
  } while(arr.join('')===w && attempts<10);
  return arr.join(' ');
}
function polybiusEncode(w){
  return w.split('').map(function(ch){
    var c = ch==='J' ? 'I' : ch;
    for(var r=0;r<5;r++){
      var ci = POLY_GRID[r].indexOf(c);
      if(ci>=0) return String(r+1)+String(ci+1);
    }
    return '00';
  }).join(' ');
}

var MECHANIC_POOL = ['caesar','atbash','morse','a1z26','leet','reverse','anagram','emoji'];

var MECHANIC_META = {
  caesar:{ label:'Caesar Shift', evidence:'Field Cipher',
    instructions:function(p){ return 'Each letter has been shifted forward '+p.shift+' places in the alphabet. Shift back the same amount to decode.'; },
    encode:function(w,p){ return caesarEncode(w,p.shift); } },
  atbash:{ label:'Mirror Cipher', evidence:'Old Logbook',
    instructions:function(){ return 'A mirror cipher was used — A becomes Z, B becomes Y, and so on. Mirror it back to read the word.'; },
    encode:function(w){ return atbashEncode(w); } },
  morse:{ label:'Morse Code', evidence:'Radio Intercept',
    instructions:function(){ return 'A garbled transmission, recovered as Morse code. Letters are space-separated.'; },
    encode:function(w){ return morseEncode(w); } },
  binary:{ label:'Binary', evidence:'Disk Sector',
    instructions:function(){ return 'Pulled from a corrupted disk sector — raw binary. Each 8-bit block is one letter.'; },
    encode:function(w){ return binaryEncode(w); } },
  hex:{ label:'Hexadecimal', evidence:'Memory Dump',
    instructions:function(){ return 'A memory dump surfaced this hex string. Convert each byte back to a character.'; },
    encode:function(w){ return hexEncode(w); } },
  leet:{ label:'Leetspeak', evidence:'Forum Post',
    instructions:function(){ return 'Found in a hacker forum post, written in leetspeak (4=A, 3=E, 1=I, 0=O, 5=S, 7=T, 8=B). Translate it back.'; },
    encode:function(w){ return leetEncode(w); } },
  a1z26:{ label:'Number Cipher', evidence:'Ledger Entry',
    instructions:function(){ return 'A numbered ledger entry — each number marks a letter\'s position in the alphabet (A=1 … Z=26).'; },
    encode:function(w){ return a1z26Encode(w); } },
  vigenere:{ label:'Vigenère Cipher', evidence:'Encrypted Diary',
    instructions:function(p){ return 'An encrypted diary page. Keyword: "'+p.key+'". Use a Vigenère table to decode it.'; },
    encode:function(w,p){ return vigenereEncode(w,p.key); } },
  railfence:{ label:'Rail Fence Cipher', evidence:'Torn Note',
    instructions:function(p){ return 'A torn note, written zigzag across '+p.rails+' rails. Reassemble it to find the word.'; },
    encode:function(w,p){ return railFenceEncode(w,p.rails); } },
  t9:{ label:'Keypad Code', evidence:'Phone Log',
    instructions:function(){ return 'Recovered from an old phone\'s keypad log. Each letter is its key digit, repeated by its position (2=A, 22=B, 222=C…). Letters are separated by dashes.'; },
    encode:function(w){ return t9Encode(w); } },
  reverse:{ label:'Mirrored Text', evidence:'Mirrored Footage',
    instructions:function(){ return 'A security footage transcript, mirrored during transfer. Read it in reverse.'; },
    encode:function(w){ return reverseEncode(w); } },
  anagram:{ label:'Scrambled Note', evidence:'Shredded Document',
    instructions:function(){ return 'A shredded document, taped back together with its letters out of order. Rearrange them to spell the word.'; },
    encode:function(w){ return anagramEncode(w); } },
  emoji:{ label:'Emoji Rebus', evidence:'Sticker Note',
    instructions:function(){ return 'A sticky note covered in stickers instead of letters. Each icon stands for a word \u2014 take its first letter to spell out the message. Key: '+emojiLegend(); },
    encode:function(w){ return emojiEncode(w); } },
  polybius:{ label:'Polybius Square', evidence:'Coordinate Grid',
    instructions:function(){ return 'A 5×5 Polybius square (I/J share a cell) turned this into coordinate pairs — row, then column.'; },
    encode:function(w){ return polybiusEncode(w); } }
};

function paramsFor(mechanic, sIdx, stIdx){
  if(mechanic==='caesar') return { shift: 1 + ((sIdx*3+stIdx*2)%4) };
  if(mechanic==='vigenere') return { key: VIG_KEYS[(sIdx*2+stIdx)%VIG_KEYS.length] };
  if(mechanic==='railfence') return { rails: 3 + ((sIdx+stIdx)%2) };
  return {};
}
function mulberry32(seed){
  return function(){
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function mechanicsForScenario(sIdx){
  var rng = mulberry32(sIdx*97 + 13);
  var pool = MECHANIC_POOL.slice();
  for(var i=pool.length-1;i>0;i--){
    var j = Math.floor(rng()*(i+1));
    var tmp=pool[i]; pool[i]=pool[j]; pool[j]=tmp;
  }
  return pool.slice(0,5);
}

/* ============================================================
   SCENARIOS
   ============================================================ */
var SCENARIOS = [
  { title:'Vault Breach', location:'Metro Trust Bank',
    briefing:'Someone cracked the vault at Metro Trust two hours before opening. Nothing is missing yet — but the security logs are scrambled and the clock is running.',
    closing:'the vault breach at Metro Trust', words:['VAULT','LEDGER','SENTRY','TREMOR','PHANTOM'] },
  { title:'Ward Twelve', location:'St. Anselm Hospital',
    briefing:'Patient records on Ward Twelve went dark at 2 a.m. The backups survived, but only in pieces — scattered across old terminals and locked drawers.',
    closing:'the breach on Ward Twelve', words:['SYRINGE','CIPHER','PULSE','QUARANTINE','ANTIDOTE'] },
  { title:'Ballot Shadow', location:'District 9 Elections Office',
    briefing:'Turnout numbers from District 9 don\u2019t add up. Someone touched the count after the polls closed, and they left a trail — if it can be read in time.',
    closing:'the tampering in District 9', words:['BALLOT','PRECINCT','TURNOUT','RECOUNT','MANDATE'] },
  { title:'Orbital Drift', location:'Halcyon-3 Ground Station',
    briefing:'Halcyon-3 stopped answering its ground station forty minutes ago. Its last transmissions are still in the system — encrypted, and drifting further out of reach.',
    closing:'the Halcyon-3 hijack', words:['BEACON','PAYLOAD','ORBIT','UPLINK','BLACKOUT'] },
  { title:'Match Fixed', location:'The Apex Invitational',
    briefing:'A pro player\u2019s stats don\u2019t add up — too clean, too fast. The tournament server logs might prove it, if they can be pulled apart in time.',
    closing:'the cheating ring at the Apex Invitational', words:['AIMBOT','SPECTATE','THROTTLE','SCRIMMAGE','DISQUALIFY'] },
  { title:'Gallery Ghost', location:'The Ashworth Gallery',
    briefing:'A painting left the Ashworth Gallery last night without setting off a single alarm. The only trace is in the motion logs — and they\u2019re a mess.',
    closing:'the heist at the Ashworth Gallery', words:['CANVAS','CURATOR','MOTION','DECOY','APPRAISAL'] },
  { title:'Boardroom Leak', location:'Halvorsen & Cole',
    briefing:'Confidential merger files from Halvorsen & Cole surfaced on a rival\u2019s desk. Someone inside leaked them — the access logs are the only lead.',
    closing:'the leak at Halvorsen & Cole', words:['DOSSIER','MERGER','INSIDER','FIREWALL','LEVERAGE'] },
  { title:'Gridlock', location:'Substation 14',
    briefing:'Substation 14 dropped offline at rush hour, and it wasn\u2019t an accident. The control logs are still there, just badly scrambled by whoever got in.',
    closing:'the sabotage at Substation 14', words:['SUBSTATION','OVERLOAD','CASCADE','BREAKER','VOLTAGE'] },
  { title:'Ledger Zero', location:'Nomad Exchange',
    briefing:'A wallet on the Nomad Exchange emptied itself in nine seconds flat. The transaction trail is real — it\u2019s just been cut into unreadable pieces.',
    closing:'the exploit on Nomad Exchange', words:['WALLET','EXPLOIT','LIQUIDITY','COLDSTORE','RANSOM'] },
  { title:'Runway Nine', location:'Meridian International Airport',
    briefing:'A cleared manifest for Runway Nine doesn\u2019t match what was actually loaded. Security pulled the checkpoint logs — now someone has to read them.',
    closing:'the breach at Meridian International', words:['MANIFEST','CLEARANCE','TARMAC','CHECKPOINT','DIVERSION'] },
  { title:'Mirror Face', location:'Lumen Studios',
    briefing:'A video of someone who never said those words is spreading fast. The render logs from Lumen Studios might prove it\u2019s fake — if they can be decoded in time.',
    closing:'the deepfake traced to Lumen Studios', words:['RENDER','ARTIFACT','SPLICED','METADATA','EXPOSURE'] },
  { title:'Basement Node', location:'an unmarked server farm',
    briefing:'A server farm running out of a basement has been routing traffic no one can explain. The rack logs are the only paper trail left.',
    closing:'the server farm running in the basement', words:['RACKSPACE','LATENCY','MIRROR','SHUTDOWN','OVERCLOCK'] },
  { title:'Signal Ghost', location:'an unlicensed radio tower',
    briefing:'A pirate broadcast has been cutting into the city\u2019s emergency frequency for three nights running. The station\u2019s own logs might reveal where it\u2019s coming from.',
    closing:'the pirate broadcast on the emergency band', words:['SIGNAL','PIRATE','STATIC','RELAY','OPERATOR'] },
  { title:'Cold Case Reopened', location:'the County Archive Basement',
    briefing:'A twenty-year-old case file just resurfaced with a page that was never in the original report. Someone added it recently — the question is who, and why now.',
    closing:'the reopened cold case', words:['WITNESS','ALIBI','EVIDENCE','SUSPECT','VERDICT'] },
  { title:'Harbor Drop', location:'Pier 7 Customs Yard',
    briefing:'A shipping container cleared customs with the wrong weight on record. It\u2019s already gone, but the yard\u2019s intake logs might say where.',
    closing:'the smuggling run through Pier 7', words:['CARGO','CUSTOMS','SMUGGLER','CRATE','INSPECTOR'] },
  { title:'Night Shift', location:'Ironclad Assembly Plant',
    briefing:'The assembly line went haywire at 3 a.m. with no one on the floor to see it happen. The plant\u2019s control logs caught the sequence, badly scrambled.',
    closing:'the sabotage on Ironclad\u2019s night shift', words:['ASSEMBLY','SABOTEUR','CONVEYOR','OVERRIDE','GLITCH'] },
  { title:'The Archive Leak', location:'the National Records Office',
    briefing:'Documents marked for permanent sealing turned up online this morning. The office\u2019s access logs are the only way to trace how they got out.',
    closing:'the leak from the National Records Office', words:['ARCHIVE','CLASSIFIED','REDACTED','CUSTODIAN','BREACH'] },
  { title:'Ratings Spike', location:'StreamPeak Studios',
    briefing:'A brand-new show jumped to the top of the charts overnight — too fast to be real. The platform\u2019s traffic logs might expose the bots behind it.',
    closing:'the fraud behind StreamPeak\u2019s ratings spike', words:['BOTNET','ENGAGEMENT','ALGORITHM','INFLUENCER','SPIKE'] },
  { title:'Silent Auction', location:'Kestrel Auction House',
    briefing:'A rare lot sold for triple its estimate to a bidder no one can identify. The house\u2019s paddle records are the only lead before the sale is final.',
    closing:'the rigged bidding at Kestrel Auction House', words:['BIDDER','ESTIMATE','RESERVE','PROVENANCE','GAVEL'] },
  { title:'Campus Lockdown', location:'Ashcombe University Network Ops',
    briefing:'Every student account on campus got locked out at once. The network team has partial logs of the intrusion, but they\u2019re in pieces.',
    closing:'the intrusion at Ashcombe University', words:['INTRUSION','CREDENTIAL','SANDBOX','PATCH','ADMIN'] },
  { title:'The Vanishing Act', location:'The Regal Theater',
    briefing:'A prop worth more than the show itself disappeared mid-performance, in full view of the audience. The stage crew\u2019s call sheet might explain how.',
    closing:'the vanishing act at The Regal Theater', words:['ILLUSION','TRAPDOOR','CURTAIN','REHEARSAL','VANISH'] },
  { title:'Cold Storage', location:'Meridian Cold Chain Facility',
    briefing:'A shipment left Meridian\u2019s cold storage at the wrong temperature and nobody flagged it. The facility\u2019s sensor logs are the only proof of when it happened.',
    closing:'the cover-up at Meridian Cold Chain', words:['SHIPMENT','CONTAMINANT','RECALL','AUDITOR','TEMPERATURE'] },
  { title:'Pulse Check', location:'VitalSync App Servers',
    briefing:'Thousands of users\u2019 heart-rate data showed up for sale on a forum last night. VitalSync\u2019s server logs are the only way to trace the exposure.',
    closing:'the data breach at VitalSync', words:['BIOMETRIC','ENDPOINT','TOKEN','LEAKAGE','PATIENT'] },
  { title:'Off the Grid', location:'Rural Substation 6',
    briefing:'Substation 6 dropped three neighborhoods off the grid for no logged reason. The meter and sensor logs survived, just badly out of order.',
    closing:'the outage at Substation 6', words:['OUTAGE','METER','TRANSFORMER','SENSOR','BACKFEED'] },
  { title:'Backstage Pass', location:'Ember Arena Box Office',
    briefing:'Hundreds of counterfeit wristbands got through the gate at last night\u2019s sold-out show. The box office\u2019s queue logs are the only record of where they came from.',
    closing:'the counterfeit ring at Ember Arena', words:['SCALPER','WRISTBAND','QUEUE','RESALE','COUNTERFEIT'] },
  { title:'The Long Con', location:'Harrow Mutual Insurance',
    briefing:'A routine claim turned out to be the twelfth filed under five different names this year. The adjuster\u2019s case notes are the only thread connecting them.',
    closing:'the fraud ring at Harrow Mutual', words:['CLAIMANT','EXAMINER','PREMIUM','FRAUD','PAYOUT'] },
  { title:'Static Line', location:'Meridian Telecom Exchange',
    briefing:'A line that was supposed to be decommissioned years ago just carried a call nobody can account for. The exchange\u2019s routing logs are the only record left.',
    closing:'the wiretap on the Meridian exchange', words:['WIRETAP','INTERCEPT','CARRIER','SUBPOENA','HANDSET'] },
  { title:'Deadline', location:'The Daily Ledger Newsroom',
    briefing:'A story ran with a quote that was never actually said, and now the paper needs to know who edited it in. The newsroom\u2019s revision logs are the only proof.',
    closing:'the newsroom leak at The Daily Ledger', words:['SOURCE','LEAK','RETRACTION','EDITOR','BYLINE'] },
  { title:'Chain Reaction', location:'Falcon Freight Depot',
    briefing:'A pallet flagged for local delivery ended up three states away. The depot\u2019s dispatch logs are the only way to trace where the route was changed.',
    closing:'the hijacked route out of Falcon Freight', words:['PALLET','DISPATCH','ROUTE','DIVERT','TRACKING'] },
  { title:'Last Call', location:'RideNow Driver Hub',
    briefing:'One driver account logged triple the normal fares in a single night, all from the same three blocks. The trip logs are the only way to prove it\u2019s not real.',
    closing:'the fare scam on RideNow', words:['FAREBOX','RIDER','DUPLICATE','SURGE','TRIPLOG'] }
];

function hashStr(s){
  var h=0;
  for(var i=0;i<s.length;i++){ h=(h*31 + s.charCodeAt(i))>>>0; }
  return h;
}
function scenarioForKey(key){ return SCENARIOS[hashStr(key)%SCENARIOS.length]; }
function scenarioIndexForKey(key){ return hashStr(key)%SCENARIOS.length; }

function buildStage(sIdx, stIdx, scenario){
  var mechanics = mechanicsForScenario(sIdx);
  var mech = mechanics[stIdx];
  var meta = MECHANIC_META[mech];
  var params = paramsFor(mech, sIdx, stIdx);
  var word = scenario.words[stIdx];
  return {
    mechanic:mech, label:meta.label, evidence:meta.evidence,
    instructions:meta.instructions(params), clue:meta.encode(word,params), answer:word
  };
}

/* ============================================================
   PERSISTENCE
   ============================================================ */
function normalizeName(raw){ return (raw||'').trim().replace(/\s+/g,' ').slice(0,28); }
function keyFor(name){ return normalizeName(name).toUpperCase(); }
function normalizeAnswer(s){ return (s||'').toUpperCase().replace(/[^A-Z0-9]/g,''); }

function loadSession(key){
  try{
    var raw = localStorage.getItem(LS_PREFIX+key);
    return raw ? JSON.parse(raw) : null;
  }catch(e){ return null; }
}
function saveSession(session){
  try{ localStorage.setItem(LS_PREFIX+session.key, JSON.stringify(session)); }catch(e){}
}
function registerTeam(key){
  var reg=[];
  try{ reg = JSON.parse(localStorage.getItem(LS_REGISTRY)||'[]'); }catch(e){}
  if(reg.indexOf(key)===-1){ reg.push(key); try{ localStorage.setItem(LS_REGISTRY, JSON.stringify(reg)); }catch(e){} }
}
function listLocalSessions(){
  var reg=[];
  try{ reg = JSON.parse(localStorage.getItem(LS_REGISTRY)||'[]'); }catch(e){}
  return reg.map(loadSession).filter(Boolean);
}
function newSession(displayName){
  var key = keyFor(displayName);
  var session = {
    key:key, teamName:normalizeName(displayName), scenarioIndex:scenarioIndexForKey(key),
    createdAt:Date.now(), startedAt:null, currentStage:0, stageClearTimes:[],
    completedAt:null, expired:false
  };
  saveSession(session); registerTeam(key);
  try{ localStorage.setItem(LS_CURRENT, key); }catch(e){}
  return session;
}

/* ---- optional remote sync (works automatically once a serverless
   sync function is deployed alongside this file; fails silently otherwise) ---- */
var remoteAvailableCache = null;
function pushRemote(session){
  try{
    fetch(SYNC_ENDPOINT, {
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ key: session.key, data: session })
    }).catch(function(){});
  }catch(e){}
}
function fetchRemoteAll(){
  return fetch(SYNC_ENDPOINT).then(function(r){ return r.ok ? r.json() : null; }).catch(function(){ return null; });
}
function resetRemote(key){
  try{
    fetch(SYNC_ENDPOINT, {
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ key:key, action:'reset' })
    }).catch(function(){});
  }catch(e){}
}

/* ============================================================
   RENDER HELPERS
   ============================================================ */
var screenEl = document.getElementById('screen');
var topbarEl = document.getElementById('topbar');
var clockTimer = null;
var adminPollTimer = null;

function stopClock(){ if(clockTimer){ clearInterval(clockTimer); clockTimer=null; } }
function stopAdminPoll(){ if(adminPollTimer){ clearInterval(adminPollTimer); adminPollTimer=null; } }

function fmtClock(ms){
  if(ms<0) ms=0;
  var totalSec = Math.floor(ms/1000);
  var m = Math.floor(totalSec/60), s = totalSec%60;
  return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
}
function escapeHtml(s){
  return String(s==null?'':s).replace(/[&<>"']/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}

function showTopbar(visible, session, scenario){
  if(!visible){ topbarEl.classList.add('hidden'); return; }
  topbarEl.classList.remove('hidden');
  document.getElementById('tb-team').textContent = session.teamName;
  var dotsEl = document.getElementById('tb-stages');
  dotsEl.innerHTML='';
  for(var i=0;i<TOTAL_STAGES;i++){
    var d = document.createElement('div');
    d.className='sd'+(i<session.currentStage?' done':'')+(i===session.currentStage?' now':'');
    dotsEl.appendChild(d);
  }
}
function updateTimerDisplay(remainingMs){
  var el = document.getElementById('tb-timer');
  if(!el) return;
  el.textContent = fmtClock(remainingMs);
  el.classList.toggle('low', remainingMs <= 60000);
}

/* ============================================================
   SCREENS
   ============================================================ */
function renderEntry(){
  stopClock(); stopAdminPoll();
  showTopbar(false);
  var currentKey=null;
  try{ currentKey = localStorage.getItem(LS_CURRENT); }catch(e){}
  var resumeSession = currentKey ? loadSession(currentKey) : null;

  screenEl.innerHTML =
    '<div class="entry-wrap">' +
      '<div class="brand"><h1 class="display" style="margin:0;">CYBER-LOCK</h1><span class="mark">LIVE CASE FILE</span></div>' +
      '<p class="lede">Five stages. Thirty minutes. Every team gets a different case, with a different mix of ciphers to break. Enter a team name to open your file.</p>' +
      (resumeSession ? renderResumeBox(resumeSession) : '') +
      '<label class="field-label" for="team-input">Team name</label>' +
      '<form id="entry-form" autocomplete="off">' +
        '<input type="text" id="team-input" placeholder="e.g. Night Owls" maxlength="28" required>' +
        '<div class="field-err" id="entry-err"></div>' +
        '<button type="submit" class="btn">Open Case File</button>' +
      '</form>' +
      '<div class="rules">' +
        '<div class="rule-card"><div class="rn">Timer</div><p>Starts the moment your team hits Start Mission — 30 minutes, no pausing.</p></div>' +
        '<div class="rule-card"><div class="rn">Stages</div><p>Five, in order. Each uses a different code or cipher to crack.</p></div>' +
        '<div class="rule-card"><div class="rn">Progress</div><p>Saved on this device — refresh or lock your screen, you won\u2019t lose your place.</p></div>' +
        '<div class="rule-card"><div class="rn">Uniqueness</div><p>Your team name decides your case — different names, different scenarios.</p></div>' +
      '</div>' +
    ;

  document.getElementById('entry-form').addEventListener('submit', function(ev){
    ev.preventDefault();
    var input = document.getElementById('team-input');
    var name = normalizeName(input.value);
    var errEl = document.getElementById('entry-err');
    if(name.length < 2){ errEl.textContent = 'Enter at least 2 characters.'; return; }
    errEl.textContent='';
    var key = keyFor(name);
    var existing = loadSession(key);
    var session = existing || newSession(name);
    try{ localStorage.setItem(LS_CURRENT, key); }catch(e){}
    if(!existing) pushRemote(session);
    routeSession(session);
  });

  if(resumeSession){
    var btn = document.getElementById('resume-btn');
    if(btn) btn.addEventListener('click', function(){ routeSession(resumeSession); });
    var fresh = document.getElementById('fresh-link');
    if(fresh) fresh.addEventListener('click', function(ev){
      ev.preventDefault();
      try{ localStorage.removeItem(LS_CURRENT); }catch(e){}
      renderEntry();
    });
  }
}
function renderResumeBox(session){
  return '<div class="resume-box"><div class="rb-text">Welcome back, <strong>'+escapeHtml(session.teamName)+'</strong> — your case is already open.</div>' +
    '<div style="display:flex;gap:.5rem;"><button id="resume-btn" class="btn small">Continue</button>' +
    '<a href="#" id="fresh-link" class="btn ghost small">Not us</a></div></div>';
}

function renderBriefing(session, scenario){
  stopClock(); stopAdminPoll();
  showTopbar(false);
  screenEl.innerHTML =
    '<div class="case-stamp">CASE '+String(session.scenarioIndex+1).padStart(2,'0')+' \u2014 CLASSIFIED</div>' +
    '<div class="redact-wrap">' +
      '<div class="redact-line"><div class="briefing-loc">'+escapeHtml(scenario.location)+'</div><div class="bar"></div></div>' +
      '<div class="redact-line"><h1 class="display" style="margin:0;">'+escapeHtml(scenario.title)+'</h1><div class="bar"></div></div>' +
    '</div>' +
    '<div class="brief-card">' +
      '<p class="lede" style="margin-bottom:0;">'+escapeHtml(scenario.briefing)+'</p>' +
      '<div class="brief-meta">' +
        '<div><b>'+escapeHtml(session.teamName)+'</b>Team</div>' +
        '<div><b>5</b>Stages</div>' +
        '<div><b>30:00</b>Time limit</div>' +
      '</div>' +
    '</div>' +
    '<button id="start-btn" class="btn">Start Mission</button>';

  document.getElementById('start-btn').addEventListener('click', function(){
    session.startedAt = Date.now();
    saveSession(session);
    pushRemote(session);
    routeSession(session);
  });
}

function renderGame(session, scenario){
  showTopbar(true, session, scenario);
  var stage = buildStage(session.scenarioIndex, session.currentStage, scenario);

  screenEl.innerHTML =
    '<div class="stage-progress-line">STAGE '+(session.currentStage+1)+' OF '+TOTAL_STAGES+' \u00b7 '+escapeHtml(scenario.location)+'</div>' +
    '<div class="evidence-card">' +
      '<div class="ev-label">EVIDENCE '+(session.currentStage+1)+' \u2014 '+escapeHtml(stage.evidence)+' \u00b7 '+escapeHtml(stage.label)+'</div>' +
      '<div class="ev-instructions">'+escapeHtml(stage.instructions)+'</div>' +
      '<div class="clue-box">'+escapeHtml(stage.clue)+'</div>' +
      '<form id="answer-form">' +
        '<input type="text" id="answer-input" placeholder="Enter the decoded word" autocomplete="off" autocapitalize="characters">' +
        '<button type="submit" class="btn">Submit</button>' +
      '</form>' +
      '<div class="ans-feedback" id="ans-feedback"></div>' +
    '</div>';

  document.getElementById('answer-form').addEventListener('submit', function(ev){
    ev.preventDefault();
    var input = document.getElementById('answer-input');
    var fb = document.getElementById('ans-feedback');
    if(normalizeAnswer(input.value) === normalizeAnswer(stage.answer)){
      fb.className='ans-feedback ok';
      fb.textContent='Decoded correctly.';
      session.stageClearTimes.push(Date.now());
      session.currentStage += 1;
      saveSession(session);
      pushRemote(session);
      if(session.currentStage >= TOTAL_STAGES){
        session.completedAt = Date.now();
        saveSession(session);
        pushRemote(session);
        setTimeout(function(){ routeSession(session); }, 350);
      } else {
        setTimeout(function(){ routeSession(session); }, 400);
      }
    } else {
      fb.className='ans-feedback err';
      fb.textContent='Not quite \u2014 recheck the decode and try again.';
      input.focus(); input.select();
    }
  });

  startGameClock(session, scenario);
}

function startGameClock(session, scenario){
  stopClock();
  function tick(){
    var remaining = DURATION_MS - (Date.now() - session.startedAt);
    if(remaining <= 0){
      stopClock();
      session.expired = true;
      saveSession(session);
      pushRemote(session);
      routeSession(session);
      return;
    }
    updateTimerDisplay(remaining);
  }
  tick();
  clockTimer = setInterval(tick, 500);
}

function renderExpired(session, scenario){
  stopClock(); stopAdminPoll();
  showTopbar(true, session, scenario);
  updateTimerDisplay(0);
  screenEl.innerHTML =
    '<div class="status-panel">' +
      '<div class="kicker" style="color:var(--rust-hi)">'+escapeHtml(scenario.location)+'</div>' +
      '<div class="status-big">TIME EXPIRED</div>' +
      '<p class="lede" style="margin:0 auto 1rem; text-align:center;">'+escapeHtml(session.teamName)+' cleared '+session.currentStage+' of '+TOTAL_STAGES+' stages before the clock ran out on '+escapeHtml(scenario.closing)+'.</p>' +
    '</div>';
}

var CELEBRATIONS = ['WHOA \u2014 CASE CRACKED!','YES! MISSION COMPLETE!','BOOM. NAILED IT!','OUTSTANDING WORK, AGENTS!','CASE CLOSED \u2014 INCREDIBLE RUN!','THAT WAS BRILLIANT!'];

function rankFor(totalMs){
  if(totalMs <= 12*60*1000) return 'S \u2014 LIGHTNING FAST';
  if(totalMs <= 20*60*1000) return 'A \u2014 SHARP WORK';
  return 'B \u2014 CASE CLOSED';
}

function renderComplete(session, scenario){
  stopClock(); stopAdminPoll();
  showTopbar(false);
  var totalMs = session.completedAt - session.startedAt;
  var headline = CELEBRATIONS[hashStr(session.key)%CELEBRATIONS.length];

  screenEl.innerHTML =
    '<div class="complete-wrap">' +
      '<div class="kicker">'+escapeHtml(scenario.location)+' \u2014 CASE CLOSED</div>' +
      '<div class="celebrate-head">'+headline+'</div>' +
      '<p class="lede" style="margin:0 auto 1rem;">'+escapeHtml(session.teamName)+' cracked '+escapeHtml(scenario.closing)+' with every stage cleared.</p>' +
      '<div class="rank-badge">RANK '+rankFor(totalMs)+'</div>' +
      '<div class="stat-row">' +
        '<div class="stat"><div class="sv">'+fmtClock(totalMs)+'</div><div class="sl">TOTAL TIME</div></div>' +
        '<div class="stat"><div class="sv">'+TOTAL_STAGES+'/'+TOTAL_STAGES+'</div><div class="sl">STAGES CLEARED</div></div>' +
      '</div>' +
    '</div>';
  spawnConfetti();
}
function spawnConfetti(){
  var colors=['#00e5ff','#ff2e88','#e7ecff','#6df6ff'];
  for(var i=0;i<28;i++){
    var el=document.createElement('div');
    el.className='confetti';
    el.style.left=(Math.random()*100)+'vw';
    el.style.background=colors[i%colors.length];
    el.style.animationDuration=(2.4+Math.random()*1.8)+'s';
    el.style.animationDelay=(Math.random()*0.6)+'s';
    document.body.appendChild(el);
    (function(node){ setTimeout(function(){ node.remove(); }, 5000); })(el);
  }
}

/* ============================================================
   ADMIN
   ============================================================ */
function statusFor(s){
  if(s.completedAt) return 'complete';
  if(s.expired) return 'expired';
  if(s.startedAt) return 'inprogress';
  return 'notstarted';
}
var STATUS_LABEL = { notstarted:'Not started', inprogress:'In progress', complete:'Complete', expired:'Expired' };

function renderAdmin(){
  stopClock();
  screenEl.classList.add('admin-screen');
  showTopbar(false);
  screenEl.innerHTML =
    '<div class="admin-head">' +
      '<div><h1 class="display" style="margin:0 0 .2rem;">Admin Roster</h1>' +
      '<p class="lede" style="margin:0;">Live status for every team that has opened a case file.</p></div>' +
      '<div class="admin-badges" id="admin-badges"><span class="badge local">Checking sync\u2026</span></div>' +
    '</div>' +
    '<div class="admin-controls">' +
      '<button id="admin-refresh" class="btn ghost small">Refresh now</button>' +
      '<button id="admin-reset-all" class="btn danger small">Reset all teams</button>' +
    '</div>' +
    '<div id="admin-stats" class="admin-stats"></div>' +
    '<div id="admin-table-holder"></div>' +
    '<p class="sync-note">Cross-device live sync needs a small serverless function deployed alongside this file (endpoint: <code>'+SYNC_ENDPOINT+'</code>). Without it, this panel only shows teams that have played on this exact device/browser.</p>';

  document.getElementById('admin-refresh').addEventListener('click', renderAdminTable);
  document.getElementById('admin-reset-all').addEventListener('click', function(){
    if(!confirm('Reset progress for every team? This cannot be undone.')) return;
    var sessions = listLocalSessions();
    sessions.forEach(function(s){
      try{ localStorage.removeItem(LS_PREFIX+s.key); }catch(e){}
      resetRemote(s.key);
    });
    try{ localStorage.setItem(LS_REGISTRY, '[]'); }catch(e){}
    renderAdminTable();
  });

  renderAdminTable();
  stopAdminPoll();
  adminPollTimer = setInterval(renderAdminTable, 4000);
}

function renderAdminTable(){
  var localSessions = listLocalSessions();
  fetchRemoteAll().then(function(remote){
    var badgesEl = document.getElementById('admin-badges');
    if(!badgesEl) return; // navigated away
    var merged = {};
    localSessions.forEach(function(s){ merged[s.key]=s; });
    var remoteAvailable = !!remote;
    if(remote){ Object.keys(remote).forEach(function(k){ merged[k]=remote[k]; }); }
    badgesEl.innerHTML = remoteAvailable
      ? '<span class="badge live">Live cross-device sync</span>'
      : '<span class="badge local">Local device only</span>';

    var list = Object.keys(merged).map(function(k){ return merged[k]; });
    list.sort(function(a,b){
      var order = {inprogress:0, notstarted:1, complete:2, expired:3};
      var sa=statusFor(a), sb=statusFor(b);
      if(order[sa]!==order[sb]) return order[sa]-order[sb];
      return (b.currentStage||0)-(a.currentStage||0);
    });

    var counts = {notstarted:0,inprogress:0,complete:0,expired:0};
    list.forEach(function(s){ counts[statusFor(s)]++; });
    document.getElementById('admin-stats').innerHTML =
      astat(list.length,'TEAMS') + astat(counts.inprogress,'IN PROGRESS') +
      astat(counts.complete,'COMPLETE') + astat(counts.expired,'EXPIRED');

    var holder = document.getElementById('admin-table-holder');
    if(list.length===0){
      holder.innerHTML = '<div class="empty-note">No teams yet. Once someone opens the case file and enters a team name, they\u2019ll show up here.</div>';
      return;
    }
    var rows = list.map(function(s){
      var scenario = SCENARIOS[s.scenarioIndex];
      var st = statusFor(s);
      var dots = '';
      for(var i=0;i<TOTAL_STAGES;i++) dots += '<div class="md'+(i<(s.currentStage||0)?' on':'')+'"></div>';
      var timeCell;
      if(st==='complete') timeCell = fmtClock(s.completedAt - s.startedAt);
      else if(st==='inprogress') timeCell = fmtClock(Date.now() - s.startedAt);
      else if(st==='expired') timeCell = fmtClock(DURATION_MS);
      else timeCell = '\u2014';
      return '<tr>' +
        '<td>'+escapeHtml(s.teamName)+'</td>' +
        '<td>'+escapeHtml(scenario ? scenario.title : '\u2014')+'</td>' +
        '<td><span class="pill '+st+'">'+STATUS_LABEL[st]+'</span></td>' +
        '<td>'+(s.currentStage||0)+'/'+TOTAL_STAGES+'<div class="mini-dots" style="margin-top:.3rem;">'+dots+'</div></td>' +
        '<td>'+timeCell+'</td>' +
        '<td><button class="btn ghost small" data-reset="'+escapeHtml(s.key)+'">Reset</button></td>' +
      '</tr>';
    }).join('');
    holder.innerHTML =
      '<table class="roster"><thead><tr>' +
      '<th>Team</th><th>Case</th><th>Status</th><th>Stages</th><th>Time</th><th></th>' +
      '</tr></thead><tbody>'+rows+'</tbody></table>';

    Array.prototype.forEach.call(holder.querySelectorAll('[data-reset]'), function(btn){
      btn.addEventListener('click', function(){
        var key = btn.getAttribute('data-reset');
        if(!confirm('Reset this team\u2019s progress?')) return;
        try{ localStorage.removeItem(LS_PREFIX+key); }catch(e){}
        resetRemote(key);
        renderAdminTable();
      });
    });
  });
}
function astat(n,label){
  return '<div class="astat"><div class="n">'+n+'</div><div class="l">'+label+'</div></div>';
}

/* ============================================================
   QR / SHARE SCREEN
   ============================================================ */
function renderQR(){
  stopClock(); stopAdminPoll();
  showTopbar(false);
  var rootUrl = location.origin + location.pathname;
  screenEl.innerHTML =
    '<div class="qr-wrap">' +
      '<div class="kicker">SCAN TO OPEN A CASE FILE</div>' +
      '<h1 class="display">CYBER-LOCK</h1>' +
      '<div id="qr-canvas-holder"></div>' +
      '<div class="qr-link">'+escapeHtml(rootUrl)+'</div>' +
      '<div class="no-print" style="margin-top:1.4rem; display:flex; gap:.6rem; justify-content:center; flex-wrap:wrap;">' +
        '<button id="qr-download" class="btn ghost small">Download PNG</button>' +
        '<button id="qr-print" class="btn small">Print</button>' +
      '</div>' +
    '</div>';

  var holder = document.getElementById('qr-canvas-holder');
  function draw(){
    holder.innerHTML='';
    if(window.QRCode){
      new QRCode(holder, { text: rootUrl, width:260, height:260, correctLevel: QRCode.CorrectLevel.M });
    } else {
      holder.innerHTML = '<div style="padding:2rem;color:#333;font-family:monospace;max-width:220px;">QR library unavailable offline \u2014 share the link below directly.</div>';
    }
  }
  if(window.QRCode){ draw(); }
  else {
    var s = document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    s.onload = draw; s.onerror = draw;
    document.head.appendChild(s);
  }
  document.getElementById('qr-print').addEventListener('click', function(){ window.print(); });
  document.getElementById('qr-download').addEventListener('click', function(){
    var canvas = holder.querySelector('canvas');
    if(!canvas){ alert('QR not ready yet \u2014 try again in a moment.'); return; }
    var a = document.createElement('a');
    a.download='cyberlock-qr.png';
    a.href=canvas.toDataURL('image/png');
    a.click();
  });
}

/* ============================================================
   ROUTER
   ============================================================ */
function routeSession(session){
  var scenario = SCENARIOS[session.scenarioIndex];
  if(session.completedAt){ renderComplete(session, scenario); return; }
  if(!session.startedAt){ renderBriefing(session, scenario); return; }
  var remaining = DURATION_MS - (Date.now() - session.startedAt);
  if(remaining <= 0){
    session.expired = true; saveSession(session); pushRemote(session);
    renderExpired(session, scenario); return;
  }
  renderGame(session, scenario);
}

function boot(){
  var params = new URLSearchParams(location.search);
  if(params.has('admin')){ renderAdmin(); return; }
  if(params.has('qr')){ renderQR(); return; }
  var currentKey=null;
  try{ currentKey = localStorage.getItem(LS_CURRENT); }catch(e){}
  if(currentKey){
    var session = loadSession(currentKey);
    if(session){ routeSession(session); return; }
  }
  renderEntry();
}

boot();
})();
