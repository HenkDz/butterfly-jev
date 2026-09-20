import type { Config } from "@netlify/functions";
export default async () => Response.json({ok:true,jevConfigured:Boolean(Netlify.env.get("TYPESAFE_API_KEY"))});
export const config: Config = { path:"/api/health" };