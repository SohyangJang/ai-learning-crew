import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

interface VerifyChallengeRequest {
  member_id: string;
  challenge_date?: string; // Format: YYYY-MM-DD (defaults to today)
  topic?: string;
  submission_text?: string; // AI Shared URL, notes, or chat logs
  image_base64?: string;   // Base64 string or Data URL
  image_mime_type?: string;// Optional MIME type
  image_url?: string;      // Public URL
  criteria?: string;       // Custom evaluation rubric
}

interface VerificationOutput {
  result: "O" | "X";
  reason: string;
}

// AI 플랫폼 감지 정규식
const AI_SHARE_PATTERNS = [
  { name: "ChatGPT", regex: /https?:\/\/(chatgpt\.com\/share\/|chat\.openai\.com\/share\/)[a-zA-Z0-9_-]+/i },
  { name: "Claude", regex: /https?:\/\/claude\.ai\/share\/[a-zA-Z0-9_-]+/i },
  { name: "Gemini", regex: /https?:\/\/(gemini\.google\.com\/(share|app)\/|share\.gemini\.google\/)[a-zA-Z0-9_-]+/i },
  { name: "Perplexity", regex: /https?:\/\/(www\.)?(perplexity\.ai\/(search|page)\/|pplx\.ai\/)[a-zA-Z0-9_-]+/i },
  { name: "Copilot", regex: /https?:\/\/copilot\.microsoft\.com\/(sl|chats?)\/[a-zA-Z0-9_-]+/i },
  { name: "v0.dev", regex: /https?:\/\/v0\.dev\/(chat|t)\/[a-zA-Z0-9_-]+/i },
  { name: "Poe", regex: /https?:\/\/poe\.com\/(s|chat)\/[a-zA-Z0-9_-]+/i },
];

function detectAITool(text?: string): { name: string; url: string } | null {
  if (!text) return null;
  for (const p of AI_SHARE_PATTERNS) {
    const match = text.match(p.regex);
    if (match) {
      return { name: p.name, url: match[0] };
    }
  }
  return null;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    const geminiModel = Deno.env.get("GEMINI_MODEL") || "gemini-3.6-flash";

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration (SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY).");
    }

    const body: VerifyChallengeRequest = await req.json();
    const {
      member_id,
      challenge_date,
      topic,
      submission_text,
      image_base64,
      image_url,
      criteria,
    } = body;

    if (!member_id) {
      return new Response(
        JSON.stringify({ error: "Missing required field: member_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!submission_text && !image_base64 && !image_url) {
      return new Response(
        JSON.stringify({
          error: "Submission must contain at least one of: submission_text, image_base64, or image_url.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const todayStr = new Date().toISOString().split("T")[0];
    const targetDate = challenge_date || todayStr;
    const challengeTopic = topic || "생성형 AI 대화 공유 챌린지";

    let parsedOutput: VerificationOutput;

    // 1. [우선 검증 - 토큰 소모 0원] 생성형 AI 공식 공유 링크인지 확인
    const detectedTool = detectAITool(submission_text || image_url);
    if (detectedTool) {
      parsedOutput = {
        result: "O",
        reason: `[${detectedTool.name}] 공식 대화 공유 링크(${detectedTool.url})가 확인되었습니다. 크루원들과 대화 내용이 정상 공유되었습니다.`,
      };
    } else if (geminiApiKey && (submission_text || image_base64 || image_url)) {
      // 2. [선택적 폴백] 공유 링크가 아니지만 GEMINI_API_KEY가 등록되어 있는 경우에만 Gemini 심사 수행
      const promptText = `당신은 AI 학습 크루의 챌린지 검증관입니다.
[과제 주제]: ${challengeTopic}
${criteria ? `[특별 검증 기준]: ${criteria}\n` : ""}
[제출 내용]: ${submission_text || "(첨부 이미지/로그)"}

위 내용이 과제 조건을 충족하는지 JSON 규격({"result": "O" 또는 "X", "reason": "이유"})으로 판정하세요.`;

      const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`;
      const geminiRes = await fetch(geminiEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }],
          generationConfig: { response_mime_type: "application/json", temperature: 0.1 },
        }),
      });

      if (geminiRes.ok) {
        const geminiData = await geminiRes.json();
        const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
        parsedOutput = JSON.parse(rawText);
      } else {
        parsedOutput = {
          result: "X",
          reason: "유효한 생성형 AI 공유 링크(ChatGPT, Claude, Gemini 등) 형식이 아니며, 심사 중 오류가 발생했습니다.",
        };
      }
    } else {
      // 3. 유효하지 않은 공유 링크 및 API 키 부재
      parsedOutput = {
        result: "X",
        reason: "유효한 생성형 AI(ChatGPT, Claude, Gemini, Perplexity 등) 공유 주소 형식으로 제출해 주시기 바랍니다.",
      };
    }

    const finalResult: "O" | "X" = parsedOutput.result === "O" ? "O" : "X";

    // 4. Upsert record into daily_challenges
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    let recordedContent = submission_text || "";
    if (image_url) recordedContent += (recordedContent ? "\n" : "") + `[URL]: ${image_url}`;

    const { data: challengeRecord, error: dbError } = await supabase
      .from("daily_challenges")
      .upsert(
        {
          member_id,
          challenge_date: targetDate,
          topic: challengeTopic,
          submission_content: recordedContent,
          ai_feedback: parsedOutput.reason,
          score: finalResult === "O" ? 100 : 0,
          result: finalResult,
          submitted_at: new Date().toISOString(),
        },
        {
          onConflict: "member_id,challenge_date",
        }
      )
      .select()
      .single();

    if (dbError) {
      throw new Error(`Failed to update daily_challenges: ${dbError.message}`);
    }

    // Retrieve updated member info
    const { data: memberRecord } = await supabase
      .from("members")
      .select("id, name, email, balance, fail_count")
      .eq("id", member_id)
      .single();

    return new Response(
      JSON.stringify({
        success: true,
        verification: {
          result: finalResult,
          reason: parsedOutput.reason,
        },
        challenge: challengeRecord,
        member: memberRecord,
        fee_deducted: finalResult === "X",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
