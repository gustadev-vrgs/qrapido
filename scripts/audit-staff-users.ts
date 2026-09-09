import { applicationDefault, cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const apply = process.argv.includes("--apply");
const validRoles = new Set(["admin", "manager", "attendant", "kitchen"]);

function initialize() {
  if (getApps().length) return getApp();
  const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;
  return initializeApp({ credential: FIREBASE_PROJECT_ID && FIREBASE_CLIENT_EMAIL && FIREBASE_PRIVATE_KEY
    ? cert({ projectId: FIREBASE_PROJECT_ID, clientEmail: FIREBASE_CLIENT_EMAIL, privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n") })
    : applicationDefault() });
}

async function main() {
  initialize();
  const snapshot = await getFirestore().collection("staffUsers").get();
  const report: Array<{ documentId: string; issues: string[]; action: string }> = [];
  for (const document of snapshot.docs) {
    const data = document.data();
    const issues: string[] = [];
    if (typeof data.uid !== "string" || !data.uid) issues.push("missing_uid");
    else if (document.id !== data.uid) issues.push("document_id_differs_from_uid");
    if (typeof data.restaurantId !== "string" || !data.restaurantId) issues.push("invalid_restaurant_id");
    if (!validRoles.has(data.role)) issues.push("invalid_role");
    if (typeof data.isActive !== "boolean") issues.push("invalid_active_flag");
    if (!issues.length) continue;

    // Applying only copies structurally valid legacy records to their canonical UID.
    // It never deletes the source and never guesses missing authorization fields.
    let action = "manual_review";
    if (apply && issues.length === 1 && issues[0] === "document_id_differs_from_uid") {
      await getFirestore().collection("staffUsers").doc(data.uid).create(data);
      action = "copied_to_uid_document_source_preserved";
    } else if (!apply && issues.length === 1 && issues[0] === "document_id_differs_from_uid") action = "would_copy_to_uid_document";
    report.push({ documentId: document.id, issues, action });
  }
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", scanned: snapshot.size, incompatible: report.length, report }, null, 2));
}

main().catch((error: unknown) => {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "unknown";
  console.error(JSON.stringify({ event: "staff_audit_failed", code }));
  process.exitCode = 1;
});
