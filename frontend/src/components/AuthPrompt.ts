import { loginWithPassword } from '../api/client.js';
import { isLocallyAuthenticated } from '../storage/auth.js';
import { iconLabel } from './icons.js';

let activePrompt: Promise<boolean> | null = null;

export async function requireAuth(): Promise<boolean> {
  if (isLocallyAuthenticated()) {
    return true;
  }

  if (!activePrompt) {
    activePrompt = showAuthPrompt().finally(() => {
      activePrompt = null;
    });
  }

  return activePrompt;
}

function showAuthPrompt(): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'auth-overlay';
    overlay.innerHTML = `
      <div class="auth-dialog panel" role="dialog" aria-modal="true" aria-labelledby="auth-dialog-title">
        <h2 id="auth-dialog-title" class="auth-dialog-title">Admin sign in</h2>
        <p class="text-muted text-sm">Enter the admin password to create or edit game journals.</p>
        <form id="auth-form" class="auth-form">
          <label class="block">
            <span class="label">Password</span>
            <input type="password" id="auth-password" class="input" autocomplete="current-password" required />
          </label>
          <p id="auth-error" class="auth-error hidden"></p>
          <div class="auth-actions">
            <button type="submit" class="btn-primary">${iconLabel('log-in', 'Sign in')}</button>
            <button type="button" class="btn-secondary" data-action="cancel">${iconLabel('close', 'Cancel')}</button>
          </div>
        </form>
      </div>
    `;

    const form = overlay.querySelector('#auth-form') as HTMLFormElement;
    const passwordInput = overlay.querySelector('#auth-password') as HTMLInputElement;
    const errorEl = overlay.querySelector('#auth-error') as HTMLElement;
    const cancelButton = overlay.querySelector('[data-action="cancel"]') as HTMLButtonElement;

    const close = (success: boolean): void => {
      document.removeEventListener('keydown', onKeyDown);
      overlay.remove();
      resolve(success);
      window.dispatchEvent(new CustomEvent('game-trackr:auth-changed'));
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        close(false);
      }
    };

    cancelButton.addEventListener('click', () => close(false));

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      errorEl.classList.add('hidden');
      errorEl.textContent = '';

      const submitButton = form.querySelector('button[type="submit"]') as HTMLButtonElement;
      submitButton.disabled = true;

      try {
        await loginWithPassword(passwordInput.value);
        close(true);
      } catch (error) {
        errorEl.textContent = error instanceof Error ? error.message : 'Sign in failed';
        errorEl.classList.remove('hidden');
        submitButton.disabled = false;
        passwordInput.focus();
        passwordInput.select();
      }
    });

    document.addEventListener('keydown', onKeyDown);
    document.body.appendChild(overlay);
    passwordInput.focus();
  });
}
