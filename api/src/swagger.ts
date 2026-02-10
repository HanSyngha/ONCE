/**
 * Swagger/OpenAPI Configuration
 *
 * API 문서 자동 생성을 위한 설정
 */

import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Express } from 'express';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'ONCE API',
      version: '1.0.0',
      description: `
# ONCE API 문서

**"작성하기 귀찮을 때 쓰는 지식 공유 서비스"**

AI가 자동으로 노트를 정리해주는 서비스의 REST API 문서입니다.

## 인증

모든 API 요청에는 JWT 토큰이 필요합니다.
\`Authorization: Bearer {token}\` 헤더를 포함해주세요.

## Rate Limiting

- 노트 작성 (POST /requests/input): **분당 5회**
- 검색 (POST /requests/search): **분당 10회**

## 지원

문의: syngha.han
      `,
      contact: {
        name: 'syngha.han',
      },
      license: {
        name: 'MIT',
      },
    },
    servers: [
      {
        url: '/api',
        description: 'API Server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'OAuth 로그인 후 발급받은 JWT 토큰',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              description: '에러 메시지',
            },
          },
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', description: '사용자 ID' },
            loginid: { type: 'string', description: '로그인 ID' },
            username: { type: 'string', description: '사용자 이름' },
            deptname: { type: 'string', description: '부서명' },
            businessUnit: { type: 'string', description: '사업부' },
          },
        },
        Space: {
          type: 'object',
          properties: {
            id: { type: 'string', description: '공간 ID' },
            type: { type: 'string', enum: ['PERSONAL', 'TEAM'], description: '공간 유형' },
          },
        },
        File: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            path: { type: 'string' },
            spaceId: { type: 'string' },
            folderId: { type: 'string', nullable: true },
            createdBy: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
            deletedAt: { type: 'string', format: 'date-time', nullable: true },
          },
        },
        FileVersion: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            language: { type: 'string', enum: ['KO', 'EN', 'CN'] },
            content: { type: 'string', description: 'BlockNote JSON 형식' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        TreeNode: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            path: { type: 'string' },
            type: { type: 'string', enum: ['folder', 'file'] },
            children: {
              type: 'array',
              items: { $ref: '#/components/schemas/TreeNode' },
            },
            hasKO: { type: 'boolean' },
            hasEN: { type: 'boolean' },
            hasCN: { type: 'boolean' },
          },
        },
        Comment: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            fileId: { type: 'string' },
            blockId: { type: 'string' },
            content: { type: 'string' },
            user: { $ref: '#/components/schemas/User' },
            parentId: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            replies: {
              type: 'array',
              items: { $ref: '#/components/schemas/Comment' },
            },
          },
        },
        Request: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            type: { type: 'string', enum: ['INPUT', 'SEARCH', 'REFACTOR'] },
            status: { type: 'string', enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED'] },
            position: { type: 'integer', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        AuditLog: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            userId: { type: 'string' },
            action: { type: 'string' },
            targetType: { type: 'string' },
            targetId: { type: 'string' },
            details: { type: 'object' },
            timestamp: { type: 'string', format: 'date-time' },
          },
        },
      },
      responses: {
        Unauthorized: {
          description: '인증 필요',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
              example: { error: 'Access token required' },
            },
          },
        },
        Forbidden: {
          description: '권한 없음',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
              example: { error: 'Access denied' },
            },
          },
        },
        NotFound: {
          description: '리소스 없음',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
              example: { error: 'Not found' },
            },
          },
        },
        RateLimited: {
          description: 'Rate Limit 초과',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
              example: { error: 'Too many requests, please try again later' },
            },
          },
        },
      },
    },
    security: [
      { bearerAuth: [] },
    ],
    tags: [
      { name: 'Auth', description: '인증 관련 API' },
      { name: 'Spaces', description: '공간 관련 API' },
      { name: 'Files', description: '파일/노트 관련 API' },
      { name: 'Requests', description: '요청 관련 API (입력, 검색, 리팩토링)' },
      { name: 'Comments', description: '댓글 관련 API' },
      { name: 'Trash', description: '휴지통 관련 API' },
      { name: 'Admin', description: '관리자 API' },
      { name: 'Settings', description: '설정 관련 API' },
    ],
  },
  apis: ['./src/routes/*.ts', './src/routes/*.js'],
};

const swaggerSpec = swaggerJsdoc(options);

/**
 * Swagger UI 설정
 */
export function setupSwagger(app: Express): void {
  // Swagger JSON endpoint
  app.get('/api-docs.json', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });

  // Swagger UI
  app.use(
    '/api-docs',
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customCss: `
        .swagger-ui .topbar { display: none }
        .swagger-ui .info .title { color: #667eea }
      `,
      customSiteTitle: 'ONCE API Docs',
      customfavIcon: '/favicon.ico',
    })
  );

  console.log('[Swagger] API docs available at /api-docs');
}

export default swaggerSpec;
