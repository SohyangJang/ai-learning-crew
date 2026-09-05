-- ====================================================================
-- AI Learning Crew - Test Seed Data
-- Standard Supabase Seed File (supabase/seed.sql)
-- ====================================================================

-- 1. Insert Test Members with predictable UUIDs for easy API testing
INSERT INTO members (id, name, email, balance, fail_count, is_active)
VALUES
    (
        '00000000-0000-0000-0000-000000000001',
        '김코딩 (Kim Coding)',
        'coding.kim@example.com',
        100000,
        0,
        true
    ),
    (
        '00000000-0000-0000-0000-000000000002',
        '이디비 (Lee DB)',
        'db.lee@example.com',
        98000,
        1,
        true
    ),
    (
        '00000000-0000-0000-0000-000000000003',
        '박인공 (Park AI)',
        'ai.park@example.com',
        100000,
        0,
        true
    )
ON CONFLICT (id) DO UPDATE
SET
    name = EXCLUDED.name,
    email = EXCLUDED.email,
    balance = EXCLUDED.balance,
    fail_count = EXCLUDED.fail_count,
    is_active = EXCLUDED.is_active;

-- 2. Insert Sample Past Daily Challenges
-- Note: 'is_deducted = true' for historical failed challenges to avoid re-triggering penalty deductions on seed.
INSERT INTO daily_challenges (
    id,
    member_id,
    challenge_date,
    topic,
    submission_content,
    ai_feedback,
    score,
    result,
    is_deducted,
    submitted_at
)
VALUES
    -- [Member 1] Yesterday's Successful Submission ('O')
    (
        '10000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000001',
        CURRENT_DATE - INTERVAL '1 day',
        'Python 리스트 컴프리헨션 및 딕셔너리 실습',
        '오늘은 리스트 컴프리헨션 기초 문법과 다중 루프 처리 예제를 직접 작성해보았습니다. 딕셔너리와 세트 컴프리헨션의 차이점도 코드 주석으로 정리했습니다.',
        '개념 이해도가 높고 다양한 예제를 성실히 직접 작성했습니다. 합격입니다!',
        95,
        'O',
        false,
        NOW() - INTERVAL '1 day 2 hours'
    ),
    -- [Member 2] Yesterday's Failed Submission ('X' - Already deducted historical record)
    (
        '10000000-0000-0000-0000-000000000002',
        '00000000-0000-0000-0000-000000000002',
        CURRENT_DATE - INTERVAL '1 day',
        'PostgreSQL 인덱스 튜닝 원리 이해',
        '공부했음. 책 읽음.',
        '제출 내용이 너무 부실하여 실제 학습 및 실습 여부를 검증할 수 없습니다. 불합격 처리되었습니다.',
        30,
        'X',
        true, -- Historical deduction already applied
        NOW() - INTERVAL '1 day 4 hours'
    ),
    -- [Member 3] 2 Days Ago Successful Image Submission ('O')
    (
        '10000000-0000-0000-0000-000000000003',
        '00000000-0000-0000-0000-000000000003',
        CURRENT_DATE - INTERVAL '2 days',
        'LeetCode 알고리즘 문제 풀이',
        '[인증 이미지 첨부]: Two Sum 문제 성공 캡처 화면 첨부 완료',
        '테스트 케이스 통과 화면 및 실행 시간 최적화가 잘 나타나 있습니다.',
        100,
        'O',
        false,
        NOW() - INTERVAL '2 days 1 hour'
    )
ON CONFLICT (id) DO UPDATE
SET
    topic = EXCLUDED.topic,
    submission_content = EXCLUDED.submission_content,
    ai_feedback = EXCLUDED.ai_feedback,
    score = EXCLUDED.score,
    result = EXCLUDED.result,
    is_deducted = EXCLUDED.is_deducted;
