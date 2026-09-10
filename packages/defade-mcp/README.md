# defade-mcp

Runs the [DeFade](https://defade.org) MCP server over stdio, for clients that
launch a local command instead of connecting to a URL.

```json
{
  "mcpServers": {
    "defade": {
      "command": "npx",
      "args": ["-y", "defade-mcp"],
      "env": { "DEFADE_API_KEY": "df_your_key" }
    }
  }
}
```

This package is a thin alias: the implementation lives in
[`defade`](https://www.npmjs.com/package/defade), the official SDK, and
`npx -p defade defade-mcp` runs exactly the same thing. Both are published
from [DeFadeLtd/defade-sdk](https://github.com/DeFadeLtd/defade-sdk) at
matching versions.

Most clients don't need this at all — the hosted endpoint speaks
streamable HTTP directly:

```
https://api.defade.org/mcp?api_key=YOUR_KEY
```

Keys: [defade.org/developers](https://defade.org/developers) ·
Docs: [defade.org/api-docs#mcp](https://defade.org/api-docs#mcp)

MIT licensed.
