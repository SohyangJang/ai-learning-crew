import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

/**
 * admin-action Edge Function
 *
 * 역할: 관리자 PIN을 서버에서 검증하고 회원 잔액/패널티를 업데이트
 *   - PIN은 환경변수 ADMIN_PIN 에 저장 (소스코드에 노출되지 않음)
 *   - 올바른 PIN이 아닐 경우 401 반환
 *   - 성공 시 해당 회원의 balance, fail_count 업데이트
 *
 * Request body:
 *   {
 *     "pin": "관리자PIN",
 *     "member_id": "UUID",
 *     "balance": 80000,
 *     "fail_count": 0
 *   }
 */

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, error: "POST 요청만 허용됩니다." }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const adminPin = Deno.env.get("ADMIN_PIN");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration.");
    }

    if (!adminPin) {
      throw new Error("ADMIN_PIN 환경변수가 설정되지 않았습니다.");
    }

    const body = await req.json();
    const { pin, member_id, balance, fail_count } = body;

    // ── 1. PIN 검증 ────────────────────────────────────────────────
    if (typeof pin !== "string" || !pin || pin !== adminPin) {
      return new Response(
        JSON.stringify({ success: false, error: "관리자 PIN 번호가 일치하지 않습니다." }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ── 2. 입력값 검증 ─────────────────────────────────────────────
    if (typeof member_id !== "string" || !member_id) {
      return new Response(
        JSON.stringify({ success: false, error: "member_id가 필요합니다." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!Number.isSafeInteger(balance) || balance < 0) {
      return new Response(
        JSON.stringify({ success: false, error: "올바른 금액을 입력해 주세요 (0원 이상)." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const safeFailCount = Number.isSafeInteger(fail_count) && fail_count >= 0 ? fail_count : 0;

    // ── 3. DB 업데이트 (Service Role Key 사용) ────────────────────
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data, error } = await supabase
      .from("members")
      .update({
        balance,
        fail_count: safeFailCount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", member_id)
      .select("id, name, balance, fail_count")
      .single();

    if (error) {
      throw new Error(`DB 업데이트 실패: ${error.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `${data.name} 님의 잔액이 ${balance.toLocaleString()}원(패널티 ${safeFailCount}회)으로 수정되었습니다.`,
        member: data,
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
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
