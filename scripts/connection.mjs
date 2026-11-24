import path from 'node:path';
import { fileURLToPath } from 'node:url';
const project=process.argv[2];
if(!project){console.error('Usage: node scripts/connection.mjs <absolute project path>');process.exit(1);}
const server=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist/mcp.js');
console.log(JSON.stringify({mcpServers:{scanf:{command:'node',args:[server,'--root',path.resolve(project)]}}},null,2));
