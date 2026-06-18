export type IconName =
  | 'admin'
  | 'arrow-up'
  | 'bold'
  | 'checkbox'
  | 'checkboxes'
  | 'close'
  | 'copy'
  | 'clock'
  | 'download'
  | 'edit'
  | 'eye'
  | 'heading'
  | 'image'
  | 'import'
  | 'info'
  | 'italic'
  | 'library'
  | 'link'
  | 'log-in'
  | 'log-out'
  | 'map'
  | 'pages'
  | 'plus'
  | 'progress'
  | 'save'
  | 'search'
  | 'settings'
  | 'trash'
  | 'underline'
  | 'upload'
  | 'external-link';

const ICONS: Record<IconName, string> = {
  admin:
    '<path d="M12 3l7 4v6c0 5-3.5 7.5-7 9-3.5-1.5-7-4-7-9V7l7-4z"/><path d="M9 12l2 2 4-4"/>',
  'arrow-up': '<path d="M12 19V5"/><path d="M5 12l7-7 7 7"/>',
  bold:
    '<path d="M6 4h8a4 4 0 0 1 0 8H6z"/><path d="M6 12h9a4 4 0 0 1 0 8H6z"/>',
  checkbox: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  checkboxes:
    '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/><path d="M9 5H5"/><path d="M9 9H5"/>',
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  clock:
    '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  download:
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>',
  edit:
    '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>',
  eye:
    '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  heading: '<path d="M6 12h12"/><path d="M6 4v16"/><path d="M18 4v16"/>',
  image:
    '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
  import:
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  italic: '<path d="M19 4h-9"/><path d="M14 20H5"/><path d="M15 4 9 20"/>',
  library:
    '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  link:
    '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  'log-in':
    '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/>',
  'log-out':
    '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
  map:
    '<path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3-6-3z"/><path d="M9 3v15"/><path d="M15 6v15"/>',
  pages:
    '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  progress:
    '<path d="M3 3v18h18"/><path d="M7 16l4-4 4 4 6-6"/>',
  save:
    '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  settings:
    '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  trash:
    '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/>',
  underline: '<path d="M6 4v6a6 6 0 0 0 12 0V4"/><path d="M4 20h16"/>',
  upload:
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/>',
  'external-link':
    '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
};

export function icon(name: IconName, className = 'ui-icon'): string {
  return `<svg class="${className}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
}

export function iconLabel(name: IconName, label: string, iconClass = 'ui-icon'): string {
  return `<span class="icon-label">${icon(name, iconClass)}<span>${label}</span></span>`;
}

export const EDITOR_TAB_ICONS: Record<string, IconName> = {
  content: 'pages',
  images: 'image',
  maps: 'map',
  checkboxes: 'checkboxes',
  tags: 'progress',
  admin: 'admin',
};

export const MARKDOWN_TOOLBAR_ICONS: Record<string, IconName> = {
  h1: 'heading',
  h2: 'heading',
  h3: 'heading',
  bold: 'bold',
  italic: 'italic',
  underline: 'underline',
  link: 'link',
  checkbox: 'checkbox',
  progress: 'progress',
  map: 'map',
  image: 'image',
};
