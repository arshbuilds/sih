import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import ScheduleActivity from "@/models/ScheduleActivity";

export async function GET() {
  try {
    await connectDB();
    const activities = await ScheduleActivity.find().sort({ createdAt: -1 });
    return NextResponse.json(activities);
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
  try {
    await connectDB();
    const body = await request.json();
    const activity = await ScheduleActivity.create(body);
    return NextResponse.json(activity, { status: 201 });
  } catch (error) {
    const status =
      error.name === "ValidationError" || error.code === 11000 ? 400 : 500;
    return NextResponse.json(
      {
        success: false,
        message: error.message
      },
      { status }
    );
  }
}
