import { NextResponse } from "next/server";
import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import ExtractedEvent from "@/models/ExtractedEvent";
import ScheduleActivity from "@/models/ScheduleActivity";
import AuditLog from "@/models/AuditLog";
import {
  generateEmbedding,
  buildQueryText,
  calculateConfidence,
  cosineSimilarity,
} from "@/lib/embeddings";
import { evaluateMatchConfidence } from "@/lib/matchingConfig";

/**
 * POST /api/matching/run
 *
 * Runs vector search matching between ExtractedEvents and ScheduleActivities.
 * Uses Atlas Vector Search ($vectorSearch) if the index exists, with an automatic
 * in-memory cosine similarity fallback.
 *
 * Body (all optional):
 *   eventId: string - match a specific event (otherwise matches all "pending")
 *   discipline: string - filter events by discipline
 *   topK: number - number of top candidates to retrieve (default: 3)
 */
export async function POST(request) {
  try {
    let body = {};
    try {
      body = await request.json();
    } catch {
      // Empty body is allowed, defaults to all pending events
      body = {};
    }

    const { eventId, discipline, topK = 3 } = body;

    await connectDB();

    // 1. Fetch events to match
    const eventQuery = {};
    if (eventId) {
      if (!mongoose.Types.ObjectId.isValid(eventId)) {
        return NextResponse.json(
          { success: false, message: "Invalid eventId format" },
          { status: 400 }
        );
      }
      eventQuery._id = eventId;
    } else {
      eventQuery.matchingStatus = "pending";
    }

    if (discipline) {
      eventQuery.discipline = discipline;
    }

    const events = await ExtractedEvent.find(eventQuery);

    if (events.length === 0) {
      return NextResponse.json(
        {
          success: true,
          message: "No pending events to match",
          stats: { total: 0, matched: 0, reviewRequired: 0, unmatched: 0 },
          results: [],
        },
        { status: 200 }
      );
    }

    // 2. Fetch all ScheduleActivities with embeddings for matching/fallback
    const activitiesWithEmbeddings = await ScheduleActivity.find({
      embedding: { $exists: true, $ne: null },
    }).select("+embedding");

    if (activitiesWithEmbeddings.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message:
            "No ScheduleActivities have embeddings generated. Please import or create activities with GEMINI_API_KEY configured.",
        },
        { status: 400 }
      );
    }

    const results = [];
    let matchedCount = 0;
    let reviewCount = 0;
    let unmatchedCount = 0;

    // 3. Process each event
    for (const event of events) {
      const queryText = buildQueryText(event);
      let queryEmbedding;

      try {
        queryEmbedding = await generateEmbedding(queryText);
      } catch (err) {
        console.error(`[matching] Embedding failed for event ${event._id}:`, err.message);
        results.push({
          eventId: event._id,
          status: "failed",
          error: `Embedding generation failed: ${err.message}`,
        });
        continue;
      }

      // 4. Find candidates: try Atlas $vectorSearch first, fall back to in-memory cosine
      let candidates = [];
      let usedMethod = "atlas_vector_search";

      try {
        const pipeline = [
          {
            $vectorSearch: {
              index: "activity_embedding_index",
              path: "embedding",
              queryVector: queryEmbedding,
              numCandidates: 50,
              limit: topK * 2, // Fetch slightly more to allow location preference
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
        ];

        const rawResults = await ScheduleActivity.aggregate(pipeline);
        if (rawResults && rawResults.length > 0) {
          candidates = rawResults;
        } else {
          usedMethod = "in_memory_fallback";
        }
      } catch (atlasErr) {
        // Fallback: Atlas search index might not be created yet on free tier cluster
        usedMethod = "in_memory_fallback";
      }

      if (usedMethod === "in_memory_fallback") {
        // In-memory cosine similarity calculation
        candidates = activitiesWithEmbeddings
          .map((act) => {
            const similarity = cosineSimilarity(queryEmbedding, act.embedding);
            return {
              _id: act._id,
              activityId: act.activityId,
              activityName: act.activityName,
              discipline: act.discipline,
              location: act.location,
              score: Math.max(0, parseFloat(similarity.toFixed(4))),
            };
          })
          .sort((a, b) => b.score - a.score);
      }

      // Apply location preference if event specifies a location (from Python reference)
      if (event.location && candidates.length > 0) {
        const locationMatches = candidates.filter(
          (c) => c.location && c.location.toLowerCase() === event.location.toLowerCase()
        );
        if (locationMatches.length > 0) {
          // If we have location matches, prioritize them
          candidates = locationMatches;
        }
      }

      // Keep top-K candidates
      candidates = candidates.slice(0, topK);

      if (candidates.length === 0) {
        event.matchingStatus = "unmatched";
        await event.save();
        unmatchedCount++;
        results.push({
          eventId: event._id,
          matchingStatus: "unmatched",
          matchConfidence: 0,
          bestMatch: null,
          candidates: [],
        });
        continue;
      }

      // 5. Calculate confidence score using Python formula: (best * 0.7 + margin * 0.3)
      const bestScore = candidates[0].score || 0;
      const secondScore = candidates.length > 1 ? candidates[1].score || 0 : 0;
      const confidence = calculateConfidence(bestScore, secondScore);

      const bestCandidate = candidates[0];

      // 6. Evaluate decision thresholds
      const { matchingStatus, autoUpdate } = evaluateMatchConfidence(confidence);

      // Find the matched ScheduleActivity document for updating
      let scheduleDoc = null;
      if (matchingStatus === "matched" || matchingStatus === "review_required") {
        scheduleDoc = await ScheduleActivity.findById(bestCandidate._id);
        if (!scheduleDoc) {
          scheduleDoc = await ScheduleActivity.findOne({
            activityId: bestCandidate.activityId,
          });
        }
      }

      // 7. Update ExtractedEvent
      event.matchingStatus = matchingStatus;
      event.matchConfidence = confidence;
      if (scheduleDoc) {
        event.matchedActivityId = scheduleDoc._id;
      }
      event.matchCandidates = candidates.map((c) => ({
        activityId: c.activityId,
        activityName: c.activityName,
        score: c.score,
      }));
      await event.save();

      // 8. Auto-update ScheduleActivity and create AuditLog if high confidence
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
        } else if (normalizedType === "COMPLETE" || normalizedType === "COMPLETION") {
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
          progress: scheduleDoc.progress,
        };

        auditLogDoc = await AuditLog.create({
          extractedEventId: event._id,
          scheduleActivityId: scheduleDoc._id,
          action: "AUTO_UPDATE",
          previousState,
          newState,
          matchConfidence: confidence,
          details: `Vector matching auto-updated activity '${scheduleDoc.activityId}' with confidence ${confidence} (${usedMethod})`,
        });
      }

      if (matchingStatus === "matched") matchedCount++;
      else if (matchingStatus === "review_required") reviewCount++;
      else unmatchedCount++;

      results.push({
        eventId: event._id,
        rawDescription: event.rawDescription,
        matchingStatus,
        matchConfidence: confidence,
        searchMethod: usedMethod,
        autoUpdated: autoUpdate,
        bestMatch: {
          activityId: bestCandidate.activityId,
          activityName: bestCandidate.activityName,
          similarityScore: bestScore,
        },
        candidates: event.matchCandidates,
        auditLogId: auditLogDoc ? auditLogDoc._id : null,
      });
    }

    return NextResponse.json(
      {
        success: true,
        message: "Matching run completed",
        stats: {
          total: events.length,
          matched: matchedCount,
          reviewRequired: reviewCount,
          unmatched: unmatchedCount,
        },
        results,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[matching/run] Error:", error);
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}
