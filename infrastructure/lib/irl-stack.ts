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
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigwv2int from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as apigwv2auth from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { Construct } from 'constructs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DOMAIN_NAME = 'in-real.life';
const API_DOMAIN = `api.${DOMAIN_NAME}`;

export type Stage = 'workshop' | 'test';

export interface IrlStackProps extends cdk.StackProps {
  stage: Stage;
}

export class IrlStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: IrlStackProps) {
    super(scope, id, props);
    const { stage } = props;
    const isWorkshop = stage === 'workshop';

    // ==========================================
    // Workshop-only: Route53 + ACM
    // ==========================================

    let hostedZone: route53.PublicHostedZone | undefined;
    let certificate: acm.Certificate | undefined;

    if (isWorkshop) {
      hostedZone = new route53.PublicHostedZone(this, 'HostedZone', {
        zoneName: DOMAIN_NAME,
      });

      certificate = new acm.Certificate(this, 'SiteCertificate', {
        domainName: DOMAIN_NAME,
        subjectAlternativeNames: [`*.${DOMAIN_NAME}`],
        validation: acm.CertificateValidation.fromDns(hostedZone),
      });
    }

    // ==========================================
    // Workshop-only: static site (S3 + CloudFront)
    // ==========================================

    if (isWorkshop) {
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
        domainNames: [DOMAIN_NAME],
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

      new s3deploy.BucketDeployment(this, 'DeploySite', {
        sources: [s3deploy.Source.asset(path.join(__dirname, '../../src'))],
        destinationBucket: siteBucket,
        distribution,
        distributionPaths: ['/*'],
      });

      new cdk.CfnOutput(this, 'SiteUrl', {
        value: `https://${DOMAIN_NAME}`,
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
    // Workshop-only: feedback bucket + Lambda
    // ==========================================

    let feedbackBucket: s3.Bucket | undefined;

    if (isWorkshop) {
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
    // Workshop-only: API custom domain (api.in-real.life)
    // ==========================================

    if (isWorkshop) {
      const apiDomainName = new apigwv2.DomainName(this, 'ApiDomain', {
        domainName: API_DOMAIN,
        certificate: certificate!,
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
      value: isWorkshop ? `https://${API_DOMAIN}` : httpApi.apiEndpoint,
      description: 'API URL (custom domain in workshop, raw API Gateway in test)',
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
