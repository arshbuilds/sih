import { GoogleGenAI } from "@google/genai";

const EXTRACTION_MODEL = "gemini-3.6-flash";

const EXTRACTION_PROMPT = `
Read the following construction field report and extract all distinct work activities/events.

Return ONLY valid JSON in the required format.

For each event, extract these fields:

1. rawDescription
   - Include the original sentence(s) from the report that describe this event.

2. activityDescription
   - Give a short, normalized description of the actual work activity.
   - Example: "foundation work" -> "Foundation excavation"

3. discipline
   - Identify the relevant construction discipline.
   - Examples: Civil, Electrical, Mechanical, Plumbing.
   - Do not invent a discipline if it cannot reasonably be determined.

4. location
   - Extract the location where the activity is happening.
   - If the location is not mentioned, return null.

5. eventType
   - Identify the main event type.
   - Use values such as START, PROGRESS, COMPLETE, or ISSUE.
   - If multiple event types occur for the same activity, choose the most relevant main event type.

6. progress
   - If an exact percentage is given, use that percentage (0-100).
   - "half complete" -> 50
   - "quarter complete" -> 25
   - "almost complete" -> 90
   - "nearly halfway" -> 50
   - If progress cannot reasonably be determined, return null.
   - Do not invent progress when there is not enough information.

7. issue
   - Extract any actual problem, delay, blockage, damage, shortage, or other issue related to the activity.
   - If no issue is mentioned, return null.
   - Do not invent an issue.

8. status
   - Determine the current status of the activity from the report.
   - Examples: Started, In Progress, Completed, Delayed.
   - Do not invent a status that is not supported by the report.

IMPORTANT EVENT GROUPING RULE:
- If multiple sentences describe the SAME activity, combine them into ONE event.
- Do NOT create separate events for START, PROGRESS, ISSUE, or STATUS when they refer to the same activity.
- Include all relevant information about that activity in the same event.
- Create separate events ONLY when the report describes genuinely different activities.

IMPORTANT:
- Extract ALL distinct activities mentioned in the report.
- Do not miss an activity just because it appears in a short sentence.
- Do not invent information that is not present or reasonably inferable from the report.
- eventDate will be added by the system separately. DO NOT generate eventDate.
- confidence will be handled separately by the system. DO NOT generate confidence.
`;

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    events: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          rawDescription: { type: "STRING" },
          activityDescription: { type: "STRING" },
          discipline: { type: "STRING" },
          location: { type: "STRING", nullable: true },
          eventType: { type: "STRING" },
          progress: { type: "NUMBER", nullable: true },
          issue: { type: "STRING", nullable: true },
          status: { type: "STRING" }
        },
        required: [
          "rawDescription",
          "activityDescription",
          "discipline",
          "location",
          "eventType",
          "progress",
          "issue",
          "status"
        ]
      }
    }
  },
  required: ["events"]
};

/**
 * Extracts structured events from a raw construction report using Gemini.
 *
 * @param {string} report - Unstructured text from site report
 * @param {Object} [options] - Options
 * @param {string} [options.apiKey] - Optional explicit Gemini API key
 * @param {string} [options.model] - Optional Gemini model override
 * @returns {Promise<{events: Array}>} Extracted events
 */
export async function extractFieldReportWithGemini(report, options = {}) {
  const apiKey = options.apiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured. Add it to .env.local or pass apiKey.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const model = options.model || EXTRACTION_MODEL;

  const fullPrompt = `${EXTRACTION_PROMPT}\n\nField report:\n${report.trim()}`;

  const response = await ai.models.generateContent({
    model,
    contents: fullPrompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA
    }
  });

  if (!response || !response.text) {
    throw new Error("Empty response received from Gemini model");
  }

  return JSON.parse(response.text);
}
