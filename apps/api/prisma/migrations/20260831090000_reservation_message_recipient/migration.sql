-- Tách chat theo đơn thành hội thoại 1-1: mỗi tin nhắn có người nhận cụ thể
ALTER TABLE reservation_messages
  ADD COLUMN recipient_user_id UUID REFERENCES users(id) ON DELETE CASCADE;

-- Backfill tin cũ (thời còn phòng chung 2 bên): người nhận tin = bên còn lại
UPDATE reservation_messages m
SET recipient_user_id = CASE
  WHEN m.sender_user_id = rp.user_id THEN pp.user_id
  ELSE rp.user_id
END
FROM reservations r
JOIN receiver_profiles rp ON rp.id = r.receiver_id
JOIN food_listings fl ON fl.id = r.listing_id
JOIN provider_profiles pp ON pp.id = fl.provider_id
WHERE m.reservation_id = r.id AND m.recipient_user_id IS NULL;

ALTER TABLE reservation_messages ALTER COLUMN recipient_user_id SET NOT NULL;

CREATE INDEX idx_reservation_messages_pair
  ON reservation_messages(reservation_id, sender_user_id, recipient_user_id);
