'use strict';
const {app,BrowserWindow,ipcMain,dialog,shell,Tray,Menu}=require('electron');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const {execFile}=require('node:child_process');
const {validateDesign,rgbaToRaster,rasterToZpl,applyVariables}=require('./core.cjs');
const {templates}=require('./templates.cjs');
const base=app.isPackaged?path.dirname(process.execPath):__dirname;
const dataDir=process.env.ZEBRA_STUDIO_DATA || (app.isPackaged?path.join(base,'..','data'):path.join(base,'data'));
for(const dir of ['designs','jobs','exports','runtime']) fs.mkdirSync(path.join(dataDir,dir),{recursive:true});
app.setPath('userData',path.join(dataDir,'runtime'));
let win,worker,server,connection,renderReady,renderResolve,tray,selectedPrinter='';
const pending=new Map(); const configPath=path.join(dataDir,'settings.json');
function readJson(p,fallback){try{return JSON.parse(fs.readFileSync(p,'utf8'));}catch{return fallback;}}
selectedPrinter=readJson(configPath,{}).printer || '';
function atomic(p,d){const t=p+'.'+crypto.randomUUID()+'.tmp';fs.writeFileSync(t,JSON.stringify(d,null,2));fs.renameSync(t,p);}
function broadcast(){if(win&&!win.isDestroyed())win.webContents.send('studio:status',{changedAt:Date.now()});}
function ps(action,request){return new Promise((resolve,reject)=>{
 const req=request?path.join(dataDir,'jobs',crypto.randomUUID()+'.request.json'):null;
 if(req)fs.writeFileSync(req,JSON.stringify(request),'utf8');
 const args=['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'print.ps1'),'-Action',action];if(req)args.push('-RequestFile',req);
 execFile('powershell.exe',args,{windowsHide:true,timeout:45000,maxBuffer:2*1024*1024},(err,out,stderr)=>{if(req)try{fs.unlinkSync(req);}catch{} if(err)reject(new Error((stderr||err.message).trim()));else try{resolve(JSON.parse(out.replace(/^\uFEFF/,'')));}catch{reject(new Error('Printer service returned invalid data: '+out.slice(0,200)));}});
});}
async function render(design,options={}) {
 await renderReady;
 return new Promise((resolve,reject)=>{const id=crypto.randomUUID();const timer=setTimeout(()=>{pending.delete(id);reject(new Error('Label rendering timed out'));},45000);pending.set(id,{resolve,reject,timer});worker.webContents.send('studio:render',{id,design,options});});
}
function designPath(id){if(typeof id!=='string'||!/^[\w-]{1,80}$/.test(id))throw new Error('Invalid design id');return path.join(dataDir,'designs',id+'.json');}
function load(id){const d=readJson(designPath(id),null);if(!d)throw new Error('Design not found');return validateDesign(d);}
async function getDesign(a){return applyVariables(a.design?validateDesign(a.design):load(a.id),a.variables||{});}
function listDesigns(){return fs.readdirSync(path.join(dataDir,'designs')).filter(n=>n.endsWith('.json')).map(n=>readJson(path.join(dataDir,'designs',n),null)).filter(Boolean).map(d=>({id:d.id,name:d.name,widthMm:d.widthMm,heightMm:d.heightMm,updatedAt:d.updatedAt}));}
function logJob(job){atomic(path.join(dataDir,'jobs',job.id+'.json'),job);broadcast();}
function history(){return fs.readdirSync(path.join(dataDir,'jobs')).filter(n=>/^[\w-]+\.json$/.test(n)&&!n.includes('.request.')).map(n=>readJson(path.join(dataDir,'jobs',n),null)).filter(j=>j?.createdAt).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,100);}
async function dispatch(method,a={},ui=false){
 switch(method){
 case 'ready':renderResolve();return true;
 case 'status':return {app:'Zebra Label Studio',version:'1.0.0',printer:selectedPrinter,dataDir,connection:connection?{transport:'stdio',ready:true}:null,driverState:readJson(path.join(base,'..','drivers','manifest.json'),{status:'See bundled driver guide'}),designs:listDesigns().length};
 case 'templates':return templates();
 case 'list_designs':return listDesigns();
 case 'get_design':return load(a.id);
 case 'save_design':{const d=validateDesign(a.design);d.updatedAt=new Date().toISOString();atomic(designPath(d.id),d);broadcast();return d;}
 case 'delete_design':{fs.unlinkSync(designPath(a.id));broadcast();return {deleted:a.id};}
 case 'open_design':{const d=a.design?validateDesign(a.design):load(a.id);show();win.webContents.send('studio:design',d);return {opened:d.id};}
 case 'list_printers':return await ps('list');
 case 'printer_diagnostics':{const p=await ps('list');const printer=a.printer||selectedPrinter;const device=p.find(d=>d.name===printer&&d.transport==='usb');if(!device)throw new Error('Select a connected Zebra USB device');const report={device};try{report.hostStatus=await ps('inspect',{printer});}catch(e){report.statusError=e.message;}if(a.printNative===true)report.nativeTest=await ps('native_test',{printer});return report;}
 case 'set_printer':{if(!ui)throw new Error('Select a printer in the desktop app');const p=await ps('list');if(!p.some(x=>x.name===a.printer))throw new Error('Printer not installed');selectedPrinter=a.printer;atomic(configPath,{printer:selectedPrinter});return {printer:selectedPrinter};}
 case 'preview_label':{const d=await getDesign(a);const r=await render(d,a);return {image:r.png,width:r.width,height:r.height,warnings:r.warnings};}
 case 'export_zpl':{const d=await getDesign(a),r=await render(d,a);const zpl=rasterToZpl(rgbaToRaster(Buffer.from(r.rgba,'base64'),r.width,r.height,a.threshold??160,!!a.dither),a.copies??1);return {zpl,width:r.width,height:r.height,warnings:r.warnings};}
 case 'print_label':{const d=await getDesign(a);const printer=a.printer||selectedPrinter;if(!printer)throw new Error('Choose the installed Zebra printer in Printer setup first');const printers=await ps('list');if(!printers.some(p=>p.name===printer&&p.isValid))throw new Error('Selected printer is not installed or valid');if(printer!==selectedPrinter&&!/zebra|zdesigner|zp\s?50[056]/i.test(printer))throw new Error('Select this printer in the app before sending ZPL');
   const r=await render(d,a),zpl=rasterToZpl(rgbaToRaster(Buffer.from(r.rgba,'base64'),r.width,r.height,a.threshold??160,!!a.dither),a.copies??1);
   const id=crypto.randomUUID(),file=path.join(dataDir,'jobs',id+'.zpl');fs.writeFileSync(file,zpl,'ascii');const job={id,designId:d.id,name:d.name,printer,copies:a.copies??1,createdAt:new Date().toISOString(),status:'submitting',file};logJob(job);
   try{Object.assign(job,await ps('print',{printer,file,title:'Label Studio — '+d.name}));logJob(job);return {...job,note:job.status==='sent-to-usb'?'Bytes sent to USB; physical output is not confirmed.':'Accepted by Windows spooler; physical output is not confirmed.'};}catch(e){job.status='failed';job.error=e.message;logJob(job);throw e;}}
 case 'history':return history();
 case 'import_image':{if(typeof a.path!=='string'||!path.isAbsolute(a.path))throw new Error('Absolute image path required');if(!/\.(png|jpe?g|webp)$/i.test(a.path))throw new Error('PNG, JPEG, WebP only');const b=fs.readFileSync(a.path);if(b.length>15*1024*1024)throw new Error('Image must be under 15 MB');return {src:`data:image/${/\.png$/i.test(a.path)?'png':/\.webp$/i.test(a.path)?'webp':'jpeg'};base64,${b.toString('base64')}`};}
 case 'import_pdf':{if(typeof a.path!=='string'||!path.isAbsolute(a.path)||!/\.pdf$/i.test(a.path))throw new Error('Absolute PDF path required');const size=fs.statSync(a.path).size;if(size>20*1024*1024)throw new Error('PDF must be under 20 MB');const b=fs.readFileSync(a.path);if(b.subarray(0,1024).indexOf(Buffer.from('%PDF-'))<0)throw new Error('Not a PDF file');return await render({_pdfBase64:b.toString('base64')},{page:a.page??1});}
 case 'choose_file':{if(!ui)throw new Error('UI only');const r=await dialog.showOpenDialog(win,{properties:['openFile'],filters:[{name:'Labels and images',extensions:['pdf','png','jpg','jpeg','webp','json','csv']}]});if(r.canceled)return null;const p=r.filePaths[0],b=fs.readFileSync(p);if(b.length>40*1024*1024)throw new Error('File must be under 40 MB');return {name:path.basename(p),extension:path.extname(p).toLowerCase(),base64:b.toString('base64')};}
 case 'save_file':{if(!ui)throw new Error('UI only');const ext=a.format==='png'?'png':a.format==='zpl'?'zpl':'json';const r=await dialog.showSaveDialog(win,{defaultPath:path.join(dataDir,'exports',(a.name||'label').replace(/[^\w -]/g,'_')+'.'+ext)});if(r.canceled)return null;fs.writeFileSync(r.filePath,a.base64?Buffer.from(a.base64,'base64'):String(a.text||''));return {path:r.filePath};}
 case 'open_external':{if(!ui)throw new Error('UI only');const urls={drivers:'https://www.fedex.com/en-us/shipping/ship-manager/software.html',settings:'ms-settings:printers'};if(!urls[a.target])throw new Error('Unknown link');await shell.openExternal(urls[a.target]);return true;}
 case 'open_folder':if(!ui)throw new Error('UI only');await shell.openPath(dataDir);return true;
 case 'mcp_config':{const exe=app.isPackaged?process.execPath:require('electron');return {mcpServers:{zebra_labels:{command:exe,args:[path.join(__dirname,'mcp.cjs')],env:{ELECTRON_RUN_AS_NODE:'1',ZEBRA_STUDIO_DATA:dataDir,ZEBRA_STUDIO_APP:process.execPath,...(!app.isPackaged?{ZEBRA_STUDIO_SOURCE:__dirname}:{})}}}};}
 default:throw new Error('Unknown operation: '+method);
 }
}
function show(){if(win&&!win.isDestroyed()){win.show();win.focus();return;}win=new BrowserWindow({width:1480,height:960,minWidth:1100,minHeight:740,title:'Zebra Label Studio',backgroundColor:'#eef1f5',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});win.loadFile(path.join(__dirname,'ui/index.html'));win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());win.on('closed',()=>{win=null;});}
if(!app.requestSingleInstanceLock())app.quit();else{
 app.on('second-instance',(_e,argv)=>{if(!argv.includes('--service'))show();});
 app.whenReady().then(async()=>{
  renderReady=new Promise(resolve=>renderResolve=resolve);
  if(!process.argv.includes('--test-service')){tray=new Tray(path.join(__dirname,'ui/icon.png'));tray.setToolTip('Zebra Label Studio · local print bridge');tray.setContextMenu(Menu.buildFromTemplate([{label:'Open Label Studio',click:show},{type:'separator'},{label:'Quit Label Studio',click:()=>app.quit()}]));tray.on('double-click',show);}
  ipcMain.handle('studio:call',(e,m,a)=>{if(e.sender!==worker?.webContents&&e.sender!==win?.webContents)throw new Error('Unknown sender');if(e.sender===worker?.webContents&&m!=='ready')throw new Error('Renderer cannot call operation');return dispatch(m,a,true);});
  ipcMain.on('studio:rendered',(e,r)=>{if(e.sender!==worker?.webContents)return;const p=pending.get(r.id);if(!p)return;clearTimeout(p.timer);pending.delete(r.id);r.error?p.reject(new Error(r.error)):p.resolve(r.result);});
  worker=new BrowserWindow({show:false,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  await worker.loadFile(path.join(__dirname,'ui/index.html'),{query:{worker:'1'}});
  server=http.createServer(async(req,res)=>{res.setHeader('Content-Type','application/json');if(req.method!=='POST'||req.url!=='/rpc'||req.headers.authorization!==`Bearer ${connection?.token}`||req.headers.origin){res.writeHead(403);res.end(JSON.stringify({error:'Forbidden'}));return;}let chunks=[],size=0;try{for await(const c of req){size+=c.length;if(size>32*1024*1024)throw new Error('Request too large');chunks.push(c);}const {method,args}=JSON.parse(Buffer.concat(chunks).toString());if(['ready','set_printer','choose_file','save_file','open_external','open_folder','mcp_config'].includes(method))throw new Error('Operation unavailable over bridge');res.end(JSON.stringify({result:await dispatch(method,args)}));}catch(e){res.writeHead(400);res.end(JSON.stringify({error:e.message}));}});
  server.listen(0,'127.0.0.1',()=>{connection={port:server.address().port,token:crypto.randomBytes(32).toString('hex'),pid:process.pid};atomic(path.join(dataDir,'connection.json'),connection);});
  if(!process.argv.includes('--service')&&!process.argv.includes('--test-service'))show();
 }).catch(e=>{dialog.showErrorBox('Label Studio could not start',e.stack||e.message);app.quit();});
 app.on('window-all-closed',()=>{});
 app.on('before-quit',()=>{server?.close();try{const p=path.join(dataDir,'connection.json');if(readJson(p,{})?.pid===process.pid)fs.unlinkSync(p);}catch{}});
}
