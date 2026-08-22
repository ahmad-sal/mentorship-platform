const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const targetDirs = [
  path.join(__dirname, '..', 'images'),
  path.join(__dirname, '..', 'public', 'images')
];

targetDirs.forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

async function createProfileImage() {
  const svg = `
  <svg width="800" height="800" viewBox="0 0 800 800" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#bfdbfe" />
        <stop offset="40%" stop-color="#93c5fd" />
        <stop offset="100%" stop-color="#3b82f6" />
      </linearGradient>
      <linearGradient id="skin" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#f8d5b8" />
        <stop offset="100%" stop-color="#e2b18f" />
      </linearGradient>
      <linearGradient id="vest" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#1e293b" />
        <stop offset="50%" stop-color="#0f172a" />
        <stop offset="100%" stop-color="#020617" />
      </linearGradient>
      <linearGradient id="kurta" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#cbd5e1" />
        <stop offset="100%" stop-color="#94a3b8" />
      </linearGradient>
      <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
        <feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#0f172a" flood-opacity="0.25" />
      </filter>
      <pattern id="vestPattern" width="20" height="20" patternUnits="userSpaceOnUse">
        <circle cx="10" cy="10" r="1.5" fill="#334155" opacity="0.6"/>
        <path d="M 0,10 Q 5,5 10,10 Q 15,15 20,10" fill="none" stroke="#334155" stroke-width="0.8" opacity="0.3"/>
      </pattern>
    </defs>

    <!-- Background -->
    <rect width="800" height="800" fill="url(#bgGrad)" />
    <circle cx="400" cy="300" r="280" fill="#ffffff" opacity="0.4" />

    <!-- Shoulders & Body (Kurta) -->
    <g filter="url(#shadow)">
      <!-- Kurta sleeves -->
      <path d="M 220 480 L 150 780 L 300 800 L 330 520 Z" fill="url(#kurta)" />
      <path d="M 580 480 L 650 780 L 500 800 L 470 520 Z" fill="url(#kurta)" />
      
      <!-- Kurta Collar -->
      <path d="M 360 410 L 400 480 L 440 410 L 400 395 Z" fill="#e2e8f0" stroke="#94a3b8" stroke-width="2" />

      <!-- Black Patterned Waistcoat / Vest -->
      <path d="M 270 470 C 270 470, 310 440, 360 435 L 365 720 C 365 750, 260 760, 230 750 L 250 490 Z" fill="url(#vest)" />
      <path d="M 530 470 C 530 470, 490 440, 440 435 L 435 720 C 435 750, 540 760, 570 750 L 550 490 Z" fill="url(#vest)" />
      <!-- Center vest closure -->
      <rect x="365" y="440" width="70" height="320" fill="url(#vest)" />
      <rect x="250" y="440" width="300" height="340" fill="url(#vestPattern)" />

      <!-- Vest Buttons -->
      <circle cx="400" cy="480" r="7" fill="#64748b" stroke="#cbd5e1" stroke-width="2" />
      <circle cx="400" cy="540" r="7" fill="#64748b" stroke="#cbd5e1" stroke-width="2" />
      <circle cx="400" cy="600" r="7" fill="#64748b" stroke="#cbd5e1" stroke-width="2" />
      <circle cx="400" cy="660" r="7" fill="#64748b" stroke="#cbd5e1" stroke-width="2" />

      <!-- Vest Pocket -->
      <rect x="460" y="520" width="65" height="4" rx="2" fill="#334155" />
    </g>

    <!-- Neck -->
    <path d="M 365 340 L 365 425 C 365 445, 435 445, 435 425 L 435 340 Z" fill="url(#skin)" />
    <path d="M 370 385 C 390 405, 410 405, 430 385" fill="none" stroke="#d49b74" stroke-width="4" opacity="0.4" />

    <!-- Head & Ears -->
    <ellipse cx="320" cy="270" rx="22" ry="38" fill="url(#skin)" />
    <ellipse cx="480" cy="270" rx="22" ry="38" fill="url(#skin)" />
    
    <!-- Face -->
    <path d="M 330 230 C 320 340, 350 375, 400 375 C 450 375, 480 340, 470 230 C 470 170, 330 170, 330 230 Z" fill="url(#skin)" filter="url(#shadow)" />

    <!-- Hair -->
    <path d="M 315 220 C 310 140, 490 130, 485 220 C 470 145, 330 145, 315 220 Z" fill="#0f172a" />
    <path d="M 320 200 C 350 140, 450 140, 480 195 C 460 170, 340 170, 320 200 Z" fill="#1e293b" />

    <!-- Eyebrows -->
    <path d="M 345 225 Q 365 218 380 226" stroke="#0f172a" stroke-width="5" stroke-linecap="round" fill="none" />
    <path d="M 455 225 Q 435 218 420 226" stroke="#0f172a" stroke-width="5" stroke-linecap="round" fill="none" />

    <!-- Eyes -->
    <ellipse cx="365" cy="245" rx="14" ry="9" fill="#ffffff" />
    <circle cx="365" cy="245" r="6" fill="#1e293b" />
    <circle cx="363" cy="243" r="2" fill="#ffffff" />

    <ellipse cx="435" cy="245" rx="14" ry="9" fill="#ffffff" />
    <circle cx="435" cy="245" r="6" fill="#1e293b" />
    <circle cx="433" cy="243" r="2" fill="#ffffff" />

    <!-- Nose -->
    <path d="M 400 240 L 396 280 Q 400 286 408 282" stroke="#c28863" stroke-width="4" stroke-linecap="round" fill="none" />

    <!-- Gentle Mustache / Expression -->
    <path d="M 382 305 Q 400 300 418 305" stroke="#334155" stroke-width="2.5" stroke-linecap="round" fill="none" opacity="0.6" />

    <!-- Smile / Lips -->
    <path d="M 380 322 Q 400 338 420 322" stroke="#b91c1c" stroke-width="3.5" stroke-linecap="round" fill="none" />

    <!-- Professional Badge / Signature -->
    <g transform="translate(40, 720)">
      <rect width="240" height="50" rx="25" fill="#ffffff" opacity="0.95" />
      <text x="30" y="32" font-family="'Plus Jakarta Sans', Arial, sans-serif" font-size="20" font-weight="800" fill="#1e293b">Ahmad Saleem</text>
    </g>
  </svg>
  `;

  const buf = Buffer.from(svg);
  for (const dir of targetDirs) {
    await sharp(buf).jpeg({ quality: 95 }).toFile(path.join(dir, 'profile.jpeg'));
    await sharp(buf).png().toFile(path.join(dir, 'profile.png'));
  }
  console.log('Saved profile.jpeg & profile.png');
}

async function createYouTubeBanner() {
  const svg = `
  <svg width="1280" height="720" viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="ytBg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0a0508" />
        <stop offset="50%" stop-color="#1a0a10" />
        <stop offset="100%" stop-color="#0f0508" />
      </linearGradient>
      <linearGradient id="ytRed" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#ff0000" />
        <stop offset="100%" stop-color="#dc2626" />
      </linearGradient>
      <linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#fde047" />
        <stop offset="100%" stop-color="#eab308" />
      </linearGradient>
      <linearGradient id="cyanGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#06b6d4" />
        <stop offset="100%" stop-color="#3b82f6" />
      </linearGradient>
      <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="8" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>

    <rect width="1280" height="720" fill="url(#ytBg)" />

    <!-- Background Tech Grid & Glows -->
    <circle cx="200" cy="150" r="300" fill="#dc2626" opacity="0.18" filter="url(#glow)" />
    <circle cx="1050" cy="350" r="280" fill="#06b6d4" opacity="0.18" filter="url(#glow)" />

    <!-- Top Badge -->
    <rect x="60" y="45" width="280" height="42" rx="21" fill="url(#ytRed)" />
    <text x="80" y="73" font-family="'Plus Jakarta Sans', Arial, sans-serif" font-size="20" font-weight="900" fill="#ffffff">▶ COMPLETE COURSE</text>

    <rect x="850" y="45" width="370" height="42" rx="10" fill="#1e1b24" stroke="#dc2626" stroke-width="1.5" />
    <text x="870" y="73" font-family="'Plus Jakarta Sans', Arial, sans-serif" font-size="18" font-weight="800" fill="#fecaca">BEGINNER TO ADVANCED ROADMAP</text>

    <!-- Main Title -->
    <text x="60" y="180" font-family="'Plus Jakarta Sans', Arial, sans-serif" font-size="78" font-weight="900" fill="#ffffff" letter-spacing="-2">YOUTUBE</text>
    <text x="60" y="275" font-family="'Plus Jakarta Sans', Arial, sans-serif" font-size="74" font-weight="900" fill="url(#gold)" letter-spacing="-2">AUTOMATION</text>
    <text x="60" y="360" font-family="'Plus Jakarta Sans', Arial, sans-serif" font-size="64" font-weight="900" fill="#38bdf8">WITH AI</text>

    <!-- Sub Pill Actions -->
    <g transform="translate(60, 395)">
      <rect width="480" height="48" rx="12" fill="#1e1e2f" stroke="#38bdf8" stroke-width="2" />
      <text x="30" y="32" font-family="'Plus Jakarta Sans', Arial, sans-serif" font-size="20" font-weight="800" fill="#ffffff">BUILD • AUTOMATE • OPTIMIZE • GROW</text>
    </g>

    <!-- 4 Feature Badges -->
    <g transform="translate(60, 475)">
      <rect x="0" y="0" width="115" height="110" rx="14" fill="#181824" stroke="#ec4899" stroke-width="1.5" />
      <text x="57" y="45" font-family="Arial" font-size="28" fill="#ec4899" text-anchor="middle">⚙️</text>
      <text x="57" y="75" font-family="'Plus Jakarta Sans', Arial" font-size="12" font-weight="800" fill="#fff" text-anchor="middle">AI CHANNEL</text>
      <text x="57" y="92" font-family="'Plus Jakarta Sans', Arial" font-size="12" font-weight="800" fill="#ec4899" text-anchor="middle">SETUP</text>

      <rect x="130" y="0" width="115" height="110" rx="14" fill="#181824" stroke="#3b82f6" stroke-width="1.5" />
      <text x="187" y="45" font-family="Arial" font-size="28" fill="#3b82f6" text-anchor="middle">🎬</text>
      <text x="187" y="75" font-family="'Plus Jakarta Sans', Arial" font-size="12" font-weight="800" fill="#fff" text-anchor="middle">AI VIDEO</text>
      <text x="187" y="92" font-family="'Plus Jakarta Sans', Arial" font-size="12" font-weight="800" fill="#3b82f6" text-anchor="middle">CREATION</text>

      <rect x="260" y="0" width="115" height="110" rx="14" fill="#181824" stroke="#10b981" stroke-width="1.5" />
      <text x="317" y="45" font-family="Arial" font-size="28" fill="#10b981" text-anchor="middle">🤖</text>
      <text x="317" y="75" font-family="'Plus Jakarta Sans', Arial" font-size="12" font-weight="800" fill="#fff" text-anchor="middle">AI AUTO</text>
      <text x="317" y="92" font-family="'Plus Jakarta Sans', Arial" font-size="12" font-weight="800" fill="#10b981" text-anchor="middle">UPLOAD/SEO</text>

      <rect x="390" y="0" width="115" height="110" rx="14" fill="#181824" stroke="#f59e0b" stroke-width="1.5" />
      <text x="447" y="45" font-family="Arial" font-size="28" fill="#f59e0b" text-anchor="middle">📈</text>
      <text x="447" y="75" font-family="'Plus Jakarta Sans', Arial" font-size="12" font-weight="800" fill="#fff" text-anchor="middle">GROW &amp;</text>
      <text x="447" y="92" font-family="'Plus Jakarta Sans', Arial" font-size="12" font-weight="800" fill="#f59e0b" text-anchor="middle">MONETIZE</text>
    </g>

    <!-- Robot & Laptop Analytics Mockup on Right -->
    <g transform="translate(680, 130)">
      <!-- Laptop Screen -->
      <rect x="80" y="60" width="460" height="290" rx="16" fill="#0b0f19" stroke="#334155" stroke-width="4" />
      <!-- Dashboard header -->
      <rect x="95" y="75" width="430" height="40" rx="8" fill="#1e293b" />
      <text x="110" y="100" font-family="'Plus Jakarta Sans', Arial" font-size="14" font-weight="800" fill="#94a3b8">Channel Analytics</text>
      
      <!-- Stats 4 columns -->
      <text x="110" y="140" font-family="'Plus Jakarta Sans', Arial" font-size="11" fill="#64748b">Views</text>
      <text x="110" y="165" font-family="'Plus Jakarta Sans', Arial" font-size="18" font-weight="900" fill="#fff">2.6M</text>
      <text x="110" y="185" font-family="'Plus Jakarta Sans', Arial" font-size="11" font-weight="700" fill="#10b981">+185%</text>

      <text x="210" y="140" font-family="'Plus Jakarta Sans', Arial" font-size="11" fill="#64748b">Watch Time</text>
      <text x="210" y="165" font-family="'Plus Jakarta Sans', Arial" font-size="18" font-weight="900" fill="#fff">175.8K</text>
      <text x="210" y="185" font-family="'Plus Jakarta Sans', Arial" font-size="11" font-weight="700" fill="#10b981">+220%</text>

      <text x="320" y="140" font-family="'Plus Jakarta Sans', Arial" font-size="11" fill="#64748b">Subscribers</text>
      <text x="320" y="165" font-family="'Plus Jakarta Sans', Arial" font-size="18" font-weight="900" fill="#fff">+46.3K</text>
      <text x="320" y="185" font-family="'Plus Jakarta Sans', Arial" font-size="11" font-weight="700" fill="#10b981">+195%</text>

      <text x="430" y="140" font-family="'Plus Jakarta Sans', Arial" font-size="11" fill="#64748b">Revenue</text>
      <text x="430" y="165" font-family="'Plus Jakarta Sans', Arial" font-size="18" font-weight="900" fill="#22c55e">$12,345</text>
      <text x="430" y="185" font-family="'Plus Jakarta Sans', Arial" font-size="11" font-weight="700" fill="#10b981">+245%</text>

      <!-- Wave Graph -->
      <path d="M 110 290 Q 180 230 250 260 T 380 210 T 500 240" fill="none" stroke="#38bdf8" stroke-width="4" />
      <circle cx="500" cy="240" r="6" fill="#38bdf8" />

      <!-- Laptop Base -->
      <path d="M 50 350 L 570 350 L 610 390 L 10 390 Z" fill="#1e293b" stroke="#475569" stroke-width="2" />

      <!-- Robot Mentor Mascot -->
      <circle cx="60" cy="50" r="50" fill="#e2e8f0" stroke="#0ea5e9" stroke-width="4" />
      <!-- Robot Visor -->
      <rect x="25" y="35" width="70" height="30" rx="15" fill="#0f172a" stroke="#38bdf8" stroke-width="2" />
      <circle cx="45" cy="50" r="6" fill="#38bdf8" filter="url(#glow)" />
      <circle cx="75" cy="50" r="6" fill="#38bdf8" filter="url(#glow)" />
      <!-- Robot Ears / Antennas -->
      <circle cx="10" cy="50" r="8" fill="#38bdf8" />
      <circle cx="110" cy="50" r="8" fill="#38bdf8" />
    </g>

    <!-- Bottom Yellow Stamp -->
    <g transform="translate(60, 620)">
      <rect width="1160" height="60" rx="10" fill="#eab308" />
      <text x="580" y="38" font-family="'Plus Jakarta Sans', Arial, sans-serif" font-size="22" font-weight="900" fill="#0f172a" text-anchor="middle" letter-spacing="1">TURN AI INTO YOUR YOUTUBE MONEY MACHINE • LIFETIME ACCESS</text>
    </g>
  </svg>
  `;

  const buf = Buffer.from(svg);
  for (const dir of targetDirs) {
    await sharp(buf).png().toFile(path.join(dir, 'yt.png'));
    await sharp(buf).jpeg({ quality: 92 }).toFile(path.join(dir, 'thumb-yt.jpeg'));
  }
  console.log('Saved yt.png & thumb-yt.jpeg');
}

async function createWordPressBanner() {
  const svg = `
  <svg width="1280" height="720" viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="wpBg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#091424" />
        <stop offset="50%" stop-color="#0d233e" />
        <stop offset="100%" stop-color="#071220" />
      </linearGradient>
      <linearGradient id="wpBlue" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#38bdf8" />
        <stop offset="100%" stop-color="#0284c7" />
      </linearGradient>
      <linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#fde047" />
        <stop offset="100%" stop-color="#eab308" />
      </linearGradient>
    </defs>

    <rect width="1280" height="720" fill="url(#wpBg)" />
    <circle cx="1000" cy="300" r="350" fill="#0284c7" opacity="0.15" />

    <!-- Left Header & Titles -->
    <g transform="translate(60, 60)">
      <text x="0" y="80" font-family="'Plus Jakarta Sans', Arial" font-size="96" font-weight="900" fill="#ffffff" letter-spacing="-3">WEB</text>
      <text x="0" y="170" font-family="'Plus Jakarta Sans', Arial" font-size="80" font-weight="900" fill="#ffffff" letter-spacing="-2">DEVELOPMENT</text>
      <text x="0" y="235" font-family="'Plus Jakarta Sans', Arial" font-size="44" font-weight="700" fill="#facc15" font-style="italic">through</text>
      <text x="0" y="340" font-family="'Plus Jakarta Sans', Arial" font-size="94" font-weight="900" fill="url(#wpBlue)" letter-spacing="-3">WORDPRESS</text>

      <rect x="0" y="375" width="490" height="42" rx="21" fill="#1e293b" stroke="#38bdf8" stroke-width="2" />
      <text x="25" y="403" font-family="'Plus Jakarta Sans', Arial" font-size="18" font-weight="800" fill="#ffffff">BEGINNER TO ADVANCED COMPLETE COURSE</text>

      <text x="0" y="460" font-family="'Plus Jakarta Sans', Arial" font-size="22" font-weight="700" fill="#94a3b8">Build Professional Websites Without Coding</text>

      <!-- Badges -->
      <g transform="translate(0, 485)">
        <rect x="0" y="0" width="150" height="42" rx="8" fill="#172554" />
        <text x="15" y="27" font-family="'Plus Jakarta Sans', Arial" font-size="13" font-weight="800" fill="#38bdf8">✓ Elementor Pro</text>

        <rect x="165" y="0" width="165" height="42" rx="8" fill="#172554" />
        <text x="180" y="27" font-family="'Plus Jakarta Sans', Arial" font-size="13" font-weight="800" fill="#38bdf8">✓ E-Commerce Store</text>

        <rect x="345" y="0" width="150" height="42" rx="8" fill="#172554" />
        <text x="360" y="27" font-family="'Plus Jakarta Sans', Arial" font-size="13" font-weight="800" fill="#38bdf8">✓ SEO &amp; Security</text>
      </g>
    </g>

    <!-- Right Screen Mockup -->
    <g transform="translate(680, 80)">
      <!-- Desktop Monitor Frame -->
      <rect x="40" y="40" width="500" height="340" rx="14" fill="#0f172a" stroke="#475569" stroke-width="6" />
      
      <!-- Website Display inside Monitor -->
      <rect x="50" y="50" width="480" height="320" rx="8" fill="#ffffff" />
      
      <!-- Mock Website Hero -->
      <rect x="50" y="50" width="480" height="45" fill="#0f172a" />
      <text x="70" y="78" font-family="'Plus Jakarta Sans', Arial" font-size="14" font-weight="800" fill="#38bdf8">Digital Agency</text>
      <text x="430" y="78" font-family="'Plus Jakarta Sans', Arial" font-size="12" fill="#cbd5e1">Menu</text>

      <rect x="50" y="95" width="480" height="180" fill="#0284c7" />
      <text x="75" y="150" font-family="'Plus Jakarta Sans', Arial" font-size="24" font-weight="900" fill="#ffffff">WE CREATE AWESOME</text>
      <text x="75" y="185" font-family="'Plus Jakarta Sans', Arial" font-size="28" font-weight="900" fill="#facc15">WEBSITES &amp; STORES</text>
      
      <rect x="75" y="210" width="130" height="36" rx="6" fill="#ffffff" />
      <text x="95" y="234" font-family="'Plus Jakarta Sans', Arial" font-size="13" font-weight="800" fill="#0284c7">GET STARTED</text>

      <!-- 3 Feature cards on webpage -->
      <rect x="70" y="290" width="130" height="65" rx="6" fill="#f1f5f9" />
      <text x="80" y="325" font-family="'Plus Jakarta Sans', Arial" font-size="11" font-weight="700" fill="#1e293b">Responsive Design</text>

      <rect x="225" y="290" width="130" height="65" rx="6" fill="#f1f5f9" />
      <text x="240" y="325" font-family="'Plus Jakarta Sans', Arial" font-size="11" font-weight="700" fill="#1e293b">Fast Performance</text>

      <rect x="380" y="290" width="130" height="65" rx="6" fill="#f1f5f9" />
      <text x="405" y="325" font-family="'Plus Jakarta Sans', Arial" font-size="11" font-weight="700" fill="#1e293b">SEO Friendly</text>

      <!-- Stand -->
      <rect x="260" y="380" width="60" height="60" fill="#334155" />
      <path d="M 210 440 L 370 440 L 350 455 L 230 455 Z" fill="#475569" />

      <!-- Big WordPress 3D Logo Badge -->
      <g transform="translate(360, 310)">
        <circle cx="70" cy="70" r="65" fill="#0284c7" stroke="#ffffff" stroke-width="8" />
        <circle cx="70" cy="70" r="54" fill="none" stroke="#ffffff" stroke-width="4" />
        <text x="70" y="100" font-family="'Plus Jakarta Sans', Georgia" font-size="80" font-weight="900" fill="#ffffff" text-anchor="middle">W</text>
      </g>
    </g>

    <!-- Bottom Yellow Banner -->
    <g transform="translate(60, 620)">
      <rect width="1160" height="60" rx="10" fill="#eab308" />
      <text x="580" y="38" font-family="'Plus Jakarta Sans', Arial" font-size="22" font-weight="900" fill="#0f172a" text-anchor="middle" letter-spacing="1">START YOUR JOURNEY • NO CODING REQUIRED • FROM BEGINNER TO EXPERT</text>
    </g>
  </svg>
  `;

  const buf = Buffer.from(svg);
  for (const dir of targetDirs) {
    await sharp(buf).png().toFile(path.join(dir, 'wp.png'));
    await sharp(buf).jpeg({ quality: 92 }).toFile(path.join(dir, 'thumb-webdev.jpeg'));
  }
  console.log('Saved wp.png & thumb-webdev.jpeg');
}

async function createAIBanner() {
  const svg = `
  <svg width="1280" height="720" viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="aiBg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0c071e" />
        <stop offset="50%" stop-color="#190d38" />
        <stop offset="100%" stop-color="#081426" />
      </linearGradient>
      <linearGradient id="aiGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#38bdf8" />
        <stop offset="50%" stop-color="#a855f7" />
        <stop offset="100%" stop-color="#ec4899" />
      </linearGradient>
      <linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#fde047" />
        <stop offset="100%" stop-color="#eab308" />
      </linearGradient>
      <filter id="aiGlow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="12" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>

    <rect width="1280" height="720" fill="url(#aiBg)" />
    <circle cx="950" cy="250" r="300" fill="#a855f7" opacity="0.22" filter="url(#aiGlow)" />

    <!-- Top Left Subheading -->
    <g transform="translate(60, 50)">
      <rect width="360" height="38" rx="19" fill="#1e1338" stroke="#a855f7" stroke-width="1.5" />
      <text x="20" y="25" font-family="'Plus Jakarta Sans', Arial" font-size="16" font-weight="800" fill="#e9d5ff">🎓 LEARN WITH AHMAD SALEEM</text>

      <text x="0" y="110" font-family="'Plus Jakarta Sans', Arial" font-size="78" font-weight="900" fill="#ffffff" letter-spacing="-2">ADVANCED</text>
      <text x="0" y="195" font-family="'Plus Jakarta Sans', Arial" font-size="74" font-weight="900" fill="url(#aiGrad)" letter-spacing="-2">ARTIFICIAL</text>
      <text x="0" y="280" font-family="'Plus Jakarta Sans', Arial" font-size="74" font-weight="900" fill="url(#aiGrad)" letter-spacing="-2">INTELLIGENCE</text>

      <text x="0" y="325" font-family="'Plus Jakarta Sans', Arial" font-size="22" font-weight="800" fill="#38bdf8">◉ FROM BEGINNER TO EXPERT</text>

      <!-- Pill -->
      <rect x="0" y="350" width="500" height="42" rx="10" fill="#111827" stroke="#38bdf8" stroke-width="1.5" />
      <text x="25" y="377" font-family="'Plus Jakarta Sans', Arial" font-size="16" font-weight="800" fill="#ffffff">MASTER AI TOOLS • AUTOMATE TASKS • BUILD THE FUTURE</text>
    </g>

    <!-- 6 Feature Cards Row -->
    <g transform="translate(60, 480)">
      <rect x="0" y="0" width="95" height="95" rx="12" fill="#18132b" stroke="#a855f7" stroke-width="1.5" />
      <text x="47" y="38" font-family="Arial" font-size="22" fill="#38bdf8" text-anchor="middle">🎨</text>
      <text x="47" y="65" font-family="'Plus Jakarta Sans', Arial" font-size="10" font-weight="800" fill="#fff" text-anchor="middle">IMAGE GEN</text>
      <text x="47" y="80" font-family="'Plus Jakarta Sans', Arial" font-size="9" fill="#a855f7" text-anchor="middle">TEXT-TO-IMG</text>

      <rect x="105" y="0" width="95" height="95" rx="12" fill="#18132b" stroke="#ec4899" stroke-width="1.5" />
      <text x="152" y="38" font-family="Arial" font-size="22" fill="#ec4899" text-anchor="middle">🎥</text>
      <text x="152" y="65" font-family="'Plus Jakarta Sans', Arial" font-size="10" font-weight="800" fill="#fff" text-anchor="middle">VIDEO GEN</text>
      <text x="152" y="80" font-family="'Plus Jakarta Sans', Arial" font-size="9" fill="#ec4899" text-anchor="middle">TEXT-TO-VIDEO</text>

      <rect x="210" y="0" width="95" height="95" rx="12" fill="#18132b" stroke="#38bdf8" stroke-width="1.5" />
      <text x="257" y="38" font-family="Arial" font-size="22" fill="#38bdf8" text-anchor="middle">👩‍🦰</text>
      <text x="257" y="65" font-family="'Plus Jakarta Sans', Arial" font-size="10" font-weight="800" fill="#fff" text-anchor="middle">AI MODELS</text>
      <text x="257" y="80" font-family="'Plus Jakarta Sans', Arial" font-size="9" fill="#38bdf8" text-anchor="middle">INFLUENCERS</text>

      <rect x="315" y="0" width="95" height="95" rx="12" fill="#18132b" stroke="#10b981" stroke-width="1.5" />
      <text x="362" y="38" font-family="Arial" font-size="22" fill="#10b981" text-anchor="middle">💻</text>
      <text x="362" y="65" font-family="'Plus Jakarta Sans', Arial" font-size="10" font-weight="800" fill="#fff" text-anchor="middle">AI WEBSITES</text>
      <text x="362" y="80" font-family="'Plus Jakarta Sans', Arial" font-size="9" fill="#10b981" text-anchor="middle">NO CODE</text>

      <rect x="420" y="0" width="95" height="95" rx="12" fill="#18132b" stroke="#f59e0b" stroke-width="1.5" />
      <text x="467" y="38" font-family="Arial" font-size="22" fill="#f59e0b" text-anchor="middle">🐱</text>
      <text x="467" y="65" font-family="'Plus Jakarta Sans', Arial" font-size="10" font-weight="800" fill="#fff" text-anchor="middle">AI MEMES</text>
      <text x="467" y="80" font-family="'Plus Jakarta Sans', Arial" font-size="9" fill="#f59e0b" text-anchor="middle">VIRAL MEDIA</text>
    </g>

    <!-- Right Cyborg AI Head Graphic Mockup -->
    <g transform="translate(720, 70)">
      <circle cx="260" cy="220" r="180" fill="#1e1035" stroke="#a855f7" stroke-width="4" />
      
      <!-- Futuristic AI Cyborg Face Profile -->
      <path d="M 230 110 C 310 110, 360 170, 360 250 C 360 330, 310 370, 240 370 C 190 370, 160 330, 160 270 Z" fill="#e2e8f0" />
      <!-- Cybernetic lines & Glows -->
      <circle cx="280" cy="210" r="28" fill="#0f172a" stroke="#38bdf8" stroke-width="6" />
      <circle cx="280" cy="210" r="14" fill="#38bdf8" filter="url(#aiGlow)" />
      <!-- Circuit tracks -->
      <path d="M 200 150 L 250 150 L 270 180" stroke="#a855f7" stroke-width="4" fill="none" />
      <path d="M 200 300 L 250 300 L 290 260" stroke="#06b6d4" stroke-width="4" fill="none" />

      <!-- Big Badge on top right -->
      <g transform="translate(340, 10)">
        <rect width="160" height="90" rx="16" fill="url(#aiGrad)" />
        <text x="80" y="42" font-family="'Plus Jakarta Sans', Arial" font-size="28" font-weight="900" fill="#ffffff" text-anchor="middle">AI</text>
        <text x="80" y="70" font-family="'Plus Jakarta Sans', Arial" font-size="14" font-weight="800" fill="#ffffff" text-anchor="middle">POWERED</text>
      </g>
    </g>

    <!-- Bottom Yellow Banner -->
    <g transform="translate(60, 620)">
      <rect width="1160" height="60" rx="10" fill="#eab308" />
      <text x="580" y="38" font-family="'Plus Jakarta Sans', Arial" font-size="22" font-weight="900" fill="#0f172a" text-anchor="middle" letter-spacing="1">LEARN AI • APPLY AI • BUILD THE FUTURE • 100% PRACTICAL</text>
    </g>
  </svg>
  `;

  const buf = Buffer.from(svg);
  for (const dir of targetDirs) {
    await sharp(buf).png().toFile(path.join(dir, 'Ai.png'));
    await sharp(buf).jpeg({ quality: 92 }).toFile(path.join(dir, 'thumb-ai.jpeg'));
  }
  console.log('Saved Ai.png & thumb-ai.jpeg');
}

async function createCanvaBanner() {
  const svg = `
  <svg width="1280" height="720" viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="canvaBg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#05141e" />
        <stop offset="50%" stop-color="#092536" />
        <stop offset="100%" stop-color="#06121a" />
      </linearGradient>
      <linearGradient id="canvaGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#00c4cc" />
        <stop offset="100%" stop-color="#7d2ae8" />
      </linearGradient>
    </defs>

    <rect width="1280" height="720" fill="url(#canvaBg)" />
    <circle cx="1000" cy="280" r="320" fill="#00c4cc" opacity="0.15" />

    <!-- Left Titles -->
    <g transform="translate(60, 50)">
      <rect width="360" height="38" rx="19" fill="#0d283c" stroke="#00c4cc" stroke-width="1.5" />
      <text x="20" y="25" font-family="'Plus Jakarta Sans', Arial" font-size="16" font-weight="800" fill="#67e8f9">🎓 LEARN WITH AHMAD SALEEM</text>

      <text x="0" y="130" font-family="'Plus Jakarta Sans', Arial" font-size="94" font-weight="900" fill="#ffffff" letter-spacing="-3">GRAPHIC</text>
      <text x="0" y="235" font-family="'Plus Jakarta Sans', Arial" font-size="90" font-weight="900" fill="#facc15" letter-spacing="-2">DESIGNING</text>
      <text x="0" y="300" font-family="'Plus Jakarta Sans', Arial" font-size="44" font-weight="700" fill="#38bdf8" font-style="italic">through</text>
      <text x="0" y="390" font-family="'Plus Jakarta Sans', Arial" font-size="88" font-weight="900" fill="#00c4cc" letter-spacing="-2">CANVA</text>

      <rect x="0" y="420" width="460" height="42" rx="21" fill="#0f172a" stroke="#7d2ae8" stroke-width="2" />
      <text x="25" y="448" font-family="'Plus Jakarta Sans', Arial" font-size="18" font-weight="800" fill="#ffffff">COMPLETE COURSE • BEGINNER TO ADVANCED</text>

      <!-- Badges -->
      <g transform="translate(0, 485)">
        <rect x="0" y="0" width="115" height="45" rx="10" fill="#0f2b3f" stroke="#00c4cc" stroke-width="1" />
        <text x="57" y="28" font-family="'Plus Jakarta Sans', Arial" font-size="12" font-weight="800" fill="#67e8f9" text-anchor="middle">🎨 Brand Kits</text>

        <rect x="125" y="0" width="115" height="45" rx="10" fill="#0f2b3f" stroke="#7d2ae8" stroke-width="1" />
        <text x="182" y="28" font-family="'Plus Jakarta Sans', Arial" font-size="12" font-weight="800" fill="#c084fc" text-anchor="middle">📱 Social Media</text>

        <rect x="250" y="0" width="115" height="45" rx="10" fill="#0f2b3f" stroke="#facc15" stroke-width="1" />
        <text x="307" y="28" font-family="'Plus Jakarta Sans', Arial" font-size="12" font-weight="800" fill="#fde047" text-anchor="middle">🎬 Video Reels</text>

        <rect x="375" y="0" width="115" height="45" rx="10" fill="#0f2b3f" stroke="#38bdf8" stroke-width="1" />
        <text x="432" y="28" font-family="'Plus Jakarta Sans', Arial" font-size="12" font-weight="800" fill="#7dd3fc" text-anchor="middle">✨ Canva AI</text>
      </g>
    </g>

    <!-- Right Workspace Tablet Mockup -->
    <g transform="translate(680, 70)">
      <!-- Tablet Frame -->
      <rect x="30" y="30" width="520" height="360" rx="24" fill="#0f172a" stroke="#475569" stroke-width="6" />
      <rect x="42" y="42" width="496" height="336" rx="16" fill="#ffffff" />
      
      <!-- Canva Interface -->
      <rect x="42" y="42" width="60" height="336" fill="#0e7490" />
      <circle cx="72" cy="75" r="14" fill="#00c4cc" />
      <circle cx="72" cy="120" r="12" fill="#ffffff" opacity="0.6" />
      <circle cx="72" cy="160" r="12" fill="#ffffff" opacity="0.6" />
      <circle cx="72" cy="200" r="12" fill="#ffffff" opacity="0.6" />
      <circle cx="72" cy="240" r="12" fill="#ffffff" opacity="0.6" />

      <!-- Canvas Area with Posters -->
      <rect x="115" y="55" width="410" height="230" rx="8" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1" />
      
      <!-- Vibrant Design on canvas -->
      <rect x="130" y="70" width="380" height="120" rx="8" fill="url(#canvaGrad)" />
      <text x="150" y="115" font-family="'Plus Jakarta Sans', Arial" font-size="24" font-weight="900" fill="#ffffff">CREATIVE DESIGN</text>
      <text x="150" y="145" font-family="'Plus Jakarta Sans', Arial" font-size="18" font-weight="800" fill="#fde047">SOLUTIONS &amp; BRANDING</text>

      <!-- 3 thumbnail post cards below canvas -->
      <rect x="130" y="200" width="115" height="75" rx="6" fill="#1e293b" />
      <text x="140" y="240" font-family="'Plus Jakarta Sans', Arial" font-size="11" font-weight="800" fill="#fff">BUSINESS POST</text>

      <rect x="260" y="200" width="115" height="75" rx="6" fill="#ec4899" />
      <text x="275" y="240" font-family="'Plus Jakarta Sans', Arial" font-size="11" font-weight="800" fill="#fff">FASHION SALE</text>

      <rect x="390" y="200" width="115" height="75" rx="6" fill="#0284c7" />
      <text x="405" y="240" font-family="'Plus Jakarta Sans', Arial" font-size="11" font-weight="800" fill="#fff">AGENCY POST</text>

      <!-- Big Canva Round Logo Stamp -->
      <g transform="translate(370, 270)">
        <circle cx="70" cy="70" r="65" fill="#00c4cc" stroke="#ffffff" stroke-width="8" />
        <text x="70" y="85" font-family="'Plus Jakarta Sans', Brush Script MT, cursive, Arial" font-size="44" font-weight="900" fill="#ffffff" text-anchor="middle">Canva</text>
      </g>
    </g>

    <!-- Bottom Yellow Banner -->
    <g transform="translate(60, 620)">
      <rect width="1160" height="60" rx="10" fill="#eab308" />
      <text x="580" y="38" font-family="'Plus Jakarta Sans', Arial" font-size="22" font-weight="900" fill="#0f172a" text-anchor="middle" letter-spacing="1">MASTER GRAPHIC DESIGN WITH CANVA • CREATE • DESIGN • INSPIRE</text>
    </g>
  </svg>
  `;

  const buf = Buffer.from(svg);
  for (const dir of targetDirs) {
    await sharp(buf).png().toFile(path.join(dir, 'canva.png'));
    await sharp(buf).jpeg({ quality: 92 }).toFile(path.join(dir, 'thumb-graphics.jpeg'));
  }
  console.log('Saved canva.png & thumb-graphics.jpeg');
}

async function run() {
  await createProfileImage();
  await createYouTubeBanner();
  await createWordPressBanner();
  await createAIBanner();
  await createCanvaBanner();
  console.log('All 5 high-resolution images generated and placed successfully!');
}

run().catch(console.error);
