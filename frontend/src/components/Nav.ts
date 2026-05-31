import { fetchAuthStatus, logout } from '../api/client.js';
import { requireAuth } from './AuthPrompt.js';
import { isLocallyAuthenticated } from '../storage/auth.js';
import { navigate } from '../router.js';

export function renderNav(container: HTMLElement): void {
  const renderMarkup = (signedIn: boolean): string => `
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
        <button
          type="button"
          data-nav="auth"
          class="nav-link nav-link-auth ${signedIn ? 'is-signed-in' : ''}"
        >
          ${signedIn ? 'Sign out' : 'Sign in'}
        </button>
      </nav>
    </div>
  `;

  container.innerHTML = renderMarkup(isLocallyAuthenticated());

  const toggle = container.querySelector('.nav-menu-toggle') as HTMLButtonElement;
  const menu = container.querySelector('#nav-menu') as HTMLElement;

  const setOpen = (open: boolean): void => {
    menu.classList.toggle('is-open', open);
    toggle.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  };

  const refreshAuthState = async (): Promise<void> => {
    try {
      const status = await fetchAuthStatus();
      const signedIn = status.authenticated || isLocallyAuthenticated();
      const authButton = container.querySelector('[data-nav="auth"]') as HTMLButtonElement | null;
      if (authButton) {
        authButton.textContent = signedIn ? 'Sign out' : 'Sign in';
        authButton.classList.toggle('is-signed-in', signedIn);
      }
    } catch {
      const signedIn = isLocallyAuthenticated();
      const authButton = container.querySelector('[data-nav="auth"]') as HTMLButtonElement | null;
      if (authButton) {
        authButton.textContent = signedIn ? 'Sign out' : 'Sign in';
        authButton.classList.toggle('is-signed-in', signedIn);
      }
    }
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

  const onAuthChanged = (): void => {
    void refreshAuthState();
  };

  toggle.addEventListener('click', onToggle);
  document.addEventListener('click', onDocumentClick);
  document.addEventListener('keydown', onKeyDown);
  window.addEventListener('game-trackr:auth-changed', onAuthChanged);

  container.querySelectorAll('[data-nav]').forEach((button) => {
    button.addEventListener('click', async () => {
      const target = (button as HTMLElement).dataset.nav;
      setOpen(false);

      if (target === 'library') {
        navigate('/');
        return;
      }

      if (target === 'settings') {
        navigate('/settings');
        return;
      }

      if (target === 'auth') {
        if (isLocallyAuthenticated()) {
          logout();
          return;
        }

        await requireAuth();
      }
    });
  });

  void refreshAuthState();
}
