import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import ScheduleActivity from "@/models/ScheduleActivity";
import { parseScheduleFile } from "@/services/scheduleParser";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB limit

export async function POST(request) {
  let formData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      {
        success: false,
        message: "Invalid multipart/form-data request"
      },
      { status: 400 }
    );
  }

  const file = formData.get("schedule");

  if (!file || typeof file === "string" || !file.name) {
    return NextResponse.json(
      {
        success: false,
        message: "No schedule file uploaded under the field name 'schedule'"
      },
      { status: 400 }
    );
  }

  if (file.size === 0) {
    return NextResponse.json(
      {
        success: false,
        message: "The uploaded file is empty (0 bytes)"
      },
      { status: 400 }
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      {
        success: false,
        message: `File size exceeds the 10MB limit (uploaded: ${(file.size / (1024 * 1024)).toFixed(2)}MB)`
      },
      { status: 400 }
    );
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let parseResult;
    try {
      parseResult = parseScheduleFile(buffer, file.name);
    } catch (parseError) {
      return NextResponse.json(
        {
          success: false,
          message: parseError.message
        },
        { status: 400 }
      );
    }

    const { validRows, failedRows, totalRows } = parseResult;

    if (totalRows === 0) {
      return NextResponse.json(
        {
          success: false,
          message: "The uploaded file contains no data rows"
        },
        { status: 400 }
      );
    }

    await connectDB();

    // Query existing activity IDs in MongoDB
    const incomingIds = validRows.map((item) => item.activityId);
    const existingInDb = await ScheduleActivity.find({
      activityId: { $in: incomingIds }
    }).select("activityId");

    const existingIdSet = new Set(existingInDb.map((doc) => doc.activityId));
    const seenInFile = new Set();
    const toInsert = [];
    const skippedRows = [];

    for (const activity of validRows) {
      if (existingIdSet.has(activity.activityId)) {
        skippedRows.push({
          activityId: activity.activityId,
          activityName: activity.activityName,
          reason: "activityId already exists in database"
        });
      } else if (seenInFile.has(activity.activityId)) {
        skippedRows.push({
          activityId: activity.activityId,
          activityName: activity.activityName,
          reason: "Duplicate activityId within the uploaded file"
        });
      } else {
        seenInFile.add(activity.activityId);
        toInsert.push(activity);
      }
    }

    let inserted = [];
    if (toInsert.length > 0) {
      inserted = await ScheduleActivity.insertMany(toInsert);
    }

    return NextResponse.json(
      {
        success: true,
        message: "Schedule import completed",
        stats: {
          total: totalRows,
          imported: inserted.length,
          skipped: skippedRows.length,
          failed: failedRows.length
        },
        imported: inserted.length,
        skipped: skippedRows.length,
        failed: failedRows.length,
        skippedDetails: skippedRows,
        failedDetails: failedRows,
        activities: inserted
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
