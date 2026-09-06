const OpenAI = require("openai");
const { EXTRACTION_SYSTEM_PROMPT } = require("./prompt");

/**
 * Returns an OpenAI client instance.
 * Checks for API key availability lazily to avoid crashing at module import time.
 */
function getClient(customApiKey) {
  const apiKey = customApiKey || process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not configured. Please set OPENAI_API_KEY in your .env.local file or environment."
    );
  }

  return new OpenAI({ apiKey });
}

/**
 * Extracts structured construction field report information from raw text.
 *
 * @param {string} report - Raw field report text
 * @param {Object} [options] - Optional settings
 * @param {string} [options.apiKey] - Optional custom OpenAI API key
 * @param {string} [options.model] - Optional custom OpenAI model (defaults to OPENAI_MODEL or gpt-5.6-luna)
 * @returns {Promise<Object>} Extracted structured data
 */
async function extractFieldReport(report, options = {}) {
  if (!report || typeof report !== "string" || !report.trim()) {
    throw new Error("Report text is required and must be a non-empty string");
  }

  const client = getClient(options.apiKey);
  const model = options.model || process.env.OPENAI_MODEL || "gpt-5.6-luna";

  const response = await client.responses.create({
    model,

    input: [
      {
        role: "system",
        content: EXTRACTION_SYSTEM_PROMPT
      },
      {
        role: "user",
        content: report.trim()
      }
    ],

    text: {
      format: {
        type: "json_schema",
        name: "field_report_extraction",
        strict: true,
        schema: {
          type: "object",
          properties: {
            activity: {
              type: ["string", "null"]
            },
            activity_code: {
              type: ["string", "null"]
            },
            location: {
              type: ["string", "null"]
            },
            progress: {
              type: ["number", "null"]
            },
            status: {
              type: ["string", "null"]
            },
            issues: {
              type: "array",
              items: {
                type: "string"
              }
            }
          },
          required: [
            "activity",
            "activity_code",
            "location",
            "progress",
            "status",
            "issues"
          ],
          additionalProperties: false
        }
      }
    }
  });

  if (!response || !response.output_text) {
    throw new Error("Invalid or empty response from OpenAI Responses API");
  }

  return JSON.parse(response.output_text);
}

module.exports = {
  extractFieldReport
};