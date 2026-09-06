const fs = require("fs");
const path = require("path");
const { extractFieldReport } = require("./extractor");

// Attempt to load environment variables from client/.env.local or root .env
function loadEnv() {
  const candidatePaths = [
    path.join(__dirname, "..", "..", "client", ".env.local"),
    path.join(__dirname, "..", "..", ".env.local"),
    path.join(__dirname, "..", "..", ".env"),
  ];

  for (const envPath of candidatePaths) {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          const val = trimmed.slice(eqIdx + 1).trim();
          if (!process.env[key] && val) {
            process.env[key] = val;
          }
        }
      }
    }
  }
}

loadEnv();

async function test() {
  const report =
    "Excavation at Site A is 60% complete. There is a minor delay because of equipment availability.";

  console.log("--------------------------------------------------");
  console.log("TESTING AI FIELD REPORT EXTRACTION");
  console.log("--------------------------------------------------");
  console.log("Input report:\n", report);

  if (!process.env.OPENAI_API_KEY) {
    console.warn("\n⚠️  NOTICE: OPENAI_API_KEY is not set in environment or client/.env.local.");
    console.warn("To run a live test with OpenAI, add your key to client/.env.local:");
    console.warn("  OPENAI_API_KEY=sk-...\n");
    console.log("Extractor module was successfully imported and initialized without errors.");
    return;
  }

  try {
    console.log(`\nCalling OpenAI model: ${process.env.OPENAI_MODEL || "gpt-5.6-luna"}...`);
    const result = await extractFieldReport(report);

    console.log("\nAI EXTRACTION RESULT:\n");
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("\nAI EXTRACTION FAILED:\n");
    console.error(error.message);
  }
}

test();