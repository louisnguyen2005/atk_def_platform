BEGIN;
DO $$
BEGIN
  IF (SELECT real_round FROM GameConfig WHERE id=1) <> 0
     OR (SELECT enabled FROM MekodataRoundControl WHERE id=1)
     OR EXISTS (SELECT 1 FROM TeamTasks WHERE checks <> 0)
     OR EXISTS (SELECT 1 FROM Flags)
  THEN
    RAISE EXCEPTION 'Trạng thái thi đã thay đổi: dừng lại, không chuyển thang điểm tự động.';
  END IF;
  IF (SELECT COUNT(*) FROM Tasks WHERE active) <> 1
     OR EXISTS (SELECT 1 FROM Tasks WHERE active AND (puts <> 0 OR gets <> 0))
  THEN
    RAISE EXCEPTION 'Cần đúng một dịch vụ health, không có PUT/GET.';
  END IF;
END $$;
UPDATE Tasks SET default_score=0 WHERE active;
UPDATE TeamTasks SET score=0 WHERE task_id IN (SELECT id FROM Tasks WHERE active);
COMMIT;
