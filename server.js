// 轻聊的零依赖实时服务端。运行：node server.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const root = __dirname;
const clients = new Set();
const rooms = new Map([['客厅', [
  { who: '小北', text: '欢迎来到轻聊！这是一个不用注册的匿名聊天室。', time: '刚刚' },
  { who: '小北', text: '可以发文字、表情和图片，也可以新建自己的房间。', time: '刚刚' }
]], ['悄悄话', []]]);

function broadcast(data) { for (const res of clients) res.write(`data: ${JSON.stringify(data)}\n\n`); }
function json(res, data, status = 200) { res.writeHead(status, {'Content-Type':'application/json; charset=utf-8'}); res.end(JSON.stringify(data)); }
function body(req) { return new Promise((resolve, reject) => { let raw=''; req.on('data', c => { raw+=c; if(raw.length>3*1024*1024) reject(Error('too large')); }); req.on('end', () => { try { resolve(JSON.parse(raw||'{}')); } catch { reject(Error('bad json')); } }); }); }
function clean(value, limit) { return typeof value === 'string' ? value.trim().slice(0, limit) : ''; }

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/events') {
    res.writeHead(200, {'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});
    res.write('data: {"type":"ready"}\n\n'); clients.add(res); req.on('close', () => clients.delete(res)); return;
  }
  if (url.pathname === '/api/state') return json(res, {rooms:[...rooms.keys()], messages:rooms.get(url.searchParams.get('room')) || []});
  if (url.pathname === '/api/room' && req.method === 'POST') {
    try { const name=clean((await body(req)).name, 30); if(!name) return json(res,{error:'房间名不能为空'},400); if(!rooms.has(name)) { rooms.set(name,[]); broadcast({type:'rooms'}); } return json(res,{name}); } catch { return json(res,{error:'请求无效'},400); }
  }
  if (url.pathname === '/api/message' && req.method === 'POST') {
    try { const m=await body(req), room=clean(m.room,30), who=clean(m.who,16)||'访客', text=clean(m.text,1000), image=typeof m.image==='string'&&m.image.startsWith('data:image/')&&m.image.length<2800000 ? m.image : ''; if(!rooms.has(room)||(!text&&!image)) return json(res,{error:'消息无效'},400); const msg={who,text,image,time:new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}; const list=rooms.get(room); list.push(msg); if(list.length>200) list.shift(); broadcast({type:'message',room,msg}); return json(res,{ok:true}); } catch { return json(res,{error:'图片过大或请求无效'},400); }
  }
  const target = url.pathname === '/' ? path.join(root,'index.html') : path.join(root, url.pathname);
  if (!target.startsWith(root) || !fs.existsSync(target)) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, {'Content-Type': target.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream'}); fs.createReadStream(target).pipe(res);
}).listen(process.env.PORT || 3000, () => console.log('轻聊已启动：http://localhost:3000'));
