export default async function handler(req,res){
 if(req.method!=="POST"){res.setHeader("Allow","POST");return res.status(405).json({error:"Method not allowed."});}
 const apiKey=process.env.GEMINI_API_KEY;
 if(!apiKey)return res.status(503).json({error:"The FORMA coach is not connected yet. Check the Gemini connection in Vercel."});
 try{
  const d=req.body||{},question=String(d.question||"").trim();
  if(!question||question.length>1200)return res.status(400).json({error:"Ask a question under 1,200 characters."});
  const safe={
   profile:{age:Number(d.profile?.age)||null,height:Number(d.profile?.height)||null,weight:Number(d.profile?.weight)||null,goal:String(d.profile?.goal||"").slice(0,30),proteinTarget:Number(d.profile?.proteinTarget)||null},
   workouts:Array.isArray(d.workouts)?d.workouts.slice(-12).map(s=>({date:String(s.date||""),name:String(s.name||"").slice(0,70),duration:Number(s.duration)||null,exercises:(s.exercises||[]).slice(0,18).map(e=>({name:String(e.name||"").slice(0,70),muscle:String(e.muscle||""),sets:(e.sets||[]).filter(x=>x.done).slice(0,8).map(x=>({weight:Number(x.weight)||0,reps:Number(x.reps)||0,rpe:Number(x.rpe)||null}))}))})):[],
   meals:Array.isArray(d.meals)?d.meals.slice(-30).map(m=>({date:String(m.date||""),name:String(m.name||"").slice(0,90),calories:Number(m.calories)||0,protein:Number(m.protein)||0,carbs:Number(m.carbs)||0,fat:Number(m.fat)||0,assumptions:String(m.assumptions||"").slice(0,160)})):[],
   recovery:Array.isArray(d.recovery)?d.recovery.slice(-10).map(r=>({date:String(r.date||""),sleep:Number(r.sleep)||null,energy:String(r.energy||""),soreness:String(r.soreness||""),recovery:String(r["general recovery"]||"")})):[],
   weighIns:Array.isArray(d.measurements)?d.measurements.slice(-12).map(m=>({date:String(m.date||""),weight:Number(m.weight)||null})).filter(m=>m.weight):[]
  };
  const prompt=[
   "You are FORMA, a practical, supportive personal fitness coach. Answer the user's question using only the supplied profile and logs.",
   "The user's general aim may be fat loss while building or preserving muscle. Respect their stated goal. Give concise, actionable advice, not generic motivation.",
   "Never invent workouts, meals, weight changes, sleep or other facts. Say when the log is incomplete. Distinguish estimates from measured data.",
   "For nutrition, AI meal calories and macros are estimates and unlogged meals are missing. Do not claim a calorie deficit from a single day. Use multi-week bodyweight averages and consistent intake logs to discuss trends cautiously.",
   "For training, use completed sets and effort ratings where present. Progress gradually; prioritize technique, recovery and manageable effort. Do not diagnose injuries or prescribe medical treatment.",
   "Do not recommend extreme calorie restriction, dehydration, supplements as necessities, or training through sharp pain. Encourage a qualified clinician for medical symptoms.",
   "Answer in a natural conversational tone, usually 2-5 short paragraphs or a few bullets. If information is missing, state the single most useful thing to log next.",
   "USER QUESTION: "+question,
   "USER DATA (JSON): "+JSON.stringify(safe)
  ].join("\n");
  const response=await fetch("https://generativelanguage.googleapis.com/v1beta/interactions",{method:"POST",headers:{"x-goog-api-key":apiKey,"Content-Type":"application/json"},body:JSON.stringify({model:"gemini-3.5-flash-lite",input:prompt,store:false})});
  const payload=await response.json();
  if(!response.ok)return res.status(response.status===429?429:502).json({error:payload?.error?.message||"The coach could not answer just now."});
  if(payload.status&&payload.status!=="completed")throw new Error(payload.error?.message||"The coach did not complete the answer.");
  const answer=payload.output_text||(payload.steps||[]).filter(s=>s.type==="model_output").flatMap(s=>s.content||[]).filter(p=>p.type==="text").map(p=>p.text||"").join("\n").trim();
  if(!answer)return res.status(502).json({error:"The coach returned an empty answer."});
  return res.status(200).json({answer:String(answer).slice(0,7000)});
 }catch(e){return res.status(500).json({error:e.message||"The coach could not answer. Please try again."});}
}
