import { NextResponse } from "next/server";
import { extractFieldReport } from "../../../../../ai/extraction/extractor";

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        success: false,
        message: "Invalid JSON in request body"
      },
      { status: 400 }
    );
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json(
      {
        success: false,
        message: "Request body must be a JSON object"
      },
      { status: 400 }
    );
  }

  const { report, model, apiKey } = body;

  if (!report || typeof report !== "string" || !report.trim()) {
    return NextResponse.json(
      {
        success: false,
        message: "Report text is required and must be a non-empty string"
      },
      { status: 400 }
    );
  }

  try {
    const extractedData = await extractFieldReport(report, { model, apiKey });

    return NextResponse.json({
      success: true,
      data: extractedData
    });
  } catch (error) {
    console.error("AI extraction error:", error);

    const isClientError =
      error.message && error.message.includes("Report text is required");

    return NextResponse.json(
      {
        success: false,
        message: error.message || "Failed to extract field report"
      },
      { status: isClientError ? 400 : 500 }
    );
  }
}
