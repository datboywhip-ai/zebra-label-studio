#!/usr/bin/env node
'use strict';
// Standalone stdio MCP adapter. stdout is reserved exclusively for JSON-RPC.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),readline=require('node:readline');
const {spawn}=require('node:child_process');
const packaged=path.basename(path.dirname(__dirname))==='resources';
const base=packaged?path.resolve(__dirname,'..','..'):__dirname;
const dataDir=process.env.ZEBRA_STUDIO_DATA||(packaged?path.join(base,'..','data'):path.join(base,'data'));
const connectionPath=path.join(dataDir,'connection.json');
const objectSchema={type:'object',properties:{id:{type:'string'},type:{type:'string',enum:['text','rect','ellipse','line','image','barcode','qrcode']},x:{type:'number',minimum:0},y:{type:'number',minimum:0},w:{type:'number',minimum:.2},h:{type:'number',minimum:.2},text:{type:'string'},fontSize:{type:'number',minimum:1,maximum:100},fontFamily:{type:'string'},bold:{type:'boolean'},italic:{type:'boolean'},align:{type:'string',enum:['left','center','right']},rotation:{type:'number',minimum:-360,maximum:360},strokeWidth:{type:'number',minimum:0,maximum:20},fill:{type:'string'},color:{type:'string'},src:{type:'string',description:'Embedded PNG/JPEG/WebP data URL from import_image or supplied by client'},fit:{type:'string',enum:['contain','cover','stretch']},showText:{type:'boolean'},crop:{type:'object',properties:{x:{type:'number',minimum:0,maximum:1},y:{type:'number',minimum:0,maximum:1},w:{type:'number',minimum:.01,maximum:1},h:{type:'number',minimum:.01,maximum:1}}}},required:['type','x','y','w','h']};
const designSchema={type:'object',properties:{id:{type:'string',description:'Omit for a new UUID. Reuse to update an existing design.'},name:{type:'string'},widthMm:{type:'number',minimum:10,maximum:104},heightMm:{type:'number',minimum:10,maximum:991},objects:{type:'array',maxItems:200,items:objectSchema}},required:['name','widthMm','heightMm','objects']};
const ref={id:{type:'string',description:'Saved design id'},design:designSchema,variables:{type:'object',additionalProperties:{type:'string'},description:'Replacement values for {{variable}} fields'},threshold:{type:'number',minimum:0,maximum:255},dither:{type:'boolean'}};
function tool(name,description,properties={},required=[],readOnly=true){return {name,description,inputSchema:{type:'object',properties,required,additionalProperties:false},annotations:{readOnlyHint:readOnly,destructiveHint:false,idempotentHint:readOnly,openWorldHint:false}};}
const tools=[
 tool('studio_status','Get local app, selected printer, storage and driver status.'),
 tool('list_printers','List installed Windows printer queues; select the Zebra queue in the desktop app.'),
 tool('printer_diagnostics','Read USB identity, readiness, firmware and ZPL configuration from the connected Zebra. Set printNative=true only when the user requests one physical text-only diagnostic label.',{printer:{type:'string'},printNative:{type:'boolean'}},[],false),
 tool('list_templates','Get editable product, shipping, address and inventory starter designs. All coordinates and font sizes are millimetres.'),
 tool('list_designs','List saved editable labels.'),
 tool('get_design','Read the full editable design JSON.',{id:{type:'string'}},['id']),
 tool('save_design','Create or update an editable label. Coordinates and sizes are in millimetres. Printer is monochrome, 203 dpi. Text supports {{variables}}. Objects must remain inside the label. Use preview_label to inspect before printing.',{design:designSchema},['design'],false),
 tool('open_design','Show a saved or supplied design in the desktop designer.',{id:{type:'string'},design:designSchema},[],false),
 tool('import_image','Read a local PNG, JPEG or WebP as an embedded data URL for an image element. Supply an absolute local image path.',{path:{type:'string'}},['path']),
 tool('import_pdf','Render a page of a local PDF into an embedded PNG data URL. Place the returned src on an image element. PDF stays local; maximum 20 MB.',{path:{type:'string'},page:{type:'integer',minimum:1}},['path']),
 tool('preview_label','Render a supplied or saved label as a monochrome PNG. Provide id or design. Returns image content and layout warnings.',ref),
 tool('export_zpl','Generate printer-ready ZPL graphics without printing. Provide id or design.',{...ref,copies:{type:'integer',minimum:1,maximum:100}}),
 tool('print_label','PHYSICAL PRINT: submit a rendered label to the selected Zebra Windows USB printer queue. Use only when the user requests printing. Provide id or design. Result confirms spooler submission, not physical completion.',{...ref,printer:{type:'string'},copies:{type:'integer',minimum:1,maximum:100}},[],false),
 tool('print_history','Read recent spooler submissions and failures.')
];
const methods={studio_status:'status',list_templates:'templates',print_history:'history'};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function readConnection(){try{return JSON.parse(fs.readFileSync(connectionPath,'utf8'));}catch{return null;}}
function request(c,method,args){return new Promise((resolve,reject)=>{
 if(!c||!Number.isInteger(c.port)||c.port<1||c.port>65535||typeof c.token!=='string')return reject(new Error('Studio is not running'));
 const body=JSON.stringify({method,args});const req=http.request({hostname:'127.0.0.1',port:c.port,path:'/rpc',method:'POST',headers:{Authorization:`Bearer ${c.token}`,'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)},timeout:120000},res=>{let s='';res.on('data',b=>{s+=b;if(s.length>40*1024*1024)req.destroy(new Error('Response too large'));});res.on('end',()=>{try{const r=JSON.parse(s);if(r.error)reject(new Error(r.error));else resolve(r.result);}catch(e){reject(e);}});});req.on('error',reject);req.on('timeout',()=>req.destroy(new Error('Studio request timed out')));req.end(body);
 });}
let started=false;
async function ensure(){let c=readConnection();try{await request(c,'status',{});return c;}catch{}
 if(!started){let exe=process.env.ZEBRA_STUDIO_APP||(packaged?process.execPath:require('electron'));const args=packaged?['--service']:[process.env.ZEBRA_STUDIO_SOURCE||__dirname,'--service'];const env={...process.env,ZEBRA_STUDIO_DATA:dataDir};delete env.ELECTRON_RUN_AS_NODE;const child=spawn(exe,args,{detached:true,stdio:'ignore',windowsHide:true,env});child.on('error',e=>process.stderr.write('Studio launch failed: '+e.message+'\n'));child.unref();started=true;}
 for(let i=0;i<100;i++){await sleep(250);c=readConnection();try{await request(c,'status',{});return c;}catch{}}
 throw new Error('Could not start Zebra Label Studio. Open the desktop app and retry.');
}
function send(v){process.stdout.write(JSON.stringify(v)+'\n');}
let initialized=false;
async function handle(line){let r;try{r=JSON.parse(line);}catch{send({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}});return;}
 if(!r||typeof r!=='object'||Array.isArray(r)||r.jsonrpc!=='2.0'||typeof r.method!=='string'){send({jsonrpc:'2.0',id:r?.id??null,error:{code:-32600,message:'Invalid request'}});return;}
 if(r.id===undefined)return;
 try{let result;
  if(r.method==='initialize'){initialized=true;const supported=['2024-11-05','2025-03-26','2025-06-18','2025-11-25'];result={protocolVersion:supported.includes(r.params?.protocolVersion)?r.params.protocolVersion:'2025-11-25',capabilities:{tools:{listChanged:false}},serverInfo:{name:'zebra-label-studio',version:'1.0.0'},instructions:'Local Windows label designer for Zebra ZP 505. Use millimetres for layout; 203 dpi. Save editable designs, preview as images, and print only when requested. Printer firmware is never modified.'};}
  else if(r.method==='ping')result={};
  else if(!initialized){send({jsonrpc:'2.0',id:r.id,error:{code:-32002,message:'Initialize the MCP session first'}});return;}
  else if(r.method==='tools/list')result={tools};
  else if(r.method==='tools/call'){
   const name=r.params?.name,t=tools.find(t=>t.name===name);if(!t){send({jsonrpc:'2.0',id:r.id,error:{code:-32602,message:'Unknown tool'}});return;}
   try{const a=r.params.arguments||{};if(typeof a!=='object'||Array.isArray(a))throw new Error('Arguments must be an object');for(const k of Object.keys(a))if(!Object.hasOwn(t.inputSchema.properties,k))throw new Error('Unknown argument: '+k);for(const k of t.inputSchema.required)if(a[k]===undefined)throw new Error('Missing argument: '+k);
    const c=await ensure(),v=await request(c,methods[name]||name,a);
    if(name==='preview_label'){const {image,...info}=v;result={content:[{type:'image',data:image,mimeType:'image/png'},{type:'text',text:JSON.stringify(info)}],structuredContent:info};}
    else result={content:[{type:'text',text:JSON.stringify(v)}],structuredContent:Array.isArray(v)?{items:v}:v};
   }catch(e){result={isError:true,content:[{type:'text',text:e.message}]};}
  }else {send({jsonrpc:'2.0',id:r.id,error:{code:-32601,message:'Method not found'}});return;}
  send({jsonrpc:'2.0',id:r.id,result});
 }catch(e){send({jsonrpc:'2.0',id:r.id,error:{code:-32603,message:e.message}});}
}
let chain=Promise.resolve();const rl=readline.createInterface({input:process.stdin,crlfDelay:Infinity});rl.on('line',line=>{if(Buffer.byteLength(line)>32*1024*1024){send({jsonrpc:'2.0',id:null,error:{code:-32600,message:'Request too large'}});return;}chain=chain.then(()=>handle(line)).catch(e=>process.stderr.write(e.message+'\n'));});
rl.on('close',()=>chain.finally(()=>process.exit(0)));
