const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('studio',{
  call:(method,args={})=>ipcRenderer.invoke('studio:call',method,args),
  onRender:cb=>ipcRenderer.on('studio:render',async(_,job)=>{try{ipcRenderer.send('studio:rendered',{id:job.id,result:await cb(job.design,job.options)});}catch(e){ipcRenderer.send('studio:rendered',{id:job.id,error:e.message});}}),
  onDesign:cb=>ipcRenderer.on('studio:design',(_,design)=>cb(design)),
  onStatus:cb=>ipcRenderer.on('studio:status',(_,status)=>cb(status))
});
