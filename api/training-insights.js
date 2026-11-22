export default async function handler(req, res) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Method not allowed." }); }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: "AI coach is not connected yet. Add OPENAI_API_KEY to Vercel Environment Variables and redeploy." });
  try {
    const d = req.body || {};
    const safe = {
      period: d.period, workouts: Number(d.workouts)||0, previousWorkouts: Number(d.previousWorkouts)||0,
      sets: Number(d.sets)||0, volume: Number(d.volume)||0, previousVolume: Number(d.previousVolume)||0,
      averageEffort: Number.isFinite(d.averageEffort) ? d.averageEffort : null,
      mealDays: Number(d.mealDays)||0, recoveryEntries: Number(d.recoveryEntries)||0,
      exercises: Array.isArray(d.exercises) ? d.exercises.slice(0,35).map(e=>({
        name:String(e.name||"").slice(0,100), sets:Number(e.sets)||0, reps:Number(e.reps)||0,
        averageRpe:Number.isFinite(e.averageRpe)?e.averageRpe:null, topWeight:Number.isFinite(e.topWeight)?e.topWeight:null
      })) : []
    };
    const prompt = [
      "You are FORMA, a careful and encouraging strength-training coach. Review this user's last-seven-days training log.",
      "Be specific, practical, supportive and honest. Do not invent missing data or shame the user for a low-volume week.",
      "Compare workouts and volume with the previous seven days only where meaningful. Distinguish a quiet week from poor performance.",
      "Use RPE 6-7 as relatively easy, 8 as challenging/productive, 9-10 as very demanding. Do not tell them to increase weight just because effort is low: first suggest a controlled extra rep within their target range; increase load only when top of rep range is achieved with clean technique and manageable effort.",
      "Identify which logged exercises may have room for more reps/effort and which may need recovery. Avoid claiming muscle imbalances from limited data.",
      "Nutrition and recovery logging are incomplete signals; never infer actual calorie intake, sleep or recovery when not logged.",
      "If no workouts were logged in this seven-day period, say so neutrally, compare prior week if possible, and give a realistic next step rather than pretending performance was assessed.",
      "Return a concise weekly review. headline is a short verdict, summary 2-3 sentences, wins 1-3 items, opportunities 1-3 items, nextWeekFocus one clear action, caveat one brief limitation.",
      "DATA (JSON): " + JSON.stringify(safe)
    ].join("\n");
    const response = await fetch("https://api.openai.com/v1/responses", {
      method:"POST", headers:{"Authorization":"Bearer "+apiKey,"Content-Type":"application/json"},
      body:JSON.stringify({
        model:"gpt-4o-mini",
        input:[{role:"user",content:[{type:"input_text",text:prompt}]}],
        text:{format:{type:"json_schema",name:"weekly_training_review",strict:true,schema:{
          type:"object",additionalProperties:false,
          properties:{
            headline:{type:"string"},summary:{type:"string"},
            wins:{type:"array",items:{type:"string"}},
            opportunities:{type:"array",items:{type:"string"}},
            nextWeekFocus:{type:"string"},caveat:{type:"string"}
          },
          required:["headline","summary","wins","opportunities","nextWeekFocus","caveat"]
        }}},
        max_output_tokens:700
      })
    });
    const payload=await response.json();
    if(!response.ok)return res.status(502).json({error:payload?.error?.message||"The AI coach could not complete the review."});
    const output=(payload.output||[]).flatMap(x=>x.content||[]).filter(x=>x.type==="output_text").map(x=>x.text).join("\n");
    if(!output)throw new Error("The AI coach returned no review.");
    return res.status(200).json(JSON.parse(output));
  } catch(e) { return res.status(500).json({error:e.message||"Weekly review failed. Please try again."}); }
}
