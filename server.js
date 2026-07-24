// 轻聊的零依赖实时服务端。运行：node server.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = __dirname;
const clients = new Set();
const adminTokens = new Set();
const bannedNames = new Set();
let announcement = '';
const rooms = new Map([['客厅', [
  { who: '小北', text: '欢迎来到轻聊！这是一个不用注册的匿名聊天室。', time: '刚刚' },
  { who: '小北', text: '可以发文字、表情和图片，也可以新建自己的房间。', time: '刚刚' }
]], ['悄悄话', []]]);

function broadcast(data) { for (const res of clients) res.write(`data: ${JSON.stringify(data)}\n\n`); }
function json(res, data, status = 200) { res.writeHead(status, {'Content-Type':'application/json; charset=utf-8'}); res.end(JSON.stringify(data)); }
function body(req) { return new Promise((resolve, reject) => { let raw=''; req.on('data', c => { raw+=c; if(raw.length>3*1024*1024) reject(Error('too large')); }); req.on('end', () => { try { resolve(JSON.parse(raw||'{}')); } catch { reject(Error('bad json')); } }); }); }
function clean(value, limit) { return typeof value === 'string' ? value.trim().slice(0, limit) : ''; }
function isAdmin(req) { return adminTokens.has(req.headers['x-admin-token']); }
function newId() { return crypto.randomBytes(12).toString('hex'); }

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/events') {
    res.writeHead(200, {'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});
    res.write('data: {"type":"ready"}\n\n'); clients.add(res); req.on('close', () => clients.delete(res)); return;
  }
  if (url.pathname === '/api/state') return json(res, {rooms:[...rooms.keys()], messages:rooms.get(url.searchParams.get('room')) || [], announcement});
  if (url.pathname === '/api/admin/login' && req.method === 'POST') {
    try { const password = (await body(req)).password; if(!process.env.ADMIN_PASSWORD) return json(res,{error:'管理员功能尚未设置'},503); if(typeof password !== 'string' || password !== process.env.ADMIN_PASSWORD) return json(res,{error:'密码不正确'},401); const token=newId(); adminTokens.add(token); return json(res,{token}); } catch { return json(res,{error:'请求无效'},400); }
  }
  if (url.pathname === '/api/admin/message' && req.method === 'DELETE') {
    if(!isAdmin(req)) return json(res,{error:'需要房主权限'},401);
    try { const {room,id}=await body(req); const list=rooms.get(clean(room,30)); if(!list) return json(res,{error:'房间不存在'},404); const index=list.findIndex(m=>m.id===id); if(index<0) return json(res,{error:'消息不存在'},404); list.splice(index,1); broadcast({type:'refresh',room}); return json(res,{ok:true}); } catch { return json(res,{error:'请求无效'},400); }
  }
  if (url.pathname === '/api/admin/ban' && req.method === 'POST') {
    if(!isAdmin(req)) return json(res,{error:'需要房主权限'},401);
    try { const name=clean((await body(req)).name,16); if(!name) return json(res,{error:'昵称无效'},400); bannedNames.add(name); broadcast({type:'admin'}); return json(res,{ok:true}); } catch { return json(res,{error:'请求无效'},400); }
  }
  if (url.pathname === '/api/admin/announcement' && req.method === 'POST') {
    if(!isAdmin(req)) return json(res,{error:'需要房主权限'},401);
    try { announcement=clean((await body(req)).announcement,160); broadcast({type:'announcement',announcement}); return json(res,{ok:true}); } catch { return json(res,{error:'请求无效'},400); }
  }
  if (url.pathname === '/api/room' && req.method === 'POST') {
    try { const name=clean((await body(req)).name, 30); if(!name) return json(res,{error:'房间名不能为空'},400); if(!rooms.has(name)) { rooms.set(name,[]); broadcast({type:'rooms'}); } return json(res,{name}); } catch { return json(res,{error:'请求无效'},400); }
  }
  if (url.pathname === '/api/message' && req.method === 'POST') {
    try { const m=await body(req), room=clean(m.room,30), who=clean(m.who,16)||'访客', text=clean(m.text,1000), image=typeof m.image==='string'&&m.image.startsWith('data:image/')&&m.image.length<2800000 ? m.image : ''; if(bannedNames.has(who)) return json(res,{error:'你已被禁言'},403); if(!rooms.has(room)||(!text&&!image)) return json(res,{error:'消息无效'},400); const msg={id:newId(),who,text,image,time:new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}; const list=rooms.get(room); list.push(msg); if(list.length>200) list.shift(); broadcast({type:'message',room,msg}); return json(res,{ok:true}); } catch { return json(res,{error:'图片过大或请求无效'},400); }
  }
  const target = url.pathname === '/' ? path.join(root,'index.html') : path.join(root, url.pathname);
  if (!target.startsWith(root) || !fs.existsSync(target)) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, {'Content-Type': target.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream'}); fs.createReadStream(target).pipe(res);
}).listen(process.env.PORT || 3000, () => console.log('轻聊已启动：http://localhost:3000'));
