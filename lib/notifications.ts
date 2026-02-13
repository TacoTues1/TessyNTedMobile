import { supabase } from './supabase';

export type NotificationType =
  | 'payment'
  | 'payment_confirmed'
  | 'maintenance'
  | 'application'
  | 'application_status'
  | 'message'
  | 'booking_request'
  | 'booking_approved'
  | 'booking_rejected'
  | string; // fallback for any future types

export async function createNotification(
  recipientId: string,
  type: NotificationType,
  message: string,
  extras: Record<string, any> = {},
) {
  try {
    const payload = {
      recipient: recipientId,
      type,
      message,
      read: false,
      ...extras,
    };

    const { data, error } = await supabase
      .from('notifications')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.log('Notification insert error:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.log('Notification creation failed:', err);
    return null;
  }
}


