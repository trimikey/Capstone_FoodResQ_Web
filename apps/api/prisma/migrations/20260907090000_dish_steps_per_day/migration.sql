-- Mỗi ngày vận hành một chuỗi 4 khâu riêng cho từng món
ALTER TABLE campaign_dish_steps ADD COLUMN work_date DATE;

-- Backfill: chuỗi khâu hiện có thuộc về NGÀY ĐẦU của chiến dịch
UPDATE campaign_dish_steps s
SET work_date = c.scheduled_date
FROM kitchen_campaigns c
WHERE s.campaign_id = c.id AND s.work_date IS NULL;

CREATE INDEX idx_campaign_dish_steps_day
  ON campaign_dish_steps(menu_item_id, work_date, step_order);
