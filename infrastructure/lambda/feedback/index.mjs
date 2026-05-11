// ─── Feedback Lambda handler ───
// Receives feedback JSON via POST, writes to S3 bucket.
// CORS is handled by the Lambda function URL configuration (CDK).

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({});
const BUCKET = process.env.FEEDBACK_BUCKET;

export async function handler(event) {
  try {
    const body = JSON.parse(event.body || '{}');

    // Validate
    if (!body.text && !body.rating) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Feedback text or rating required.' }),
      };
    }

    // Build S3 key: feedback/YYYY-MM-DD/timestamp-random.json
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const ts = now.getTime();
    const rand = Math.random().toString(36).slice(2, 8);
    const key = `feedback/${dateStr}/${ts}-${rand}.json`;

    // Add server metadata
    body.serverTimestamp = now.toISOString();
    body.sourceIp = event.requestContext?.http?.sourceIp || 'unknown';

    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: JSON.stringify(body, null, 2),
      ContentType: 'application/json',
    }));

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, key }),
    };
  } catch (err) {
    console.error('Feedback error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error.' }),
    };
  }
}
