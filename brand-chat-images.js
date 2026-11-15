/* Private brand-chat attachments. Reuse the existing project-scoped conversation bucket.
   Images and drafts stay in memory; downloads require the signed-in member's access. */
'use strict';
window.createBrandChatImages = ({getData, getProjectId, prefix = 'fragile'}) => {
  const $ = suffix => document.getElementById(prefix + suffix);
  const form = $('ChatForm'), text = $('ChatText'), send = $('ChatSend'), status = $('ChatStatus');
  const bucket = 'quest-thread-images';
  const types = {'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif'};
  const node = (tag, value = '', className = '') => {
    const element = document.createElement(tag); element.textContent = value;
    if (className) element.className = className;
    return element;
  };
  const context = () => {const d = getData(); return {db: d.db, uid: d.user?.id, project: getProjectId()};};
  let epoch = 0, files = [], attempt = null, ready = false, busy = false, writable = false;
  let visiblePaths = new Set();
  const urls = new Map(), loading = new Map();
  const loaders = new WeakMap();
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) {observer.unobserve(entry.target); void loaders.get(entry.target)?.();}
  }, {rootMargin: '200px'});
  const current = (token, c) => token === epoch && context().uid === c.uid && context().project === c.project;
  const picker = node('input'); picker.id = prefix + 'ChatImages'; picker.type = 'file'; picker.multiple = true;
  picker.accept = Object.keys(types).join(','); picker.className = 'brand-chat-image-input';
  picker.setAttribute('aria-label', 'Choose images for the ' + prefix + ' brand chat');
  const attach = node('button', '＋ Photos', 'button brand-chat-attach'); attach.type = 'button';
  attach.id = prefix + 'ChatAttach'; attach.setAttribute('aria-controls', picker.id);
  attach.onclick = () => {if (ready && writable && !busy) picker.click();};
  const preview = node('div', '', 'brand-chat-previews'); preview.id = prefix + 'ChatPreviews';
  const help = node('small', 'Up to 4 photos · JPG, PNG, WebP or GIF · 8 MB each');
  const actions = node('div', '', 'brand-chat-image-actions');
  actions.append(attach, picker, help, send); form.append(preview, actions);
  form.classList.add('brand-image-composer'); text.required = false;
  const viewer = node('dialog', '', 'brand-chat-image-dialog'); viewer.id = prefix + 'ChatImageDialog';
  viewer.setAttribute('aria-label', 'Shared brand chat image');
  const close = node('button', 'Close image', 'button'); close.type = 'button'; close.onclick = () => viewer.close();
  const large = node('img'); large.alt = 'Shared brand chat photo'; viewer.append(close, large);
  document.body.append(viewer);
  viewer.addEventListener('click', event => {if (event.target === viewer) viewer.close();});
  viewer.addEventListener('close', () => {large.removeAttribute('src'); delete viewer.dataset.path;});

  function controls() {
    picker.disabled = attach.disabled = !ready || !writable || busy;
    for (const b of preview.querySelectorAll('button')) b.disabled = busy || !writable;
    form.dataset.appDirty = String(files.length > 0 || !!text.value.trim());
    form.dataset.appSaving = String(busy);
    send.textContent = busy ? 'Posting…' : 'Post to brand chat';
  }
  function renderDraft() {
    preview.replaceChildren();
    files.forEach((entry, i) => {
      const tile = node('div', '', 'brand-chat-preview'), image = node('img');
      image.src = entry.url; image.alt = entry.file.name;
      const remove = node('button', '×', 'brand-chat-remove'); remove.type = 'button';
      remove.setAttribute('aria-label', 'Remove ' + entry.file.name);
      remove.onclick = () => {
        if (busy || !writable) return;
        URL.revokeObjectURL(entry.url); files.splice(i, 1); attempt = null; renderDraft();
      };
      tile.append(image, remove); preview.append(tile);
    });
    controls();
  }
  picker.addEventListener('change', () => {
    const selected = Array.from(picker.files || []); picker.value = '';
    if (!ready || !writable || busy || !selected.length) return;
    if (files.length + selected.length > 4) {status.textContent = 'Choose up to 4 photos per message.'; return;}
    if (selected.some(file => !types[file.type] || file.size < 1 || file.size > 8 * 1024 * 1024)) {
      status.textContent = 'Choose JPG, PNG, WebP or GIF photos, up to 8 MB each.'; return;
    }
    files.push(...selected.map(file => ({file, url: URL.createObjectURL(file)})));
    attempt = null; renderDraft();
    status.textContent = 'Photos selected. Press Post to brand chat to share them.';
  });
  text.addEventListener('input', controls);

  function validPath(message, path) {
    const c = context();
    return message.project_id === c.project && typeof path === 'string' &&
      path.startsWith(c.project + '/' + message.user_id + '/') &&
      path.split('/').length === 3 && /^[0-9a-f-]{36}\.(jpg|png|webp|gif)$/.test(path.split('/')[2]);
  }
  function discardImage(path) {
    const url = urls.get(path); if (url) URL.revokeObjectURL(url);
    urls.delete(path);
    if (viewer.dataset.path === path) viewer.close();
  }
  function reconcile(messages) {
    observer.disconnect();
    visiblePaths = new Set(messages.flatMap(message => (message.image_paths || []).filter(path => validPath(message, path))));
    for (const path of urls.keys()) if (!visiblePaths.has(path)) discardImage(path);
    if (viewer.open && !visiblePaths.has(viewer.dataset.path)) viewer.close();
  }
  async function imageUrl(path) {
    if (urls.has(path)) return urls.get(path);
    if (loading.has(path)) return loading.get(path);
    const c = context(), token = epoch;
    const pending = (async () => {
      const result = await c.db.storage.from(bucket).download(path);
      if (!current(token, c) || !ready || !visiblePaths.has(path)) return null;
      if (result.error) throw result.error;
      const url = URL.createObjectURL(result.data); urls.set(path, url); return url;
    })();
    loading.set(path, pending);
    try {return await pending;}
    finally {if (loading.get(path) === pending) loading.delete(path);}
  }
  function gallery(message) {
    const paths = (message.image_paths || []).filter(path => validPath(message, path));
    if (!paths.length) return null;
    const grid = node('div', '', 'brand-chat-gallery'); grid.dataset.count = String(paths.length);
    paths.forEach((path, i) => {
      const tile = node('div', '', 'brand-chat-photo'), image = node('img');
      const open = node('button', '', 'brand-chat-image-open'); open.type = 'button'; image.loading = 'lazy';
      open.setAttribute('aria-label', 'Open shared photo ' + (i + 1)); image.alt = 'Shared brand photo ' + (i + 1);
      const state = node('span', 'Loading photo…', 'brand-chat-image-state');
      open.append(image); tile.append(open, state); grid.append(tile);
      open.disabled = true;
      open.onclick = () => {
        if (!ready || !urls.has(path) || !visiblePaths.has(path)) return;
        large.src = urls.get(path); viewer.dataset.path = path; viewer.showModal();
      };
      const load = async () => {
        const token = epoch, c = context();
        state.replaceChildren(); state.textContent = 'Loading photo…'; state.hidden = false;
        try {
          const url = await imageUrl(path);
          if (!url || !current(token, c) || !tile.isConnected) return;
          image.src = url; open.disabled = false; state.hidden = true;
        } catch {
          if (!current(token, c) || !tile.isConnected) return;
          const retry = node('button', 'Retry photo', 'button'); retry.type = 'button'; retry.onclick = () => void load();
          state.replaceChildren(node('span', 'Photo could not load. '), retry);
        }
      };
      image.onerror = () => {
        open.disabled = true; state.hidden = false; discardImage(path);
        const retry = node('button', 'Retry photo', 'button'); retry.type = 'button'; retry.onclick = () => void load();
        state.replaceChildren(node('span', 'Photo unavailable. '), retry);
      };
      // Run after the new gallery has been attached by the studio renderer.
      loaders.set(tile, load);
      queueMicrotask(() => {if (tile.isConnected && ready) observer.observe(tile);});
    });
    return grid;
  }
  function beginPost(body) {
    if (!files.length) return null;
    if (!attempt || attempt.body !== body || attempt.files.length !== files.length ||
        attempt.files.some((entry, i) => entry !== files[i])) {
      attempt = {id: crypto.randomUUID(), body, files: [...files], uploads: [], epoch, uid: context().uid, project: context().project};
    }
    return attempt;
  }
  async function upload(draft) {
    const c = context(), token = draft.epoch;
    if (!current(token, c) || draft.uid !== c.uid || draft.project !== c.project) throw Error('Your sign-in or project access changed.');
    for (let i = draft.uploads.length; i < draft.files.length; i++) {
      if (!current(token, c)) throw Error('Your sign-in or project access changed.');
      const file = draft.files[i].file;
      const path = c.project + '/' + c.uid + '/' + crypto.randomUUID() + '.' + types[file.type];
      status.textContent = 'Uploading photo ' + (i + 1) + ' of ' + draft.files.length + '…';
      const result = await c.db.storage.from(bucket).upload(path, file, {contentType: file.type, cacheControl: '0', upsert: false});
      if (result.error) throw result.error;
      if (!current(token, c)) {
        try {await c.db.storage.from(bucket).remove([path]);} catch {}
        throw Error('Your sign-in or project access changed.');
      }
      draft.uploads.push(path);
    }
    return [...draft.uploads];
  }
  function finishPost(draft) {
    if (attempt !== draft) return;
    for (const entry of files) URL.revokeObjectURL(entry.url);
    files = []; attempt = null; renderDraft();
  }
  function showPostError(error) {
    const setup = ['42703', 'PGRST204', 'PGRST205', '42P01'].includes(error?.code) ||
      /bucket not found|image_paths.*(column|schema)|column.*image_paths/i.test(error?.message || '');
    status.textContent = setup ?
      'Image sharing needs the conversation-storage setup. Your text and selected photos are still here. ' :
      'Could not post. Your text and selected photos are still here. Retry when connected.';
    if (setup && getData().policy?.is_admin) {
      const link = node('a', 'Open image storage setup'); link.href = '/setup-guide.html#dusted-threads';
      link.target = '_blank'; link.rel = 'noopener noreferrer'; status.append(link);
    }
  }
  function reset() {
    epoch++; ready = writable = busy = false;
    observer.disconnect();
    for (const entry of files) URL.revokeObjectURL(entry.url);
    files = []; attempt = null; picker.value = ''; visiblePaths.clear(); loading.clear();
    for (const path of urls.keys()) discardImage(path);
    if (viewer.open) viewer.close(); large.removeAttribute('src');
    preview.replaceChildren(); controls();
  }
  reset();
  return {
    gallery, beginPost, upload, finishPost, showPostError,
    hasFiles: () => files.length > 0,
    paths: message => (message.image_paths || []).filter(path => validPath(message, path)),
    sync(state) {ready = state.ready; busy = state.busy; writable = state.writable; reconcile(ready ? state.messages : []); controls();},
    reset
  };
};
