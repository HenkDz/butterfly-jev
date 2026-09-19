export type Belief={claim:string,confidence:number,source:string};
export type Agent={id:string,name:string,role:string,x:number,y:number,trustCourier:number,beliefs:Belief[],memory:string[]};
export type Event={tick:number,actor:string,type:string,text:string};
export type World={tick:number,bridgeClosed:boolean,agents:Agent[],events:Event[],seed:number};
export type Action='inspect_bridge'|'warn_neighbor'|'reroute'|'continue_work'|'wait';
export type Decision={action:Action,confidence:number,distribution:Record<Action,number>,source:'rules'|'jev'|'replay'};