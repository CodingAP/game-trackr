export function wireReturnToTop(button: HTMLElement, scrollTarget?: HTMLElement | null): () => void {
  const threshold = 320;

  const onScroll = () => {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    button.classList.toggle('is-visible', scrollTop > threshold);
  };

  const onClick = () => {
    if (scrollTarget) {
      scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  button.addEventListener('click', onClick);
  onScroll();

  return () => {
    window.removeEventListener('scroll', onScroll);
    button.removeEventListener('click', onClick);
  };
}
