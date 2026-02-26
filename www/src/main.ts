// Nav scroll effect
const nav = document.getElementById('nav');
if (nav) {
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 20);
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
});
