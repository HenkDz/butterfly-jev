import type { Config } from "@netlify/functions";

const allowed = new Set(["inspect_bridge","warn_neighbor","reroute","continue_work","wait"]);
const labels: Record<string,string> = {
  inspect_bridge:"Go to the north bridge and inspect whether it is open",
  warn_neighbor:"Warn a nearby resident that the north bridge may close",
  reroute:"Change route now to avoid the north bridge",
  continue_work:"Continue the current task and do not act on the rumor",
  wait:"Wait for more information before acting",
};

export default async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed",{status:405});
  const key = Netlify.env.get("TYPESAFE_API_KEY");
  if (!key) return new Response("Live Jev is not configured.",{status:503});
  const { agent, allowedActions } = await req.json();
  if (!agent || !Array.isArray(allowedActions) || allowedActions.some((x:string)=>!allowed.has(x))) {
    return new Response("Invalid decision request.",{status:400});
  }
  const state = `Role: ${agent.role}\nPrivate memories: ${JSON.stringify(agent.memory)}\nCurrent beliefs: ${JSON.stringify(agent.beliefs)}`;
  const criteria = Object.fromEntries(allowedActions.map((x:string)=>[x,labels[x]]));
  const upstream = await fetch("https://api.typesafe.ai/v1/systemone",{
    method:"POST",
    headers:{authorization:`Bearer ${key}`,"content-type":"application/json"},
    body:JSON.stringify({state,model:"jev-latest",questions:{next_action:{type:"choice",instructions:"Given only this character state, what should this character do next?",criteria}}}),
  });
  if (!upstream.ok) return new Response(`Jev upstream error ${upstream.status}`,{status:502});
  const raw:any = await upstream.json();
  const answer = raw?.answers?.next_action;
  const action = answer?.choice;
  if (!allowed.has(action)) return new Response("Jev returned an unrecognized action.",{status:502});
  return Response.json({action,confidence:answer.confidence,distribution:answer.probabilities,source:"jev"});
};

export const config: Config = { path:"/api/decide" };