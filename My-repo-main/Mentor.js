/**
 * Ahmad Saleem Mentorship Platform — Pure Vanilla JavaScript
 * No Frameworks. Fast, modular DOM manipulation, theme management, and UI state.
 */

// Self-contained Lucide SVG Icons for 100% offline & iframe reliability
const SVG_ICONS = {
  'graduation-cap': `<svg class="icon" viewBox="0 0 24 24"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>`,
  'sun': `<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>`,
  'moon': `<svg class="icon" viewBox="0 0 24 24"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`,
  'menu': `<svg class="icon" viewBox="0 0 24 24"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>`,
  'sparkles': `<svg class="icon" viewBox="0 0 24 24"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>`,
  'arrow-right': `<svg class="icon" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`,
  'arrow-left': `<svg class="icon" viewBox="0 0 24 24"><path d="m12 19-7-7 7-7M19 12H5"/></svg>`,
  'user-plus': `<svg class="icon" viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/></svg>`,
  'user': `<svg class="icon" viewBox="0 0 24 24"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  'check-circle-2': `<svg class="icon" viewBox="0 0 24 24"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>`,
  'upload': `<svg class="icon" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>`,
  'rotate-ccw': `<svg class="icon" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>`,
  'play-circle': `<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>`,
  'clock': `<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  'award': `<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>`,
  'file-check-2': `<svg class="icon" viewBox="0 0 24 24"><path d="M4 22h14a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v4"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="m3 15 2 2 4-4"/></svg>`,
  'log-in': `<svg class="icon" viewBox="0 0 24 24"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" x2="3" y1="12" y2="12"/></svg>`,
  'mail': `<svg class="icon" viewBox="0 0 24 24"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>`,
  'lock': `<svg class="icon" viewBox="0 0 24 24"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
  'phone': `<svg class="icon" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
  'credit-card': `<svg class="icon" viewBox="0 0 24 24"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>`,
  'shield-alert': `<svg class="icon" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>`,
  'shield-check': `<svg class="icon" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>`,
  'shield': `<svg class="icon" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  'book-open': `<svg class="icon" viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`,
  'book-plus': `<svg class="icon" viewBox="0 0 24 24"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6 6h10"/><path d="M6 10h10"/><path d="M18 15h6"/><path d="M21 12v6"/></svg>`,
  'external-link': `<svg class="icon" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" x2="21" y1="14" y2="3"/></svg>`,
  'send': `<svg class="icon" viewBox="0 0 24 24"><line x1="22" x2="11" y1="2" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,
  'help-circle': `<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>`,
  'plus': `<svg class="icon" viewBox="0 0 24 24"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg>`,
  'chevron-down': `<svg class="icon" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>`,
  'x': `<svg class="icon" viewBox="0 0 24 24"><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg>`,
  'image': `<svg class="icon" viewBox="0 0 24 24"><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>`,
  'trash-2': `<svg class="icon" viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>`
};

function getIcon(name) {
  return SVG_ICONS[name] || `<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>`;
}

// Initial Seed Data
const INITIAL_COURSES = [
  {
    id: 'c1',
    title: 'YouTube Automation',
    description: 'Master YouTube channel growth, automation tools, and content strategy.',
    badge: 'Advanced',
    duration: '2 Months',
    level: 'Advanced',
    image: 'images/yt.png',
    page: 'course-youtube-automation.html',
    playlist: 'https://youtube.com/playlist?list=PLfwp9CvuUprE&si=PQzJ7KfoQkhiD6xm',
    highlights: ['Niche and content research', 'Channel automation workflows', 'YouTube SEO and analytics'],
    magic: 'Turn a simple idea into a repeatable content engine that can grow while you focus on the creative direction.',
    tools: 'YouTube Studio, content planning tools, thumbnail workflows, and automation systems',
    bestFor: 'Creators, entrepreneurs, and anyone who wants to build a channel with a clear strategy.'
  },
  {
    id: 'c2',
    title: 'Graphic Designing through Canva',
    description: 'Create stunning graphics with Canva for social media, branding and more.',
    badge: 'Advanced',
    duration: '2 Months',
    level: 'Advanced',
    image: 'images/canva.png',
    page: 'course-canva.html',
    playlist: 'https://youtube.com/playlist?list=PLEUsuq8UIsYA&si=Qs0RNbVoQD7Kdng4',
    highlights: ['Design fundamentals and composition', 'Canva tools and brand kits', 'Social media graphics and exports'],
    magic: 'Make polished visuals feel effortless by turning your ideas into designs that look consistent, clear, and ready to share.',
    tools: 'Canva, brand kits, templates, social media layouts, and visual content systems',
    bestFor: 'Beginners, small businesses, content creators, and anyone who wants stronger visual communication.'
  },
  {
    id: 'c3',
    title: 'Web Development through WordPress',
    description: 'Build professional websites without coding using WordPress.',
    badge: 'Advanced',
    duration: '2 Months',
    level: 'Advanced',
    image: 'images/wp.png',
    page: 'course-wordpress.html',
    playlist: 'https://youtube.com/playlist?list=PLc0Bqc25RKTg&si=RezB3e_Dcfm7jOqA',
    highlights: ['WordPress setup and configuration', 'Themes, plugins, and page builders', 'Responsive websites and basic SEO'],
    magic: 'Go from a blank domain to a professional online home without needing to write every line of code yourself.',
    tools: 'WordPress, themes, plugins, page builders, hosting dashboards, and SEO tools',
    bestFor: 'Freelancers, business owners, bloggers, and aspiring website builders.'
  },
  {
    id: 'c4',
    title: 'Advanced Artificial Intelligence',
    description: 'Explore AI tools, automation, image/video generation, AI productivity.',
    badge: 'Advanced',
    duration: '2 Months',
    level: 'Advanced',
    image: 'images/Ai.png',
    page: 'course-artificial-intelligence.html',
    playlist: 'https://youtube.com/playlist?list=PLQTO9V3Zldy4&si=y9dn_XdUIkElVZkj',
    highlights: ['Practical AI tools and workflows', 'Image and video generation', 'AI-powered productivity and automation'],
    magic: 'Use the new generation of AI as a creative partner and productivity engine for ideas, media, and everyday work.',
    tools: 'AI assistants, prompt workflows, image and video generators, and automation tools',
    bestFor: 'Students, professionals, creators, and curious learners who want to work smarter with AI.'
  }
];

const INITIAL_FAQS = [
  {
    q: 'Which course should I start with?',
    a: 'Start with the course that matches your current goal: YouTube Automation for content growth, Canva for visual design, WordPress for websites, or Artificial Intelligence for modern AI tools and workflows.'
  },
  {
    q: 'Are the courses suitable for beginners?',
    a: 'Yes. Each course introduces its main tools and practical concepts step by step, with a clear focus on useful skills rather than unnecessary theory.'
  },
  {
    q: 'What skills will I learn?',
    a: 'You will learn practical skills in content strategy, Canva design, WordPress website building, AI tools, automation, and digital productivity.'
  },
  {
    q: 'Can I switch between daylight and dark mode?',
    a: 'Yes. Use the theme button in the top navigation bar to switch between Daylight and Dark mode at any time.'
  }
];

// App Controller
const app = {
  currentView: 'home',
  theme: 'light',
  currentCourseId: null,
  courses: [...INITIAL_COURSES],

  init() {
    const savedTheme = localStorage.getItem('themePreference');
    this.theme = savedTheme === 'dark' ? 'dark' : 'light';
    document.body.classList.toggle('dark-theme', this.theme === 'dark');
    document.body.classList.toggle('light-theme', this.theme === 'light');
    this.renderIcons();
    this.renderAllCourses();
    this.renderFaqs();
    this.initScrollReveal();
    this.updateThemeToggle();
    this.renderIcons();
    if (location.hash === '#viewCourses') this.navigate('courses');
  },

  // Icon replacement helper
  renderIcons() {
    document.querySelectorAll('[data-lucide]').forEach(el => {
      const name = el.getAttribute('data-lucide');
      if (name && SVG_ICONS[name]) {
        el.outerHTML = SVG_ICONS[name];
      }
    });
  },

  initScrollReveal() {
    const targets = document.querySelectorAll(
      '.hero-left > *, .hero-right, .how-it-works-card, .faq-section, #viewCourses .page-heading, #allCoursesGrid .course-card'
    );
    targets.forEach((element, index) => {
      element.classList.add('scroll-reveal');
      element.style.setProperty('--reveal-delay', `${Math.min(index % 4, 3) * 80}ms`);
    });

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      targets.forEach(element => element.classList.add('is-visible'));
      return;
    }

    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });

    targets.forEach(element => observer.observe(element));
  },

  // 1. Navigation Controller
  navigate(viewId, courseId = null) {
    this.currentView = viewId;
    this.currentCourseId = courseId;

    // Update Nav Buttons
    document.querySelectorAll('.nav-link').forEach(btn => btn.classList.remove('active'));
    const activeNav = document.getElementById(`nav${viewId.charAt(0).toUpperCase() + viewId.slice(1)}Btn`);
    if (activeNav) activeNav.classList.add('active');

    // Close Mobile Drawer
    const drawer = document.getElementById('mobileDrawer');
    if (drawer) drawer.classList.remove('open');

    // Show selected view
    document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
    const targetSection = document.getElementById(`view${viewId.charAt(0).toUpperCase() + viewId.slice(1)}`);
    if (targetSection) {
      targetSection.classList.add('active');
    }

    // Scroll to top smoothly
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Refresh icons
    this.renderIcons();
  },

  toggleMobileMenu() {
    const drawer = document.getElementById('mobileDrawer');
    const menuButton = document.getElementById('mobileMenuBtn');
    if (!drawer) return;

    const isOpen = drawer.classList.toggle('open');
    if (menuButton) {
      menuButton.setAttribute('aria-expanded', String(isOpen));
      menuButton.setAttribute('aria-label', isOpen ? 'Close navigation menu' : 'Open navigation menu');
    }
  },

  // 2. Theme Toggle (Daylight White vs Dark)
  toggleTheme() {
    const body = document.body;

    if (this.theme === 'light') {
      this.theme = 'dark';
      body.classList.remove('light-theme');
      body.classList.add('dark-theme');
    } else {
      this.theme = 'light';
      body.classList.remove('dark-theme');
      body.classList.add('light-theme');
    }

    localStorage.setItem('themePreference', this.theme);
    this.updateThemeToggle();
    this.renderIcons();
  },

  updateThemeToggle() {
    const icon = document.getElementById('themeIcon');
    const label = document.getElementById('themeLabel');
    const button = document.getElementById('themeToggleBtn');
    const darkMode = this.theme === 'dark';
    if (icon) icon.innerHTML = getIcon(darkMode ? 'sun' : 'moon');
    if (label) label.textContent = darkMode ? 'Light Mode' : 'Dark Mode';
    if (button) button.title = darkMode ? 'Switch to light theme' : 'Switch to dark theme';
  },

  // 3. Render Home & Courses
  renderAllCourses() {
    const container = document.getElementById('allCoursesGrid');
    if (!container) return;

    container.innerHTML = this.courses.map(course => `
      <a class="course-card" href="${course.page}" aria-label="Open ${course.title} course page">
        <div class="course-image-slot">${course.image ? `<img src="${course.image}" alt="${course.title}" onerror="this.parentElement.innerHTML='<span>${course.title}</span>'">` : `<span>${course.title}</span>`}</div>
        <div class="course-badge-row">
          <span class="badge badge-emerald">${course.duration || '6 Weeks'}</span>
        </div>
        <h3 class="course-title">${course.title}</h3>
        <p class="course-desc">${course.description}</p>
        <div class="course-footer">
          <span class="badge badge-amber">${course.level || 'All Levels'}</span>
          <span class="course-card-cta">Discover course ${getIcon('arrow-right')}</span>
        </div>
      </a>
    `).join('');
  },

  // FAQs
  renderFaqs() {
    const container = document.getElementById('faqList');
    if (!container) return;

    container.innerHTML = INITIAL_FAQS.map(faq => `
      <div class="faq-item">
        <button class="faq-question" onclick="this.parentElement.classList.toggle('open')">
          <span>${faq.q}</span>
          ${getIcon('chevron-down')}
        </button>
        <div class="faq-answer">
          ${faq.a}
        </div>
      </div>
    `).join('');
  },

  // Toast Notification
  showToast(message) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 3000);
  }
};

// Initialize App once DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => app.init());
} else {
  app.init();
}
