// 奶茶审批局 - 零依赖 Node 后端
// 仅使用 Node 内置模块，无需 npm install
// 启动：node server.js   （默认端口 3000，可用 PORT 环境变量覆盖）
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

// ---------- 简易 JSON 数据库 ----------
function loadDB() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch (e) {
    return { items: {} };
  }
}
function saveDB(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}
let db = loadDB();

function genNo() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  const date = '' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
  const rand = crypto.randomBytes(2).toString('hex').toUpperCase();
  return 'OA-' + date + '-' + rand;
}

// ---------- 工具 ----------
function sendJSON(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => (data += c));
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); }
    });
  });
}
function calcStatus(item) {
  const votes = item.votes || [];
  if (votes.length === 0) return 'pending';
  const pass = votes.filter(v => v.type === 'pass').length;
  const reject = votes.filter(v => v.type === 'reject').length;
  if (pass > reject) return 'pass';
  if (reject > pass) return 'reject';
  return 'pending';
}
function publicItem(item) {
  return Object.assign({}, item, { status: calcStatus(item) });
}

// ---------- 静态文件 ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript', '.png': 'image/png', '.svg': 'image/svg+xml' };
function serveStatic(req, res) {
  let urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (urlPath === '/' || urlPath === '') urlPath = '/index.html';
  const filePath = path.join(PUBLIC_DIR, path.normalize(urlPath).replace(/^(\.\.[\/\\])+/, ''));
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(filePath, (err, buf) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(buf);
  });
}

// ---------- 路由 ----------
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = u.pathname;

  // 列表
  if (p === '/api/approvals' && req.method === 'GET') {
    const list = Object.values(db.items).map(publicItem).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return sendJSON(res, 200, list);
  }
  // 创建
  if (p === '/api/approvals' && req.method === 'POST') {
    try {
      const b = await readBody(req);
      const item = {
        _id: crypto.randomUUID(),
        no: genNo(),
        title: b.title || '喝不喝奶茶',
        price: Number(b.price) || 0,
        applicant: b.applicant || '匿名',
        reason: b.reason || '',
        votes: [],
        createdAt: Date.now()
      };
      db.items[item._id] = item;
      saveDB(db);
      return sendJSON(res, 200, publicItem(item));
    } catch (e) { return sendJSON(res, 400, { error: '参数错误' }); }
  }
  // 详情 / 投票
  const m = p.match(/^\/api\/approvals\/([^/]+)(\/vote)?$/);
  if (m) {
    const id = m[1];
    const item = db.items[id];
    if (!item) return sendJSON(res, 404, { error: '审批单不存在' });
    if (m[2] && req.method === 'POST') {
      try {
        const b = await readBody(req);
        if (b.type !== 'pass' && b.type !== 'reject') return sendJSON(res, 400, { error: '投票类型错误' });
        const name = (b.name || '').trim();
        const votes = (item.votes || []).filter(v => !(name && v.name === name)); // 同名覆盖上次票
        votes.push({ type: b.type, name, ts: Date.now() });
        item.votes = votes;
        db.items[id] = item;
        saveDB(db);
        return sendJSON(res, 200, publicItem(item));
      } catch (e) { return sendJSON(res, 400, { error: '参数错误' }); }
    }
    if (req.method === 'GET') return sendJSON(res, 200, publicItem(item));
  }

  // 静态资源
  if (req.method === 'GET') return serveStatic(req, res);
  res.writeHead(404); res.end('Not found');
});

server.listen(PORT, () => {
  console.log('奶茶审批局已启动： http://localhost:' + PORT);
});
