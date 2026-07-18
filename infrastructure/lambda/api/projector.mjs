// IRL Streams projector Lambda — composition root.
//
// The async read-side counterpart to index.mjs: consumes the irl-events-log
// DynamoDB stream and maintains derived stores (today: irl-user-model per
// docs/projection-store.md). Wiring only — behaviour lives in projector/.

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
// NOT @aws-sdk/util-dynamodb: this Lambda deploys unbundled and the
// runtime's built-in SDK doesn't ship that util package — importing it
// crashed the function at INIT and dead-lettered every stream batch
// (see lib/dynamo-unmarshall.mjs).
import { unmarshallImage } from './lib/dynamo-unmarshall.mjs';
import { createKeyStore } from './lib/key-store.mjs';
import { createUserModelProjector } from './projector/user-model.mjs';
import { createStreamHandler } from './projector/stream-handler.mjs';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const keyStore = createKeyStore({
  client,
  keysTable: process.env.USER_KEYS_TABLE,
});

const userModelProjector = createUserModelProjector({
  client,
  userModelTable: process.env.USER_MODEL_TABLE,
  keyStore,
});

export const handler = createStreamHandler({
  projectors: [userModelProjector],
  unmarshall: unmarshallImage,
});
