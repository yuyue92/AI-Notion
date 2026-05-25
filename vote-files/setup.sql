-- =============================================================
-- 投票系统数据库初始化脚本
-- 在 Supabase SQL Editor 中按顺序执行
-- =============================================================

-- 1. 启用必要扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================
-- 2. 创建表结构
-- =============================================================

-- 投票主表
CREATE TABLE IF NOT EXISTS polls (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title       TEXT NOT NULL,
  description TEXT,
  allow_multiple  BOOLEAN NOT NULL DEFAULT false,
  require_login   BOOLEAN NOT NULL DEFAULT false,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at         TIMESTAMPTZ
);

-- 选项表
CREATE TABLE IF NOT EXISTS options (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  poll_id     UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  option_text TEXT NOT NULL,
  vote_count  INTEGER NOT NULL DEFAULT 0,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 投票记录表
CREATE TABLE IF NOT EXISTS votes (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  poll_id       UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  option_id     UUID NOT NULL REFERENCES options(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  anonymous_id  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- 保证同一用户/访客对同一选项只投一次
  CONSTRAINT unique_user_vote    UNIQUE NULLS NOT DISTINCT (poll_id, option_id, user_id),
  CONSTRAINT unique_anon_vote    UNIQUE NULLS NOT DISTINCT (poll_id, option_id, anonymous_id),
  -- 必须有 user_id 或 anonymous_id 其中一个
  CONSTRAINT vote_identity_check CHECK (
    user_id IS NOT NULL OR (anonymous_id IS NOT NULL AND anonymous_id != '')
  )
);

-- 投票人次汇总（每个 poll 每个身份只记录一条）
CREATE TABLE IF NOT EXISTS poll_participants (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  poll_id       UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  anonymous_id  TEXT,
  voted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_participant_user UNIQUE NULLS NOT DISTINCT (poll_id, user_id),
  CONSTRAINT unique_participant_anon UNIQUE NULLS NOT DISTINCT (poll_id, anonymous_id)
);

-- =============================================================
-- 3. 触发器：自动维护 vote_count
-- =============================================================

-- 投票后增加计数
CREATE OR REPLACE FUNCTION fn_increment_vote_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE options
  SET vote_count = vote_count + 1
  WHERE id = NEW.option_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_increment_vote_count ON votes;
CREATE TRIGGER trg_increment_vote_count
  AFTER INSERT ON votes
  FOR EACH ROW EXECUTE FUNCTION fn_increment_vote_count();

-- 删除投票时减少计数
CREATE OR REPLACE FUNCTION fn_decrement_vote_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE options
  SET vote_count = GREATEST(vote_count - 1, 0)
  WHERE id = OLD.option_id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_decrement_vote_count ON votes;
CREATE TRIGGER trg_decrement_vote_count
  AFTER DELETE ON votes
  FOR EACH ROW EXECUTE FUNCTION fn_decrement_vote_count();

-- =============================================================
-- 4. 数据库函数
-- =============================================================

-- 提交投票（事务安全，处理多选/单选限制）
CREATE OR REPLACE FUNCTION submit_vote(
  p_poll_id       UUID,
  p_option_ids    UUID[],   -- 支持多选，传入多个 option_id
  p_user_id       UUID,
  p_anonymous_id  TEXT
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_poll          polls%ROWTYPE;
  v_identity_key  TEXT;
  v_has_voted     BOOLEAN;
  v_opt_id        UUID;
BEGIN
  -- 获取投票信息
  SELECT * INTO v_poll FROM polls WHERE id = p_poll_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '投票不存在或已关闭');
  END IF;

  -- 检查是否过期
  IF v_poll.ends_at IS NOT NULL AND NOW() > v_poll.ends_at THEN
    RETURN jsonb_build_object('success', false, 'error', '投票已结束');
  END IF;

  -- 检查登录限制
  IF v_poll.require_login AND p_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '此投票需要登录才能参与');
  END IF;

  -- 检查选项数量
  IF NOT v_poll.allow_multiple AND array_length(p_option_ids, 1) > 1 THEN
    RETURN jsonb_build_object('success', false, 'error', '此投票只允许单选');
  END IF;

  -- 检查是否已投过票
  IF p_user_id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM poll_participants WHERE poll_id = p_poll_id AND user_id = p_user_id
    ) INTO v_has_voted;
  ELSE
    SELECT EXISTS(
      SELECT 1 FROM poll_participants WHERE poll_id = p_poll_id AND anonymous_id = p_anonymous_id
    ) INTO v_has_voted;
  END IF;

  IF v_has_voted THEN
    RETURN jsonb_build_object('success', false, 'error', '您已经参与过此投票');
  END IF;

  -- 插入投票记录
  FOREACH v_opt_id IN ARRAY p_option_ids LOOP
    INSERT INTO votes(poll_id, option_id, user_id, anonymous_id)
    VALUES (p_poll_id, v_opt_id, p_user_id, p_anonymous_id);
  END LOOP;

  -- 记录参与者
  INSERT INTO poll_participants(poll_id, user_id, anonymous_id)
  VALUES (p_poll_id, p_user_id, p_anonymous_id);

  RETURN jsonb_build_object('success', true);

EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('success', false, 'error', '您已经参与过此投票');
END;
$$;

-- 获取投票详情（含选项计数和总参与人数）
CREATE OR REPLACE FUNCTION get_poll_detail(p_poll_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_poll      polls%ROWTYPE;
  v_options   JSONB;
  v_total     INTEGER;
BEGIN
  SELECT * INTO v_poll FROM polls WHERE id = p_poll_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '投票不存在');
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', o.id,
      'option_text', o.option_text,
      'vote_count', o.vote_count,
      'sort_order', o.sort_order
    ) ORDER BY o.sort_order
  ) INTO v_options
  FROM options o WHERE o.poll_id = p_poll_id;

  SELECT COUNT(*) INTO v_total FROM poll_participants WHERE poll_id = p_poll_id;

  RETURN jsonb_build_object(
    'success', true,
    'poll', row_to_json(v_poll),
    'options', COALESCE(v_options, '[]'::jsonb),
    'participant_count', v_total
  );
END;
$$;

-- 检查用户是否已投票
CREATE OR REPLACE FUNCTION check_voted(
  p_poll_id      UUID,
  p_user_id      UUID,
  p_anonymous_id TEXT
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_has_voted   BOOLEAN;
  v_option_ids  JSONB;
BEGIN
  IF p_user_id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM poll_participants WHERE poll_id = p_poll_id AND user_id = p_user_id
    ) INTO v_has_voted;

    IF v_has_voted THEN
      SELECT jsonb_agg(option_id) INTO v_option_ids
      FROM votes WHERE poll_id = p_poll_id AND user_id = p_user_id;
    END IF;
  ELSE
    SELECT EXISTS(
      SELECT 1 FROM poll_participants WHERE poll_id = p_poll_id AND anonymous_id = p_anonymous_id
    ) INTO v_has_voted;

    IF v_has_voted THEN
      SELECT jsonb_agg(option_id) INTO v_option_ids
      FROM votes WHERE poll_id = p_poll_id AND anonymous_id = p_anonymous_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'has_voted', v_has_voted,
    'voted_options', COALESCE(v_option_ids, '[]'::jsonb)
  );
END;
$$;

-- =============================================================
-- 5. RLS 策略
-- =============================================================

ALTER TABLE polls     ENABLE ROW LEVEL SECURITY;
ALTER TABLE options    ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE poll_participants ENABLE ROW LEVEL SECURITY;

-- polls: 所有人可读；登录用户可创建/更新/删除自己的投票
CREATE POLICY "polls_select_all"   ON polls FOR SELECT USING (true);
CREATE POLICY "polls_insert_auth"  ON polls FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "polls_update_own"   ON polls FOR UPDATE TO authenticated USING (auth.uid() = created_by);
CREATE POLICY "polls_delete_own"   ON polls FOR DELETE TO authenticated USING (auth.uid() = created_by);

-- options: 所有人可读；登录用户可管理自己投票的选项
CREATE POLICY "options_select_all"  ON options FOR SELECT USING (true);
CREATE POLICY "options_insert_auth" ON options FOR INSERT TO authenticated
  WITH CHECK (EXISTS(SELECT 1 FROM polls WHERE id = poll_id AND created_by = auth.uid()));
CREATE POLICY "options_delete_own"  ON options FOR DELETE TO authenticated
  USING (EXISTS(SELECT 1 FROM polls WHERE id = poll_id AND created_by = auth.uid()));

-- votes: 所有人可读（用于实时同步）；通过函数插入
CREATE POLICY "votes_select_all"   ON votes FOR SELECT USING (true);
CREATE POLICY "votes_insert_all"   ON votes FOR INSERT WITH CHECK (true);

-- poll_participants: 通过函数管理
CREATE POLICY "participants_select_all"  ON poll_participants FOR SELECT USING (true);
CREATE POLICY "participants_insert_all"  ON poll_participants FOR INSERT WITH CHECK (true);

-- =============================================================
-- 6. 开启 Realtime
-- =============================================================
-- 在 Supabase Dashboard > Database > Replication 中
-- 对 votes 和 options 表启用 Realtime (INSERT, UPDATE)
-- 或执行以下命令：

ALTER PUBLICATION supabase_realtime ADD TABLE votes;
ALTER PUBLICATION supabase_realtime ADD TABLE options;
ALTER PUBLICATION supabase_realtime ADD TABLE polls;

-- =============================================================
-- 7. 示例数据（可选）
-- =============================================================
-- INSERT INTO polls (title, description, allow_multiple, require_login, created_by)
-- VALUES ('您最喜欢的编程语言是？', '选出您日常最常用的语言（可多选）', true, false, NULL);

-- ================  脚本结束  ================
