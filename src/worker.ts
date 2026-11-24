import { parentPort, workerData } from 'node:worker_threads';
import { analyze } from './analyzer';
import ts from 'typescript';
import path from 'node:path';
try {
  const warnings: string[] = [];
  let options: ts.CompilerOptions = {};
  const config = ts.findConfigFile(workerData.root, ts.sys.fileExists, 'tsconfig.json') ?? ts.findConfigFile(workerData.root, ts.sys.fileExists, 'jsconfig.json');
  if (config) {
    const loaded = ts.readConfigFile(config, ts.sys.readFile);
    if (loaded.error) warnings.push('配置文件读取失败，使用默认模块解析。');
    else {
      const parsed = ts.parseJsonConfigFileContent(loaded.config, { ...ts.sys, readDirectory: () => [] }, path.dirname(config));
      options = parsed.options;
      if (parsed.errors.some(e => e.code !== 18003)) warnings.push('项目配置存在诊断信息，部分路径别名可能无法解析。');
    }
  }
  const map = analyze(workerData.files, workerData.root, options);
  map.warnings.unshift(...warnings);
  parentPort?.postMessage({ map });
}
catch (error) { parentPort?.postMessage({ error: String(error) }); }
