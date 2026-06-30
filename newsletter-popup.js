(function () {
  const STORAGE_KEY = 'pulseos_newsletter_dismissed';

  function alreadyHandled() {
    try { return !!localStorage.getItem(STORAGE_KEY); } catch { return false; }
  }
  function markHandled() {
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch {}
  }

  if (alreadyHandled()) return;

  function inject() {
    const style = document.createElement('style');
    style.textContent = `
      #nl-overlay {
        position: fixed; inset: 0; z-index: 9999;
        background: rgba(0,0,0,.65);
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
        display: flex; align-items: center; justify-content: center;
        padding: 20px;
        opacity: 0; transition: opacity .25s ease;
      }
      #nl-overlay.nl-visible { opacity: 1; }
      #nl-card {
        background: #0f1117;
        border: 1px solid rgba(255,255,255,.08);
        border-radius: 20px;
        padding: 36px 32px 32px;
        max-width: 420px; width: 100%;
        position: relative;
        box-shadow: 0 32px 80px rgba(0,0,0,.6);
        transform: translateY(16px);
        transition: transform .3s cubic-bezier(.22,1,.36,1);
      }
      #nl-overlay.nl-visible #nl-card { transform: translateY(0); }
      #nl-close {
        position: absolute; top: 16px; right: 16px;
        background: none; border: none; cursor: pointer;
        color: rgba(255,255,255,.35); font-size: 20px; line-height: 1;
        padding: 4px; transition: color .15s;
      }
      #nl-close:hover { color: rgba(255,255,255,.7); }
      #nl-wordmark {
        font-family: 'Bricolage Grotesque', sans-serif;
        font-weight: 800; font-size: 13px;
        letter-spacing: .08em; color: rgba(255,255,255,.5);
        margin-bottom: 20px; display: block;
      }
      #nl-wordmark em { font-style: normal; color: #fff; }
      #nl-card h2 {
        font-family: 'Bricolage Grotesque', sans-serif;
        font-weight: 800; font-size: clamp(1.4rem, 5vw, 1.75rem);
        color: #fff; margin: 0 0 8px; line-height: 1.15;
      }
      #nl-card p {
        font-family: 'Inter', sans-serif;
        font-size: 14px; color: rgba(255,255,255,.5);
        margin: 0 0 24px; line-height: 1.6;
      }
      #nl-checks {
        display: flex; flex-direction: column; gap: 10px;
        margin-bottom: 20px;
      }
      .nl-check {
        display: flex; align-items: center; gap: 10px;
        font-family: 'Inter', sans-serif; font-size: 13px;
        color: rgba(255,255,255,.6); cursor: pointer;
      }
      .nl-check input[type="checkbox"] {
        appearance: none; -webkit-appearance: none;
        width: 17px; height: 17px; border-radius: 5px;
        border: 1.5px solid rgba(255,255,255,.2);
        background: transparent; cursor: pointer;
        flex-shrink: 0; position: relative; transition: border-color .15s, background .15s;
      }
      .nl-check input[type="checkbox"]:checked {
        background: #fff; border-color: #fff;
      }
      .nl-check input[type="checkbox"]:checked::after {
        content: '';
        position: absolute; top: 2px; left: 5px;
        width: 4px; height: 8px;
        border: 2px solid #0f1117; border-top: none; border-left: none;
        transform: rotate(45deg);
      }
      #nl-input-row {
        display: flex; gap: 8px;
      }
      #nl-email {
        flex: 1; padding: 12px 14px;
        background: rgba(255,255,255,.06);
        border: 1px solid rgba(255,255,255,.1);
        border-radius: 10px; outline: none;
        font-family: 'Inter', sans-serif; font-size: 14px;
        color: #fff; transition: border-color .15s;
        min-width: 0;
      }
      #nl-email::placeholder { color: rgba(255,255,255,.28); }
      #nl-email:focus { border-color: rgba(255,255,255,.3); }
      #nl-submit {
        padding: 12px 20px;
        background: #fff; color: #08090e;
        border: none; border-radius: 10px;
        font-family: 'Inter', sans-serif; font-weight: 600;
        font-size: 14px; cursor: pointer; white-space: nowrap;
        transition: opacity .15s;
        flex-shrink: 0;
      }
      #nl-submit:hover { opacity: .85; }
      #nl-submit:disabled { opacity: .5; cursor: default; }
      #nl-msg {
        margin-top: 12px; font-family: 'Inter', sans-serif;
        font-size: 13px; min-height: 18px; text-align: center;
      }
      #nl-msg.nl-ok { color: #4ade80; }
      #nl-msg.nl-err { color: #f87171; }
      #nl-skip {
        display: block; text-align: center; margin-top: 14px;
        font-family: 'Inter', sans-serif; font-size: 12px;
        color: rgba(255,255,255,.25); cursor: pointer;
        background: none; border: none; padding: 0;
        transition: color .15s;
      }
      #nl-skip:hover { color: rgba(255,255,255,.5); }
    `;
    document.head.appendChild(style);

    const overlay = document.createElement('div');
    overlay.id = 'nl-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Stay updated on new PulseOS apps');
    overlay.innerHTML = `
      <div id="nl-card">
        <button id="nl-close" aria-label="Close">✕</button>
        <span id="nl-wordmark">PULSE<em>OS</em></span>
        <h2>Stay updated.</h2>
        <p>Get notified when a new PulseOS app drops or when one of your apps gets a major update.</p>
        <div id="nl-checks">
          <label class="nl-check">
            <input type="checkbox" name="pref" value="updates" checked />
            App updates &amp; new features
          </label>
          <label class="nl-check">
            <input type="checkbox" name="pref" value="releases" checked />
            New app releases
          </label>
        </div>
        <div id="nl-input-row">
          <input id="nl-email" type="email" placeholder="your@email.com" autocomplete="email" />
          <button id="nl-submit">Subscribe</button>
        </div>
        <p id="nl-msg"></p>
        <button id="nl-skip">No thanks</button>
      </div>
    `;
    document.body.appendChild(overlay);

    function close() {
      markHandled();
      overlay.classList.remove('nl-visible');
      setTimeout(() => overlay.remove(), 300);
    }

    document.getElementById('nl-close').addEventListener('click', close);
    document.getElementById('nl-skip').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

    document.getElementById('nl-submit').addEventListener('click', async () => {
      const email = document.getElementById('nl-email').value.trim();
      const msg = document.getElementById('nl-msg');
      const btn = document.getElementById('nl-submit');

      if (!email) { msg.className = 'nl-err'; msg.textContent = 'Please enter your email.'; return; }

      const prefs = [...document.querySelectorAll('input[name="pref"]:checked')].map(el => el.value);

      btn.disabled = true;
      msg.className = ''; msg.textContent = '';

      try {
        const res = await fetch('/api/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, preferences: prefs }),
        });
        const data = await res.json();
        if (data.ok) {
          msg.className = 'nl-ok';
          msg.textContent = data.alreadySubscribed
            ? "You're already subscribed!"
            : "You're in! Thanks for subscribing.";
          markHandled();
          setTimeout(close, 2000);
        } else {
          msg.className = 'nl-err';
          msg.textContent = data.error || 'Something went wrong. Try again.';
          btn.disabled = false;
        }
      } catch {
        msg.className = 'nl-err';
        msg.textContent = 'Something went wrong. Try again.';
        btn.disabled = false;
      }
    });

    document.getElementById('nl-email').addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('nl-submit').click();
    });

    // Show after 3s delay
    setTimeout(() => overlay.classList.add('nl-visible'), 3000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }
})();
