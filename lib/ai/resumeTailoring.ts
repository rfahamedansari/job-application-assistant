import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

type ResumeTailoringInput = {
  systemPrompt: string;
  userPrompt: string;
};

type ResumeTailoringResult = {
  outputText: string;
  provider: "claude" | "openai";
};

function isValidJsonObject(text: string): boolean {
  const cleaned = text
    .replace(/^\`\`\`json/i, "")
    .replace(/^\`\`\`/i, "")
    .replace(/\`\`\`$/, "")
    .trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return true;
  } catch {
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        const parsed = JSON.parse(text.slice(firstBrace, lastBrace + 1));
        return Boolean(parsed && typeof parsed === "object" && !Array.isArray(parsed));
      } catch {
        return false;
      }
    }
  }
  return false;
}

const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5";

/**
 * Claude-first provider with automatic OpenAI fallback.
 * A provider is considered failed if the request throws or returns no text.
 */
export async function generateResumeTailoring({
  systemPrompt,
  userPrompt,
}: ResumeTailoringInput): Promise<ResumeTailoringResult> {
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  const openaiApiKey = process.env.OPENAI_API_KEY;

  if (anthropicApiKey) {
    try {
      const anthropic = new Anthropic({
        apiKey: anthropicApiKey,
        timeout: 60_000,
      });
      const response = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 8000,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      });

      const outputText = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("")
        .trim();

      if (!outputText) {
        throw new Error("Claude returned an empty response.");
      }
      if (!isValidJsonObject(outputText)) {
        throw new Error("Claude returned invalid JSON; trying the OpenAI fallback.");
      }

      return { outputText, provider: "claude" };
    } catch (claudeError) {
      console.error("Claude resume-tailoring attempt failed; trying OpenAI fallback.", claudeError);
      if (!openaiApiKey) {
        throw new Error(
          `Claude failed and OPENAI_API_KEY is not configured. ${claudeError instanceof Error ? claudeError.message : "Unknown Claude error"}`
        );
      }
    }
  }

  if (!openaiApiKey) {
    throw new Error(
      "No AI provider is configured. Set ANTHROPIC_API_KEY and/or OPENAI_API_KEY in the deployment environment."
    );
  }

  try {
    const openai = new OpenAI({ apiKey: openaiApiKey, timeout: 60_000 });
    const response = await openai.responses.create({
      model: OPENAI_MODEL,
      instructions: systemPrompt,
      input: userPrompt,
    });
    const outputText = response.output_text?.trim() ?? "";

    if (!outputText) {
      throw new Error("OpenAI returned an empty response.");
    }
    if (!isValidJsonObject(outputText)) {
      throw new Error("OpenAI returned invalid JSON. Check the model response and try again.");
    }

    return { outputText, provider: "openai" };
  } catch (openaiError) {
    console.error("OpenAI resume-tailoring fallback failed.", openaiError);
    throw new Error(
      `Both AI providers failed. Claude is the primary provider and OpenAI is the fallback. OpenAI error: ${openaiError instanceof Error ? openaiError.message : "Unknown OpenAI error"}`
    );
  }
}
