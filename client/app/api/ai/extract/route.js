import { NextResponse } from "next/server";
import { extractFieldReportWithGemini } from "@/lib/geminiExtractor";
import { extractFieldReport as extractWithOpenAI } from "../../../../../ai/extraction/extractor";

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

  const { report, provider, model, apiKey } = body;

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
    let extractedData;
    const hasGeminiKey = Boolean(apiKey || process.env.GEMINI_API_KEY);
    const hasOpenAIKey = Boolean(process.env.OPENAI_API_KEY);

    // Prefer Gemini if key is provided or requested
    if (provider === "gemini" || hasGeminiKey || !hasOpenAIKey) {
      extractedData = await extractFieldReportWithGemini(report, { model, apiKey });
    } else {
      extractedData = await extractWithOpenAI(report, { model, apiKey });
    }

    return NextResponse.json({
      success: true,
      data: extractedData
    });
  } catch (error) {
    console.error("AI extraction error:", error);

    const isClientError =
      error.message &&
      (error.message.includes("Report text is required") ||
        error.message.includes("is not configured"));

    return NextResponse.json(
      {
        success: false,
        message: error.message || "Failed to extract field report"
      },
      { status: isClientError ? 400 : 500 }
    );
  }
}
