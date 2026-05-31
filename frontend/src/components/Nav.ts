import { navigate } from '../router.js';

export function renderNav(container: HTMLElement): void {
  container.innerHTML = `
    <div class="nav-mobile">
      <button
        type="button"
        class="nav-menu-toggle"
        aria-expanded="false"
        aria-controls="nav-menu"
        aria-label="Open menu"
      >
        <span class="nav-menu-icon" aria-hidden="true">
          <span></span>
          <span></span>
          <span></span>
        </span>
      </button>
      <nav id="nav-menu" class="nav-menu" aria-label="Main">
        <button type="button" data-nav="library" class="nav-link">Library</button>
        <button type="button" data-nav="settings" class="nav-link">Settings</button>
      </nav>
    </div>
  `;

  const toggle = container.querySelector('.nav-menu-toggle') as HTMLButtonElement;
  const menu = container.querySelector('#nav-menu') as HTMLElement;

  const setOpen = (open: boolean): void => {
    menu.classList.toggle('is-open', open);
    toggle.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  };

  const onToggle = (event: Event): void => {
    event.stopPropagation();
    setOpen(!menu.classList.contains('is-open'));
  };

  const onDocumentClick = (event: Event): void => {
    if (!container.contains(event.target as Node)) {
      setOpen(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  toggle.addEventListener('click', onToggle);
  document.addEventListener('click', onDocumentClick);
  document.addEventListener('keydown', onKeyDown);

  container.querySelectorAll('[data-nav]').forEach((button) => {
    button.addEventListener('click', () => {
      const target = (button as HTMLElement).dataset.nav;
      setOpen(false);
      if (target === 'library') navigate('/');
      if (target === 'settings') navigate('/settings');
    });
  });
}
