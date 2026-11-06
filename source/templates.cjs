function templates(){return [
 {id:'product',name:'Product · modern',widthMm:101.6,heightMm:76.2,dpi:203,objects:[
  {id:'tag',type:'text',x:7,y:6,w:88,h:5,fontSize:2.8,text:'FIELD / SUPPLY',bold:true,letterSpacing:1},
  {id:'rule',type:'line',x:7,y:15,w:87,h:0.4,strokeWidth:0.4},
  {id:'title',type:'text',x:7,y:20,w:85,h:19.5,fontSize:8,text:'EVERYDAY\nESSENTIALS',bold:true},
  {id:'desc',type:'text',x:7,y:42,w:85,h:8,fontSize:3.2,text:'Small batch. Made with intention.'},
  {id:'code',type:'barcode',x:7,y:54,w:62,h:15,text:'SKU-001234',showText:true},
  {id:'weight',type:'text',x:75,y:59,w:21,h:7,fontSize:4,text:'250 g',bold:true}]},
 {id:'shipping',name:'Shipping · 4 × 6',widthMm:101.6,heightMm:152.4,dpi:203,objects:[
  {id:'from',type:'text',x:6,y:6,w:89,h:21,fontSize:3,text:'FROM\nYour Business\n123 Example Street\nChicago, IL 60601'},
  {id:'rule',type:'line',x:6,y:31,w:89,h:0.4,strokeWidth:0.4},
  {id:'ship',type:'text',x:6,y:38,w:89,h:7,fontSize:3,text:'SHIP TO',bold:true},
  {id:'to',type:'text',x:6,y:49,w:89,h:33,fontSize:5,text:'{{name}}\n{{address}}\n{{city}}',bold:true},
  {id:'box',type:'rect',x:6,y:90,w:89,h:18,strokeWidth:0.5,fill:'white'},
  {id:'service',type:'text',x:10,y:95,w:80,h:9,fontSize:5,text:'PACKAGE / 01',bold:true},
  {id:'barcode',type:'barcode',x:8,y:115,w:85,h:26,text:'123456789012',showText:true}]},
 {id:'address',name:'Address · compact',widthMm:88.9,heightMm:28.6,dpi:203,objects:[
  {id:'name',type:'text',x:4,y:3,w:78,h:6,fontSize:4,text:'{{name}}',bold:true},
  {id:'address',type:'text',x:4,y:11,w:78,h:14,fontSize:3,text:'{{address}}\n{{city}}'}]},
 {id:'inventory',name:'Inventory · QR',widthMm:76.2,heightMm:50.8,dpi:203,objects:[
  {id:'title',type:'text',x:4,y:4,w:68,h:6,fontSize:4,text:'ASSET / {{asset}}',bold:true},
  {id:'qr',type:'qrcode',x:4,y:15,w:29,h:29,text:'{{url}}'},
  {id:'info',type:'text',x:37,y:17,w:35,h:25,fontSize:3,text:'PROPERTY OF\n{{company}}\n\nSCAN FOR DETAILS'}]}
];}
module.exports={templates};
