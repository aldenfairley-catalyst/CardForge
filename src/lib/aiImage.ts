/**
 * src/lib/aiImage.ts
 * Client helper for builder-only AI image generation.
 *
 * SECURITY NOTE:
 * - Do NOT call OpenAI/Gemini directly from the browser with secret keys.
 * - This helper calls your own server endpoint which holds provider keys.
 *
 * Env:
 * - VITE_AI_IMAGE_ENDPOINT (default: /api/ai/image)
 */

export type AiImageProvider = "OPENAI" | "GEMINI" | "GEMINI_NANO_BANANA_PRO";

export type AiImageRequest = {
  provider: AiImageProvider;
  width: number;
  height: number;
  systemPrompt: string;
  userPrompt: string;
  referenceImages?: Array<{ name: string; dataUrl: string }>;
};

export type AiImageResponse = {
  url?: string;      // hosted URL
  dataUrl?: string;  // base64 data URL
};

export async function requestAiImage(req: AiImageRequest): Promise<AiImageResponse> {
  const endpoint = (import.meta as any).env?.VITE_AI_IMAGE_ENDPOINT || "/api/ai/image";
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req)
  });

  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* ignore */ }

  if (!res.ok) {
    const msg = json?.error || json?.message || text || res.statusText;
    throw new Error(msg);
  }

  return json as AiImageResponse;
}
