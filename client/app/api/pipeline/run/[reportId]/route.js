import { NextResponse } from "next/server";
import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import RawReport from "@/models/RawReport";
import ExtractedEvent from "@/models/ExtractedEvent";
import ScheduleActivity from "@/models/ScheduleActivity";
import AuditLog from "@/models/AuditLog";
import { extractFieldReportWithGemini } from "@/lib/geminiExtractor";
import { extractFieldReport as extractWithOpenAI } from "../../../../../../ai/extraction/extractor";
import {
    generateEmbedding,
    buildQueryText,
    calculateConfidence,
    cosineSimilarity,
} from "@/lib/embeddings";
import { evaluateMatchConfidence } from "@/lib/matchingConfig";

function normalizeExtractedEvent(extractedData, reportText, reportDate) {
    const source = Array.isArray(extractedData?.events)
        ? extractedData.events[0]
        : extractedData;

    if (!source || typeof source !== "object") {
        throw new Error("AI extraction returned no event data");
    }

    const activityDescription =
        source.activityDescription ||
        source.activity ||
        source.activity_code ||
        source.rawDescription ||
        reportText;
    const rawDescription = source.rawDescription || reportText;
    const status = String(source.status || "").toUpperCase();
    let eventType = source.eventType;

    if (!eventType) {
        if (status.includes("COMPLETE")) eventType = "COMPLETE";
        else if (status.includes("START")) eventType = "START";
        else eventType = "PROGRESS";
    }

    let progress = null;
    if (source.progress !== undefined && source.progress !== null) {
        progress = Number(source.progress);
        if (isNaN(progress)) {
            throw new Error("AI extraction returned an invalid progress value");
        }
    }

    let extractionConfidence = null;
    if (
        source.extractionConfidence !== undefined &&
        source.extractionConfidence !== null
    ) {
        extractionConfidence = Number(source.extractionConfidence);
    } else if (source.confidence !== undefined && source.confidence !== null) {
        extractionConfidence = Number(source.confidence);
    }

    if (extractionConfidence !== null && isNaN(extractionConfidence)) {
        throw new Error("AI extraction returned an invalid confidence value");
    }

    return {
        rawDescription: String(rawDescription).trim(),
        activityDescription: String(activityDescription).trim(),
        discipline: source.discipline ? String(source.discipline).trim() : null,
        location: source.location ? String(source.location).trim() : null,
        eventType: String(eventType).trim(),
        progress,
        eventDate: reportDate || null,
        extractionConfidence,
    };
}

export async function POST(request, { params }) {
    try {
        const resolvedParams = await params;
        const { reportId } = resolvedParams;

        if (!reportId || !mongoose.Types.ObjectId.isValid(reportId)) {
            return NextResponse.json(
                { success: false, message: "Invalid report ID format" },
                { status: 400 }
            );
        }

        let body = {};
        try {
            body = await request.json();
        } catch {
            body = {};
        }

        if (!body || typeof body !== "object" || Array.isArray(body)) {
            return NextResponse.json(
                { success: false, message: "Request body must be a JSON object" },
                { status: 400 }
            );
        }

        await connectDB();

        const report = await RawReport.findById(reportId);
        if (!report) {
            return NextResponse.json(
                { success: false, message: "RawReport not found" },
                { status: 404 }
            );
        }

        if (typeof report.reportText !== "string" || !report.reportText.trim()) {
            return NextResponse.json(
                {
                    success: false,
                    message: "RawReport does not contain usable reportText",
                },
                { status: 400 }
            );
        }

        const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY);
        const hasOpenAIKey = Boolean(process.env.OPENAI_API_KEY);
        let extractedData;

        if (body.provider === "openai" && hasOpenAIKey) {
            extractedData = await extractWithOpenAI(report.reportText, {
                model: body.model,
            });
        } else if (body.provider === "openai" && !hasOpenAIKey) {
            return NextResponse.json(
                { success: false, message: "OPENAI_API_KEY is not configured" },
                { status: 400 }
            );
        } else if (body.provider === "gemini" || hasGeminiKey || !hasOpenAIKey) {
            extractedData = await extractFieldReportWithGemini(report.reportText, {
                model: body.model,
            });
        } else {
            extractedData = await extractWithOpenAI(report.reportText, {
                model: body.model,
            });
        }

        const eventData = normalizeExtractedEvent(
            extractedData,
            report.reportText,
            report.reportDate
        );

        const event = await ExtractedEvent.create({
            ...eventData,
            sourceReportId: report._id,
            matchingStatus: "pending",
            matchedActivityId: null,
            matchConfidence: null,
            matchCandidates: [],
        });

        report.processingStatus = "extracted";
        await report.save();

        const activitiesWithEmbeddings = await ScheduleActivity.find({
            embedding: { $exists: true, $ne: null },
        }).select("+embedding");

        if (activitiesWithEmbeddings.length === 0) {
            return NextResponse.json(
                {
                    success: false,
                    message:
                        "No ScheduleActivities have embeddings generated. Please import or create activities with GEMINI_API_KEY configured.",
                    reportId: report._id,
                    event,
                },
                { status: 400 }
            );
        }

        const queryEmbedding = await generateEmbedding(buildQueryText(event));
        let candidates = [];
        let searchMethod = "atlas_vector_search";

        try {
            const rawResults = await ScheduleActivity.aggregate([
                {
                    $vectorSearch: {
                        index: "activity_embedding_index",
                        path: "embedding",
                        queryVector: queryEmbedding,
                        numCandidates: 50,
                        limit: 6,
                    },
                },
                {
                    $project: {
                        activityId: 1,
                        activityName: 1,
                        discipline: 1,
                        location: 1,
                        score: { $meta: "vectorSearchScore" },
                    },
                },
            ]);

            if (rawResults && rawResults.length > 0) {
                candidates = rawResults;
            } else {
                searchMethod = "in_memory_fallback";
            }
        } catch {
            searchMethod = "in_memory_fallback";
        }

        if (searchMethod === "in_memory_fallback") {
            candidates = activitiesWithEmbeddings
                .map((activity) => ({
                    _id: activity._id,
                    activityId: activity.activityId,
                    activityName: activity.activityName,
                    discipline: activity.discipline,
                    location: activity.location,
                    score: Math.max(
                        0,
                        parseFloat(
                            cosineSimilarity(queryEmbedding, activity.embedding).toFixed(4)
                        )
                    ),
                }))
                .sort((left, right) => right.score - left.score);
        }

        if (event.location && candidates.length > 0) {
            const locationMatches = candidates.filter(
                (candidate) =>
                    candidate.location &&
                    candidate.location.toLowerCase() === event.location.toLowerCase()
            );

            if (locationMatches.length > 0) {
                candidates = locationMatches;
            }
        }

        candidates = candidates.slice(0, 3);

        if (candidates.length === 0) {
            event.matchingStatus = "unmatched";
            event.matchConfidence = 0;
            await event.save();

            return NextResponse.json({
                success: true,
                reportId: report._id,
                event,
                matchingStatus: "unmatched",
                matchConfidence: 0,
                autoUpdated: false,
                matchedActivity: null,
                auditLog: null,
            });
        }

        const bestCandidate = candidates[0];
        const bestScore = bestCandidate.score || 0;
        const secondScore = candidates.length > 1 ? candidates[1].score || 0 : 0;
        const matchConfidence = calculateConfidence(bestScore, secondScore);
        const { matchingStatus, autoUpdate } =
            evaluateMatchConfidence(matchConfidence);

        let scheduleDoc = null;
        if (matchingStatus === "matched" || matchingStatus === "review_required") {
            scheduleDoc = await ScheduleActivity.findById(bestCandidate._id);
            if (!scheduleDoc) {
                scheduleDoc = await ScheduleActivity.findOne({
                    activityId: bestCandidate.activityId,
                });
            }
        }

        event.matchingStatus = matchingStatus;
        event.matchConfidence = matchConfidence;
        event.matchedActivityId = scheduleDoc ? scheduleDoc._id : null;
        event.matchCandidates = candidates.map((candidate) => ({
            activityId: candidate.activityId,
            activityName: candidate.activityName,
            score: candidate.score,
        }));
        await event.save();

        let auditLogDoc = null;
        if (autoUpdate && scheduleDoc) {
            const previousState = {
                actualStart: scheduleDoc.actualStart,
                actualEnd: scheduleDoc.actualEnd,
                progress: scheduleDoc.progress,
            };

            const normalizedType = (event.eventType || "").toUpperCase();

            if (normalizedType === "START") {
                if (!scheduleDoc.actualStart) {
                    scheduleDoc.actualStart = event.eventDate
                        ? new Date(event.eventDate)
                        : new Date();
                }
            } else if (
                normalizedType === "COMPLETE" ||
                normalizedType === "COMPLETION"
            ) {
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

            auditLogDoc = await AuditLog.create({
                extractedEventId: event._id,
                scheduleActivityId: scheduleDoc._id,
                action: "AUTO_UPDATE",
                previousState,
                newState: {
                    actualStart: scheduleDoc.actualStart,
                    actualEnd: scheduleDoc.actualEnd,
                    progress: scheduleDoc.progress,
                },
                matchConfidence,
                details: `Pipeline vector matching auto-updated activity '${scheduleDoc.activityId}' with confidence ${matchConfidence} (${searchMethod})`,
            });
        }

        return NextResponse.json({
            success: true,
            reportId: report._id,
            event,
            matchingStatus,
            matchConfidence,
            autoUpdated: autoUpdate,
            searchMethod,
            matchedActivity: scheduleDoc
                ? {
                        _id: scheduleDoc._id,
                        activityId: scheduleDoc.activityId,
                        activityName: scheduleDoc.activityName,
                        actualStart: scheduleDoc.actualStart,
                        actualEnd: scheduleDoc.actualEnd,
                        progress: scheduleDoc.progress,
                    }
                : null,
            auditLog: auditLogDoc,
        });
    } catch (error) {
        console.error("[pipeline/run] Error:", error);
        const isClientError =
            error.name === "ValidationError" ||
            error.name === "CastError" ||
            error.message?.includes("is not configured");
        const status = isClientError ? 400 : 500;

        return NextResponse.json(
            { success: false, message: error.message || "Pipeline failed" },
            { status }
        );
    }
}