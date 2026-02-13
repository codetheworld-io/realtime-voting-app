#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { RealtimeVotingAppStack } from '../lib/realtime-voting-app-stack';
import { Aspects } from 'aws-cdk-lib/core';
import { ServerlessChecks, NagSuppressions } from 'cdk-nag';

const app = new cdk.App();
const realtimeVotingAppStack = new RealtimeVotingAppStack(app, 'RealtimeVotingAppStack');

Aspects.of(app).add(new ServerlessChecks({ verbose: true }));
NagSuppressions.addStackSuppressions(realtimeVotingAppStack, [
  'Serverless-LambdaDLQ',
  'Serverless-APIGWAccessLogging',
  'Serverless-LambdaTracing',
  'Serverless-APIGWXrayEnabled',
  'Serverless-APIGWStructuredLogging',
].map((id) => ({ id, reason: 'This is a demo project' })));
