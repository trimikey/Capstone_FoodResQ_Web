-- Khoảng đệm tuyển (giờ từ lúc đóng tuyển tới ca đầu) trước đây bị ép 6–48 giờ ở DB.
-- Ngưỡng tối thiểu thật sự giờ do admin cấu hình (CAMPAIGN_RECRUITMENT_CLOSE_LEAD_MINUTES,
-- cho phép 0) và chiến dịch được tạo cho HÔM NAY, nên đệm dưới 6 giờ là hợp lệ —
-- ràng buộc cũ làm INSERT nổ 500. Chỉ còn giữ chặn giá trị vô lý (âm / quá 48).
ALTER TABLE "kitchen_campaigns" DROP CONSTRAINT IF EXISTS "campaign_recruitment_buffer_valid";
ALTER TABLE "kitchen_campaigns" ADD CONSTRAINT "campaign_recruitment_buffer_valid"
  CHECK ("recruitment_buffer_hours" BETWEEN 0 AND 48);
