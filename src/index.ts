#!/usr/bin/env bun
import {
  WebStandardStreamableHTTPServerTransport
} from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createServer } from './server.ts';

const DEFAULT_PORT = 3001;

function readPort(): number {
  const rawPort = process.env.PORT;
  if (rawPort === undefined) return DEFAULT_PORT;

  const port = Number(rawPort);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      `Invalid PORT value "${rawPort}"; expected an integer between 1 and 65535`
    );
  }
  return port;
}

function start(port: number): void {
  try {
    Bun.serve({
      hostname: '0.0.0.0',
      port,
      async fetch(request): Promise<Response> {
        const pathname = new URL(request.url).pathname;

        if (pathname === '/health') {
          if (request.method !== 'GET') {
            return new Response('Method Not Allowed', { status: 405 });
          }
          return new Response('OK');
        }

        if (pathname !== '/mcp') {
          return new Response('Not Found', { status: 404 });
        }

        let server: ReturnType<typeof createServer> | undefined;
        try {
          // MCP stateless mode requires a fresh server and transport per request.
          server = createServer();
          const transport = new WebStandardStreamableHTTPServerTransport({
            enableJsonResponse: true
          });
          await server.connect(transport);
          return await transport.handleRequest(request);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error('ec-mcp request failed:', message);

          return new Response(JSON.stringify({
            jsonrpc: '2.0',
            id: null,
            error: { code: -32603, message: 'Internal error' }
          }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          });
        } finally {
          await server?.close();
        }
      },
      error(error) {
        console.error('ec-mcp server error:', error);
        return new Response('Internal Server Error', { status: 500 });
      }
    });
  } catch (error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    throw new Error(`Failed to start ec-mcp HTTP server: ${message}`);
  }
}

try {
  const port = readPort();
  start(port);
  console.log(`ec-mcp listening on http://0.0.0.0:${port}/mcp`);
} catch (error) {
  console.error('ec-mcp startup failed:', error);
  process.exitCode = 1;
}
