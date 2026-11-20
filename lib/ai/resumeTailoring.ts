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
 * OpenAI-first provider with automatic Claude fallback.
 * A provider is considered failed if the request throws or returns no valid JSON text.
 */
export async function generateResumeTailoring({
  systemPrompt,
  userPrompt,
}: ResumeTailoringInput): Promise<ResumeTailoringResult> {
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  const openaiApiKey = process.env.OPENAI_API_KEY;

  if (openaiApiKey) {
    try {
      const openai = new OpenAI({ apiKey: openaiApiKey, timeout: 25_000, maxRetries: 0 });
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
        throw new Error("OpenAI returned invalid JSON; trying the Claude fallback.");
      }

      return { outputText, provider: "openai" };
    } catch (openaiError) {
      console.error("OpenAI resume-tailoring attempt failed; trying Claude fallback.", openaiError);
      if (!anthropicApiKey) {
        throw new Error(
          `OpenAI failed and ANTHROPIC_API_KEY is not configured. ${openaiError instanceof Error ? openaiError.message : "Unknown OpenAI error"}`
        );
      }
    }
  }

  if (!anthropicApiKey) {
    throw new Error(
      "No AI provider is configured. Set OPENAI_API_KEY and/or ANTHROPIC_API_KEY in the deployment environment."
    );
  }

  try {
    const anthropic = new Anthropic({
      apiKey: anthropicApiKey,
      timeout: 18_000,
      maxRetries: 0,
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
      throw new Error("Claude returned invalid JSON.");
    }

    return { outputText, provider: "claude" };
  } catch (claudeError) {
    console.error("Claude resume-tailoring fallback failed.", claudeError);
    throw new Error(
      `Both AI providers failed. OpenAI is the primary provider and Claude is the fallback. Claude error: ${claudeError instanceof Error ? claudeError.message : "Unknown Claude error"}`
    );
  }
}

}
