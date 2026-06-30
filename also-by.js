(function () {
  const APPS = [
    {
      slug: 'pulsefx',
      name: 'PulseFX',
      tagline: 'Lot size, account tracking & trading structure',
      icon: '/images/PulseFX.png',
      url: '/pulsefx/',
      live: true,
    },
    {
      slug: 'pulsevinyl',
      name: 'PulseVinyl',
      tagline: 'Vinyl collection tracking & Discogs integration',
      icon: '/images/PulseVN.png',
      url: '/pulsevinyl/',
      live: true,
    },
    {
      slug: 'pulserecipes',
      name: 'Pulse Recipes',
      tagline: 'Clean meals, macros & recipe management',
      icon: '/images/PulseRC.png',
      url: '/pulserecipes/',
      live: true,
    },
    {
      slug: 'pulsereflect',
      name: 'PulseReflect',
      tagline: 'Daily journaling, mood tracking & self-reflection',
      icon: '/images/PulseRF.png',
      url: '/pulsereflect/',
      live: true,
    },
    {
      slug: 'pulsewiish',
      name: 'PulseWiish',
      tagline: 'Wishlist & shopping list management',
      icon: '/images/PulseWW.png',
      url: '/pulsewiish/',
      live: true,
    },
    {
      slug: 'pulsehabits',
      name: 'Pulse Habits',
      tagline: 'Discipline, consistency & daily momentum',
      icon: '/images/PulseHB.png',
      url: '/pulsehabits/',
      live: false,
    },
    {
      slug: 'pulselift',
      name: 'PulseLift',
      tagline: 'Workout tracking & gym performance',
      icon: '/images/PulseLF.png',
      url: '/pulselift/',
      live: false,
    },
  ];

  function currentSlug() {
    const parts = window.location.pathname.replace(/\/$/, '').split('/');
    return parts[parts.length - 1] || '';
  }

  function inject() {
    const slug = currentSlug();
    const others = APPS.filter(a => a.slug !== slug);
    if (!others.length) return;

    const style = document.createElement('style');
    style.textContent = `
      .also-by-section {
        padding: 72px 0 64px;
        border-top: 1px solid rgba(255,255,255,.06);
      }
      .also-by-heading {
        margin-bottom: 32px;
      }
      .also-by-heading .section-label {
        display: block;
        font-family: 'DM Mono', monospace;
        font-size: 11px;
        letter-spacing: .12em;
        text-transform: uppercase;
        color: rgba(255,255,255,.35);
        margin-bottom: 10px;
      }
      .also-by-heading h2 {
        font-family: 'Bricolage Grotesque', sans-serif;
        font-weight: 800;
        font-size: clamp(1.5rem, 3.5vw, 2rem);
        color: #fff;
        margin: 0;
      }
      .also-by-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 12px;
      }
      .also-by-card {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 18px;
        background: rgba(255,255,255,.04);
        border: 1px solid rgba(255,255,255,.07);
        border-radius: 16px;
        text-decoration: none;
        transition: background .18s, border-color .18s, transform .18s;
        position: relative;
      }
      .also-by-card:hover {
        background: rgba(255,255,255,.07);
        border-color: rgba(255,255,255,.13);
        transform: translateY(-2px);
      }
      .also-by-card-top {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .also-by-card img {
        width: 44px;
        height: 44px;
        border-radius: 10px;
        flex-shrink: 0;
      }
      .also-by-card-name {
        font-family: 'Inter', sans-serif;
        font-weight: 600;
        font-size: 14px;
        color: #fff;
        line-height: 1.2;
      }
      .also-by-card-tagline {
        font-family: 'Inter', sans-serif;
        font-size: 12px;
        color: rgba(255,255,255,.4);
        line-height: 1.5;
        margin: 0;
      }
      .also-by-card-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-top: auto;
        padding-top: 4px;
      }
      .also-by-badge {
        font-family: 'DM Mono', monospace;
        font-size: 10px;
        letter-spacing: .06em;
        text-transform: uppercase;
        padding: 3px 8px;
        border-radius: 20px;
      }
      .also-by-badge--live {
        background: rgba(48,168,74,.15);
        color: #30a84a;
      }
      .also-by-badge--soon {
        background: rgba(255,255,255,.07);
        color: rgba(255,255,255,.3);
      }
      .also-by-arrow {
        font-size: 14px;
        color: rgba(255,255,255,.25);
        transition: color .15s, transform .15s;
      }
      .also-by-card:hover .also-by-arrow {
        color: rgba(255,255,255,.6);
        transform: translateX(3px);
      }
      @media (max-width: 600px) {
        .also-by-grid {
          grid-template-columns: 1fr 1fr;
        }
      }
      @media (max-width: 380px) {
        .also-by-grid {
          grid-template-columns: 1fr;
        }
      }
    `;
    document.head.appendChild(style);

    const section = document.createElement('section');
    section.className = 'also-by-section';
    section.innerHTML = `
      <div class="container">
        <div class="also-by-heading">
          <span class="section-label">Also by PulseOS</span>
          <h2>More apps you might like.</h2>
        </div>
        <div class="also-by-grid">
          ${others.map(app => `
            <a class="also-by-card" href="${app.url}">
              <div class="also-by-card-top">
                <img src="${app.icon}" alt="${app.name}" />
                <span class="also-by-card-name">${app.name}</span>
              </div>
              <p class="also-by-card-tagline">${app.tagline}</p>
              <div class="also-by-card-footer">
                <span class="also-by-badge ${app.live ? 'also-by-badge--live' : 'also-by-badge--soon'}">
                  ${app.live ? 'Live' : 'Coming soon'}
                </span>
                <span class="also-by-arrow">→</span>
              </div>
            </a>
          `).join('')}
        </div>
      </div>
    `;

    // Insert before the last section in main (contact), or before </main>
    const main = document.querySelector('main');
    if (!main) return;
    const sections = main.querySelectorAll('section');
    const lastSection = sections[sections.length - 1];
    if (lastSection) {
      main.insertBefore(section, lastSection);
    } else {
      main.appendChild(section);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }
})();
