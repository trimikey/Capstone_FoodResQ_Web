-- Thống nhất tên khâu 3 của quy trình bếp: "Trình bày" -> "Kiểm tra QC".
--
-- Tên cũ gây lệch giữa các màn hình: chef thấy "QC kiểm tra", tổ chức thấy
-- "Trình bày" (đọc từ DB), trong khi bản chất khâu này là chụp ảnh QC để tổ chức
-- duyệt. FIXED_DISH_STEPS trong code đã đổi; dòng đã sinh sẵn phải đổi theo.
UPDATE campaign_dish_steps SET step_name = 'Kiểm tra QC'
WHERE step_order = 3 AND step_name = 'Trình bày';
