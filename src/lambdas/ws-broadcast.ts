import { APIGatewayProxyHandler } from "aws-lambda";

export const handler: APIGatewayProxyHandler = async (event) => {
  console.log('Event', event);

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/plain'
    },
    body: `Hello World! You've hit ${event.path}`,
  }
};
