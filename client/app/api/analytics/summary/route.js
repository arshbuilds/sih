import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import ScheduleActivity from "@/models/ScheduleActivity";
import ExtractedEvent from "@/models/ExtractedEvent";
import AuditLog from "@/models/AuditLog";

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

function roundToTwo(value) {
	return Math.round(value * 100) / 100;
}

export async function GET() {
	try {
		await connectDB();

		const [activities, processedEvents, automaticAuditLogs] = await Promise.all([
			ScheduleActivity.find().select(
				"activityId activityName discipline location plannedStart plannedEnd actualStart actualEnd progress"
			),
			ExtractedEvent.find({
				matchingStatus: { $ne: "pending" },
			}).select("_id matchingStatus"),
			AuditLog.find({ action: "AUTO_UPDATE" }).select("extractedEventId"),
		]);

		const progressValues = activities
			.map((activity) => activity.progress)
			.filter((progress) => typeof progress === "number" && !isNaN(progress));

		const overallCompletion =
			progressValues.length > 0
				? roundToTwo(
						progressValues.reduce((total, progress) => total + progress, 0) /
							progressValues.length
					)
				: 0;

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
				startSlippageDays,
				endSlippageDays,
				status: calculateStatus(startSlippageDays, endSlippageDays),
			};
		});

		const delayedActivities = varianceResults.filter(
			(variance) => variance.status === "DELAYED"
		);
		const slippageValues = varianceResults.flatMap((variance) =>
			[variance.startSlippageDays, variance.endSlippageDays].filter(
				(value) => value !== null
			)
		);

		const averageSlippageDays =
			slippageValues.length > 0
				? roundToTwo(
						slippageValues.reduce((total, slippage) => total + slippage, 0) /
							slippageValues.length
					)
				: 0;

		const automaticEventIds = new Set(
			automaticAuditLogs.map((auditLog) => String(auditLog.extractedEventId))
		);
		const automationRate =
			processedEvents.length > 0
				? roundToTwo((automaticEventIds.size / processedEvents.length) * 100)
				: 0;

		return NextResponse.json({
			success: true,
			overallCompletion,
			totalDelayedActivities: delayedActivities.length,
			averageSlippageDays,
			automationRate,
			supportingCounts: {
				totalActivities: activities.length,
				activitiesWithProgress: progressValues.length,
				processedEvents: processedEvents.length,
				automaticallyUpdatedEvents: automaticEventIds.size,
				varianceValues: slippageValues.length,
			},
		});
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
