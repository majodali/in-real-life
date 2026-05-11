// ─── App configuration ───
//
// Frontend is currently served from https://in-real.life and targets the
// workshop stack. Values below come from the IrlStack CDK outputs. When we
// deploy a separate prod stack, this file gets a per-environment build or
// runtime config-loader.

export const API_BASE_URL = 'https://api.in-real.life';

export const COGNITO_REGION = 'us-east-1';
export const COGNITO_USER_POOL_ID = 'us-east-1_qvoTBZvsh';
export const COGNITO_USER_POOL_CLIENT_ID = '5mnkcdqqleb69sl83vqj2civhj';

// Feedback API endpoint (separate Lambda function URL — predates the API).
export const FEEDBACK_URL = 'https://mkbdyhlfeojsi7b5xmmhyinzha0uibnc.lambda-url.us-east-1.on.aws/';
