# Realtime Serverless Voting App on AWS

A fully serverless, real-time voting application built with **AWS CDK, Lambda, API Gateway (REST + WebSocket), DynamoDB, S3, and CloudFront (OAC)**.

Users can vote on a topic with 4 options and see results update instantly — no login required, no servers to manage.

This repository is the companion project for my Medium story explaining the full architecture and step-by-step implementation.

---

## Features

- Real-time voting with WebSocket updates
- Atomic counters with DynamoDB (safe under high concurrency)
- REST API for submitting votes
- WebSocket API for broadcasting results
- Static frontend hosted on S3 and delivered via CloudFront
- Secure private bucket with Origin Access Control (OAC)
- Infrastructure as Code with AWS CDK
- No authentication required (public voting)

---

## Architecture Overview

```plaintext
Browser
│
▼
CloudFront (HTTPS)
│
▼
Private S3 Bucket (OAC)
│
▼
Frontend (HTML + JS)
│
├── REST → API Gateway → Lambda → DynamoDB (atomic counters)
│
└── WebSocket → API Gateway → Lambda → DynamoDB (connections)
│
└── Broadcast results to clients
```


---

## Tech Stack

- **AWS CDK (TypeScript)**
- **AWS Lambda (Node.js 18)**
- **API Gateway REST API**
- **API Gateway WebSocket API**
- **DynamoDB**
- **S3 Static Website Hosting**
- **CloudFront with Origin Access Control (OAC)**
- **Vanilla HTML + JavaScript frontend**

---

## Project Structure

```plaintext
.
├── bin/
│ └── app.ts
├── lib/
│ └── realtime-voting-app-stack.ts
├── src/
│ ├── lambdas/
│ │ ├── vote.ts
│ │ ├── ws-connect.ts
│ │ └── ws-disconnect.ts
│ └── shared/
│ └── dynamo.ts
├── frontend/
│ ├── index.html
│ └── app.js
├── cdk.json
└── package.json
```


---

## Deployment

### 1. Prerequisites

- AWS account
- AWS CLI configured
- Node.js 18+

```bash
npm install -g aws-cdk
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Bootstrap CDK (First Time Only)

```bash
cdk bootstrap
```

### 4. Deploy the Stack

```bash
cdk deploy
```

After deployment, CDK will output:

- REST API URL
- CloudFront Frontend URL

Open the **Frontend URL** in your browser to start voting.

Open it in multiple browsers or devices to see real-time updates.

---

## How Voting Works

1. User clicks a vote button
2. Browser sends REST request to /vote
3. Lambda increments DynamoDB atomic counter
4. Lambda broadcasts updated results to all WebSocket clients
5. Browsers update charts instantly

No polling. No refresh required.

---

## Security Notes

- S3 bucket is private
- Only CloudFront can access S3 using Origin Access Control (OAC)
- HTTPS enforced by CloudFront
- No public bucket access

This is production-grade static hosting.

---

## Ideas for Extension

If you want to evolve this project:

- Multiple topics / voting rooms
- Admin dashboard
- Vote reset and scheduling
- Rate limiting or CAPTCHA
- Authentication with Cognito
- DynamoDB Streams → Analytics pipeline

This architecture is a great base for any real-time public interaction system.

---

## Related Medium Story

This repository is built step-by-step in my Medium article:

[Building a Real-Time Voting App with AWS CDK, API Gateway WebSocket, and DynamoDB](https://hoangdv.medium.com/building-a-real-time-voting-app-with-aws-cdk-api-gateway-websocket-and-dynamodb-d1ec7278d9c9)
