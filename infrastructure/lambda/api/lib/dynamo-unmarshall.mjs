// Minimal DynamoDB AttributeValue → JS unmarshaller.
//
// Exists because the projector Lambda deploys UNBUNDLED (Code.fromAsset,
// no node_modules) and the runtime's built-in AWS SDK v3 does not ship
// every utility package: importing '@aws-sdk/util-dynamodb' crashed the
// function at INIT (Runtime.ImportModuleError), which silently killed the
// entire Streams pipeline — every batch failed and dead-lettered while
// the API Lambda (client packages only, which ARE bundled) worked fine.
//
// Covers the types our event-log records contain (S/N/BOOL/NULL/M/L; the
// set types and base64 binary pass through for completeness). Equivalence
// with the real @aws-sdk/util-dynamodb is pinned by unit test — the tests
// CAN use the real package, it's only the Lambda runtime that can't.

export function unmarshallImage(image) {
  const out = {};
  for (const [key, av] of Object.entries(image ?? {})) {
    out[key] = fromAttr(av);
  }
  return out;
}

function fromAttr(av) {
  if (av === null || typeof av !== 'object') {
    throw new Error('dynamo-unmarshall: not an AttributeValue');
  }
  if ('S' in av) return av.S;
  if ('N' in av) return Number(av.N);
  if ('BOOL' in av) return av.BOOL;
  if ('NULL' in av) return null;
  if ('M' in av) {
    const out = {};
    for (const [key, nested] of Object.entries(av.M)) out[key] = fromAttr(nested);
    return out;
  }
  if ('L' in av) return av.L.map(fromAttr);
  if ('SS' in av) return [...av.SS];
  if ('NS' in av) return av.NS.map(Number);
  if ('BS' in av) return [...av.BS];
  if ('B' in av) return av.B; // stream JSON carries binary as base64 — pass through
  throw new Error(`dynamo-unmarshall: unsupported AttributeValue type ${Object.keys(av).join(',')}`);
}
