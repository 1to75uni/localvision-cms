import {onRequestGet as command} from './player-command.js';
import {onRequestGet as notice} from './notice-active.js';
import {onRequestGet as black} from './black-mode.js';
import {json} from '../_lib/localvision-core.js';
// One HTTP request, independent read-only results. No schema maintenance or telemetry writes.
export async function onRequestGet(ctx) {
 const results=await Promise.allSettled([command(ctx),notice(ctx),black(ctx)]);
 const parts=await Promise.all(results.map(async r=>r.status==='fulfilled'?r.value.json():{ok:false,error:String(r.reason?.message||r.reason)}));
 const quota=parts.find(p=>p.errorCode==='LV-D1-QUOTA'||/D1.*(?:exceeded|limit)|daily row (?:write|read) limit/i.test(String(p.error||'')));
 if(quota)return json(quota,503,{'retry-after':'900'});
 return json({ok:true,command:parts[0],notice:parts[1],black:parts[2]});
}
