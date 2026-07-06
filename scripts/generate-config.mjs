import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const envPath = path.join(root, '.env');
const allowedKeys = [
  'BINANCE_API',
  'COINSTATS_API',
  'COINSTATS_API_KEY',
  'ETH_API',
  'ETH_KEY'
];
const keyMap = {
  BINANCE_API: 'VITE_BINANCE_API',
  COINSTATS_API: 'VITE_COINSTATS_API',
  COINSTATS_API_KEY: 'VITE_COINSTATS_API_KEY',
  ETH_API: 'VITE_ETH_API',
  ETH_KEY: 'VITE_ETH_KEY',
};

function parseEnv(source) {
  return source
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
    .reduce((acc, line) => {
      const i = line.indexOf('=');
      if (i === -1) return acc;
      const key = line.slice(0, i).trim();
      const bareKey = key.startsWith('VITE_') ? key.slice(5) : key;
      const value = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
      acc[bareKey] = value;
      return acc;
    }, {});
}

const fileConfig = fs.existsSync(envPath)
  ? parseEnv(fs.readFileSync(envPath, 'utf8'))
  : {};
const envConfig = allowedKeys.reduce((acc, key) => {
  if (process.env[key]) acc[key] = process.env[key];
  return acc;
}, {});
const config = { ...fileConfig, ...envConfig };

const lines = Object.entries(keyMap).map(([oldKey, viteKey]) => {
  const value = config[oldKey];
  return `${viteKey}=${value ?? ''}`;
});

fs.writeFileSync(envPath, lines.join('\n') + '\n', 'utf8');
console.log(`Generated ${path.relative(root, envPath)}`);
