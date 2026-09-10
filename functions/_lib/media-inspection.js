// Bounded MP4 metadata inspection. No video decoding or transcoding in a request worker.
const code=(bytes,at)=>String.fromCharCode(...bytes.subarray(at,at+4))
function atom(bytes,at,end) {
  if(at+8>end)return null
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength)
  let size=view.getUint32(at),header=8
  if(size===1){if(at+16>end)return null;const high=view.getUint32(at+8);size=high*4294967296+view.getUint32(at+12);header=16}
  if(size===0)size=end-at
  if(!Number.isSafeInteger(size)||size<header||at+size>end)return null
  return {at,size,header,type:code(bytes,at+4),end:at+size,payload:at+header}
}
function children(bytes,start,end) {const result=[];for(let at=start;at+8<=end;){const a=atom(bytes,at,end);if(!a)break;result.push(a);at=a.end;if(result.length>10000)break}return result}
export function inspectMoov(bytes) {
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),tracks=[]
  const root=atom(bytes,0,bytes.length)
  if(root?.type!=='moov')throw new Error('MP4 moov 구조가 올바르지 않습니다.')
  for(const trak of children(bytes,root.payload,root.end).filter(a=>a.type==='trak')) {
    const track={codec:'',width:0,height:0,timescale:0,ticks:0,samples:0,deltas:new Set(),duration:0,profile:0,level:0}
    const walk=(start,end,depth=0)=>{
      if(depth>8)return
      for(const a of children(bytes,start,end)) {
        if(a.type==='mdhd'){
          const p=a.payload,version=bytes[p],offset=version===1?20:12
          if(p+offset+8<=a.end){track.timescale=view.getUint32(p+offset);track.duration=version===1?(p+offset+12<=a.end?(view.getUint32(p+offset+4)*4294967296+view.getUint32(p+offset+8))/track.timescale:0):view.getUint32(p+offset+4)/track.timescale}
        }
        if(a.type==='stsd' && a.payload+8<=a.end){
          for(const entry of children(bytes,a.payload+8,a.end))if(['avc1','avc3','hvc1','hev1','av01','vp09','mp4v'].includes(entry.type)){
            track.codec=entry.type
            if(entry.at+36<=entry.end){track.width=view.getUint16(entry.at+32);track.height=view.getUint16(entry.at+34)}
            for(const cfg of children(bytes,entry.at+86,entry.end))if(cfg.type==='avcC' && cfg.payload+4<=cfg.end){track.profile=bytes[cfg.payload+1];track.level=bytes[cfg.payload+3]}
          }
        }
        if(a.type==='stts' && a.payload+8<=a.end){
          const count=Math.min(view.getUint32(a.payload+4),100000)
          for(let i=0;i<count && a.payload+16+i*8<=a.end;i++){
            const at=a.payload+8+i*8,samples=view.getUint32(at),delta=view.getUint32(at+4)
            track.samples+=samples;track.ticks+=samples*delta;track.deltas.add(delta)
          }
        }
        if(['mdia','minf','stbl'].includes(a.type))walk(a.payload,a.end,depth+1)
      }
    }
    walk(trak.payload,trak.end)
    if(track.codec)tracks.push({codec:track.codec,profile:track.profile,level:track.level,width:track.width,height:track.height,duration:Number.isFinite(track.duration)?track.duration:0,fps:track.ticks&&track.timescale?track.samples*track.timescale/track.ticks:0,variableFrameRate:track.deltas.size>1})
  }
  if(tracks.length!==1)throw new Error('영상 트랙이 하나인 MP4 파일로 내보내 주세요.')
  return tracks[0]
}
export async function inspectMp4(file) {
  let offset=0,moov=null,ftyp=false
  for(let n=0;n<256 && offset+8<=file.size;n++) {
    const bytes=new Uint8Array(await file.slice(offset,Math.min(file.size,offset+16)).arrayBuffer()),view=new DataView(bytes.buffer)
    let size=view.getUint32(0),header=8
    if(size===1){if(bytes.length<16)break;size=view.getUint32(8)*4294967296+view.getUint32(12);header=16}
    if(size===0)size=file.size-offset
    if(!Number.isSafeInteger(size)||size<header||offset+size>file.size)throw new Error('MP4 파일이 잘렸거나 구조가 손상됐습니다.')
    const type=code(bytes,4)
    if(type==='ftyp')ftyp=true
    if(type==='moov'){
      if(size>8*1024*1024)throw new Error('MP4 메타데이터가 너무 큽니다. 송출용 H.264 MP4로 다시 내보내 주세요.')
      moov=new Uint8Array(await file.slice(offset,offset+size).arrayBuffer())
    }
    offset+=size
  }
  if(!ftyp || !moov)throw new Error('재생 가능한 MP4 메타데이터를 찾지 못했습니다. H.264 MP4로 내보내 주세요.')
  return inspectMoov(moov)
}
export function validateProfile(info, env={}) {
  if(!['avc1','avc3'].includes(info.codec))throw new Error('안정적인 TV 송출을 위해 H.264 코덱의 MP4로 내보내 주세요. 현재 코덱: '+info.codec)
  if(info.profile && ![66,77,88,100].includes(info.profile))throw new Error('지원 대상 H.264 프로파일이 아닙니다. 8비트 H.264 Baseline 또는 Main으로 내보내 주세요.')
  const maxPixels=Number(env.MAX_VIDEO_PIXELS || 2073600),maxFps=Number(env.MAX_VIDEO_FPS || 30.1)
  if(!info.width || !info.height || info.width*info.height>maxPixels)throw new Error('영상 해상도가 송출 기준을 초과합니다. 1920×1080 이하 화소 수로 내보내 주세요. 권장: 왼쪽 1344×1080, 오른쪽 576×1080.')
  if(info.fps>maxFps)throw new Error('영상은 30fps 이하로 내보내 주세요. 현재 '+info.fps.toFixed(2)+'fps입니다.')
  return {validated:true,...info,warnings:[...(info.variableFrameRate?['가변 프레임 영상입니다. 일정한 24~30fps 내보내기를 권장합니다.']:[]),...(!info.fps?['프레임 속도를 판독하지 못했습니다. 기기 재생 검증이 필요합니다.']:[])]}
}
