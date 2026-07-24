import { type NextRequest, NextResponse } from 'next/server';
import { adminDb, verifyIdToken } from '@/lib/firebase-admin';
import webpush, { type PushSubscription } from 'web-push';
import '@/lib/web-push'; // Initializes web-push

export async function POST(req: NextRequest) {
  try {
    const user = await verifyIdToken(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const subscriptionsSnapshot = await adminDb.collection('users').doc(user.uid).collection('pushSubscriptions').get();

    if (subscriptionsSnapshot.empty) {
      return NextResponse.json({ error: 'No push subscriptions found for user' }, { status: 404 });
    }
    
    const payload = JSON.stringify({
      title: 'DayFlow Test Notification',
      body: 'If you see this, push notifications are working!',
    });

    const sendPromises = subscriptionsSnapshot.docs.map(doc => {
      const sub = doc.data() as PushSubscription;
      return webpush.sendNotification(sub, payload).catch(error => {
        // If subscription is expired or invalid, delete it
        if (error.statusCode === 404 || error.statusCode === 410) {
          console.log('Subscription has expired or is no longer valid: ', error);
          return doc.ref.delete();
        } else {
          console.error('Error sending notification:', error);
        }
      });
    });

    await Promise.all(sendPromises);

    return NextResponse.json({ success: true, message: `Sent test notification to ${subscriptionsSnapshot.size} device(s).` });
  } catch (error) {
    console.error('Error sending test push notification:', error);
    if (error instanceof Error && error.message.includes('Unauthorized')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
