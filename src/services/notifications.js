import { sdk } from '@/services/sdk';

/** Create an in-app notification for a platform user. */
export async function createNotification({
  recipientUserId,
  title,
  message,
  type = 'Booking',
  actionUrl = '',
  relatedRecordId = '',
  relatedType = '',
  eventKey = '',
}) {
  if (!recipientUserId || !title || !message) {
    throw new Error('A recipient, title and message are required to create a notification.');
  }

  const payload = {
    Name: title,
    message_c: message,
    notification_type_c: type,
    is_read_c: false,
    recipient_user_c: recipientUserId,
    action_url_c: actionUrl,
    related_record_id_c: relatedRecordId,
    related_type_c: relatedType,
    event_key_c: eventKey,
  };

  const result = await sdk.table('notifications_c').create(payload);
  if (!result.data?.length) {
    throw new Error(result.messages?.[0] || result.message || 'The notification could not be saved.');
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('local-notifications-changed'));
  }
  return result.data[0];
}