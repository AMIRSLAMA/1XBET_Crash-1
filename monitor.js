const http = require("http");
const { spawn } = require("child_process");
const { exec } = require("child_process");

const PORT = 3035;
let lastEvent = null;
let clients = new Set();

const html = String.raw`<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Crash Alert</title>
<style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:#090b10;color:#fff;font-family:Tahoma,Arial;display:grid;place-items:center}
main{text-align:center;padding:24px}.circle{width:220px;height:220px;border:9px solid #29303a;border-radius:50%;margin:0 auto 24px;display:grid;place-items:center;background:#111720;box-shadow:0 0 35px #000;transition:.2s}
.circle svg{width:100px;height:100px;fill:#687383}.label{font-size:42px;font-weight:900;color:#7d8795;letter-spacing:1px}
body.danger .circle{border-color:#ff2638;background:#360b12;box-shadow:0 0 24px #ff2638,0 0 70px #a90018}
body.danger .circle svg{fill:#ff3447}body.danger .label{color:#ff3447;animation:pulse .55s infinite alternate}
.small{color:#929ba8;margin-top:16px;font-size:13px}
@keyframes pulse{to{opacity:.35;transform:scale(1.06)}}
</style></head><body><main>
<div class="circle"><svg viewBox="0 0 24 24"><path d="M12 2 1 21h22L12 2zm1 15h-2v-2h2v2zm0-4h-2V9h2v4z"/></svg></div>
<div class="label" id="label">مراقبة</div><div class="small" id="status">في انتظار أحداث اللعبة</div>
</main>
<script>
let audio=null,osc=null,gain=null,beeping=false;
function siren(){try{audio=audio||new (window.AudioContext||window.webkitAudioContext)();if(audio.state==="suspended")audio.resume();if(beeping)return;beeping=true;osc=audio.createOscillator();gain=audio.createGain();osc.type="sawtooth";osc.frequency.value=880;gain.gain.value=.07;osc.connect(gain);gain.connect(audio.destination);osc.start();let high=true;window._siren=setInterval(()=>{if(!osc)return;high=!high;osc.frequency.setTargetAtTime(high?1050:620,audio.currentTime,.06)},350)}catch(e){}}
function alarm(data){document.body.classList.add("danger");document.getElementById("label").textContent="اسحب";document.getElementById("status").textContent="تم رصد انتهاء الجولة فعليًا · "+(data.roundId||"");siren()}
function clearAlarm(){document.body.classList.remove("danger");document.getElementById("label").textContent="مراقبة";document.getElementById("status").textContent="في انتظار الجولة التالية";if(window._siren)clearInterval(window._siren);if(osc){try{osc.stop()}catch(e){}osc=null}beeping=false}
document.body.addEventListener("click",()=>{if(audio&&audio.state==="suspended")audio.resume()});
const es=new EventSource("/events");es.onmessage=e=>{const d=JSON.parse(e.data);if(d.kind==="crash")alarm(d);else if(d.kind==="reset")clearAlarm()};
</script></body></html>`;

const server = http.createServer((req,res)=>{
  if(req.method==="GET" && req.url==="/"){res.writeHead(200,{"content-type":"text/html; charset=utf-8"});return res.end(html)}
  if(req.method==="GET" && req.url==="/events"){
    res.writeHead(200,{"content-type":"text/event-stream","cache-control":"no-cache","connection":"keep-alive"});
    res.write("retry: 1500\n\n");clients.add(res);
    if(lastEvent)res.write("data: "+JSON.stringify(lastEvent)+"\n\n");
    req.on("close",()=>clients.delete(res));return;
  }
  if(req.method==="POST" && req.url==="/event"){
    let body="";req.on("data",c=>body+=c);req.on("end",()=>{try{const data=JSON.parse(body);lastEvent=data;const packet="data: "+JSON.stringify(data)+"\n\n";for(const c of clients)c.write(packet);res.writeHead(204);res.end()}catch{res.writeHead(400);res.end()}});return;
  }
  res.writeHead(404);res.end();
});
server.listen(PORT,"127.0.0.1",()=>{
 console.log("Crash Alert UI: http://127.0.0.1:"+PORT);
 if(process.platform==="win32")exec('start "" "http://127.0.0.1:'+PORT+'"');
 const capture=spawn(process.execPath,["1xbet_crash_cf_capture.js"],{stdio:"inherit"});
 capture.on("exit",code=>{console.log("Capture process exited:",code)});
});
process.on("SIGINT",()=>{server.close();process.exit(0)});
