import { Router } from "express";

export function createAiRouter() {
  const router = Router();

  router.post("/text", (req, res) => {
    res.json({ message: "AI text proxy not yet configured", echo: req.body ?? null });
  });

  router.post("/image", (req, res) => {
    res.json({ message: "AI image proxy not yet configured", echo: req.body ?? null });
  });

  return router;
}
