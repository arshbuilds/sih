const OpenAI = require("openai");
const { EXTRACTION_SYSTEM_PROMPT } = require("./prompt");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function extractFieldReport(report) {
  const response = await client.responses.create({
    model: "gpt-5.6-luna",

    input: [
      {
        role: "system",
        content: EXTRACTION_SYSTEM_PROMPT
      },
      {
        role: "user",
        content: report
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

  return JSON.parse(response.output_text);
}

module.exports = {
  extractFieldReport
};