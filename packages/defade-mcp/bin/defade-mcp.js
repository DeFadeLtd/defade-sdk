#!/usr/bin/env node
'use strict';

// `defade-mcp` is the command name the docs and the Claude Desktop config
// snippets have always used, but the implementation ships inside the
// `defade` package — so `npx defade-mcp` resolved to nothing on the
// registry. This package owns that name and hands straight over.
//
// Owning it is also the point: an unclaimed package name that published
// instructions tell people to run is a credential-harvesting slot, and the
// thing users paste into this one is a DeFade API key.
//
// The real proxy runs its work at load, so requiring it is the whole job:
// argv, stdin and stdout all belong to this process either way.
require('defade/bin/defade-mcp.js');
