import { db } from '../../db.js';
import { userDevices } from '@lamdis/db/schema';
import { eq, and } from 'drizzle-orm';

export interface PushNotification {
  title: string;
  body: string;
  data?: Record<string, string>;
}

/**
 * Send a push notification to all devices for a user in an org.
 *
 * Currently logs the notification — replace with AWS SNS or FCM/APNS
 * when push infrastructure is configured.
 */
export async function sendPushToUser(
  orgId: string,
  userSub: string,
  notification: PushNotification,
): Promise<{ sent: number; failed: number }> {
  const devices = await db.select({
    id: userDevices.id,
    platform: userDevices.platform,
    pushToken: userDevices.pushToken,
  })
    .from(userDevices)
    .where(and(
      eq(userDevices.orgId, orgId),
      eq(userDevices.userSub, userSub),
      eq(userDevices.enabled, true),
    ));

  if (devices.length === 0) {
    return { sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;

  for (const device of devices) {
    try {
      await sendToDevice(device.platform, device.pushToken, notification);
      sent++;
    } catch (err: any) {
      console.error(`[push] Failed to send to device ${device.id}:`, err?.message);
      failed++;

      // If token is invalid, disable the device
      if (isInvalidTokenError(err)) {
        await db.update(userDevices)
          .set({ enabled: false, updatedAt: new Date() })
          .where(eq(userDevices.id, device.id));
      }
    }
  }

  return { sent, failed };
}

/**
 * Send to a specific device via platform-appropriate service.
 * TODO: Replace with real AWS SNS / FCM / APNS implementation.
 */
async function sendToDevice(
  platform: string,
  pushToken: string,
  notification: PushNotification,
): Promise<void> {
  const snsTopicArn = process.env.AWS_SNS_PUSH_TOPIC_ARN;

  if (!snsTopicArn) {
    // No push infrastructure configured — log and skip
    console.log(`[push] Would send to ${platform} device: ${notification.title}`);
    return;
  }

  // When AWS SNS is configured, publish here:
  // const sns = new SNSClient({ region: process.env.AWS_REGION });
  // await sns.send(new PublishCommand({
  //   TargetArn: pushToken, // platform endpoint ARN
  //   Message: JSON.stringify({ default: notification.body, [platform]: JSON.stringify(notification) }),
  //   MessageStructure: 'json',
  // }));
}

function isInvalidTokenError(err: any): boolean {
  // AWS SNS error for invalid endpoint
  return err?.Code === 'EndpointDisabled' || err?.Code === 'InvalidParameter';
}

/**
 * Notification trigger helpers — call these from event handlers.
 */
export async function notifyRunComplete(orgId: string, userSub: string, runId: string, status: string) {
  await sendPushToUser(orgId, userSub, {
    title: `Run ${status === 'passed' ? 'passed' : 'failed'}`,
    body: `Run ${runId.slice(0, 8)} completed with status: ${status}`,
    data: { type: 'run_complete', runId, status },
  });
}

export async function notifyInputRequest(orgId: string, userSub: string, instanceId: string, question: string) {
  await sendPushToUser(orgId, userSub, {
    title: 'Input needed',
    body: question.slice(0, 100),
    data: { type: 'input_request', instanceId },
  });
}

export async function notifyApprovalNeeded(orgId: string, userSub: string, actionId: string, description: string) {
  await sendPushToUser(orgId, userSub, {
    title: 'Approval needed',
    body: description.slice(0, 100),
    data: { type: 'approval_needed', actionId },
  });
}
