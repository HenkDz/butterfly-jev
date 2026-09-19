import type {Agent,World} from './types';
const roles=['Courier','Baker','Teacher','Mechanic','Nurse','Grocer','Carpenter','Student'];
export function makeWorld(seed=7):World{
 const agents:Agent[]=Array.from({length:24},(_,i)=>({id:`a${i}`,name:['Mina','Omar','Lina','Yacine','Sara','Nadir','Aya','Rami'][i%8]+` ${i+1}`,role:roles[i%8],x:8+(i%6)*15,y:14+Math.floor(i/6)*20,trustCourier:.35+((i*17)%55)/100,beliefs:[],memory:[]}));
 agents[0]={...agents[0],role:'Courier',memory:['A friend once gave me useful route information.'],beliefs:[{claim:'The north bridge will close tonight.',confidence:.68,source:'anonymous tip'}]};
 return{tick:0,bridgeClosed:false,agents,events:[{tick:0,actor:'world',type:'fact',text:'The north bridge is open.'},{tick:0,actor:'a0',type:'rumor',text:'Courier Mina heard: “The north bridge will close tonight.”'}],seed};
}
export function forkWorld(w:World,trustworthy:boolean):World{
 const c=structuredClone(w); c.events.push({tick:c.tick,actor:'world',type:'fork',text:`Forked timeline: courier remembers the source as ${trustworthy?'trustworthy':'unreliable'}.`});
 c.agents[0].memory=[trustworthy?'The source helped me correctly before.':'The source misled me before.']; c.agents[0].beliefs[0].confidence=trustworthy?.88:.28; return c;
}