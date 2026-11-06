import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
export const ppm=203/25.4;
const images=new Map();
async function image(src){if(!images.has(src))images.set(src,new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>{if(i.width*i.height>25000000){images.delete(src);reject(new Error('Image exceeds 25 megapixels; resize it before importing.'));}else resolve(i);};i.onerror=()=>{images.delete(src);reject(new Error('Unable to load embedded image'));};i.src=src;}));return images.get(src);}
export async function renderCanvas(design,opts={}){
 const c=document.createElement('canvas');c.width=Math.round(design.widthMm*ppm);c.height=Math.round(design.heightMm*ppm);
 const ctx=c.getContext('2d',{willReadFrequently:true});ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);
 const warnings=[];
 for(const o of design.objects){
  ctx.save();const x=o.x*ppm,y=o.y*ppm,w=o.w*ppm,h=o.h*ppm;
  ctx.translate(x+w/2,y+h/2);ctx.rotate((o.rotation||0)*Math.PI/180);ctx.translate(-w/2,-h/2);
  ctx.beginPath();ctx.rect(0,0,w,h);ctx.clip();ctx.fillStyle=o.color||'#111111';ctx.strokeStyle=o.color||'#111111';ctx.lineWidth=Math.max(1,(o.strokeWidth??0.35)*ppm);
  if(o.type==='text'){
   const size=(o.fontSize||4)*ppm;ctx.font=`${o.italic?'italic ':''}${o.bold?'700':'400'} ${size}px "${(o.fontFamily||'Arial').replace(/["\\]/g,'')}"`;
   ctx.textBaseline='top';ctx.textAlign=o.align||'left';
   const lh=size*1.2, lines=[];
   for(const p of (o.text||'').split('\n')){let line='';for(const word of p.split(' ')){const next=line?line+' '+word:word;if(ctx.measureText(next).width>w&&line){lines.push(line);line=word;}else line=next;}lines.push(line);}
   if(lines.length*lh>h+1)warnings.push(`Text may be clipped: ${(o.text||'').slice(0,35)}`);
   for(let i=0;i<lines.length;i++)ctx.fillText(lines[i],o.align==='center'?w/2:o.align==='right'?w:0,i*lh);
  }else if(o.type==='rect'||o.type==='ellipse'){
   ctx.beginPath();if(o.type==='ellipse')ctx.ellipse(w/2,h/2,Math.max(0,w/2-ctx.lineWidth/2),Math.max(0,h/2-ctx.lineWidth/2),0,0,Math.PI*2);else ctx.rect(ctx.lineWidth/2,ctx.lineWidth/2,Math.max(0,w-ctx.lineWidth),Math.max(0,h-ctx.lineWidth));
   if(o.fill&&o.fill!=='none'){ctx.fillStyle=o.fill;ctx.fill();}if(o.strokeWidth!==0)ctx.stroke();
  }else if(o.type==='line'){ctx.beginPath();ctx.moveTo(0,h/2);ctx.lineTo(w,h/2);ctx.stroke();
  }else if(o.type==='image'){
   const im=await image(o.src);let sx=0,sy=0,sw=im.width,sh=im.height;
   if(o.crop){sx=Math.max(0,Math.min(0.99,o.crop.x||0))*im.width;sy=Math.max(0,Math.min(0.99,o.crop.y||0))*im.height;sw=Math.max(1,Math.min(1-(o.crop.x||0),o.crop.w||1)*im.width);sh=Math.max(1,Math.min(1-(o.crop.y||0),o.crop.h||1)*im.height);}
   if(o.fit==='stretch')ctx.drawImage(im,sx,sy,sw,sh,0,0,w,h);else{const scale=o.fit==='cover'?Math.max(w/sw,h/sh):Math.min(w/sw,h/sh);const dw=sw*scale,dh=sh*scale;ctx.drawImage(im,sx,sy,sw,sh,(w-dw)/2,(h-dh)/2,dw,dh);}
  }else if(o.type==='barcode'){
   const bc=document.createElement('canvas');JsBarcode(bc,o.text,{format:'CODE128',width:2,height:Math.max(16,h-(o.showText?30:0)),displayValue:!!o.showText,fontSize:20,margin:16,background:'#ffffff',lineColor:'#000000'});
   const scale=Math.min(w/bc.width,h/bc.height);if(scale*2<1.5)warnings.push('Barcode bars are narrow; enlarge the barcode for reliable scanning.');ctx.imageSmoothingEnabled=false;ctx.drawImage(bc,0,0,bc.width,bc.height,(w-bc.width*scale)/2,(h-bc.height*scale)/2,bc.width*scale,bc.height*scale);
  }else if(o.type==='qrcode'){
   const qr=document.createElement('canvas');await QRCode.toCanvas(qr,o.text,{errorCorrectionLevel:'M',margin:4,scale:6,color:{dark:'#000000',light:'#ffffff'}});const n=Math.min(w,h),scale=Math.floor(n/qr.width*6)/6;if(n/qr.width*6<2)warnings.push('QR modules are small; enlarge the QR code.');ctx.imageSmoothingEnabled=false;const size=scale>0?qr.width*scale:n;ctx.drawImage(qr,(w-size)/2,(h-size)/2,size,size);
  }
  ctx.restore();
 }
 if(opts.monochrome){const id=ctx.getImageData(0,0,c.width,c.height),a=id.data,gray=new Float32Array(c.width*c.height),t=opts.threshold??160;
  for(let i=0;i<gray.length;i++)gray[i]=a[i*4]*.299+a[i*4+1]*.587+a[i*4+2]*.114;
  for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){const i=y*c.width+x,old=gray[i],v=old<t?0:255;a[i*4]=a[i*4+1]=a[i*4+2]=v;a[i*4+3]=255;
   if(opts.dither){const e=old-v;if(x+1<c.width)gray[i+1]+=e*7/16;if(y+1<c.height){if(x>0)gray[i+c.width-1]+=e*3/16;gray[i+c.width]+=e*5/16;if(x+1<c.width)gray[i+c.width+1]+=e/16;}}}
  ctx.putImageData(id,0,0);
 }
 return {canvas:c,warnings};
}
export async function renderResult(design,opts={}){const {canvas,warnings}=await renderCanvas(design,{...opts,monochrome:true});const rgba=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let s='';for(let i=0;i<rgba.length;i+=32768)s+=String.fromCharCode(...rgba.subarray(i,i+32768));return {png:canvas.toDataURL('image/png').split(',')[1],rgba:btoa(s),width:canvas.width,height:canvas.height,warnings};}
