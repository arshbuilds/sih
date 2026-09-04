
const { extractFieldReport } = require("./extractor");

async function test() {
  const report =
    "Excavation at Site A is 60% complete. There is a minor delay because of equipment availability.";

  try {
    const result = await extractFieldReport(report);

    console.log("\nAI EXTRACTION RESULT:\n");
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("\nAI EXTRACTION FAILED:\n");
    console.error(error.message);
  }
}

test();