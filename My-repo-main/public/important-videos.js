(function () {
  'use strict';

  const main = document.getElementById('importantVideosMain');
  const grid = document.getElementById('ivVideoGrid');
  const status = document.getElementById('ivLibraryStatus');
  const routeParts = window.location.pathname.split('/').filter(Boolean);
  let slug = '';
  try {
    slug = routeParts.length > 1 ? decodeURIComponent(routeParts[1]) : '';
  } catch (error) {
    slug = '';
  }

  function setStatus(message, isError) {
    status.textContent = message;
    status.classList.toggle('iv-error', Boolean(isError));
  }

  function makeText(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = text || '';
    return element;
  }

  function appendDetails(parent, video) {
    const details = makeText('div', 'iv-details', video.details || 'Detailed information is not available yet.');
    details.hidden = true;
    const button = makeText('button', 'iv-details-toggle', 'How to Use / Benefits');
    button.type = 'button';
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('data-ad-popup', 'on');
    button.addEventListener('click', function () {
      const expanded = button.getAttribute('aria-expanded') === 'true';
      button.setAttribute('aria-expanded', String(!expanded));
      details.hidden = expanded;
    });
    parent.append(button, details);
  }

  function formatDate(value) {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? ''
      : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function makeVideoCard(video) {
    const card = document.createElement('article');
    card.className = 'iv-card' + (video.slug === 'muse-ai-complete-setup-guide' ? ' iv-card--muse' : '');
    card.setAttribute('aria-labelledby', `video-title-${video.id}`);
    let accents = null;
    if (video.slug === 'muse-ai-complete-setup-guide') {
      accents = document.createElement('span');
      accents.className = 'iv-card-art';
      accents.setAttribute('aria-hidden', 'true');
      for (let i = 0; i < 3; i += 1) accents.append(document.createElement('span'));
    }

    const thumb = document.createElement('div');
    thumb.className = 'iv-thumb';
    if (video.thumbnail_url) {
      const image = document.createElement('img');
      image.src = video.thumbnail_url;
      image.alt = `${video.title} video thumbnail`;
      image.loading = 'lazy';
      image.decoding = 'async';
      image.addEventListener('error', function () {
        thumb.replaceChildren(makeText('span', 'iv-thumb-placeholder', 'Thumbnail unavailable'));
      }, { once: true });
      thumb.append(image);
    } else {
      thumb.append(makeText('span', 'iv-thumb-placeholder', 'Thumbnail unavailable'));
    }

    const body = document.createElement('div');
    body.className = 'iv-card-body';
    const meta = document.createElement('div');
    meta.className = 'iv-meta';
    if (video.category) meta.append(makeText('span', 'iv-chip', video.category));
    const date = formatDate(video.published_at);
    if (date) meta.append(makeText('span', 'iv-date', date));

    const title = makeText('h3', '', video.title);
    title.id = `video-title-${video.id}`;
    const description = makeText('p', 'iv-card-description', video.description);
    const watch = makeText('a', 'iv-watch', '▶  Watch Video');
    watch.href = `/important-videos/${encodeURIComponent(video.slug)}`;
    watch.setAttribute('data-ad-popup', 'on');
    watch.setAttribute('aria-label', `Watch Video: ${video.title}`);
    if (accents) body.append(accents);
    body.append(meta, title, description, watch);
    appendDetails(body, video);
    card.append(thumb, body);
    return card;
  }

  function renderListing(videos) {
    grid.replaceChildren();
    if (!videos.length) {
      grid.append(makeText('p', 'iv-empty', 'There are no published videos yet. Please check back soon.'));
      setStatus('No published videos yet.');
      return;
    }
    videos.forEach(function (video) {
      grid.append(makeVideoCard(video));
    });
    setStatus(`${videos.length} ${videos.length === 1 ? 'video' : 'videos'}`);
  }

  function renderWatch(video) {
    const section = document.createElement('section');
    section.className = 'iv-watch-page';
    const back = makeText('a', 'iv-back', '←  Back to Important Videos');
    back.href = '/important-videos';
    const playerWrap = document.createElement('div');
    playerWrap.className = 'iv-player-wrap';
    const player = document.createElement('video');
    player.controls = true;
    player.playsInline = true;
    player.preload = 'metadata';
    player.poster = video.thumbnail_url || '';
    player.src = video.video_url;
    player.setAttribute('aria-label', video.title);
    player.addEventListener('error', function () {
      const error = makeText('p', 'iv-empty', 'This video could not be played. Try again later or return to the video library.');
      error.setAttribute('role', 'alert');
      playerWrap.replaceChildren(error);
    }, { once: true });
    playerWrap.append(player);

    const content = document.createElement('div');
    content.className = 'iv-watch-content';
    content.append(makeText('h1', '', video.title));
    if (video.category) content.append(makeText('span', 'iv-chip', video.category));
    if (video.description) content.append(makeText('p', '', video.description));
    content.append(makeText('p', 'iv-video-note', 'Playback may start muted or require you to press play, depending on your browser settings.'));

    const info = document.createElement('section');
    info.className = 'iv-information';
    info.append(makeText('h2', '', 'How to Use / Benefits'));
    info.append(makeText('div', 'iv-information-content', video.details || 'Detailed information is not available yet.'));
    section.append(back, playerWrap, content, info);
    main.replaceChildren(section);

    player.play().catch(function () {
      player.muted = true;
      player.play().catch(function () {
        content.querySelector('.iv-video-note').textContent = 'Automatic playback was not available. Use the player controls to start the video.';
      });
    });
  }

  async function loadListing() {
    try {
      const response = await fetch('/api/important-videos', { credentials: 'same-origin', cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Videos could not be loaded.');
      renderListing(result.videos || []);
    } catch (error) {
      setStatus(error.message, true);
      grid.replaceChildren(makeText('p', 'iv-empty', 'Videos could not be loaded right now. Please try again later.'));
    }
  }

  async function loadVideo() {
    const heading = document.getElementById('ivHeading');
    if (heading) heading.textContent = 'Loading video…';
    try {
      const response = await fetch(`/api/important-videos/${encodeURIComponent(slug)}`, {
        credentials: 'same-origin',
        cache: 'no-store'
      });
      const result = await response.json();
      if (!response.ok) throw new Error(response.status === 404 ? 'This video is unavailable or has not been published.' : result.error || 'This video could not be loaded.');
      renderWatch(result.video);
    } catch (error) {
      const unavailable = document.createElement('section');
      unavailable.className = 'iv-watch-page';
      unavailable.append(
        makeText('h1', '', 'Video unavailable'),
        makeText('p', 'iv-empty', error.message),
        Object.assign(makeText('a', 'iv-back', '←  Back to Important Videos'), { href: '/important-videos' })
      );
      main.replaceChildren(unavailable);
    }
  }

  if (slug) loadVideo();
  else loadListing();
})();
