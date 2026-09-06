import { NextResponse } from "next/server";
import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import ExtractedEvent from "@/models/ExtractedEvent";
import ScheduleActivity from "@/models/ScheduleActivity";
import AuditLog from "@/models/AuditLog";
import { evaluateMatchConfidence } from "@/lib/matchingConfig";

export async function POST(request, { params }) {
  try {
    const resolvedParams = await params;
    const { eventId } = resolvedParams;

    // 1. Validate ExtractedEvent ID
    if (!eventId || !mongoose.Types.ObjectId.isValid(eventId)) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid event ID format"
        },
        { status: 400 }
      );
    }

    // 2. Parse request body safely
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

    // 3. Validate bestMatch
    if (!body.bestMatch || typeof body.bestMatch !== "object") {
      return NextResponse.json(
        {
          success: false,
          message: "Missing required 'bestMatch' object in request body"
        },
        { status: 400 }
      );
    }

    const score = Number(body.bestMatch.score);
    if (isNaN(score) || score < 0 || score > 1) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid confidence score in bestMatch (must be a number between 0.0 and 1.0)"
        },
        { status: 400 }
      );
    }

    await connectDB();

    // 4. Find the ExtractedEvent
    const event = await ExtractedEvent.findById(eventId);
    if (!event) {
      return NextResponse.json(
        {
          success: false,
          message: "ExtractedEvent not found"
        },
        { status: 404 }
      );
    }

    // 5. Find and validate matched ScheduleActivity if provided
    let scheduleDoc = null;
    const incomingActivityId = body.bestMatch.activityId;

    if (incomingActivityId) {
      if (mongoose.Types.ObjectId.isValid(incomingActivityId)) {
        scheduleDoc = await ScheduleActivity.findById(incomingActivityId);
      }

      if (!scheduleDoc) {
        scheduleDoc = await ScheduleActivity.findOne({
          activityId: String(incomingActivityId).trim()
        });
      }

      if (!scheduleDoc) {
        return NextResponse.json(
          {
            success: false,
            message: `ScheduleActivity '${incomingActivityId}' not found`
          },
          { status: 404 }
        );
      }
    }

    // 6. Apply confidence threshold decision
    const { matchingStatus, autoUpdate } = evaluateMatchConfidence(score);

    if (autoUpdate && !scheduleDoc) {
      return NextResponse.json(
        {
          success: false,
          message: "High confidence match requires a valid matched ScheduleActivity"
        },
        { status: 400 }
      );
    }

    // 7. Update ExtractedEvent
    event.matchingStatus = matchingStatus;
    event.matchConfidence = score;

    if (scheduleDoc) {
      event.matchedActivityId = scheduleDoc._id;
    }

    if (Array.isArray(body.candidates)) {
      event.matchCandidates = body.candidates;
    }

    await event.save();

    // 8. If confidence is high: update ScheduleActivity and create AuditLog
    let auditLogDoc = null;

    if (autoUpdate && scheduleDoc) {
      const previousState = {
        actualStart: scheduleDoc.actualStart,
        actualEnd: scheduleDoc.actualEnd,
        progress: scheduleDoc.progress
      };

      const normalizedType = (event.eventType || "").toUpperCase();

      if (normalizedType === "START") {
        if (!scheduleDoc.actualStart) {
          scheduleDoc.actualStart = event.eventDate
            ? new Date(event.eventDate)
            : new Date();
        }
      } else if (normalizedType === "COMPLETE") {
        scheduleDoc.actualEnd = event.eventDate
          ? new Date(event.eventDate)
          : new Date();

        if (scheduleDoc.schema.paths.progress !== undefined) {
          scheduleDoc.progress = 100;
        }
      } else if (normalizedType === "PROGRESS") {
        if (typeof event.progress === "number" && !isNaN(event.progress)) {
          if (scheduleDoc.schema.paths.progress !== undefined) {
            scheduleDoc.progress = event.progress;
          }
        }
      }

      await scheduleDoc.save();

      const newState = {
        actualStart: scheduleDoc.actualStart,
        actualEnd: scheduleDoc.actualEnd,
        progress: scheduleDoc.progress
      };

      auditLogDoc = await AuditLog.create({
        extractedEventId: event._id,
        scheduleActivityId: scheduleDoc._id,
        action: "AUTO_UPDATE",
        previousState,
        newState,
        matchConfidence: score,
        details: `Automatically updated ScheduleActivity from eventType '${event.eventType}' with confidence ${score}`
      });
    }

    return NextResponse.json(
      {
        success: true,
        message: "Match result processed successfully",
        eventId: event._id,
        matchingStatus,
        matchConfidence: score,
        autoUpdated: autoUpdate,
        event,
        matchedActivity: scheduleDoc
          ? {
              _id: scheduleDoc._id,
              activityId: scheduleDoc.activityId,
              activityName: scheduleDoc.activityName,
              actualStart: scheduleDoc.actualStart,
              actualEnd: scheduleDoc.actualEnd,
              progress: scheduleDoc.progress
            }
          : null,
        auditLog: auditLogDoc
      },
      { status: 200 }
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
