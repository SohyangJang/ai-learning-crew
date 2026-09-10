import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

/**
 * KST(Asia/Seoul) 기준 요일/월/날짜 정보 추출
 */
function getKSTInfo() {
  const now = new Date();
  
  // Intl.DateTimeFormat을 사용하여 서버 타임존과 무관하게 정확한 KST 날짜/시간 계산
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });

  const parts = formatter.formatToParts(now);
  const partMap: Record<string, string> = {};
  parts.forEach((p) => {
    partMap[p.type] = p.value;
  });

  // partMap예시: { weekday: 'Mon', month: '09', day: '08', year: '2026' }
  const year = partMap.year;
  const month = parseInt(partMap.month, 10);
  const day = partMap.day;
  const weekdayStr = partMap.weekday; // 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'

  const isWeekday = !["Sat", "Sun"].includes(weekdayStr);
  const isChallengeMonth = month >= 9 && month <= 12;
  const todayStr = `${year}-${partMap.month}-${day}`;

  return { todayStr, isWeekday, isChallengeMonth };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration.");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. KST 기준 날짜 및 유효성 판단
    const { todayStr, isWeekday, isChallengeMonth } = getKSTInfo();

    // 2. 운영 기간/요일 체크
    if (!isChallengeMonth) {
      return new Response(
        JSON.stringify({
          success: true,
          skipped: true,
          reason: `챌린지 운영 기간(9~12월)이 아닙니다. 오늘: ${todayStr}`,
          penalized_count: 0,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!isWeekday) {
      return new Response(
        JSON.stringify({
          success: true,
          skipped: true,
          reason: `오늘은 주말입니다. 차감하지 않습니다. 오늘: ${todayStr}`,
          penalized_count: 0,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. 활성 회원 전체 조회
    const { data: activeMembers, error: membersError } = await supabase
      .from("members")
      .select("id, name")
      .eq("is_active", true);

    if (membersError) throw new Error(`회원 조회 실패: ${membersError.message}`);
    if (!activeMembers || activeMembers.length === 0) {
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "활성 회원 없음", penalized_count: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. 오늘 이미 제출 기록이 있는 회원 조회 (P, O, X 모두 포함하여 처리 중인 기록도 체크)
    const { data: submittedToday, error: challengeError } = await supabase
      .from("daily_challenges")
      .select("member_id, result")
      .eq("challenge_date", todayStr);

    if (challengeError) throw new Error(`챌린지 조회 실패: ${challengeError.message}`);

    // 오늘 어떠한 형태로든 제출('O', 'X', 'P')이 되어 있다면 패널티 대상에서 제외
    const submittedMemberIds = new Set((submittedToday ?? []).map((r) => r.member_id));

    // 5. 미제출 회원 필터링
    const unsubmittedMembers = activeMembers.filter((m) => !submittedMemberIds.has(m.id));

    if (unsubmittedMembers.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          skipped: false,
          reason: "오늘 모든 회원이 챌린지를 제출했거나 이미 패널티 처리되었습니다.",
          penalized_count: 0,
          date: todayStr,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. 미제출 회원에게 result='X' 삽입 -> DB 트리거가 2,000원 차감
    const penaltyRecords = unsubmittedMembers.map((m) => ({
      member_id: m.id,
      challenge_date: todayStr,
      topic: "일일 AI 대화 공유 챌린지",
      submission_content: null,
      ai_feedback: "미제출 — 자동 패널티 적용 (2,000원 차감)",
      score: 0,
      result: "X",
      submitted_at: null,
    }));

    const { data: inserted, error: insertError } = await supabase
      .from("daily_challenges")
      .upsert(penaltyRecords, { onConflict: "member_id,challenge_date" })
      .select("id, member_id, result, is_deducted");

    if (insertError) throw new Error(`패널티 삽입 실패: ${insertError.message}`);

    const penalizedNames = unsubmittedMembers.map((m) => m.name);

    return new Response(
      JSON.stringify({
        success: true,
        skipped: false,
        date: todayStr,
        penalized_count: unsubmittedMembers.length,
        penalized_members: penalizedNames,
        records: inserted,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});