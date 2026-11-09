const router = require('express').Router();
const arena = require('../services/arenaService');
const arenaMap = require('../config/arenaMap');
const Team = require('../models/Team');
const { sessionTeam } = require('../middlewares/auth');
const origin = process.env.FORCAD_URL || 'http://127.0.0.1:18080';

router.get('/scoreboard', (req,res) => {
 if(process.env.CRYPTO_MODE === '1') return res.redirect(302,'/crypto/');
 // Đội đang đăng nhập (đội trưởng hoặc thành viên token): form nộp flag dùng token của đội này.
 // Trình duyệt khớp arenaKeys với danh sách đội ForcAD để khóa ô "Đội của bạn".
 const session = sessionTeam(req);
 const forcadName = session ? Team.forcadNameOf(session.team) : '';
 const submitTeam = session ? {name:session.team.name, arenaKeys:[forcadName.toLowerCase()], forcadName} : null;
 res.render('scoreboard',{layout:false,title:'WORLD ARENA',worldGamePage:true,arenaMap,zodiac:arena.ZODIAC,submitTeam});
});
// Trạng thái gộp (điểm, đội + con giáp, service, capture, checker): SSE đẩy trực tiếp, JSON + ETag làm dự phòng.
router.get('/scoreboard/stream', (req,res) => arena.subscribe(req,res));
router.get('/scoreboard/state', (req,res) => arena.sendState(req,res).catch(() => res.status(503).json({ok:false,error:'Scoreboard temporarily unavailable'})));
// Fixed read-only upstream routes: never relay cookies, credentials or admin APIs.
for (const endpoint of ['tick-status','teams','arena']) {
 router.get('/scoreboard/data/'+endpoint, async (req,res) => {
  res.set('Cache-Control','no-store');
  try {
   const response = await fetch(new URL('/api/client/'+endpoint+'/',origin),{signal:AbortSignal.timeout(6000),redirect:'error'});
   if (!response.ok) throw Error('upstream');
   const data = await response.json();
   // defends: feed tùy chọn các lần nộp flag bị chặn (hết hạn/sai định dạng/trùng); chỉ giữ trường công khai.
   const defends = Array.isArray(data.defends) ? data.defends.slice(0,50).map(x => ({tick:x.tick,attacker:x.attacker,victim:x.victim,service:x.service,reason:x.reason,time:x.time})) : [];
   if (endpoint === 'arena') return res.json({services:data.services,captures:data.captures,checks:data.checks,defends});
   if (endpoint === 'teams') return res.json(data.map(t => ({id:t.id,name:t.name})));
   return res.json({mode:data.mode,round:data.round,tick:data.tick,phase:data.phase,deadline:data.deadline,tick_seconds:data.tick_seconds,ticks_per_round:data.ticks_per_round,sla_max:data.sla_max,lab:data.lab,max_rounds:data.max_rounds,scores:data.scores,results:data.results,running:data.running,overall_tick:data.overall_tick});
  } catch (_) {res.status(503).json({error:'Scoreboard temporarily unavailable'});}
 });
}
// Nộp flag: token lấy từ đội của phiên đăng nhập (không nhận token từ trình duyệt),
// nên ForcAD luôn cộng điểm cho đúng đội đang đăng nhập.
router.post('/scoreboard/submit', async(req,res)=>{
 res.set('Cache-Control','no-store');
 const session = sessionTeam(req);
 if(!session)return res.status(401).json({error:'Đăng nhập bằng tài khoản đội trưởng hoặc token đội để nộp flag.'});
 const {flags}=req.body||{};
 if(!Array.isArray(flags)||flags.length<1||flags.length>100||flags.some(f=>typeof f!=='string'||f.length>100))return res.status(400).json({error:'Kiểm tra danh sách flag (tối đa 100).'});
 try{const upstream=await fetch(new URL('/flags/',origin),{method:'PUT',headers:{'Content-Type':'application/json','X-Team-Token':session.team.token},body:JSON.stringify(flags),signal:AbortSignal.timeout(8000),redirect:'error'});res.status(upstream.status).json(await upstream.json());}catch(_){res.status(503).json({error:'Bộ nhận flag chưa kết nối được.'});}
});
module.exports=router;
