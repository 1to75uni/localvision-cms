import test from 'node:test';import assert from 'node:assert/strict';
import {onRequestGet} from '../functions/api/player-control.js';
function context(fail=''){
 const history=[];
 return {history,request:new Request('https://test/api/player-control?store=qa'),env:{DB:{prepare(sql){history.push(sql);return {bind(){return this},async first(){if(sql.includes('black_modes')&&fail)throw new Error(fail);return null}}}}}};
}
test('control endpoint combines three independent read-only states in one HTTP response',async()=>{
 const ctx=context(),response=await onRequestGet(ctx),body=await response.json();
 assert.equal(response.status,200);assert.ok(body.command.ok&&body.notice.ok&&body.black.ok);assert.equal(ctx.history.length,3);assert.ok(ctx.history.every(s=>/^\s*SELECT/.test(s)));
});
test('a failed black-mode read never turns a stored holiday off as a successful response',async()=>{
 const body=await (await onRequestGet(context('database unavailable'))).json();
 assert.equal(body.black.ok,false);assert.equal(body.command.ok,true);assert.equal(body.notice.ok,true);
});
test('quota failure in one control subquery propagates to the common retry circuit',async()=>{
 const r=await onRequestGet(context('D1_ERROR: exceeded daily row write limit'));
 assert.equal(r.status,503);assert.equal((await r.json()).errorCode,'LV-D1-QUOTA');
});
