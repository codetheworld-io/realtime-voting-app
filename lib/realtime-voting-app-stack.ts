import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

import * as iam from 'aws-cdk-lib/aws-iam';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrationsv2 from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { NodejsFunction, NodejsFunctionProps } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as path from 'path';

import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import { NagSuppressions } from 'cdk-nag';

export class RealtimeVotingAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const votesTable = new dynamodb.Table(this, 'VotesTable', {
      partitionKey: { name: 'topicId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // dev only
    });

    const connectionsTable = new dynamodb.Table(this, 'ConnectionsTable', {
      partitionKey: {
        name: 'connectionId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // dev only
    });

    const functionDefaultOptions: NodejsFunctionProps = {
      runtime: lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.seconds(15),
      memorySize: 128,
      handler: 'handler',
      bundling: {
        minify: true,
        sourceMap: true,
      },
    };
    const voteFunction = new NodejsFunction(this, 'VoteFunction', {
      ...functionDefaultOptions,
      entry: path.join(__dirname, '..', 'src', 'lambdas', 'vote.ts'),
      environment: {
        VOTES_TABLE: votesTable.tableName,
        CONNECTIONS_TABLE: connectionsTable.tableName,
      },
    });

    const wsConnectFunction = new NodejsFunction(this, 'WsConnectFunction', {
      ...functionDefaultOptions,
      entry: path.join(__dirname, '..', 'src', 'lambdas', 'ws-connect.ts'),
      environment: {
        VOTES_TABLE: votesTable.tableName,
        CONNECTIONS_TABLE: connectionsTable.tableName,
      },
    });

    const wsDisconnectFunction = new NodejsFunction(this, 'WsDisconnectFunction', {
      ...functionDefaultOptions,
      entry: path.join(__dirname, '..', 'src', 'lambdas', 'ws-disconnect.ts'),
      environment: {
        CONNECTIONS_TABLE: connectionsTable.tableName,
      },
    });

    const wsBroadcastFunction = new NodejsFunction(this, 'WsBroadcastFunction', {
      ...functionDefaultOptions,
      entry: path.join(__dirname, '..', 'src', 'lambdas', 'ws-broadcast.ts'),
      handler: 'handler',
      environment: {
        CONNECTIONS_TABLE: connectionsTable.tableName,
      },
    });

    votesTable.grantReadWriteData(voteFunction);

    connectionsTable.grantReadWriteData(wsConnectFunction);
    connectionsTable.grantReadWriteData(wsDisconnectFunction);
    connectionsTable.grantReadWriteData(wsBroadcastFunction);
    connectionsTable.grantReadWriteData(voteFunction);

    const restApi = new apigw.RestApi(this, 'VotingRestApi', {
      restApiName: 'VotingService',
      deployOptions: {
        stageName: 'dev',
        throttlingRateLimit: 3,
        throttlingBurstLimit: 5,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigw.Cors.ALL_ORIGINS,
        allowMethods: apigw.Cors.ALL_METHODS,
      },
    });
    const apiRoot = restApi.root.addResource('api');
    const votesResource = apiRoot.addResource('votes');
    votesResource.addMethod(
      'POST',
      new apigw.LambdaIntegration(voteFunction, { allowTestInvoke: false }),
    );

    const wsApi = new apigwv2.WebSocketApi(this, 'VotingWebSocketApi', {
      routeSelectionExpression: '$request.body.action',
      connectRouteOptions: {
        integration: new integrationsv2.WebSocketLambdaIntegration('ConnectIntegration', wsConnectFunction),
      },
      disconnectRouteOptions: {
        integration: new integrationsv2.WebSocketLambdaIntegration('DisconnectIntegration', wsDisconnectFunction),
      },
      defaultRouteOptions: {
        integration: new integrationsv2.WebSocketLambdaIntegration('DefaultIntegration', wsBroadcastFunction),
      },
    });
    const wsStage = new apigwv2.WebSocketStage(this, 'WebSocketStage', {
      webSocketApi: wsApi,
      stageName: 'dev',
      autoDeploy: true,
      throttle: {
        rateLimit: 3,
        burstLimit: 5,
      },
    });
    const wsApiArn = cdk.Stack.of(this).formatArn({
      service: 'execute-api',
      resource: wsApi.apiId,
    });
    voteFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['execute-api:ManageConnections'],
        resources: [`${wsApiArn}/*`],
      }),
    );
    voteFunction.addEnvironment('APIGW_ENDPOINT', wsStage.url.replace('wss://', 'https://'));

    const siteBucket = new s3.Bucket(this, 'VotingFrontendBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY, // dev only
      autoDeleteObjects: true, // dev only
    });

    const distribution = new cloudfront.Distribution(this, 'SiteDistribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
      },
      additionalBehaviors: {
        'api/*': {
          origin: new origins.HttpOrigin(`${restApi.restApiId}.execute-api.${this.region}.amazonaws.com`, {
            originPath: `/${restApi.deploymentStage.stageName}`,
          }),
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
        },
      ],
    });

    const staticFiles = new s3deploy.BucketDeployment(
      this,
      `FrontendDeployment${new Date().toISOString()}`,
      {
        destinationBucket: siteBucket,
        distribution,
        distributionPaths: ['/*'],
        prune: false,
        sources: [
          s3deploy.Source.asset(
            path.join(__dirname, '..', 'frontend'),
          ),
        ],
      },
    );
    const appJsFile = new s3deploy.DeployTimeSubstitutedFile(
      this,
      `AppJsSubstitution${new Date().toISOString()}`,
      {
        destinationBucket: siteBucket,
        source: path.join(__dirname, '..', 'frontend', 'app.js'),
        destinationKey: 'app.js',
        substitutions: {
          '__REST_API_URL__': `https://${distribution.distributionDomainName}/api`,
          '__WS_API_URL__': wsStage.url,
        },
      },
    );
    appJsFile.node.addDependency(staticFiles);

    new cdk.CfnOutput(this, 'FrontendUrl', {
      value: `https://${distribution.distributionDomainName}`,
    });
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      '/RealtimeVotingAppStack/Custom::CDKBucketDeployment8693BB64968944B69AAFB0CC9EB8756C/Resource',
      [
        { id: 'Serverless-LambdaDefaultMemorySize', reason: 'This is a build in custom resource' },
        { id: 'Serverless-LambdaLatestVersion', reason: 'This is a build in custom resource' },
      ],
    );
  }
}
