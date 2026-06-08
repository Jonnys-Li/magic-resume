import { createFileRoute } from "@tanstack/react-router";
import { AI_MODEL_CONFIGS, AIModelType } from "@/config/ai";
import {
  buildInterviewPrepPrompt,
  parseInterviewPrepAIResult,
  type GeneratePrepInput,
} from "@/lib/interviewPrep";
import {
  formatGeminiErrorMessage,
  getGeminiModelInstance,
} from "@/lib/server/gemini";

const parseUpstreamText = (raw: string, fallback: string) => {
  if (!raw) return fallback;
  try {
    const data = JSON.parse(raw) as {
      error?: { message?: string };
      message?: string;
    };
    return data.error?.message || data.message || fallback;
  } catch {
    return raw;
  }
};

export const Route = createFileRoute("/api/interview-prep")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const {
            apiKey,
            model,
            modelType,
            apiEndpoint,
            resumeText,
            jobDescription,
            jobTitle,
            company,
            resumeName,
            memoryNotes,
          } = body as GeneratePrepInput & {
            apiKey: string;
            model: string;
            modelType: AIModelType;
            apiEndpoint?: string;
          };

          if (!apiKey || !modelType || !resumeText || !jobDescription) {
            return Response.json(
              { error: "Missing AI config, resume text, or job description" },
              { status: 400 }
            );
          }

          const modelConfig = AI_MODEL_CONFIGS[modelType];
          if (!modelConfig) {
            return Response.json({ error: "Invalid model type" }, { status: 400 });
          }

          const input: GeneratePrepInput = {
            resumeText,
            jobDescription,
            jobTitle,
            company,
            resumeName,
            memoryNotes,
          };
          const prompt = buildInterviewPrepPrompt(input);
          let content = "";

          if (modelType === "gemini") {
            const modelInstance = getGeminiModelInstance({
              apiKey,
              model: model || "gemini-flash-latest",
              systemInstruction:
                "你是专业中文求职教练。你必须只输出合法 JSON，不要输出 Markdown。",
              generationConfig: {
                temperature: 0.35,
                responseMimeType: "application/json",
              },
            });
            const result = await modelInstance.generateContent(prompt);
            content = result.response.text();
          } else {
            const response = await fetch(modelConfig.url(apiEndpoint), {
              method: "POST",
              headers: modelConfig.headers(apiKey),
              body: JSON.stringify({
                model: modelConfig.requiresModelId
                  ? model
                  : modelConfig.defaultModel,
                messages: [
                  {
                    role: "system",
                    content:
                      "你是专业中文求职教练。你必须只输出合法 JSON，不要输出 Markdown。",
                  },
                  {
                    role: "user",
                    content: prompt,
                  },
                ],
                temperature: 0.35,
                stream: false,
              }),
            });

            if (!response.ok) {
              const raw = await response.text();
              return Response.json(
                {
                  error: parseUpstreamText(
                    raw,
                    `Upstream API error: ${response.status}`
                  ),
                },
                { status: response.status }
              );
            }

            const data = (await response.json()) as {
              choices?: Array<{ message?: { content?: string } }>;
            };
            content = data.choices?.[0]?.message?.content || "";
          }

          const parsed = parseInterviewPrepAIResult(content, input);
          if (!parsed) {
            return Response.json(
              { error: "AI did not return parseable interview-prep JSON" },
              { status: 500 }
            );
          }

          return Response.json({ result: parsed });
        } catch (error) {
          console.error("Interview prep error:", error);
          return Response.json(
            { error: formatGeminiErrorMessage(error) },
            { status: 500 }
          );
        }
      },
    },
  },
});
