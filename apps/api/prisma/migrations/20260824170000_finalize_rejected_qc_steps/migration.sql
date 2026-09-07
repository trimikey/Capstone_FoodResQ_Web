-- Chốt trạng thái các món đã bị từ chối QC theo LUẬT CŨ.
--
-- Luật cũ: từ chối trả khâu 3 về 'available' cho chef chụp lại. Luật mới: từ chối =
-- huỷ món, khâu 3 giữ 'done' + review_status='rejected' làm trạng thái cuối. Dòng dữ
-- liệu sinh ra trong giai đoạn giao thời (reviewed bởi server cũ) đang ở thế lửng:
-- rejected nhưng khâu 3 vẫn mở, chef bấm "Kiểm tra & xác nhận" được — đưa về đúng thế cuối.
UPDATE campaign_dish_steps
SET status = 'done'
WHERE step_order = 3
  AND review_status = 'rejected'
  AND status <> 'done';
