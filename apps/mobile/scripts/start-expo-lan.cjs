const { networkInterfaces } = require('os');
const { spawn, spawnSync } = require('child_process');

const PORT = process.env.EXPO_PORT || '8081';
const API_PORT = process.env.API_PORT || '3001';

function isPrivateLan(ip) {
  return (
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(ip) ||
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip) ||
    /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(ip)
  );
}

function scoreInterface(name, ip) {
  const lower = name.toLowerCase();
  if (/vmware|virtualbox|vbox|hyper-v|vethernet|wsl|docker|vpn|loopback/.test(lower)) {
    return -1;
  }

  let score = 0;
  if (/wi-?fi|wireless|wlan/.test(lower)) score += 40;
  if (/ethernet|local area/.test(lower)) score += 20;
  if (ip.startsWith('192.168.')) score += 10;
  if (ip.startsWith('10.')) score += 5;
  return score;
}

function pickLanIp() {
  const candidates = [];

  for (const [name, entries] of Object.entries(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family !== 'IPv4' || entry.internal || !isPrivateLan(entry.address)) continue;

      const score = scoreInterface(name, entry.address);
      if (score >= 0) candidates.push({ name, ip: entry.address, score });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0] ?? null;
}

function runAdb(args) {
  const result = spawnSync('adb', args, { shell: true, stdio: 'ignore' });
  if (result.error || result.status !== 0) {
    console.warn(`adb ${args.join(' ')} skipped; continuing with LAN Metro.`);
    return false;
  }
  return true;
}

function hasAuthorizedAndroidDevice() {
  const result = spawnSync('adb', ['devices'], { shell: true, encoding: 'utf8' });
  if (result.error || result.status !== 0) return false;
  return result.stdout
    .split(/\r?\n/)
    .some((line) => /\tdevice$/.test(line.trim()));
}

const useUsbReverse = hasAuthorizedAndroidDevice();
let hostMode = 'lan';
let packagerHost = null;

if (useUsbReverse) {
  runAdb(['reverse', '--remove-all']);
  const metroReversed = runAdb(['reverse', `tcp:${PORT}`, `tcp:${PORT}`]);
  const apiReversed = runAdb(['reverse', `tcp:${API_PORT}`, `tcp:${API_PORT}`]);
  if (metroReversed && apiReversed) {
    hostMode = 'localhost';
    packagerHost = '127.0.0.1';
    console.log(`Expo Metro USB host: ${packagerHost}, port ${PORT}; API reverse port ${API_PORT}`);
  }
}

if (hostMode === 'lan') {
  const lan = pickLanIp();
  if (!lan) {
    console.error('No usable LAN IPv4 address found. Connect the phone and laptop to the same Wi-Fi, or connect Android over USB with USB debugging enabled.');
    process.exit(1);
  }
  packagerHost = lan.ip;
  console.log(`Expo Metro LAN host: ${lan.ip} (${lan.name}), port ${PORT}`);
}

const child = spawn('expo', ['start', '--dev-client', '--host', hostMode, '--port', PORT], {
  shell: true,
  stdio: 'inherit',
  env: {
    ...process.env,
    REACT_NATIVE_PACKAGER_HOSTNAME: packagerHost,
  },
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
