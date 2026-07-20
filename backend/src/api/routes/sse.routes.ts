import { Router } from "express";
import { registerSSEClient } from "../../services/sse.service.js";

const router = Router();

router.get("/:repoId/status-stream", (req, res) => {
  const { repoId } = req.params;
  registerSSEClient(repoId, res);
});

export default router;