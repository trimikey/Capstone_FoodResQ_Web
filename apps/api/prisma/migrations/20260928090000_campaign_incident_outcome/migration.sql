-- Sự cố chiến dịch: shipper cho biết còn tiếp tục được không, và tổ chức đã xử lý bằng cách nào.
ALTER TABLE campaign_incidents ADD COLUMN IF NOT EXISTS can_continue BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE campaign_incidents ADD COLUMN IF NOT EXISTS delay_minutes SMALLINT;
-- 'continued' | 'reassigned' | 'resolved' — cách tổ chức khép sự cố.
ALTER TABLE campaign_incidents ADD COLUMN IF NOT EXISTS action_taken VARCHAR(30);
