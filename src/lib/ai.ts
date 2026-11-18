import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { NewCard } from "./db";

const Suggestion = z.object({
  title: z.string().describe("Short descriptive title, at most 8 words"),
  summary: z.string().describe("One sentence describing the item"),
  tags: z.array(z.string()).describe("3 to 6 lowercase tags: topics, objects, styles, moods"),
});
export type Suggestion = z.infer<typeof Suggestion>;

const MODEL = process.env.OPENMIND_AI_MODEL ?? "claude-opus-5-5";

/** AI tagging is opt-in: it runs only when Anthropic credentials are configured. */
export function aiEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

let client: Anthropic | undefined;

/**
 * Ask Claude for a title, one-line summary and tags for something being saved.
 * Best-effort: returns null when AI is off, the model declines, or the call fails.
 */
export async function suggest(card: NewCard & { preview?: Buffer }): Promise<Suggestion | null> {
  if (!aiEnabled()) return null;
  client ??= new Anthropic({ maxRetries: 1, timeout: 30_000 });

  const facts = [
    `Kind: ${card.type}`,
    card.url && `URL: ${card.url}`,
    card.title && `Title: ${card.title}`,
    card.description && `Description: ${card.description}`,
    card.content && `Text:\n${card.content}`,
  ].filter(Boolean);

  try {
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 2000,
      system:
        "You organise a personal visual bookmarking library. Given something the user saved, " +
        "describe it so they can find it again later by searching. Tags are single words or short " +
        "phrases a person would actually type.",
      messages: [
        {
          role: "user",
          content: [
            ...(card.preview
              ? [
                  {
                    type: "image" as const,
                    source: {
                      type: "base64" as const,
                      media_type: "image/jpeg" as const,
                      data: card.preview.toString("base64"),
                    },
                  },
                ]
              : []),
            { type: "text" as const, text: facts.join("\n") },
          ],
        },
      ],
      output_config: { effort: "low", format: zodOutputFormat(Suggestion) },
    });
    return response.parsed_output ?? null;
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      console.warn("[openmind] AI tagging skipped: Anthropic credentials were rejected");
    } else if (error instanceof Anthropic.RateLimitError) {
      console.warn("[openmind] AI tagging skipped: rate limited");
    } else if (error instanceof Anthropic.APIError) {
      console.warn(`[openmind] AI tagging skipped: API error ${error.status}: ${error.message}`);
    } else {
      console.warn("[openmind] AI tagging skipped:", error);
    }
    return null;
  }
}
