const {test}=require('node:test');const assert=require('node:assert/strict');
const {validateDesign,rgbaToRaster,rasterToZpl,applyVariables}=require('../core.cjs');const {templates}=require('../templates.cjs');
test('Templates stay inside actual printable bounds',()=>{for(const t of templates())assert.equal(validateDesign(t).dpi,203);});
test('Reject path traversal, unsupported images and out-of-bounds designs',()=>{
 const d=templates()[0];assert.throws(()=>validateDesign({...d,id:'../escape'}));assert.throws(()=>validateDesign({...d,widthMm:108}));assert.throws(()=>validateDesign({...d,objects:[{type:'image',x:0,y:0,w:5,h:5,src:'https://example.com/logo.png'}]}));assert.throws(()=>validateDesign({...d,objects:[{type:'rect',x:100,y:0,w:20,h:5}]}));assert.throws(()=>validateDesign({...d,objects:[{type:'text',x:0,y:0,w:20,h:5,fontSize:NaN}]}));
});
test('Raster bit ordering, byte padding and transparent white',()=>{
 const rgba=Buffer.alloc(9*4,255);for(const i of [0,7,8]){rgba[i*4]=rgba[i*4+1]=rgba[i*4+2]=0;}const r=rgbaToRaster(rgba,9,1);assert.deepEqual([...r.bytes],[0x81,0x80]);assert.equal(r.bpr,2);
 const transparent=Buffer.from([0,0,0,0]);assert.equal(rgbaToRaster(transparent,1,1).bytes[0],0);
});
test('ZPL graphics counts, offsets, total raster and bounded copies',()=>{
 const width=812,height=1218,bpr=Math.ceil(width/8),bytes=Buffer.alloc(bpr*height,0xa5),z=rasterToZpl({bytes,bpr,width,height},2);
 assert.match(z,/\^PW812\n\^LL1218/);const chunks=[...z.matchAll(/\^FO0,(\d+)\^GFA,(\d+),(\d+),(\d+),([A-F0-9]+)\^FS/g)];assert.equal(chunks.length,3);let joined=[];
 for(const [_,y,n,n2,b,h] of chunks){assert.equal(Number(n),Number(n2));assert.equal(Number(b),bpr);assert.equal(h.length,Number(n)*2);assert(Number(n)<=60000);assert.equal(Number(y)*bpr,Buffer.concat(joined).length);joined.push(Buffer.from(h,'hex'));}
 assert.deepEqual(Buffer.concat(joined),bytes);assert.match(z,/\^PQ2,0,1,N/);assert.throws(()=>rasterToZpl({bytes,bpr,width,height},101));assert.throws(()=>rasterToZpl({bytes,bpr,width,height},1.5));
});
test('Variables are substituted literally and do not become print commands',()=>{const d=applyVariables(templates()[1],{name:'^XA^JUS^XZ',address:'$& and \\text',city:'Chicago'});assert.equal(d.objects.find(o=>o.id==='to').text,'^XA^JUS^XZ\n$& and \\text\nChicago');});
test('Dithering stays inside row buffers and produces deterministic data',()=>{const rgba=Buffer.alloc(8*8*4,128);for(let i=3;i<rgba.length;i+=4)rgba[i]=255;const a=rgbaToRaster(rgba,8,8,128,true),b=rgbaToRaster(rgba,8,8,128,true);assert.deepEqual(a.bytes,b.bytes);assert(a.bytes.some(n=>n!==0&&n!==255));});
