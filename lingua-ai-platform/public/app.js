const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
let authMode = "login";
let token = "";
let user = null;
let recognition = null;
let isRecording = false;
let speakingIndex = 0;
let speechUtterance = null;

const readingData = {
  passage: `<p>In many modern cities, green spaces such as parks, gardens and tree-lined streets are becoming increasingly important. As cities grow, buildings and roads often replace natural areas. However, urban parks offer benefits that go far beyond making a neighbourhood look attractive.</p><p>First, green spaces can improve people's physical health. They provide safe places for walking, running and cycling. Regular outdoor activity helps people stay active and can reduce stress. Trees also provide shade and help make city streets cooler during hot weather.</p><p>Green spaces are valuable for the environment too. Plants absorb carbon dioxide and release oxygen. Trees can also collect some air pollution and provide homes for birds and insects. During heavy rain, soil and plants help absorb water, which may reduce the risk of local flooding.</p><p>Finally, parks bring communities together. Families can spend time outdoors, children can play, and neighbours can meet one another. Some cities organise free events, gardening projects and outdoor classes in public parks. These activities can help people feel more connected to their community.</p><p>Creating and maintaining green spaces requires money and careful planning. Nevertheless, many city planners believe that the long-term benefits make this investment worthwhile. A successful city is not only a place to work and live; it should also be a healthy place to enjoy.</p>`,
  questions: [
    {q:"What often happens to natural areas as cities grow?",o:["They become larger","They are replaced by buildings and roads","They move outside the city"],a:1},
    {q:"According to the passage, how do trees help during hot weather?",o:["They produce electricity","They provide shade and cool streets","They stop all traffic"],a:1},
    {q:"What can plants do during heavy rain?",o:["Absorb some water","Make rivers disappear","Prevent every flood"],a:0},
    {q:"Which activity is mentioned as bringing communities together?",o:["Shopping online","Gardening projects","Working late"],a:1},
    {q:"What is the writer's main opinion?",o:["Parks are too expensive","Only children need parks","Green spaces provide important long-term benefits"],a:2}
  ]
};
const listeningData = {
  text: "Hello, my name is Daniel. I am a university student and I usually wake up at seven o'clock. After breakfast, I take the bus to university. My first class starts at nine. I study business and my favourite subject is marketing. In the afternoon, I often meet my classmates in the library to work on projects. I get home at about six in the evening. After dinner, I spend an hour learning Spanish. I go to bed at eleven because I want to feel ready for the next day.",
  questions: [
    {q:"What time does Daniel usually wake up?",o:["6 o'clock","7 o'clock","8 o'clock"],a:1},
    {q:"How does he travel to university?",o:["By bus","By bicycle","On foot"],a:0},
    {q:"What does he study?",o:["Medicine","Engineering","Business"],a:2},
    {q:"Where does he meet his classmates?",o:["In a cafe","In the library","At home"],a:1},
    {q:"What language does he learn in the evening?",o:["French","Spanish","German"],a:1}
  ]
};
const prompts = [
  "Describe a skill you would like to learn in the future.",
  "Describe a place in your country that you would recommend to visitors.",
  "Talk about a person who has inspired you.",
  "Describe a book or film that you enjoyed.",
  "Do you think technology makes people's lives better? Why?"
];

function toast(message, ms=3500) {
  const el=$("#toast"); el.textContent=message; el.classList.add("show");
  clearTimeout(toast.timer); toast.timer=setTimeout(()=>el.classList.remove("show"),ms);
}
async function api(path, body, method="POST") {
  const headers={"Content-Type":"application/json"};
  const res=await fetch(path,{method,headers,credentials:"same-origin",body:body?JSON.stringify(body):undefined});
  const data=await res.json().catch(()=>({error:"Serverdan noto‘g‘ri javob keldi."}));
  if(!res.ok) throw new Error(data.error||"So‘rov bajarilmadi.");
  return data;
}
function setAuthMode(mode) {
  authMode=mode;
  $$(".auth-tab").forEach(b=>b.classList.toggle("active",b.dataset.auth===mode));
  $("#nameField").classList.toggle("hidden",mode!=="register");
  $("#authTitle").textContent=mode==="login"?"Hisobingizga kiring":"Yangi hisob yarating";
  $("#authSubtitle").textContent=mode==="login"?"O‘rganishni davom ettirish uchun tizimga kiring.":"Bir necha soniyada o‘zingiz uchun hisob yarating.";
  $("#authSubmit").innerHTML=mode==="login"?'Kirish <span>→</span>':'Hisob yaratish <span>→</span>';
  $("#authError").textContent="";
  $("#passwordInput").autocomplete=mode==="login"?"current-password":"new-password";
}
function enterApp(data) {
  user=data.user;
  showApp();
  go("chat");
  toast("Xush kelibsiz, "+(user?.name||"")+"!");
}
function showApp() {
  $("#authScreen").classList.add("hidden");
  $("#app").classList.remove("hidden");
  const name=user?.name||"Mehmon";
  $("#userName").textContent=name;
  $("#userStatus").textContent=user?"Profil faol":"Mehmon rejimi";
  $("#welcomeName").textContent=name.split(" ")[0];
  $("#avatar").textContent=name.charAt(0).toUpperCase()||"G";
  $("#logoutBtn").innerHTML=user?'<span>↪</span> Chiqish':'<span>＋</span> Profil ochish';
  $("#todayDate").textContent=new Intl.DateTimeFormat("uz-UZ",{day:"numeric",month:"long",year:"numeric"}).format(new Date());
  $("#chatGate").classList.toggle("hidden",!!user);
  $("#chatLayout").classList.toggle("hidden",!user);
  updateProgress();
}
function showAuth() {
  setAuthMode("register");
  $("#authScreen").classList.remove("hidden");
  $("#emailInput").focus();
}
$("#closeAuthBtn").addEventListener("click",()=>$("#authScreen").classList.add("hidden"));
$("#authScreen").addEventListener("click",e=>{if(e.target.id==="authScreen")$("#authScreen").classList.add("hidden");});
$("#chatSignInBtn").addEventListener("click",showAuth);
$("#authForm").addEventListener("submit",async e=>{
  e.preventDefault(); $("#authError").textContent="";
  const payload={email:$("#emailInput").value.trim(),password:$("#passwordInput").value};
  if(authMode==="register") payload.name=$("#nameInput").value.trim();
  $("#authSubmit").disabled=true; $("#authSubmit").textContent="Iltimos kuting...";
  try { enterApp(await api(authMode==="login"?"/api/login":"/api/register",payload)); }
  catch(err){$("#authError").textContent=err.message;}
  finally {$("#authSubmit").disabled=false;$("#authSubmit").innerHTML=authMode==="login"?'Kirish <span>→</span>':'Hisob yaratish <span>→</span>';}
});
$$(".auth-tab").forEach(b=>b.addEventListener("click",()=>setAuthMode(b.dataset.auth)));
$("#logoutBtn").addEventListener("click",async()=>{
  if(!user){showAuth();return;}
  try{await api("/api/logout",{});}catch{}
  token="";user=null;
  if(chatPoller)clearInterval(chatPoller);
  activeChatId=null;go("overview");showApp();toast("Hisobdan chiqdingiz.");
});
async function init() {
  try { const data=await api("/api/me",null,"GET"); user=data.user; }
  catch { user=null; }
  showApp();
}
function go(page) {
  $$(".page").forEach(p=>p.classList.toggle("active",p.id===`page-${page}`));
  $$(".nav-item[data-page]").forEach(b=>b.classList.toggle("active",b.dataset.page===page));
  const labels={overview:"Overview",reading:"Reading",listening:"Listening",writing:"Writing AI",speaking:"Speaking AI",chat:"Friends Chat"};
  $("#crumb").textContent=labels[page]||"Overview";
  $("#sidebar").classList.remove("open"); window.scrollTo({top:0,behavior:"smooth"});
}
$$("[data-page]").forEach(b=>b.addEventListener("click",()=>go(b.dataset.page)));
$$("[data-go]").forEach(b=>b.addEventListener("click",()=>go(b.dataset.go)));
$("#menuBtn").addEventListener("click",()=>$("#sidebar").classList.toggle("open"));

function renderQuiz(container, data, prefix) {
  container.innerHTML=data.map((item,i)=>`<div class="question"><b>${i+1}. ${item.q}</b>${item.o.map((option,j)=>`<label class="option"><input type="radio" name="${prefix}-${i}" value="${j}"> ${option}</label>`).join("")}</div>`).join("");
}
function gradeQuiz(formId, data, resultId, key) {
  const form=$(formId); form.addEventListener("submit",e=>{
    e.preventDefault();let score=0,answered=0;
    data.forEach((q,i)=>{const selected=form.querySelector(`input[name="${key}-${i}"]:checked`);if(selected){answered++;if(Number(selected.value)===q.a)score++;}});
    const result=$(resultId);result.classList.remove("hidden");
    if(answered<data.length){result.style.background="#fff7e9";result.style.color="#a87523";result.innerHTML=`Barcha savollarga javob bering. Hozircha ${answered}/${data.length} ta javob belgilandi.`;return;}
    result.style.background="#effaf5";result.style.color="#278a66";
    result.innerHTML=`<strong>${score} / ${data.length} — ${Math.round(score/data.length*100)}%</strong>${score===data.length?"Excellent work!":score>=3?"Good effort! Javoblaringizni qayta ko‘rib chiqing.":"Mashq qilishda davom eting. Matnni yana bir bor o‘qib ko‘ring."}`;
    saveScore(key,score,data.length); updateProgress();
  });
}
$("#readingPassage").innerHTML=readingData.passage;
renderQuiz($("#readingQuestions"),readingData.questions,"read");
gradeQuiz("#readingQuiz",readingData.questions,"#readingResult","read");
renderQuiz($("#listeningQuestions"),listeningData.questions,"listen");
gradeQuiz("#listeningQuiz",listeningData.questions,"#listeningResult","listen");

function saveScore(type,score,total) {
  const all=JSON.parse(localStorage.getItem("lingua_scores")||"[]");
  all.push({type,score,total,date:new Date().toISOString()});
  localStorage.setItem("lingua_scores",JSON.stringify(all.slice(-50)));
}
function updateProgress() {
  const all=JSON.parse(localStorage.getItem("lingua_scores")||"[]");
  const el=$("#progressSummary"); if(!el)return;
  if(!all.length){el.innerHTML='<div class="empty-ring">✦</div><b>Your journey starts here</b><p>Reading va Listening testlarini bajaring. Natijalaringiz shu yerda ko‘rinadi.</p>';return;}
  const avg=Math.round(all.reduce((s,x)=>s+x.score/x.total,0)/all.length*100);
  el.innerHTML=`<div class="empty-ring">${avg}%</div><b>${all.length} ta test bajarildi</b><p>O‘rtacha natija: ${avg}%. Har bir urinish sizni maqsadingizga yaqinlashtiradi.</p>`;
}
let audioPlaying=false;
function speakListening() {
  if(!("speechSynthesis" in window)){toast("Brauzeringiz audio o‘qishni qo‘llab-quvvatlamaydi.");return;}
  speechSynthesis.cancel();speechUtterance=new SpeechSynthesisUtterance(listeningData.text);
  speechUtterance.lang="en-US";speechUtterance.rate=.88;
  speechUtterance.onstart=()=>{$("#audioStatus").textContent="Audio ijro etilmoqda...";audioPlaying=true;$("#playAudio").textContent="Ⅱ";};
  speechUtterance.onend=()=>{$("#audioStatus").textContent="Tinglash tugadi";audioPlaying=false;$("#playAudio").textContent="▶";};
  speechUtterance.onerror=()=>{$("#audioStatus").textContent="Audio xatosi";audioPlaying=false;$("#playAudio").textContent="▶";};
  speechSynthesis.speak(speechUtterance);
}
$("#playAudio").addEventListener("click",()=>{if(audioPlaying){speechSynthesis.pause();audioPlaying=false;$("#audioStatus").textContent="Pauza";$("#playAudio").textContent="▶";}else if(speechSynthesis.paused){speechSynthesis.resume();audioPlaying=true;$("#audioStatus").textContent="Audio ijro etilmoqda...";$("#playAudio").textContent="Ⅱ";}else speakListening();});
$("#stopAudio").addEventListener("click",()=>{if("speechSynthesis"in window)speechSynthesis.cancel();audioPlaying=false;$("#audioStatus").textContent="To‘xtatildi";$("#playAudio").textContent="▶";});

$("#writingAnswer").addEventListener("input",()=>{$("#wordCount").textContent=$("#writingAnswer").value.trim()?$("#writingAnswer").value.trim().split(/\s+/).length+" words":"0 words";});
function escapeHtml(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function renderAiResult(target,data,type) {
  const el=$(target);el.classList.remove("hidden");
  let html=`<span class="subtle-label">PERSONAL AI FEEDBACK</span><h3>${type==="writing"?"Writing analysis":"Speaking analysis"}</h3>`;
  if(data.estimated_ielts_band!=null)html+=`<h4>Estimated IELTS band: ${escapeHtml(data.estimated_ielts_band)}</h4>`;
  if(data.estimated_cefr_level)html+=`<p><b>Estimated CEFR:</b> ${escapeHtml(data.estimated_cefr_level)}</p>`;
  const sections=type==="writing"?["strengths","corrections","criteria","improved_version","next_steps","disclaimer"]:["fluency_feedback","vocabulary_feedback","grammar_feedback","corrections","better_answer","follow_up_questions","pronunciation_note","disclaimer"];
  const labels={strengths:"Strengths",corrections:"Corrections and improvements",criteria:"IELTS writing criteria",improved_version:"Improved version",next_steps:"What to practise next",disclaimer:"Important note",fluency_feedback:"Fluency",vocabulary_feedback:"Vocabulary",grammar_feedback:"Grammar",better_answer:"A stronger sample answer",follow_up_questions:"Follow-up questions",pronunciation_note:"Pronunciation note"};
  for(const key of sections){const value=data[key];if(value==null)continue;html+=`<h4>${labels[key]||key}</h4>`;
    if(Array.isArray(value)){html+="<ul>"+value.map(item=>`<li>${typeof item==="object"?Object.entries(item).map(([k,v])=>`<b>${escapeHtml(k)}:</b> ${escapeHtml(v)}`).join(" · "):escapeHtml(item)}</li>`).join("")+"</ul>";}
    else if(typeof value==="object"){html+="<ul>"+Object.entries(value).map(([k,v])=>`<li><b>${escapeHtml(k)}:</b> ${escapeHtml(typeof v==="object"?JSON.stringify(v):v)}</li>`).join("")+"</ul>";}
    else html+=`<p>${escapeHtml(value)}</p>`;
  }
  if(data.feedback)html+=`<pre>${escapeHtml(data.feedback)}</pre>`;
  el.innerHTML=html;
}
async function evaluate(type) {
  const writing=type==="writing";
  const answer=$(writing?"#writingAnswer":"#speakingAnswer").value.trim();
  const button=$(writing?"#evaluateWriting":"#evaluateSpeaking");
  if(answer.length<15){toast("Iltimos, kamida 15 ta belgi yozing yoki gapiring.");return;}
  button.disabled=true;button.textContent="AI tahlil qilmoqda...";
  const target=writing?"#writingOutput":"#speakingOutput";
  $(target).classList.remove("hidden");$(target).innerHTML="<b>✦ AI javobingizni tahlil qilmoqda...</b><p class='muted'>Bu bir necha soniya vaqt olishi mumkin.</p>";
  try{const data=await api("/api/ai/evaluate",{type,answer,task:writing?$("#writingTask").value:$("#speakingPrompt").textContent,level:writing?$("#writingLevel").value:"B1-B2"});renderAiResult(target,data.result,type);}
  catch(err){$(target).innerHTML=`<b>AI tahlili amalga oshmadi</b><p>${escapeHtml(err.message)}</p><p class="muted">Gemini API kaliti sozlanganini va internet aloqasini tekshiring.</p>`;}
  finally{button.disabled=false;button.innerHTML=writing?'Evaluate with AI <span>✦</span>':'Evaluate with AI <span>✦</span>';}
}
$("#evaluateWriting").addEventListener("click",()=>evaluate("writing"));
$("#evaluateSpeaking").addEventListener("click",()=>evaluate("speaking"));
$("#nextPrompt").addEventListener("click",()=>{speakingIndex=(speakingIndex+1)%prompts.length;$("#speakingPrompt").textContent=prompts[speakingIndex];$("#speakingAnswer").value="";$("#speakingOutput").classList.add("hidden");});

function setupSpeechRecognition() {
  const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SpeechRecognition){$("#micHelp").textContent="Bu brauzer speech recognition funksiyasini qo‘llab-quvvatlamaydi. Javobingizni pastdagi maydonga yozishingiz mumkin.";$("#micButton").disabled=true;$("#micButton").style.opacity=".45";return;}
  recognition=new SpeechRecognition();recognition.lang="en-US";recognition.continuous=true;recognition.interimResults=true;
  recognition.onstart=()=>{isRecording=true;$("#micButton").classList.add("recording");$("#micStatus").textContent="Listening...";$("#micHelp").textContent="Gapirishni tugatgach mikrofon tugmasini yana bosing.";};
  recognition.onresult=e=>{let finalText="",interim="";for(let i=e.resultIndex;i<e.results.length;i++){if(e.results[i].isFinal)finalText+=e.results[i][0].transcript+" ";else interim+=e.results[i][0].transcript;}const area=$("#speakingAnswer");area.value=(area.dataset.final||"")+finalText+interim;if(finalText)area.dataset.final=(area.dataset.final||"")+finalText;};
  recognition.onerror=e=>{toast("Mikrofon xatosi: "+e.error);};
  recognition.onend=()=>{isRecording=false;$("#micButton").classList.remove("recording");$("#micStatus").textContent="Microphone is ready";$("#micHelp").textContent="Transkriptni tekshiring va AI tahliliga yuboring.";};
}
$("#micButton").addEventListener("click",()=>{if(!recognition){toast("Speech recognition qo‘llab-quvvatlanmaydi.");return;}if(isRecording){recognition.stop();}else{try{$("#speakingAnswer").dataset.final=$("#speakingAnswer").value?$("#speakingAnswer").value+" ":"";recognition.start();}catch{toast("Mikrofonni qayta ishga tushirish uchun biroz kuting.");}}});
setupSpeechRecognition();
init();

// Friends Chat: private and group conversations.
let activeChatId = null;
let chatPoller = null;
let renderedMessageIds = new Set();
const chatEscape = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function initials(name){return String(name||"?").trim().charAt(0).toUpperCase()||"?";}
async function loadChatList(){
  try{
    const {chats}=await api("/api/chat/list",null,"GET");
    const box=$("#chatList");
    if(!chats.length){box.innerHTML='<p class="muted">Hozircha suhbat yo‘q. Do‘st qidiring yoki guruh yarating.</p>';return;}
    box.innerHTML=chats.map(c=>{const other=c.type==="direct"?c.members.find(m=>m.id!==user.id):null;const title=c.type==="group"?c.name:(other?.name||"Foydalanuvchi");const last=c.lastMessage?`${c.lastMessage.senderId===user.id?"Siz: ":""}${c.lastMessage.text}`:(c.type==="group"?`${c.members.length} ishtirokchi`:"Suhbatni boshlang");return `<button class="chat-list-item ${c.id===activeChatId?"active":""}" data-chat-id="${c.id}"><span class="chat-avatar">${c.type==="group"?"G":chatEscape(initials(title))}</span><span class="chat-list-copy"><b>${chatEscape(title)}</b><small class="chat-last">${chatEscape(last)}</small></span></button>`;}).join("");
    $$("[data-chat-id]").forEach(b=>b.addEventListener("click",()=>openChat(b.dataset.chatId)));
  }catch(e){$("#chatList").innerHTML=`<p class="muted">${chatEscape(e.message)}</p>`;}
}
async function searchFriends(query,target="#friendResults",selectable=false){
  const q=query.trim();if(q.length<2){$(target).innerHTML="";return;}
  try{const {users}=await api(`/api/users?q=${encodeURIComponent(q)}`,null,"GET");
    $(target).innerHTML=users.length?users.map(u=>selectable?`<label class="group-friend"><input type="checkbox" value="${u.id}"><span><b>${chatEscape(u.name)}</b><small> @${chatEscape(u.username||"")}</small></span></label>`:`<div class="friend-result"><span class="chat-avatar">${chatEscape(initials(u.name))}</span><span><b>${chatEscape(u.name)}</b><small>@${chatEscape(u.username||"")}</small></span><button data-start-chat="${u.id}">Chat</button></div>`).join(""):'<p class="muted">Foydalanuvchi topilmadi.</p>';
    if(!selectable)$$("[data-start-chat]").forEach(b=>b.addEventListener("click",async()=>{try{const {chat}=await api("/api/chat/direct",{userId:b.dataset.startChat});$("#friendSearch").value="";$("#friendResults").innerHTML="";await loadChatList();await openChat(chat.id);}catch(e){toast(e.message);}}));
  }catch(e){$(target).innerHTML=`<p class="muted">${chatEscape(e.message)}</p>`;}
}
async function openChat(id){
  activeChatId=id;renderedMessageIds=new Set();$("#conversationPanel .chat-empty").classList.add("hidden");$("#activeConversation").classList.remove("hidden");
  try{const {chats}=await api("/api/chat/list",null,"GET");const chat=chats.find(c=>c.id===id);if(!chat)throw new Error("Suhbat topilmadi.");
    const other=chat.type==="direct"?chat.members.find(m=>m.id!==user.id):null;const title=chat.type==="group"?chat.name:(other?.name||"Chat");
    $("#activeChatName").textContent=title;$("#activeAvatar").textContent=chat.type==="group"?"G":initials(title);$("#activeChatMeta").textContent=chat.type==="group"?`${chat.members.length} ishtirokchi`:`@${other?.username||""}`;
    await loadMessages();await loadChatList();
    if(chatPoller)clearInterval(chatPoller);chatPoller=setInterval(()=>{if(activeChatId===id)loadMessages();},2500);
    $("#messageInput").focus();
  }catch(e){toast(e.message);}
}
async function loadMessages(){
  if(!activeChatId)return;
  try{const {messages}=await api(`/api/chat/${activeChatId}/messages`,null,"GET");const box=$("#messageList");
    const fresh=messages.filter(m=>!renderedMessageIds.has(m.id));
    if(fresh.length){messages.forEach(m=>renderedMessageIds.add(m.id));box.innerHTML=messages.map(m=>`<div class="message ${m.senderId===user.id?"mine":""}">${m.senderId!==user.id?`<div class="message-author">${chatEscape(m.sender?.name||"Foydalanuvchi")}</div>`:""}<div class="message-bubble">${chatEscape(m.text)}</div><div class="message-time">${new Date(m.createdAt).toLocaleTimeString("uz-UZ",{hour:"2-digit",minute:"2-digit"})}</div></div>`).join("");box.scrollTop=box.scrollHeight;}
  }catch(e){if(e.message.includes("topilmadi"))toast(e.message);}
}
$("#friendSearch").addEventListener("input",e=>searchFriends(e.target.value));
$("#newGroupBtn").addEventListener("click",()=>{$("#groupModal").classList.remove("hidden");$("#groupName").focus();});
$("#closeGroupModal").addEventListener("click",()=>$("#groupModal").classList.add("hidden"));
$("#groupModal").addEventListener("click",e=>{if(e.target.id==="groupModal")$("#groupModal").classList.add("hidden");});
$("#groupFriendSearch").addEventListener("input",e=>searchFriends(e.target.value,"#groupFriendResults",true));
$("#groupForm").addEventListener("submit",async e=>{e.preventDefault();const memberIds=$$("#groupFriendResults input:checked").map(x=>x.value);try{const {chat}=await api("/api/chat/group",{name:$("#groupName").value,memberIds});$("#groupModal").classList.add("hidden");$("#groupForm").reset();$("#groupFriendResults").innerHTML="";await loadChatList();await openChat(chat.id);toast("Guruh yaratildi!");}catch(err){toast(err.message);}});
$("#messageForm").addEventListener("submit",async e=>{e.preventDefault();const input=$("#messageInput"),textValue=input.value.trim();if(!activeChatId||!textValue)return;const btn=e.submitter;btn.disabled=true;try{await api(`/api/chat/${activeChatId}/messages`,{text:textValue});input.value="";await loadMessages();await loadChatList();}catch(err){toast(err.message);}finally{btn.disabled=false;input.focus();}});
const originalGo=go;
go=function(page){
  originalGo(page);
  if(page==="chat"){
    $("#chatGate").classList.toggle("hidden",!!user);
    $("#chatLayout").classList.toggle("hidden",!user);
    if(user){loadChatList();if(chatPoller)clearInterval(chatPoller);}
  }
};
