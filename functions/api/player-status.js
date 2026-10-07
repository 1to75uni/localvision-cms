import {json} from '../_lib/localvision-core.js'
import {limitedBody,saveHealth,readHealth,healthError} from '../_lib/playback-health.js'
export async function onRequestOptions(){return json({ok:true})}
export async function onRequestPost({request,env}) {
  try{return json(await saveHealth(env,await limitedBody(request)))}catch(error){return healthError(error)}
}
export async function onRequestGet({request,env}) {
  const url=new URL(request.url)
  try{return json(await readHealth(env,url.searchParams.get('store') || '',url.searchParams.get('deviceId') || ''))}catch(error){return healthError(error)}
}
