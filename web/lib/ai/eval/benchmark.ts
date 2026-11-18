// Standalone cross-provider benchmark; production API remains unchanged.
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from 'node:process';
import { parseArgs } from 'node:util';
import { casesSchema, score, summarize, toCsv, type EvalRow } from './evaluation';
import { damagePositionOutput } from '../schema';
import { DAMAGE_PROMPT, DAMAGE_PROMPT_VERSION, damageJsonSchema } from '../prompts';
import { postJson, imagePart, AiRequestError } from '../providers';
import { compareDamage } from '../index';
import terms from '../../../../shared/samples/terms.json';

const {values}=parseArgs({options:{model:{type:'string'},run:{type:'string',default:'comparison'},'dry-run':{type:'boolean'},legacy:{type:'boolean'},set:{type:'string',default:'reference'},delay:{type:'string',default:'0'}}});
const here=dirname(fileURLToPath(import.meta.url));
async function main(){
 if(existsSync('.env.local'))loadEnvFile('.env.local');
 const model=values.model??process.env.AI_MODEL;
 if(!model||! /^(gemini-|gpt-)[a-z0-9.-]+$/.test(model))throw new Error('Invalid model');
 if(!/^[a-z0-9-]+$/.test(values.run!))throw new Error('Invalid run');
 if(!/^[a-z0-9-]+$/.test(values.set!))throw new Error('Invalid set');
 const source=resolve(here,values.set!,'cases.json');
 const cases=casesSchema.parse(JSON.parse(readFileSync(source,'utf8')));
 function url(name:string){
  const file=resolve(dirname(source),name),rel=relative(dirname(source),file);
  if(rel.startsWith('..')||isAbsolute(rel))throw new Error('Image outside dataset');
  const data=readFileSync(file);
  if(data[0]!==255||data[1]!==216)throw new Error('Expected JPEG');
  const value=`data:image/jpeg;base64,${data.toString('base64')}`;imagePart(value);return value;
 }
 for(const c of cases){url(c.before);url(c.after);}
 if(values['dry-run']){console.log(`Validated ${cases.length} real pairs; labels: ${[...new Set(cases.map(c=>c.expectVerdict))].join(',')}. No API called.`);return;}
 const provider=model.startsWith('gemini-')?'google':'openai';
 if(!(provider==='google'?process.env.AI_API_KEY:process.env.OPENAI_API_KEY)?.trim())throw new Error('Missing provider key');
 process.env.AI_MODEL=model;
 const dir=resolve(here,'results',`${values.run}-${model}`);
 if(existsSync(resolve(dir,'results.json')))throw new Error('Run exists; use another --run to preserve evidence');
 mkdirSync(dir,{recursive:true});
 writeFileSync(resolve(dir,'cases.snapshot.json'),readFileSync(source));
 const rows:EvalRow[]=[];
 const startedAt=new Date().toISOString();
 const save=()=>{
  writeFileSync(resolve(dir,'results.json'),JSON.stringify({startedAt,run:values.run,provider,model,endpoint:provider==='google'?(values.legacy?'generateContent':'interactions'):'responses',dataset:`${values.set}/cases.json`,qualification:'Provisional visual labels, not human ground truth. Rerun is stability, not held-out accuracy. Summary errors includes skipped rows; see requestCoverage.',requestCoverage:{attempted:rows.filter(r=>!r.error?.startsWith('SKIPPED')).length,skipped:rows.filter(r=>r.error?.startsWith('SKIPPED')).length},summary:summarize(rows),rows},null,2));
  writeFileSync(resolve(dir,'results.csv'),toCsv(rows));
 };
 for(const c of cases){
  const row:EvalRow={name:c.name,task:c.task,model,promptVersion:DAMAGE_PROMPT_VERSION,expected:c.expectVerdict,predicted:null,labelStatus:c.labelStatus,labelMatch:false,fieldsMatch:false,durationMs:0,error:null,output:null};
  const start=performance.now();
  try{
   const beforeUrl=url(c.before),afterUrl=url(c.after);
   let output;
   if(provider==='google'&&!values.legacy)output=(await compareDamage({positions:[{positionId:c.positionId,name:c.positionName,beforeUrl,afterUrl}],priceList:terms.priceList})).positions[0];
   else{
    for(let attempt=0;attempt<2;attempt++){
     try{
      let text:string;
      if(provider==='google'){
       const parts=[{text:DAMAGE_PROMPT},{text:JSON.stringify({priceList:terms.priceList.map(({id,item,unit})=>({id,item,unit}))})},{text:JSON.stringify({positionId:c.positionId,name:c.positionName,image:'TRƯỚC'})},{inlineData:{mimeType:'image/jpeg',data:beforeUrl.split(',')[1]}},{text:'SAU'},{inlineData:{mimeType:'image/jpeg',data:afterUrl.split(',')[1]}}];
       const raw=await postJson(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{'x-goog-api-key':process.env.AI_API_KEY!},{contents:[{role:'user',parts}],generationConfig:{responseMimeType:'application/json',responseJsonSchema:damageJsonSchema,maxOutputTokens:4096}}) as {candidates?:{finishReason:string;content?:{parts?:{text?:string;thought?:boolean}[]}}[]};
       if(raw.candidates?.[0]?.finishReason!=='STOP')throw new Error('Incomplete response');
       text=(raw.candidates[0].content?.parts??[]).filter(x=>!x.thought).map(x=>x.text??'').join('');
      }else{
      const raw=await postJson('https://api.openai.com/v1/responses',{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`},{model,store:false,max_output_tokens:4096,input:[{role:'user',content:[
       {type:'input_text',text:DAMAGE_PROMPT},
       {type:'input_text',text:JSON.stringify({priceList:terms.priceList.map(({id,item,unit})=>({id,item,unit}))})},
       {type:'input_text',text:JSON.stringify({positionId:c.positionId,name:c.positionName,image:'TRƯỚC'})},
       {type:'input_image',image_url:beforeUrl,detail:'high'},
       {type:'input_text',text:'SAU'},{type:'input_image',image_url:afterUrl,detail:'high'}
      ]}],text:{format:{type:'json_schema',name:'damage',strict:true,schema:damageJsonSchema}}}) as {status:string;output?:{type:string;content?:{type:string;text?:string}[]}[]};
      if(raw.status!=='completed')throw new Error('Incomplete response');
      text=(raw.output??[]).filter(x=>x.type==='message').flatMap(x=>x.content??[]).filter(x=>x.type==='output_text').map(x=>x.text??'').join('');
      }
      const out=damagePositionOutput.strict().parse(JSON.parse(text));
      if(out.positionId!==c.positionId)throw new Error('Invalid position');
      if(out.confidence<0.6)out.verdict='UNCLEAR';
      if(out.verdict!=='NEW_DAMAGE'){out.priceItemId=null;out.quantity=0;out.outsidePriceList=false;}
      else if(out.outsidePriceList){if(out.priceItemId!==null||out.quantity!==0)throw new Error('Invalid outside price');}
      else if(!terms.priceList.some(p=>p.id===out.priceItemId)||!Number.isSafeInteger(out.quantity)||out.quantity<1)throw new Error('Invalid deduction');
      output=out;break;
     }catch(e){
      if(e instanceof AiRequestError&&!e.retryable)throw e;
      if(attempt===1)throw e;
      await new Promise(r=>setTimeout(r,e instanceof AiRequestError?e.retryAfterMs:1000));
     }
    }
   }
   if(!output)throw new Error('No output');
   Object.assign(row,score(c,output),{predicted:output.verdict,output});
  }catch(e){row.error=e instanceof AiRequestError?e.message:e instanceof Error&&e.message.startsWith('AI_FAILED')?e.message:'Invalid output, timeout or provider configuration; no raw response logged';}
  row.durationMs=Math.round(performance.now()-start);rows.push(row);save();
  console.log(`${model} | ${c.name} | ${row.error?'ERROR':row.predicted} | ${row.durationMs}ms`);
  // --delay: nghỉ giữa các ca để không chạm giới hạn số lần gọi mỗi phút của gói miễn phí.
  if(Number(values.delay)>0)await new Promise(r=>setTimeout(r,Number(values.delay)));
  // Persistent authentication/quota errors cannot be fixed by sending the same 22 images again.
  if(row.error&&/HTTP (401|403|404|429)/.test(row.error)){
   for(const pending of cases.slice(rows.length))rows.push({...row,name:pending.name,expected:pending.expectVerdict,durationMs:0,error:'SKIPPED after provider access/quota error; not tested'});
   save();break;
  }
 }
 console.log(JSON.stringify(summarize(rows)));console.log(dir);
}
main().catch(()=>{console.error('Benchmark could not start: check arguments, cases, images, keys or existing run name.');process.exitCode=1;});
