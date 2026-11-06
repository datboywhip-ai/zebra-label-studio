'use strict';
const crypto = require('node:crypto');
const TYPES = ['text','rect','ellipse','line','image','barcode','qrcode'];
function number(v, lo, hi, name) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) throw new Error(`${name} must be ${lo}–${hi}`);
  return v;
}
function validateDesign(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('A design object is required');
  const d = JSON.parse(JSON.stringify(input));
  d.id = d.id || crypto.randomUUID();
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(d.id)) throw new Error('Invalid design id');
  d.name = String(d.name || 'Untitled label').slice(0,120);
  number(d.widthMm, 10, 104, 'widthMm'); number(d.heightMm, 10, 991, 'heightMm');
  d.dpi = 203;
  if (!Array.isArray(d.objects) || d.objects.length > 200) throw new Error('objects must be an array of at most 200 elements');
  const ids = new Set();
  for (const o of d.objects) {
    if (!TYPES.includes(o.type)) throw new Error(`Unsupported element: ${o.type}`);
    o.id ||= crypto.randomUUID();
    if (typeof o.id !== 'string' || ids.has(o.id)) throw new Error('Element ids must be unique strings'); ids.add(o.id);
    number(o.x,0,d.widthMm,'x'); number(o.y,0,d.heightMm,'y');
    number(o.w,0.2,104,'w'); number(o.h,0.2,991,'h');
    if(o.x+o.w>d.widthMm+0.15 || o.y+o.h>d.heightMm+0.15) throw new Error(`Element ${o.id} extends beyond the label`);
    if(o.rotation !== undefined) number(o.rotation,-360,360,'rotation');
    if(o.fontSize !== undefined) number(o.fontSize,1,100,'fontSize');
    if(o.strokeWidth !== undefined) number(o.strokeWidth,0,20,'strokeWidth');
    if(o.type==='text') {o.text=String(o.text || ''); if(o.text.length>10000) throw new Error('Text too long');}
    if(['barcode','qrcode'].includes(o.type)) {
      o.text=String(o.text || ''); if(!o.text || o.text.length>2000) throw new Error('Barcode/QR content is required and must be under 2000 characters');
      if(o.type==='barcode' && !/^[\x20-\x7e]+$/.test(o.text)) throw new Error('Code 128 accepts printable ASCII here');
    }
    if(o.type==='image' && (typeof o.src!=='string' || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(o.src) || o.src.length>20*1024*1024)) throw new Error('Images must be embedded PNG, JPEG or WebP data, up to 15 MB');
  }
  if(Math.round(d.widthMm*203/25.4)*Math.round(d.heightMm*203/25.4)>8000000) throw new Error('Label bitmap is too large');
  return d;
}
function rgbaToRaster(rgba,width,height,threshold=160,dither=false) {
  number(width,1,832,'width'); number(height,1,8000,'height'); number(threshold,0,255,'threshold');
  if(!Number.isInteger(width)||!Number.isInteger(height)||rgba.length!==width*height*4) throw new Error('Invalid raster dimensions');
  const bpr=Math.ceil(width/8), bytes=Buffer.alloc(bpr*height), gray=new Float32Array(width*height);
  for(let i=0;i<gray.length;i++) {const a=rgba[i*4+3]/255; gray[i]=(rgba[i*4]*0.299+rgba[i*4+1]*0.587+rgba[i*4+2]*0.114)*a+255*(1-a);}
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
    const i=y*width+x, old=gray[i], black=old<threshold;
    if(black) bytes[y*bpr+(x>>3)] |= 0x80>>(x%8);
    if(dither) {const e=old-(black?0:255); if(x+1<width) gray[i+1]+=e*7/16; if(y+1<height) {if(x>0) gray[i+width-1]+=e*3/16; gray[i+width]+=e*5/16; if(x+1<width) gray[i+width+1]+=e/16;}}
  }
  return {bytes,bpr,width,height};
}
function rasterToZpl(raster,copies=1) {
  number(copies,1,100,'copies'); if(!Number.isInteger(copies)) throw new Error('Copies must be an integer');
  const {bytes,bpr,width,height}=raster;
  // Conservative chunks keep every ^GF graphic below older firmware's 99,999-byte count limit.
  const rows=Math.max(1,Math.floor(60000/bpr)); let z=`^XA\n^PW${width}\n^LL${height}\n^LH0,0\n^LS0\n^LT0\n`;
  for(let y=0;y<height;y+=rows) {const slice=bytes.subarray(y*bpr,Math.min(height,y+rows)*bpr); z+=`^FO0,${y}^GFA,${slice.length},${slice.length},${bpr},${slice.toString('hex').toUpperCase()}^FS\n`;}
  return z+`^PQ${copies},0,1,N\n^XZ\n`;
}
function applyVariables(design,variables={}) {
  const d=JSON.parse(JSON.stringify(design));
  for(const o of d.objects) if(typeof o.text==='string') o.text=o.text.replace(/\{\{\s*([\w.-]+)\s*\}\}/g,(_,key)=>Object.hasOwn(variables,key)?String(variables[key]):`{{${key}}}`);
  return validateDesign(d);
}
module.exports={validateDesign,rgbaToRaster,rasterToZpl,applyVariables,TYPES};
