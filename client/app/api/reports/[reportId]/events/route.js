import { NextResponse } from "next/server";
import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import RawReport from "@/models/RawReport";
import ExtractedEvent from "@/models/ExtractedEvent";

export async function POST(request, { params }) {
  try {
    const resolvedParams = await params;
    const { reportId } = resolvedParams;

    // Validate reportId format
    if (!reportId || !mongoose.Types.ObjectId.isValid(reportId)) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid report ID format"
        },
        { status: 400 }
      );
    }

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

    if (!body || !Array.isArray(body.events) || body.events.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: "'events' must be a non-empty array"
        },
        { status: 400 }
      );
    }

    await connectDB();

    // Verify RawReport exists
    const report = await RawReport.findById(reportId);
    if (!report) {
      return NextResponse.json(
        {
          success: false,
          message: "RawReport not found"
        },
        { status: 404 }
      );
    }

    // Validate and format event objects
    const formattedEvents = [];
    for (let i = 0; i < body.events.length; i++) {
      const item = body.events[i];
      const index = i + 1;

      if (!item || typeof item !== "object") {
        return NextResponse.json(
          {
            success: false,
            message: `Event #${index} must be an object`
          },
          { status: 400 }
        );
      }

      if (!item.rawDescription || typeof item.rawDescription !== "string" || !item.rawDescription.trim()) {
        return NextResponse.json(
          {
            success: false,
            message: `Event #${index} is missing required field 'rawDescription'`
          },
          { status: 400 }
        );
      }

      if (!item.activityDescription || typeof item.activityDescription !== "string" || !item.activityDescription.trim()) {
        return NextResponse.json(
          {
            success: false,
            message: `Event #${index} is missing required field 'activityDescription'`
          },
          { status: 400 }
        );
      }

      if (!item.eventType || typeof item.eventType !== "string" || !item.eventType.trim()) {
        return NextResponse.json(
          {
            success: false,
            message: `Event #${index} is missing required field 'eventType'`
          },
          { status: 400 }
        );
      }

      // Validate progress if provided
      let progress = null;
      if (item.progress !== undefined && item.progress !== null) {
        const num = Number(item.progress);
        if (isNaN(num)) {
          return NextResponse.json(
            {
              success: false,
              message: `Event #${index} has invalid 'progress' (must be a number)`
            },
            { status: 400 }
          );
        }
        progress = num;
      }

      // Validate eventDate if provided
      let eventDate = null;
      if (item.eventDate) {
        const parsed = new Date(item.eventDate);
        if (isNaN(parsed.getTime())) {
          return NextResponse.json(
            {
              success: false,
              message: `Event #${index} has invalid 'eventDate' format`
            },
            { status: 400 }
          );
        }
        eventDate = parsed;
      }

      // Map AI confidence to extractionConfidence
      const rawConfidence =
        item.extractionConfidence !== undefined ? item.extractionConfidence : item.confidence;
      let extractionConfidence = null;
      if (rawConfidence !== undefined && rawConfidence !== null) {
        const num = Number(rawConfidence);
        if (isNaN(num)) {
          return NextResponse.json(
            {
              success: false,
              message: `Event #${index} has invalid 'confidence' (must be a number)`
            },
            { status: 400 }
          );
        }
        extractionConfidence = num;
      }

      formattedEvents.push({
        sourceReportId: report._id,
        rawDescription: item.rawDescription.trim(),
        activityDescription: item.activityDescription.trim(),
        discipline: item.discipline && String(item.discipline).trim() ? String(item.discipline).trim() : null,
        location: item.location && String(item.location).trim() ? String(item.location).trim() : null,
        eventType: item.eventType.trim(),
        progress,
        eventDate,
        extractionConfidence,
        matchingStatus: "pending",
        matchedActivityId: null,
        matchConfidence: null
      });
    }

    // Create ExtractedEvent documents
    const createdEvents = await ExtractedEvent.insertMany(formattedEvents);

    // Update RawReport status to extracted
    report.processingStatus = "extracted";
    await report.save();

    return NextResponse.json(
      {
        success: true,
        message: "Events created successfully",
        reportId: report._id,
        processingStatus: report.processingStatus,
        eventsCount: createdEvents.length,
        events: createdEvents
      },
      { status: 201 }
    );
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

export async function GET(request, { params }) {
  try {
    const resolvedParams = await params;
    const { reportId } = resolvedParams;

    if (!reportId || !mongoose.Types.ObjectId.isValid(reportId)) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid report ID format"
        },
        { status: 400 }
      );
    }

    await connectDB();

    const report = await RawReport.findById(reportId);
    if (!report) {
      return NextResponse.json(
        {
          success: false,
          message: "RawReport not found"
        },
        { status: 404 }
      );
    }

    const events = await ExtractedEvent.find({ sourceReportId: reportId }).sort({ createdAt: 1 });
    return NextResponse.json(events);
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
