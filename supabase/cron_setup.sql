-- ============================================================
-- Supabase pg_cron 설정: daily-penalty 자동 호출
-- 매일 평일(월~금) 23:59 KST = 14:59 UTC 에 실행
-- Supabase Dashboard > SQL Editor 에서 실행하세요
-- ============================================================

-- 1. pg_cron 확장 활성화 (이미 활성화된 경우 무시됨)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. net (http 호출용) 확장 활성화
CREATE EXTENSION IF NOT EXISTS http;

-- 3. 기존 cron 잡이 있으면 삭제 후 재등록
SELECT cron.unschedule('daily-penalty-weekdays')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'daily-penalty-weekdays'
);

-- 4. Cron 잡 등록
--    cron 표현식: "59 14 * * 1-5"
--      분=59, 시=14(UTC) = 23:59 KST, 매일, 매달, 월~금
--    ※ 9~12월 기간 체크는 Edge Function 내부에서 처리합니다.
SELECT cron.schedule(
  'daily-penalty-weekdays',       -- 잡 이름
  '59 14 * * 1-5',               -- 평일 23:59 KST (= UTC 14:59)
  $$
  SELECT
    net.http_post(
      url     := current_setting('app.settings.supabase_url') || '/functions/v1/daily-penalty',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body    := '{}'::jsonb
    ) AS request_id;
  $$
);

-- 5. 등록 확인
SELECT jobid, jobname, schedule, active
FROM cron.job
WHERE jobname = 'daily-penalty-weekdays';
