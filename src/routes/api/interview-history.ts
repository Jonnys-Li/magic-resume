import { createFileRoute } from "@tanstack/react-router";
import type { InterviewPrepResult } from "@/lib/interviewPrep";

type D1DatabaseLike = {
  prepare: (query: string) => {
    bind: (...values: unknown[]) => {
      run: () => Promise<unknown>;
      all: <T = unknown>() => Promise<{ results?: T[] }>;
    };
    all: <T = unknown>() => Promise<{ results?: T[] }>;
  };
};

const getDb = (context: any): D1DatabaseLike | null =>
  context?.env?.DB ||
  context?.cloudflare?.env?.DB ||
  context?.platform?.env?.DB ||
  null;

const getRuntimeDb = async () => {
  try {
    const runtime = await import("cloudflare:workers");
    return ((runtime as any).env?.DB as D1DatabaseLike | undefined) || null;
  } catch {
    return null;
  }
};

const missingDbResponse = () =>
  Response.json({
    records: [],
    storage: "local",
    message:
      "D1 binding DB is not configured. The browser will keep using local history.",
  });

export const Route = createFileRoute("/api/interview-history")({
  server: {
    handlers: {
      GET: async (args: any) => {
        const request = args.request as Request;
        const db = getDb(args.context) || (await getRuntimeDb());
        if (!db) return missingDbResponse();

        const url = new URL(request.url);
        const clientId = url.searchParams.get("clientId");
        if (!clientId) {
          return Response.json({ error: "Missing clientId" }, { status: 400 });
        }

        const { results } = await db
          .prepare(
            "SELECT payload FROM interview_history WHERE client_id = ? ORDER BY created_at DESC LIMIT 20"
          )
          .bind(clientId)
          .all<{ payload: string }>();

        const records = (results || [])
          .map((row) => {
            try {
              return JSON.parse(row.payload) as InterviewPrepResult;
            } catch {
              return null;
            }
          })
          .filter(Boolean);

        return Response.json({ records, storage: "d1" });
      },
      POST: async (args: any) => {
        const request = args.request as Request;
        const db = getDb(args.context) || (await getRuntimeDb());
        if (!db) return missingDbResponse();

        const body = (await request.json()) as {
          clientId?: string;
          record?: InterviewPrepResult;
        };
        const { clientId, record } = body;
        if (!clientId || !record?.id) {
          return Response.json(
            { error: "Missing clientId or record" },
            { status: 400 }
          );
        }

        await db
          .prepare(
            `INSERT OR REPLACE INTO interview_history
             (id, client_id, created_at, job_title, company, resume_name, payload)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            record.id,
            clientId,
            record.createdAt,
            record.jobTitle || "",
            record.company || "",
            record.resumeName || "",
            JSON.stringify(record)
          )
          .run();

        return Response.json({ ok: true, storage: "d1" });
      },
    },
  },
});
