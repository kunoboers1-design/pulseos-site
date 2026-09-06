// MARK: - Aanmelden voor appupdates
// Comment NL: Een vast formulier vervangt de automatische pop-up; aanmelden gebeurt alleen op verzoek.
(() => {
  const apps = [
    ['pulsefx', 'PulseFX'], ['pulsevinyl', 'PulseVinyl'], ['pulserecipes', 'PulseRecipes'],
    ['pulsesidequest', 'PulseSideQuest'], ['pulsereflect', 'PulseReflect'],
    ['pulsewiish', 'PulseWiish'], ['pulselift', 'PulseLift'], ['pulsehabits', 'PulseHabits']
  ];

  function start() {
    const footer = document.querySelector('.site-footer');
    if (!footer || document.getElementById('email-updates')) return;
    const slug = window.location.pathname.split('/').filter(Boolean)[0] || '';
    const current = apps.find(([id]) => id === slug);
    const style = document.createElement('link');
    style.rel = 'stylesheet'; style.href = '/newsletter.css';
    document.head.appendChild(style);

    const section = document.createElement('section');
    section.id = 'email-updates'; section.className = 'newsletter-section';
    section.setAttribute('aria-labelledby', 'newsletter-title');
    section.innerHTML = `
      <div class="newsletter-inner">
        <div class="newsletter-copy">
          <span class="newsletter-label">Keep in the loop</span>
          <h2 id="newsletter-title">${current ? `${current[1]} updates.<br>In your inbox.` : 'Your apps. Their next chapter.'}</h2>
          <p>New features, useful improvements, and what changed. Choose the apps you want to hear about.</p>
        </div>
        <form class="newsletter-form">
          <label class="newsletter-email-label" for="newsletter-email">Email address</label>
          <div class="newsletter-email-row">
            <input id="newsletter-email" name="email" type="email" placeholder="you@example.com" autocomplete="email" required maxlength="254">
            <button type="submit">Get updates <span aria-hidden="true">↗</span></button>
          </div>
          <fieldset class="newsletter-apps"><legend>App updates</legend>
            ${apps.map(([id, name]) => `<label><input type="checkbox" name="app" value="${id}" ${current?.[0] === id ? 'checked' : ''}> ${name}</label>`).join('')}
          </fieldset>
          <label class="newsletter-releases"><input type="checkbox" name="releases"> Also tell me about new PulseOS apps</label>
          <p class="newsletter-note">Only the news you choose. Unsubscribe from any email. <a href="/privacy/">Privacy</a></p>
          <p class="newsletter-message" role="status" aria-live="polite"></p>
        </form>
      </div>`;
    footer.before(section);

    const form = section.querySelector('form');
    const message = section.querySelector('.newsletter-message');
    const button = form.querySelector('button');
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!form.reportValidity() || button.disabled) return;
      const data = new FormData(form);
      const selectedApps = data.getAll('app');
      const preferences = data.has('releases') ? ['releases'] : [];
      if (selectedApps.length) preferences.push('updates');
      if (!preferences.length) {
        message.textContent = 'Choose at least one app or new app announcements.';
        return;
      }
      button.disabled = true;
      message.textContent = 'Saving your choices…';
      try {
        const response = await fetch('/api/subscribe', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: data.get('email'), apps: selectedApps, preferences })
        });
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error('subscribe-failed');
        message.textContent = 'You’re on the list. We’ll email you when there’s news for your choices.';
        form.reset();
      } catch {
        message.textContent = 'We couldn’t save your subscription. Please try again later.';
      } finally {
        button.disabled = false;
      }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
