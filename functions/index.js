/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const {onCall} = require("firebase-functions/v2/https");
const {setGlobalOptions} = require("firebase-functions");
const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();
const {onSchedule} = require("firebase-functions/v2/scheduler");

// For cost control, you can set the maximum number of containers that can be
// running at the same time. This helps mitigate the impact of unexpected
// traffic spikes by instead downgrading performance. This limit is a
// per-function limit. You can override the limit for each function using the
// `maxInstances` option in the function's options, e.g.
// `onRequest({ maxInstances: 5 }, (req, res) => { ... })`.
// NOTE: setGlobalOptions does not apply to functions using the v1 API. V1
// functions should each use functions.runWith({ maxInstances: 10 }) instead.
// In the v1 API, each function can only serve one request per container, so
// this will be the maximum concurrent request count.
setGlobalOptions({maxInstances: 10, region: "europe-west2"});

// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

exports.getKnowledgeAverage = onCall(async (request) => {
  if (!request.auth) {
    throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be authenticated.",
    );
  }

  const db = admin.firestore();

  const {thisMonth, thisYear} = request.data;

  if (!thisMonth || !thisYear) {
    throw new functions.https.HttpsError(
        "invalid-argument",
        "thisMonth and thisYear must be provided in the request data.",
    );
  }

  try {
    // Query assessments for the given month and year
    const assessmentsQuery = db
        .collection("assessments")
        .where("quarter.month", "==", thisMonth)
        .where("year", "==", thisYear);

    const assessmentsSnapshot = await assessmentsQuery.get();

    if (assessmentsSnapshot.empty) {
      console.log("No assessments found for the given month and year.");
      return {average: 0, count: 0};
    }

    // Extract knowledge_id references
    const knowledgeDocIds = [];
    assessmentsSnapshot.forEach((doc) => {
      const data = doc.data();
      console.log(`Processing assessment ID: ${data.knowledge_id.id}`);

      if (data.knowledge_id && typeof data.knowledge_id.id === "string") {
        knowledgeDocIds.push(data.knowledge_id.id);
      }
    });

    if (knowledgeDocIds.length === 0) {
      console.log("No knowledge_id references found in assessments.");
      return {average: 0, count: 0};
    }

    console.log(`Found ${knowledgeDocIds.length} knowledge document IDs.`);
    console.log("KnowledgeDocIds:", knowledgeDocIds);

    // Query the knowledge collection for these IDs
    const knowledgeDocs = await Promise.all(
        knowledgeDocIds.map((id) => db.collection("knowledge").doc(id).get()),
    );

    let total = 0;
    let count = 0;

    knowledgeDocs.forEach((doc) => {
      if (doc.exists) {
        const data = doc.data();
        const correctResponses = data.correct_responses ?? null;
        if (typeof correctResponses === "number") {
          total += correctResponses;
          count++;
        }
      }
    });

    const average = count > 0 ? total / count : 0;

    console.log(`Calculated average of ${average} from ${count} documents.`);
    return {average, count};
  } catch (error) {
    console.error("Error calculating knowledge average:", error);
    throw new functions.https.HttpsError(
        "internal",
        "Error calculating knowledge average.",
    );
  }
});

// ...existing code...

exports.publishScheduledArticlesDaily = onSchedule(
    {schedule: "0 0 * * *", region: "europe-west2"}, // adjust region if needed
    async (event) => {
      const db = admin.firestore();

      // Get today's date in UTC, ignoring time
      const now = new Date();
      const year = now.getUTCFullYear();
      const month = now.getUTCMonth();
      const day = now.getUTCDate();

      const startOfDay = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
      const endOfDay = new Date(Date.UTC(year, month, day + 1, 0, 0, 0, 0));

      const articlesRef = db.collection("articles");
      const snapshot = await articlesRef
          .where("status", "==", "Scheduled")
          .where("published_at", ">=", startOfDay)
          .where("published_at", "<", endOfDay)
          .get();

      const batch = db.batch();

      snapshot.forEach((doc) => {
        batch.update(doc.ref, {status: "Published"});
      });

      if (!snapshot.empty) {
        await batch.commit();
        console.log(`Published ${snapshot.size} scheduled articles.`);
      } else {
        console.log("No scheduled articles to publish today.");
      }

      return null;
    },
);

exports.getStrengthAverage = functions.https.onCall(async (request) => {
  if (!request.auth) {
    throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be authenticated.",
    );
  }

  const db = admin.firestore();

  const {thisMonth, thisYear} = request.data;

  if (!thisMonth || !thisYear) {
    throw new functions.https.HttpsError(
        "invalid-argument",
        "thisMonth and thisYear must be provided in the request data.",
    );
  }

  try {
    // Query assessments for the given month and year
    const assessmentsQuery = db
        .collection("assessments")
        .where("quarter.month", "==", thisMonth)
        .where("year", "==", thisYear);

    const assessmentsSnapshot = await assessmentsQuery.get();

    if (assessmentsSnapshot.empty) {
      console.log("No assessments found for the given month and year.");
      return {average: 0, count: 0};
    }

    // Extract strengthId references
    const strengthDocIds = [];
    assessmentsSnapshot.forEach((doc) => {
      const data = doc.data();
      console.log(`Processing assessment ID: ${data.strengthId.id}`);

      if (data.strengthId && typeof data.strengthId.id === "string") {
        strengthDocIds.push(data.strengthId.id);
      }
    });

    if (strengthDocIds.length === 0) {
      console.log("No strengthId references found in assessments.");
      return {average: 0, count: 0};
    }

    console.log(`Found ${strengthDocIds.length} strength document IDs.`);

    // Query the strength collection for these IDs
    const strengthDocs = await Promise.all(
        strengthDocIds.map((id) => db.collection("strength").doc(id).get()),
    );

    let total = 0;
    let count = 0;

    strengthDocs.forEach((doc) => {
      if (doc.exists) {
        const data = doc.data();
        const elapsedTime = data.elapsed_time ?? null;
        if (typeof elapsedTime === "number") {
          total += elapsedTime;
          count++;
        }
      }
    });

    const average = count > 0 ? total / count : 0;

    console.log(`Calculated average of ${average} from ${count} documents.`);
    return {average, count};
  } catch (error) {
    console.error("Error calculating strength average:", error);
    throw new functions.https.HttpsError(
        "internal",
        "Error calculating strength average.",
    );
  }
  // Write your code above!
});
