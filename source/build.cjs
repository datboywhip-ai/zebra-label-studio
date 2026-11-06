const esbuild=require('esbuild'); const fs=require('node:fs');require('./icon.cjs');
(async()=>{fs.mkdirSync('ui/vendor',{recursive:true}); fs.copyFileSync('node_modules/pdfjs-dist/build/pdf.worker.mjs','ui/vendor/pdf.worker.mjs');
await esbuild.build({entryPoints:['ui/app.js'],bundle:true,format:'esm',outfile:'ui/bundle.js',target:'chrome130',minify:true});})();
