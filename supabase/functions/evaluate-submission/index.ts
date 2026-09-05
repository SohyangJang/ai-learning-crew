import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

interface EvaluationRequestBody {
  member_id: string;
  topic?: string;
  submission_content: string;
  challenge_date?: string; // Format: YYYY-MM-DD
  passing_score?: number;  // Default: 70
}

interface GeminiEvaluation {
  score: number;
  result: "O" | "X";
  feedback: string;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight requests
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

    if (!geminiApiKey) {
      throw new Error("Missing GEMINI_API_KEY in environment secrets.");
    }

    // Parse and validate request body
    const body: EvaluationRequestBody = await req.json();
    const { member_id, topic, submission_content, challenge_date, passing_score = 70 } = body;

    if (!member_id || !submission_content) {
      return new Response(
        JSON.stringify({
          error: "Missing required fields: member_id and submission_content are required.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const todayStr = new Date().toISOString().split("T")[0];
    const targetDate = challenge_date || todayStr;
    const challengeTopic = topic || "일일 학습 과제";

    // Build Gemini evaluation prompt
    const prompt = `당신은 AI 학습 크루의 과제 평가 튜터입니다.
학습자가 제출한 일일 학습 과제 내용을 객관적이고 건설적으로 평가해주세요.

[과제 주제]: ${challengeTopic}
[제출 내용]:
${submission_content}

[평가 기준]:
1. 과제 주제에 부합하는 적절한 내용인가?
2. 학습한 개념에 대한 이해와 성실한 실습/정리가 포함되어 있는가?
3. 단순 복사/붙여넣기 수준이 아닌 본인의 학습 고민이나 요약이 드러나 있는가?
4. 기준 점수(${passing_score}점 이상)를 만족하면 합격('O'), 미달이면 불합격('X')으로 판정합니다.

반드시 다른 설명 없이 아래 JSON 규격에 맞추어 JSON 형식으로만 응답하세요:
{
  "score": <0~100 사이의 정수>,
  "result": "<'O' 또는 'X'>",
  "feedback": "<한국어로 작성된 상세하고 건설적인 피드백 (칭찬할 점, 보완할 점, 개선 팁 등)>"
}`;

    // Call Google Gemini API (with resilient model candidates)
    const candidateModels = Array.from(
      new Set([geminiModel, "gemini-flash-latest", "gemini-3.5-flash"])
    );
    let geminiData: any = null;
    let lastError = "";

    for (const model of candidateModels) {
      try {
        const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`;
        const geminiRes = await fetch(geminiEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [{ text: prompt }],
              },
            ],
            generationConfig: {
              response_mime_type: "application/json",
              temperature: 0.2,
            },
          }),
        });

        if (geminiRes.ok) {
          geminiData = await geminiRes.json();
          break;
        } else {
          lastError = await geminiRes.text();
          await new Promise((resolve) => setTimeout(resolve, 600));
        }
      } catch (e) {
        lastError = String(e);
      }
    }

    if (!geminiData) {
      throw new Error(`Gemini API error: ${lastError}`);
    }
    const rawContent = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawContent) {
      throw new Error("No evaluation response generated from Gemini API.");
    }

    let evaluation: GeminiEvaluation;
    try {
      evaluation = JSON.parse(rawContent);
    } catch {
      throw new Error(`Failed to parse Gemini output as JSON: ${rawContent}`);
    }

    // Normalize result to ensure 'O' or 'X'
    const finalResult = evaluation.score >= passing_score ? "O" : "X";

    // Initialize Supabase Admin Client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Upsert into daily_challenges table
    // (If result is 'X' and not yet deducted, trg_handle_challenge_penalty automatically deducts 2,000 KRW from members.balance)
    const { data: challengeRecord, error: dbError } = await supabase
      .from("daily_challenges")
      .upsert(
        {
          member_id,
          challenge_date: targetDate,
          topic: challengeTopic,
          submission_content,
          ai_feedback: evaluation.feedback,
          score: evaluation.score,
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
      throw new Error(`Database error saving challenge: ${dbError.message}`);
    }

    // Fetch updated member status (balance & fail_count)
    const { data: memberRecord } = await supabase
      .from("members")
      .select("id, name, balance, fail_count")
      .eq("id", member_id)
      .single();

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          challenge: challengeRecord,
          member: memberRecord,
          evaluation: {
            score: evaluation.score,
            result: finalResult,
            feedback: evaluation.feedback,
          },
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({
        success: false,
        error: message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
