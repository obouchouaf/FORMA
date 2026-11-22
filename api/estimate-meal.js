export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error: "Meal AI is not connected yet. Add OPENAI_API_KEY to the Vercel project environment variables, then redeploy."
    });
  }

  try {
    const { description = "", image = null } = req.body || {};
    if (typeof description !== "string" || description.length > 3000) {
      return res.status(400).json({ error: "Please keep the meal description under 3,000 characters." });
    }
    if (!description.trim() && !image) {
      return res.status(400).json({ error: "Describe the meal or upload a photo." });
    }
    if (image && (typeof image !== "string" || !/^data:image\/(jpeg|jpg|png|webp);base64,/.test(image) || image.length > 11_000_000)) {
      return res.status(400).json({ error: "Please upload a JPG, PNG or WebP image under 8 MB." });
    }

    const content = [{
      type: "input_text",
      text: [
        "Estimate the nutrition for the food described or shown. Treat it as one serving eaten by one person.",
        "Identify likely foods and ingredients, infer reasonable portion sizes when missing, and state those assumptions clearly.",
        "Return realistic approximate total calories in kcal and grams of protein, carbohydrates and fat.",
        "Do not claim precision. If portion size is unclear, lower confidence and explain the assumption.",
        "If the image contains multiple dishes, estimate the visible serving that appears intended for one person.",
        "User description: " + (description.trim() || "No text description; identify the food from the image.")
      ].join("\n")
    }];
    if (image) content.push({ type: "input_image", image_url: image, detail: "high" });

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        input: [{ role: "user", content }],
        text: {
          format: {
            type: "json_schema",
            name: "meal_nutrition_estimate",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                mealName: { type: "string" },
                ingredients: { type: "string" },
                calories: { type: "number" },
                protein: { type: "number" },
                carbs: { type: "number" },
                fat: { type: "number" },
                confidence: { type: "string", enum: ["Low confidence", "Medium confidence", "Higher confidence"] },
                assumptions: { type: "string" }
              },
              required: ["mealName", "ingredients", "calories", "protein", "carbs", "fat", "confidence", "assumptions"]
            }
          }
        },
        max_output_tokens: 500
      })
    });

    const payload = await response.json();
    if (!response.ok) {
      const message = payload?.error?.message || "The nutrition service could not estimate this meal.";
      return res.status(response.status === 429 ? 429 : 502).json({ error: message });
    }
    const outputText = (payload.output || [])
      .flatMap(item => item.content || [])
      .filter(item => item.type === "output_text")
      .map(item => item.text)
      .join("\n");
    if (!outputText) throw new Error("The nutrition service returned no estimate.");
    const result = JSON.parse(outputText);
    for (const key of ["calories", "protein", "carbs", "fat"]) {
      if (!Number.isFinite(result[key]) || result[key] < 0) throw new Error("Invalid nutrition estimate.");
      result[key] = Math.round(result[key] * 10) / 10;
    }
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message || "Meal analysis failed. Please try again." });
  }
}
