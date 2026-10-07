import {smallUpload} from '../_lib/media-upload-v3.js'
import {reply} from '../_lib/sync-v3.js'
import {isAuthorized} from '../_lib/auth.js'
export const onRequestOptions=()=>reply({ok:true})
export async function onRequestPost({request,env}){
 if(!await isAuthorized(request,env))return reply({ok:false,error:'CMS 로그인 필요'},401)
 try{const form=await request.formData();form.set('side','notice');return reply(await smallUpload(request,env,form))}catch(e){return reply({ok:false,error:e.message},503)}
}
