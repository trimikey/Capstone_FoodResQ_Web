-- Unique cũ (campaign, món, khâu) chặn mô hình mỗi-ngày-một-chuỗi-khâu:
-- sinh khâu cho ngày 2 của chiến dịch nhiều ngày là vi phạm ngay → 500.
DROP INDEX IF EXISTS campaign_dish_steps_campaign_id_menu_item_id_step_order_key;

-- Unique mới: mỗi (món, NGÀY, khâu) đúng một bản ghi
CREATE UNIQUE INDEX campaign_dish_steps_menu_item_id_work_date_step_order_key
  ON campaign_dish_steps(menu_item_id, work_date, step_order);
