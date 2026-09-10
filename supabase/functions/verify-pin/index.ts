import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // 브라우저 OPTIONS 사전 요청(Preflight) 처리
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { pin } = await req.json()
    // 방금 등록한 ADMIN_PIN 비밀 변수 읽기
    const correctPin = Deno.env.get('ADMIN_PIN')

    if (!pin || pin !== correctPin) {
      return new Response(
        JSON.stringify({ success: false, message: '올바르지 않은 PIN 번호입니다.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    return new Response(
      JSON.stringify({ success: true, message: '인증에 성공했습니다.' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})