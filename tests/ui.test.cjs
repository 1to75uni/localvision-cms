const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../assets/lv-playback-health-v210.js'),'utf8');
async function ui({healthFailed=false,logsFailed=false,title='정상 영상',delivery={}}={}) {
  const listeners={},root={isConnected:true,innerHTML:'',classList:{add(){}},addEventListener:(name,fn)=>listeners[name]=fn};
  const selection={innerHTML:'',add(){},addEventListener(){}};
  const ctx=vm.createContext({URL,URLSearchParams,Date,AbortController,Response,Blob,Option:function(){},console,setTimeout,clearTimeout,setInterval(){},
    location:{search:'?store=qa',href:'https://cms.test/playback-health.html?store=qa'},history:{replaceState(){}},
    document:{hidden:false,getElementById:id=>id==='lvHealthRoot'?root:selection},
    fetch:async url=>{
      if((url.includes('player-status')&&healthFailed)||(url.includes('player-errors')&&logsFailed))return new Response('{"ok":false,"error":"injected failure"}',{status:503});
      const body=url.includes('player-status')?{ok:true,devices:[{deviceId:'device-a',store:'qa',delivery,status:'degraded',left:{status:'playing',title,fileName:'left.mp4',type:'video'},right:{status:'fallback',exclusions:[{fileName:'bad.mp4',side:'right',reason:'지원 형식 오류',failCount:2,retryAt:1700000000000}]}}]}:url.includes('player-errors')?{ok:true,errors:[{id:'e',level:'error',errorCode:'LV-MEDIA-FAIL',message:'실패 기록',extra:{side:'right',fileName:'bad.mp4'}}]}:{ok:true,stores:[]};
      return new Response(JSON.stringify(body));
    }});
  ctx.window=ctx;vm.runInContext(source,ctx);await new Promise(setImmediate);await new Promise(setImmediate);return {root,listeners,ctx};
}
test('diagnostic UI includes independent lanes and current excluded filenames',async()=>{const h=await ui();assert.match(h.root.innerHTML,/왼쪽 70%/);assert.match(h.root.innerHTML,/오른쪽 30%/);assert.match(h.root.innerHTML,/bad.mp4/);assert.match(h.root.innerHTML,/일부 송출 장애/)});
test('database read failure is shown as unavailable, never no errors',async()=>{const h=await ui({healthFailed:true,logsFailed:true});assert.match(h.root.innerHTML,/기기 상태 조회 실패/);assert.match(h.root.innerHTML,/오류가 없다는 뜻이 아닙니다/)});
test('untrusted content titles are escaped',async()=>{const h=await ui({title:'<img src=x onerror=alert(1)>'});assert.ok(!h.root.innerHTML.includes('<img src=x'));assert.match(h.root.innerHTML,/&lt;img/)});

test('delivery UI distinguishes file preparation from playing and legacy assurance',async()=>{const h=await ui({delivery:{phase:'blocked',completed:2,total:3,verified:1,legacy:1,error:'hash mismatch',prefetch:{phase:'ready',group:'점심',total:4,completed:4}}});assert.match(h.root.innerHTML,/원본 대조 미완료 1개/);assert.match(h.root.innerHTML,/hash mismatch/);assert.match(h.root.innerHTML,/점심/);assert.match(h.root.innerHTML,/기존 파일 원본 검증 정보 생성/)});
