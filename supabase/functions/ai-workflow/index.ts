import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonResponse = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["supported", "reason", "title", "description", "date", "time", "capacity", "headline", "subheading", "campaignName", "subject", "body"],
  properties: {
    supported: { type: "boolean" },
    reason: { type: "string" },
    title: { type: "string" },
    description: { type: "string" },
    date: { type: "string" },
    time: { type: "string" },
    capacity: { type: "integer", minimum: 0 },
    headline: { type: "string" },
    subheading: { type: "string" },
    campaignName: { type: "string" },
    subject: { type: "string" },
    body: { type: "string" },
  },
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse(405, { error: "Use POST to request a workflow proposal." });

  const authorization = request.headers.get("Authorization");
  const openAiKey = Deno.env.get("OPENAI_API_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!authorization) return jsonResponse(401, { error: "Sign in before using the workflow agent." });
  if (!openAiKey || !supabaseUrl || !anonKey) {
    return jsonResponse(500, { error: "AI workflows are not configured. Set OPENAI_API_KEY in Supabase Edge Function secrets." });
  }

  try {
    const accessToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!accessToken) return jsonResponse(401, { error: "Sign in before using the workflow agent." });
    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: authError } = await authClient.auth.getUser(accessToken);
    if (authError || !user) return jsonResponse(401, { error: "Your session is invalid or expired. Please sign in again." });

    const requestBody = await request.json().catch(() => null);
    const prompt = typeof requestBody?.prompt === "string" ? requestBody.prompt.trim() : "";
    if (!prompt || prompt.length > 2000) {
      return jsonResponse(400, { error: "Enter a workflow request between 1 and 2,000 characters." });
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini",
        instructions: [
          "You are the NEXUS business workflow planner.",
          `Today's UTC date is ${new Date().toISOString().slice(0, 10)}.`,
          "The only supported workflow is to propose creating one event or webinar, its public-facing registration page content, and a linked campaign draft.",
          "Do not claim to execute anything. A human will review the proposal before any workspace changes are saved.",
          "For other requests, set supported=false and explain that this workflow currently supports event launch planning only.",
          "Use the requested title and details when present. If no date is provided, choose a date at least seven days in the future.",
          "Use a valid future calendar date in YYYY-MM-DD, 24-hour HH:MM time, and an integer capacity between 1 and 10000.",
          "Write appropriate landing page text, campaign name, email subject, and reminder email body. Do not invent registrants or claim emails have been sent.",
        ].join(" "),
        input: prompt,
        text: {
          format: {
            type: "json_schema",
            name: "event_workflow_proposal",
            strict: true,
            schema,
          },
        },
      }),
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      const message = typeof errorBody?.error?.message === "string" ? errorBody.error.message : "The AI provider could not create a workflow proposal.";
      return jsonResponse(502, { error: message });
    }
    const result = await response.json();
    const outputText = result.output
      ?.flatMap((item: { content?: Array<{ type?: string; text?: string }> }) => item.content || [])
      .find((item: { type?: string }) => item.type === "output_text")?.text;
    if (typeof outputText !== "string") return jsonResponse(502, { error: "The AI provider returned no workflow proposal." });

    const proposal = JSON.parse(outputText);
    if (!proposal.supported) {
      return jsonResponse(200, { supported: false, reason: proposal.reason || "This workflow is not supported yet." });
    }
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(proposal.date) &&
      !Number.isNaN(Date.parse(`${proposal.date}T00:00:00Z`)) &&
      new Date(`${proposal.date}T00:00:00Z`).toISOString().slice(0, 10) === proposal.date;
    if (!validDate || proposal.date < new Date().toISOString().slice(0, 10) ||
      !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(proposal.time) ||
      !Number.isInteger(proposal.capacity) || proposal.capacity < 1 || proposal.capacity > 10000) {
      return jsonResponse(502, { error: "The AI provider returned invalid event details. Please try again with a clear date and capacity." });
    }
    for (const field of ["title", "description", "headline", "subheading", "campaignName", "subject", "body"]) {
      if (typeof proposal[field] !== "string" || proposal[field].trim().length === 0 || proposal[field].length > 5000) {
        return jsonResponse(502, { error: "The AI provider returned incomplete workflow content. Please try again." });
      }
    }
    if (proposal.title.length > 120 || proposal.campaignName.length > 120 || proposal.subject.length > 200) {
      return jsonResponse(502, { error: "The AI provider returned content that exceeds the supported field lengths." });
    }
    return jsonResponse(200, { supported: true, proposal });
  } catch (error) {
    console.error("AI workflow proposal failed:", error);
    return jsonResponse(502, { error: "Could not prepare the workflow proposal. Please try again." });
  }
});
