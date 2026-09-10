import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectMp4,validateProfile} from '../functions/_lib/media-inspection.js';
function box(type,...parts){const payload=Buffer.concat(parts),result=Buffer.alloc(payload.length+8);result.writeUInt32BE(result.length);result.write(type,4);payload.copy(result,8);return result}
function fixture({codec='avc1',width=1344,height=1080,delta=1000,profile=66}={}) {
  const visual=Buffer.alloc(78);visual.writeUInt16BE(width,24);visual.writeUInt16BE(height,26);
  const avcc=box('avcC',Buffer.from([1,profile,0,40]));
  const header=Buffer.alloc(8);header.writeUInt32BE(1,4);
  const stsd=box('stsd',header,box(codec,visual,avcc));
  const timing=Buffer.alloc(16);timing.writeUInt32BE(1,4);timing.writeUInt32BE(240,8);timing.writeUInt32BE(delta,12);
  const mdhd=Buffer.alloc(24);mdhd.writeUInt32BE(24000,12);mdhd.writeUInt32BE(240000,16);
  const moov=box('moov',box('trak',box('mdia',box('mdhd',mdhd),box('minf',box('stbl',stsd,box('stts',timing))))));
  return new Blob([box('ftyp',Buffer.from('isom0000')),box('mdat',Buffer.alloc(12)),moov]);
}
test('bounded MP4 parser reads a normal H.264 track including moov at end',async()=>{
  const info=validateProfile(await inspectMp4(fixture()));assert.equal(info.width,1344);assert.equal(info.height,1080);assert.equal(info.fps,24);assert.equal(info.profile,66);
});
test('HEVC upload gives an actionable rejection',async()=>{assert.throws(()=>validateProfile({codec:'hvc1',width:1920,height:1080,fps:30}),/H.264/)});
test('4K upload is rejected before R2 activation',()=>{assert.throws(()=>validateProfile({codec:'avc1',width:3840,height:2160,fps:30}),/해상도/)});
test('60fps upload is rejected',()=>{assert.throws(()=>validateProfile({codec:'avc1',width:1920,height:1080,fps:60}),/30fps/)});
test('high 10-bit AVC profile is rejected',async()=>{const info=await inspectMp4(fixture({profile:110}));assert.throws(()=>validateProfile(info),/프로파일/)});
test('corrupt MP4 cannot pass by filename extension',async()=>{await assert.rejects(()=>inspectMp4(new Blob(['corrupt.mp4 data'])),/MP4/)});
