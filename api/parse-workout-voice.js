export default async function handler(req,res){
 if(req.method!=="POST"){res.setHeader("Allow","POST");return res.status(405).json({error:"Method not allowed."});}
 const apiKey=process.env.GEMINI_API_KEY;
 if(!apiKey)return res.status(503).json({error:"Voice logging is not connected. Check the Gemini connection in Vercel."});
 try{
  const d=req.body||{},transcript=String(d.transcript||"").trim();
  if(!transcript||transcript.length>1200)return res.status(400).json({error:"Please record a short workout note."});
  const exercises=Array.isArray(d.exercises)?d.exercises.slice(0,30).map(e=>({name:String(e.name||"").slice(0,70),nextSet:Number(e.nextSet)||1,sets:Number(e.sets)||0})): [];
  const prompt=[
   "You convert a gym voice note into a structured workout set log. Return only one JSON object.",
   "The speaker may say natural phrases such as 'just did fifty kilos for ten reps, that was an eight' or 'second set, 45 kilos, 12 reps'.",
   "Use the active exercise context when the speaker does not name an exercise. If an exercise is named, match it to the closest item in the supplied list.",
   "Do not invent values. Convert spoken number words to numbers. Weight is kilograms. RPE is optional and should be a number from 6 to 10 only if clearly stated.",
   "If weight or reps are missing, return null for that field. setNumber should be the explicitly stated set number or the nextSet of the active exercise.",
   "Return keys: type ('workout_set' or 'unclear'), exerciseName (string or null), setNumber (integer or null), weightKg (number or null), reps (integer or null), rpe (number or null), note (short string).",
   "Available exercises: "+JSON.stringify(exercises),
   "Active exercise: "+String(d.activeExercise||"not selected"),
   "Next set: "+String(Number(d.nextSet)||1),
   "Voice note: "+transcript
  ].join("\n");
  const response=await fetch("https://generativelanguage.googleapis.com/v1beta/interactions",{method:"POST",headers:{"x-goog-api-key":apiKey,"Content-Type":"application/json"},body:JSON.stringify({model:"gemini-3.5-flash-lite",input:prompt,store:false,response_format:{type:"text",mime_type:"application/json"}})});
  const payload=await response.json();
  if(!response.ok)return res.status(response.status===429?429:502).json({error:payload?.error?.message||"Could not interpret that voice note."});
  if(payload.status&&payload.status!=="completed")throw new Error(payload.error?.message||"Voice interpretation did not complete.");
  const output=payload.output_text||(payload.steps||[]).filter(s=>s.type==="model_output").flatMap(s=>s.content||[]).filter(p=>p.type==="text").map(p=>p.text||"").join("\n").trim();
  if(!output)throw new Error("The voice service returned no result.");
  const result=JSON.parse(output.replace(/^`\`\`json\s*/i,"").replace(/`\`\`$/,""));
  if(!["workout_set","unclear"].includes(result.type))result.type="unclear";
  result.weightKg=Number.isFinite(Number(result.weightKg))&&result.weightKg!==null?Number(result.weightKg):null;
  result.reps=Number.isFinite(Number(result.reps))&&result.reps!==null?Math.round(Number(result.reps)):null;
  result.rpe=Number.isFinite(Number(result.rpe))&&result.rpe!==null?Number(result.rpe):null;
  result.setNumber=Number.isFinite(Number(result.setNumber))&&result.setNumber!==null?Math.max(1,Math.round(Number(result.setNumber))):null;
  return res.status(200).json(result);
 }catch(error){return res.status(500).json({error:error.message||"Could not interpret that voice note."});}
}