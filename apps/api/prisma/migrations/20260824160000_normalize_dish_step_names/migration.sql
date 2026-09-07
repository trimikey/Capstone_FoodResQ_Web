-- Chuẩn hoá tên 4 khâu bếp về đúng một bộ: Sơ chế → Nấu → Kiểm tra QC → Sẵn sàng xuất phát.
--
-- Tên khâu lưu THEO TỪNG MÓN lúc chiến dịch bắt đầu, nên các đợt đổi tên trước đây
-- (Tiếp nhận→Sơ chế, Trình bày→Kiểm tra QC) chỉ áp cho món mới — món cũ vẫn mang tên
-- cũ và hai màn chef/tổ chức hiển thị lệch nhau. Đồng bộ theo step_order vì thứ tự
-- khâu là bất biến, còn tên thì đã trôi qua nhiều phiên bản.
UPDATE campaign_dish_steps SET step_name = 'Sơ chế'             WHERE step_order = 1 AND step_name <> 'Sơ chế';
UPDATE campaign_dish_steps SET step_name = 'Nấu'                WHERE step_order = 2 AND step_name <> 'Nấu';
UPDATE campaign_dish_steps SET step_name = 'Kiểm tra QC'        WHERE step_order = 3 AND step_name <> 'Kiểm tra QC';
UPDATE campaign_dish_steps SET step_name = 'Sẵn sàng xuất phát' WHERE step_order = 4 AND step_name <> 'Sẵn sàng xuất phát';
