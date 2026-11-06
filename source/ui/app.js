import {renderCanvas,renderResult,ppm} from './render.js';
import * as pdfjs from 'pdfjs-dist/build/pdf.mjs';
pdfjs.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdf.worker.mjs',import.meta.url).href;
const api=window.studio;
async function pdfImage(base64,pageNumber=1){const pdf=await pdfjs.getDocument({data:Uint8Array.from(atob(base64),c=>c.charCodeAt(0)),isEvalSupported:false}).promise;try{if(!Number.isInteger(pageNumber)||pageNumber<1||pageNumber>pdf.numPages)throw new Error('Page number is outside this PDF');const page=await pdf.getPage(pageNumber),v=page.getViewport({scale:1}),vp=page.getViewport({scale:Math.min(203/72,3500/Math.max(v.width,v.height))}),c=document.createElement('canvas');c.width=Math.ceil(vp.width);c.height=Math.ceil(vp.height);await page.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;return {src:c.toDataURL(),width:c.width,height:c.height,page:pageNumber,pageCount:pdf.numPages};}finally{await pdf.destroy();}}
if(new URLSearchParams(location.search).has('worker')){
 document.body.innerHTML='';api.onRender((design,options)=>design._pdfBase64?pdfImage(design._pdfBase64,options.page||1):renderResult(design,options));api.call('ready');
}else{
const $=id=>document.getElementById(id),clone=x=>JSON.parse(JSON.stringify(x));
let design,selected=null,templateData=[],undo=[],redo=[],scale=1,drag=null,renderSeq=0,saveTimer,toastTimer,status={},modalCallback=null;
const icon={text:'T',rect:'□',ellipse:'○',line:'╱',image:'▧',barcode:'▥',qrcode:'▦'};
const uid=()=>crypto.randomUUID();
function toast(message){$('toast').textContent=message;$('toast').style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').style.display='none',5000);}
function safe(fn){return async(...a)=>{try{return await fn(...a);}catch(e){toast(e.message||String(e));console.error(e);}};}
function on(id,event,fn){$(id).addEventListener(event,safe(fn));}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function current(){return design.objects.find(o=>o.id===selected);}
function snapshot(){undo.push(JSON.stringify(design));if(undo.length>80)undo.shift();redo=[];}
function dirty(){clearTimeout(saveTimer);$('saveState').textContent='Saving locally…';saveTimer=setTimeout(()=>safe(save)(),1000);}
async function save(){clearTimeout(saveTimer);const d=await api.call('save_design',{design});design.updatedAt=d.updatedAt;$('saveState').textContent='Saved on this computer · 203 dpi';return d;}
function change(fn,props=true){snapshot();fn();dirty();refresh(props);}
function setDesign(d){clearTimeout(saveTimer);design=clone(d);selected=null;undo=[];redo=[];refresh();$('saveState').textContent='Ready to design · 203 dpi';}
function useTemplate(t){setDesign({...clone(t),id:uid(),name:t.name.split(' · ')[0]+' label'});dirty();view('designer');}
function newLabel(){setDesign({id:uid(),name:'Untitled label',widthMm:101.6,heightMm:76.2,dpi:203,objects:[]});dirty();view('designer');}
function refresh(props=true){
 $('designName').value=design.name;$('labelWidth').value=design.widthMm;$('labelHeight').value=design.heightMm;
 const preset=[...$('sizePreset').options].find(o=>o.value===`${design.widthMm},${design.heightMm}`);$('sizePreset').value=preset?preset.value:'custom';
 $('layerCount').textContent=design.objects.length;
 $('layers').innerHTML=[...design.objects].reverse().map(o=>`<div class="layer ${o.id===selected?'active':''}" data-id="${esc(o.id)}"><span>${icon[o.type]}</span><span class="layer-name">${esc(o.text?.split('\n')[0]||o.type)}</span><em>${esc(o.type)}</em></div>`).join('');
 for(const el of $('layers').children)el.onclick=()=>{selected=el.dataset.id;refresh();};
 if(props)properties();draw().catch(e=>toast(e.message));
}
function fit(){
 const zoom=$('zoom').value,area=$('canvasArea');scale=zoom==='fit'?Math.min((area.clientWidth-80)/(design.widthMm*ppm),(area.clientHeight-65)/(design.heightMm*ppm),1.15):Number(zoom);
 scale=Math.max(.04,scale);$('board').style.width=`${Math.round(design.widthMm*ppm)*scale}px`;$('board').style.height=`${Math.round(design.heightMm*ppm)*scale}px`;
}
function selection(){const o=current(),s=$('selection');if(!o){s.style.display='none';return;}s.style.display='block';s.style.left=o.x*ppm*scale+'px';s.style.top=o.y*ppm*scale+'px';s.style.width=o.w*ppm*scale+'px';s.style.height=o.h*ppm*scale+'px';s.style.transform=`rotate(${o.rotation||0}deg)`;}
async function draw(){
 const seq=++renderSeq;fit();selection();const result=await renderCanvas(design,{monochrome:$('monoToggle').checked,threshold:Number($('threshold').value),dither:$('dither').checked});if(seq!==renderSeq)return;
 const c=$('labelCanvas');c.width=result.canvas.width;c.height=result.canvas.height;c.getContext('2d').drawImage(result.canvas,0,0);
 $('dimensions').textContent=`${(design.widthMm/25.4).toFixed(2)} × ${(design.heightMm/25.4).toFixed(2)} in · ${c.width} × ${c.height} dots`;
 $('renderWarnings').textContent=result.warnings[0]||'';$('renderWarnings').title=result.warnings.join('\n');
}
function field(label,key,value,type='number',step='.1'){return `<label>${label}<input data-prop="${key}" type="${type}" step="${step}" value="${esc(value??'')}"></label>`;}
function properties(){
 const o=current();if(!o){$('elementProps').innerHTML='<div class="empty-props">Select an element to edit its text, size, and appearance.</div>';return;}
 let html=`<div class="field-row">${field('X (mm)','x',o.x)}${field('Y (mm)','y',o.y)}</div><div class="field-row">${field('Width (mm)','w',o.w)}${field('Height (mm)','h',o.h)}</div>`;
 if(['text','barcode','qrcode'].includes(o.type))html+=`<label>${o.type==='text'?'Text · {{variable}} supported':'Encoded content'}<textarea data-prop="text" rows="3">${esc(o.text)}</textarea></label>`;
 if(o.type==='text')html+=`<div class="field-row">${field('Font size (mm)','fontSize',o.fontSize||4)}<label>Font<select data-prop="fontFamily">${['Arial','Segoe UI','Georgia','Consolas','Impact','Verdana','Times New Roman'].map(f=>`<option ${o.fontFamily===f?'selected':''}>${f}</option>`).join('')}</select></label></div><div class="toggle-row"><button data-toggle="bold" class="${o.bold?'on':''}"><b>B</b></button><button data-toggle="italic" class="${o.italic?'on':''}"><i>I</i></button></div><label>Alignment<select data-prop="align">${['left','center','right'].map(f=>`<option ${o.align===f?'selected':''}>${f}</option>`).join('')}</select></label>`;
 if(['rect','ellipse'].includes(o.type))html+=`<label>Fill<select data-prop="fill">${['none','white','black','#777777'].map(f=>`<option value="${f}" ${o.fill===f?'selected':''}>${f==='#777777'?'Gray':f}</option>`).join('')}</select></label>`;
 if(['rect','ellipse','line'].includes(o.type))html+=field('Stroke width (mm)','strokeWidth',o.strokeWidth??.35);
 if(o.type==='barcode')html+=`<label class="check"><input type="checkbox" data-prop="showText" ${o.showText?'checked':''}> Show human-readable value</label>`;
 if(o.type==='image')html+=`<label>Image fit<select data-prop="fit">${['contain','cover','stretch'].map(f=>`<option ${o.fit===f?'selected':''}>${f}</option>`).join('')}</select></label><div class="small">Crop source image (%)</div><div class="field-row">${field('Left','crop.x',Math.round((o.crop?.x||0)*100))}${field('Top','crop.y',Math.round((o.crop?.y||0)*100))}</div><div class="field-row">${field('Width','crop.w',Math.round((o.crop?.w??1)*100))}${field('Height','crop.h',Math.round((o.crop?.h??1)*100))}</div>`;
 html+=field('Rotation (degrees)','rotation',o.rotation||0,'number','1');html+=`<div class="toggle-row"><button id="backward">↓ Send back</button><button id="forward">↑ Bring front</button></div>`;
 $('elementProps').innerHTML=html;
 for(const el of $('elementProps').querySelectorAll('[data-prop]'))el.onchange=safe(()=>{
  const key=el.dataset.prop;let v=el.type==='checkbox'?el.checked:el.type==='number'?Number(el.value):el.value;
  if(typeof v==='number'&&!Number.isFinite(v))throw new Error('Enter a valid number');
  const next=clone(o);if(key.startsWith('crop.')){next.crop??={x:0,y:0,w:1,h:1};next.crop[key.slice(5)]=Math.max((key.endsWith('w')||key.endsWith('h')) ? .01 : 0,Math.min(1,v/100));}else next[key]=v;
  if(['x','y','w','h'].includes(key)){
   next.w=Math.max(.2,Math.min(design.widthMm,next.w));next.h=Math.max(.2,Math.min(design.heightMm,next.h));next.x=Math.max(0,Math.min(design.widthMm-next.w,next.x));next.y=Math.max(0,Math.min(design.heightMm-next.h,next.y));
  }
  if(key==='rotation')next.rotation=Math.max(-360,Math.min(360,v));if(key==='fontSize')next.fontSize=Math.max(1,Math.min(100,v));if(key==='strokeWidth')next.strokeWidth=Math.max(0,Math.min(20,v));
  change(()=>Object.assign(o,next));
 });
 for(const el of $('elementProps').querySelectorAll('[data-toggle]'))el.onclick=()=>change(()=>o[el.dataset.toggle]=!o[el.dataset.toggle]);
 $('backward').onclick=()=>change(()=>{const i=design.objects.indexOf(o);if(i>0)[design.objects[i-1],design.objects[i]]=[o,design.objects[i-1]];});
 $('forward').onclick=()=>change(()=>{const i=design.objects.indexOf(o);if(i<design.objects.length-1)[design.objects[i],design.objects[i+1]]=[o,design.objects[i+1]];});
}
function add(type){const w=Math.min(type==='text'?70:type==='line'?60:type==='barcode'?75:25,design.widthMm-8),h=Math.min(type==='text'?14:type==='line'?1:type==='barcode'?22:25,design.heightMm-8);
 const o={id:uid(),type,x:4,y:4,w,h};if(type==='text')Object.assign(o,{text:'Your text here',fontSize:5,fontFamily:'Arial',bold:true});if(type==='barcode')Object.assign(o,{text:'123456789012',showText:true});if(type==='qrcode')o.text='https://example.com';if(['rect','ellipse','line'].includes(type))Object.assign(o,{strokeWidth:.4,fill:'none'});change(()=>{design.objects.push(o);selected=o.id;});}
function remove(){if(current())change(()=>{design.objects=design.objects.filter(o=>o.id!==selected);selected=null;});}
function duplicate(){const o=current();if(o)change(()=>{const n={...clone(o),id:uid()};n.x=Math.min(design.widthMm-n.w,n.x+2);n.y=Math.min(design.heightMm-n.h,n.y+2);design.objects.push(n);selected=n.id;});}
function travel(back){const from=back?undo:redo,to=back?redo:undo;if(!from.length)return;to.push(JSON.stringify(design));design=JSON.parse(from.pop());selected=null;dirty();refresh();}
function dimensions(w,h){if(w<10||w>104||h<10||h>991)throw new Error('Use a width of 10–104 mm and height of 10–991 mm');change(()=>{design.widthMm=w;design.heightMm=h;for(const o of design.objects){o.w=Math.min(o.w,w);o.h=Math.min(o.h,h);o.x=Math.min(o.x,w-o.w);o.y=Math.min(o.y,h-o.h);}});}
async function view(name){for(const b of document.querySelectorAll('nav button'))b.classList.toggle('active',b.dataset.view===name);for(const el of document.querySelectorAll('.view'))el.classList.toggle('hidden',el.id!==name+'View');if(name==='designer')draw();if(name==='library')await library();if(name==='jobs')await jobs();if(name==='connect')await connect();}
async function library(){const list=await api.call('list_designs');$('libraryGrid').innerHTML=list.length?'':'<p class="muted">Your saved labels will appear here. Start with a template in the designer.</p>';
 for(const d of list){const card=document.createElement('article');card.className='card';card.innerHTML=`<div class="library-preview"></div><strong>${esc(d.name)}</strong><p>${d.widthMm} × ${d.heightMm} mm</p><div class="button-row"><button data-open>Open design</button><button data-copy>Copy</button><button data-remove>Delete</button></div>`;$('libraryGrid').append(card);card.querySelector('[data-open]').onclick=safe(async()=>{setDesign(await api.call('get_design',{id:d.id}));view('designer');});card.querySelector('[data-copy]').onclick=safe(async()=>{const n=await api.call('get_design',{id:d.id});n.id=uid();n.name+=' copy';await api.call('save_design',{design:n});library();});card.querySelector('[data-remove]').onclick=safe(async()=>{await api.call('delete_design',{id:d.id});library();});
 try{const full=await api.call('get_design',{id:d.id}),{canvas}=await renderCanvas(full);const im=new Image();im.src=canvas.toDataURL();card.querySelector('.library-preview').append(im);}catch{}
 }}
async function jobs(){const list=await api.call('history');$('jobsList').innerHTML=list.length?list.map(j=>`<div class="job"><div><strong>${esc(j.name)}</strong><small>${esc(j.printer)}</small></div><div>${j.copies} label${j.copies===1?'':'s'}<small>Windows job ${j.jobId??'—'}</small></div><div><span class="status-pill ${j.status==='failed'?'failed':''}">${esc(j.status)}</span><small>${esc(j.error||'Spooler submission status')}</small></div><div>${esc(new Date(j.createdAt).toLocaleString())}</div></div>`).join(''):'<article class="card"><p>No print jobs yet.</p></article>';}
async function refreshStatus(){status=await api.call('status');$('printerBadge').textContent=status.printer||'Printer setup needed';$('mcpBadge').textContent=status.connection?.ready?'Local MCP bridge ready':'Starting MCP bridge…';}
async function printers(){try{const p=await api.call('list_printers');$('printerSelect').innerHTML='<option value="">Select a printer…</option>'+p.map(x=>`<option ${status.printer===x.name?'selected':''}>${esc(x.name)}</option>`).join('');$('printerMessage').textContent=status.printer?'Selected: '+status.printer:p.some(x=>x.transport==='usb')?'Zebra USB detected. Choose “Zebra USB direct” to print using the Windows USB class driver.':p.length?'Choose your Zebra ZPL queue above, or plug in the Zebra USB cable and refresh.':'No printer detected. Connect and power on the Zebra, then refresh.';}catch(e){$('printerMessage').textContent=e.message;$('printerMessage').className='notice error';}}
async function connect(){await refreshStatus();$('mcpConfig').value=JSON.stringify(await api.call('mcp_config'),null,2);const ds=status.driverState;$('driverStatus').textContent=ds.status==='downloaded'?'Official driver files are bundled in the drivers folder.':ds.message||'Driver installation is separate. Use the bundled driver guide and official source links.';await printers();}
function modal(html,action,fn){$('modalBody').innerHTML=html;$('modalAction').textContent=action||'Continue';$('modalAction').classList.toggle('hidden',!fn);modalCallback=fn;$('modal').showModal();}
function options(){return {threshold:Number($('threshold').value),dither:$('dither').checked};}
function variablesIn(d){return [...new Set(d.objects.flatMap(o=>[...(o.text||'').matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)].map(m=>m[1])))];}
function substitute(d,values){const n=clone(d);for(const o of n.objects)if(o.text)o.text=o.text.replace(/\{\{\s*([\w.-]+)\s*\}\}/g,(_,key)=>values[key]??`{{${key}}}`);return n;}
async function printDialog(d=design){await refreshStatus();if(!status.printer){await view('connect');toast('Choose your Zebra printer first.');return;}
 const vars=variablesIn(d);let html=`<span class="eyebrow">PRINT / ${esc(status.printer)}</span><h2>${esc(d.name)}</h2><div id="printVars">${vars.map(v=>`<label>${esc(v)}<input data-variable="${esc(v)}" value=""></label>`).join('')}</div><label>Copies<input id="printCopies" type="number" value="1" min="1" max="100"></label><img id="printPreview" class="preview"><p id="printWarnings"></p>`;
 modal(html,'Print label',async()=>{const values={};for(const i of $('printVars').querySelectorAll('input')){if(!i.value)throw new Error('Fill in '+i.dataset.variable);values[i.dataset.variable]=i.value;}const copies=Number($('printCopies').value);const job=await api.call('print_label',{design:d,variables:values,copies,...options()});$('modal').close();toast(job.status==='sent-to-usb'?'Label sent to Zebra USB printer.':'Submitted to '+job.printer+' · Windows job '+job.jobId);});
 async function update(){const values={};for(const i of $('printVars').querySelectorAll('input'))values[i.dataset.variable]=i.value||`{{${i.dataset.variable}}}`;try{const {canvas,warnings}=await renderCanvas(substitute(d,values),{...options(),monochrome:true});$('printPreview').src=canvas.toDataURL();$('printWarnings').textContent=warnings.join(' ');}catch(e){$('printWarnings').textContent=e.message;}}
 for(const i of $('printVars').querySelectorAll('input'))i.oninput=update;await update();
}
async function diagnostic(){const d={id:uid(),name:'ZP 505 diagnostic',widthMm:101.6,heightMm:152.4,dpi:203,objects:[{id:'frame',type:'rect',x:3,y:3,w:95.6,h:146.4,strokeWidth:.4,fill:'none'},{id:'title',type:'text',x:8,y:10,w:85,h:13,text:'ZP 505 / READY',fontSize:7,bold:true},{id:'info',type:'text',x:8,y:32,w:85,h:28,text:'Zebra Label Studio\n203 dpi · 4 × 6 inch\nUSB / RAW ZPL graphics',fontSize:4},{id:'bar',type:'barcode',x:8,y:70,w:85,h:24,text:'123456789012',showText:true},{id:'qr',type:'qrcode',x:8,y:108,w:30,h:30,text:'Zebra Label Studio diagnostic'},{id:'note',type:'text',x:42,y:113,w:48,h:25,text:'Check border, text,\nbarcode and QR.\nScan both codes.',fontSize:3.5}]};await printDialog(d);}
async function exportFile(format){await save();let a={name:design.name,format};if(format==='json')a.text=JSON.stringify(design,null,2);else if(format==='zpl')a.text=(await api.call('export_zpl',{design,...options()})).zpl;else{const r=await renderCanvas(design,{...options(),monochrome:true});a.base64=r.canvas.toDataURL().split(',')[1];}const r=await api.call('save_file',a);if(r)toast('Saved '+r.path);}
async function importFile(){const f=await api.call('choose_file');if(!f)return;
 if(f.extension==='.json'){const d=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(f.base64),c=>c.charCodeAt(0))));const valid=await api.call('save_design',{design:d});setDesign(valid);return;}
 if(f.extension==='.csv'){await batchDialog(new TextDecoder().decode(Uint8Array.from(atob(f.base64),c=>c.charCodeAt(0))));return;}
 if(f.extension==='.pdf'){
  const pdf=await pdfjs.getDocument({data:Uint8Array.from(atob(f.base64),c=>c.charCodeAt(0)),isEvalSupported:false}).promise;
  modal(`<h2>Import PDF label</h2><p>${esc(f.name)} · ${pdf.numPages} page${pdf.numPages===1?'':'s'}. Choose a page to place on your label. Crop margins afterward in the image properties.</p><label>Page<input id="pdfPage" type="number" min="1" max="${pdf.numPages}" value="1"></label><label>Placement<select id="pdfFit"><option value="contain">Fit entire page</option><option value="cover">Fill label (crop edges)</option><option value="stretch">Stretch to label</option></select></label>`,'Import page',async()=>{const n=Number($('pdfPage').value);if(!Number.isInteger(n)||n<1||n>pdf.numPages)throw new Error('Choose a valid page');const page=await pdf.getPage(n),vp0=page.getViewport({scale:1});const size=Math.min(203/72,3500/Math.max(vp0.width,vp0.height)),vp=page.getViewport({scale:size}),c=document.createElement('canvas');c.width=Math.ceil(vp.width);c.height=Math.ceil(vp.height);await page.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;const fit=$('pdfFit').value;placeImage(c.toDataURL(),fit);$('modal').close();await pdf.destroy();});return;
 }
 if(['.png','.jpg','.jpeg','.webp'].includes(f.extension)){placeImage(`data:image/${f.extension==='.png'?'png':f.extension==='.webp'?'webp':'jpeg'};base64,${f.base64}`,'contain');return;}
 throw new Error('Unsupported file');
}
function placeImage(src,fit){change(()=>{const o={id:uid(),type:'image',x:0,y:0,w:design.widthMm,h:design.heightMm,src,fit};design.objects.push(o);selected=o.id;});}
function parseCsv(text){const rows=[];let row=[],s='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){s+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(s);s='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(s);if(row.some(v=>v!==''))rows.push(row);row=[];s='';}else s+=c;}if(quoted)throw new Error('CSV contains an unclosed quote');row.push(s);if(row.some(v=>v!==''))rows.push(row);if(rows.length<2)throw new Error('CSV needs a header and at least one data row');const headers=rows.shift().map(x=>x.trim().replace(/^\uFEFF/,''));if(headers.some(h=>!h)||new Set(headers).size!==headers.length)throw new Error('CSV headers must be nonempty and unique');return rows.map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]||''])));}
async function batchDialog(text){let rows;
 modal(`<h2>CSV batch printing</h2><p>Use column names as variables: {{name}}, {{address}}, {{asset}}. One row prints one label. Up to 100 rows per batch.</p><label>CSV data<textarea id="csvData" rows="8" placeholder="name,address,city&#10;Jane Doe,123 Example St,Chicago IL">${esc(text||'')}</textarea></label><div id="batchStatus" class="notice">The current label design will be used for every row.</div>`,'Print batch',async()=>{
  rows=parseCsv($('csvData').value);if(rows.length>100)throw new Error('Limit batches to 100 rows');const vars=variablesIn(design),missing=vars.filter(v=>!Object.hasOwn(rows[0],v));if(missing.length)throw new Error('Missing CSV columns: '+missing.join(', '));await refreshStatus();if(!status.printer)throw new Error('Select a printer in Printer & MCP first');
  // Validate every expanded design and render before submitting any physical jobs.
  for(const row of rows)await api.call('preview_label',{design,variables:row,...options()});
  for(let i=0;i<rows.length;i++){await api.call('print_label',{design,variables:rows[i],copies:1,...options()});$('batchStatus').textContent=`Submitted ${i+1} of ${rows.length} labels to Windows.`;}
  toast('Batch submitted: '+rows.length+' labels');
 });
}
for(const b of document.querySelectorAll('nav button'))b.onclick=safe(()=>view(b.dataset.view));
for(const b of document.querySelectorAll('[data-add]'))b.onclick=()=>add(b.dataset.add);
on('saveBtn','click',async()=>{await save();toast('Design saved locally.');});on('newBtn','click',newLabel);on('designName','change',()=>change(()=>design.name=$('designName').value||'Untitled label',false));
on('printBtn','click',()=>printDialog());on('importBtn','click',importFile);on('duplicateBtn','click',duplicate);on('deleteBtn','click',remove);on('undoBtn','click',()=>travel(true));on('redoBtn','click',()=>travel(false));
on('labelWidth','change',()=>dimensions(Number($('labelWidth').value),design.heightMm));on('labelHeight','change',()=>dimensions(design.widthMm,Number($('labelHeight').value)));on('sizePreset','change',()=>{if($('sizePreset').value!=='custom'){const [w,h]=$('sizePreset').value.split(',').map(Number);dimensions(w,h);}});
on('zoom','change',draw);on('gridToggle','change',()=>$('canvasArea').classList.toggle('no-grid',!$('gridToggle').checked));on('monoToggle','change',draw);on('threshold','input',()=>{$('thresholdValue').textContent=$('threshold').value;draw();});on('dither','change',draw);
on('exportPng','click',()=>exportFile('png'));on('exportZpl','click',()=>exportFile('zpl'));on('exportJson','click',()=>exportFile('json'));on('batchBtn','click',()=>batchDialog());
on('refreshLibrary','click',library);on('refreshJobs','click',jobs);on('refreshPrinters','click',printers);on('selectPrinter','click',async()=>{await api.call('set_printer',{printer:$('printerSelect').value});await refreshStatus();await printers();toast('Printer selected.');});on('driverLink','click',()=>api.call('open_external',{target:'drivers'}));on('windowsSettings','click',()=>api.call('open_external',{target:'settings'}));on('testPrint','click',diagnostic);on('copyMcp','click',async()=>{await navigator.clipboard.writeText($('mcpConfig').value);toast('MCP configuration copied.');});on('openData','click',()=>api.call('open_folder'));
on('modalClose','click',()=>$('modal').close());on('modalAction','click',async()=>{const b=$('modalAction');b.disabled=true;try{await modalCallback?.();}finally{b.disabled=false;}});
$('board').addEventListener('pointerdown',e=>{
 const rect=$('board').getBoundingClientRect(),x=(e.clientX-rect.left)/(ppm*scale),y=(e.clientY-rect.top)/(ppm*scale);
 if(e.target.id==='resizeHandle'){const o=current();if(o){snapshot();drag={id:o.id,startX:x,startY:y,original:clone(o),resize:true};$('board').setPointerCapture(e.pointerId);}return;}
 selected=[...design.objects].reverse().find(o=>{const r=-(o.rotation||0)*Math.PI/180,dx=x-(o.x+o.w/2),dy=y-(o.y+o.h/2);return Math.abs(dx*Math.cos(r)-dy*Math.sin(r))<=o.w/2&&Math.abs(dx*Math.sin(r)+dy*Math.cos(r))<=o.h/2;})?.id||null;
 const o=current();if(o){snapshot();drag={id:o.id,startX:x,startY:y,original:clone(o)};$('board').setPointerCapture(e.pointerId);}refresh();
});
$('board').addEventListener('pointermove',e=>{if(!drag)return;const rect=$('board').getBoundingClientRect(),x=(e.clientX-rect.left)/(ppm*scale),y=(e.clientY-rect.top)/(ppm*scale),o=current();if(!o)return;const dx=x-drag.startX,dy=y-drag.startY;
 if(drag.resize){o.w=Math.max(.5,Math.min(design.widthMm-o.x,drag.original.w+dx));o.h=Math.max(.5,Math.min(design.heightMm-o.y,drag.original.h+dy));}else{o.x=Math.max(0,Math.min(design.widthMm-o.w,drag.original.x+dx));o.y=Math.max(0,Math.min(design.heightMm-o.h,drag.original.y+dy));}o.x=Math.round(o.x*10)/10;o.y=Math.round(o.y*10)/10;draw();});
$('board').addEventListener('pointerup',()=>{if(drag){drag=null;dirty();refresh();}});
window.addEventListener('resize',()=>safe(draw)());
window.addEventListener('keydown',e=>{if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName))return;if(e.ctrlKey&&e.key.toLowerCase()==='s'){e.preventDefault();safe(save)();}if(e.ctrlKey&&e.key.toLowerCase()==='z'){e.preventDefault();travel(true);}if(e.ctrlKey&&e.key.toLowerCase()==='y'){e.preventDefault();travel(false);}if(e.ctrlKey&&e.key.toLowerCase()==='d'){e.preventDefault();duplicate();}if(e.key==='Delete'||e.key==='Backspace')remove();if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)&&current()){e.preventDefault();change(()=>{const o=current(),step=e.shiftKey?1:.1;if(e.key==='ArrowLeft')o.x=Math.max(0,o.x-step);if(e.key==='ArrowRight')o.x=Math.min(design.widthMm-o.w,o.x+step);if(e.key==='ArrowUp')o.y=Math.max(0,o.y-step);if(e.key==='ArrowDown')o.y=Math.min(design.heightMm-o.h,o.y+step);o.x=Math.round(o.x*10)/10;o.y=Math.round(o.y*10)/10;});}});
api.onDesign(d=>{setDesign(d);view('designer');});api.onStatus(()=>safe(refreshStatus)());
safe(async()=>{templateData=await api.call('templates');$('templateList').innerHTML=templateData.map((t,i)=>`<button class="template-btn" data-template="${i}"><span>${['▤','▥','≡','▦'][i]}</span>${esc(t.name)}</button>`).join('');for(const b of $('templateList').children)b.onclick=()=>useTemplate(templateData[Number(b.dataset.template)]);const list=await api.call('list_designs');if(list.length)setDesign(await api.call('get_design',{id:list.sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||''))[0].id}));else useTemplate(templateData[0]);await refreshStatus();})();
}
