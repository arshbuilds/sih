import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import ExtractedEvent from "@/models/ExtractedEvent";
// Ensure models are registered for Mongoose populate
import "@/models/ScheduleActivity";
import "@/models/RawReport";

export async function GET() {
  try {
    await connectDB();

    const reviewEvents = await ExtractedEvent.find({
      matchingStatus: "review_required"
    })
      .populate(
        "matchedActivityId",
        "activityId activityName discipline location plannedStart plannedEnd actualStart actualEnd progress"
      )
      .populate(
        "sourceReportId",
        "reportText source reportDate discipline metadata"
      )
      .sort({ createdAt: -1 });

    return NextResponse.json(reviewEvents, { status: 200 });
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
