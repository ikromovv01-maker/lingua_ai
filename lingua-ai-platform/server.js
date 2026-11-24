const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const CHATS_FILE = path.join(DATA_DIR, "chats.json");
const MESSAGES_FILE = path.join(DATA_DIR, "messages.json");
const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");
const PORT = Number(process.env.PORT || 3000);
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const sessions = new Map();

function loadEnv() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const i = trimmed.indexOf("=");
    if (i < 1) continue;
    const key = trimmed.slice(0, i).trim();
    const value = trimmed.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnv();
fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, "[]");
if (!fs.existsSync(CHATS_FILE)) fs.writeFileSync(CHATS_FILE, "[]");
if (!fs.existsSync(MESSAGES_FILE)) fs.writeFileSync(MESSAGES_FILE, "[]");
if (!fs.existsSync(SESSIONS_FILE)) fs.writeFileSync(SESSIONS_FILE, "{}");
try { for (const [key, value] of Object.entries(JSON.parse(fs.readFileSync(SESSIONS_FILE, "utf8")))) { if (value.expires > Date.now()) sessions.set(key, value); } } catch {}

const readUsers = () => JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
const writeUsers = users => fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
const readChats = () => JSON.parse(fs.readFileSync(CHATS_FILE, "utf8"));
const writeChats = chats => fs.writeFileSync(CHATS_FILE, JSON.stringify(chats, null, 2));
const readMessages = () => JSON.parse(fs.readFileSync(MESSAGES_FILE, "utf8"));
const writeMessages = messages => fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2));
function publicUser(u) {
  const base = String(u.name || "user").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "user";
  return { id: u.id, name: u.name, email: u.email, username: u.username || `${base}_${String(u.id || "").replace(/-/g, "").slice(0, 5)}` };
}
const send = (res, status, data, headers = {}) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers });
  res.end(JSON.stringify(data));
};
const readBody = req => new Promise((resolve, reject) => {
  let raw = "";
  req.on("data", chunk => { raw += chunk; if (raw.length > 1_000_000) reject(new Error("Request too large")); });
  req.on("end", () => { try { resolve(JSON.parse(raw || "{}")); } catch { reject(new Error("Invalid JSON")); } });
  req.on("error", reject);
});
const hashPassword = (password, salt = crypto.randomBytes(16).toString("hex")) => new Promise((resolve, reject) => {
  crypto.scrypt(password, salt, 64, (err, key) => err ? reject(err) : resolve({ salt, hash: key.toString("hex") }));
});
const verifyPassword = (password, salt, expected) => new Promise((resolve, reject) => {
  crypto.scrypt(password, salt, 64, (err, key) => {
    if (err) return reject(err);
    const a = Buffer.from(expected, "hex"), b = key;
    resolve(a.length === b.length && crypto.timingSafeEqual(a, b));
  });
});
function saveSessions() {
  const active = Object.fromEntries([...sessions.entries()].filter(([, v]) => v.expires > Date.now()));
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(active, null, 2));
}
function cookieToken(req) {
  const cookies = Object.fromEntries(String(req.headers.cookie || "").split(";").map(x => x.trim()).filter(Boolean).map(x => { const i=x.indexOf("="); return i<0?[x,""]:[x.slice(0,i),decodeURIComponent(x.slice(i+1))]; }));
  return cookies.lingua_session || "";
}
function sessionKey(token) { return crypto.createHash("sha256").update(token).digest("hex"); }
function setSessionCookie(req, res, token) {
  const secure = req.socket.encrypted || req.headers["x-forwarded-proto"] === "https";
  const days = Math.max(1, Number(process.env.SESSION_DAYS || 30));
  res.setHeader("Set-Cookie", `lingua_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${days*86400}${secure?"; Secure":""}`);
}
function clearSessionCookie(req, res) {
  const secure = req.socket.encrypted || req.headers["x-forwarded-proto"] === "https";
  res.setHeader("Set-Cookie", `lingua_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure?"; Secure":""}`);
}
function tokenFor(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const days = Math.max(1, Number(process.env.SESSION_DAYS || 30));
  sessions.set(sessionKey(token), { userId, expires: Date.now() + days * 86400000 });
  saveSessions();
  return token;
}
function currentUser(req) {
  const token = cookieToken(req) || (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const key = sessionKey(token);
  const session = sessions.get(key);
  if (!session || session.expires < Date.now()) { if (session) { sessions.delete(key); saveSessions(); } return null; }
  return readUsers().find(u => u.id === session.userId) || null;
}
async function gemini(prompt) {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key.includes("PASTE_YOUR")) {
    const e = new Error("Gemini API key sozlanmagan. .env fayliga GEMINI_API_KEY kiriting.");
    e.status = 503; throw e;
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent?key=${encodeURIComponent(key)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.35, maxOutputTokens: 1800 }
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.error?.message || `Gemini API xatosi (${response.status})`;
    const e = new Error(message); e.status = response.status; throw e;
  }
  const text = data.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("").trim();
  if (!text) throw new Error("AI javob qaytarmadi. Birozdan keyin qayta urinib ko‘ring.");
  return text;
}
function safeJson(text) {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{"), end = cleaned.lastIndexOf("}");
  if (start < 0 || end < 0) return { feedback: cleaned };
  try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { return { feedback: cleaned }; }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (req.method === "GET" && url.pathname === "/api/health") return send(res, 200, { ok: true, aiConfigured: !!process.env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY.includes("PASTE_YOUR") });
  try {
    if (req.method === "POST" && url.pathname === "/api/register") {
      const { name, email, password } = await readBody(req);
      const cleanName = String(name || "").trim().slice(0, 50);
      const cleanEmail = String(email || "").trim().toLowerCase();
      if (cleanName.length < 2) return send(res, 400, { error: "Ism kamida 2 ta belgidan iborat bo‘lsin." });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) return send(res, 400, { error: "Email manzilni to‘g‘ri kiriting." });
      if (String(password || "").length < 8) return send(res, 400, { error: "Parol kamida 8 ta belgidan iborat bo‘lishi kerak." });
      const users = readUsers();
      if (users.some(u => u.email === cleanEmail)) return send(res, 409, { error: "Bu email bilan hisob mavjud. Kirish bo‘limidan foydalaning." });
      const pass = await hashPassword(password);
      const userId = crypto.randomUUID();
      const usernameBase = cleanName.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "user";
      const user = { id: userId, name: cleanName, email: cleanEmail, username: `${usernameBase}_${userId.replace(/-/g, "").slice(0, 5)}`, ...pass, createdAt: new Date().toISOString() };
      users.push(user); writeUsers(users);
      const token = tokenFor(user.id); setSessionCookie(req, res, token);
      return send(res, 201, { user: publicUser(user) });
    }
    if (req.method === "POST" && url.pathname === "/api/login") {
      const { email, password } = await readBody(req);
      const user = readUsers().find(u => u.email === String(email || "").trim().toLowerCase());
      if (!user || !(await verifyPassword(String(password || ""), user.salt, user.hash))) return send(res, 401, { error: "Email yoki parol noto‘g‘ri." });
      const token = tokenFor(user.id); setSessionCookie(req, res, token);
      return send(res, 200, { user: publicUser(user) });
    }
    if (req.method === "GET" && url.pathname === "/api/me") {
      const user = currentUser(req);
      if (!user) return send(res, 401, { error: "Sessiya tugagan. Qayta kiring." });
      return send(res, 200, { user: publicUser(user) });
    }
    if (req.method === "POST" && url.pathname === "/api/logout") {
      const token = cookieToken(req) || (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
      if (token) sessions.delete(sessionKey(token)); saveSessions(); clearSessionCookie(req, res);
      return send(res, 200, { ok: true });
    }

    // --- Chat: do‘stlarni qidirish, shaxsiy va guruh suhbatlari ---
    if (url.pathname.startsWith("/api/users") || url.pathname.startsWith("/api/chat")) {
      const me = currentUser(req);
      if (!me) return send(res, 401, { error: "Chatdan foydalanish uchun tizimga kiring." });

      if (req.method === "GET" && url.pathname === "/api/users") {
        const q = (url.searchParams.get("q") || "").trim().replace(/^@/, "").toLowerCase();
        if (q.length < 2) return send(res, 200, { users: [] });
        const users = readUsers()
          .filter(u => u.id !== me.id && (
            String(u.username || publicUser(u).username).toLowerCase().includes(q) ||
            String(u.name || "").toLowerCase().includes(q)
          ))
          .slice(0, 20)
          .map(publicUser);
        return send(res, 200, { users });
      }

      if (req.method === "GET" && url.pathname === "/api/chat/list") {
        const allUsers = readUsers();
        const allMessages = readMessages();
        const chats = readChats()
          .filter(c => Array.isArray(c.memberIds) && c.memberIds.includes(me.id))
          .map(c => ({
            ...c,
            members: c.memberIds.map(id => {
              const member = allUsers.find(u => u.id === id);
              return member ? publicUser(member) : null;
            }).filter(Boolean),
            lastMessage: allMessages.filter(m => m.chatId === c.id).slice(-1)[0] || null
          }));
        return send(res, 200, { chats });
      }

      if (req.method === "POST" && url.pathname === "/api/chat/direct") {
        const { userId } = await readBody(req);
        const other = readUsers().find(u => u.id === userId);
        if (!other || other.id === me.id) return send(res, 400, { error: "Foydalanuvchi topilmadi." });
        const chats = readChats();
        let chat = chats.find(c => c.type === "direct" && c.memberIds.length === 2 &&
          c.memberIds.includes(me.id) && c.memberIds.includes(other.id));
        if (!chat) {
          chat = { id: crypto.randomUUID(), type: "direct", name: other.name, memberIds: [me.id, other.id], createdAt: new Date().toISOString() };
          chats.push(chat);
          writeChats(chats);
        }
        return send(res, 200, { chat });
      }

      if (req.method === "POST" && url.pathname === "/api/chat/group") {
        const { name, memberIds = [] } = await readBody(req);
        const clean = String(name || "").trim().slice(0, 60);
        const ids = Array.isArray(memberIds) ? memberIds : [];
        const unique = [...new Set([me.id, ...ids].filter(x => typeof x === "string"))];
        const allUsers = readUsers();
        if (clean.length < 2) return send(res, 400, { error: "Guruh nomi kamida 2 ta belgidan iborat bo‘lsin." });
        if (unique.length < 2) return send(res, 400, { error: "Guruhga kamida bitta do‘st qo‘shing." });
        if (unique.length > 20 || unique.some(id => !allUsers.some(u => u.id === id))) {
          return send(res, 400, { error: "Guruh a'zolarini tekshiring (2–20 kishi)." });
        }
        const chat = { id: crypto.randomUUID(), type: "group", name: clean, memberIds: unique, createdAt: new Date().toISOString() };
        const chats = readChats();
        chats.push(chat);
        writeChats(chats);
        return send(res, 201, { chat });
      }

      const messageMatch = url.pathname.match(/^\/api\/chat\/([^/]+)\/messages$/);
      if (messageMatch && req.method === "GET") {
        const chat = readChats().find(c => c.id === messageMatch[1] && c.memberIds.includes(me.id));
        if (!chat) return send(res, 404, { error: "Suhbat topilmadi." });
        const allUsers = readUsers();
        const messages = readMessages().filter(m => m.chatId === chat.id).slice(-200).map(m => ({
          ...m,
          sender: publicUser(allUsers.find(u => u.id === m.senderId) || { id: m.senderId, name: "Foydalanuvchi", email: "" })
        }));
        return send(res, 200, { messages });
      }

      if (messageMatch && req.method === "POST") {
        const chat = readChats().find(c => c.id === messageMatch[1] && c.memberIds.includes(me.id));
        if (!chat) return send(res, 404, { error: "Suhbat topilmadi." });
        const { text: messageText } = await readBody(req);
        const clean = String(messageText || "").trim().slice(0, 2000);
        if (!clean) return send(res, 400, { error: "Xabar matnini kiriting." });
        const message = {
          id: crypto.randomUUID(), chatId: chat.id, senderId: me.id,
          text: clean, createdAt: new Date().toISOString()
        };
        const messages = readMessages();
        messages.push(message);
        writeMessages(messages);
        return send(res, 201, { message: { ...message, sender: publicUser(me) } });
      }
    }

    if (req.method === "POST" && url.pathname === "/api/ai/evaluate") {
      const user = currentUser(req);
      const { type, answer, task, level } = await readBody(req);
      if (!["writing", "speaking"].includes(type)) return send(res, 400, { error: "Noto‘g‘ri mashq turi." });
      if (String(answer || "").trim().length < 15) return send(res, 400, { error: "Tahlil uchun kamida 15 ta belgi yozing yoki gapiring." });
      const prompt = type === "writing"
        ? `You are a careful IELTS and CEFR English writing tutor. Evaluate the student's writing. Return clear, constructive feedback in Uzbek. Do not claim an official score. Task: ${String(task || "General English writing").slice(0, 1000)}. Student target level: ${String(level || "B1-B2")}. Student text: ${String(answer).slice(0, 7000)}. Respond as valid JSON only with keys: estimated_ielts_band (number or null), estimated_cefr_level (string), strengths (array of strings), corrections (array of objects with original, improved, reason), criteria (object with task_response, coherence, vocabulary, grammar each containing score_out_of_9 and comment), improved_version (string), next_steps (array of strings), disclaimer (string saying this is an AI estimate, not an official result).`
        : `You are a supportive IELTS and CEFR speaking tutor. Analyze this speech transcript in Uzbek. Do not claim to measure pronunciation from text alone. Task: ${String(task || "IELTS Speaking practice").slice(0, 1000)}. Target: ${String(level || "B1-B2")}. Transcript: ${String(answer).slice(0, 5000)}. Return valid JSON only with keys: estimated_ielts_band (number or null), estimated_cefr_level (string), fluency_feedback (string), vocabulary_feedback (string), grammar_feedback (string), corrections (array of objects with original, improved, reason), better_answer (string), follow_up_questions (array of strings), pronunciation_note (string explaining that transcript-only assessment cannot reliably score pronunciation), disclaimer (string saying this is an AI estimate, not an official result).`;
      const result = await gemini(prompt);
      return send(res, 200, { result: safeJson(result) });
    }
    return serveStatic(url.pathname, res);
  } catch (error) {
    console.error(error);
    return send(res, error.status || 500, { error: error.message || "Serverda kutilmagan xato yuz berdi." });
  }
});

function serveStatic(pathname, res) {
  let requested = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
  const file = path.resolve(PUBLIC, requested);
  if (!file.startsWith(PUBLIC + path.sep) && file !== path.join(PUBLIC, "index.html")) return send(res, 403, { error: "Forbidden" });
  fs.readFile(file, (err, content) => {
    if (err) return send(res, 404, { error: "Sahifa topilmadi." });
    const ext = path.extname(file);
    const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml" };
    res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream", "X-Content-Type-Options": "nosniff" });
    res.end(content);
  });
}
server.listen(PORT, () => console.log(`Lingua AI ishlayapti: http://localhost:${PORT}`));
