/**
 * Upload all public images to Cloudinary
 */

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');

const ROOT = path.resolve(__dirname, '..');
const ENV_FILE = path.join(ROOT, 'apps', 'web', '.env.local');
const PUBLIC_DIR = path.join(ROOT, 'apps', 'web', 'public');
const OUTPUT = path.join(ROOT, 'cloudinary-urls.json');

// Skip non-image files
const SKIP_FILES = ['firebase-messaging-sw.js', 'vercel.svg', 'file.svg', 'window.svg'];

function loadEnv() {
  if (!fs.existsSync(ENV_FILE)) {
    console.error(`Không tìm thấy ${ENV_FILE}`);
    process.exit(1);
  }
  const env = {};
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(CLOUDINARY_[A-Z_]+)\s*=\s*(.+?)\s*$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

const env = loadEnv();
const CLOUD_NAME = env.CLOUDINARY_CLOUD_NAME;
const API_KEY = env.CLOUDINARY_API_KEY;
const API_SECRET = env.CLOUDINARY_API_SECRET;
const FOLDER = env.CLOUDINARY_FOLDER || 'foodresq';

if (!CLOUD_NAME || !API_KEY || !API_SECRET) {
  console.error('Thiếu Cloudinary credentials');
  process.exit(1);
}

function sha1Hex(str) {
  return require('node:crypto').createHash('sha1').update(str).digest('hex');
}

async function uploadFile(localPath, publicId) {
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = FOLDER;
  const paramsToSign = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}`;
  const signature = sha1Hex(paramsToSign + API_SECRET);

  const fileBuffer = fs.readFileSync(localPath);
  const fileName = path.basename(localPath);
  const ext = path.extname(fileName).toLowerCase();
  const mimeType = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/svg+xml';
  const boundary = '----FoodResQUpload' + Date.now();

  let body = '';
  body += `--${boundary}\r\n`;
  body += `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n`;
  body += `Content-Type: ${mimeType}\r\n\r\n`;
  
  const headerBuffer = Buffer.from(body, 'utf8');
  const footer = Buffer.from(
    `\r\n--${boundary}\r\n` +
    `Content-Disposition: form-data; name="api_key"\r\n\r\n${API_KEY}\r\n` +
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="timestamp"\r\n\r\n${timestamp}\r\n` +
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="signature"\r\n\r\n${signature}\r\n` +
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="folder"\r\n\r\n${folder}\r\n` +
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="public_id"\r\n\r\n${publicId}\r\n` +
    `--${boundary}--\r\n`
  );

  const finalBody = Buffer.concat([headerBuffer, fileBuffer, footer]);

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.cloudinary.com',
        path: `/v1_1/${CLOUD_NAME}/image/upload`,
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': finalBody.length,
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(text));
            } catch (e) {
              reject(new Error(`Bad JSON: ${text}`));
            }
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${text}`));
          }
        });
      },
    );
    req.on('error', reject);
    req.write(finalBody);
    req.end();
  });
}

(async () => {
  const urls = fs.existsSync(OUTPUT) ? JSON.parse(fs.readFileSync(OUTPUT, 'utf8')) : {};
  
  const files = fs.readdirSync(PUBLIC_DIR).filter(f => {
    const ext = path.extname(f).toLowerCase();
    return ['.png', '.jpg', '.jpeg', '.svg'].includes(ext) && !SKIP_FILES.includes(f);
  });
  
  console.log(`Cloud Name: ${CLOUD_NAME}`);
  console.log(`Folder: ${FOLDER}`);
  console.log(`Files to upload: ${files.length}\n`);
  
  for (const file of files) {
    const local = path.join(PUBLIC_DIR, file);
    const publicId = file.replace(/\.[^.]+$/, '').replace(/\s+/g, '_');
    try {
      console.log(`Uploading ${file} → ${FOLDER}/${publicId}`);
      const res = await uploadFile(local, publicId);
      urls[file] = res.secure_url;
      console.log(`  ✓ ${res.secure_url}`);
    } catch (err) {
      console.error(`  ✗ ${file}: ${err.message}`);
    }
  }
  
  fs.writeFileSync(OUTPUT, JSON.stringify(urls, null, 2));
  console.log(`\nĐã ghi ${Object.keys(urls).length} URLs vào ${OUTPUT}`);
})();
