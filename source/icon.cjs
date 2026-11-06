const fs=require('node:fs'),zlib=require('node:zlib');
function crc(b){let c=0xffffffff;for(const n of b){c^=n;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function chunk(type,data){const t=Buffer.from(type),len=Buffer.alloc(4),sum=Buffer.alloc(4);len.writeUInt32BE(data.length);sum.writeUInt32BE(crc(Buffer.concat([t,data])));return Buffer.concat([len,t,data,sum]);}
const n=64,raw=Buffer.alloc((n*4+1)*n);for(let y=0;y<n;y++)for(let x=0;x<n;x++){const i=y*(n*4+1)+1+x*4;let rgb=[38,59,96];if((x>=15&&x<=48&&(y>=13&&y<=21||y>=43&&y<=51))||(y>=20&&y<=44&&Math.abs(x-(63-y))<6))rgb=[255,255,255];if(x>44&&y>44)rgb=[150,234,174];raw[i]=rgb[0];raw[i+1]=rgb[1];raw[i+2]=rgb[2];raw[i+3]=255;}
const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(n);ihdr.writeUInt32BE(n,4);ihdr[8]=8;ihdr[9]=6;
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);fs.writeFileSync('ui/icon.png',png);
const ico=Buffer.alloc(22);ico.writeUInt16LE(1,2);ico.writeUInt16LE(1,4);ico[6]=64;ico[7]=64;ico.writeUInt16LE(1,10);ico.writeUInt16LE(32,12);ico.writeUInt32LE(png.length,14);ico.writeUInt32LE(22,18);fs.writeFileSync('ui/icon.ico',Buffer.concat([ico,png]));
