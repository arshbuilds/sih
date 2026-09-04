import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import RawReport from "@/models/RawReport";

export async function GET() {
  try {
    await connectDB();
    const reports = await RawReport.find().sort({ createdAt: -1 });
    return NextResponse.json(reports);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error.message
      },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "Invalid JSON in request body" },
      { status: 400 }
    );
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { success: false, message: "Request body must be a JSON object" },
      { status: 400 }
    );
  }

  if (!body.reportText || typeof body.reportText !== "string" || !body.reportText.trim()) {
    return NextResponse.json(
      {
        success: false,
        message: "reportText is required and must be a non-empty string"
      },
      { status: 400 }
    );
  }

  if (!body.source || typeof body.source !== "string" || !body.source.trim()) {
    return NextResponse.json(
      {
        success: false,
        message: "source is required and must be a non-empty string"
      },
      { status: 400 }
    );
  }

  let reportDate = null;
  if (body.reportDate) {
    const parsed = new Date(body.reportDate);
    if (isNaN(parsed.getTime())) {
      return NextResponse.json(
        { success: false, message: "Invalid reportDate format" },
        { status: 400 }
      );
    }
    reportDate = parsed;
  }

  try {
    await connectDB();

    const reportData = {
      reportText: body.reportText.trim(),
      source: body.source.trim(),
      reportDate,
      discipline: body.discipline && String(body.discipline).trim() ? String(body.discipline).trim() : null,
      metadata: {
        fileName: body.metadata?.fileName ? String(body.metadata.fileName).trim() : null,
        originalFormat: body.metadata?.originalFormat ? String(body.metadata.originalFormat).trim() : null
      },
      processingStatus: "pending"
    };

    const report = await RawReport.create(reportData);
    return NextResponse.json(report, { status: 201 });
  } catch (error) {
    const status =
      error.name === "ValidationError" || error.name === "CastError"
        ? 400
        : 500;
    return NextResponse.json(
      {
        success: false,
        message: error.message
      },
      { status }
    );
  }
}
