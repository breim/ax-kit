const problem = { description: 'Error', content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } } };

export const DOCUMENT = {
  openapi: '3.1.0',
  info: { title: 'Acme API', version: '1.0.0' },
  servers: [{ url: 'https://api.acme.example/v1' }],
  security: [{ bearerAuth: [] }],
  paths: {
    '/users': {
      get: {
        operationId: 'listUsers',
        summary: 'List the users',
        parameters: [{ $ref: '#/components/parameters/Limit' }],
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/User' } } } } },
          default: { $ref: '#/components/responses/Error' },
        },
      },
      post: {
        operationId: 'createUser',
        description: 'Create a user.\nUse this operation one time for each user.',
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/NewUser' } } } },
        responses: { 201: { description: 'Created' }, 422: problem },
      },
    },
    '/users/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      get: { summary: 'Get a user', responses: { 200: { $ref: '#/components/responses/UserResponse' } } },
      delete: { operationId: 'deleteUser', security: [], responses: { 204: { description: 'Deleted' }, 404: problem } },
    },
    'x-internal': { get: { operationId: 'hidden' } },
  },
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } },
    parameters: { Limit: { name: 'limit', in: 'query', schema: { type: 'integer' }, example: 20 } },
    responses: {
      Error: problem,
      UserResponse: { description: 'A user', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
    },
    schemas: {
      User: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } } },
      NewUser: { type: 'object', properties: { name: { type: 'string', example: 'Ada' } } },
      Problem: { type: 'object', properties: { title: { type: 'string' } } },
    },
  },
};

export const YAML = `# Acme API description
openapi: 3.1.0
info:
  title: "Acme API"
  version: 1.0.0
servers:
- url: https://api.acme.example/v1
security:
  - bearerAuth: []
tags: [users]
paths:
  /users:
    get:
      operationId: listUsers
      summary: List the users
      tags: [users]
      parameters:
        - $ref: '#/components/parameters/Limit'
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/User'
        default:
          $ref: "#/components/responses/Error"
    post:
      operationId: createUser
      description: |
        Create a user.
        paths: this line is text
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/NewUser'
      responses:
        201:
          description: Created
        422:
          description: Error
          content:
            application/problem+json:
              schema:
                $ref: '#/components/schemas/Problem'
  '/users/{id}':
    parameters:
      - name: id
        in: path
        required: true
        schema:
          type: string
    get:
      summary: Get a user
        with all the fields
      responses:
        "200":
          $ref: '#/components/responses/UserResponse'
    delete:
      operationId: deleteUser
      security: []
      responses:
        '204':
          description: Deleted
        '404':
          description: Error
          content:
            application/problem+json:
              schema:
                $ref: '#/components/schemas/Problem'
  x-internal:
    get:
      operationId: hidden
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
  parameters:
    Limit:
      name: limit
      in: query
      schema:
        type: integer
      example: 20
  responses:
    Error:
      description: Error
      content:
        application/problem+json:
          schema:
            $ref: '#/components/schemas/Problem'
    UserResponse:
      description: A user
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/User'
  schemas:
    User:
      type: object
      required: [id]
      properties:
        id:
          type: string
        name:
          type: string
    NewUser:
      type: object
      properties:
        name:
          type: string
          example: Ada
    Problem:
      type: object
      properties:
        title:
          type: string
`;

export const DISCOVERED = { jsonrpc: '2.0', id: 1, result: { resultType: 'complete', supportedVersions: ['2026-07-28'], capabilities: { tools: {} }, ttlMs: 0, cacheScope: 'public' } };
export const mcp = (response) => ({ 'POST /mcp': response });
