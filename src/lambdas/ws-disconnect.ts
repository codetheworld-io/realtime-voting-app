import { APIGatewayProxyWebsocketHandlerV2 } from "aws-lambda";
import { ddb } from "../shared/dynamo";
import { DeleteCommand } from "@aws-sdk/lib-dynamodb";

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event) => {
  const { connectionId } = event.requestContext;

  await ddb.send(
    new DeleteCommand({
      TableName: process.env.CONNECTIONS_TABLE,
      Key: { connectionId },
    }),
  );

  return { statusCode: 200 };
};
