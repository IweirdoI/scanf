#!/usr/bin/env node
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const args=process.argv.slice(2),command=args[0];
const pkg=require('./package.json');
if(args.includes('--version')){console.log(pkg.version);process.exit(0);}
if(!command||args.includes('--help')){
 console.log(`Scanf ${pkg.version} — TS/JS code reader\n\nUsage:\n  scanf-reader mcp --root <project>       Start stdio MCP server\n  scanf-reader preview --root <project>   Open a local reading service\n  scanf-reader setup --root <project>     Print portable MCP configuration\n  scanf-reader --version\n\nNo source build, API key or npm dependencies required. Node.js 22+ required.\nModel settings and AI hover are available in the VS Code / DSH plugins.\n`);process.exit(0);
}
if(!['mcp','preview','setup'].includes(command)){console.error('Unknown command. Run scanf-reader --help.');process.exit(1);}
const index=args.indexOf('--root'),root=index>=0?args[index+1]:undefined;
if(!root||!fs.existsSync(path.resolve(root))||!fs.statSync(path.resolve(root)).isDirectory()){
 console.error('Pass --root <existing project directory>.');process.exit(1);
}
const project=path.resolve(root),server=path.join(__dirname,'dist','mcp.js');
if(command==='setup'){
 console.log(JSON.stringify({mcpServers:{scanf:{command:process.execPath,args:[server,'--root',project]}}},null,2));process.exit(0);
}
const child=spawn(process.execPath,[server,...(command==='preview'?['--preview']:[]),'--root',project],{stdio:'inherit',windowsHide:true});
child.on('error',()=>{console.error('Unable to start Scanf. Check Node.js installation.');process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});
process.on('SIGTERM',()=>child.kill('SIGTERM'));
