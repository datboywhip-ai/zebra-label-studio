const fs=require('node:fs'),path=require('node:path');
// Bundle only runtime assets. No developer packages or machine-specific node_modules.
const source=__dirname,out=process.argv[2]?path.resolve(process.argv[2]):path.join(source,'..','desktop');
if(fs.existsSync(out))throw new Error('app directory already exists; use a fresh output path');
fs.cpSync(path.join(source,'node_modules/electron/dist'),out,{recursive:true});
fs.renameSync(path.join(out,'electron.exe'),path.join(out,'Zebra Label Studio.exe'));
const dest=path.join(out,'resources/app');fs.mkdirSync(dest,{recursive:true});
for(const name of ['main.cjs','core.cjs','preload.cjs','mcp.cjs','templates.cjs','print.ps1','usb.csharp','package.json'])fs.copyFileSync(path.join(source,name),path.join(dest,name));
fs.cpSync(path.join(source,'ui'),path.join(dest,'ui'),{recursive:true});
console.log(out);
