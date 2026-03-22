import { NextResponse } from "next/server";

const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const MODEL = "gpt-4.1-mini";

function buildSystemPrompt(isFinalRound) {
  if (isFinalRound) {
    return [
      "You are writing the closing line of a poem.",
      "Return exactly 3 possible final lines in JSON.",
      "Each line must feel like an ending.",
      "Each line should tie together the original first line, the full poem so far, and the immediately previous line.",
      "Echo, resolve, or reflect something already present in the poem.",
      "Do not introduce a new unrelated idea.",
      "Keep each line short, poetic, restrained, and coherent.",
      "Most lines should still feel like natural continuations, but it is acceptable for 1 of the 3 lines to begin a new sentence with uppercase if that creates a meaningful closing shift or reflection.",
      "Avoid cliches, filler, explanation, and repetition.",
    ].join(" ");
  }

  return [
    "You are writing the next line of a poem.",
    "Return exactly 3 possible continuation lines in JSON.",
    "Each line must make sense after the full poem so far.",
    "Each line must stay connected to the original first line and the immediately previous line.",
    "Preserve the poem's tone, imagery, tense, voice, and perspective.",
    "Keep each line short, poetic, restrained, and coherent.",
    "Most options should read as lowercase continuation lines.",
    "But about 1 of the 3 options may instead begin a new sentence with uppercase if it feels like a deliberate shift, reflection, or progression that still clearly belongs to the same poem.",
    "This variation must feel intentional, not random.",
    "Make the 3 options distinct from each other without drifting away from the poem.",
    "Avoid cliches, filler, explanation, and generic language.",
  ].join(" ");
}

function buildUserPrompt({
  firstLine,
  poemSoFar,
  previousLine,
  round,
  isFinalRound,
}) {
  return [
    `Original first line: ${firstLine}`,
    `Full poem so far:\n${poemSoFar.map((line, index) => `${index + 1}. ${line}`).join("\n")}`,
    `Immediately previous line: ${previousLine}`,
    `Current round: ${round}`,
    `Final round: ${isFinalRound ? "yes" : "no"}`,
    "Generate exactly 3 lines.",
    "Stylistic variation rule: usually 2 lines should remain lowercase continuation-style lines, and up to 1 line may begin with uppercase if it creates a meaningful turn while staying coherent with the poem so far.",
    "Return JSON only in this shape: {\"lines\":[\"line one\",\"line two\",\"line three\"]}",
  ].join("\n\n");
}

function extractText(responseJson) {
  if (typeof responseJson.output_text === "string" && responseJson.output_text) {
    return responseJson.output_text;
  }

  for (const item of responseJson.output || []) {
    if (item.type !== "message") {
      continue;
    }

    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) {
        return content.text;
      }
    }
  }

  return "";
}

function validateLines(lines) {
  return (
    Array.isArray(lines) &&
    lines.length === 3 &&
    lines.every((line) => typeof line === "string" && line.trim())
  );
}

export async function POST(request) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "Missing OPENAI_API_KEY environment variable." },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const {
      firstLine,
      poemSoFar,
      previousLine,
      round,
      isFinalRound,
    } = body;

    if (
      !firstLine ||
      !previousLine ||
      !Array.isArray(poemSoFar) ||
      poemSoFar.length === 0
    ) {
      return NextResponse.json(
        { error: "Missing poem context for continuation generation." },
        { status: 400 }
      );
    }

    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        input: [
          {
            role: "system",
            content: buildSystemPrompt(Boolean(isFinalRound)),
          },
          {
            role: "user",
            content: buildUserPrompt({
              firstLine,
              poemSoFar,
              previousLine,
              round,
              isFinalRound: Boolean(isFinalRound),
            }),
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "poem_continuations",
            strict: true,
            schema: {
              type: "object",
              properties: {
                lines: {
                  type: "array",
                  items: { type: "string" },
                  minItems: 3,
                  maxItems: 3,
                },
              },
              required: ["lines"],
              additionalProperties: false,
            },
          },
        },
      }),
    });

    const responseJson = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        {
          error:
            responseJson.error?.message ||
            "OpenAI request failed while generating continuation lines.",
        },
        { status: response.status }
      );
    }

    const text = extractText(responseJson);

    if (!text) {
      return NextResponse.json(
        { error: "The model returned an empty continuation response." },
        { status: 500 }
      );
    }

    const parsed = JSON.parse(text);

    if (!validateLines(parsed.lines)) {
      return NextResponse.json(
        { error: "The model response did not include exactly 3 valid lines." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      lines: parsed.lines.map((line) => line.trim()),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unexpected error while generating continuation lines.",
      },
      { status: 500 }
    );
  }
}
