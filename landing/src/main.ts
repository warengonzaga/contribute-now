// Nav scroll effect
const nav = document.getElementById('nav');
if (nav) {
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 20);
  });
}

// Mobile hamburger menu
const hamburger = document.getElementById('navHamburger');
const navLinks = document.getElementById('navLinks');
if (hamburger && navLinks) {
  hamburger.addEventListener('click', () => {
    const isOpen = navLinks.classList.toggle('open');
    hamburger.classList.toggle('active', isOpen);
    hamburger.setAttribute('aria-expanded', String(isOpen));
    document.body.style.overflow = isOpen ? 'hidden' : '';
  });
  navLinks.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      navLinks.classList.remove('open');
      hamburger.classList.remove('active');
      hamburger.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    });
  });
}

// Copy to clipboard helper
async function copyText(text: string, btn: HTMLButtonElement) {
  try {
    await navigator.clipboard.writeText(text);
    btn.classList.add('copied');
    const original = btn.innerHTML;
    btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`;
    setTimeout(() => {
      btn.classList.remove('copied');
      btn.innerHTML = original;
    }, 2000);
  } catch {
    // clipboard not available
  }
}

// Hero copy button
const copyHero = document.getElementById('copyHero') as HTMLButtonElement;
const heroCmd = document.getElementById('heroCmd');
if (copyHero && heroCmd) {
  copyHero.addEventListener('click', () => copyText(heroCmd.textContent ?? '', copyHero));
}

// CTA copy button
const copyCta = document.getElementById('copyCta') as HTMLButtonElement;
const ctaCmd = document.getElementById('ctaCmd');
if (copyCta && ctaCmd) {
  copyCta.addEventListener('click', () => copyText(ctaCmd.textContent ?? '', copyCta));
}

// Code block copy buttons
document.querySelectorAll<HTMLButtonElement>('.copy-code').forEach((btn) => {
  btn.addEventListener('click', () => {
    const code =
      btn.dataset.code ?? btn.closest('.code-block')?.querySelector('code')?.textContent ?? '';
    copyText(code.trim(), btn);
  });
});

// Intersection observer for scroll animations
const observer = new IntersectionObserver(
  (entries) =>
    entries.forEach((e) => {
      if (e.isIntersecting) e.target.classList.add('visible');
    }),
  { threshold: 0.12 },
);
document.querySelectorAll('[data-animate]').forEach((el) => {
  observer.observe(el);
});

// Add data-animate to cards and sections after initial render
window.addEventListener('DOMContentLoaded', () => {
  const selectors = [
    '.problem-card',
    '.feature-card',
    '.step',
    '.prereq-card',
    '.ai-table-wrap',
    '.solution-callout',
    '.cmd-card',
    '.cmd-category',
    '.workflow-flow',
    '.golden-ring',
    '.sponsor-card',
  ];
  selectors.forEach((sel) => {
    document.querySelectorAll(sel).forEach((el, i) => {
      el.setAttribute('data-animate', '');
      (el as HTMLElement).style.transitionDelay = `${i * 80}ms`;
    });
  });
  document.querySelectorAll('[data-animate]').forEach((el) => {
    observer.observe(el);
  });

  // Fetch live GitHub star count
  const starCountEl = document.getElementById('starCount');
  if (starCountEl) {
    fetch('https://api.github.com/repos/warengonzaga/contribute-now')
      .then((r) => r.json())
      .then((data: { stargazers_count?: number }) => {
        if (typeof data.stargazers_count === 'number') {
          const count = data.stargazers_count;
          starCountEl.textContent = count >= 1000 ? `${(count / 1000).toFixed(1)}k` : String(count);
          starCountEl.classList.add('loaded');
        }
      })
      .catch(() => {
        // Silent fail — "—" stays as placeholder
      });
  }
});
