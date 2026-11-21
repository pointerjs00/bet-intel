// Minimal reader for the pt-vision "memory" binary format (decoded LZMA slice).
const td=new TextDecoder('utf-8');
const rU16=(m,o)=>m[o]|(m[o+1]<<8), rI32=(m,o)=>(m[o+3]<<24)|(m[o+2]<<16)|(m[o+1]<<8)|m[o];
const rU32=(m,o)=>m[o]+m[o+1]*256+m[o+2]*65536+m[o+3]*16777216;
const rStr=(m,o)=>{const n=rU16(m,o);return n?td.decode(m.subarray(o+2,o+2+n)):''};
const rLong=(m,o)=>{let v=0;for(let i=7;i>=0;i--)v=v*256+m[o+i];return v};
function readFn(m,io,t){switch(t){
 case 0:return i=>m[io+i];case 1:return i=>!!((m[io+(i>>3)]>>>(i%8))&1);
 case 2:return i=>{let v=rU16(m,io+i*2);return v>32767?v-65536:v};case 3:return i=>rU16(m,io+i*2);
 case 4:return i=>rI32(m,io+i*4);case 5:return i=>rU32(m,io+i*4);case 6:return i=>new Date(rU32(m,io+i*4)*1000);
 case 7:return i=>rLong(m,io+i*8);case 10:return i=>{const p=rI32(m,io+i*4);return p?rStr(m,p):null};
 default:return()=>`?type${t}`}}
function parse(m){
 if(m[0]!==201)throw new Error('bad memory tag '+m[0]);
 const maxTables=rU16(m,11), tables={};
 for(let i=0;i<maxTables;i++){const to=rI32(m,18+i*4);if(!to)continue;
  if(m[to]!==203)continue;const nc=rU16(m,to+7);const name=rStr(m,to+10+nc*4);const cols={};let count=0;
  for(let c=0;c<nc;c++){const co=rI32(m,to+10+c*4);if(m[co]!==206)continue;const hl=rU16(m,co+5),type=m[co+15],cnt=rI32(m,co+11);
   const cn=rStr(m,co+21);cols[cn]={type,count:cnt,get:readFn(m,co+hl,type)};count=Math.max(count,cnt)}
  tables[name]={name,count,cols,row(i){const r={};for(const k in cols){r[k]=i<cols[k].count?cols[k].get(i):undefined}return r},
   rows(){const a=[];for(let i=0;i<count;i++)a.push(this.row(i));return a}}}
 return tables}
module.exports={parse};
