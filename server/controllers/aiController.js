const { extractFieldReport } = require("../../ai/extraction/extractor");

const extractReport = async (req, res) => {
  try {
    const { report } = req.body;

    if (!report || typeof report !== "string") {
      return res.status(400).json({
        success: false,
        message: "Report text is required"
      });
    }

    const extractedData = await extractFieldReport(report);

    res.json({
      success: true,
      data: extractedData
    });
  } catch (error) {
    console.error("AI extraction error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to extract field report"
    });
  }
};

module.exports = {
  extractReport
};