import { NextResponse } from "next/server";
import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import ExtractedEvent from "@/models/ExtractedEvent";
import ScheduleActivity from "@/models/ScheduleActivity";
import AuditLog from "@/models/AuditLog";

const VALID_ACTIONS = ["ACCEPT", "OVERRIDE", "REJECT"];

/**
 * POST /api/events/[eventId]/review-action
 *
 * Allows a human reviewer to resolve an event flagged as "review_required".
 *
 * Body:
 *   action: "ACCEPT" | "OVERRIDE" | "REJECT"
 *   selectedActivityId: string (required for ACCEPT/OVERRIDE — MongoDB _id or domain activityId)
 *   reviewerNotes: string (optional)
 */
export async function POST(request, { params }) {
  try {
    const resolvedParams = await params;
    const { eventId } = resolvedParams;

    // 1. Validate event ID format
    if (!eventId || !mongoose.Types.ObjectId.isValid(eventId)) {
      return NextResponse.json(
        { success: false, message: "Invalid event ID format" },
        { status: 400 }
      );
    }

    // 2. Parse request body
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

    // 3. Validate action
    const action = (body.action || "").trim().toUpperCase();
    if (!VALID_ACTIONS.includes(action)) {
      return NextResponse.json(
        {
          success: false,
          message: `Invalid action '${body.action}'. Must be one of: ${VALID_ACTIONS.join(", ")}`
        },
        { status: 400 }
      );
    }

    // 4. Validate selectedActivityId for ACCEPT / OVERRIDE
    if ((action === "ACCEPT" || action === "OVERRIDE") && !body.selectedActivityId) {
      return NextResponse.json(
        {
          success: false,
          message: `'selectedActivityId' is required for action '${action}'`
        },
        { status: 400 }
      );
    }

    await connectDB();

    // 5. Find the ExtractedEvent
    const event = await ExtractedEvent.findById(eventId);
    if (!event) {
      return NextResponse.json(
        { success: false, message: "ExtractedEvent not found" },
        { status: 404 }
      );
    }

    // 6. Ensure the event is actually in review_required status
    if (event.matchingStatus !== "review_required") {
      return NextResponse.json(
        {
          success: false,
          message: `Event is not pending review. Current status: '${event.matchingStatus}'`
        },
        { status: 409 }
      );
    }

    // 7. Handle REJECT — no schedule update needed
    if (action === "REJECT") {
      event.matchingStatus = "rejected";
      await event.save();

      return NextResponse.json(
        {
          success: true,
          message: "Event rejected by reviewer",
          data: {
            event: {
              _id: event._id,
              matchingStatus: event.matchingStatus,
              rawDescription: event.rawDescription
            },
            decision: {
              action: "REJECT",
              reviewerNotes: body.reviewerNotes || null,
              autoUpdated: false,
              auditLogId: null
            },
            matchedActivity: null
          }
        },
        { status: 200 }
      );
    }

    // 8. For ACCEPT / OVERRIDE — resolve the ScheduleActivity
    const incomingActivityId = body.selectedActivityId;
    let scheduleDoc = null;

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

    // 9. Capture previous state before mutation
    const previousState = {
      actualStart: scheduleDoc.actualStart,
      actualEnd: scheduleDoc.actualEnd,
      progress: scheduleDoc.progress
    };

    // 10. Apply schedule update based on eventType
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
      scheduleDoc.progress = 100;
    } else if (normalizedType === "PROGRESS") {
      if (typeof event.progress === "number" && !isNaN(event.progress)) {
        scheduleDoc.progress = event.progress;
      }
    }

    await scheduleDoc.save();

    const newState = {
      actualStart: scheduleDoc.actualStart,
      actualEnd: scheduleDoc.actualEnd,
      progress: scheduleDoc.progress
    };

    // 11. Update ExtractedEvent
    event.matchingStatus = "manually_matched";
    event.matchedActivityId = scheduleDoc._id;
    await event.save();

    // 12. Create AuditLog with MANUAL_UPDATE action
    const auditLogDoc = await AuditLog.create({
      extractedEventId: event._id,
      scheduleActivityId: scheduleDoc._id,
      action: "MANUAL_UPDATE",
      previousState,
      newState,
      matchConfidence: event.matchConfidence || 0,
      details: `Reviewer ${action.toLowerCase()}ed activity '${scheduleDoc.activityId}' for event '${event.rawDescription?.substring(0, 80)}'. ${body.reviewerNotes ? `Notes: ${body.reviewerNotes}` : ""}`
    });

    return NextResponse.json(
      {
        success: true,
        message: `Event ${action.toLowerCase()}ed and schedule updated by reviewer`,
        data: {
          event: {
            _id: event._id,
            matchingStatus: event.matchingStatus,
            matchedActivityId: event.matchedActivityId,
            rawDescription: event.rawDescription,
            eventType: event.eventType
          },
          decision: {
            action,
            reviewerNotes: body.reviewerNotes || null,
            autoUpdated: true,
            auditLogId: auditLogDoc._id
          },
          matchedActivity: {
            _id: scheduleDoc._id,
            activityId: scheduleDoc.activityId,
            activityName: scheduleDoc.activityName,
            actualStart: scheduleDoc.actualStart,
            actualEnd: scheduleDoc.actualEnd,
            progress: scheduleDoc.progress
          }
        }
      },
      { status: 200 }
    );
  } catch (error) {
    const status =
      error.name === "ValidationError" || error.name === "CastError"
        ? 400
        : 500;
    return NextResponse.json(
      { success: false, message: error.message },
      { status }
    );
  }
}
