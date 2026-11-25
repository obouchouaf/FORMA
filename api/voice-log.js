export default async function handler(req,res){
 if(req.method!=="POST"){res.setHeader("Allow","POST");return res.status(405).json({error:"Method not allowed."});}
 const apiKey=process.env.GEMINI_API_KEY;
 if(!apiKey)return res.status(503).json({error:"Voice logging is not connected. Check the Gemini connection in Vercel."});
 try{
  const d=req.body||{},audio=d.audio;
  if(typeof audio!=="string"||audio.length>12_000_000)return res.status(400).json({error:"Please record a shorter voice note."});
  const match=audio.match(/^data:(audio\/(?:mp4|webm|ogg|wav|mpeg|mp3|m4a|aac|opus))(?:;[^,]*)?;base64,([\\s\\S]+)$/i);
  if(!match)return res.status(400).json({error:"This audio format is not supported on this device."});
  const mode=d.mode==="nutrition"?"nutrition":"workout";
  const exercises=Array.isArray(d.exercises)?d.exercises.slice(0,30).map(e=>({name:String(e.name||"").slice(0,70),nextSet:Number(e.nextSet)||1})): [];
  const prompt=mode==="nutrition"?[
   "You are FORMA, a nutrition logging assistant. Listen to the user's spoken description of one meal and estimate one person's serving.",
   "Recognise foods, ingredients and portion sizes. Use reasonable assumptions when portions are not stated, and clearly state them.",
   "Return approximate calories in kcal and grams of protein, carbohydrates and fat. Never imply exact precision.",
   "Return ONLY JSON with keys mealName (string), ingredients (string), calories (number), protein (number), carbs (number), fat (number), confidence (one of Low confidence, Medium confidence, Higher confidence), assumptions (string)."
  ].join("\n"):[
   "You convert a gym voice note into a structured workout set log. Return only one JSON object.",
   "Understand natural speech such as 'just did fifty kilos for ten reps, that was an eight' or 'second set, 45 kilos, 12 reps'.",
   "Use active exercise context if no exercise name is spoken. Match spoken exercise names to the closest supplied exercise.",
   "Weight is kilograms. Do not invent values. Missing weight, reps, RPE or set number must be null. RPE is optional 6-10 only if clearly stated.",
   "If set number is not stated, use nextSet. Return keys: type ('workout_set' or 'unclear'), exerciseName (string or null), setNumber (integer or null), weightKg (number or null), reps (integer or null), rpe (number or null), note (short string).",
   "Available exercises: "+JSON.stringify(exercises),
   "Active exercise: "+String(d.activeExercise||"not selected"),
   "Next set: "+String(Number(d.nextSet)||1)
  ].join("\n");
  const input=[{type:"text",text:prompt},{type:"audio",data:match[2],mime_type:match[1]}];
  const response=await fetch("https://generativelanguage.googleapis.com/v1beta/interactions",{method:"POST",headers:{"x-goog-api-key":apiKey,"Content-Type":"application/json","Api-Revision":"2026-05-20"},body:JSON.stringify({model:"gemini-3.5-flash-lite",input,store:false,response_mime_type:"application/json"})});
  const payload=await response.json();
  if(!response.ok)return res.status(response.status===429?429:502).json({error:payload?.error?.message||"Could not understand that voice note."});
  if(payload.status&&payload.status!=="completed")throw new Error(payload.error?.message||"Voice processing did not complete.");
  const output=payload.output_text||(payload.steps||[]).filter(s=>s.type==="model_output").flatMap(s=>s.content||[]).filter(p=>p.type==="text").map(p=>p.text||"").join("\n").trim();
  if(!output)throw new Error("The voice service returned no result.");
  const result=JSON.parse(output.replace(/^`\`\`json\s*/i,"").replace(/`\`\`$/,""));
  if(mode==="nutrition"){
   for(const k of ["calories","protein","carbs","fat"]){if(!Number.isFinite(result[k])||result[k]<0)throw new Error("The nutrition estimate was incomplete.");result[k]=Math.round(result[k]*10)/10;}
   if(!result.mealName)throw new Error("Could not identify the meal. Please try again.");
  }else{
   if(!["workout_set","unclear"].includes(result.type))result.type="unclear";
   result.weightKg=Number.isFinite(result.weightKg)?result.weightKg:null;
   result.reps=Number.isFinite(result.reps)?Math.round(result.reps):null;
   result.rpe=Number.isFinite(result.rpe)?result.rpe:null;
   result.setNumber=Number.isFinite(result.setNumber)?Math.max(1,Math.round(result.setNumber)):null;
  }
  return res.status(200).json(result);
 }catch(error){return res.status(500).json({error:error.message||"Could not process that voice note."});}
}