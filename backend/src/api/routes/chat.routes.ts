import { Router } from "express";
import { ragChat } from "../../services/rag.service.js";

const router = Router();

router.post("/:id/chat", async (req, res) => {
  try {
    const repoId = req.params.id;
    const { question } = req.body;

    if (!question || typeof question !== "string") {
      return res.status(400).json({ error: "question is required" });
    }

    const result = await ragChat(repoId, question);
    res.json(result);
  } catch (err) {
    console.error("[chat.routes] failed:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;