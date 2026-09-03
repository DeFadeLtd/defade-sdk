# Runs the stdio MCP proxy (bin/defade-mcp.js) against the hosted DeFade
# endpoint. Pass DEFADE_API_KEY at run time; keyless containers still
# handshake and list tools, which is all a directory health check needs.
FROM node:22-slim
WORKDIR /app
COPY package.json index.cjs index.mjs index.d.ts LICENSE README.md ./
COPY bin ./bin
ENTRYPOINT ["node", "bin/defade-mcp.js"]
