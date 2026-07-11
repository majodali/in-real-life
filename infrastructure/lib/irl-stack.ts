import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as logs from 'aws-cdk-lib/aws-logs';
import { DynamoEventSource, SqsDlq } from 'aws-cdk-lib/aws-lambda-event-sources';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigwv2int from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as apigwv2auth from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { Construct } from 'constructs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Stages drive feature-flag behaviour:
//   'prod'      → mode=production in Lambda; workshop-only routes excluded
//   'workshop'  → mode=workshop; time controls + admin scaffolding enabled
//   'test'      → backend-only; same workshop scaffolding for functional tests
// Stage names beyond these three (e.g. 'workshop-bainbridge') are treated as
// workshop variants.
export type Stage = string;

export interface IrlStackProps extends cdk.StackProps {
  stage: Stage;
  // Custom domain configuration. When set, the stack provisions a hosted
  // zone, ACM certificate, CloudFront distribution, and an api.<apex>
  // mapping for the HTTP API. Leave undefined for backend-only deployments
  // (e.g. test) or environments that publish under the raw API Gateway URL.
  domain?: {
    apex: string;  // e.g. 'in-real.life' — site served from here, API at api.<apex>
  };
  // Deploy the static site bucket + CloudFront + DNS record. Defaults to
  // true when domain is set, false otherwise. Useful to override when you
  // want a backend-only stack that still has a custom API domain (rare).
  deploySite?: boolean;
}

export class IrlStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: IrlStackProps) {
    super(scope, id, props);
    const { stage, domain } = props;
    const deploySite = props.deploySite ?? domain !== undefined;
    // "workshop scaffolding" = the workshop-time + admin-time-control routes.
    // Test stacks include them too so functional tests can advance the clock.
    const isWorkshop = stage !== 'prod';
    const apiDomain = domain ? `api.${domain.apex}` : undefined;

    // ==========================================
    // Workshop-only: Route53 + ACM
    // ==========================================

    let hostedZone: route53.PublicHostedZone | undefined;
    let certificate: acm.Certificate | undefined;

    if (deploySite && domain) {
      hostedZone = new route53.PublicHostedZone(this, 'HostedZone', {
        zoneName: domain.apex,
      });

      certificate = new acm.Certificate(this, 'SiteCertificate', {
        domainName: domain.apex,
        subjectAlternativeNames: [`*.${domain.apex}`],
        validation: acm.CertificateValidation.fromDns(hostedZone),
      });
    }

    // ==========================================
    // Static site (S3 + CloudFront) — gated by deploySite
    // ==========================================

    if (deploySite && domain) {
      const siteBucket = new s3.Bucket(this, 'SiteBucket', {
        bucketName: `irl-dev-${this.account}`,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        autoDeleteObjects: true,
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      });

      const oac = new cloudfront.S3OriginAccessControl(this, 'SiteOAC', {
        signing: cloudfront.Signing.SIGV4_ALWAYS,
      });

      const distribution = new cloudfront.Distribution(this, 'Distribution', {
        defaultBehavior: {
          origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket, {
            originAccessControl: oac,
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        },
        defaultRootObject: 'index.html',
        domainNames: [domain.apex],
        certificate: certificate!,
        errorResponses: [
          {
            httpStatus: 404,
            responsePagePath: '/index.html',
            responseHttpStatus: 200,
            ttl: cdk.Duration.seconds(0),
          },
        ],
      });

      new route53.ARecord(this, 'SiteAliasRecord', {
        zone: hostedZone!,
        target: route53.RecordTarget.fromAlias(
          new route53Targets.CloudFrontTarget(distribution),
        ),
      });

      // Frontend deployment is split. CDK handles static assets that
      // don't depend on runtime config. inject-config.mjs owns the
      // runtime-config pair:
      //   - app.html: contains the inline window.__IRL_CONFIG__ block
      //     with __IRL_*__ placeholders for substitution.
      //   - js/config.js: reads window.__IRL_CONFIG__ at module-load
      //     time and throws if it's missing.
      // Both must travel together — if CDK pushed one without the
      // other, the site would startup-crash. Excluding both here means
      // `cdk deploy` is always safe to run on its own; inject-config.mjs
      // is the only thing that touches the coupled pair.
      // prune:false stops CDK from deleting files it doesn't know about
      // (including app.html and config.js as uploaded by inject-config).
      // retainOnDelete:true means we can later remove this resource
      // without losing bucket contents.
      new s3deploy.BucketDeployment(this, 'DeploySite', {
        sources: [s3deploy.Source.asset(path.join(__dirname, '../../src'), {
          exclude: ['app.html', 'js/config.js', '**/*.test.mjs'],
        })],
        destinationBucket: siteBucket,
        prune: false,
        retainOnDelete: true,
      });

      new cdk.CfnOutput(this, 'SiteUrl', {
        value: `https://${domain.apex}`,
        description: 'Site URL',
      });
      new cdk.CfnOutput(this, 'CloudFrontUrl', {
        value: `https://${distribution.distributionDomainName}`,
        description: 'CloudFront URL (direct)',
      });
      new cdk.CfnOutput(this, 'BucketName', {
        value: siteBucket.bucketName,
        description: 'S3 bucket for site content',
      });
      new cdk.CfnOutput(this, 'DistributionId', {
        value: distribution.distributionId,
        description: 'CloudFront distribution ID (for invalidation)',
      });
      new cdk.CfnOutput(this, 'NameServers', {
        value: cdk.Fn.join(', ', hostedZone!.hostedZoneNameServers!),
        description: 'Set these as nameservers in GoDaddy',
      });
    }

    // ==========================================
    // Feedback bucket + Lambda — gated by deploySite (same scope as site)
    // ==========================================

    let feedbackBucket: s3.Bucket | undefined;

    if (deploySite) {
      feedbackBucket = new s3.Bucket(this, 'FeedbackBucket', {
        bucketName: `irl-feedback-${this.account}`,
        removalPolicy: cdk.RemovalPolicy.RETAIN,
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      });

      const feedbackFn = new lambda.Function(this, 'FeedbackFn', {
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: 'index.handler',
        code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/feedback')),
        environment: {
          FEEDBACK_BUCKET: feedbackBucket.bucketName,
        },
        timeout: cdk.Duration.seconds(10),
        memorySize: 128,
      });

      feedbackBucket.grantWrite(feedbackFn);

      const feedbackUrl = feedbackFn.addFunctionUrl({
        authType: lambda.FunctionUrlAuthType.NONE,
        cors: {
          allowedOrigins: ['*'],
          allowedMethods: [lambda.HttpMethod.POST],
          allowedHeaders: ['Content-Type'],
        },
      });

      new cdk.CfnOutput(this, 'FeedbackUrl', {
        value: feedbackUrl.url,
        description: 'Feedback Lambda function URL',
      });
    }

    // ==========================================
    // Per-stage: DynamoDB tables
    // ==========================================

    const usersTable = new dynamodb.Table(this, 'UsersTable', {
      tableName: `irl-users-${stage}`,
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    usersTable.addGlobalSecondaryIndex({
      indexName: 'email-index',
      partitionKey: { name: 'email', type: dynamodb.AttributeType.STRING },
    });

    const eventsTable = new dynamodb.Table(this, 'EventsTable', {
      tableName: `irl-events-${stage}`,
      partitionKey: { name: 'eventId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    eventsTable.addGlobalSecondaryIndex({
      indexName: 'tab-date-index',
      partitionKey: { name: 'tab', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'date', type: dynamodb.AttributeType.STRING },
    });

    const interactionsTable = new dynamodb.Table(this, 'InteractionsTable', {
      tableName: `irl-interactions-${stage}`,
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'eventId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    interactionsTable.addGlobalSecondaryIndex({
      indexName: 'event-user-index',
      partitionKey: { name: 'eventId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
    });

    // Suggestions on proposed events. eventId partition so all suggestions
    // for a single event are one Query. suggestionId is a ULID so it sorts
    // by creation time within the event.
    const suggestionsTable = new dynamodb.Table(this, 'SuggestionsTable', {
      tableName: `irl-suggestions-${stage}`,
      partitionKey: { name: 'eventId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'suggestionId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Per-user votes on suggestions. userId partition lets us fetch
    // "what did I vote on?" for an event in one query — same shape as
    // interactions so the frontend can merge myVote into the suggestion
    // list without N+1.
    const suggestionVotesTable = new dynamodb.Table(this, 'SuggestionVotesTable', {
      tableName: `irl-suggestion-votes-${stage}`,
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'suggestionId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Organizer-created polls on a proposed event. Same shape as the
    // suggestions table (pk eventId, sk pollId) so "all polls for event"
    // is a single Query.
    const pollsTable = new dynamodb.Table(this, 'PollsTable', {
      tableName: `irl-polls-${stage}`,
      partitionKey: { name: 'eventId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'pollId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const pollVotesTable = new dynamodb.Table(this, 'PollVotesTable', {
      tableName: `irl-poll-votes-${stage}`,
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'pollId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const configTable = new dynamodb.Table(this, 'ConfigTable', {
      tableName: `irl-config-${stage}`,
      partitionKey: { name: 'configKey', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Append-only event log. Streams enabled day-one so async consumers
    // (AI analysis, search index) can attach later without backfill.
    const eventsLogTable = new dynamodb.Table(this, 'EventsLogTable', {
      tableName: `irl-events-log-${stage}`,
      partitionKey: { name: 'aggregateId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'seq', type: dynamodb.AttributeType.NUMBER },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
    });

    eventsLogTable.addGlobalSecondaryIndex({
      indexName: 'events-by-time-bucket',
      partitionKey: { name: 'bucket', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'wallTime', type: dynamodb.AttributeType.STRING },
    });

    // Command idempotency dedup table; native DynamoDB TTL on `ttl` attribute.
    const commandsTable = new dynamodb.Table(this, 'CommandsTable', {
      tableName: `irl-commands-${stage}`,
      partitionKey: { name: 'commandId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      timeToLiveAttribute: 'ttl',
    });

    // Crypto-shred keys: one AES key per aggregate. Deleting a row makes
    // that aggregate's PII in the (immutable) event log permanently
    // undecryptable. Point-in-time recovery is DELIBERATELY OFF — a
    // restorable backup of this table would defeat the shred. Do not
    // enable PITR or add this table to any backup plan.
    const userKeysTable = new dynamodb.Table(this, 'UserKeysTable', {
      tableName: `irl-user-keys-${stage}`,
      partitionKey: { name: 'aggregateId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: false },
    });

    // Derived user-model read store (docs/projection-store.md, D36).
    // PK userId, SK typed (profile#core, interest#{tag}, …). Written only
    // by the async Streams projector; fully rebuildable by replaying the
    // event log, so DESTROY is safe.
    const userModelTable = new dynamodb.Table(this, 'UserModelTable', {
      tableName: `irl-user-model-${stage}`,
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ==========================================
    // Per-stage: Cognito User Pool
    // ==========================================

    const userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `irl-user-pool-${stage}`,
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: false },
      },
      customAttributes: {
        role: new cognito.StringAttribute({ mutable: true }),
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: false,
        requireUppercase: false,
        requireDigits: false,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool,
      userPoolClientName: `irl-web-client-${stage}`,
      authFlows: {
        userSrp: true,
        userPassword: true,
        adminUserPassword: true,
      },
      generateSecret: false,
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
    });

    // ==========================================
    // Per-stage: Secrets Manager — Claude API key
    // ==========================================

    const claudeApiKeySecret = new secretsmanager.Secret(this, 'ClaudeApiKey', {
      secretName: `irl/${stage}/claude-api-key`,
      description: `Anthropic Claude API key for IRL ${stage}`,
    });

    // ==========================================
    // Per-stage: API Lambda
    // ==========================================

    const apiEnvironment: { [key: string]: string } = {
      USERS_TABLE: usersTable.tableName,
      EVENTS_TABLE: eventsTable.tableName,
      INTERACTIONS_TABLE: interactionsTable.tableName,
      SUGGESTIONS_TABLE: suggestionsTable.tableName,
      SUGGESTION_VOTES_TABLE: suggestionVotesTable.tableName,
      POLLS_TABLE: pollsTable.tableName,
      POLL_VOTES_TABLE: pollVotesTable.tableName,
      CONFIG_TABLE: configTable.tableName,
      EVENTS_LOG_TABLE: eventsLogTable.tableName,
      COMMANDS_TABLE: commandsTable.tableName,
      USER_KEYS_TABLE: userKeysTable.tableName,
      CLAUDE_API_KEY_SECRET_ARN: claudeApiKeySecret.secretArn,
      COGNITO_USER_POOL_ID: userPool.userPoolId,
      STAGE: stage,
    };
    if (feedbackBucket) {
      apiEnvironment.FEEDBACK_BUCKET = feedbackBucket.bucketName;
    }

    const apiFn = new lambda.Function(this, 'ApiFn', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/api'), {
        exclude: ['**/*.test.mjs'],
      }),
      environment: apiEnvironment,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      tracing: lambda.Tracing.ACTIVE,
    });

    usersTable.grantReadWriteData(apiFn);
    eventsTable.grantReadWriteData(apiFn);
    interactionsTable.grantReadWriteData(apiFn);
    suggestionsTable.grantReadWriteData(apiFn);
    suggestionVotesTable.grantReadWriteData(apiFn);
    pollsTable.grantReadWriteData(apiFn);
    pollVotesTable.grantReadWriteData(apiFn);
    configTable.grantReadWriteData(apiFn);
    eventsLogTable.grantReadWriteData(apiFn);
    commandsTable.grantReadWriteData(apiFn);
    userKeysTable.grantReadWriteData(apiFn);
    if (feedbackBucket) {
      feedbackBucket.grantRead(apiFn);
    }
    claudeApiKeySecret.grantRead(apiFn);

    apiFn.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'cognito-idp:AdminCreateUser',
        'cognito-idp:AdminUpdateUserAttributes',
        'cognito-idp:AdminGetUser',
        'cognito-idp:AdminDeleteUser',
        'cognito-idp:ListUsers',
      ],
      resources: [userPool.userPoolArn],
    }));

    // ==========================================
    // Per-stage: user-model Streams projector
    // ==========================================

    // First async consumer of the event-log stream (docs/projection-store.md).
    // Same code asset as the API Lambda so it shares lib/ (crypto-shred,
    // key store); a different handler entry point keeps the roles separate.

    const projectorDlq = new sqs.Queue(this, 'UserModelProjectorDlq', {
      retentionPeriod: cdk.Duration.days(14),
    });

    const projectorFn = new lambda.Function(this, 'UserModelProjectorFn', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'projector.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/api'), {
        exclude: ['**/*.test.mjs'],
      }),
      environment: {
        USER_MODEL_TABLE: userModelTable.tableName,
        USER_KEYS_TABLE: userKeysTable.tableName,
        STAGE: stage,
      },
      timeout: cdk.Duration.seconds(60),
      memorySize: 256,
      tracing: lambda.Tracing.ACTIVE,
    });

    userModelTable.grantReadWriteData(projectorFn);
    userKeysTable.grantReadData(projectorFn);

    // INSERT-only filter: the log is append-only, so MODIFY/REMOVE are
    // operational noise. Poison events retry with bisection, then land in
    // the DLQ instead of blocking the shard (projection-store.md open
    // question, answered conservatively).
    projectorFn.addEventSource(new DynamoEventSource(eventsLogTable, {
      startingPosition: lambda.StartingPosition.TRIM_HORIZON,
      batchSize: 25,
      bisectBatchOnError: true,
      retryAttempts: 10,
      reportBatchItemFailures: true,
      onFailure: new SqsDlq(projectorDlq),
      filters: [lambda.FilterCriteria.filter({
        eventName: lambda.FilterRule.isEqual('INSERT'),
      })],
    }));

    // ==========================================
    // Per-stage: HTTP API Gateway
    // ==========================================

    const httpApi = new apigwv2.HttpApi(this, 'HttpApi', {
      apiName: `irl-api-${stage}`,
      corsPreflight: {
        allowOrigins: ['*'],
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.PUT,
          apigwv2.CorsHttpMethod.DELETE,
          apigwv2.CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ['Content-Type', 'Authorization'],
        maxAge: cdk.Duration.hours(1),
      },
    });

    // HTTP APIs (v2) don't support X-Ray stage tracing — that's REST-only —
    // so the trace root is the Lambda function segment. The stage's
    // contribution to observability is structured JSON access logs: one
    // line per request with latency split (gateway vs integration) and the
    // requestId for correlation with the Lambda's per-command log line.
    const accessLogGroup = new logs.LogGroup(this, 'HttpApiAccessLogs', {
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const defaultStage = httpApi.defaultStage!.node.defaultChild as apigwv2.CfnStage;
    defaultStage.accessLogSettings = {
      destinationArn: accessLogGroup.logGroupArn,
      format: JSON.stringify({
        requestId: '$context.requestId',
        requestTime: '$context.requestTime',
        httpMethod: '$context.httpMethod',
        routeKey: '$context.routeKey',
        path: '$context.path',
        status: '$context.status',
        responseLatency: '$context.responseLatency',
        integrationLatency: '$context.integrationLatency',
        integrationErrorMessage: '$context.integrationErrorMessage',
        errorMessage: '$context.error.message',
        ip: '$context.identity.sourceIp',
        userAgent: '$context.identity.userAgent',
      }),
    };

    const jwtAuthorizer = new apigwv2auth.HttpJwtAuthorizer('JwtAuthorizer', `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}`, {
      jwtAudience: [userPoolClient.userPoolClientId],
    });

    const lambdaIntegration = new apigwv2int.HttpLambdaIntegration('ApiIntegration', apiFn);

    httpApi.addRoutes({
      path: '/health',
      methods: [apigwv2.HttpMethod.GET],
      integration: lambdaIntegration,
    });

    // Public (no JWT): sign-up gate checks supported area, and unsupported
    // visitors leave their email for the notify list.
    httpApi.addRoutes({
      path: '/locality/check',
      methods: [apigwv2.HttpMethod.GET],
      integration: lambdaIntegration,
    });

    httpApi.addRoutes({
      path: '/notify',
      methods: [apigwv2.HttpMethod.POST],
      integration: lambdaIntegration,
    });

    httpApi.addRoutes({
      path: '/{proxy+}',
      methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST, apigwv2.HttpMethod.PUT, apigwv2.HttpMethod.DELETE],
      integration: lambdaIntegration,
      authorizer: jwtAuthorizer,
    });

    // ==========================================
    // API custom domain (api.<apex>) — only when domain is configured
    // ==========================================

    if (apiDomain && certificate) {
      const apiDomainName = new apigwv2.DomainName(this, 'ApiDomain', {
        domainName: apiDomain,
        certificate,
      });

      new apigwv2.ApiMapping(this, 'ApiMapping', {
        api: httpApi,
        domainName: apiDomainName,
      });

      new route53.ARecord(this, 'ApiAliasRecord', {
        zone: hostedZone!,
        recordName: 'api',
        target: route53.RecordTarget.fromAlias(
          new route53Targets.ApiGatewayv2DomainProperties(
            apiDomainName.regionalDomainName,
            apiDomainName.regionalHostedZoneId,
          ),
        ),
      });
    }

    // ==========================================
    // Per-stage outputs
    // ==========================================

    new cdk.CfnOutput(this, 'Stage', {
      value: stage,
      description: 'Deployment stage',
    });

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: apiDomain ? `https://${apiDomain}` : httpApi.apiEndpoint,
      description: 'API URL (custom domain when configured, raw API Gateway otherwise)',
    });

    new cdk.CfnOutput(this, 'ApiGatewayUrl', {
      value: httpApi.apiEndpoint,
      description: 'API Gateway URL (direct)',
    });

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: userPool.userPoolId,
      description: 'Cognito User Pool ID',
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
    });
  }
}
