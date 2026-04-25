import {
  isAdminEmail,
  readCircles,
  readFeedback,
  readUsers,
  resolveStore,
} from "../../lib/sharepass-server-store";

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function hasAdminAccess(email) {
  return isAdminEmail(email);
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const viewerEmail = cleanString(req.query.viewerEmail).toLowerCase();
  if (!hasAdminAccess(viewerEmail)) {
    return res.status(403).json({ error: "Only admins can view dashboard data." });
  }

  try {
    const { db, storage, warning } = await resolveStore();
    const [circles, users, feedback] = await Promise.all([
      readCircles(db),
      readUsers(db),
      readFeedback(db),
    ]);

    return res.status(200).json({
      circles,
      users,
      feedback,
      stats: {
        totalCircles: circles.length,
        liveCircles: circles.filter(circle => circle.voiceSession?.active || circle.speakers.length > 0).length,
        totalUsers: users.length,
        openFeedback: feedback.filter(item => item.status !== "resolved").length,
      },
      storage,
      warning,
    });
  } catch (error) {
    console.error("Admin dashboard failed", error);
    return res.status(500).json({ error: "Admin data could not be loaded right now." });
  }
}
