export default async function handler(req, res) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Method not allowed." }); }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: "AI coach is not connected yet. Add GEMINI_API_KEY to Vercel Environment Variables and redeploy." });
  try {
    const d = req.body || {};
    const safe = {
      period: d.period, workouts: Number(d.workouts)||0, previousWorkouts: Number(d.previousWorkouts)||0,
      sets: Number(d.sets)||0, volume: Number(d.volume)||0, previousVolume: Number(d.previousVolume)||0,
      averageEffort: Number.isFinite(d.averageEffort) ? d.averageEffort : null,
      meals: Array.isArray(d.meals) ? d.meals.slice(0,35).map(m=>({
        date:String(m.date||"").slice(0,10), name:String(m.name||"").slice(0,100),
        calories:Number(m.calories)||0, protein:Number(m.protein)||0,
        carbs:Number(m.carbs)||0, fat:Number(m.fat)||0,
        assumptions:String(m.assumptions||"").slice(0,180)
      })) : [],
      recovery: Array.isArray(d.recovery) ? d.recovery.slice(0,14).map(r=>({
        date:String(r.date||"").slice(0,10), sleep:Number(r.sleep)||null,
        energy:String(r.energy||"").slice(0,30), soreness:String(r.soreness||"").slice(0,30),
        recovery:String(r.recovery||"").slice(0,30), rest:String(r.rest||"").slice(0,10)
      })) : [],
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
      "Review meal logs as estimates. Summarize logged calories and macros only when there are enough entries; unlogged meals mean the day is incomplete. Never infer a calorie deficit from a single day.",
      "Use recovery entries only for recorded sleep, energy, soreness and self-reported recovery. Do not invent missing values. If entries are sparse, say the signal is limited.",
      "If meal logs show consistently low protein relative to training needs, suggest practical protein additions without prescribing a rigid diet. Avoid aggressive calorie restriction.",
      "Never infer actual calorie intake, sleep or recovery when they were not logged.",
      "If no workouts were logged in this seven-day period, say so neutrally, compare prior week if possible, and give a realistic next step rather than pretending performance was assessed.",
      "Return ONLY a JSON object with keys: headline (string), summary (string), wins (array of strings), opportunities (array of strings), nextWeekFocus (string), caveat (string).",
      "headline is a short verdict, summary 2-3 sentences, wins 1-3 items, opportunities 1-3 items, nextWeekFocus one clear action, caveat one brief limitation.",
      "Include a nutrition or recovery observation only when the supplied entries support it. Clearly distinguish logged data from estimates.",
      "DATA (JSON): " + JSON.stringify(safe)
    ].join("\n");
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gemini-3.5-flash-lite",
        input: prompt,
        store: false,
        response_format: { type: "text", mime_type: "application/json" }
      })
    });
    const payload = await response.json();
    if (!response.ok) return res.status(response.status === 429 ? 429 : 502).json({ error: payload?.error?.message || "The AI coach could not complete the review." });
    if (payload.status && payload.status !== "completed") {
      throw new Error(payload.error?.message || "The AI coach did not complete the review.");
    }
    const output = payload.output_text || (payload.steps || [])
      .filter(step => step.type === "model_output")
      .flatMap(step => step.content || [])
      .filter(part => part.type === "text")
      .map(part => part.text || "")
      .join("\n").trim();
    if (!output) throw new Error("The AI coach returned no review.");
    const result = JSON.parse(output.replace(/^\`\`\`json\s*/i, "").replace(/\`\`\`$/, ""));
    if (!result.headline || !result.summary || !Array.isArray(result.wins) || !Array.isArray(result.opportunities) || !result.nextWeekFocus || !result.caveat) {
      throw new Error("The AI coach returned an incomplete review.");
    }
    return res.status(200).json(result);
  } catch(e) { return res.status(500).json({ error: e.message || "Weekly review failed. Please try again." }); }
}
