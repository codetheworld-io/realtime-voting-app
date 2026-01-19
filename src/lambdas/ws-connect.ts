import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyWebsocketHandlerV2 } from 'aws-lambda';
import { ddb } from '../shared/dynamo';

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event) => {
  const { connectionId } = event.requestContext;

  await ddb.send(
    new PutCommand({
      TableName: process.env.CONNECTIONS_TABLE,
      Item: {
        connectionId,
        connectedAt: new Date().toDateString(),
      },
    }),
  );

  return { statusCode: 200 };
};
