import type { Request, Response, NextFunction } from "express";

/**
 * Simple bearer token check used by API routes that should be agent-only.
 * If CJ_AGENT_TOKEN is not set, requests are allowed (local dev mode).
 */
export function ensureAgentAuthorized(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.CJ_AGENT_TOKEN;
  if (!expected) return next();

  const header = String(req.headers?.authorization ?? "");
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : header.trim();
  if (token !== expected) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  return next();
}

export function isAgentAuthorized(req: Request): boolean {
  const expected = process.env.CJ_AGENT_TOKEN;
  if (!expected) return true;
  const header = String(req.headers?.authorization ?? "");
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : header.trim();
  return token === expected;
}
