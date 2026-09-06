import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import ScheduleActivity from "@/models/ScheduleActivity";

const MILLISECONDS_PER_DAY = 1000 * 60 * 60 * 24;

function calculateSlippage(actualDate, plannedDate) {
	if (!actualDate || !plannedDate) {
		return null;
	}

	return (actualDate.getTime() - plannedDate.getTime()) / MILLISECONDS_PER_DAY;
}

function calculateStatus(startSlippageDays, endSlippageDays) {
	const slippages = [startSlippageDays, endSlippageDays].filter(
		(value) => value !== null
	);

	if (slippages.some((value) => value > 0)) {
		return "DELAYED";
	}

	if (slippages.some((value) => value < 0)) {
		return "AHEAD";
	}

	return "ON_TRACK";
}

export async function GET() {
	try {
		await connectDB();

		const activities = await ScheduleActivity.find().sort({ createdAt: -1 });

		const varianceResults = activities.map((activity) => {
			const startSlippageDays = calculateSlippage(
				activity.actualStart,
				activity.plannedStart
			);
			const endSlippageDays = calculateSlippage(
				activity.actualEnd,
				activity.plannedEnd
			);

			return {
				_id: activity._id,
				activityId: activity.activityId,
				activityName: activity.activityName,
				discipline: activity.discipline,
				location: activity.location,
				plannedStart: activity.plannedStart,
				plannedEnd: activity.plannedEnd,
				actualStart: activity.actualStart,
				actualEnd: activity.actualEnd,
				startSlippageDays,
				endSlippageDays,
				status: calculateStatus(startSlippageDays, endSlippageDays),
			};
		});

		return NextResponse.json(varianceResults);
	} catch (error) {
		return NextResponse.json(
			{
				success: false,
				message: error.message,
			},
			{ status: 500 }
		);
	}
}
