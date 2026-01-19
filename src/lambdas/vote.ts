import { APIGatewayProxyHandler } from "aws-lambda";
import { ddb } from "../shared/dynamo";
import { DeleteCommand, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
  GoneException,
} from '@aws-sdk/client-apigatewaymanagementapi';

function response(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify(body),
  };
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const { topicId, option } = JSON.parse(event.body || '{}') as { topicId: string; option: string };

    if (!topicId || !option) {
      return response(400, { message: 'Invalid vote payload' });
    }

    // 1. Atomic counter update
    const updateResponse = await ddb.send(
      new UpdateCommand({
        TableName: process.env.VOTES_TABLE,
        Key: { topicId },
        UpdateExpression: 'SET #opt = if_not_exists(#opt, :zero) + :inc',
        ExpressionAttributeNames: {
          '#opt': option,
        },
        ExpressionAttributeValues: {
          ':inc': 1,
          ':zero': 0,
        },
        ReturnValues: 'ALL_NEW',
      }),
    );

    const updatedResult = updateResponse.Attributes;

    // 2. Load all connections
    const connectionsResponse = await ddb.send(
      new ScanCommand({
        TableName: process.env.CONNECTIONS_TABLE,
        ProjectionExpression: 'connectionId',
      }),
    );

    const connections = (connectionsResponse.Items ?? []) as Array<{ connectionId: string }>;
    
    // 3. Broadcast results
    const wsClient = new ApiGatewayManagementApiClient({
      endpoint: process.env.APIGW_ENDPOINT,
    });
    const payload = JSON.stringify({
      topicId,
      result: updatedResult,
    });
    const sendTasks = connections.map(async (connection) => {
      try {
        await wsClient.send(
          new PostToConnectionCommand({
            ConnectionId: connection.connectionId,
            Data: payload,
          }),
        );
      } catch (error) {
        if (error instanceof GoneException) {
          // stale connection cleanup
          await ddb.send(
            new DeleteCommand({
              TableName: process.env.CONNECTIONS_TABLE!,
              Key: { connectionId: connection.connectionId },
            }),
          );
        } else {
          console.error('WebSocket send error: ', error);
        }
      }
    });

    await Promise.allSettled(sendTasks);

    
    return response(200, { success: true, result: updatedResult });
  } catch (error) {
    console.error(error);
    return response(500, { message: 'Internal error' });
  }
};
