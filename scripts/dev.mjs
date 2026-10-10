import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const electron = require('electron');
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5173'], {stdio:'inherit'});
let desktop;
let stopped = false;
function stop() {
  if (stopped) return;
  stopped = true; desktop?.kill(); vite.kill();
}
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => { stop(); process.exit(0); });
vite.on('exit', code => { stop(); process.exit(code ?? 0); });
try {
  let ready = false;
  for (let attempt=0;attempt<100;attempt++) {
    try { const response = await fetch('http://127.0.0.1:5173'); if (response.ok) {ready=true;break;} } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error('Vite did not start on port 5173');
  desktop = spawn(electron, ['.'], {stdio:'inherit',env:{...process.env,VITE_DEV_SERVER_URL:'http://127.0.0.1:5173'}});
  desktop.on('exit', code => { stop(); process.exit(code ?? 0); });
} catch (error) { console.error(error.message); stop(); process.exit(1); }
